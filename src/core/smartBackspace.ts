import * as vscode from 'vscode';
import { findCommandAtCursor, isCommandEmpty } from './latexParser';

export function registerSmartBackspace(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerTextEditorCommand('tex-machina.smartBackspace', async (editor) => {
        const selection = editor.selection;
        if (!selection.isEmpty) {
            await vscode.commands.executeCommand('deleteLeft');
            return;
        }

        const pos = selection.active;
        const document = editor.document;
        const line = document.lineAt(pos.line).text;

        let commandStartPos: vscode.Position | undefined;

        if (pos.character < line.length && line[pos.character] === '\\') {
            commandStartPos = pos;
        }
        else if (pos.character > 0 && line[pos.character - 1] === '\\') {
            commandStartPos = pos.translate(0, -1);
        }

        if (commandStartPos) {
            const command = findCommandAtCursor(document, commandStartPos);
            if (command && isCommandEmpty(command.text)) {
                await editor.edit(editBuilder => {
                    editBuilder.delete(command.range);
                });
                return;
            }
        }

        await vscode.commands.executeCommand('deleteLeft');
    });

    context.subscriptions.push(disposable);
}
