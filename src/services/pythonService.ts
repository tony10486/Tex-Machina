import * as vscode from 'vscode';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';

export class PythonService implements vscode.Disposable {
    private pythonProcess: ChildProcess | null = null;
    private resolvers: Map<string, { resolve: (response: any) => void; reject: (reason?: any) => void }> = new Map();
    private stdoutBuffer: string = "";
    private stderrBuffer: string = "";
    private stderrFlushTimer: NodeJS.Timeout | null = null;
    private decoder = new StringDecoder('utf8');
    private startupResolver: (() => void) | null = null;
    private startupReject: ((reason?: any) => void) | null = null;
    private startupTimeout: NodeJS.Timeout | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private restartDelay = 500;
    /** stop()/dispose()에 의한 의도적 종료 여부 — true면 종료 핸들러가 재시작을 예약하지 않는다. */
    private stopped = false;

    constructor(private context: vscode.ExtensionContext) {}

    private tryPython(cmd: string): boolean {
        try {
            const result = spawnSync(cmd, ['-c', 'import sympy'], { stdio: 'ignore', timeout: 3000 });
            return result.status === 0;
        } catch {
            return false;
        }
    }

    private findPythonCommand(): string | null {
        // Fast path: try common python commands directly
        const candidates = process.platform === 'win32'
            ? ['python', 'python3', 'py']
            : ['python3', 'python3.12', 'python3.11', 'python3.10', 'python'];
        for (const cmd of candidates) {
            if (this.tryPython(cmd)) {
                console.log('[PythonService] found sympy via', cmd);
                return cmd;
            }
        }

        // 1. Check for bundled venv
        const venvPath = process.platform === 'win32'
            ? this.context.asAbsolutePath('venv/Scripts/python.exe')
            : this.context.asAbsolutePath('venv/bin/python3');
        if (fs.existsSync(venvPath) && this.tryPython(venvPath)) {
            console.log('[PythonService] found bundled venv at', venvPath);
            return venvPath;
        }

        // 2. Try to find python3 via login shell (respects pyenv, conda, asdf)
        const shell = process.env.SHELL || '/bin/zsh';
        try {
            const result = spawnSync(shell, ['-l', '-c', 'which python3'], { encoding: 'utf8', timeout: 5000 });
            const resolved = (result.stdout || '').toString().trim();
            if (resolved && this.tryPython(resolved)) {
                console.log('[PythonService] login shell resolved to', resolved);
                return resolved;
            }
        } catch (e: any) {
            console.log('[PythonService] shell resolution error:', e.message);
        }

        // 3. None found
        console.log('[PythonService] no working python found');
        return null;
    }

    private findSystemPython3(): string | null {
        const candidates = process.platform === 'win32'
            ? ['python', 'python3', 'py']
            : ['python3', 'python3.12', 'python3.11', 'python3.10', 'python'];
        for (const cmd of candidates) {
            try {
                const result = spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 3000 });
                if (result.status === 0) return cmd;
            } catch { /* skip */ }
        }
        return null;
    }

    private async ensurePythonEnvironment(): Promise<string> {
        // 1. Try existing heuristics (system, bundled venv, login shell)
        const existing = this.findPythonCommand();
        if (existing) return existing;

        // 2. Check global storage venv (persists across updates)
        const venvDir = path.join(this.context.globalStoragePath, 'venv');
        const venvPython = process.platform === 'win32'
            ? path.join(venvDir, 'Scripts', 'python.exe')
            : path.join(venvDir, 'bin', 'python3');

        if (fs.existsSync(venvPython) && this.tryPython(venvPython)) {
            console.log('[PythonService] found global venv at', venvPython);
            return venvPython;
        }

        // 3. Create venv and install dependencies
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'TeX-Machina: Python 환경 설정 중...',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Python 3 확인 중...' });
                const python3 = this.findSystemPython3();
                if (!python3) {
                    throw new Error(
                        'Python 3을 찾을 수 없습니다. https://python.org 에서 설치해주세요.'
                    );
                }

                progress.report({ message: '가상 환경 생성 중...' });
                const createResult = spawnSync(python3, ['-m', 'venv', venvDir], {
                    timeout: 30000,
                });
                if (createResult.status !== 0) {
                    throw new Error(
                        `가상 환경 생성 실패: ${createResult.stderr?.toString() || '알 수 없는 오류'}`
                    );
                }

                progress.report({ message: 'sympy 등 패키지 설치 중...' });
                const reqPath = this.context.asAbsolutePath(
                    'python_backend/requirements.txt'
                );
                const installResult = spawnSync(
                    venvPython,
                    ['-m', 'pip', 'install', '-r', reqPath],
                    { timeout: 120000 }
                );
                if (installResult.status !== 0) {
                    throw new Error(
                        `패키지 설치 실패: ${installResult.stderr?.toString() || '알 수 없는 오류'}`
                    );
                }
            }
        );

        return venvPython;
    }

    public async start(): Promise<void> {
        this.stopped = false;
        let pythonCommand: string;
        try {
            pythonCommand = await this.ensurePythonEnvironment();
        } catch (e: any) {
            vscode.window.showErrorMessage(
                `TeX-Machina: Python 설정 실패 — ${e.message}`
            );
            return;
        }

        const serverPath = this.context.asAbsolutePath('python_backend/server.py');
        console.log('[PythonService] spawning:', pythonCommand);
        const child = spawn(pythonCommand, [serverPath]);
        this.pythonProcess = child;

        child.on('error', (err) => {
            vscode.window.showErrorMessage(
                `Python 실행 실패: ${err.message}`
            );
            // spawn 실패 시 ready 대기를 즉시 거부 — 60초 기동 스톨(N15)을 방지한다.
            if (this.startupReject) {
                if (this.startupTimeout) {
                    clearTimeout(this.startupTimeout);
                    this.startupTimeout = null;
                }
                const reject = this.startupReject;
                this.startupResolver = null;
                this.startupReject = null;
                reject(new Error(`Python 프로세스를 시작하지 못했습니다: ${err.message}`));
            }
        });

        const handleProcessExit = (code: number | null, signal: string | null) => {
            // 'exit'/'close' 중복 호출과, 재시작 후 이전 프로세스에서 늦게 도착한
            // 이벤트가 새 프로세스의 resolver를 건드리는 것을 방지한다.
            if (this.pythonProcess !== child) { return; }
            this.pythonProcess = null;
            console.log(`[PythonService] process terminated (code: ${code}, signal: ${signal})`);
            for (const [, entry] of this.resolvers.entries()) {
                try {
                    entry.reject(new Error('계산 서버 프로세스가 종료되었습니다'));
                } catch { /* ignore */ }
            }
            this.resolvers.clear();
            // 의도적 종료(stop/dispose)가 아니고 재시작이 이미 예약되어 있지 않다면
            // 백오프를 적용해 재시작을 예약한다 (충돌 후 자동 복구).
            if (!this.stopped && !this.restartTimer) {
                this.restartWithBackoff();
            }
        };

        child.on('exit', handleProcessExit);
        child.on('close', handleProcessExit);

        child.stderr?.on('data', (data: Buffer) => {
            // stderr 스팸 방지(N16): 버퍼링 후 최대 1초에 한 번씩 묶어서 출력한다.
            this.stderrBuffer += data.toString();
            if (!this.stderrFlushTimer) {
                this.stderrFlushTimer = setTimeout(() => {
                    this.stderrFlushTimer = null;
                    const message = this.stderrBuffer.trim();
                    this.stderrBuffer = "";
                    if (message) { console.error(`Python Error: ${message}`); }
                }, 1000);
            }
        });

        child.stdout?.on('data', (data: Buffer) => {
            this.handleStdout(data);
        });

        // Wait for the Python server to signal it's ready
        try {
            await new Promise<void>((resolve, reject) => {
                this.startupResolver = resolve;
                this.startupReject = reject;
                this.startupTimeout = setTimeout(() => {
                    this.startupResolver = null;
                    this.startupReject = null;
                    reject(new Error('Python server startup timed out'));
                }, 60000);
            });
        } catch (e: any) {
            vscode.window.showErrorMessage(
                `Python 서버 시작 실패: ${e.message}`
            );
        }
    }

    private handleStdout(data: Buffer): void {
        this.stdoutBuffer += this.decoder.write(data);
        let lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) { continue; }
            try {
                const response = JSON.parse(line);

                // Resolve startup once we get the "ready" signal from the server
                if (response.status === 'ready' && this.startupResolver) {
                    if (this.startupTimeout) {
                        clearTimeout(this.startupTimeout);
                        this.startupTimeout = null;
                    }
                    const resolve = this.startupResolver;
                    this.startupResolver = null;
                    this.startupReject = null;
                    resolve();
                    continue;
                }

                const requestId = response.requestId;
                const entry = requestId ? this.resolvers.get(requestId) : undefined;
                if (entry) {
                    this.resolvers.delete(requestId);
                    entry.resolve(response);
                } else {
                    this.emitResponse(response);
                }
            } catch (e) {
                console.error("Python output parsing error:", e, "Raw data:", line);
            }
        }
    }

    private emitResponse(response: any): void {
        if (this.onResponseCallback) {
            this.onResponseCallback(response);
        }
    }

    private onResponseCallback?: (response: any) => void;
    public onResponse(callback: (response: any) => void): { dispose(): void } {
        this.onResponseCallback = callback;
        return {
            dispose: () => {
                if (this.onResponseCallback === callback) {
                    this.onResponseCallback = undefined;
                }
            },
        };
    }

    public send(payload: any): void {
        if (this.pythonProcess?.stdin) {
            this.pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        }
    }

    public sendAndWait(payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess?.stdin) {
                // 통일된 에러 계약: 실패는 항상 reject로 전달한다 (resolve-with-error 금지).
                reject(new Error('계산 서버가 실행 중이 아닙니다'));
                return;
            }
            
            const requestId = crypto.randomUUID();
            payload.requestId = requestId;

            const timer = setTimeout(() => {
                this.resolvers.delete(requestId);
                reject(new Error('처리 시간이 초과되어 계산 서버를 재시작합니다'));
                this.restartWithBackoff();
            }, 15000);

            this.resolvers.set(requestId, {
                resolve: (response: any) => {
                    clearTimeout(timer);
                    resolve(response);
                },
                reject: (reason?: any) => {
                    clearTimeout(timer);
                    reject(reason);
                }
            });
            
            this.pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        });
    }

    public stop(): void {
        // 의도적 종료임을 표시 — 종료 핸들러가 재시작을 예약하지 않도록 한다.
        this.stopped = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.resolvers.clear();
        if (this.startupTimeout) {
            clearTimeout(this.startupTimeout);
            this.startupTimeout = null;
        }
        if (this.stderrFlushTimer) {
            clearTimeout(this.stderrFlushTimer);
            this.stderrFlushTimer = null;
            const message = this.stderrBuffer.trim();
            this.stderrBuffer = "";
            if (message) { console.error(`Python Error: ${message}`); }
        }
        this.decoder = new StringDecoder('utf8');
    }

    /**
     * 프로세스 충돌/타임아웃 시 호출: 막혀 있는 Python 프로세스를 정리하고
     * 백오프(500ms → 최대 2s)를 적용해 재시작을 예약한다.
     * 단일 스레드 서버는 계산이 끝나기 전에는 스스로 응답할 수 없으므로
     * kill 없이는 언웨지(un-wedge)가 불가능하다.
     */
    private restartWithBackoff(): void {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }
        const delay = this.restartDelay;
        this.restartDelay = Math.min(this.restartDelay * 2, 2000);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.restartDelay = 500;
            void this.start();
        }, delay);
    }

    public dispose(): void {
        this.stop();
    }
}

