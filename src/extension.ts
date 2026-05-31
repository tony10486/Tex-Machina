import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { parseUserCommand, splitChain } from './core/commandParser';
import { TeXMachinaWebviewProvider } from './ui/webviewProvider';
import { registerAutoBracing } from './core/autoBracing';
import { registerAutoLeftRight } from './core/autoLeftRight';
import { registerMathSplitter } from './core/mathSplitter';
import { registerUnitExpander } from './core/unitExpander';
import { registerMarkdownLatex } from './core/markdownLatex';
import { registerSmartQuotes } from './core/smartQuotes';
import { registerEllipsis } from './core/ellipsis';
import { registerDiacritics } from './core/diacritics';
import { registerLabelDetection, findLabels } from './core/labelDetection';
import { registerNodeNavigation } from './core/nodeNavigation';
import { registerMathAutoWrap } from './core/mathAutoWrap';
import { registerFractionShorthand } from './core/fractionShorthand';
import { registerScanPrevention } from './core/scanPrevention';
import { registerEnvAutoDelete } from './core/envAutoDelete';
import { MacroManager } from './core/macroManager';
import { registerToggleMode, deactivateToggleMode } from './core/toggleMode';
import { registerImplicitSubscripts } from './core/implicitSubscripts';
import { registerSmartNewline } from './core/smartNewline';
import { registerMathLigatures } from './core/mathLigatures';
import { registerAutoEndEnv } from './core/autoEndEnv';
import { registerIdxExpansion } from './core/idxExpansion';
import { registerShorthandMode } from './core/shorthandMode';
import { registerExtendedInput } from './core/extendedInput';
import { registerSelectionExpansion } from './core/selectionExpansion';
import { registerLinkedEditing } from './core/linkedEditing';
import { registerSmartBackspace } from './core/smartBackspace';
import { registerArgumentNavigation } from './core/argumentNavigation';
import { registerMathToggle } from './core/mathToggle';
import { registerMatrixResizer } from './core/matrixResizer';
import { registerSelectionWrap } from './core/selectionWrap';
import { registerMathRefactor } from './core/mathRefactor';
import { registerMathAutoCalc } from './core/mathAutoCalc';
import { registerMathGhostCalc } from './core/mathGhostCalc';
import {
    PasteExternalDataProvider,
    smartPasteExternalData,
    forcePasteAsMatrix,
    forcePasteAsTabular,
} from './core/pasteExternalDataProvider';
import { PythonService } from './services/pythonService';

let pythonService: PythonService;
let currentEditor: vscode.TextEditor | undefined;
let currentSelection: vscode.Selection | undefined;
let currentOriginalText: string = "";
let currentMainCommand: string = "";
let currentParallels: string[] = [];
let isExportingPdf: boolean = false;
let pdfTargetDir: string = "";
let macroManager: MacroManager;

let lastLabelNodes: any[] = [];
let lastLabelEdges: any[] = [];

async function executeChain(chain: string[], initialSelection: string, editor: vscode.TextEditor, selection: vscode.Selection) {
    let currentInput = initialSelection;
    let lastResponse: any = null;

    const config = vscode.workspace.getConfiguration('tex-machina');
    const calcSettings = config.get<any>('calc.settings', {});
    const laplaceConfig = {
        source: calcSettings.laplaceSource || 't',
        target: calcSettings.laplaceTarget || 's'
    };
    const angleUnit = calcSettings.angleUnit || 'deg';
    const datDensity = config.get('plot.datDensity', 500);
    const yMultiplier = config.get('plot.yMultiplier', 5.0);
    const lineColor = config.get('plot.lineColor', 'blue');

    for (let i = 0; i < chain.length; i++) {
        const cmdStr = chain[i];
        const parsed = parseUserCommand(cmdStr, currentInput);
        
        currentMainCommand = parsed.mainCommand;
        currentParallels = parsed.parallelOptions;

        const payload = {
            ...parsed,
            config: {
                laplace: laplaceConfig,
                angleUnit: angleUnit,
                precision: calcSettings.precision,
                imaginaryUnit: calcSettings.imaginaryUnit,
                simplifyResult: calcSettings.simplifyResult,
                defaultDomain: calcSettings.defaultDomain,
                rationalNotation: calcSettings.rationalNotation,
                autoFactor: calcSettings.autoFactor,
                datDensity: datDensity,
                yMultiplier: yMultiplier,
                lineColor: lineColor,
                workspaceDir: path.dirname(editor.document.uri.fsPath)
            }
        };

        const response = await pythonService.sendAndWait(payload);
        lastResponse = response;

        if (response.status === 'success') {
            if (response.status === 'oeis_results' || response.status === 'search_results') {
                vscode.window.showWarningMessage(`체인 내에서 인터랙티브 명령어(${parsed.mainCommand})는 지원되지 않습니다.`);
                break;
            }
            currentInput = response.latex;
        } else {
            vscode.window.showErrorMessage(`체인 중단 (${cmdStr}): ${response.message}`);
            return;
        }
    }

    if (lastResponse && lastResponse.status === 'success') {
        const resultLatex = lastResponse.latex;
        let outputText = "";

        if (currentMainCommand === "matrix") {
            outputText = resultLatex;
        } else if (currentMainCommand === "plot") {
            if (lastResponse.latex.includes("tikzpicture")) {
                outputText = resultLatex;
            } else {
                outputText = initialSelection;
            }
        } else if (currentParallels.includes("newline")) {
            outputText = `${initialSelection}\n\n\\[\n${resultLatex}\n\\]`;
        } else {
            outputText = `${initialSelection} = ${resultLatex}`;
        }

        if (currentMainCommand !== "plot" || (currentMainCommand === "plot" && lastResponse.latex.includes("tikzpicture"))) {
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, outputText);
            });
        }
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('TeX-Machina 활성화 완료!');

    pythonService = new PythonService(context);
    await pythonService.start();

    registerImplicitSubscripts();
    registerToggleMode(context);
    macroManager = new MacroManager(context);
    registerNodeNavigation(context);
    registerAutoBracing(context);
    registerAutoLeftRight(context);
    registerEnvAutoDelete(context);
    registerMathSplitter(context);
    registerUnitExpander(context);
    registerMarkdownLatex(context);
    registerSmartQuotes(context);
    registerEllipsis(context);
    registerDiacritics(context);
    registerSmartNewline(context);
    registerMathLigatures(context);
    registerAutoEndEnv(context);
    registerExtendedInput(context);
    registerShorthandMode(context);
    registerSelectionExpansion(context);
    registerLinkedEditing(context);
    registerSmartBackspace(context);
    registerArgumentNavigation(context);
    registerMathToggle(context);
    registerMatrixResizer(context);
    registerSelectionWrap(context);
    registerMathRefactor(context);
    registerMathAutoCalc(context, pythonService);
    registerMathGhostCalc(context, pythonService);

    // Paste External Data Provider
    if (typeof vscode.languages.registerDocumentPasteEditProvider === 'function') {
        context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider(
            'latex',
            new PasteExternalDataProvider(),
            {
                providedPasteEditKinds: [
                    vscode.DocumentDropOrPasteEditKind.Empty.append('latex'),
                ],
            }
        ));
    }

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.pasteExternalData.smart', smartPasteExternalData));
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.pasteExternalData.matrix', forcePasteAsMatrix));
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.pasteExternalData.tabular', forcePasteAsTabular));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.addLabelDependency', async (args: {line: number, startChar: number, endChar: number, sourceLabel: string}) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}
        const range = new vscode.Range(new vscode.Position(args.line, args.startChar), new vscode.Position(args.line, args.endChar));
        await editor.edit(editBuilder => {
            editBuilder.insert(range.end, `%(from:${args.sourceLabel})`);
        });
        vscode.commands.executeCommand('tex-machina.discoverLabels');
    }));

    context.subscriptions.push(vscode.languages.registerHoverProvider('latex', {
        provideHover(document, position, token) {
            const line = document.lineAt(position.line).text;
            const labelRegex = /\\label\{([^}]+)\}/g;
            let match;
            while ((match = labelRegex.exec(line)) !== null) {
                const labelName = match[1];
                const startPos = new vscode.Position(position.line, match.index);
                const endPos = new vscode.Position(position.line, match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                if (range.contains(position)) {
                    const allLabels = findLabels(document.getText(), document);
                    const otherLabels = allLabels.filter(l => l.label !== labelName);
                    const hoverContent = new vscode.MarkdownString('', true);
                    hoverContent.isTrusted = true;
                    hoverContent.supportHtml = true;
                    hoverContent.appendMarkdown(`### 🏷️ Label: **${labelName}**\n\n`);
                    hoverContent.appendMarkdown(`이 라벨의 **출발점(Source)**을 지정하세요:\n\n`);
                    if (otherLabels.length === 0) {
                        hoverContent.appendMarkdown(`*현재 문서에 다른 라벨이 없습니다.*`);
                    } else {
                        otherLabels.forEach(l => {
                            const commandArgs = { line: position.line, startChar: match!.index, endChar: match!.index + match![0].length, sourceLabel: l.label };
                            const commandUri = vscode.Uri.parse(`command:tex-machina.addLabelDependency?${encodeURIComponent(JSON.stringify(commandArgs))}`);
                            hoverContent.appendMarkdown(`- [Connect from **${l.label}**](${commandUri} "Click to add dependency")\n`);
                        });
                    }
                    return new vscode.Hover(hoverContent, range);
                }
            }
            return null;
        }
    }));

    registerLabelDetection(context);
    registerMathAutoWrap(context);
    registerFractionShorthand(context);
    registerIdxExpansion(context);
    registerScanPrevention(context);

    const provider = new TeXMachinaWebviewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(TeXMachinaWebviewProvider.viewType, provider));
    provider.updateMacros(macroManager.getMacros());

    pythonService.onResponse(async (response) => {
        await handlePythonResponse(response, provider);
    });

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.defineMacro', async (name: string, chain: string) => {
        await macroManager.defineMacro(name, chain);
        provider.updateMacros(macroManager.getMacros());
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.deleteMacro', async (name: string) => {
        await macroManager.deleteMacro(name);
        provider.updateMacros(macroManager.getMacros());
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.applyMacro', async (name: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const expanded = macroManager.expand(`;${name}`, editor);
        if (expanded !== `;${name}`) {
            const chain = splitChain(expanded, vscode.workspace.getConfiguration('tex-machina').get<string>('cli.chainDelimiter', '&&'));
            await executeChain(chain, editor.document.getText(editor.selection), editor, editor.selection);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.discoverLabels', async () => {
        if (!provider.isLabelDiscoveryExpanded()) { return; }
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith('.tex')) { return; }
        const payload = { mainCommand: "labels", config: { filepath: editor.document.uri.fsPath } };
        pythonService.send(payload);
    }));

    let labelUpdateTimeout: NodeJS.Timeout | undefined;
    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document && event.document.fileName.endsWith('.tex')) {
            if (labelUpdateTimeout) { clearTimeout(labelUpdateTimeout); }
            labelUpdateTimeout = setTimeout(() => { vscode.commands.executeCommand('tex-machina.discoverLabels'); }, 1000);
        }
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.fileName.endsWith('.tex')) {
            lastLabelNodes = [];
            lastLabelEdges = [];
            vscode.commands.executeCommand('tex-machina.discoverLabels');
        }
    }, null, context.subscriptions);

	context.subscriptions.push(vscode.commands.registerCommand('tex-machina.openCLI', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}
        currentEditor = editor;
        currentSelection = editor.selection;
        currentOriginalText = editor.document.getText(currentSelection);

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = "명령어를 입력하세요 (예: calc >, matrix >)";
        
        const commandLib = {
            root: [
                { label: "calc >", description: "수학 연산 명령어 (미분, 적분, 단순화 등)" },
                { label: "matrix >", description: "행렬 생성 및 분석" },
                { label: "plot >", description: "수식 시각화 (2D, 3D, 복소 평면)" },
                { label: "cite >", description: "논문 인용 (arXiv ID, DOI, 또는 제목)" },
                { label: "oeis >", description: "OEIS 수열 검색" },
                { label: "analyze >", description: "문서 및 수식 분석 (너비 등)" },
                { label: "labels", description: "LaTeX 라벨 디펜던시 분석 및 시각화" }
            ],
            calc: [
                { label: "calc > simplify", description: "수식 단순화" },
                { label: "calc > factor", description: "인수분해" },
                { label: "calc > solve", description: "방정식 풀이" },
                { label: "calc > diff", description: "미분 (예: calc > diff > x)" },
                { label: "calc > int", description: "적분 (예: calc > int > x,0,1)" },
                { label: "calc > limit", description: "극한 (예: calc > limit > x,0)" },
                { label: "calc > taylor", description: "테일러 급수 (예: calc > taylor / 5)" },
                { label: "calc > ode", description: "미분방정식 (예: calc > ode / ic=y(0):1)" },
                { label: "calc > pde", description: "편미분방정식" },
                { label: "calc > laplace", description: "라플라스 변환" },
                { label: "calc > dimcheck", description: "차원 및 단위 검사 (예: / set=v:L/T)" },
                { label: "calc > num_solve", description: "수치적 해법 및 그래프" },
                { label: "calc > rref", description: "기약 행사다리꼴로 변환" },
                { label: "calc > det", description: "행렬식" },
                { label: "calc > inv", description: "역행렬" },
                { label: "calc > eigen", description: "고유값" },
                { label: "calc > rank", description: "행렬의 rank" },
                { label: "calc > trace", description: "주대각합" },
                { label: "calc > transpose", description: "전치행렬" },
                { label: "calc > nullspace", description: "행렬의 영공간(null space)" },
                { label: "calc > jacobian", description: "야코비안" },
                { label: "calc > hessian", description: "헤세 행렬" },
                { label: "calc > limit", description: "극한" },
                { label: "calc > taylor", description: "테일러 전개" },
                { label: "calc > asymp", description: "점근 전개" },
                { label: "calc > apart", description: "부분분수 분해" },
                { label: "calc > together", description: "통분" },
                { label: "calc > trigsimp", description: "삼각함수가 있는 식의 정리" },
                { label: "calc > expand_trig", description: "삼각함수가 있는 식의 전개" },
                { label: "calc > eval", description: "식의 수치를 계산" },
                { label: "calc > ilaplace", description: "라플라스 역변환" },
                { label: "calc > fourier", description: "푸리에 변환" },
                { label: "calc > ifourier", description: "푸리에 역변환" },
                { label: "calc > ztrans", description: "Z-변환" },
                { label: "calc > residue", description: "유수 계산" },
                { label: "calc > laurent", description: "로랑 급수" },
                { label: "calc > conjugate", description: "켤레복소수" },
                { label: "calc > re", description: "복소수의 실수부" },
                { label: "calc > im", description: "복소수의 허수부" },
                { label: "calc > prime", description: "소수의 판별" },
                { label: "calc > factorint", description: "소인수분해" },
                { label: "calc > logic", description: "기호 논리 연산" },
                { label: "calc > error_prop", description: "오차 전파의 계산" },
                { label: "calc > tensor_expand", description: "텐서의 확장" }
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
                { label: "analyze > split", description: "수식 자동 분할 (= 기준)" },
                { label: "analyze > split / plus", description: "수식 자동 분할 (=, +, - 기준)" }
            ]
        };

        quickPick.items = commandLib.root;
        quickPick.onDidChangeValue(value => {
            if (/^calc\s*>/.test(value)) { quickPick.items = commandLib.calc; }
            else if (/^oeis\s*>/.test(value)) { quickPick.items = commandLib.oeis; }
            else if (/^matrix\s*>/.test(value)) { quickPick.items = commandLib.matrix; }
            else if (/^plot\s*>/.test(value)) { quickPick.items = commandLib.plot; }
            else if (/^cite\s*>/.test(value)) { quickPick.items = commandLib.cite; }
            else if (/^analyze\s*>/.test(value)) { quickPick.items = commandLib.analyze; }
            else if (value === "") { quickPick.items = commandLib.root; }
        });

        quickPick.show();
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            let userInput = selected ? selected.label : quickPick.value;
            if (selected && quickPick.value.length > selected.label.length) { userInput = quickPick.value; }
            if (selected && selected.label.endsWith(" >") && quickPick.value) {
                const lastGTIndex = selected.label.lastIndexOf(" >");
                const baseCmd = selected.label.substring(0, lastGTIndex).trim();
                if (quickPick.value.trim() === baseCmd) { userInput = quickPick.value.trim(); }
            }
            userInput = macroManager.expand(userInput, editor);
            if (userInput.trim().endsWith(">")) {
                quickPick.value = userInput.trim() + " ";
                quickPick.selectedItems = [];
                return;
            }
            quickPick.hide();
            if (!userInput) {return;}
            const macroDef = macroManager.parseDefinition(userInput);
            if (macroDef) {
                await macroManager.defineMacro(macroDef.name, macroDef.chain);
                provider.updateMacros(macroManager.getMacros());
                return;
            }
            if (userInput.startsWith("analyze > split")) {
                const splitAtPlus = userInput.includes("/ plus");
                vscode.commands.executeCommand('tex-machina.splitMath', { splitAtPlus });
                return;
            }
            if (userInput === "labels") { vscode.commands.executeCommand('tex-machina.discoverLabels'); return; }
            const cliConfig = vscode.workspace.getConfiguration('tex-machina');
            const delimiter = cliConfig.get<string>('cli.chainDelimiter', '&&');
            const chain = splitChain(userInput, delimiter);
            if (chain.length > 1) {
                if (currentEditor && currentSelection) { await executeChain(chain, currentOriginalText, currentEditor, currentSelection); }
                return;
            }
            if (userInput.includes("matrix")) {
                const parts = userInput.split(">").map(p => p.trim());
                const lastPart = parts[parts.length - 1];
                if (!lastPart.includes("fill_dots")) {
                    let shouldAsk = false;
                    const firstSegment = lastPart.split("/")[0].trim();
                    if (parts.length <= 3 && /^\d+x\d+$/.test(firstSegment)) { shouldAsk = true; }
                    if (!shouldAsk) {
                        const cells = lastPart.split(/[\/,;]/).map(c => c.trim());
                        const knownOptions = ["analyze", "fill_dots", "newline"];
                        if (cells.some(c => c === "" && !knownOptions.includes(c)) || lastPart.endsWith(",") || lastPart.endsWith("/") || lastPart.endsWith(";")) { shouldAsk = true; }
                    }
                    if (!shouldAsk && parts.length <= 2 && !lastPart.includes(",") && !lastPart.includes("/") && !lastPart.includes("x")) { shouldAsk = true; }
                    if (shouldAsk) {
                        const answer = await vscode.window.showInformationMessage("행렬에 빈 공간이 감지되었습니다. 스마트 점(Dots)으로 자동 채우시겠습니까?", "예 (스마트 점)", "아니오 (0으로 채움)");
                        if (answer === "예 (스마트 점)") { userInput += " / fill_dots"; }
                    }
                }
            }
            const parsed = parseUserCommand(userInput, currentOriginalText);
            currentMainCommand = parsed.mainCommand;
            currentParallels = parsed.parallelOptions;
            if (currentMainCommand === 'plot' && parsed.subCommands.includes('3d')) {
                const zDetected = /[^a-zA-Z]z[^a-zA-Z]|^z[^a-zA-Z]|[^a-zA-Z]z$|^z$/.test(currentOriginalText);
                if (zDetected && !currentParallels.some(p => p.includes('complex'))) {
                    const answer = await vscode.window.showInformationMessage("변수 'z'가 감지되었습니다. 복소 평면 시각화(Complex Mode)를 활성화할까요?", "예 (Abs|Phase)", "아니오");
                    if (answer === "예 (Abs|Phase)") {
                        userInput += " / complex=abs_phase";
                        const updatedParsed = parseUserCommand(userInput, currentOriginalText);
                        currentParallels = updatedParsed.parallelOptions;
                        parsed.parallelOptions = updatedParsed.parallelOptions;
                    }
                }
            }
            const config = vscode.workspace.getConfiguration('tex-machina');
            const calcSettings = config.get<any>('calc.settings', {});
            const laplaceConfig = { source: calcSettings.laplaceSource || 't', target: calcSettings.laplaceTarget || 's' };
            const angleUnit = calcSettings.angleUnit || 'deg';
            const datDensity = config.get('plot.datDensity', 500);
            const yMultiplier = config.get('plot.yMultiplier', 5.0);
            const lineColor = config.get('plot.lineColor', 'blue');
            let currentIndentation = "";
            if (editor) {
                const lineText = editor.document.lineAt(editor.selection.active.line).text;
                const match = lineText.match(/^(\s*)/);
                if (match) { currentIndentation = match[1]; }
            }
            const payload = { ...parsed, config: { laplace: laplaceConfig, angleUnit: angleUnit, precision: calcSettings.precision, imaginaryUnit: calcSettings.imaginaryUnit, simplifyResult: calcSettings.simplifyResult, datDensity: datDensity, yMultiplier: yMultiplier, lineColor: lineColor, indentation: currentIndentation, workspaceDir: path.dirname(editor.document.uri.fsPath) } };
            pythonService.send(payload);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.rerenderPlot', async (exprLatex: string, samples: string, options?: any) => {
        let userInput = `plot > 3d / samples=${samples}`;
        if (options) {
            if (options.x) {userInput += ` / x=${options.x}`;}
            if (options.y) {userInput += ` / y=${options.y}`;}
            if (options.z) {userInput += ` / z=${options.z}`;}
            if (options.scheme) {userInput += ` / scheme=${options.scheme}`;}
            if (options.color) {userInput += ` / color=${options.color}`;}
            if (options.scheme === 'preset' && options.preset) { userInput += ` / preset=${options.preset}`; }
            else if ((options.scheme === 'custom' || options.scheme === 'height' || options.scheme === 'gradient') && options.stops) { userInput += ` / stops=${options.stops}`; }
            if (options.label) {userInput += ` / label=${options.label}`;}
            if (options.bg) {userInput += ` / bg=${options.bg}`;}
            if (options.complex) {userInput += ` / complex=${options.complex}`;}
            if (options.axis) {userInput += ` / axis=${options.axis}`;}
        }
        const parsed = parseUserCommand(userInput, exprLatex);
        currentMainCommand = parsed.mainCommand;
        currentParallels = parsed.parallelOptions;
        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = { ...parsed, config: { angleUnit: config.get('angleUnit', 'deg'), datDensity: config.get('plot.datDensity', 500), workspaceDir: currentEditor ? path.dirname(currentEditor.document.uri.fsPath) : undefined } };
        pythonService.send(payload);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.export3dPlot', async (exprLatex: string, samples: string, color: string, options?: any) => {
        if (!currentEditor) {return;}
        const fmt = (options && options.export) || 'pdf';
        const answer = await vscode.window.showInformationMessage(`현재 3D 그래프를 ${fmt.toUpperCase()}로 저장하고 Figure를 삽입하시겠습니까?`, "예 (images 폴더 생성 및 저장)", "아니오");
        if (answer !== "예 (images 폴더 생성 및 저장)") {return;}
        isExportingPdf = true;
        pdfTargetDir = path.dirname(currentEditor.document.uri.fsPath);
        let userInput = `plot > 3d / samples=${samples}`;
        if (options) {
            if (options.x) {userInput += ` / x=${options.x}`;}
            if (options.y) {userInput += ` / y=${options.y}`;}
            if (options.z) {userInput += ` / z=${options.z}`;}
            if (options.scheme) {userInput += ` / scheme=${options.scheme}`;}
            if (options.scheme === 'uniform') { userInput += ` / color=${color}`; }
            else if (options.scheme === 'preset' && options.preset) { userInput += ` / preset=${options.preset}`; }
            else if ((options.scheme === 'custom' || options.scheme === 'height' || options.scheme === 'gradient') && options.stops) { userInput += ` / stops=${options.stops}`; }
            else { userInput += ` / color=${color}`; }
            if (options.label) {userInput += ` / label=${options.label}`;}
            if (options.bg) {userInput += ` / bg=${options.bg}`;}
            if (options.complex) {userInput += ` / complex=${options.complex}`;}
            if (options.axis) {userInput += ` / axis=${options.axis}`;}
            if (options.export) {userInput += ` / export=${options.export}`;}
            else {userInput += ` / export`;}
        } else { userInput += ` / color=${color} / export`; }
        const parsed = parseUserCommand(userInput, exprLatex);
        const config = vscode.workspace.getConfiguration('tex-machina');
        const payload = { ...parsed, config: { angleUnit: config.get('angleUnit', 'deg'), datDensity: config.get('plot.datDensity', 500), workspaceDir: currentEditor ? path.dirname(currentEditor.document.uri.fsPath) : undefined } };
        pythonService.send(payload);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.internalSaveWebviewImage', async (buffer: Buffer, format: string, expr: string) => {
        if (!currentEditor) {return;}
        const targetDir = path.dirname(currentEditor.document.uri.fsPath);
        const imagesDir = path.join(targetDir, 'images');
        const ext = format || 'png';
        const timestamp = new Date().getTime();
        const filename = `plot_3d_${timestamp}.${ext}`;
        const exportPath = path.join(imagesDir, filename);
        try {
            await fsPromises.mkdir(imagesDir, { recursive: true });
            await fsPromises.writeFile(exportPath, buffer);
            const figureCode = `\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{images/${filename}}\n\\caption{3D Plot of $${expr}$}\n\\label{fig:plot_3d_${timestamp}}\n\\end{figure}\n`;
            await currentEditor.edit(editBuilder => {
                if (currentSelection) { editBuilder.replace(currentSelection, figureCode); }
                else { editBuilder.insert(currentEditor!.selection.end, figureCode); }
            });
            vscode.window.showInformationMessage(`웹뷰 화면이 ${ext.toUpperCase()}로 저장되고 Figure가 삽입되었습니다: images/${filename}`);
        } catch (err: any) { vscode.window.showErrorMessage(`저장 실패: ${err.message}`); }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.addContextShortcut', async () => {
        const presets = [
            { label: "코드 블록 (verbatim)", detail: "verbatim 환경 내부를 감지합니다.", name: "code", regex: "\\\\begin{verbatim}[\\s\\S]*?\\\\end{verbatim}", scope: "around" },
            { label: "문서 서문 (preamble)", detail: "\\documentclass 가 있는 줄을 감지합니다.", name: "preamble", regex: "^\\\\documentclass", scope: "line" },
            { label: "수식 번호 (tag)", detail: "\\tag{...} 가 있는 줄을 감지합니다.", name: "tag", regex: "\\\\tag\\{.*?\\}", scope: "line" },
            { label: "커스텀 환경 (myEnv)", detail: "\\begin{myEnv} 환경 내부를 감지합니다.", name: "myEnv", regex: "\\\\begin{myEnv}[\\s\\S]*?\\\\end{myEnv}", scope: "around" }
        ];
        const selected = await vscode.window.showQuickPick(presets, { placeHolder: "추가할 매크로 컨텍스트를 선택하세요." });
        if (selected) {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const currentContexts = config.get<any[]>('macros.customContexts', []);
            if (currentContexts.some(c => c.name === selected.name)) { vscode.window.showWarningMessage(`이미 '${selected.name}' 컨텍스트가 등록되어 있습니다.`); return; }
            const newContext = { name: selected.name, regex: selected.regex, scope: selected.scope };
            await config.update('macros.customContexts', [...currentContexts, newContext], vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`'${selected.name}' 컨텍스트가 설정에 추가되었습니다. 이제 ';매크로:${selected.name}' 를 사용할 수 있습니다.`);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('tex-machina.labelVisualization.settings')) { vscode.commands.executeCommand('tex-machina.discoverLabels'); }
    }));
}

async function handlePythonResponse(response: any, provider: TeXMachinaWebviewProvider) {
    try {
        if (response.status === 'oeis_results') {
            const selected = await vscode.window.showQuickPick(response.results as vscode.QuickPickItem[], { placeHolder: `'${response.query}' 검색 결과 (15개까지 표시)` });
            if (selected) {
                const s = selected as any;
                const options = [ { label: "ID만 삽입", detail: s.id, value: s.id }, { label: "수열 데이터 삽입", detail: s.data, value: s.data }, { label: "ID와 이름 삽입", detail: `${s.id}: ${s.full_name}`, value: `${s.id}: ${s.full_name}` } ];
                const insertType = await vscode.window.showQuickPick(options, { placeHolder: "어떤 형식으로 삽입할까요?" }) as any;
                if (insertType && currentEditor) { await currentEditor.edit(editBuilder => { editBuilder.insert(currentEditor!.selection.active, insertType.value); }); }
            }
            return;
        }
        if (response.status === 'search_results') {
            const selected = await vscode.window.showQuickPick(response.results, { placeHolder: "인용할 논문을 선택하세요" });
            if (selected && (selected as any).doi) {
                const payload = { mainCommand: "cite", subCommands: [(selected as any).doi], parallelOptions: [], rawSelection: "", config: {} };
                pythonService.send(payload);
            }
            return;
        }
        if (response.status === 'success') {
            if (response.mainCommand === 'labels' && response.nodes) {
                const nodesJson = JSON.stringify(response.nodes);
                const edgesJson = JSON.stringify(response.edges);
                if (nodesJson !== JSON.stringify(lastLabelNodes) || edgesJson !== JSON.stringify(lastLabelEdges)) {
                    lastLabelNodes = response.nodes;
                    lastLabelEdges = response.edges;
                    provider.updateLabels(response.nodes, response.edges);
                }
                return;
            }
            if (response.bibtex && response.cite_key) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const texDir = path.dirname(editor.document.uri.fsPath);
                    const files = await fsPromises.readdir(texDir);
                    let bibFile = files.find(f => f.endsWith('.bib')) || 'references.bib';
                    const bibPath = path.join(texDir, bibFile);
                    let content = "";
                    try {
                        content = await fsPromises.readFile(bibPath, 'utf8');
                    } catch (err) {}
                    if (!content.includes(response.cite_key)) {
                        await fsPromises.appendFile(bibPath, `\n\n${response.bibtex}`);
                        vscode.window.showInformationMessage(`BibTeX이 ${bibFile}에 추가되었습니다.`);
                    } else { vscode.window.showInformationMessage(`이미 존재하는 인용 키입니다: ${response.cite_key}`); }
                    await editor.edit(editBuilder => { editBuilder.insert(editor.selection.active, `\\cite{${response.cite_key}}`); });
                }
                return;
            }
            const shouldShowWebview = currentMainCommand === 'plot';
            provider.updatePreview(response.latex, response.vars, response.analysis, response.x3d_data, response.warning, response.preview_img, response.expr_latex, shouldShowWebview);
            const isRerender = currentParallels.some(p => p.startsWith('samples=') || p.startsWith('x=') || p.startsWith('scheme='));
            if (currentEditor && currentSelection) {
                if (isExportingPdf && response.export_content) {
                    const exportBuffer = Buffer.from(response.export_content, 'base64');
                    const imagesDir = path.join(pdfTargetDir, 'images');
                    const ext = response.export_format || 'pdf';
                    const filename = `plot_3d.${ext}`;
                    const exportPath = path.join(imagesDir, filename);
                    try {
                        await fsPromises.mkdir(imagesDir, { recursive: true });
                        await fsPromises.writeFile(exportPath, exportBuffer);
                        const figureCode = `\\begin{figure}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{images/${filename}}\n\\caption{3D Plot of $${response.x3d_data.expr}$}\n\\label{fig:plot_3d}\n\\end{figure}\n`;
                        await currentEditor.edit(editBuilder => { editBuilder.replace(currentSelection!, figureCode); });                                    
                        vscode.window.showInformationMessage(`그래프가 ${ext.toUpperCase()}로 저장되고 Figure가 삽입되었습니다: images/${filename}`);
                    } catch (err: any) { vscode.window.showErrorMessage(`저장 실패: ${err.message}`); } finally { isExportingPdf = false; }
                    return;
                }
                if (!isRerender) {
                    const resultLatex = response.latex;
                    let outputText = "";
                    if (response.dat_content) {
                        const texDir = path.dirname(currentEditor.document.uri.fsPath);
                        const dataDir = path.join(texDir, 'data');
                        const datFilename = response.dat_filename || 'plot_data.dat';
                        const datPath = path.join(dataDir, datFilename);
                        try { 
                            await fsPromises.mkdir(dataDir, { recursive: true }); 
                            await fsPromises.writeFile(datPath, response.dat_content); 
                        } catch (err: any) { vscode.window.showErrorMessage(`파일 저장 실패: ${err.message}`); }
                    }
                    if (currentMainCommand === "matrix") { outputText = resultLatex; }
                    else if (currentMainCommand === "plot") { outputText = response.latex.includes("tikzpicture") ? resultLatex : currentOriginalText; }
                    else if (currentParallels.includes("newline")) { outputText = `${currentOriginalText}\n\n\\[\n${resultLatex}\n\\]`; }
                    else { outputText = `${currentOriginalText} = ${resultLatex}`; }
                    if (currentMainCommand !== "plot" || (currentMainCommand === "plot" && response.latex.includes("tikzpicture"))) {
                        await currentEditor.edit(editBuilder => { editBuilder.replace(currentSelection!, outputText); });
                    }
                }
            }
            if (response.warning) { vscode.window.showWarningMessage(response.warning); }
        } else if (response.status === 'error') {
            vscode.window.showErrorMessage(`연산 실패: ${response.message}`);
            isExportingPdf = false;
        }
    } catch (e) { console.error("결과 처리 중 오류:", e); }
}

export async function deactivate() {
    await deactivateToggleMode();
    if (pythonService) {
        pythonService.stop();
    }
}
