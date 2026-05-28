import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Env Auto-Delete Test Suite', function() {
    this.timeout(10000);

    test('Env Auto-Delete: Deleting \\begin{itemize} should delete matching \\end{itemize}', async () => {
        const content = '\\begin{itemize}\n  \\item Hello\n\\end{itemize}';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        await editor.edit(editBuilder => {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0));
            editBuilder.delete(range);
        });

        for (let i = 0; i < 20; i++) {
            if (!document.getText().includes('\\end{itemize}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const remainingText = document.getText();
        assert.ok(!remainingText.includes('\\end{itemize}'), "Matching \\end should be deleted");
        assert.ok(remainingText.includes('\\item Hello'), "Content should remain");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Env Auto-Delete: Deleting nested \\begin{itemize} should only delete its matching \\end', async () => {
        const content = '\\begin{itemize}\n  \\begin{itemize}\n    \\item Nested\n  \\end{itemize}\n\\end{itemize}';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        await editor.edit(editBuilder => {
            const range = new vscode.Range(new vscode.Position(1, 0), new vscode.Position(2, 0));
            editBuilder.delete(range);
        });

        for (let i = 0; i < 20; i++) {
            const matches = document.getText().match(/\\end\{itemize\}/g);
            if (matches && matches.length === 1) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const matches = document.getText().match(/\\end\{itemize\}/g);
        assert.strictEqual(matches?.length, 1, "Should have exactly one \\end{itemize} left");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
