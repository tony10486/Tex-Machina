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

    // Python 연산 및 시스템 오류 감지
    pythonProcess.stderr?.on('data', (data: Buffer) => {
        const errorMsg = data.toString();
        console.error(`Python Error: ${errorMsg}`);
        vscode.window.showErrorMessage(`Python 에러: ${errorMsg}`);
    });

    // 3. Python 연산 결과를 받았을 때의 처리 (에디터 삽입 & 웹뷰 업데이트)
    let stdoutBuffer = "";
	pythonProcess.stdout?.on('data', async (data: Buffer) => {
        stdoutBuffer += data.toString();
        let lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ""; // 마지막 조각은 보관

        for (const line of lines) {
            if (!line.trim()) {continue;}
            console.log(`Python Output: ${line}`);
            try {
                const response = JSON.parse(line);
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
                    provider.updatePreview(resultLatex, response.vars, response.analysis);
                } else if (response.status === 'error') {
                    vscode.window.showErrorMessage(`연산 실패: ${response.message}`);
                }
            } catch (e) {
                console.error("결과 삽입 중 오류:", e, "원본 데이터:", line);
            }
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
        quickPick.placeholder = "명령어를 입력하세요 (예: matrix > b > 3x3)";
        
        // 명령어 목록 정의 [cite: 150]
        const items: vscode.QuickPickItem[] = [
            { label: "matrix", description: "행렬 생성 (예: matrix > b > 3x3 > 1,2,3/4,5,6)" },
            { label: "simplify", description: "수식 단순화" },
            { label: "solve", description: "방정식 풀이" },
            { label: "diff", description: "미분 (예: diff > x)" },
            { label: "int", description: "적분 (예: int > x,0,1)" },
            { label: "limit", description: "극한 (예: limit > x,0)" },
            { label: "taylor", description: "테일러 급수 (예: taylor / 5)" },
            { label: "ode", description: "미분방정식 (예: ode / ic=y(0):1)" },
            { label: "laplace", description: "라플라스 변환" },
            { label: "num_solve", description: "수치적 해법 및 그래프 (예: num_solve / plot=true)" }
        ];
        
        quickPick.items = items;
        quickPick.show();

        // 사용자가 아이템을 선택하거나 엔터를 쳤을 때 처리
        quickPick.onDidAccept(async () => {
            const userInput = quickPick.selectedItems.length > 0 
                ? quickPick.selectedItems[0].label 
                : quickPick.value;
            
            quickPick.hide();

            if (!userInput) {return;}

            const parsed = parseUserCommand(userInput, currentOriginalText);
            currentParallels = parsed.parallelOptions;

            // 라플라스 설정 가져오기
            const config = vscode.workspace.getConfiguration('tex-machina');
            const laplaceConfig = {
                source: config.get('laplace.sourceVariable', 't'),
                target: config.get('laplace.targetVariable', 's')
            };

            const payload = {
                ...parsed,
                config: {
                    laplace: laplaceConfig
                }
            };

            if (pythonProcess?.stdin) {
                pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
            }
        });

        // 텍스트가 바뀔 때 필터링은 QuickPick이 자동으로 수행함
    });

    context.subscriptions.push(cliCommand);
}

export function deactivate() {
    if (pythonProcess) {
        pythonProcess.kill();
    }
}