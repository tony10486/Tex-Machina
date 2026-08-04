import * as vscode from 'vscode';
import { findInnermostEnvAtPos, splitTopLevel } from './latexParser';

export function registerMatrixResizer(context: vscode.ExtensionContext) {
    // 1. Code Action Provider (Ctrl+.)
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider('latex', new MatrixCodeActionProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.Refactor]
    }));

    // 2. Commands
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.matrix.resizeMenu', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}
        const math = findInnermostEnvAtPos(editor.document, editor.selection.active);
        if (!math || !isMatrixLike(math.envName || '')) {
            vscode.window.showInformationMessage("커서가 행렬 환경 내부에 있지 않습니다.");
            return;
        }
        
        const items = [
            { label: "➕ 행 추가 (Add Row)", action: 'addRow' },
            { label: "➖ 행 삭제 (Remove Row)", action: 'removeRow' },
            { label: "➕ 열 추가 (Add Col)", action: 'addCol' },
            { label: "➖ 열 삭제 (Remove Col)", action: 'removeCol' }
        ];

        const selected = await vscode.window.showQuickPick(items, { placeHolder: `Matrix Resizer (${math.envName})` });
        if (selected) {
            await modifyMatrix(math.range, selected.action as any);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.matrix.addRow', async (args: { range: vscode.Range }) => {
        await modifyMatrix(args.range, 'addRow');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.matrix.removeRow', async (args: { range: vscode.Range }) => {
        await modifyMatrix(args.range, 'removeRow');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.matrix.addCol', async (args: { range: vscode.Range }) => {
        await modifyMatrix(args.range, 'addCol');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tex-machina.matrix.removeCol', async (args: { range: vscode.Range }) => {
        await modifyMatrix(args.range, 'removeCol');
    }));
}

class MatrixCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] | null {
        const math = findInnermostEnvAtPos(document, range.start);
        if (!math || !isMatrixLike(math.envName || '')) {return null;}

        const actions: vscode.CodeAction[] = [];
        
        const createAction = (title: string, cmd: string) => {
            const action = new vscode.CodeAction(title, vscode.CodeActionKind.Refactor);
            action.command = { command: cmd, title: title, arguments: [{ range: math.range }] };
            return action;
        };

        actions.push(createAction('➕ 행 추가 (Add Row)', 'tex-machina.matrix.addRow'));
        actions.push(createAction('➖ 행 삭제 (Remove Row)', 'tex-machina.matrix.removeRow'));
        actions.push(createAction('➕ 열 추가 (Add Col)', 'tex-machina.matrix.addCol'));
        actions.push(createAction('➖ 열 삭제 (Remove Col)', 'tex-machina.matrix.removeCol'));

        return actions;
    }
}

function isMatrixLike(env: string): boolean {
    const matrixEnvs = [
        'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 
        'cases', 'align', 'gather', 'split', 'array', 'smallmatrix', 'subarray',
        'multline', 'flalign', 'alignat'
    ];
    return matrixEnvs.includes(env.replace(/\*$/, ''));
}

function getIndentation(editor: vscode.TextEditor): string {
    const tabSize = Number(editor.options.tabSize) || 4;
    const insertSpaces = editor.options.insertSpaces;
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

async function modifyMatrix(range: vscode.Range, action: 'addRow' | 'removeRow' | 'addCol' | 'removeCol') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const text = editor.document.getText(range);
    // Support optional arguments like [c] or {ccc} for environments like array
    const envMatch = text.match(/^(\\begin\{([a-zA-Z]+\*?)\}(?:\[[^\]]*\]|\{[^\}]*\})*)([\s\S]*?)(\\end\{\2\})$/);
    if (!envMatch) {return;}

    const startTag = envMatch[1];
    const content = envMatch[3];
    const endTag = envMatch[4];

    // Split rows safely
    let rawRows = splitTopLevel(content, '\\\\');
    
    // Clean rows: remove the trailing empty string if the content ended with \\
    let rows = rawRows.map(r => r.trim()).filter((r, i) => r !== '' || i < rawRows.length - 1);

    // Parse cols to handle asymmetric matrices
    let parsedRows = rows.map(r => splitTopLevel(r, '&'));
    let maxCols = parsedRows.reduce((max, cols) => Math.max(max, cols.length), 1);

    // Pad missing '&'
    parsedRows = parsedRows.map(cols => {
        while (cols.length < maxCols) {
            cols.push(' ');
        }
        return cols;
    });

    if (action === 'addRow') {
        const newRow = new Array(maxCols).fill(' ');
        parsedRows.push(newRow);
    } else if (action === 'removeRow') {
        if (parsedRows.length > 1) {parsedRows.pop();}
    } else if (action === 'addCol') {
        parsedRows = parsedRows.map(cols => {
            cols.push(' ');
            return cols;
        });
    } else if (action === 'removeCol') {
        parsedRows = parsedRows.map(cols => {
            if (cols.length > 1) {
                cols.pop();
            }
            return cols;
        });
    }

    // Join back
    rows = parsedRows.map(cols => cols.join(' & '));

    // Reconstruct with consistent formatting (always end rows with \\ for clarity)
    const indent = getIndentation(editor);
    let newContent = `\n${indent}` + rows.join(` \\\\\n${indent}`) + ` \\\\\n`;
    const result = `${startTag}${newContent}${endTag}`;

    await editor.edit(editBuilder => {
        editBuilder.replace(range, result);
    });
}
