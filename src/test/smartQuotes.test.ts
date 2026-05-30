import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForCondition, sleep } from './testUtils';

suite('Smart Quotes Test Suite', () => {
    test('" at start of line should become ``', async () => {
        const { document, editor } = await openDoc('');
        await insertAt(editor, 0, 0, '"');
        assert.ok(await waitForLine(document, 0, '``'));
        await closeEditor();
    });

    test('" after text should become \'\' (closing)', async () => {
        const { document, editor } = await openDoc('hello');
        await insertAt(editor, 0, 5, '"');
        assert.ok(await waitForCondition(() => document.lineAt(0).text.includes("''"), 500));
        await closeEditor();
    });

    test('" inside verbatim should stay "', async () => {
        const { document, editor } = await openDoc('\\begin{verbatim}\n\n\\end{verbatim}');
        await insertAt(editor, 1, 0, '"');
        await waitForCondition(() => document.lineAt(1).text === '"', 200);
        assert.strictEqual(document.lineAt(1).text, '"');
        await closeEditor();
    });
});
