import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForCondition, sleep, waitForExtension } from './testUtils';

suite('Structure Wrap Test Suite', () => {
    suiteSetup(async function () {
        this.timeout(30000);
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '' });
        await vscode.window.showTextDocument(doc);
        await waitForExtension();
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Should wrap a paragraph with theorem environment', async () => {
        const content = 'This is an important result.\nIt has far-reaching consequences.';
        const { document, editor } = await openDoc(content);
        const lastLine = document.lineAt(document.lineCount - 1);
        editor.selection = new vscode.Selection(lastLine.range.end, lastLine.range.end);
        await vscode.commands.executeCommand('tex-machina.wrapStructure', 'thm');
        await sleep(200);
        const text = document.getText();
        assert.ok(text.includes('\\begin{theorem}'));
        assert.ok(text.includes('\\end{theorem}'));
        assert.ok(text.includes('This is an important result.'));
        assert.ok(text.includes('It has far-reaching consequences.'));
        await closeEditor();
    });

    test('Should wrap display math with theorem environment', async () => {
        const { document, editor } = await openDoc('\\[E = mc^2\\]');
        editor.selection = new vscode.Selection(0, 12, 0, 12); // after \]
        await vscode.commands.executeCommand('tex-machina.wrapStructure', 'thm');
        await sleep(200);
        const text = document.getText();
        assert.ok(text.includes('\\begin{theorem}'));
        assert.ok(text.includes('\\end{theorem}'));
        assert.ok(text.includes('E = mc^2'));
        await closeEditor();
    });

    test('Should wrap display math ($$) with tcolorbox environment', async () => {
        const { document, editor } = await openDoc('$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$$');
        editor.selection = new vscode.Selection(0, 41, 0, 41);
        await vscode.commands.executeCommand('tex-machina.wrapStructure', 'box');
        await sleep(200);
        const text = document.getText();
        assert.ok(text.includes('\\begin{tcolorbox}'));
        assert.ok(text.includes('\\end{tcolorbox}'));
        assert.ok(text.includes('\\sum'));
        await closeEditor();
    });

    test('Should wrap with proof environment (no title)', async () => {
        const { document, editor } = await openDoc('This is a simple proof.');
        editor.selection = new vscode.Selection(0, 23, 0, 23);
        await vscode.commands.executeCommand('tex-machina.wrapStructure', 'proof');
        await sleep(200);
        const text = document.getText();
        assert.ok(text.includes('\\begin{proof}'));
        assert.ok(text.includes('\\end{proof}'));
        assert.ok(text.includes('This is a simple proof.'));
        await closeEditor();
    });

    test('Should show error for unknown environment', async () => {
        const { document, editor } = await openDoc('Some content here.');
        editor.selection = new vscode.Selection(0, 18, 0, 18);
        try {
            await vscode.commands.executeCommand('tex-machina.wrapStructure', 'unknown');
            assert.ok(true, 'Command did not throw');
        } catch {
            assert.fail('Command should not throw');
        }
        await sleep(100);
        assert.strictEqual(document.getText(), 'Some content here.');
        await closeEditor();
    });

    test('Should not wrap empty content', async () => {
        const { document, editor } = await openDoc('\n\n');
        editor.selection = new vscode.Selection(1, 0, 1, 0);
        await vscode.commands.executeCommand('tex-machina.wrapStructure', 'thm');
        await sleep(100);
        await closeEditor();
    });
});
