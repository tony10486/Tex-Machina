import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Fraction Shorthand Test Suite', () => {
    test('Fraction Shorthand: 1/2 space should become \\frac{1}{2} ', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '1/2' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), ' ');
        });

        // Use a more reliable waiting mechanism
        await new Promise<void>((resolve) => {
            const disposable = vscode.workspace.onDidChangeTextDocument(() => {
                if (document.lineAt(0).text.includes('\\frac{1}{2}')) {
                    disposable.dispose();
                    resolve();
                }
            });
            setTimeout(() => { disposable.dispose(); resolve(); }, 1000);
        });

        assert.ok(document.lineAt(0).text.includes('\\frac{1}{2}'), "Text should be converted to \\frac{1}{2}");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Fraction Shorthand: (a+b)/c space should become \\frac{a+b}{c} ', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '(a+b)/c' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 7), ' ');
        });

        // Use a more reliable waiting mechanism
        await new Promise<void>((resolve) => {
            const disposable = vscode.workspace.onDidChangeTextDocument(() => {
                if (document.lineAt(0).text.includes('\\frac{a+b}{c}')) {
                    disposable.dispose();
                    resolve();
                }
            });
            setTimeout(() => { disposable.dispose(); resolve(); }, 1000);
        });

        assert.ok(document.lineAt(0).text.includes('\\frac{a+b}{c}'), "Text should be converted to \\frac{a+b}{c}");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
