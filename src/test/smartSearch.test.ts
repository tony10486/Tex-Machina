import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseSmartQuery, performSmartSearchInject } from '../core/smartSearch';

suite('Smart Search and Inject Test Suite', () => {
    
    // --- parseSmartQuery Tests ---

    test('parseSmartQuery: complex query with parent and not', () => {
        const input = "('figure > \\includegraphics:not([alt])').inject('alt={}')";
        const query = parseSmartQuery(input);
        
        assert.ok(query, "Query should not be null");
        assert.strictEqual(query!.parentEnv, "figure");
        assert.strictEqual(query!.targetCmd, "includegraphics");
        assert.strictEqual(query!.excludeAttr, "alt");
        assert.strictEqual(query!.injection, "alt={}");
    });

    test('parseSmartQuery: simple command query', () => {
        const input = "(\\section).inject('% TODO')";
        const query = parseSmartQuery(input);
        
        assert.ok(query, "Simple query should not be null");
        assert.strictEqual(query!.parentEnv, undefined);
        assert.strictEqual(query!.targetCmd, "section");
        assert.strictEqual(query!.excludeAttr, undefined);
        assert.strictEqual(query!.injection, "% TODO");
    });

    test('parseSmartQuery: handle various quoting and backslashes', () => {
        // Backslashes can be zero or more in the selector string
        assert.strictEqual(parseSmartQuery("('includegraphics').inject('opt=val')")?.targetCmd, "includegraphics");
        assert.strictEqual(parseSmartQuery("('\\includegraphics').inject('opt=val')")?.targetCmd, "includegraphics");
        assert.strictEqual(parseSmartQuery("('\\\\includegraphics').inject('opt=val')")?.targetCmd, "includegraphics");
        
        // Double quotes
        assert.strictEqual(parseSmartQuery("(\"figure > \\\\includegraphics\").inject(\"alt={}\")")?.parentEnv, "figure");
    });

    test('parseSmartQuery: should return null for invalid format', () => {
        assert.strictEqual(parseSmartQuery("invalid query"), null);
        assert.strictEqual(parseSmartQuery("().inject('')"), null);
    });


    // --- performSmartSearchInject Tests ---

    test('performSmartSearchInject: inject alt into includegraphics inside figure', async () => {
        const content = `
\\begin{figure}
    \\includegraphics{test.png}
    \\includegraphics[width=10cm]{test2.png}
\\end{figure}
\\includegraphics{outside.png}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const query = "('figure > \\includegraphics:not([alt])').inject('alt={}')";
        const editCount = await performSmartSearchInject(editor, query);

        assert.strictEqual(editCount, 2, "Should have made 2 edits inside figure");
        
        const text = document.getText();
        assert.ok(text.includes("\\includegraphics[alt={}]{test.png}"), "First image should have alt");
        assert.ok(text.includes("\\includegraphics[width=10cm, alt={}]{test2.png}"), "Second image should have alt added to options");
        assert.ok(text.includes("\\includegraphics{outside.png}"), "Outside image should NOT be touched");

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('performSmartSearchInject: skip if excludeAttr exists', async () => {
        const content = `
\\begin{figure}
    \\includegraphics[alt={already here}]{test.png}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const query = "('figure > \\includegraphics:not([alt])').inject('alt={}')";
        const editCount = await performSmartSearchInject(editor, query);

        assert.strictEqual(editCount, 0, "Should skip as alt already exists");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('performSmartSearchInject: nested environment support', async () => {
        const content = `
\\begin{figure}
    \\begin{figure}
        \\includegraphics{nested.png}
    \\end{figure}
    \\includegraphics{top.png}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const query = "('figure > \\includegraphics').inject('[nested_ok]')";
        // Injection without '=' just appends text to the match
        const editCount = await performSmartSearchInject(editor, query);

        assert.strictEqual(editCount, 2, "Should find both nested and top images in figure");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('performSmartSearchInject: simple injection (no =)', async () => {
        const content = "\\section{Intro}";
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const query = "(\\section).inject('% TODO')";
        await performSmartSearchInject(editor, query);

        assert.strictEqual(document.getText(), "\\section{Intro}% TODO");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
