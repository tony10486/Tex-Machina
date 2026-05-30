import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, waitForIncludes, waitForNotIncludes, waitForCondition } from './testUtils';

suite('Matrix Resizer Test Suite', () => {
    test('Should add a row to bmatrix', async () => {
        const initial = '\\begin{bmatrix}\n    1 & 2\n\\end{bmatrix}';
        const { document } = await openDoc(initial);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
        await vscode.commands.executeCommand('tex-machina.matrix.addRow', { range });
        assert.ok(await waitForCondition(() => {
            const count = (document.getText().match(/\\\\/g) || []).length;
            return count >= 2;
        }));
        await closeEditor();
    });

    test('Should add a column to pmatrix', async () => {
        const initial = '\\begin{pmatrix}\n    a\n\\end{pmatrix}';
        const { document } = await openDoc(initial);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
        await vscode.commands.executeCommand('tex-machina.matrix.addCol', { range });
        assert.ok(await waitForIncludes(document, '&'));
        await closeEditor();
    });

    test('Should remove a column and preserve complex cell (\\frac)', async () => {
        const initial = '\\begin{bmatrix}\n    \\frac{1}{2} & b\n\\end{bmatrix}';
        const { document } = await openDoc(initial);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
        await vscode.commands.executeCommand('tex-machina.matrix.removeCol', { range });
        assert.ok(await waitForCondition(() => document.getText().includes('\\frac{1}{2}') && !document.getText().includes('&'), 500));
        await closeEditor();
    });

    test('Should remove a row from 2x1 bmatrix', async () => {
        const initial = '\\begin{bmatrix}\n    a \\\\\n    b\n\\end{bmatrix}';
        const { document } = await openDoc(initial);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(3, 13));
        await vscode.commands.executeCommand('tex-machina.matrix.removeRow', { range });
        assert.ok(await waitForCondition(() => {
            return !document.getText().includes('b') || document.getText().split('\\\\').length <= 2;
        }));
        await closeEditor();
    });
});
