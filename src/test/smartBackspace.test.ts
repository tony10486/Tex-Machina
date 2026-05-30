import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Smart Backspace Test Suite', () => {
    
    suite('Simple Feature Check', () => {
        test('Should delete entire empty command (e.g., \\frac{}{})', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\frac{}{}' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await vscode.commands.executeCommand('tex-machina.smartBackspace');
            for (let i = 0; i < 20; i++) {
                if (document.getText() === '') {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.strictEqual(document.getText(), '', "Empty structure should be deleted");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Detailed Feature Check', () => {
        test('Should handle complex empty structures (e.g., \\sum_{}^{})', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\sum_{}^{}' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await vscode.commands.executeCommand('tex-machina.smartBackspace');
            for (let i = 0; i < 20; i++) {
                if (document.getText() === '') {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.strictEqual(document.getText(), '', "Complex empty structure should be deleted");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Should NOT delete if command has content', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\frac{a}{}' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await vscode.commands.executeCommand('tex-machina.smartBackspace');
            await new Promise(resolve => setTimeout(resolve, 200));
            assert.strictEqual(document.getText(), '\\frac{a}{}', "Non-empty structure should NOT be deleted");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Should trigger when cursor is behind backslash (\\|frac)', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\sqrt{}' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 1, 0, 1); // after \
            await vscode.commands.executeCommand('tex-machina.smartBackspace');
            for (let i = 0; i < 20; i++) {
                if (document.getText() === '') {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.strictEqual(document.getText(), '', "Should trigger smart delete from behind backslash");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });
});
