import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForNotIncludes, waitForCondition } from './testUtils';

suite('Env Auto-Delete Test Suite', function () {
    this.timeout(10000);

    test('Deleting \\begin{itemize} should delete matching \\end{itemize}', async () => {
        const content = '\\begin{itemize}\n  \\item Hello\n\\end{itemize}';
        const { document, editor } = await openDoc(content);
        await editor.edit(eb => {
            eb.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)));
        });
        assert.ok(await waitForNotIncludes(document, '\\end{itemize}'));
        assert.ok(document.getText().includes('\\item Hello'));
        await closeEditor();
    });

    test('Deleting nested \\begin{itemize} should only delete its matching \\end', async () => {
        const content = '\\begin{itemize}\n  \\begin{itemize}\n    \\item Nested\n  \\end{itemize}\n\\end{itemize}';
        const { document, editor } = await openDoc(content);
        await editor.edit(eb => {
            eb.delete(new vscode.Range(new vscode.Position(1, 2), new vscode.Position(2, 4)));
        });
        assert.ok(await waitForCondition(() => {
            const m = document.getText().match(/\\end\{itemize\}/g);
            return m !== null && m.length === 1;
        }, 1000));
        await closeEditor();
    });

    test('Deleting \\begin{equation} should delete matching \\end{equation}', async () => {
        const content = '\\begin{equation}\nx = 1\n\\end{equation}';
        const { document, editor } = await openDoc(content);
        await editor.edit(eb => {
            eb.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)));
        });
        assert.ok(await waitForNotIncludes(document, '\\end{equation}'));
        await closeEditor();
    });

    test('Deleting \\begin{align} should delete matching \\end{align}', async () => {
        const content = '\\begin{align}\na &= b\n\\end{align}';
        const { document, editor } = await openDoc(content);
        await editor.edit(eb => {
            eb.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)));
        });
        assert.ok(await waitForNotIncludes(document, '\\end{align}'));
        await closeEditor();
    });
});
