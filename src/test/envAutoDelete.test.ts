import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Env Auto-Delete Test Suite', function() {
    this.timeout(10000); // Increase timeout to 10 seconds

    test('Env Auto-Delete: Deleting \\begin{itemize} should delete matching \\end{itemize}', async () => {
        const content = '\\begin{itemize}\n  \\item Hello\n\\end{itemize}';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        
        // Wait for registerEnvAutoDelete to initialize state
        await new Promise(resolve => setTimeout(resolve, 500));

        // Delete the first line: \begin{itemize}\n
        await editor.edit(editBuilder => {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0));
            editBuilder.delete(range);
        });

        // Wait for the event handler to trigger and apply the second edit
        for (let i = 0; i < 20; i++) {
            if (!document.getText().includes('\\end{itemize}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const remainingText = document.getText();
        assert.ok(!remainingText.includes('\\end{itemize}'), "The matching \\end{itemize} should have been deleted");
        assert.ok(remainingText.includes('\\item Hello'), "The content should still be there");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Env Auto-Delete: Deleting nested \\begin{itemize} should only delete its matching \\end', async () => {
        const content = '\\begin{itemize}\n  \\begin{itemize}\n    \\item Nested\n  \\end{itemize}\n\\end{itemize}';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        // Delete the nested \begin{itemize} (line 1)
        await editor.edit(editBuilder => {
            const range = new vscode.Range(new vscode.Position(1, 0), new vscode.Position(2, 0));
            editBuilder.delete(range);
        });

        for (let i = 0; i < 20; i++) {
            // Check if there's only one \end{itemize} left
            const matches = document.getText().match(/\\end\{itemize\}/g);
            if (matches && matches.length === 1) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const remainingText = document.getText();
        const matches = remainingText.match(/\\end\{itemize\}/g);
        assert.strictEqual(matches?.length, 1, "There should be exactly one \\end{itemize} left (the outer one)");
        assert.ok(remainingText.includes('\\begin{itemize}'), "The outer \\begin{itemize} should remain");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Env Auto-Delete: Should work with starred environments like align*', async () => {
        const content = '\\begin{align*}\n  a &= b\n\\end{align*}';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        await editor.edit(editBuilder => {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0));
            editBuilder.delete(range);
        });

        for (let i = 0; i < 20; i++) {
            if (!document.getText().includes('\\end{align*}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.ok(!document.getText().includes('\\end{align*}'), "\\end{align*} should be deleted");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
