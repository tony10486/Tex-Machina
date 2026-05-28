import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Markdown Test Suite', () => {
    test('Markdown: **bold** space should become \\textbf{bold} ', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '**bold**' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text === '\\textbf{bold} ') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.strictEqual(document.lineAt(0).text, '\\textbf{bold} ');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: - space at start should become itemize environment', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '-' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 1), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\begin{itemize}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(document.getText().includes('\\begin{itemize}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: #Section# space should become \\section{Section}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '#My Section#' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 12), ' ');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\section{My Section}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(document.lineAt(0).text.includes('\\section{My Section}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
