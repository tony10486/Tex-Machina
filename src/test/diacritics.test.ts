import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForLine } from './testUtils';

suite('Diacritics Test Suite', () => {
    test('addHat should wrap character before cursor', async () => {
        const { document, editor } = await openDoc('a');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.addHat');
        assert.strictEqual(document.lineAt(0).text, '\\hat{a}');
        await closeEditor();
    });

    test('addTilde should wrap character', async () => {
        const { document, editor } = await openDoc('n');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.addTilde');
        assert.strictEqual(document.lineAt(0).text, '\\tilde{n}');
        await closeEditor();
    });

    test('addDot should wrap character', async () => {
        const { document, editor } = await openDoc('x');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.addDot');
        assert.strictEqual(document.lineAt(0).text, '\\dot{x}');
        assert.strictEqual(editor.selection.active.character, 7);
        await closeEditor();
    });

    test('addDot on empty line should create \\dot{}', async () => {
        const { document, editor } = await openDoc('');
        await vscode.commands.executeCommand('tex-machina.addDot');
        assert.strictEqual(document.lineAt(0).text, '\\dot{}');
        assert.strictEqual(editor.selection.active.character, 5);
        await closeEditor();
    });

    test('addHat on multi-char selection should wrap selection', async () => {
        const { document, editor } = await openDoc('ab');
        editor.selection = new vscode.Selection(0, 0, 0, 2);
        await vscode.commands.executeCommand('tex-machina.addHat');
        assert.strictEqual(document.lineAt(0).text, '\\hat{ab}');
        await closeEditor();
    });
});
