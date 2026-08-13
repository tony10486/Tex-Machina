import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition, sleep } from './testUtils';

suite('Math Ligatures Test Suite', function () {
    this.timeout(10000);

    setup(async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(doc);
        await sleep(30);
    });

    teardown(async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('mathLigatures.mappings', undefined, vscode.ConfigurationTarget.Global);
        await config.update('mathLigatures.enabled', true, vscode.ConfigurationTarget.Global);
        await closeEditor();
    });

    test('-> should become \\to in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '-');
        await sleep(100);
        await insertAt(editor, 0, 2, '>');
        await sleep(100);
        await insertAt(editor, 0, 3, '$');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text === '$\\to $', 1000
        ));
    });

    test('<= should become \\le in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '<');
        await sleep(100);
        await insertAt(editor, 0, 2, '=');
        await sleep(150);
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\le '), 1000
        ));
    });

    test('|-> should become \\mapsto in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '|');
        await sleep(100);
        await insertAt(editor, 0, 2, '-');
        await sleep(100);
        await insertAt(editor, 0, 3, '>');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\mapsto'), 1000
        ));
    });

    test('=> should become \\implies in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '=');
        await sleep(100);
        await insertAt(editor, 0, 2, '>');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\implies'), 1000
        ));
    });

    test('should NOT convert outside math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '-');
        await sleep(50);
        await insertAt(editor, 0, 1, '>');
        await sleep(300);
        assert.strictEqual(editor.document.lineAt(0).text, '->');
    });

    test('<a| space should become \\bra{a} in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '<a|');
        await sleep(100);
        await insertAt(editor, 0, 4, ' ');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\bra{a}'), 1500
        ));
    });

    test('|a> space should become \\ket{a} in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '|a>');
        await sleep(100);
        await insertAt(editor, 0, 4, ' ');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\ket{a}'), 1500
        ));
    });

    test('<a|b> space should become \\braket{a}{b} in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '<a|b>');
        await sleep(100);
        await insertAt(editor, 0, 6, ' ');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\braket{a}{b}'), 1500
        ));
    });

    test('longer capture: <\\alpha| space → \\bra{\\alpha}', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '<\\alpha|');
        await sleep(100);
        await insertAt(editor, 0, 8, ' ');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\bra{\\alpha}'), 1500
        ));
    });

    test('should NOT convert patterns outside math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '<a|');
        await sleep(100);
        await insertAt(editor, 0, 3, ' ');
        await sleep(300);
        assert.strictEqual(editor.document.lineAt(0).text, '<a| ');
    });

    test('custom mapping via config should work', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('mathLigatures.mappings', {
            '-->': '\\longrightarrow '
        }, vscode.ConfigurationTarget.Global);
        await sleep(100);

        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '--');
        await sleep(100);
        await insertAt(editor, 0, 3, '>');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\longrightarrow'), 1500
        ));
    });

    test('custom pattern mapping via config', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('mathLigatures.mappings', {
            '!>': '\\mapsto'
        }, vscode.ConfigurationTarget.Global);
        await sleep(100);

        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, '!>');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes('\\mapsto'), 1500
        ));
    });
});
