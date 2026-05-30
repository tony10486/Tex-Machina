import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';

export class PythonService {
    private pythonProcess: ChildProcess | null = null;
    private resolvers: Map<string, (response: any) => void> = new Map();
    private stdoutBuffer: string = "";

    constructor(private context: vscode.ExtensionContext) {}

    public async start(): Promise<void> {
        const isWindows = process.platform === 'win32';
        const venvPath = isWindows 
            ? this.context.asAbsolutePath('venv/Scripts/python.exe')
            : this.context.asAbsolutePath('venv/bin/python3');
        
        // venv가 존재하면 우선적으로 사용하고, 아니면 시스템 python 사용
        const fsPromises = require('fs').promises;
        let pythonCommand = process.platform === 'darwin' ? 'python3' : 'python';
        try {
            await fsPromises.access(venvPath);
            pythonCommand = venvPath;
        } catch (e) {
            // venv does not exist or is not accessible
        }

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
                const requestId = response.requestId;
                
                if (requestId && this.resolvers.has(requestId)) {
                    const resolve = this.resolvers.get(requestId);
                    this.resolvers.delete(requestId);
                    if (resolve) {
                        resolve(response);
                    }
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
            
            const requestId = crypto.randomUUID();
            payload.requestId = requestId;
            this.resolvers.set(requestId, resolve);
            
            this.pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
        });
    }

    public stop(): void {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
    }
}
