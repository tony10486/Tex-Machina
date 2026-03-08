import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Auto-bracing Test Suite', () => {
    test('Auto-bracing: ^ab should become ^{ab}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text === 'x^{ab}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{ab}', "Text should be auto-braced");
        assert.strictEqual(editor.selection.active.character, 5, "Cursor should be inside braces");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Should not brace when disabled', async () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('autoBracing.enabled', false, vscode.ConfigurationTarget.Global);

        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(document.lineAt(0).text, 'x^ab', "Text should NOT be auto-braced when disabled");
        
        await config.update('autoBracing.enabled', true, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Should escape when Esc is pressed', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await vscode.commands.executeCommand('tex-machina.escapeAutoBracing');

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        assert.strictEqual(document.lineAt(0).text, 'x^ab', "Text should NOT be auto-braced after Esc");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Multiple nesting and fast typing simulation', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, 'c');
        });

        for (let i = 0; i < 30; i++) {
            if (document.lineAt(0).text.includes('x^{abc}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{abc}', "Should handle fast typing and accumulate into braces");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Nested subscripts x_a_b', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x_a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), '_');
        });
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 4), 'b');
        });

        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text.includes('{')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        assert.ok(document.lineAt(0).text.includes('b'), "Should contain 'b'");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: v_1, should NOT become v_{1,}', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'v_1' });
        const ed = await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 100));
        await ed.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), ',');
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(doc.lineAt(0).text, 'v_1,', "v_1, should NOT be auto-braced");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: v^n$ should NOT become v^{n$}', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'v^n' });
        const ed = await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 100));
        await ed.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), '$');
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(doc.lineAt(0).text, 'v^n$', "v^n$ should NOT be auto-braced");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: v_1) should NOT become v_{1)}', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'v_1' });
        const ed = await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 100));
        await ed.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), ')');
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(doc.lineAt(0).text, 'v_1)', "v_1) should NOT be auto-braced");
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
