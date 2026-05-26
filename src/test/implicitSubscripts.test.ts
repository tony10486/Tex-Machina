import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Implicit Subscripts & Toggle Mode Test Suite', () => {
    async function isToggleActive(): Promise<boolean> {
        return await vscode.commands.executeCommand<boolean>('tex-machina.isSubscriptToggleActive') || false;
    }

    async function deactivateToggle(): Promise<void> {
        await vscode.commands.executeCommand('tex-machina.deactivateSubscriptToggle');
    }

    // Force extension activation by opening a latex document before each test
    setup(async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x' });
        await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Cleanup active editors and toggle state after each test
    teardown(async () => {
        await deactivateToggle();
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Toggle Mode: Should activate and deactivate via command', async () => {
        assert.strictEqual(await isToggleActive(), false, "Should start as inactive");

        // Act: Activate
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), true, "Should be active after command execution");

        // Act: Deactivate
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), false, "Should be inactive after executing command again");
    });

    test('Subscript Transformation: x1 should become x_1 when active', async () => {
        // Act: Activate toggle mode
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), true);

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, "Editor should be active");

        // Insert '1' after 'x'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 1), '1');
        });

        // Wait for asynchronous event replacement to trigger and process
        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === 'x_1') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.strictEqual(editor.document.lineAt(0).text, 'x_1', "x1 should automatically become x_1");
    });

    test('Subscript Transformation: Should accumulate digits (x_1 + 2 -> x_{12})', async () => {
        // Act: Activate toggle mode
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, "Editor should be active");

        // Replace content to 'x_1'
        await editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)), 'x_1');
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Insert '2' after 'x_1'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), '2');
        });

        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === 'x_{12}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.strictEqual(editor.document.lineAt(0).text, 'x_{12}', "x_12 should automatically become x_{12}");

        // Now test inserting '3' after 'x_{12}'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 6), '3');
        });

        for (let i = 0; i < 20; i++) {
            if (editor.document.lineAt(0).text === 'x_{123}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        assert.strictEqual(editor.document.lineAt(0).text, 'x_{123}', "x_{12}3 should automatically become x_{123}");
    });

    test('Subscript Transformation: Should NOT convert when toggle is inactive', async () => {
        assert.strictEqual(await isToggleActive(), false);

        const editor = vscode.window.activeTextEditor;
        assert.ok(editor, "Editor should be active");

        // Insert '1' after 'x'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 1), '1');
        });

        await new Promise(resolve => setTimeout(resolve, 300));
        assert.strictEqual(editor.document.lineAt(0).text, 'x1', "Should NOT transform since toggle mode is off");
    });
});
