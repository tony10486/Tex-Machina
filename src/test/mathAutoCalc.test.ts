import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForCondition, sleep } from './testUtils';

suite('Math Auto Calc Test Suite', function () {
    this.timeout(10000);

    setup(async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(doc);
        await sleep(30);
    });

    teardown(async () => {
        await closeEditor();
    });

    test('=.. should trigger auto-calc in math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, '$');
        await sleep(100);
        await insertAt(editor, 0, 1, 'x');
        await sleep(50);
        await insertAt(editor, 0, 2, '+');
        await sleep(50);
        await insertAt(editor, 0, 3, '1');
        await sleep(50);
        await insertAt(editor, 0, 4, '=');
        await sleep(50);
        await insertAt(editor, 0, 5, '.');
        await sleep(50);
        await insertAt(editor, 0, 6, '.');
        assert.ok(await waitForCondition(() =>
            editor.document.lineAt(0).text.includes(' = '), 5000
        ));
    });

    test('=.. should NOT trigger outside math mode', async () => {
        const editor = vscode.window.activeTextEditor!;
        await insertAt(editor, 0, 0, 'x');
        await sleep(50);
        await insertAt(editor, 0, 1, '=');
        await sleep(50);
        await insertAt(editor, 0, 2, '.');
        await sleep(50);
        await insertAt(editor, 0, 3, '.');
        await sleep(300);
        assert.strictEqual(editor.document.lineAt(0).text, 'x=..');
    });

    test('detectOperation should identify integrals', async () => {
        const { detectOperation } = require('../core/mathCalcUtils');
        const op = detectOperation('\\int x \\sin(x) \\, dx');
        assert.strictEqual(op.mainCommand, 'calc');
    });

    test('detectOperation should identify polynomials for expand', async () => {
        const { detectOperation } = require('../core/mathCalcUtils');
        const op = detectOperation('(x+1)^3');
        assert.strictEqual(op.mainCommand, 'expand');
    });
});
