import * as vscode from 'vscode';

export const unusedLabelDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.4',
    fontStyle: 'italic',
    after: {
        contentText: ' [unused]',
        color: '#888888',
        margin: '0 0 0 1em',
        fontStyle: 'normal'
    }
});

export function findLabels(text: string, document: vscode.TextDocument): { label: string, range: vscode.Range }[] {
    const labels: { label: string, range: vscode.Range }[] = [];
    const labelRegex = /\\label\{([^}]+)\}/g;
    let match;

    while ((match = labelRegex.exec(text)) !== null) {
        const labelName = match[1];
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        labels.push({
            label: labelName,
            range: new vscode.Range(startPos, endPos)
        });
    }

    return labels;
}

export function findReferences(text: string): Set<string> {
    const references = new Set<string>();
    // Commonly used LaTeX referencing and citation commands
    const refRegex = /\\(?:ref|cite|eqref|cref|Cref|autocite|textcite|nocite|pageref)\{([^}]+)\}/g;
    let match;

    while ((match = refRegex.exec(text)) !== null) {
        const keys = match[1].split(',').map(key => key.trim());
        keys.forEach(key => references.add(key));
    }

    return references;
}

export async function getUnusedLabels(document: vscode.TextDocument): Promise<{ label: string, range: vscode.Range }[]> {
    const text = document.getText();
    const allLabels = findLabels(text, document);
    
    // Scan all .tex files in the workspace for references
    const allRefs = new Set<string>();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (workspaceFolders) {
        const texFiles = await vscode.workspace.findFiles('**/*.tex');
        
        for (const file of texFiles) {
            // Optimization: if it's the current document, we already have the text
            let fileText: string;
            if (file.fsPath === document.uri.fsPath) {
                fileText = text;
            } else {
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    fileText = doc.getText();
                } catch (e) {
                    // Skip files that cannot be opened
                    continue;
                }
            }
            
            const refsInFile = findReferences(fileText);
            refsInFile.forEach(ref => allRefs.add(ref));
        }
    } else {
        // No workspace, just scan the current document
        const refsInFile = findReferences(text);
        refsInFile.forEach(ref => allRefs.add(ref));
    }

    return allLabels.filter(l => !allRefs.has(l.label));
}

export async function updateLabelDecorations(editor: vscode.TextEditor) {
    if (editor.document.languageId !== 'latex') {
        return;
    }

    const unusedLabels = await getUnusedLabels(editor.document);
    const decorations = unusedLabels.map(l => ({ range: l.range }));
    editor.setDecorations(unusedLabelDecorationType, decorations);
}

let updateTimeout: NodeJS.Timeout | undefined;

export function registerLabelDetection(context: vscode.ExtensionContext) {
    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.deleteUnusedLabels', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const unusedLabels = await getUnusedLabels(editor.document);
            if (unusedLabels.length === 0) {
                vscode.window.showInformationMessage("미사용된 라벨이 없습니다.");
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `${unusedLabels.length}개의 미사용 라벨을 삭제하시겠습니까? (이 작업은 현재 문서의 라벨만 삭제합니다)`,
                { modal: true },
                '삭제'
            );

            if (confirm === '삭제') {
                await editor.edit(editBuilder => {
                    // Sort ranges from bottom to top to avoid offset issues
                    const sortedLabels = [...unusedLabels].sort((a, b) => b.range.start.compareTo(a.range.start));
                    for (const label of sortedLabels) {
                        editBuilder.delete(label.range);
                    }
                });
                vscode.window.showInformationMessage(`${unusedLabels.length}개의 라벨이 삭제되었습니다.`);
                updateLabelDecorations(editor);
            }
        })
    );

    function triggerUpdate(editor: vscode.TextEditor | undefined) {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
            if (editor) {
                updateLabelDecorations(editor);
            }
        }, 500); // 500ms debounce
    }

    // Update decorations on change or open
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            triggerUpdate(editor);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            triggerUpdate(editor);
        }
    }, null, context.subscriptions);

    // Initial update
    if (vscode.window.activeTextEditor) {
        triggerUpdate(vscode.window.activeTextEditor);
    }
}
