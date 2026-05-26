import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export class PythonService {
    private pythonProcess: ChildProcess | null = null;
    private responseResolver: ((response: any) => void) | null = null;
    private stdoutBuffer: string = "";

    constructor(private context: vscode.ExtensionContext) {}

    public start(): void {
        const pythonCommand = process.platform === 'darwin' ? 'python3' : 'python';
        const serverPath = this.context.asAbsolutePath('python_backend/server.py');
        
        this.pythonProcess = spawn(pythonCommand, [serverPath]);

        this.pythonProcess.on('error', (err) => {
            vscode.window.showErrorMessage(`Python 실행 실패! 컴퓨터에 파이썬이 설치되어 있는지 확인하세요. 상세: ${err.message}`);
        });

        this.pythonProcess.stderr?.on('data', (data: Buffer) => {
            const errorMsg = data.toString();
            console.error(`Python Error: ${errorMsg}`);
            vscode.window.showErrorMessage(`Python 에러: ${errorMsg}`);
        });

        this.pythonProcess.stdout?.on('data', (data: Buffer) => {
            this.handleStdout(data);
        });
    }

    private handleStdout(data: Buffer): void {
        this.stdoutBuffer += data.toString();
        let lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) { continue; }
            try {
                const response = JSON.parse(line);
                if (this.responseResolver) {
                    const resolve = this.responseResolver;
                    this.responseResolver = null;
                    resolve(response);
                } else {
                    this.emitResponse(response);
                }
            } catch (e) {
                console.error("Python output parsing error:", e, "Raw data:", line);
            }
        }
    }

    private emitResponse(response: any): void {
        // Emit to a central dispatcher or via an EventEmitter
        // For now, we'll use a callback registered by the extension
        if (this.onResponseCallback) {
            this.onResponseCallback(response);
        }
    }

    private onResponseCallback?: (response: any) => void;
    public onResponse(callback: (response: any) => void): void {
        this.onResponseCallback = callback;
    }

    public send(payload: any): void {
        if (this.pythonProcess?.stdin) {
            this.pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        }
    }

    public sendAndWait(payload: any): Promise<any> {
        return new Promise((resolve) => {
            if (!this.pythonProcess?.stdin) {
                resolve({ status: 'error', message: 'Python process is not running' });
                return;
            }
            this.responseResolver = resolve;
            this.pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        });
    }

    public stop(): void {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
    }
}
