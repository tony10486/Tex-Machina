import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForIncludes, waitForLine, sleep } from './testUtils';

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

    test('Should break line when text precedes $$ on same line and toggle to equation', async () => {
        const { document, editor } = await openDoc('text $$a = b$$');
        editor.selection = new vscode.Selection(0, 8, 0, 8);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, 'text '));
        assert.ok(await waitForLine(document, 1, '\\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '    a = b'));
        assert.ok(await waitForLine(document, 3, '\\end{equation}'));
        await closeEditor();
    });

    test('Should preserve indentation when $$ with surrounding text toggles to equation', async () => {
        const { document, editor } = await openDoc('    text $$a = b$$');
        editor.selection = new vscode.Selection(0, 12, 0, 12);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 1, '    \\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '        a = b'));
        assert.ok(await waitForLine(document, 3, '    \\end{equation}'));
        await closeEditor();
    });

    test('Should push trailing text to next line when text follows $$', async () => {
        const { document, editor } = await openDoc('text $$a = b$$ more');
        editor.selection = new vscode.Selection(0, 8, 0, 8);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 4, 'more'));
        await closeEditor();
    });

    test('Should join multiline equation into single inline $ when toggling back', async () => {
        const { document, editor } = await openDoc('\\begin{equation}\n    a = b\n\\end{equation}');
        editor.selection = new vscode.Selection(1, 4, 1, 4);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '$a = b$'));
        await closeEditor();
    });
});
