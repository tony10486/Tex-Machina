import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Smart Quotes Test Suite', () => {
    test('Smart Quotes: " at start of line should become ``', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), '"');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text === '``') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.strictEqual(document.lineAt(0).text, '``');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Smart Quotes: " after text should become \'\'', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'Hello' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 5), '"');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text === "Hello''") {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.strictEqual(document.lineAt(0).text, "Hello''");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Smart Quotes: " inside verbatim should stay "', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\begin{verbatim}\n\n\\end{verbatim}' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(1, 0), '"');
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(document.lineAt(1).text, '"');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Smart Quotes: \\" should stay \\"', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 1), '"');
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(document.lineAt(0).text, '\\"');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
