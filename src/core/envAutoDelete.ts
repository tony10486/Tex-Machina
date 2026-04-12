import * as vscode from 'vscode';

export function registerEnvAutoDelete(context: vscode.ExtensionContext) {
    let lastDocumentState = new Map<string, string[]>();

    // Initialize state for active editor
    if (vscode.window.activeTextEditor) {
        const doc = vscode.window.activeTextEditor.document;
        lastDocumentState.set(doc.uri.toString(), doc.getText().split(/\r?\n/));
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                const doc = editor.document;
                lastDocumentState.set(doc.uri.toString(), doc.getText().split(/\r?\n/));
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            lastDocumentState.set(doc.uri.toString(), doc.getText().split(/\r?\n/));
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            try {
                const config = vscode.workspace.getConfiguration('tex-machina');
                const isEnabled = config.get('envAutoDelete.enabled', true);
                if (!isEnabled) {
                    return;
                }

                const doc = event.document;
                if (doc.languageId !== 'latex') {
                    return;
                }

                const uriStr = doc.uri.toString();
                const oldLines = lastDocumentState.get(uriStr);
                const currentLines = doc.getText().split(/\r?\n/);
                
                // Update state for next time
                lastDocumentState.set(uriStr, currentLines);

                if (!oldLines) {
                    return;
                }

                for (const change of event.contentChanges) {
                    // Check if it's a deletion or replacement that might have removed a \begin{env}
                    const startLine = change.range.start.line;
                    const endLine = change.range.end.line;

                    let deletedText = "";
                    if (startLine === endLine) {
                        const line = oldLines[startLine];
                        if (line) {
                            deletedText = line.substring(change.range.start.character, change.range.end.character);
                        }
                    } else {
                        // Multi-line deletion
                        for (let i = startLine; i <= endLine; i++) {
                            const line = oldLines[i];
                            if (line === undefined) { continue; } 
                            if (i === startLine) {
                                deletedText += line.substring(change.range.start.character) + "\n";
                            } else if (i === endLine) {
                                deletedText += line.substring(0, change.range.end.character);
                            } else {
                                deletedText += line + "\n";
                            }
                        }
                    }

                    const beginRegex = /\\begin\{([a-zA-Z]+\*?)\}/g;
                    let match;
                    while ((match = beginRegex.exec(deletedText)) !== null) {
                        const envName = match[1];
                        
                        // Find the matching \end{envName} in the CURRENT document
                        const matchingEndRange = findMatchingEnd(doc, change.range.start, envName);
                        if (matchingEndRange) {
                            const editor = vscode.window.activeTextEditor;
                            if (editor && editor.document === doc) {
                                await editor.edit(editBuilder => {
                                    const endLineText = doc.lineAt(matchingEndRange.start.line).text;
                                    if (endLineText.trim() === `\\end{${envName}}`) {
                                        const fullLineRange = doc.lineAt(matchingEndRange.start.line).rangeIncludingLineBreak;
                                        editBuilder.delete(fullLineRange);
                                    } else {
                                        editBuilder.delete(matchingEndRange);
                                    }
                                }, { undoStopBefore: false, undoStopAfter: true });
                            }
                        }
                    }
                }
            } catch (err) {
                // Silent fail in production
            }
        })
    );
}

function findMatchingEnd(document: vscode.TextDocument, startPos: vscode.Position, envName: string): vscode.Range | null {
    let depth = 0;
    const docText = document.getText();
    const offset = document.offsetAt(startPos);
    
    // We search from the deletion point onwards
    const remainingText = docText.substring(offset);
    
    const beginPattern = `\\\\begin\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const endPattern = `\\\\end\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const regex = new RegExp(`(${beginPattern})|(${endPattern})`, 'g');
    
    let match;
    while ((match = regex.exec(remainingText)) !== null) {
        if (match[1]) { // \begin
            depth++;
        } else if (match[2]) { // \end
            if (depth === 0) {
                // Found the extra \end
                const matchStart = offset + match.index;
                const matchEnd = matchStart + match[0].length;
                return new vscode.Range(
                    document.positionAt(matchStart),
                    document.positionAt(matchEnd)
                );
            }
            depth--;
        }
    }
    
    return null;
}
