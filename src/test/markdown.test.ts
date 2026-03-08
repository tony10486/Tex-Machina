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
        const text = document.getText();
        assert.ok(text.includes('\\begin{itemize}'));
        assert.ok(text.includes('\\item'));
        assert.ok(text.includes('\\end{itemize}'));
        assert.strictEqual(editor.selection.active.line, 1);
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

    test('Markdown: ##Subsection## space should become \\subsection{Subsection}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '##My Sub##' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 10), ' ');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\subsection{My Sub}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(document.lineAt(0).text.includes('\\subsection{My Sub}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: > Text space should become gather environment', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '> a=b' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 5), ' ');
        });
        for (let i = 0; i < 20; i++) {
            if (document.getText().includes('\\begin{gather}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const text = document.getText();
        assert.ok(text.includes('\\begin{gather}'));
        assert.ok(text.includes('a=b'));
        assert.ok(text.includes('\\end{gather}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: *italic* space should become \\textit{italic}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '*italic*' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\textit{italic}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(document.lineAt(0).text.includes('\\textit{italic}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: ~~strike~~ space should become \\sout{strike}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '~~strike~~' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 10), ' ');
        });
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\sout{strike}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(document.lineAt(0).text.includes('\\sout{strike}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
