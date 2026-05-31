import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForCondition, sleep } from './testUtils';

suite('Math Ghost Calc Test Suite', function () {
    this.timeout(10000);

    setup(async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(doc);
        await sleep(30);
    });

    teardown(async () => {
        await closeEditor();
    });

    test('isInOpenMathEnv detects open inline math', async () => {
        const { isInOpenMathEnv } = require('../core/mathCalcUtils');
        assert.ok(isInOpenMathEnv('$ x + 1 =', 8));
    });

    test('isInOpenMathEnv returns false for closed math', async () => {
        const { isInOpenMathEnv } = require('../core/mathCalcUtils');
        assert.ok(!isInOpenMathEnv('', 0));
    });

    test('detectOperation returns calc for derivatives', async () => {
        const { detectOperation } = require('../core/mathCalcUtils');
        const op = detectOperation('\\frac{d}{dx} x^2');
        assert.strictEqual(op.mainCommand, 'calc');
    });

    test('detectOperation returns simplify for trig', async () => {
        const { detectOperation } = require('../core/mathCalcUtils');
        const op = detectOperation('\\sin(x)^2 + \\cos(x)^2');
        assert.strictEqual(op.mainCommand, 'simplify');
    });
});
