import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Auto-bracing Test Suite', () => {
    test('Auto-bracing: ^ab should become ^{ab}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text === 'x^{ab}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{ab}', "Text should be auto-braced");
        assert.strictEqual(editor.selection.active.character, 5, "Cursor should be inside braces");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: v_1, should NOT become v_{1,}', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'v_1' });
        const ed = await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 100));
        await ed.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), ',');
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(doc.lineAt(0).text, 'v_1,', "v_1, should NOT be auto-braced");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: x^-1 should become x^{-1} and cursor outside', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^-' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), '1');
        });

        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text === 'x^{-1}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{-1}', "Text should be auto-braced");
        assert.strictEqual(editor.selection.active.character, 6, "Cursor should be outside braces for -1");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
