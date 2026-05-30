import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition, sleep } from './testUtils';

suite('Implicit Subscripts & Toggle Mode Test Suite', () => {
    async function isToggleActive(): Promise<boolean> {
        return await vscode.commands.executeCommand<boolean>('tex-machina.isSubscriptToggleActive') || false;
    }

    async function deactivateToggle(): Promise<void> {
        await vscode.commands.executeCommand('tex-machina.deactivateSubscriptToggle');
    }

    teardown(async () => {
        await deactivateToggle();
        await closeEditor();
    });

    test('Toggle: Should activate and deactivate', async () => {
        assert.strictEqual(await isToggleActive(), false);
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), true);
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        assert.strictEqual(await isToggleActive(), false);
    });

    test('x1 should become x_1 when active', async () => {
        const { document, editor } = await openDoc('$x$');
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        await insertAt(editor, 0, 2, '1');
        assert.ok(await waitForLine(document, 0, '$x_1$'));
        await closeEditor();
    });

    test('x_1 + 2 should become x_{12}', async () => {
        const { document, editor } = await openDoc('$x_1$');
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        await insertAt(editor, 0, 4, '2');
        assert.ok(await waitForLine(document, 0, '$x_{12}$'));
        await closeEditor();
    });

    test('x1 should NOT transform when toggle is off', async () => {
        const { document, editor } = await openDoc('$x$');
        await insertAt(editor, 0, 2, '1');
        await waitForCondition(() => document.lineAt(0).text === '$x1$', 200);
        assert.strictEqual(document.lineAt(0).text, '$x1$');
        await closeEditor();
    });

    test('x123 should become x_{123} accumulating digits', async () => {
        const { document, editor } = await openDoc('$x_1$');
        await vscode.commands.executeCommand('tex-machina.toggleSubscriptMode');
        await insertAt(editor, 0, 4, '23');
        assert.ok(await waitForCondition(() => document.lineAt(0).text === '$x_{123}$', 500));
        await closeEditor();
    });
});
