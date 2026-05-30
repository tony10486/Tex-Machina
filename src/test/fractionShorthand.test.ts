import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForIncludes, waitForLine, sleep } from './testUtils';

suite('Fraction Shorthand Test Suite', () => {
    test('1/2 space should become \\frac{1}{2}', async () => {
        const { document, editor } = await openDoc('1/2');
        await insertAt(editor, 0, 3, ' ');
        assert.ok(await waitForIncludes(document, '\\frac{1}{2}'));
        await closeEditor();
    });

    test('(a+b)/c space should become \\frac{a+b}{c}', async () => {
        const { document, editor } = await openDoc('(a+b)/c');
        await insertAt(editor, 0, 7, ' ');
        assert.ok(await waitForIncludes(document, '\\frac{a+b}{c}'));
        await closeEditor();
    });

    test('a/b space should become \\frac{a}{b}', async () => {
        const { document, editor } = await openDoc('a/b');
        await insertAt(editor, 0, 3, ' ');
        assert.ok(await waitForIncludes(document, '\\frac{a}{b}'));
        await closeEditor();
    });

    test('Should NOT convert when disabled', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('fractionShorthand.enabled', false, vscode.ConfigurationTarget.Global);
        const { document, editor } = await openDoc('1/2');
        await insertAt(editor, 0, 3, ' ');
        await sleep(200);
        assert.ok(!document.getText().includes('\\frac'));
        await config.update('fractionShorthand.enabled', true, vscode.ConfigurationTarget.Global);
        await closeEditor();
    });
});
