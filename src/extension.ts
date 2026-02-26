import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { parseUserCommand } from './core/commandParser';
import { TeXMachinaWebviewProvider } from './ui/webviewProvider';

let pythonProcess: ChildProcess | null = null;
let currentEditor: vscode.TextEditor | undefined;
let currentSelection: vscode.Selection | undefined;
let currentOriginalText: string = "";
let currentParallels: string[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('TeX-Machina 활성화 완료!');

    // 1. Webview 프로바이더 등록 (우측 패널)
    const provider = new TeXMachinaWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TeXMachinaWebviewProvider.viewType, provider)
    );

    // 2. Python 데몬 백그라운드 실행
	const pythonCommand = process.platform === 'darwin' ? 'python3' : 'python';
    
    // Python 데몬 백그라운드 실행
    const serverPath = context.asAbsolutePath('python_backend/server.py');
    pythonProcess = spawn(pythonCommand, [serverPath]);

    // ✨ [핵심 추가] 파이썬 프로그램 자체가 실행되지 않았을 때 알림을 띄우는 기능
    pythonProcess.on('error', (err) => {
        vscode.window.showErrorMessage(`Python 실행 실패! 컴퓨터에 파이썬이 설치되어 있는지 확인하세요. 상세: ${err.message}`);
    });

    // Python 내부 연산 오류 감지용
    pythonProcess.stderr?.on('data', (data: Buffer) => {
        vscode.window.showErrorMessage(`Python 연산 에러: ${data.toString()}`);
    });

    // Python 오류 감지용 (디버깅)
    pythonProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`Python Error: ${data.toString()}`);
        vscode.window.showErrorMessage(`Python 에러: ${data.toString()}`);
    });

    // 3. Python 연산 결과를 받았을 때의 처리 (에디터 삽입 & 웹뷰 업데이트)
	pythonProcess.stdout?.on('data', async (data: Buffer) => {
		try {
			const response = JSON.parse(data.toString());
			if (response.status === 'success' && currentEditor && currentSelection) {
				const resultLatex = response.latex;
				let outputText = "";

				//  제안서의 출력 포맷팅 설정 반영
				if (currentParallels.includes("append")) {
					// 기존 수식 + " = " + 결과물 
					outputText = `${currentOriginalText} = ${resultLatex}`;
				} else if (currentParallels.includes("newline")) {
					// 기존 수식 유지 + 새 줄에 $$로 결과물 출력 
					outputText = `${currentOriginalText}\n\n\\[\n${resultLatex}\n\\]`;
				} else {
					// 기본값: replace (기존 수식 덮어쓰기) 
					outputText = resultLatex;
				}

				await currentEditor.edit(editBuilder => {
					editBuilder.replace(currentSelection!, outputText);
				});
				
				// Webview 업데이트
				provider.updatePreview(resultLatex, response.free_symbols);
			}
		} catch (e) {
			console.error("결과 삽입 중 오류:", e);
		}
	});

    // 4. Cmd + Shift + ; 단축키 커맨드 등록
	let cliCommand = vscode.commands.registerCommand('tex-machina.openCLI', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        // 명령 실행 시점의 상태를 캡처 (매우 중요)
        const selection = editor.selection;
        const originalText = editor.document.getText(selection);

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = "calc > diff / append";
        quickPick.show();

        quickPick.onDidAccept(async () => {
            const userInput = quickPick.value;
            quickPick.hide();

            const parsed = parseUserCommand(userInput, originalText);
            
            // 일회성 응답 리스너 등록 (익명 함수로 상태 고정)
            const responseHandler = async (data: Buffer) => {
                const response = JSON.parse(data.toString());
                if (response.status === 'success') {
                    const resultLatex = response.latex;
                    let outputText = "";

                    // 병치 옵션 판별 
                    if (parsed.parallelOptions.includes("append")) {
                        outputText = `${originalText} = ${resultLatex}`;
                    } else if (parsed.parallelOptions.includes("newline")) {
                        outputText = `${originalText}\n\n\\[\n${resultLatex}\n\\]`;
                    } else {
                        outputText = resultLatex;
                    }

                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, outputText);
                    });
                }
                // 리스너 제거 (중복 실행 방지)
                pythonProcess?.stdout?.removeListener('data', responseHandler);
            };

            pythonProcess?.stdout?.on('data', responseHandler);

            if (pythonProcess?.stdin) {
                pythonProcess.stdin.write(JSON.stringify(parsed) + '\n');
            }
        });
    });

    context.subscriptions.push(cliCommand);
}

export function deactivate() {
    if (pythonProcess) {
        pythonProcess.kill();
    }
}