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

    test('$ -> \\[ breaks line when text precedes on same line', async () => {
        const { document, editor } = await openDoc('text $a = b$');
        editor.selection = new vscode.Selection(0, 6, 0, 6);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, 'text '));
        assert.ok(await waitForLine(document, 1, '\\['));
        assert.ok(await waitForLine(document, 2, '    a = b'));
        assert.ok(await waitForLine(document, 3, '\\]'));
        await closeEditor();
    });

    test('\\[ -> equation breaks line and preserves indent', async () => {
        const { document, editor } = await openDoc('text $a = b$');
        editor.selection = new vscode.Selection(0, 6, 0, 6);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        await waitForIncludes(document, '\\[');
        editor.selection = new vscode.Selection(1, 1, 1, 1);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, 'text '));
        assert.ok(await waitForLine(document, 1, '\\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '    a = b'));
        assert.ok(await waitForLine(document, 3, '\\end{equation}'));
        await closeEditor();
    });

    test('$$ -> equation (via fallback) breaks line with text before and after', async () => {
        const { document, editor } = await openDoc('text $$a = b$$ more');
        editor.selection = new vscode.Selection(0, 8, 0, 8);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, 'text '));
        assert.ok(await waitForLine(document, 1, '\\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '    a = b'));
        assert.ok(await waitForLine(document, 3, '\\end{equation} more'));
        await closeEditor();
    });

    test('Trailing text stays on same line as closing delimiter', async () => {
        const { document, editor } = await openDoc('text $$a = b$$ and more');
        editor.selection = new vscode.Selection(0, 8, 0, 8);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, '\\end{equation} and more'));
        await closeEditor();
    });

    test('Preserves indentation with $ -> \\[', async () => {
        const { document, editor } = await openDoc('    text $a = b$');
        editor.selection = new vscode.Selection(0, 10, 0, 10);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '    text '));
        assert.ok(await waitForLine(document, 1, '    \\['));
        assert.ok(await waitForLine(document, 2, '        a = b'));
        assert.ok(await waitForLine(document, 3, '    \\]'));
        await closeEditor();
    });

    test('Preserves indentation with $ -> equation (two toggles)', async () => {
        const { document, editor } = await openDoc('    text $a = b$');
        editor.selection = new vscode.Selection(0, 10, 0, 10);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        await waitForIncludes(document, '\\[');
        editor.selection = new vscode.Selection(1, 5, 1, 5);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '    text '));
        assert.ok(await waitForLine(document, 1, '    \\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '        a = b'));
        assert.ok(await waitForLine(document, 3, '    \\end{equation}'));
        await closeEditor();
    });

    test('$$ -> equation with indentation and trailing text', async () => {
        const { document, editor } = await openDoc('    text $$a = b$$ end');
        editor.selection = new vscode.Selection(0, 12, 0, 12);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '    text '));
        assert.ok(await waitForLine(document, 1, '    \\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '        a = b'));
        assert.ok(await waitForLine(document, 3, '    \\end{equation} end'));
        await closeEditor();
    });

    test('Inline $ with surrounding Korean text -> \\[', async () => {
        const { document, editor } = await openDoc('$H$와 $K$를 군 $G$의 부분군이라 하자. 그러면 $[G : H \\cap K]$는 유한하고');
        editor.selection = new vscode.Selection(0, 42, 0, 42);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForIncludes(document, '\\['));
        assert.ok(await waitForIncludes(document, '그러면'));
        assert.ok(await waitForLine(document, 1, '\\['));
        await closeEditor();
    });

    test('Complex: $$ -> equation with Korean text before and after', async () => {
        const { document, editor } = await openDoc('$H$와 $K$를 군 $G$의 유한 지표를 갖는 부분군이라 하자. 그러면 $$[G : H \\cap K]$$는 유한하고');
        editor.selection = new vscode.Selection(0, 56, 0, 56);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '$H$와 $K$를 군 $G$의 유한 지표를 갖는 부분군이라 하자. 그러면 '));
        assert.ok(await waitForLine(document, 1, '\\begin{equation}'));
        assert.ok(await waitForLine(document, 2, '    [G : H \\cap K]'));
        assert.ok(await waitForLine(document, 3, '\\end{equation}는 유한하고'));
        await closeEditor();
    });

    test('Join multiline equation into single inline $ when toggling back', async () => {
        const { document, editor } = await openDoc('\\begin{equation}\n    a = b\n\\end{equation}');
        editor.selection = new vscode.Selection(1, 4, 1, 4);
        await vscode.commands.executeCommand('tex-machina.toggleMathMode');
        assert.ok(await waitForLine(document, 0, '$a = b$'));
        await closeEditor();
    });
});
