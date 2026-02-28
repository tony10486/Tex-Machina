import * as vscode from 'vscode';

let isEscaped = false;

export function registerAutoBracing(context: vscode.ExtensionContext) {
    // Register the escape command
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.escapeAutoBracing', () => {
            isEscaped = true;
            // Note: We don't re-dispatch 'type' for Esc anymore to avoid side effects in tests.
            // In a real environment, Esc will still trigger other built-in listeners unless we stop propagation.
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            // Check if auto-bracing is enabled in configuration
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('autoBracing.enabled', true);
            if (!isEnabled) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            // Only for LaTeX files
            if (editor.document.languageId !== 'latex') {
                return;
            }

            for (const change of event.contentChanges) {
                // Reset escape if user moves to a new word/line or deletes
                if (change.text.includes(' ') || change.text.includes('\n') || change.text === '') {
                    isEscaped = false;
                }

                // Check for single character insertion
                if (change.text.length !== 1 || change.text === ' ' || change.text === '\t' || change.text === '\n' || change.text === '\r') {
                    continue;
                }

                if (isEscaped) {
                    isEscaped = false; // Reset for next character
                    continue;
                }

                // The character was inserted at change.range.start
                const charOffsetAfter = change.range.start.character + change.text.length;
                const line = change.range.start.line;

                const lineText = editor.document.lineAt(line).text;
                
                if (charOffsetAfter < 3) {
                    continue;
                }

                // Find if there's an unbraced sequence after ^ or _
                // Look back from current position to find ^ or _
                let foundPrefix = -1;
                for (let i = charOffsetAfter - 2; i >= 0; i--) {
                    if (lineText[i] === '^' || lineText[i] === '_') {
                        foundPrefix = i;
                        break;
                    }
                    if (lineText[i] === '{' || lineText[i] === '}' || lineText[i] === ' ') {
                        break;
                    }
                }

                if (foundPrefix !== -1) {
                    const content = lineText.substring(foundPrefix + 1, charOffsetAfter);
                    const isDelimiter = (c: string) => c === '{' || c === '}' || c === ' ' || c === '^' || c === '_';
                    
                    if (content.length >= 2 && !Array.from(content).some(isDelimiter)) {
                        const rangeToReplace = new vscode.Range(
                            new vscode.Position(line, foundPrefix + 1),
                            new vscode.Position(line, charOffsetAfter)
                        );
                        const bracedText = `{${content}}`;

                        await editor.edit(editBuilder => {
                            editBuilder.replace(rangeToReplace, bracedText);
                        }, { undoStopBefore: false, undoStopAfter: false });

                        const newPosition = new vscode.Position(line, foundPrefix + 1 + content.length + 1);
                        editor.selection = new vscode.Selection(newPosition, newPosition);
                    }
                }
            }
        })
    );
}
