import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Diacritics Test Suite', () => {
    test('Diacritics: addHat should wrap character', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.addHat');
        assert.strictEqual(document.lineAt(0).text, '\\hat{a}');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Diacritics: addTilde should wrap selection', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'abc' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        editor.selection = new vscode.Selection(0, 0, 0, 3);
        await vscode.commands.executeCommand('tex-machina.addTilde');
        assert.strictEqual(document.lineAt(0).text, '\\tilde{abc}');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Diacritics: addDot should handle empty space', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await vscode.commands.executeCommand('tex-machina.addDot');
        assert.strictEqual(document.lineAt(0).text, '\\dot{}');
        assert.strictEqual(editor.selection.active.character, 5);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
