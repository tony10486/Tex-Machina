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

            // Collect all edits to apply them at once if possible, 
            // though for auto-bracing usually only the last one matters.
            for (const change of event.contentChanges) {
                // Reset escape if user moves to a new word/line or deletes
                if (change.text.includes(' ') || change.text.includes('\n') || change.text === '') {
                    isEscaped = false;
                }

                // Check for character insertion (allow small batches for fast typing)
                if (change.text.length === 0 || change.text.length > 10 || /[\s,\]\)$]/.test(change.text)) {
                    continue;
                }

                if (isEscaped) {
                    isEscaped = false; // Reset for next character
                    continue;
                }

                // The character was inserted at change.range.start
                const charOffsetAfter = change.range.start.character + change.text.length;
                const line = change.range.start.line;

                // Safety check for line bounds (in case of concurrent deletions)
                if (line >= editor.document.lineCount) {
                    continue;
                }

                const lineText = editor.document.lineAt(line).text;
                
                if (charOffsetAfter < 3) {
                    continue;
                }

                // Find if there's an unbraced sequence after ^ or _
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
                    const isDelimiter = (c: string) => c === '{' || c === '}' || c === ' ' || c === '^' || c === '_' || c === ',' || c === ')' || c === ']' || c === '$';
                    
                    if (content.length >= 2 && !Array.from(content).some(isDelimiter)) {
                        const rangeToReplace = new vscode.Range(
                            new vscode.Position(line, foundPrefix + 1),
                            new vscode.Position(line, charOffsetAfter)
                        );
                        
                        // Use insertSnippet for atomic operation and better cursor management
                        // $0 ensures the cursor stays inside the braces
                        const snippet = new vscode.SnippetString(`{${content}$0}`);
                        await editor.insertSnippet(snippet, rangeToReplace);
                    }
                }
            }
        })
    );
}
