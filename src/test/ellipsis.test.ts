import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Ellipsis Conversion Test Suite', () => {
    // Force extension activation by opening a latex document before each test
    setup(async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    teardown(async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.macro', '\\dots', vscode.ConfigurationTarget.Global);
        await config.update('ellipsis.enabled', true, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Ellipsis: ... should become \\dots by default', async () => {
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);

        // Insert two dots
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), '..');
        });
        
        // Insert the third dot
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 2), '.');
        });

        // Wait for async transformation
        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === '\\dots') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.strictEqual(editor.document.lineAt(0).text, '\\dots', "Ellipsis should be converted to \\dots");
    });

    test('Ellipsis: ... should become \\cdots when configured', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.macro', '\\cdots', vscode.ConfigurationTarget.Global);

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), '..');
        });
        
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 2), '.');
        });

        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === '\\cdots') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.strictEqual(editor.document.lineAt(0).text, '\\cdots', "Ellipsis should be converted to \\cdots");
    });

    test('Ellipsis: Should NOT convert when disabled', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.enabled', false, vscode.ConfigurationTarget.Global);

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 0), '...');
        });

        await new Promise(resolve => setTimeout(resolve, 300));
        assert.strictEqual(editor.document.lineAt(0).text, '...', "Should NOT transform since ellipsis is disabled");
    });
});
