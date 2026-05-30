import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForCondition, sleep } from './testUtils';

suite('Smart Backspace Test Suite', () => {
    test('Should delete entire empty \\frac{}{}', async () => {
        const { document, editor } = await openDoc('\\frac{}{}');
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        assert.ok(await waitForCondition(() => document.getText() === ''));
        await closeEditor();
    });

    test('Should delete complex empty \\sum_{}^{}', async () => {
        const { document, editor } = await openDoc('\\sum_{}^{}');
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        assert.ok(await waitForCondition(() => document.getText() === ''));
        await closeEditor();
    });

    test('Should NOT delete if command has content', async () => {
        const { document, editor } = await openDoc('\\frac{a}{}');
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        await sleep(100);
        assert.strictEqual(document.getText(), '\\frac{a}{}');
        await closeEditor();
    });

    test('Should trigger when cursor is behind backslash (\\|frac)', async () => {
        const { document, editor } = await openDoc('\\sqrt{}');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        assert.ok(await waitForCondition(() => document.getText() === ''));
        await closeEditor();
    });

    test('Should delete empty \\hat{}', async () => {
        const { document, editor } = await openDoc('\\hat{}');
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        assert.ok(await waitForCondition(() => document.getText() === ''));
        await closeEditor();
    });

    test('Should NOT delete when cursor is inside content', async () => {
        const { document, editor } = await openDoc('\\frac{ab}{}');
        editor.selection = new vscode.Selection(0, 6, 0, 6);
        await vscode.commands.executeCommand('tex-machina.smartBackspace');
        await sleep(100);
        assert.ok(document.getText().includes('a'));
        await closeEditor();
    });
});
