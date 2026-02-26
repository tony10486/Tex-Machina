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
            
            if (response.status === 'success') {
                const resultLatex = response.latex;
				// Python 백엔드에서 넘겨주는 변수 리스트(free_symbols 또는 vars)를 안전하게 추출
				const vars = response.free_symbols || response.vars || []; 

				// 우측 Webview 미리보기 업데이트 (인수 2개 완벽 충족!)
				provider.updatePreview(resultLatex, vars);

                // 에디터에 수식 삽입 로직
                if (currentEditor && currentSelection) {
                    let outputText = "";
                    if (currentParallels.includes("append")) {
                        outputText = `${currentOriginalText} = ${resultLatex}`;
                    } else if (currentParallels.includes("newline")) {
                        outputText = `${currentOriginalText}\n\n$$\n${resultLatex}\n$$`;
                    } else {
                        outputText = resultLatex; // 기본값: replace
                    }

                    await currentEditor.edit(editBuilder => {
                        editBuilder.replace(currentSelection!, outputText);
                    });
                }
            } else {
                vscode.window.showErrorMessage(`계산 오류: ${response.message}`);
            }
        } catch (e) {
            console.error("Python JSON 파싱 에러:", e);
        }
    });

    // 4. Cmd + Shift + ; 단축키 커맨드 등록
    let cliCommand = vscode.commands.registerCommand('tex-machina.openCLI', () => {
        currentEditor = vscode.window.activeTextEditor;
        if (!currentEditor) {
            vscode.window.showWarningMessage('LaTeX 파일을 먼저 열어주세요.');
            return;
        }

        currentSelection = currentEditor.selection;
        currentOriginalText = currentEditor.document.getText(currentSelection);

        if (!currentOriginalText.trim()) {
            vscode.window.showWarningMessage('계산할 수식을 드래그(선택)해주세요.');
            return;
        }

        // Quick Pick (명령줄 창) 띄우기
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = "명령어를 입력하세요 (예: calc > diff / append)";
        quickPick.show();

        // 사용자가 엔터를 쳤을 때
        quickPick.onDidAccept(() => {
            const userInput = quickPick.value;
            quickPick.hide();

            // 명령어 파싱
            const parsed = parseUserCommand(userInput, currentOriginalText);
            currentParallels = parsed.parallelOptions; // 출력 포맷 상태 저장

            // Python 백엔드로 JSON 데이터 전송
            if (pythonProcess?.stdin) {
                const requestPayload = JSON.stringify(parsed) + '\n';
                pythonProcess.stdin.write(requestPayload);
            } else {
                vscode.window.showErrorMessage('Python 백엔드와 연결되지 않았습니다.');
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