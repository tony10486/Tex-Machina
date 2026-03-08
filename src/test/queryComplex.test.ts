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

    test('Query Engine: State & Memory ($var, same-parent)', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{a.png}
    \\caption{One}
\\end{figure}
\\begin{figure}
    \\includegraphics{b.png}
    \\caption{Two}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        
        // Match img, save as $img, then find caption under SAME parent and update it using $img
        await engine.execute('; @img as $img && \\caption where same-parent($img) >> "Cap for $img"');
        await new Promise(r => setTimeout(r, 500));

        const text = document.getText();
        assert.ok(text.includes('Cap for \\includegraphics{a.png}'), 'Caption 1 should be updated');
        assert.ok(text.includes('Cap for \\includegraphics{b.png}'), 'Caption 2 should be updated');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: Counters (#i, #j)', async () => {
        const content = `\\section{A} \\section{B} \\section{C}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Update each section with global and local counters
        await engine.execute('; \\section >> "$$ (#i-#j)"');
        await new Promise(r => setTimeout(r, 500));

        const text = document.getText();
        assert.ok(text.includes('A (1-1)'), 'A should have 1-1');
        assert.ok(text.includes('B (2-2)'), 'B should have 2-2');
        assert.ok(text.includes('C (3-3)'), 'C should have 3-3');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
