import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('HSQEngine New Commands Test Suite', () => {
    
    test('Query Engine: exchange command', async () => {
        const content = `
\\section{One}
\\section{Two}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Exchange first section with second section
        // Syntax: ; exchange [target1] >> [target2]
        await engine.execute('; exchange \\section:first >> \\section:last');

        const text = document.getText();
        const firstIdx = text.indexOf('One');
        const secondIdx = text.indexOf('Two');
        
        assert.ok(firstIdx > secondIdx, 'One should be after Two after exchange');
        assert.ok(text.includes('\\section{Two}'), 'Section Two should exist');
        assert.ok(text.includes('\\section{One}'), 'Section One should exist');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: insert command', async () => {
        const content = `\\section{Title}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Insert text before section
        // Syntax: ; insert "Header\\n" >> .|\\section
        await engine.execute('; insert "Header\\n" >> .|\\section');

        const text = document.getText();
        assert.ok(text.startsWith('Header\n\\section{Title}'), 'Header should be inserted before section');

        // Insert text after section
        await engine.execute('; insert "\\nFooter" >> \\section.|');
        const text2 = document.getText();
        assert.ok(text2.endsWith('\\section{Title}\nFooter'), 'Footer should be inserted after section');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
