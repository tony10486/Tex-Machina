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
        // Clear bold from "Bold"
        await engine.execute('; \\\\textbf | - clear');
        await new Promise(r => setTimeout(r, 500)); // Wait for document update
        let text = document.getText();
        
        // add bold to "Normal"
        await engine.execute('; find Normal | + bold');
        await new Promise(r => setTimeout(r, 500));
        text = document.getText();

        assert.ok(text.includes('\\textbf{Normal}'), `Normal should become bold. Text: [${text}]`);
        assert.ok(!text.includes('\\textbf{Bold}'), `Bold should be cleared. Text: [${text}]`);
        assert.ok(text.includes('Bold'), `Bold text should remain. Text: [${text}]`);

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

    test('Query Engine: Order by #width', async () => {
        const content = `\\includegraphics[width=100]{c.png} \\includegraphics[width=50]{a.png} \\includegraphics[width=80]{b.png}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Sort by width and label them
        await engine.execute('; @img order by #width & >> "$$ (#j)"');

        const text = document.getText();
        // a.png (1), b.png (2), c.png (3)
        assert.ok(text.includes('a.png (1)'), 'a.png should be 1st (width 50)');
        assert.ok(text.includes('b.png (2)'), 'b.png should be 2nd (width 80)');
        assert.ok(text.includes('c.png (3)'), 'c.png should be 3rd (width 100)');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: Logical Combinations (and, or, not)', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{a.png}
    \\caption{Target}
\\end{figure}
\\begin{figure}
    \\includegraphics{b.png}
    \\caption{Other}
\\end{figure}
\\begin{figure}
    \\includegraphics{c.png}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        
        // Match figures that have a caption AND caption matches /Target/
        await engine.execute('; @fig where has \\caption and ^(\\caption where $$ matches /Target/)^ >> #marked=yes');
        await new Promise(r => setTimeout(r, 500));

        // Match figures that do NOT have a caption OR caption is NOT Target
        await engine.execute('; @fig where without \\caption or not ^(\\caption where $$ matches /Target/)^ >> #other=yes');
        await new Promise(r => setTimeout(r, 500));

        const text = document.getText();
        assert.ok(text.includes('marked=yes'), `marked=yes should be present. Text: [${text}]`);
        assert.ok(text.includes('a.png') && text.includes('marked=yes'), 'a.png should be marked');
        assert.ok(text.includes('b.png') && text.includes('other=yes'), 'b.png should be other');
        assert.ok(text.includes('c.png') && text.includes('other=yes'), 'c.png should be other');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
