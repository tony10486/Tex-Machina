import * as vscode from 'vscode';

export function registerSelectionWrap(context: vscode.ExtensionContext) {
    const wrapSubscript = vscode.commands.registerTextEditorCommand('tex-machina.wrapSubscript', async (editor) => {
        await wrapWith(editor, '_');
    });

    const wrapSuperscript = vscode.commands.registerTextEditorCommand('tex-machina.wrapSuperscript', async (editor) => {
        await wrapWith(editor, '^');
    });

    context.subscriptions.push(wrapSubscript, wrapSuperscript);
}

async function wrapWith(editor: vscode.TextEditor, scriptChar: string) {
    const selections = editor.selections;
    if (selections.length === 0) {return;}

    // Store original start positions and lengths to calculate new selections later
    const originalInfos = selections.map(sel => ({
        start: sel.start,
        text: editor.document.getText(sel),
        isEmpty: sel.isEmpty
    }));

    const success = await editor.edit(editBuilder => {
        for (const selection of selections) {
            if (selection.isEmpty) {
                editBuilder.insert(selection.active, scriptChar);
            } else {
                const text = editor.document.getText(selection);
                editBuilder.replace(selection, `${scriptChar}{${text}}`);
            }
        }
    });

    if (success) {
        // Adjust selections to be inside the new braces
        const newSelections: vscode.Selection[] = [];
        for (const info of originalInfos) {
            if (info.isEmpty) {
                // If it was empty, just let VS Code handle cursor position (usually after scriptChar)
                continue;
            } else {
                // For non-empty: target text starts 2 characters after original start
                const newStart = info.start.translate(0, 2);
                const newEnd = newStart.translate(0, info.text.length);
                newSelections.push(new vscode.Selection(newStart, newEnd));
            }
        }
        
        if (newSelections.length > 0) {
            editor.selections = newSelections;
        }
    }
}
