import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Math Auto-Wrap Test Suite', () => {
    test('Math Auto-Wrap: \\alpha space should become $\\alpha$ ', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'Let \\alpha' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 10), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('$\\alpha$')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'Let $\\alpha$ ');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Math Auto-Wrap: Should NOT wrap already in math mode', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '$ \\alpha$' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(document.lineAt(0).text, '$ \\alpha $');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
