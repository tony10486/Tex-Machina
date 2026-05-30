import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Selection Wrap Test Suite', () => {
    
    suite('Simple Feature Check', () => {
        test('Should wrap selection with subscript (_)', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'n+1' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            editor.selection = new vscode.Selection(0, 0, 0, 3);
            await vscode.commands.executeCommand('tex-machina.wrapSubscript');

            for (let i = 0; i < 20; i++) {
                if (document.getText().startsWith('_')) {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            assert.strictEqual(document.getText(), '_{n+1}', "Should be wrapped with _{...}");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Should wrap selection with superscript (^)', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x+y' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            editor.selection = new vscode.Selection(0, 0, 0, 3);
            await vscode.commands.executeCommand('tex-machina.wrapSuperscript');

            for (let i = 0; i < 20; i++) {
                if (document.getText().startsWith('^')) {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            assert.strictEqual(document.getText(), '^{x+y}', "Should be wrapped with ^{...}");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Detailed Feature Check', () => {
        test('Should handle multiple selections', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'a b' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            editor.selections = [
                new vscode.Selection(0, 0, 0, 1),
                new vscode.Selection(0, 2, 0, 3)
            ];
            await vscode.commands.executeCommand('tex-machina.wrapSubscript');

            for (let i = 0; i < 20; i++) {
                if (document.getText().includes('_{a}')) {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            assert.strictEqual(document.getText(), '_{a} _{b}', "Both selections should be wrapped");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Should adjust selection to be inside braces after wrap', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'abc' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            editor.selection = new vscode.Selection(0, 0, 0, 3);
            await vscode.commands.executeCommand('tex-machina.wrapSuperscript');

            for (let i = 0; i < 20; i++) {
                if (document.getText().startsWith('^')) {break;}
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const sel = editor.selection;
            // Text is ^{abc}. 'abc' should be selected.
            assert.strictEqual(document.getText(sel), 'abc', "Selection should exactly cover 'abc' inside ^{}");
            assert.strictEqual(sel.start.character, 2, "Start should be after ^{");
            assert.strictEqual(sel.end.character, 5, "End should be before }");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });
});
