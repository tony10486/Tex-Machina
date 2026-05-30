import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition } from './testUtils';

suite('Auto-bracing Test Suite', () => {
    test('^ab should become ^{ab}', async () => {
        const { document, editor } = await openDoc('x^a');
        await insertAt(editor, 0, 3, 'b');
        assert.ok(await waitForLine(document, 0, 'x^{ab}'));
        assert.strictEqual(editor.selection.active.character, 5);
        await closeEditor();
    });

    test('_ab should become _{ab}', async () => {
        const { document, editor } = await openDoc('v_1');
        await insertAt(editor, 0, 3, '2');
        assert.ok(await waitForLine(document, 0, 'v_{12}'));
        await closeEditor();
    });

    test('v_1, should NOT become v_{1,}', async () => {
        const { document, editor } = await openDoc('v_1');
        await insertAt(editor, 0, 3, ',');
        await waitForCondition(() => document.lineAt(0).text === 'v_1,', 200);
        assert.strictEqual(document.lineAt(0).text, 'v_1,');
        await closeEditor();
    });

    test('x^-1 should become x^{-1} with cursor outside', async () => {
        const { document, editor } = await openDoc('x^-');
        await insertAt(editor, 0, 3, '1');
        assert.ok(await waitForLine(document, 0, 'x^{-1}'));
        assert.strictEqual(editor.selection.active.character, 6);
        await closeEditor();
    });

    test('^{abc} should auto-brace three chars', async () => {
        const { document, editor } = await openDoc('x^a');
        await insertAt(editor, 0, 3, 'bc');
        assert.ok(await waitForLine(document, 0, 'x^{abc}'));
        await closeEditor();
    });
});
