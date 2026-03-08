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

    test('Query Engine: @cell shortcut and :nth(n)', async () => {
        const content = `
\\begin{tabular}{cc}
    A & B \\\\
    C & D
\\end{tabular}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Replace 3rd cell (which is C)
        await engine.execute('; @cell:nth(3) >> "X"');

        const text = document.getText();
        assert.ok(text.includes('A & B'), 'A and B should remain');
        assert.ok(text.includes('X & D'), 'C should be replaced by X');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: inline filter [attr=val]', async () => {
        const content = `\\includegraphics[width=50]{fig1.png}\\includegraphics[width=100]{fig2.png}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Delete only images with width=50
        await engine.execute('; delete @img[#width==50]');

        const text = document.getText();
        assert.ok(!text.includes('fig1.png'), 'fig1 should be deleted');
        assert.ok(text.includes('fig2.png'), 'fig2 should remain');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: self-reference _ and subquery ^()^', async () => {
        const content = `
\\begin{figure}
    \\includegraphics[width=100]{test.png}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Use subquery to find if any \includegraphics inside
        await engine.execute('; @fig where ^(... \includegraphics)^ >> "Matched"');

        const text = document.getText();
        assert.ok(text.includes('Matched'), 'Should match figure containing includegraphics');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
