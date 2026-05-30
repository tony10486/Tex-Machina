import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForCondition } from './testUtils';

function sel(editor: vscode.TextEditor) {
    return { line: editor.selection.start.line, start: editor.selection.start.character, end: editor.selection.end.character };
}

suite('Smart Tab in Tables Test Suite', () => {
    test('Tab: move from cell 0 to cell 1 in bmatrix', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    1 & 2 & 3\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(1, 4, 1, 5);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.start, 8);
        assert.strictEqual(s.end, 9);
        await closeEditor();
    });

    test('Tab: from last cell, insert &', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    1 & 2\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(1, 8, 1, 9);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        assert.ok(await waitForCondition(() => document.lineAt(1).text.includes('& 2 &'), 500));
        await closeEditor();
    });

    test('Shift+Tab: move from cell 2 to cell 1', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    1 & 2 & 3\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(1, 12, 1, 13);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentBackward');
        const s = sel(editor);
        assert.strictEqual(s.start, 8);
        assert.strictEqual(s.end, 9);
        await closeEditor();
    });

    test('Tab in tabular environment', async () => {
        const { document, editor } = await openDoc('\\begin{tabular}{cc}\na & b\n\\end{tabular}');
        editor.selection = new vscode.Selection(1, 0, 1, 1);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.start, 4);
        assert.strictEqual(s.end, 5);
        await closeEditor();
    });

    test('Tab in align environment', async () => {
        const { document, editor } = await openDoc('\\begin{align}\na &= b + c\n\\end{align}');
        editor.selection = new vscode.Selection(1, 0, 1, 1);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.start, 3);
        assert.strictEqual(s.end, 10);
        await closeEditor();
    });

    test('Tab not in table env falls through', async () => {
        const { document, editor } = await openDoc('\\author{asdf}\n\\advisor{aaaa}');
        editor.selection = new vscode.Selection(0, 8, 0, 12);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.line, 1);
        assert.strictEqual(s.start, 9);
        await closeEditor();
    });

    test('Tab in cases environment', async () => {
        const { document, editor } = await openDoc('\\begin{cases}\nx & y\n\\end{cases}');
        editor.selection = new vscode.Selection(1, 0, 1, 1);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.start, 4);
        assert.strictEqual(s.end, 5);
        await closeEditor();
    });

    test('Shift+Tab: from first cell on row to previous row', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    1 & 2 \\\\\n    3 & 4\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(2, 4, 2, 5);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentBackward');
        const s = sel(editor);
        assert.strictEqual(s.line, 1);
        assert.strictEqual(s.start, 8);
        assert.strictEqual(s.end, 9);
        await closeEditor();
    });

    test('Nested braces: & inside \\frac not counted', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    \\frac{1}{2} & 3\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(1, 4, 1, 17);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        const s = sel(editor);
        assert.strictEqual(s.start, 18);
        assert.strictEqual(s.end, 19);
        await closeEditor();
    });

    test('Tab cycles through cells then inserts', async () => {
        const { document, editor } = await openDoc('\\begin{bmatrix}\n    1 & 2\n\\end{bmatrix}');
        editor.selection = new vscode.Selection(1, 4, 1, 5);
        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        let s = sel(editor);
        assert.strictEqual(s.start, 8);

        await vscode.commands.executeCommand('tex-machina.navigateArgumentForward');
        assert.ok(await waitForCondition(() => document.lineAt(1).text.split('&').length >= 3, 500));
        await closeEditor();
    });
});
