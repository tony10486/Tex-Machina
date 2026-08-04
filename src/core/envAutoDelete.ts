import * as vscode from 'vscode';

function applyChangeToLines(lines: string[], change: vscode.TextDocumentContentChangeEvent): string[] {
    const result = [...lines];
    const startLine = change.range.start.line;
    const endLine = change.range.end.line;
    const newText = change.text;

    if (!newText.includes('\n') && startLine === endLine) {
        const line = result[startLine];
        result[startLine] = line.substring(0, change.range.start.character) + newText + line.substring(change.range.end.character);
    } else {
        const prefix = result[startLine].substring(0, change.range.start.character);
        const suffix = result[endLine].substring(change.range.end.character);
        const newLinesArr = newText.split('\n');
        newLinesArr[0] = prefix + newLinesArr[0];
        newLinesArr[newLinesArr.length - 1] = newLinesArr[newLinesArr.length - 1] + suffix;
        result.splice(startLine, endLine - startLine + 1, ...newLinesArr);
    }
    return result;
}

function getDeletedText(lines: string[], change: vscode.TextDocumentContentChangeEvent): string {
    const startLine = change.range.start.line;
    const endLine = change.range.end.line;
    if (startLine === endLine) {
        const line = lines[startLine];
        if (line === undefined) { return ''; }
        return line.substring(change.range.start.character, change.range.end.character);
    }
    let result = '';
    for (let i = startLine; i <= endLine; i++) {
        const line = lines[i];
        if (line === undefined) { continue; }
        if (i === startLine) {
            result += line.substring(change.range.start.character) + '\n';
        } else if (i === endLine) {
            result += line.substring(0, change.range.end.character);
        } else {
            result += line + '\n';
        }
    }
    return result;
}

export function registerEnvAutoDelete(context: vscode.ExtensionContext) {
    let lastDocumentState = new Map<string, string[]>();

    function initState(doc: vscode.TextDocument) {
        lastDocumentState.set(doc.uri.toString(), doc.getText().split(/\r?\n/));
    }

    if (vscode.window.activeTextEditor) {
        initState(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                initState(editor.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'latex') {
                initState(doc);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            lastDocumentState.delete(doc.uri.toString());
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            try {
                const config = vscode.workspace.getConfiguration('tex-machina');
                const isEnabled = config.get('envAutoDelete.enabled', true);
                if (!isEnabled) { return; }

                const doc = event.document;
                if (doc.languageId !== 'latex') { return; }

                const uriStr = doc.uri.toString();
                const oldLines = lastDocumentState.get(uriStr);
                if (!oldLines) { return; }

                let workingLines = oldLines;

                for (const change of event.contentChanges) {
                    if (change.rangeLength === 0) {
                        workingLines = applyChangeToLines(workingLines, change);
                        continue;
                    }

                    const deletedText = getDeletedText(workingLines, change);

                    const beginRegex = /\\begin\{([a-zA-Z]+\*?)\}/g;
                    let match;
                    while ((match = beginRegex.exec(deletedText)) !== null) {
                        const envName = match[1];
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

                    workingLines = applyChangeToLines(workingLines, change);
                }

                lastDocumentState.set(uriStr, workingLines);
            } catch {
                // envAutoDelete error is non-critical
            }
        })
    );
}

function findMatchingEnd(document: vscode.TextDocument, startPos: vscode.Position, envName: string): vscode.Range | null {
    let depth = 0;
    const startLine = startPos.line;
    const endLine = Math.min(document.lineCount - 1, startLine + 200);
    const range = new vscode.Range(
        startPos,
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    const text = document.getText(range);
    const offset = document.offsetAt(startPos);

    const beginPattern = `\\\\begin\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const endPattern = `\\\\end\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const regex = new RegExp(`(${beginPattern})|(${endPattern})`, 'g');

    let match;
    while ((match = regex.exec(text)) !== null) {
        const absPos = offset + match.index;
        if (match[1]) {
            depth++;
        } else if (match[2]) {
            if (depth === 0) {
                const matchEnd = absPos + match[0].length;
                return new vscode.Range(
                    document.positionAt(absPos),
                    document.positionAt(matchEnd)
                );
            }
            depth--;
        }
    }

    return null;
}
