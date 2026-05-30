import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition, sleep } from './testUtils';

suite('Ellipsis Conversion Test Suite', function () {
    this.timeout(5000);
    setup(async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(document);
        await sleep(30);
    });

    teardown(async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.macro', '\\dots', vscode.ConfigurationTarget.Global);
        await config.update('ellipsis.enabled', true, vscode.ConfigurationTarget.Global);
        await closeEditor();
    });

    test('... should become \\dots by default', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '..');
        await insertAt(editor, 0, 2, '.');
        assert.ok(await waitForLine(editor.document, 0, '\\dots'));
    });

    test('Should NOT convert when disabled', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.enabled', false, vscode.ConfigurationTarget.Global);
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '...');
        await waitForCondition(() => editor.document.lineAt(0).text === '...', 200);
        assert.strictEqual(editor.document.lineAt(0).text, '...');
    });

    test('... should become \\cdots when configured', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('ellipsis.macro', '\\cdots', vscode.ConfigurationTarget.Global);
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '..');
        await insertAt(editor, 0, 2, '.');
        assert.ok(await waitForLine(editor.document, 0, '\\cdots'));
    });

    test('Only 3 dots should convert, not 2', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '..');
        await waitForCondition(() => editor.document.lineAt(0).text !== '..', 200);
        assert.strictEqual(editor.document.lineAt(0).text, '..');
    });

    test('... in math mode should also convert', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await insertAt(editor, 0, 1, '..');
        await insertAt(editor, 0, 3, '.');
        assert.ok(await waitForCondition(() => editor.document.lineAt(0).text.includes('\\dots'), 500));
    });
});
