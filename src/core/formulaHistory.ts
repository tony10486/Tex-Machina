import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findMathAtPos } from './mathSplitter';

interface HistoryEntry {
    timestamp: number;
    latex: string;
}

const HISTORY_DIR = '.tex-machina/history';
const ID_REGEX = /% @hist:([a-z0-9-]+)/;

export function registerFormulaHistory(context: vscode.ExtensionContext) {
    // 1. Decoration for hiding/fading the ID comment
    const decorationType = vscode.window.createTextEditorDecorationType({
        opacity: '0.3',
        fontStyle: 'italic',
    });

    // 2. CodeLens Provider
    const codeLensProvider = new FormulaHistoryCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('latex', codeLensProvider)
    );

    // 3. Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.showFormulaHistory', async (id: string, range: vscode.Range) => {
            await showHistoryQuickPick(id, range, context);
        })
    );

    // 4. Virtual Document Provider for Diff
    const historyProvider = new (class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(uri: vscode.Uri): string {
            const params = new URLSearchParams(uri.query);
            return params.get('latex') || '';
        }
    })();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('tex-machina-history', historyProvider)
    );

    // 5. Document Change Listener (Capture History)
    let changeTimeout: NodeJS.Timeout | undefined;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'latex') {return;}
            
            if (changeTimeout) {clearTimeout(changeTimeout);}
            changeTimeout = setTimeout(() => {
                captureFormulaHistory(event.document);
            }, 2000); // 2 second debounce
        })
    );

    // 5. Decoration Update
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {updateDecorations(editor, decorationType);}
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                updateDecorations(editor, decorationType);
            }
        })
    );

    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor, decorationType);
    }
}

class FormulaHistoryCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(ID_REGEX);
            if (match) {
                const id = match[1];
                const range = new vscode.Range(i, 0, i, lines[i].length);
                lenses.push(new vscode.CodeLens(range, {
                    title: "$(history) 수식 히스토리 보기",
                    command: "tex-machina.showFormulaHistory",
                    arguments: [id, range]
                }));
            }
        }
        return lenses;
    }
}

function updateDecorations(editor: vscode.TextEditor, decorationType: vscode.TextEditorDecorationType) {
    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(ID_REGEX);
        if (match) {
            const startPos = new vscode.Position(i, match.index!);
            const endPos = new vscode.Position(i, match.index! + match[0].length);
            decorations.push({ range: new vscode.Range(startPos, endPos) });
        }
    }
    editor.setDecorations(decorationType, decorations);
}

async function captureFormulaHistory(document: vscode.TextDocument) {
    const text = document.getText();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) { return; }

    const historyBasePath = path.join(workspaceFolder.uri.fsPath, HISTORY_DIR);
    if (!fs.existsSync(historyBasePath)) {
        fs.mkdirSync(historyBasePath, { recursive: true });
    }

    // Find all math blocks
    const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
    let match;
    
    // Accumulate all edits in a WorkspaceEdit
    const workspaceEdit = new vscode.WorkspaceEdit();
    let hasEdits = false;

    while ((match = mathRegex.exec(text)) !== null) {
        let blockText = match[0];
        const idMatch = blockText.match(ID_REGEX);
        
        if (idMatch) {
            const id = idMatch[1];
            const historyPath = path.join(historyBasePath, `${id}.json`);
            let history: HistoryEntry[] = [];
            
            if (fs.existsSync(historyPath)) {
                try {
                    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                } catch (e) {
                    history = [];
                }
            }

            const lastEntry = history.length > 0 ? history[history.length - 1] : null;
            if (!lastEntry || lastEntry.latex !== blockText) {
                history.push({
                    timestamp: Date.now(),
                    latex: blockText
                });
                if (history.length > 50) { history.shift(); }
                fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
            }
        } else {
            // No ID found, auto-inject one
            const newId = Math.random().toString(36).substring(2, 9);
            const firstLineEnd = blockText.indexOf('\n');
            let newBlockText: string;
            
            if (firstLineEnd !== -1) {
                newBlockText = blockText.substring(0, firstLineEnd) + ` % @hist:${newId}` + blockText.substring(firstLineEnd);
            } else {
                if (blockText.startsWith('$$')) {
                    newBlockText = `$$ % @hist:${newId}\n` + blockText.substring(2, blockText.length - 2).trim() + '\n$$';
                } else {
                    newBlockText = blockText + ` % @hist:${newId}`;
                }
            }

            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + blockText.length);
            
            workspaceEdit.replace(document.uri, new vscode.Range(startPos, endPos), newBlockText);
            hasEdits = true;
        }
    }

    if (hasEdits) {
        await vscode.workspace.applyEdit(workspaceEdit);
    }
}

async function showHistoryQuickPick(id: string, range: vscode.Range, context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {return;}

    const historyPath = path.join(workspaceFolder.uri.fsPath, HISTORY_DIR, `${id}.json`);
    if (!fs.existsSync(historyPath)) {
        vscode.window.showInformationMessage("히스토리가 아직 기록되지 않았습니다.");
        return;
    }

    let history: HistoryEntry[] = [];
    try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
        vscode.window.showErrorMessage("히스토리 파일을 읽는 데 실패했습니다.");
        return;
    }

    const reversedHistory = [...history].reverse();
    const items = reversedHistory.map((entry, index) => {
        const date = new Date(entry.timestamp).toLocaleString();
        const snippet = entry.latex.replace(/% @hist:[a-z0-9-]+/, '').trim().substring(0, 100).replace(/\n/g, ' ');
        return {
            label: `${index === 0 ? "★ " : ""}${date}`,
            description: snippet,
            entry: entry
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "버전을 선택하세요. (현재 버전은 맨 위에 표시됨)"
    });

    if (!selected) {return;}

    const action = await vscode.window.showQuickPick([
        { label: "$(diff) 현재와 비교 (Diff)", value: "diff" },
        { label: "$(history) 이 버전으로 복구 (Restore)", value: "restore" }
    ], { placeHolder: "원하는 작업을 선택하세요" });

    if (!action) {return;}

    if (action.value === "diff") {
        // Find current block text
        const currentText = editor.document.getText();
        const idPattern = new RegExp(`% @hist:${id}`);
        let currentBlockText = "";
        
        const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
        let m;
        while ((m = mathRegex.exec(currentText)) !== null) {
            if (idPattern.test(m[0])) {
                currentBlockText = m[0];
                break;
            }
        }

        const cleanCurrent = currentBlockText.replace(/% @hist:[a-z0-9-]+/, '').trim();
        const cleanHistory = selected.entry.latex.replace(/% @hist:[a-z0-9-]+/, '').trim();

        const currentUri = vscode.Uri.parse(`tex-machina-history:현재버전?latex=${encodeURIComponent(cleanCurrent)}`);
        const historyUri = vscode.Uri.parse(`tex-machina-history:과거버전(${new Date(selected.entry.timestamp).toLocaleString()})?latex=${encodeURIComponent(cleanHistory)}`);

        await vscode.commands.executeCommand('vscode.diff', historyUri, currentUri, `수식 비교: ${id}`);
    } else if (action.value === "restore") {
        const confirm = await vscode.window.showWarningMessage(
            `선택한 버전으로 수식을 복구하시겠습니까?`,
            { modal: true },
            "복구"
        );

        if (confirm === "복구") {
            const currentText = editor.document.getText();
            const idPattern = new RegExp(`% @hist:${id}`);
            let found = false;
            
            const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
            let m;
            while ((m = mathRegex.exec(currentText)) !== null) {
                if (idPattern.test(m[0])) {
                    const start = editor.document.positionAt(m.index);
                    const end = editor.document.positionAt(m.index + m[0].length);
                    
                    await editor.edit(editBuilder => {
                        editBuilder.replace(new vscode.Range(start, end), selected.entry.latex);
                    });
                    found = true;
                    break;
                }
            }
            if (!found) {
                vscode.window.showErrorMessage("문서에서 해당 수식을 찾을 수 없습니다.");
            }
        }
    }
}
