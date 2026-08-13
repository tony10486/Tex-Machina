import * as vscode from 'vscode';
import {
    loadPasteConfig,
    parseClipboardData,
    detectColumnAlignment,
    applyAlignmentMode,
    detectHeader,
    generateMatrixLatex,
    generateTabularLatex,
    buildPreview,
} from './pasteExternalData';
import { findInnermostEnvAtPos, MathEnvironment } from './latexParser';

const PASTE_KIND_MATRIX = vscode.DocumentDropOrPasteEditKind.Empty.append('latex', 'matrix');
const PASTE_KIND_TABULAR = vscode.DocumentDropOrPasteEditKind.Empty.append('latex', 'tabular');

export class PasteExternalDataProvider implements vscode.DocumentPasteEditProvider {

    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        _context: vscode.DocumentPasteEditContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        const text = await getClipboardText(dataTransfer);
        if (!text || !text.trim()) { return undefined; }

        const cfg = loadPasteConfig();
        if (!cfg.enabled) { return undefined; }

        const rows = parseClipboardData(text);
        if (!rows || rows.length === 0) { return undefined; }

        // Only offer LaTeX paste if the data looks like table data
        const looksLikeTable = rows.length > 1 || rows[0].length > 1 ||
            (cfg.recognizeTSV && text.includes('\t')) ||
            (cfg.recognizeCSV && text.includes(',')) ||
            (cfg.recognizeSemicolon && text.includes(';'));
        if (!looksLikeTable) { return undefined; }

        const position = ranges[0].start;
        const env = findInnermostEnvAtPos(document, position);
        const isInsideMath = !!env && isMathEnvironment(env);

        const edits: vscode.DocumentPasteEdit[] = [];

        const mode = cfg.defaultMode === 'auto'
            ? (isInsideMath ? 'matrix' : 'tabular')
            : cfg.defaultMode;

        const indent = getIndentation(document, position);

        if (mode === 'matrix' || cfg.alwaysAskMode) {
            const matrixEnv = cfg.matrixType;
            const matrixLatex = generateMatrixLatex(rows, matrixEnv, indent, cfg.escapeMode);
            const matrixEdit = new vscode.DocumentPasteEdit(matrixLatex, `Paste as LaTeX Matrix (${matrixEnv})`, PASTE_KIND_MATRIX);
            edits.push(matrixEdit);
        }

        if (mode === 'tabular' || cfg.alwaysAskMode) {
            const rawAlignments = detectColumnAlignment(rows);
            const alignments = applyAlignmentMode(rawAlignments, cfg.alignmentMode);
            const hasHeader = cfg.hasHeader === 'auto' ? detectHeader(rows) : (cfg.hasHeader === 'true');
            const tabularLatex = generateTabularLatex(
                rows,
                alignments,
                cfg.tabularStyle,
                cfg.hasBorders,
                hasHeader,
                indent,
                cfg.escapeMode
            );
            const styleLabel = cfg.tabularStyle === 'booktabs' ? 'Booktabs' : 'Array';
            const tabularEdit = new vscode.DocumentPasteEdit(tabularLatex, `Paste as LaTeX Tabular (${styleLabel})`, PASTE_KIND_TABULAR);
            edits.push(tabularEdit);
        }

        return edits;
    }
}

/**
 * Force paste as Matrix command (keybinding or command palette).
 */
export async function forcePasteAsMatrix() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const text = await vscode.env.clipboard.readText();
    const rows = parseClipboardData(text);
    if (!rows || rows.length === 0) {
        vscode.window.showWarningMessage('클립보드에 변환할 표/행렬 데이터가 없습니다.');
        return;
    }

    const cfg = loadPasteConfig();
    const matrixOptions = [
        'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 'matrix'
    ];
    const selected = await vscode.window.showQuickPick(matrixOptions, {
        placeHolder: '삽입할 행렬 환경을 선택하세요.',
    });
    if (!selected) { return; }

    const indent = getIndentation(editor.document, editor.selection.active);
    const latex = generateMatrixLatex(rows, selected, indent, cfg.escapeMode);
    await editor.edit(eb => eb.replace(editor.selection, latex));
}

/**
 * Force paste as Tabular command (keybinding or command palette).
 */
export async function forcePasteAsTabular() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const text = await vscode.env.clipboard.readText();
    const rows = parseClipboardData(text);
    if (!rows || rows.length === 0) {
        vscode.window.showWarningMessage('클립보드에 변환할 표/행렬 데이터가 없습니다.');
        return;
    }

    const cfg = loadPasteConfig();
    const rawAlignments = detectColumnAlignment(rows);
    const alignments = applyAlignmentMode(rawAlignments, cfg.alignmentMode);
    const hasHeader = cfg.hasHeader === 'auto' ? detectHeader(rows) : (cfg.hasHeader === 'true');
    const indent = getIndentation(editor.document, editor.selection.active);
    const latex = generateTabularLatex(
        rows,
        alignments,
        cfg.tabularStyle,
        cfg.hasBorders,
        hasHeader,
        indent,
        cfg.escapeMode
    );
    await editor.edit(eb => eb.replace(editor.selection, latex));
}

interface ConfirmPickItem extends vscode.QuickPickItem {
    value: string;
}

/**
 * Smart paste command that mimics auto-prompt behavior with QuickPick.
 */
export async function smartPasteExternalData() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const text = await vscode.env.clipboard.readText();
    let rows = parseClipboardData(text);
    if (!rows || rows.length === 0) {
        // Fall back to normal paste
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        return;
    }

    // If data parsed as a single column but has multiple rows, the delimiter might be missing/ambiguous.
    // Prompt user to select a delimiter.
    if (rows.length > 1 && rows[0].length === 1 && !text.includes('\t') && !text.includes(',')) {
        const delimiterPick = await vscode.window.showQuickPick([
            { label: '\\t  Tab (엑셀/시트 기본)', value: '\t' },
            { label: ',   Comma (CSV)', value: ',' },
            { label: ';   Semicolon', value: ';' },
            { label: '(공백) Space (고정폭 데이터)', value: ' ' },
            { label: '(연속공백) Multi-space (Regex)', value: '\\s+' },
            { label: '$(x) 그냥 일반 붙여넣기', value: 'cancel' },
        ], { placeHolder: '구분자가 감지되지 않았습니다. 데이터의 구분자를 선택하세요.' });

        if (!delimiterPick || delimiterPick.value === 'cancel') {
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            return;
        }
        rows = parseClipboardData(text, delimiterPick.value);
    }

    const cfg = loadPasteConfig();
    const env = findInnermostEnvAtPos(editor.document, editor.selection.active);
    const isInsideMath = !!env && isMathEnvironment(env);

    let mode: 'matrix' | 'tabular' = cfg.defaultMode === 'auto'
        ? (isInsideMath ? 'matrix' : 'tabular')
        : cfg.defaultMode as 'matrix' | 'tabular';

    let selectedMatrixEnv = cfg.matrixType;
    let selectedTabularStyle = cfg.tabularStyle;

    if (cfg.alwaysAskMode) {
        const options: (vscode.QuickPickItem & { mode: 'matrix' | 'tabular', style: string })[] = [
            { label: 'tabular (Array)', description: '기본 텍스트 표', mode: 'tabular', style: 'array' },
            { label: 'tabular (Booktabs)', description: '깔끔한 텍스트 표', mode: 'tabular', style: 'booktabs' },
            { label: 'bmatrix', description: '[] 행렬', mode: 'matrix', style: 'bmatrix' },
            { label: 'pmatrix', description: '() 행렬', mode: 'matrix', style: 'pmatrix' },
            { label: 'vmatrix', description: '|| 행렬', mode: 'matrix', style: 'vmatrix' },
            { label: 'matrix', description: '테두리 없는 행렬', mode: 'matrix', style: 'matrix' },
        ];
        
        const pick = await vscode.window.showQuickPick(options, { placeHolder: '붙여넣기 스타일을 선택하세요.' });
        if (!pick) { return; }
        
        mode = pick.mode;
        if (mode === 'matrix') {
            selectedMatrixEnv = pick.style;
        } else {
            selectedTabularStyle = pick.style as 'array' | 'booktabs';
        }
    }

    const indent = getIndentation(editor.document, editor.selection.active);

    if (mode === 'matrix') {
        const latex = generateMatrixLatex(rows, selectedMatrixEnv, indent, cfg.escapeMode);
        if (cfg.showPreview) {
            const preview = buildPreview(rows);
            const confirm = await vscode.window.showQuickPick<ConfirmPickItem>(
                [
                    { label: `$(check) 삽입 (${selectedMatrixEnv})`, description: 'LaTeX 코드를 에디터에 삽입합니다.', value: 'insert' },
                    { label: `$(copy) 미리보기`, description: preview.replace(/\n/g, ' | '), value: 'preview' },
                    { label: `$(x) 취소`, description: '취소합니다.', value: 'cancel' },
                ],
                { placeHolder: `미리보기 (처음 3행):\n${preview}` }
            );
            if (confirm?.value !== 'insert') { return; }
        }
        await editor.edit(eb => eb.replace(editor.selection, latex));
    } else {
        const rawAlignments = detectColumnAlignment(rows);
        const alignments = applyAlignmentMode(rawAlignments, cfg.alignmentMode);
        const hasHeader = cfg.hasHeader === 'auto' ? detectHeader(rows) : (cfg.hasHeader === 'true');
        const latex = generateTabularLatex(
            rows,
            alignments,
            selectedTabularStyle,
            cfg.hasBorders,
            hasHeader,
            indent,
            cfg.escapeMode
        );
        if (cfg.showPreview) {
            const preview = buildPreview(rows);
            const confirm = await vscode.window.showQuickPick<ConfirmPickItem>(
                [
                    { label: `$(check) 삽입 (${selectedTabularStyle})`, description: 'LaTeX 코드를 에디터에 삽입합니다.', value: 'insert' },
                    { label: `$(copy) 미리보기`, description: preview.replace(/\n/g, ' | '), value: 'preview' },
                    { label: `$(x) 취소`, description: '취소합니다.', value: 'cancel' },
                ],
                { placeHolder: `미리보기 (처음 3행):\n${preview}` }
            );
            if (confirm?.value !== 'insert') { return; }
        }
        await editor.edit(eb => eb.replace(editor.selection, latex));
    }
}

function isMathEnvironment(env: MathEnvironment): boolean {
    const mathNames = [
        'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
        'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*',
        'displaymath',
    ];
    if (env.type === 'inline' || env.type === 'display') { return true; }
    if (env.envName && mathNames.includes(env.envName.replace(/\s*\*\s*$/, '*').replace(/\s+/g, ''))) {
        return true;
    }
    return false;
}

function getIndentation(document: vscode.TextDocument, position: vscode.Position): string {
    const lineText = document.lineAt(position.line).text;
    const match = lineText.match(/^(\s*)/);
    return match ? match[1] : '';
}

async function getClipboardText(dataTransfer: vscode.DataTransfer): Promise<string | undefined> {
    const cfg = loadPasteConfig();

    // Try text/html first if enabled (Excel, Google Sheets often provide this)
    if (cfg.recognizeHTMLTable) {
        const htmlItem = dataTransfer.get('text/html');
        if (htmlItem) {
            const html = await htmlItem.asString();
            if (html) {
                const tableText = extractTextFromHtmlTable(html);
                if (tableText) { return tableText; }
            }
        }
    }

    const textItem = dataTransfer.get('text/plain');
    if (textItem) {
        return await textItem.asString();
    }

    return undefined;
}

function extractTextFromHtmlTable(html: string): string | undefined {
    // Very lightweight HTML table parser using regex for Excel/Google Sheets copy formats
    const rows: string[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            // Strip inner HTML tags
            let text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
            cells.push(text);
        }
        if (cells.length > 0) {
            rows.push(cells.join('\t'));
        }
    }
    if (rows.length > 0) {
        return rows.join('\n');
    }
    return undefined;
}
