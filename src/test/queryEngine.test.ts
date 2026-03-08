import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('HSQEngine (Query Engine) Test Suite', () => {
    
    test('Query Engine: delete command', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{test.png}
\\end{figure}
텍스트
\\begin{equation}
    E=mc^2
\\end{equation}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; delete @fig');

        const text = document.getText();
        assert.ok(!text.includes('figure'), 'Figure should be deleted');
        assert.ok(text.includes('equation'), 'Equation should remain');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: duplicate command', async () => {
        const content = `
\\section{First}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; duplicate \\section');

        const text = document.getText();
        const matches = text.match(/\\section\{First\}/g);
        assert.strictEqual(matches?.length, 2, 'Section should be duplicated');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: replace with shortcut @eq', async () => {
        const content = `
\\begin{equation}
    a^2 + b^2 = c^2
\\end{equation}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Replace content of equation
        await engine.execute('; @eq:* >> "1+1=2"');

        const text = document.getText();
        assert.ok(text.includes('\\begin{equation}'), 'Equation environment should remain');
        assert.ok(text.includes('1+1=2'), 'Content should be replaced');
        assert.ok(!text.includes('a^2 + b^2 = c^2'), 'Old content should be gone');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: move command', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{test.png}
\\end{figure}
\\section{Target}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Move figure to after section
        await engine.execute('; move @fig >> \\section.|');

        const text = document.getText();
        const figIdx = text.indexOf('\\begin{figure}');
        const secIdx = text.indexOf('\\section{Target}');
        
        // Figure should be AFTER section now
        assert.ok(secIdx < figIdx, 'Figure should be moved after section');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: extract command', async () => {
        const content = `
Header
\\begin{equation}
    E=mc^2
\\end{equation}
Footer
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; extract @eq');

        const text = document.getText().trim();
        assert.ok(text.startsWith('\\begin{equation}'), 'Should only contain equation');
        assert.ok(!text.includes('Header'), 'Header should be removed');
        assert.ok(!text.includes('Footer'), 'Footer should be removed');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: logical filter "without"', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{has_caption.png}
    \\caption{Test}
\\end{figure}
\\begin{figure}
    \\includegraphics{no_caption.png}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Delete figures that don't have a caption
        await engine.execute('; delete @fig without \\caption');

        const text = document.getText();
        assert.ok(text.includes('has_caption.png'), 'Figure with caption should remain');
        assert.ok(!text.includes('no_caption.png'), 'Figure without caption should be deleted');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: logical filter "has"', async () => {
        const content = `
\\begin{equation}
    a=b
\\end{equation}
\\begin{equation}
    \\label{eq:important}
    c=d
\\end{equation}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Delete equations that HAVE a label
        await engine.execute('; delete @eq has \\label');

        const text = document.getText();
        assert.ok(text.includes('a=b'), 'Equation without label should remain');
        assert.ok(!text.includes('c=d'), 'Equation with label should be deleted');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: logical filter "where" with content', async () => {
        const content = `
\\section{Old Title}
\\section{Target Title}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Change section title only if content is "Target Title"
        await engine.execute('; find \\section where $$ == "Target Title" >> "New Title"');

        const text = document.getText();
        assert.ok(text.includes('\\section{Old Title}'), 'Other section should remain');
        assert.ok(text.includes('\\section{New Title}'), 'Target section should be renamed');
        assert.ok(!text.includes('Target Title'), 'Old target title should be gone');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: structural operator "><" (wrap)', async () => {
        const content = `\\includegraphics{test.png}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; @img >< figure');

        const text = document.getText();
        assert.ok(text.includes('\\begin{figure}'), 'Should be wrapped in figure');
        assert.ok(text.includes('\\includegraphics{test.png}'), 'Image should remain');
        assert.ok(text.includes('\\end{figure}'), 'Should have end figure');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: structural operator "<>" (unwrap)', async () => {
        const content = `\\begin{center}Target Content\\end{center}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; \\begin{center} <>');

        const text = document.getText().trim();
        assert.strictEqual(text, 'Target Content', 'Environment tags should be removed');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: structural operator ">+<" (surround)', async () => {
        const content = `a=b`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        await engine.execute('; a=b >+< "$"');

        const text = document.getText().trim();
        assert.strictEqual(text, '$a=b$', 'Should be surrounded by $');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: structural operator "^^" (pull out)', async () => {
        const content = `
\\begin{center}
    \\includegraphics{test.png}
\\end{center}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Pull image out of center environment
        await engine.execute('; @img ^^');

        const text = document.getText();
        assert.ok(text.includes('\\end{center}'), 'Center environment should remain');
        const imgIdx = text.indexOf('\\includegraphics');
        const centerEndIdx = text.indexOf('\\end{center}');
        assert.ok(imgIdx > centerEndIdx, 'Image should be moved after its parent environment');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: state & variables (#j, as $var)', async () => {
        const content = `
\\section{One}
\\section{Two}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Use #j counter and store content in variable
        await engine.execute('; find \\section as $old >> "Sec #j: $old"');

        const text = document.getText();
        assert.ok(text.includes('\\section{Sec 1: One}'), 'First section should have index 1 and old content');
        assert.ok(text.includes('\\section{Sec 2: Two}'), 'Second section should have index 2 and old content');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: precise cursors (before/after)', async () => {
        const content = `\\section{Title}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Prepend and Append using dedicated operators
        await engine.execute('; \\section <+ "% Header\\n" & \\section +> "\\n% Footer"');

        const text = document.getText();
        assert.ok(text.includes('% Header'), 'Should have header');
        assert.ok(text.includes('% Footer'), 'Should have footer');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: property math (#w += 10%)', async () => {
        const content = `\\includegraphics[width=100]{test.png}`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // Increase width by 10%
        await engine.execute('; @img >> #width := #width + 10%');

        const text = document.getText();
        assert.ok(text.includes('width=110'), 'Width should be increased to 110');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Query Engine: EXTREME Refactoring Scenario', async () => {
        const content = `
\\begin{figure}
    \\includegraphics[width=100]{fig1.png}
    \\caption{First Figure}
\\end{figure}
\\begin{figure}
    \\includegraphics[width=50]{fig2.png}
\\end{figure}
\\begin{equation}
    E=mc^2
\\end{equation}
\\section{Conclusion}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        
        // 1. Delete figures without caption
        await engine.execute('; delete @fig without \\caption');
        
        // 2. Increase image width by 20%
        await engine.execute('; @img >> #width := #width + 20%');
        
        // 3. Number the captions, keep original content, and make it bold
        await engine.execute('; \\caption:* as $cap >> "Figure #j: $cap" | + bold');
        
        // 4. Wrap equations in center environments
        await engine.execute('; @eq >< center');
        
        // 5. Append text to section
        await engine.execute('; \\section <+ "% Start\n" & \\section +> "\n% End"');

        const text = document.getText();
        console.log("FINAL TEXT:", text);
        
        // Assertions
        assert.ok(!text.includes('fig2.png'), 'Figure without caption should be deleted');
        assert.ok(text.includes('width=120'), 'Width 100 should become 120 (100 + 20%)');
        assert.ok(text.includes('\\caption{\\textbf{Figure 1: First Figure}}'), 'Caption should be numbered and bolded');
        assert.ok(text.includes('\\begin{center}\n\\begin{equation}'), 'Equations should be wrapped in center');
        assert.ok(/% Start\s*\\section/.test(text), 'Section should have prepended text');
        assert.ok(/Conclusion\}\s*% End/.test(text), 'Section should have appended text');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
