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
				if (currentParallels.includes("newline")) {
					// 기존 수식 유지 + 새 줄에 $$로 결과물 출력 
					outputText = `${currentOriginalText}\n\n\\[\n${resultLatex}\n\\]`;
				} else {
					// 기본값: 기존 수식 + " = " + 결과물 
					outputText = `${currentOriginalText} = ${resultLatex}`;
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

        // 명령 실행 시점의 상태를 전역 변수에 저장 (비동기 응답 처리용)
        currentEditor = editor;
        currentSelection = editor.selection;
        currentOriginalText = editor.document.getText(currentSelection);

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = "calc > diff";
        quickPick.show();

        quickPick.onDidAccept(async () => {
            const userInput = quickPick.value;
            quickPick.hide();

            const parsed = parseUserCommand(userInput, currentOriginalText);
            currentParallels = parsed.parallelOptions;

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