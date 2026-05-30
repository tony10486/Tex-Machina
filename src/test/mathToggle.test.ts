import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForIncludes, sleep } from './testUtils';

suite('Math Toggle Test Suite', () => {
    teardown(async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('mathToggle.sequence', ['$', '\\[', 'equation'], vscode.ConfigurationTarget.Global);
        await closeEditor();
    });

    test('Cycle: $x$ to display \\[ x \\]', async () => {
        const { document, editor } = await openDoc('$x$');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, '\\['));
        await closeEditor();
    });

    test('Custom sequence: $ -> gather', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('mathToggle.sequence', ['$', 'gather'], vscode.ConfigurationTarget.Global);
        const { document, editor } = await openDoc('$a=b$');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, '\\begin{gather}'));
        await closeEditor();
    });

    test('Should preserve multiline content when toggling', async () => {
        const content = 'a = b \\\\\n c = d';
        const { document, editor } = await openDoc(`\\[\n${content}\n\\]`);
        editor.selection = new vscode.Selection(1, 0, 1, 0);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, 'c = d'));
        await closeEditor();
    });

    test('Should cycle through full sequence and return to $', async () => {
        const { document, editor } = await openDoc('$x$');
        editor.selection = new vscode.Selection(0, 1, 0, 1);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        await waitForIncludes(document, '\\[');
        editor.selection = new vscode.Selection(0, 2, 0, 2);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        await waitForIncludes(document, '\\begin{equation}');
        editor.selection = new vscode.Selection(1, 0, 1, 0);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, '$', 3000));
        await closeEditor();
    });
});
