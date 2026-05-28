import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Matrix Resizer Test Suite', () => {
    
    suite('Simple Feature Check', () => {
        test('Should add a row to bmatrix', async () => {
            const initial = '\\begin{bmatrix}\n    1 & 2\n\\end{bmatrix}';
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: initial });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));

            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
            await vscode.commands.executeCommand('tex-machina.matrix.addRow', { range });

            for (let i = 0; i < 20; i++) {
                if (document.getText().split('\\\\').length >= 2) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const result = document.getText();
            assert.ok(result.includes('\\\\'), "Should add row delimiter");
            // After fix, each row ends with \\, so 2 rows mean 2 \\
            const rowCount = (result.match(/\\\\/g) || []).length;
            assert.strictEqual(rowCount, 2, "Should have two logical rows indicated by \\\\");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Detailed Feature Check', () => {
        test('Should add a column to pmatrix', async () => {
            const initial = '\\begin{pmatrix}\n    a\n\\end{pmatrix}';
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: initial });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));

            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
            await vscode.commands.executeCommand('tex-machina.matrix.addCol', { range });

            for (let i = 0; i < 20; i++) {
                if (document.getText().includes('&')) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            assert.ok(document.getText().includes('&'), "Should add column separator");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Should handle nested structures correctly (e.g., fraction in cell)', async () => {
            const initial = '\\begin{bmatrix}\n    \\frac{1}{2} & b\n\\end{bmatrix}';
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: initial });
            await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));

            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(2, 13));
            await vscode.commands.executeCommand('tex-machina.matrix.removeCol', { range });

            for (let i = 0; i < 20; i++) {
                if (!document.getText().includes('&')) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const result = document.getText();
            assert.ok(result.includes('\\frac{1}{2}'), "Should preserve complex cell content");
            assert.ok(!result.includes('&'), "Should have removed the second column");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });
});
