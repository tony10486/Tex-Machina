import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('HSQEngine Complex Query Test Suite', () => {
    
    test('Query Engine: Multi-action with braces { }', async () => {
        const content = `\\includegraphics[width=100]{old.png}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Change filename and scale width
        await engine.execute('; @img { >> "new/$$" , >> #width -= 20% }');

        const text = document.getText();
        assert.ok(text.includes('new/old.png'), 'Filename should be updated');
        assert.ok(text.includes('width=80'), 'Width should be reduced by 20%');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: Trait operators (+ bold, - clear)', async () => {
        const content = `Normal \\textbf{Bold} Text`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Clear bold from "Bold" and add bold to "Normal"
        await engine.execute('; \\\\textbf | - clear && find Normal | + bold');

        const text = document.getText();
        assert.ok(text.includes('\\\\textbf{Normal}'), 'Normal should become bold');
        assert.ok(!text.includes('\\\\textbf{Bold}'), 'Bold should be cleared');
        assert.ok(text.includes(' Bold '), 'Bold text should remain as plain text');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: Order by', async () => {
        const content = `\\section{Gamma} \\section{Alpha} \\section{Beta}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Sort by content ($$) and label them
        await engine.execute('; find \\section order by $$ & >> "$$ (#j)"');

        const text = document.getText();
        // Alpha(1), Beta(2), Gamma(3)
        assert.ok(text.includes('Alpha (1)'), 'Alpha should be 1st after sort');
        assert.ok(text.includes('Beta (2)'), 'Beta should be 2nd after sort');
        assert.ok(text.includes('Gamma (3)'), 'Gamma should be 3rd after sort');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
