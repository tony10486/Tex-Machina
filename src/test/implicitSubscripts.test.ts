import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Implicit Subscripts & Toggle Mode Test Suite', () => {
    async function isToggleActive(): Promise<boolean> {
        return await vscode.commands.executeCommand<boolean>('tex-machina.isSubscriptToggleActive') || false;
    }

    async function deactivateToggle(): Promise<void> {
        await vscode.commands.executeCommand('tex-machina.deactivateSubscriptToggle');
    }

    setup(async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '$x$' });
        await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    teardown(async () => {
        await deactivateToggle();
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Toggle Mode: Should activate and deactivate via command', async () => {
        assert.strictEqual(await isToggleActive(), false);
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), true);
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), false);
    });

    test('Subscript Transformation: x1 should become x_1 when active', async () => {
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);

        // Position 2 is after 'x' in '$x$'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 2), '1');
        });

        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === '$x_1$') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.strictEqual(editor.document.lineAt(0).text, '$x_1$');
    });

    test('Subscript Transformation: Should accumulate digits (x_1 + 2 -> x_{12})', async () => {
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        const editor = vscode.window.activeTextEditor;
        assert.ok(editor);

        await editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 3)), '$x_1$');
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        // Position 4 is after '1' in '$x_1$'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 4), '2');
        });

        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === '$x_{12}$') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.strictEqual(editor.document.lineAt(0).text, '$x_{12}$');
    });
});
