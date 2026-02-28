import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { parseUserCommand } from './core/commandParser';
import { TeXMachinaWebviewProvider } from './ui/webviewProvider';
import { performWidthAnalysis } from './core/widthAnalyzer';
import { registerAutoBracing } from './core/autoBracing';

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

    // [Smart Auto-bracing] 첨자 자동 괄호 기능 등록
    registerAutoBracing(context);

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

                // [oeis] 수열 검색 결과 처리
                if (response.status === 'oeis_results') {
                    const selected = await vscode.window.showQuickPick(response.results as vscode.QuickPickItem[], {
                        placeHolder: `'${response.query}' 검색 결과 (15개까지 표시)`
                    });
                    if (selected) {
                        const s = selected as any;
                        const options = [
                            { label: "ID만 삽입", detail: s.id, value: s.id },
                            { label: "수열 데이터 삽입", detail: s.data, value: s.data },
                            { label: "ID와 이름 삽입", detail: `${s.id}: ${s.full_name}`, value: `${s.id}: ${s.full_name}` }
                        ];
                        const insertType = await vscode.window.showQuickPick(options, {
                            placeHolder: "어떤 형식으로 삽입할까요?"
                        }) as any;

                        if (insertType && currentEditor) {
                            await currentEditor.edit(editBuilder => {
                                editBuilder.insert(currentEditor!.selection.active, insertType.value);
                            });
                        }
                    }
                    continue;
                }

                // [cite] 인용 검색 결과 처리
                if (response.status === 'search_results') {
                    const selected = await vscode.window.showQuickPick(response.results, {
                        placeHolder: "인용할 논문을 선택하세요"
                    });
                    if (selected && (selected as any).doi) {
                        // 선택된 DOI로 다시 요청 (parseUserCommand 대신 직접 payload 구성)
                        const payload = {
                            mainCommand: "cite",
                            subCommands: [(selected as any).doi],
                            parallelOptions: [],
                            rawSelection: "",
                            config: {}
                        };
                        if (pythonProcess?.stdin) {
                            pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
                        }
                    }
                    continue;
                }

                if (response.status === 'success') {
                    
                    // [cite] 인용 성공 처리
                    if (response.bibtex && response.cite_key) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const texDir = path.dirname(editor.document.uri.fsPath);
                            // 1. .bib 파일 찾기 (없으면 references.bib 생성)
                            const files = fs.readdirSync(texDir);
                            let bibFile = files.find(f => f.endsWith('.bib'));
                            if (!bibFile) {
                                bibFile = 'references.bib';
                            }
                            const bibPath = path.join(texDir, bibFile);

                            // 2. BibTeX 추가 (중복 체크 생략 - 필요시 고도화)
                            let content = "";
                            if (fs.existsSync(bibPath)) {
                                content = fs.readFileSync(bibPath, 'utf8');
                            }
                            
                            if (!content.includes(response.cite_key)) {
                                fs.appendFileSync(bibPath, `\n\n${response.bibtex}`);
                                vscode.window.showInformationMessage(`BibTeX이 ${bibFile}에 추가되었습니다.`);
                            } else {
                                vscode.window.showInformationMessage(`이미 존재하는 인용 키입니다: ${response.cite_key}`);
                            }

                            // 3. 에디터에 \cite{key} 삽입
                            await editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, `\\cite{${response.cite_key}}`);
                            });
                        }
                        continue;
                    }

                    // [1] Webview 업데이트는 에디터 상태와 상관없이 항상 수행
                    provider.updatePreview(response.latex, response.vars, response.analysis, response.x3d_data, response.warning, response.preview_img);

                    // [2] 에디터 삽입 로직 (에디터가 활성화되어 있는 경우 수행)
                    // currentParallels에 'samples'가 포함되어 있다면 이는 웹뷰에서의 조정일 가능성이 높으므로 일반 삽입 제외
                    const isRerender = currentParallels.some(p => p.startsWith('samples=') || p.startsWith('x=') || p.startsWith('scheme='));

                    if (currentEditor && currentSelection) {
                        // 내보내기 모드인 경우 파일 저장 및 Figure 삽입 (isRerender와 상관없이 수행)
                        if (isExportingPdf) {
                            if (response.export_content) {
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
                                                                    const figureCode = `\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{images/${filename}}\n\\caption{3D Plot of $${response.x3d_data.expr}$}\n\\label{fig:plot_3d}\n\\end{figure}\n`;
                                                                    
                                                                    await currentEditor.edit(editBuilder => {
                                                                        editBuilder.replace(currentSelection!, figureCode);
                                                                    });                                    
                                    vscode.window.showInformationMessage(`그래프가 ${ext.toUpperCase()}로 저장되고 Figure가 삽입되었습니다: images/${filename}`);
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`저장 실패: ${err.message}`);
                                } finally {
                                    isExportingPdf = false;
                                }
                                continue;
                            } else {
                                // 내보내기 요청이었으나 콘텐츠가 없는 경우 상태 리셋
                                isExportingPdf = false;
                            }
                        }

                        // 일반 결과 삽입 (재랜더링이 아닌 경우에만)
                        if (!isRerender) {
                            const resultLatex = response.latex;
                            let outputText = "";

                            // .dat 파일 생성 처리 (텍스트 교체 전에 수행하여 파일이 존재하도록 함)
                            if (response.dat_content) {
                                const texDir = path.dirname(currentEditor.document.uri.fsPath);
                                const dataDir = path.join(texDir, 'data');
                                const datFilename = response.dat_filename || 'plot_data.dat';
                                const datPath = path.join(dataDir, datFilename);

                                try {
                                    if (!fs.existsSync(dataDir)) {
                                        fs.mkdirSync(dataDir, { recursive: true });
                                    }
                                    fs.writeFileSync(datPath, response.dat_content);
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`파일 저장 실패: ${err.message}`);
                                }
                            }

                            if (currentMainCommand === "matrix") {
                                outputText = resultLatex;
                            } else if (currentMainCommand === "plot") {
                                // 2D Plot(PGFPlots)인 경우에만 에디터에 삽입, 3D는 웹뷰 프리뷰만 유지
                                if (response.latex.includes("tikzpicture")) {
                                    outputText = resultLatex;
                                } else {
                                    outputText = currentOriginalText;
                                }
                            } else if (currentParallels.includes("newline")) {
                                outputText = `${currentOriginalText}\n\n\\[\n${resultLatex}\n\\]`;
                            } else {
                                outputText = `${currentOriginalText} = ${resultLatex}`;
                            }

                            // 2D plot이거나 plot이 아닐 때 에디터 텍스트 교체 수행
                            if (currentMainCommand !== "plot" || (currentMainCommand === "plot" && response.latex.includes("tikzpicture"))) {
                                await currentEditor.edit(editBuilder => {
                                    editBuilder.replace(currentSelection!, outputText);
                                });
                            }
                        }
                    }

                    // 경고 메시지가 있으면 출력
                    if (response.warning) {
                        vscode.window.showWarningMessage(response.warning);
                    }
                } else if (response.status === 'error') {
                    vscode.window.showErrorMessage(`연산 실패: ${response.message}`);
                    isExportingPdf = false;
                }
            } catch (e) {
                console.error("결과 처리 중 오류:", e, "원본 데이터:", line);
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
                { label: "plot >", description: "수식 시각화 (2D, 3D, 복소 평면)" },
                { label: "cite >", description: "논문 인용 (arXiv ID, DOI, 또는 제목)" },
                { label: "oeis >", description: "OEIS 수열 검색" },
                { label: "analyze >", description: "문서 및 수식 분석 (너비 등)" }
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
            oeis: [
                ...(currentOriginalText ? [{ label: `oeis > ${currentOriginalText}`, description: "선택한 영역으로 수열 검색" }] : []) as vscode.QuickPickItem[],
                { label: "oeis > 1,1,2,3,5,8", description: "피보나치 수열 검색" },
                { label: "oeis > 2,3,5,7,11", description: "소수 수열 검색" },
                { label: "oeis > A000045", description: "수열 번호(ID)로 검색" }
            ],
            matrix: [
                { label: "matrix > p >", description: "소괄호 (pmatrix) - ( )" },
                { label: "matrix > b >", description: "대괄호 (bmatrix) - [ ] (기본값)" },
                { label: "matrix > v >", description: "수직바 (vmatrix) - | | (행렬식)" },
				{ label: "matrix > V >", description: "이중 수직바 (Vmatrix) - || ||" },
		        { label: "matrix > B >", description: "중괄호 (Bmatrix) - { }" },
                { label: "matrix > transform > [각도]", description: "회전변환 행렬 생성 (예: transform > \\pi/2)" },
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
                { label: "plot > 3d / preset=mathematica", description: "Mathematica 스타일 색상 (Z-Blend)" },
                { label: "plot > 3d / export", description: "3D 그래프 PDF 내보내기" }
            ],
            cite: [
                { label: "cite > 2109.12345", description: "arXiv ID로 인용 정보 가져오기" },
                { label: "cite > 10.1038/nature14539", description: "DOI로 인용 정보 가져오기" },
                { label: "cite > Attention is all you need", description: "제목으로 논문 검색" }
            ],
            analyze: [
                { label: "analyze > width", description: "수식 너비 분석 (문서 너비 초과 여부 확인)" }
            ]
        };

        quickPick.items = commandLib.root;

        // 입력값이 변할 때마다 하위 메뉴 노출
        quickPick.onDidChangeValue(value => {
            if (value.startsWith("calc >")) {
                quickPick.items = commandLib.calc;
            } else if (value.startsWith("oeis >")) {
                quickPick.items = commandLib.oeis;
            } else if (value.startsWith("matrix >")) {
                quickPick.items = commandLib.matrix;
            } else if (value.startsWith("plot >")) {
                quickPick.items = commandLib.plot;
            } else if (value.startsWith("cite >")) {
                quickPick.items = commandLib.cite;
            } else if (value.startsWith("analyze >")) {
                quickPick.items = commandLib.analyze;
            } else if (value === "") {
                quickPick.items = commandLib.root;
            }
        });

        quickPick.show();

        // 사용자가 아이템을 선택하거나 엔터를 쳤을 때 처리
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            let userInput = selected ? selected.label : quickPick.value;
            
            // [Bug Fix] 사용자가 선택 항목보다 더 길게 타이핑했다면 (예: 데이터 입력), 타이핑한 내용을 우선함.
            // 이는 자동완성 후 추가 입력 시 이전 선택 항목(Prefix)으로 롤백되는 현상을 방지함.
            if (selected && quickPick.value.length > selected.label.length) {
                userInput = quickPick.value;
            }

            // 만약 끝이 '>'로 끝나면 (그룹 선택), 입력창에 채워주고 계속 진행
            if (userInput.trim().endsWith(">")) {
                quickPick.value = userInput.trim() + " ";
                // 다음 단계 필터링을 위해 선택 상태 초기화
                quickPick.selectedItems = [];
                return;
            }

            quickPick.hide();

            if (!userInput) {return;}

            // 특수 커맨드 (분석) 처리
            if (userInput === "analyze > width") {
                vscode.commands.executeCommand('tex-machina.analyzeWidth');
                return;
            }

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

            // [추가] 변수 z 감지 시 복소 그래프 모드 제안
            if (currentMainCommand === 'plot' && parsed.subCommands.includes('3d')) {
                const zDetected = /[^a-zA-Z]z[^a-zA-Z]|^z[^a-zA-Z]|[^a-zA-Z]z$|^z$/.test(currentOriginalText);
                if (zDetected && !currentParallels.some(p => p.includes('complex'))) {
                    const answer = await vscode.window.showInformationMessage(
                        "변수 'z'가 감지되었습니다. 복소 평면 시각화(Complex Mode)를 활성화할까요?",
                        "예 (Abs|Phase)", "아니오"
                    );
                    if (answer === "예 (Abs|Phase)") {
                        userInput += " / complex=abs_phase";
                        // 다시 파싱
                        const updatedParsed = parseUserCommand(userInput, currentOriginalText);
                        currentParallels = updatedParsed.parallelOptions;
                        parsed.parallelOptions = updatedParsed.parallelOptions;
                    }
                }
            }

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
                    lineColor: lineColor,
                    workspaceDir: path.dirname(editor.document.uri.fsPath)
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
        
        let userInput = `plot > 3d / samples=${samples}`;
        if (options) {
            if (options.x) {userInput += ` / x=${options.x}`;}
            if (options.y) {userInput += ` / y=${options.y}`;}
            if (options.z) {userInput += ` / z=${options.z}`;}
            if (options.scheme) {userInput += ` / scheme=${options.scheme}`;}
            if (options.color) {userInput += ` / color=${options.color}`;}
            
            if (options.scheme === 'preset' && options.preset) {
                userInput += ` / preset=${options.preset}`;
            } else if ((options.scheme === 'custom' || options.scheme === 'height' || options.scheme === 'gradient') && options.stops) {
                userInput += ` / stops=${options.stops}`;
            }

            if (options.label) {userInput += ` / label=${options.label}`;}
            if (options.bg) {userInput += ` / bg=${options.bg}`;}
            if (options.complex) {userInput += ` / complex=${options.complex}`;}
            if (options.axis) {userInput += ` / axis=${options.axis}`;}
        }

        const parsed = parseUserCommand(userInput, exprLatex);
        
        currentMainCommand = parsed.mainCommand;
        currentParallels = parsed.parallelOptions;

        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = {
            ...parsed,
            config: {
                angleUnit: config.get('angleUnit', 'deg'),
                datDensity: config.get('plot.datDensity', 500),
                workspaceDir: currentEditor ? path.dirname(currentEditor.document.uri.fsPath) : undefined
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
            if (options.x) {userInput += ` / x=${options.x}`;}
            if (options.y) {userInput += ` / y=${options.y}`;}
            if (options.z) {userInput += ` / z=${options.z}`;}
            if (options.scheme) {userInput += ` / scheme=${options.scheme}`;}
            
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

            if (options.label) {userInput += ` / label=${options.label}`;}
            if (options.bg) {userInput += ` / bg=${options.bg}`;}
            if (options.complex) {userInput += ` / complex=${options.complex}`;}
            if (options.axis) {userInput += ` / axis=${options.axis}`;}
            if (options.export) {userInput += ` / export=${options.export}`;}
            else {userInput += ` / export`;}
        } else {
            userInput += ` / color=${color} / export`;
        }
        
        const parsed = parseUserCommand(userInput, exprLatex);
        
        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = {
            ...parsed,
            config: {
                angleUnit: config.get('angleUnit', 'deg'),
                datDensity: config.get('plot.datDensity', 500),
                workspaceDir: currentEditor ? path.dirname(currentEditor.document.uri.fsPath) : undefined
            }
        };

        pythonProcess.stdin.write(JSON.stringify(payload) + '\n');
    });

    context.subscriptions.push(exportCommand);

    // 7. 웹뷰 캡처 이미지 저장 커맨드 (내부용)
    let internalSaveCommand = vscode.commands.registerCommand('tex-machina.internalSaveWebviewImage', async (buffer: Buffer, format: string, expr: string) => {
        if (!currentEditor) {return;}
        
        const targetDir = path.dirname(currentEditor.document.uri.fsPath);
        const imagesDir = path.join(targetDir, 'images');
        const ext = format || 'png';
        const timestamp = new Date().getTime();
        const filename = `plot_3d_${timestamp}.${ext}`;
        const exportPath = path.join(imagesDir, filename);

        try {
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            fs.writeFileSync(exportPath, buffer);
            
            const figureCode = `\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{images/${filename}}\n\\caption{3D Plot of $${expr}$}\n\\label{fig:plot_3d_${timestamp}}\n\\end{figure}\n`;
            
            await currentEditor.edit(editBuilder => {
                if (currentSelection) {
                    editBuilder.replace(currentSelection, figureCode);
                } else {
                    editBuilder.insert(currentEditor!.selection.end, figureCode);
                }
            });
            
            vscode.window.showInformationMessage(`웹뷰 화면이 ${ext.toUpperCase()}로 저장되고 Figure가 삽입되었습니다: images/${filename}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`저장 실패: ${err.message}`);
        }
    });
    context.subscriptions.push(internalSaveCommand);

    // 8. 수식 너비 분석 커맨드 등록
    let analyzeWidthCommand = vscode.commands.registerCommand('tex-machina.analyzeWidth', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith('.tex')) {
            vscode.window.showErrorMessage("활성화된 LaTeX (.tex) 파일이 없습니다.");
            return;
        }
        await performWidthAnalysis(editor.document);
    });
    context.subscriptions.push(analyzeWidthCommand);
}

export function deactivate() {
    if (pythonProcess) {
        pythonProcess.kill();
    }
}