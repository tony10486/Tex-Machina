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

                const prefix = lineText[charOffsetAfter - 3];
                const firstChar = lineText[charOffsetAfter - 2];
                const secondChar = lineText[charOffsetAfter - 1];

                // We are looking for something like ^ab or _12
                if ((prefix === '^' || prefix === '_') && firstChar !== '{' && firstChar !== '}' && firstChar !== ' ') {
                    if (secondChar !== '{' && secondChar !== '}' && secondChar !== ' ') {
                        const rangeToReplace = new vscode.Range(
                            new vscode.Position(line, charOffsetAfter - 2),
                            new vscode.Position(line, charOffsetAfter)
                        );
                        const bracedText = `{${firstChar}${secondChar}}`;

                        await editor.edit(editBuilder => {
                            editBuilder.replace(rangeToReplace, bracedText);
                        }, { undoStopBefore: false, undoStopAfter: false });

                        const newPosition = new vscode.Position(line, charOffsetAfter + 1);
                        editor.selection = new vscode.Selection(newPosition, newPosition);
                    }
                }
            }
        })
    );
}
