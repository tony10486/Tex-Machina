import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForLine, waitForCondition } from './testUtils';

function cursorPos(editor: vscode.TextEditor): { line: number; char: number } {
    return { line: editor.selection.active.line, char: editor.selection.active.character };
}

function lineText(document: vscode.TextDocument, line: number): string {
    return document.lineAt(line).text;
}

suite('Auto-indent on Enter Test Suite', () => {
    test('Enter after \\begin{itemize} inserts indented line', async () => {
        const { document, editor } = await openDoc('\\begin{itemize}\n\\end{itemize}');
        editor.selection = new vscode.Selection(0, 15, 0, 15);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 1, '    ', 500));
        assert.ok(await waitForLine(document, 2, '\\end{itemize}', 500));
        const c = cursorPos(editor);
        assert.strictEqual(c.line, 1);
        assert.strictEqual(c.char, 4);
        await closeEditor();
    });

    test('Enter after \\begin{env} with \\end on same line', async () => {
        const { document, editor } = await openDoc('\\begin{itemize}\\end{itemize}');
        editor.selection = new vscode.Selection(0, 15, 0, 15);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 1, '    ', 500));
        assert.ok(await waitForLine(document, 2, '\\end{itemize}', 500));
        await closeEditor();
    });

    test('Enter on \\end-only line inserts indented line before \\end', async () => {
        const { document, editor } = await openDoc('\\begin{enumerate}\n\\end{enumerate}');
        editor.selection = new vscode.Selection(1, 0, 1, 0);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 1, '    ', 500));
        assert.ok(await waitForLine(document, 2, '\\end{enumerate}', 500));
        const c = cursorPos(editor);
        assert.strictEqual(c.line, 1);
        assert.strictEqual(c.char, 4);
        await closeEditor();
    });

    test('Nested envs: indent stacks correctly', async () => {
        const { document, editor } = await openDoc('\\begin{document}\n    \\begin{itemize}\n    \\end{itemize}\n\\end{document}');
        editor.selection = new vscode.Selection(1, 19, 1, 19);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 2, '        ', 500));
        const c = cursorPos(editor);
        assert.strictEqual(c.line, 2);
        assert.strictEqual(c.char, 8);
        await closeEditor();
    });

    test('Inline \\begin{env}: Enter after it splits line', async () => {
        const { document, editor } = await openDoc('text \\begin{itemize} more');
        editor.selection = new vscode.Selection(0, 20, 0, 20);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 0, 'text \\begin{itemize}', 500));
        assert.ok(await waitForLine(document, 1, '     more', 500));
        await closeEditor();
    });

    test('Enter outside any env falls through', async () => {
        const { document, editor } = await openDoc('plain text');
        editor.selection = new vscode.Selection(0, 5, 0, 5);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForCondition(() => document.lineCount > 1, 500));
        await closeEditor();
    });

    test('Enter in comment falls through', async () => {
        const { document, editor } = await openDoc('% \\begin{itemize}');
        editor.selection = new vscode.Selection(0, 17, 0, 17);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForCondition(() => document.lineCount > 1, 500));
        assert.strictEqual(lineText(document, 0), '% \\begin{itemize}');
        await closeEditor();
    });

    test('\\end indentation matches \\begin after Enter', async () => {
        const { document, editor } = await openDoc('    \\begin{figure}\n\\end{figure}');
        editor.selection = new vscode.Selection(0, 19, 0, 19);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 1, '        ', 500));
        assert.ok(await waitForLine(document, 2, '    \\end{figure}', 500));
        await closeEditor();
    });

    test('Tab-based indentation', async () => {
        const { document, editor } = await openDoc('\\begin{itemize}\n\\end{itemize}');
        await vscode.workspace.getConfiguration('editor').update('insertSpaces', false, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('editor').update('tabSize', 4, vscode.ConfigurationTarget.Global);
        editor.selection = new vscode.Selection(0, 15, 0, 15);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForLine(document, 1, '\t', 500));
        assert.ok(await waitForLine(document, 2, '\\end{itemize}', 500));
        await vscode.workspace.getConfiguration('editor').update('insertSpaces', true, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('editor').update('tabSize', undefined, vscode.ConfigurationTarget.Global);
        await closeEditor();
    });

    test('Math ENV_CONFIG envs still insert \\\\ and &', async () => {
        const { document, editor } = await openDoc('\\begin{align}\na &= b\n\\end{align}');
        editor.selection = new vscode.Selection(1, 6, 1, 6);
        await vscode.commands.executeCommand('tex-machina.smartNewline');
        assert.ok(await waitForIncludes(document, '\\\\', 500));
        await closeEditor();
    });
});

function waitForIncludes(document: vscode.TextDocument, substring: string, timeout = 500): Promise<boolean> {
    const start = Date.now();
    return new Promise(resolve => {
        const check = () => {
            if (document.getText().includes(substring)) { resolve(true); return; }
            if (Date.now() - start >= timeout) { resolve(document.getText().includes(substring)); return; }
            setTimeout(check, 10);
        };
        check();
    });
}
