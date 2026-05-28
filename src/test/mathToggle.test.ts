import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Math Toggle Test Suite', () => {
    
    suite('Simple Feature Check', () => {
        test('Cycle: inline $x$ to display \\[ x \\]', async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '$x$' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 1, 0, 1);
            await vscode.commands.executeCommand('tex-machina.toggleMathMode');
            for (let i = 0; i < 20; i++) {
                // Check for either \[ or $$ depending on the default sequence
                const text = document.getText();
                if (text.includes('\\[') || text.includes('$$')) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            const result = document.getText();
            assert.ok(result.includes('\\[') || result.includes('$$'), "Should convert to a display math format");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });

    suite('Detailed Feature Check', () => {
        test('Cycle: Should respect custom sequence (e.g., $ -> gather)', async () => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            await config.update('mathToggle.sequence', ['$', 'gather'], vscode.ConfigurationTarget.Global);
            
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '$a=b$' });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(0, 1, 0, 1);
            await vscode.commands.executeCommand('tex-machina.toggleMathMode');
            for (let i = 0; i < 20; i++) {
                if (document.getText().includes('\\begin{gather}')) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(document.getText().includes('\\begin{gather}'), "Should follow custom sequence");
            
            // Cleanup
            await config.update('mathToggle.sequence', ['$', '\\[', 'equation'], vscode.ConfigurationTarget.Global);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('Complex Content: Should preserve multiline content when toggling', async () => {
            const content = 'a = b \\\\\n c = d';
            const document = await vscode.workspace.openTextDocument({ language: 'latex', content: `\\[\n${content}\n\\]` });
            const editor = await vscode.window.showTextDocument(document);
            await new Promise(resolve => setTimeout(resolve, 500));
            editor.selection = new vscode.Selection(1, 0, 1, 0);
            await vscode.commands.executeCommand('tex-machina.toggleMathMode');
            for (let i = 0; i < 20; i++) {
                if (document.getText().includes('\\begin{equation}')) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(document.getText().includes('c = d'), "Should preserve complex content");
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });
    });
});
