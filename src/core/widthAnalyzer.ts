import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

// Initialize MathJax components
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'none' });
const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

export interface AnalysisResult {
    documentWidthPt: number;
    formulas: {
        formula: string;
        line: number;
        widthPt: number;
        isExceeding: boolean;
    }[];
    timestamp: number;
}

/**
 * Calculates formula width using MathJax.
 * 1 pt = 1/72.27 inch. MathJax ex is relative to the font.
 */
function getFormulaWidthPt(formula: string, baseFontSizePt: number = 10): number {
    try {
        // TeX to SVG conversion
        const node = html.convert(formula, { display: true });
        const svgTag = adaptor.firstChild(node);
        if (!svgTag || adaptor.kind(svgTag) !== 'element') { return 0; }
        
        // Get width in ex from SVG
        const widthStr = adaptor.getAttribute(svgTag as any, 'width');
        if (!widthStr) { return 0; }
        
        const widthValue = parseFloat(widthStr.replace(/[a-z]/g, ''));
        const unit = widthStr.replace(/[\d\.]/g, '');
        
        // MathJax's 'ex' and 'em' units:
        // By default, MathJax assumes 1ex ≈ 0.442em
        // and 1em = base font size in pt.
        let widthPt = 0;
        if (unit === 'ex') {
            widthPt = widthValue * (baseFontSizePt * 0.442);
        } else if (unit === 'em') {
            widthPt = widthValue * baseFontSizePt;
        } else {
            // Fallback for other units or no unit
            widthPt = widthValue * (baseFontSizePt * 0.45);
        }
        
        return widthPt;
    } catch (e) {
        console.error("MathJax conversion error:", e);
        return 0;
    }
}

/**
 * Static Analysis: Try to find textwidth and font size from preamble.
 */
function staticAnalysis(text: string): { width: number, fontSize: number } {
    let width = 345; // Default for 10pt article on A4
    let fontSize = 10;
    
    // 1. Detect Font Size
    const docClassMatch = text.match(/\\documentclass\[([^\]]+)\]/);
    if (docClassMatch) {
        const options = docClassMatch[1];
        if (options.includes('11pt')) { fontSize = 11; width = 360; }
        else if (options.includes('12pt')) { fontSize = 12; width = 390; }
        
        if (options.includes('a4paper')) { /* A4 is default in many contexts, handled by initial width */ }
        else if (options.includes('letterpaper')) { width -= 5; }
    }
    
    // 2. Look for geometry package (overrides defaults)
    const geometryMatch = text.match(/\\usepackage\[([^\]]+)\]\{geometry\}/) || text.match(/\\geometry\{([^}]+)\}/);
    if (geometryMatch) {
        const params = geometryMatch[1];
        const textWidthMatch = params.match(/textwidth=([\d\.]+)(\w+)/) || params.match(/width=([\d\.]+)(\w+)/);
        if (textWidthMatch) {
            const val = parseFloat(textWidthMatch[1]);
            const unit = textWidthMatch[2];
            if (unit === 'pt') { width = val; }
            else if (unit === 'mm') { width = val * 2.84527; }
            else if (unit === 'cm') { width = val * 28.4527; }
            else if (unit === 'in') { width = val * 72.27; }
        }
    }
    
    // 3. Look for explicit \setlength{\textwidth}{...}
    const setLengthMatch = text.match(/\\setlength\{\\textwidth\}\{([\d\.]+)(\w+)\}/);
    if (setLengthMatch) {
        const val = parseFloat(setLengthMatch[1]);
        const unit = setLengthMatch[2];
        if (unit === 'pt') { width = val; }
        else if (unit === 'mm') { width = val * 2.84527; }
        else if (unit === 'cm') { width = val * 28.4527; }
        else if (unit === 'in') { width = val * 72.27; }
    }
    
    return { width, fontSize };
}

/**
 * Dynamic Analysis: Use pdflatex to get actual \textwidth and \f@size.
 */
function dynamicAnalysis(preamble: string, workspaceDir: string): { width: number, fontSize: number } {
    const tempFile = path.join(workspaceDir, '_width_check_temp.tex');
    const content = `
${preamble}
\\begin{document}
\\makeatletter
\\typeout{WIDTH_RESULT=\\the\\textwidth}
\\typeout{FONT_SIZE_RESULT=\\f@size pt}
\\makeatother
\\end{document}
`;
    fs.writeFileSync(tempFile, content);
    
    try {
        const res = spawnSync('pdflatex', ['-interaction=nonstopmode', tempFile], { 
            cwd: workspaceDir,
            timeout: 10000 
        });
        
        const output = res.stdout.toString();
        const mWidth = output.match(/WIDTH_RESULT=([\d\.]+)pt/);
        const mSize = output.match(/FONT_SIZE_RESULT=([\d\.]+)pt/);
        
        // Clean up temp files
        const base = path.join(workspaceDir, '_width_check_temp');
        ['.tex', '.aux', '.log', '.pdf'].forEach(ext => {
            const f = base + ext;
            if (fs.existsSync(f)) { fs.unlinkSync(f); }
        });
        
        if (mWidth) {
            return {
                width: parseFloat(mWidth[1]),
                fontSize: mSize ? parseFloat(mSize[1]) : 10
            };
        }
    } catch (e) {
        console.error("Dynamic analysis failed", e);
    }
    
    return { width: 0, fontSize: 10 }; 
}

export async function performWidthAnalysis(document: vscode.TextDocument) {
    const text = document.getText();
    const workspaceDir = path.dirname(document.uri.fsPath);
    const fileName = path.basename(document.uri.fsPath, '.tex');
    
    // 1. Get Cache folder
    const cacheDir = path.join(workspaceDir, '.tex-machina-cache');
    if (!fs.existsSync(cacheDir)) {
        const answer = await vscode.window.showInformationMessage(
            "분석 데이터를 저장할 캐시 폴더(.tex-machina-cache)를 생성할까요?",
            "예", "아니오"
        );
        if (answer === "예") {
            try {
                fs.mkdirSync(cacheDir, { recursive: true });
            } catch (err: any) {
                vscode.window.showErrorMessage(`캐시 폴더 생성 실패: ${err.message}`);
                return;
            }
        } else {
            vscode.window.showWarningMessage("캐시 폴더 없이 분석을 진행합니다. (매번 새로 계산함)");
        }
    }

    // 2. Check for existing cache (Load if valid)
    if (fs.existsSync(cacheDir)) {
        const cacheFiles = fs.readdirSync(cacheDir)
            .filter(f => f.startsWith(`width_cache_${fileName}_`) && f.endsWith('.json'))
            .sort((a, b) => fs.statSync(path.join(cacheDir, b)).mtime.getTime() - fs.statSync(path.join(cacheDir, a)).mtime.getTime());
        
        if (cacheFiles.length > 0) {
            const latestCachePath = path.join(cacheDir, cacheFiles[0]);
            const cacheStats = fs.statSync(latestCachePath);
            const docStats = fs.statSync(document.uri.fsPath);
            
            // If cache is newer than document, ask to load
            if (cacheStats.mtime > docStats.mtime) {
                const useCache = await vscode.window.showInformationMessage(
                    `최근에 분석한 캐시 파일이 있습니다. (${cacheFiles[0]}) 이 결과를 바로 보시겠습니까?`,
                    "캐시 사용", "새로 분석"
                );
                if (useCache === "캐시 사용") {
                    const cacheContent = JSON.parse(fs.readFileSync(latestCachePath, 'utf8'));
                    reportResults(cacheContent, latestCachePath);
                    return;
                }
            }
        }
    }
    
    // 3. Extract Preamble
    const preambleMatch = text.match(/([\s\S]*?)\\begin\{document\}/);
    const preamble = preambleMatch ? preambleMatch[1] : "\\documentclass{article}";
    
    // 4. Determine text width & font size (Static/Dynamic)
    const staticRes = staticAnalysis(preamble);
    let docWidth = staticRes.width;
    let baseFontSize = staticRes.fontSize;
    
    const dynamicAnswer = await vscode.window.showInformationMessage(
        "분석 방식을 선택하세요. 정밀 분석은 pdflatex를 사용하여 실제 문서 설정을 측정합니다.",
        "정밀 분석(Dynamic)", "기본 분석(Static)"
    );
    
    if (dynamicAnswer === "정밀 분석(Dynamic)") {
        const dRes = dynamicAnalysis(preamble, workspaceDir);
        if (dRes.width > 0) {
            docWidth = dRes.width;
            baseFontSize = dRes.fontSize;
        } else {
            vscode.window.showWarningMessage("pdflatex 분석에 실패하여 정적 분석 값을 사용합니다.");
        }
    } else if (!dynamicAnswer) {
        return; // Canceled
    }
    
    // 5. Extract Formulas
    const formulaRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|split|displaymath|multline|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
    
    const formulas: { formula: string, line: number }[] = [];
    let match;
    while ((match = formulaRegex.exec(text)) !== null) {
        const startLine = document.positionAt(match.index).line + 1;
        formulas.push({ formula: match[0], line: startLine });
    }
    
    // 6. Measure each formula
    const results: AnalysisResult['formulas'] = [];
    formulas.forEach(f => {
        try {
            const width = getFormulaWidthPt(f.formula, baseFontSize);
            results.push({
                formula: f.formula,
                line: f.line,
                widthPt: Math.round(width * 100) / 100,
                isExceeding: width > docWidth
            });
        } catch (e) {
            console.error(`Error measuring formula at line ${f.line}:`, e);
        }
    });
    
    const analysis: AnalysisResult = {
        documentWidthPt: Math.round(docWidth * 100) / 100,
        formulas: results,
        timestamp: Date.now()
    };
    
    // 7. Save Cache
    let cacheFile = "";
    if (fs.existsSync(cacheDir)) {
        const timestampStr = new Date().toISOString().replace(/[:\.]/g, '-').split('T')[0] + "_" + new Date().toLocaleTimeString().replace(/[:\s]/g, '-');
        cacheFile = path.join(cacheDir, `width_cache_${fileName}_${timestampStr}.json`);
        try {
            fs.writeFileSync(cacheFile, JSON.stringify(analysis, null, 2));
        } catch (err: any) {
            vscode.window.showErrorMessage(`캐시 파일 저장 실패: ${err.message}`);
        }
    }
    
    // 8. Report Results
    reportResults(analysis, cacheFile);
}

function reportResults(analysis: AnalysisResult, cacheFile: string) {
    const exceeding = analysis.formulas.filter(r => r.isExceeding);
    const msg = exceeding.length > 0 
        ? `분석 완료: 총 ${analysis.formulas.length}개의 수식 중 ${exceeding.length}개가 문서 너비(${analysis.documentWidthPt}pt)를 초과합니다.`
        : `분석 완료: 모든 수식이 문서 너비(${analysis.documentWidthPt}pt) 이내입니다.`;
    
    const action = exceeding.length > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
    
    const options = ["결과 리스트 보기"];
    if (cacheFile) { options.push("캐시 파일 열기"); }
    
    action(msg, ...options).then(choice => {
        if (choice === "캐시 파일 열기" && cacheFile) {
            vscode.workspace.openTextDocument(cacheFile).then(doc => vscode.window.showTextDocument(doc));
        } else if (choice === "결과 리스트 보기") {
            // Show a quick pick or a virtual document with results
            const items = analysis.formulas.map(f => ({
                label: `Line ${f.line}: ${f.widthPt}pt ${f.isExceeding ? '⚠️ 초과' : '✅ 정상'}`,
                description: f.formula.substring(0, 50) + (f.formula.length > 50 ? '...' : ''),
                detail: `문서 너비: ${analysis.documentWidthPt}pt`,
                line: f.line
            }));
            
            vscode.window.showQuickPick(items, { placeHolder: "확인할 수식을 선택하세요." }).then(selected => {
                if (selected) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const pos = new vscode.Position(selected.line - 1, 0);
                        editor.selection = new vscode.Selection(pos, pos);
                        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    }
                }
            });
        }
    });
}
