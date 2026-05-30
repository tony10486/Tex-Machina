import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForCondition } from './testUtils';

suite('Selection Wrap Test Suite', () => {
    test('Should wrap selection with subscript (_)', async () => {
        const { document, editor } = await openDoc('n+1');
        editor.selection = new vscode.Selection(0, 0, 0, 3);
        await vscode.commands.executeCommand('tex-machina.wrapSubscript');
        assert.ok(await waitForCondition(() => document.getText() === '_{n+1}'));
        await closeEditor();
    });

    test('Should wrap selection with superscript (^)', async () => {
        const { document, editor } = await openDoc('x+y');
        editor.selection = new vscode.Selection(0, 0, 0, 3);
        await vscode.commands.executeCommand('tex-machina.wrapSuperscript');
        assert.ok(await waitForCondition(() => document.getText() === '^{x+y}'));
        await closeEditor();
    });

    test('Should handle multiple selections', async () => {
        const { document, editor } = await openDoc('a b');
        editor.selections = [
            new vscode.Selection(0, 0, 0, 1),
            new vscode.Selection(0, 2, 0, 3)
        ];
        await vscode.commands.executeCommand('tex-machina.wrapSubscript');
        assert.ok(await waitForCondition(() => document.getText() === '_{a} _{b}'));
        await closeEditor();
    });

    test('Selection should be inside braces after wrap', async () => {
        const { document, editor } = await openDoc('abc');
        editor.selection = new vscode.Selection(0, 0, 0, 3);
        await vscode.commands.executeCommand('tex-machina.wrapSuperscript');
        assert.ok(await waitForCondition(() => document.getText().startsWith('^')));
        assert.strictEqual(document.getText(editor.selection), 'abc');
        assert.strictEqual(editor.selection.start.character, 2);
        assert.strictEqual(editor.selection.end.character, 5);
        await closeEditor();
    });

    test('No selection should NOT trigger wrap', async () => {
        const { document, editor } = await openDoc('abc');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.wrapSubscript');
        assert.strictEqual(document.getText(), 'abc');
        await closeEditor();
    });
});
