import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { parseUserCommand } from './core/commandParser';
import { TeXMachinaWebviewProvider } from './ui/webviewProvider';

let pythonProcess: ChildProcess | null = null;
let currentEditor: vscode.TextEditor | undefined;
let currentSelection: vscode.Selection | undefined;
let currentOriginalText: string = "";
let currentMainCommand: string = "";
let currentParallels: string[] = [];
let isExportingPdf: boolean = false;
let pdfTargetDir: string = "";

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
                    
                    // 내보내기 모드인 경우 파일 저장 및 Figure 삽입
                    if (isExportingPdf && response.export_content) {
                        const exportBuffer = Buffer.from(response.export_content, 'base64');
                        const imagesDir = path.join(pdfTargetDir, 'images');
                        const ext = response.export_format || 'pdf';
                        const filename = `plot_3d.${ext}`;
                        const exportPath = path.join(imagesDir, filename);

                        try {
                            if (!fs.existsSync(imagesDir)) {
                                fs.mkdirSync(imagesDir, { recursive: true });
                            }
                            fs.writeFileSync(exportPath, exportBuffer);
                            
                            // LaTeX Figure 코드 생성 및 삽입
                            const figureCode = `\n\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{images/${filename}}\n\\caption{3D Plot of $${response.x3d_data.expr}$}\n\\label{fig:plot_3d}\n\\end{figure}\n`;
                            
                            await currentEditor.edit(editBuilder => {
                                // 현재 선택 영역 다음 줄에 삽입
                                editBuilder.insert(currentSelection!.end, figureCode);
                            });
                            
                            vscode.window.showInformationMessage(`그래프가 ${ext.toUpperCase()}로 저장되고 Figure가 삽입되었습니다: images/${filename}`);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`저장 실패: ${err.message}`);
                        } finally {
                            isExportingPdf = false;
                        }
                        continue;
                    }

                    const resultLatex = response.latex;
                    let outputText = "";

                    //  제안서의 출력 포맷팅 설정 반영
                    if (currentMainCommand === "matrix") {
                        // 행렬 생성은 단독 삽입 (앞에 = 붙이지 않음)
                        outputText = resultLatex;
                    } else if (currentParallels.includes("newline")) {
                        // 기존 수식 유지 + 새 줄에 $$로 결과물 출력 
                        outputText = `${currentOriginalText}\n\n\\[\n${resultLatex}\n\\]`;
                    } else {
                        // 기본값: 기존 수식 + " = " + 결과물 
                        outputText = `${currentOriginalText} = ${resultLatex}`;
                    }

                    await currentEditor.edit(editBuilder => {
                        editBuilder.replace(currentSelection!, outputText);
                    });
                    
                    // .dat 파일 생성 요청이 있는 경우 처리
                    if (response.dat_content) {
                        const texDir = path.dirname(currentEditor.document.uri.fsPath);
                        const dataDir = path.join(texDir, 'data');
                        const datFilename = response.dat_filename || 'plot_data.dat';
                        const datPath = path.join(dataDir, datFilename);

                        let shouldWrite = true;
                        if (!fs.existsSync(dataDir)) {
                            const answer = await vscode.window.showInformationMessage(
                                `PGFPlots 데이터를 위한 'data' 폴더가 없습니다. 생성하시겠습니까?\n경로: ${dataDir}`,
                                "예", "아니오"
                            );
                            if (answer === "예") {
                                try {
                                    fs.mkdirSync(dataDir, { recursive: true });
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`폴더 생성 실패: ${err.message}`);
                                    shouldWrite = false;
                                }
                            } else {
                                shouldWrite = false;
                            }
                        }

                        if (shouldWrite) {
                            try {
                                fs.writeFileSync(datPath, response.dat_content);
                                // 파일 저장 성공 시에는 알림을 띄우지 않거나 조용히 처리 (사용자 피드백 반영)
                                // vscode.window.showInformationMessage(`데이터 파일이 저장되었습니다: data/${datFilename}`);
                            } catch (err: any) {
                                vscode.window.showErrorMessage(`파일 저장 실패: ${err.message}`);
                            }
                        }
                    }
                    
                    // Webview 업데이트 (preview_img 포함)
                    provider.updatePreview(resultLatex, response.vars, response.analysis, response.x3d_data, response.warning, response.preview_img);

                    // 경고 메시지가 있으면 출력
                    if (response.warning) {
                        vscode.window.showWarningMessage(response.warning);
                    }
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
        quickPick.placeholder = "명령어를 입력하세요 (예: calc >, matrix >)";
        
        // 명령어 라이브러리 정의
        const commandLib = {
            root: [
                { label: "calc >", description: "수학 연산 명령어 (미분, 적분, 단순화 등)" },
                { label: "matrix >", description: "행렬 생성 및 분석" },
                { label: "plot >", description: "수식 시각화 (2D, 3D, 복소 평면)" }
            ],
            calc: [
                { label: "calc > simplify", description: "수식 단순화" },
                { label: "calc > solve", description: "방정식 풀이" },
                { label: "calc > diff", description: "미분 (예: calc > diff > x)" },
                { label: "calc > int", description: "적분 (예: calc > int > x,0,1)" },
                { label: "calc > limit", description: "극한 (예: calc > limit > x,0)" },
                { label: "calc > taylor", description: "테일러 급수 (예: calc > taylor / 5)" },
                { label: "calc > ode", description: "미분방정식 (예: calc > ode / ic=y(0):1)" },
                { label: "calc > laplace", description: "라플라스 변환" },
                { label: "calc > dimcheck", description: "차원 및 단위 검사 (예: / set=v:L/T)" },
                { label: "calc > num_solve", description: "수치적 해법 및 그래프" }
            ],
            matrix: [
                { label: "matrix > p >", description: "소괄호 (pmatrix) - ( )" },
                { label: "matrix > b >", description: "대괄호 (bmatrix) - [ ] (기본값)" },
                { label: "matrix > v >", description: "수직바 (vmatrix) - | | (행렬식)" },
				{ label: "matrix > V >", description: "이중 수직바 (Vmatrix) - || ||" },
		        { label: "matrix > B >", description: "중괄호 (Bmatrix) - { }" },
                { label: "matrix > transform > [각도]", description: "회전변환 행렬 생성 (예: transform > \pi/2)" },
                { label: "matrix > [데이터]", description: "데이터 바로 입력 (예: matrix > 1,2/3,4)" },
                { label: "matrix > ... / analyze", description: "행렬 분석 (행렬식, 역행렬, RREF 결과 표시)" },
                { label: "matrix > ... / aug=", description: "첨가 행렬 (예: / aug=2 -> 2열 뒤에 수직선 추가)" }
            ],
            plot: [
                { label: "plot > 2d", description: "2D 그래프 (PGFPlots)" },
                { label: "plot > 3d", description: "3D 그래프 (x3dom 및 PDF)" },
                { label: "plot > complex", description: "복소 평면 Domain Coloring" },
                { label: "plot > 2d > -5,5", description: "범위 지정 (예: -5에서 5까지)" },
                { label: "plot > 2d / ymin=-10, ymax=10", description: "y축 범위 지정" },
                { label: "plot > 3d / export", description: "3D 그래프 PDF 내보내기" }
            ]
        };

        quickPick.items = commandLib.root;

        // 입력값이 변할 때마다 하위 메뉴 노출
        quickPick.onDidChangeValue(value => {
            if (value.startsWith("calc >")) {
                quickPick.items = commandLib.calc;
            } else if (value.startsWith("matrix >")) {
                quickPick.items = commandLib.matrix;
            } else if (value.startsWith("plot >")) {
                quickPick.items = commandLib.plot;
            } else if (value === "") {
                quickPick.items = commandLib.root;
            }
        });

        quickPick.show();

        // 사용자가 아이템을 선택하거나 엔터를 쳤을 때 처리
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            let userInput = selected ? selected.label : quickPick.value;
            
            // 만약 끝이 '>'로 끝나면 (그룹 선택), 입력창에 채워주고 계속 진행
            if (userInput.endsWith(">")) {
                quickPick.value = userInput + " ";
                return;
            }

            quickPick.hide();

            if (!userInput) {return;}

            // 행렬 명령어일 경우 빈 칸 확인 팝업 (Interactive Popup)
            if (userInput.includes("matrix")) {
                const parts = userInput.split(">").map(p => p.trim());
                const lastPart = parts[parts.length - 1];
                
                // 이미 fill_dots가 포함되어 있다면 묻지 않음
                if (!lastPart.includes("fill_dots")) {
                    let shouldAsk = false;

                    // 1. 크기만 지정하고 데이터를 안 적은 경우 (예: matrix > 3x3)
                    // 첫 번째 세그먼트(데이터 시작부분)가 NxM 형태인지 확인
                    const firstSegment = lastPart.split("/")[0].trim();
                    if (parts.length <= 3 && /^\d+x\d+$/.test(firstSegment)) {
                        shouldAsk = true;
                    }
                    
                    // 2. 명시적으로 빈 칸이 있는 경우 (데이터 입력 중)
                    // / / (빈 행) 또는 ,, (빈 열) 또는 마지막이 구분자로 끝나는 경우
                    if (!shouldAsk) {
                        const cells = lastPart.split(/[\/,;]/).map(c => c.trim());
                        const knownOptions = ["analyze", "fill_dots", "newline"];
                        
                        // 구분자 사이가 비어있거나, 마지막이 구분자인 경우
                        if (cells.some(c => c === "" && !knownOptions.includes(c)) || 
                            lastPart.endsWith(",") || lastPart.endsWith("/") || lastPart.endsWith(";")) {
                            shouldAsk = true;
                        }
                    }

                    // 3. 데이터 없이 스타일만 지정한 경우 (예: matrix > b)
                    if (!shouldAsk && parts.length <= 2 && !lastPart.includes(",") && !lastPart.includes("/") && !lastPart.includes("x")) {
                        shouldAsk = true;
                    }

                    if (shouldAsk) {
                        const answer = await vscode.window.showInformationMessage(
                            "행렬에 빈 공간이 감지되었습니다. 스마트 점(Dots)으로 자동 채우시겠습니까?",
                            "예 (스마트 점)", "아니오 (0으로 채움)"
                        );
                        if (answer === "예 (스마트 점)") {
                            userInput += " / fill_dots";
                        }
                    }
                }
            }

            const parsed = parseUserCommand(userInput, currentOriginalText);
            currentMainCommand = parsed.mainCommand;
            currentParallels = parsed.parallelOptions;

            // 라플라스 및 각도 설정 가져오기
            const config = vscode.workspace.getConfiguration('tex-machina');
            const laplaceConfig = {
                source: config.get('laplace.sourceVariable', 't'),
                target: config.get('laplace.targetVariable', 's')
            };
            const angleUnit = config.get('angleUnit', 'deg');
            const datDensity = config.get('plot.datDensity', 500);
            const yMultiplier = config.get('plot.yMultiplier', 5.0);
            const lineColor = config.get('plot.lineColor', 'blue');

            const payload = {
                ...parsed,
                config: {
                    laplace: laplaceConfig,
                    angleUnit: angleUnit,
                    datDensity: datDensity,
                    yMultiplier: yMultiplier,
                    lineColor: lineColor
                }
            };

            if (pythonProcess?.stdin) {
                pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
            }
        });

        // 텍스트가 바뀔 때 필터링은 QuickPick이 자동으로 수행함
    });

    context.subscriptions.push(cliCommand);

    // 5. 웹뷰에서 보낸 재랜더링(해상도 조절) 요청 처리 커맨드
    let rerenderCommand = vscode.commands.registerCommand('tex-machina.rerenderPlot', async (exprLatex: string, samples: string, options?: any) => {
        if (!pythonProcess?.stdin) {return;}
        
        // plot > 3d / samples=... 형태의 가상 명령어를 파싱하여 전달
        let userInput = `plot > 3d / samples=${samples}`;
        if (options) {
            if (options.x) userInput += ` / x=${options.x}`;
            if (options.y) userInput += ` / y=${options.y}`;
            if (options.z) userInput += ` / z=${options.z}`;
            if (options.scheme) userInput += ` / scheme=${options.scheme}`;
            if (options.color) userInput += ` / color=${options.color}`;
            
            // 스키마에 따라 필요한 옵션만 추가 (기본값이 선택된 스키마를 덮어쓰지 않도록)
            if (options.scheme === 'preset' && options.preset) {
                userInput += ` / preset=${options.preset}`;
            } else if ((options.scheme === 'custom' || options.scheme === 'height' || options.scheme === 'gradient') && options.stops) {
                userInput += ` / stops=${options.stops}`;
            }

            if (options.label) userInput += ` / label=${options.label}`;
            if (options.bg) userInput += ` / bg=${options.bg}`;
            if (options.complex) userInput += ` / complex=${options.complex}`;
            if (options.axis) userInput += ` / axis=${options.axis}`;
        }

        const parsed = parseUserCommand(userInput, exprLatex);
        
        currentMainCommand = parsed.mainCommand;
        currentParallels = parsed.parallelOptions;

        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = {
            ...parsed,
            config: {
                angleUnit: config.get('angleUnit', 'deg'),
                datDensity: config.get('plot.datDensity', 500)
            }
        };

        pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
    });

    context.subscriptions.push(rerenderCommand);

    // 6. 3D 그래프 PDF 내보내기 커맨드
    let exportCommand = vscode.commands.registerCommand('tex-machina.export3dPlot', async (exprLatex: string, samples: string, color: string, options?: any) => {
        if (!pythonProcess?.stdin || !currentEditor) {return;}

        const fmt = (options && options.export) || 'pdf';
        const answer = await vscode.window.showInformationMessage(
            `현재 3D 그래프를 ${fmt.toUpperCase()}로 저장하고 Figure를 삽입하시겠습니까?`,
            "예 (images 폴더 생성 및 저장)", "아니오"
        );

        if (answer !== "예 (images 폴더 생성 및 저장)") {return;}

        // 내보내기 상태 설정
        isExportingPdf = true;
        pdfTargetDir = path.dirname(currentEditor.document.uri.fsPath);

        // plot > 3d / samples=..., export, color=... 형태의 명령어 전달
        let userInput = `plot > 3d / samples=${samples}`;
        if (options) {
            if (options.x) userInput += ` / x=${options.x}`;
            if (options.y) userInput += ` / y=${options.y}`;
            if (options.z) userInput += ` / z=${options.z}`;
            if (options.scheme) userInput += ` / scheme=${options.scheme}`;
            
            // 스키마에 따라 필요한 옵션만 추가
            if (options.scheme === 'uniform') {
                userInput += ` / color=${color}`;
            } else if (options.scheme === 'preset' && options.preset) {
                userInput += ` / preset=${options.preset}`;
            } else if ((options.scheme === 'custom' || options.scheme === 'height' || options.scheme === 'gradient') && options.stops) {
                userInput += ` / stops=${options.stops}`;
            } else {
                // height, gradient 등은 추가 파라미터 불필요하지만 color는 기본값으로 넣어줄 수 있음
                userInput += ` / color=${color}`;
            }

            if (options.label) userInput += ` / label=${options.label}`;
            if (options.bg) userInput += ` / bg=${options.bg}`;
            if (options.complex) userInput += ` / complex=${options.complex}`;
            if (options.axis) userInput += ` / axis=${options.axis}`;
            if (options.export) userInput += ` / export=${options.export}`;
            else userInput += ` / export`;
        } else {
            userInput += ` / color=${color} / export`;
        }
        
        const parsed = parseUserCommand(userInput, exprLatex);
        
        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = {
            ...parsed,
            config: {
                angleUnit: config.get('angleUnit', 'deg'),
                datDensity: config.get('plot.datDensity', 500)
            }
        };

        pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
    });

    context.subscriptions.push(exportCommand);
}

export function deactivate() {
    if (pythonProcess) {
        pythonProcess.kill();
    }
}