import * as vscode from 'vscode';

export function registerAutoBracing(context: vscode.ExtensionContext) {
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
                // Check for single character insertion
                if (change.text.length !== 1 || change.text === ' ' || change.text === '\t' || change.text === '\n' || change.text === '\r') {
                    continue;
                }

                // The character was inserted at change.range.start
                // The position AFTER the inserted character is:
                const charOffsetAfter = change.range.start.character + change.text.length;
                const line = change.range.start.line;

                const lineText = editor.document.lineAt(line).text;
                
                // We need at least 3 characters to have ^ab
                if (charOffsetAfter < 3) {
                    continue;
                }

                const prefix = lineText[charOffsetAfter - 3];
                const firstChar = lineText[charOffsetAfter - 2];
                const secondChar = lineText[charOffsetAfter - 1]; // This is the char just typed

                // console.log(`AutoBracing debug: prefix=${prefix}, first=${firstChar}, second=${secondChar}`);

                // We are looking for something like ^ab or _12
                if ((prefix === '^' || prefix === '_') && firstChar !== '{' && firstChar !== '}' && firstChar !== ' ') {
                    // Check if secondChar is also valid
                    if (secondChar !== '{' && secondChar !== '}' && secondChar !== ' ') {
                        const rangeToReplace = new vscode.Range(
                            new vscode.Position(line, charOffsetAfter - 2),
                            new vscode.Position(line, charOffsetAfter)
                        );
                        const bracedText = `{${firstChar}${secondChar}}`;

                        // Execute the edit
                        await editor.edit(editBuilder => {
                            editBuilder.replace(rangeToReplace, bracedText);
                        }, { undoStopBefore: false, undoStopAfter: false });

                        // Move cursor inside the braces (before the closing brace)
                        const newPosition = new vscode.Position(line, charOffsetAfter + 1); // After firstChar and secondChar, before }
                        editor.selection = new vscode.Selection(newPosition, newPosition);
                    }
                }
            }
        })
    );
}
