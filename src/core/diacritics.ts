import * as vscode from 'vscode';

export function registerDiacritics(context: vscode.ExtensionContext) {
    const commands = [
        { command: 'tex-machina.addHat', macro: 'hat' },
        { command: 'tex-machina.addTilde', macro: 'tilde' },
        { command: 'tex-machina.addDot', macro: 'dot' }
    ];

    commands.forEach(({ command, macro }) => {
        let disposable = vscode.commands.registerCommand(command, async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const document = editor.document;
            const selection = editor.selection;

            if (!selection.isEmpty) {
                // Wrap selection
                const text = document.getText(selection);
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, `\\${macro}{${text}}`);
                });
            } else {
                // No selection, wrap character before cursor
                const position = selection.active;
                if (position.character > 0) {
                    const range = new vscode.Range(position.translate(0, -1), position);
                    const char = document.getText(range);
                    
                    // Basic check: if it's a space or newline, maybe don't wrap?
                    // User said "type 'a' then press alt+^", so we expect a character.
                    if (/\s/.test(char)) {
                        // If it's whitespace, just insert the macro with empty braces and put cursor inside
                        await editor.edit(editBuilder => {
                            editBuilder.insert(position, `\\${macro}{}`);
                        });
                        const newPos = editor.selection.active.translate(0, -1);
                        editor.selection = new vscode.Selection(newPos, newPos);
                    } else {
                        await editor.edit(editBuilder => {
                            editBuilder.replace(range, `\\${macro}{${char}}`);
                        });
                    }
                } else {
                    // Start of line, just insert macro
                    await editor.edit(editBuilder => {
                        editBuilder.insert(position, `\\${macro}{}`);
                    });
                    const newPos = editor.selection.active.translate(0, -1);
                    editor.selection = new vscode.Selection(newPos, newPos);
                }
            }
        });
        context.subscriptions.push(disposable);
    });
}
