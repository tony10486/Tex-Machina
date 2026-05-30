import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition, sleep } from './testUtils';

suite('Math Auto-Wrap Test Suite', () => {
    test('\\alpha space should become $\\alpha$', async () => {
        const { document, editor } = await openDoc('Let \\alpha');
        await insertAt(editor, 0, 10, ' ');
        assert.ok(await waitForLine(document, 0, 'Let $\\alpha$ '));
        await closeEditor();
    });

    test('\\sum space should become $\\sum$', async () => {
        const { document, editor } = await openDoc('Consider \\sum');
        await insertAt(editor, 0, 13, ' ');
        assert.ok(await waitForCondition(() => document.lineAt(0).text.includes('$\\sum$'), 500));
        await closeEditor();
    });

    test('Should NOT wrap already in math mode', async () => {
        const { document, editor } = await openDoc('$ \\alpha$');
        await insertAt(editor, 0, 8, ' ');
        await waitForCondition(() => document.lineAt(0).text === '$ \\alpha $', 200);
        assert.strictEqual(document.lineAt(0).text, '$ \\alpha $');
        await closeEditor();
    });

    test('Should NOT wrap inside \\text{\\alpha}', async () => {
        const { document, editor } = await openDoc('\\text{\\alpha}');
        await insertAt(editor, 0, 13, ' ');
        await waitForCondition(() => document.lineAt(0).text === '\\text{\\alpha} ', 200);
        assert.strictEqual(document.lineAt(0).text, '\\text{\\alpha} ');
        await closeEditor();
    });
});
