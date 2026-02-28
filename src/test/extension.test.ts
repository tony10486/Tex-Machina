import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseUserCommand } from '../core/commandParser';
import { splitMathString } from '../core/mathSplitter';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Command Parser: Basic diff command', () => {
        const input = "diff > x";
        const selection = "x^2 + y";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "diff");
        assert.deepStrictEqual(result.subCommands, ["x"]);
        assert.strictEqual(result.rawSelection, selection);
	});

    test('Command Parser: Command with parallel options', () => {
        const input = "taylor > x, 5 / newline / step=2";
        const selection = "sin(x)";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "taylor");
        assert.deepStrictEqual(result.subCommands, ["x, 5"]);
        assert.deepStrictEqual(result.parallelOptions, ["newline", "step=2"]);
    });

    test('Command Parser: Multiple subcommands', () => {
        const input = "solve > x > real";
        const selection = "x^2 - 1 = 0";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "solve");
        assert.deepStrictEqual(result.subCommands, ["x", "real"]);
    });

    test('Auto-bracing: ^ab should become ^{ab}', async () => {
        // Create a new LaTeX document
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        
        // Wait for the document to be fully loaded and active
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate typing 'b' at the end of 'x^a'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        // The onDidChangeTextDocument listener in our extension should trigger.
        // It uses await editor.edit, so it might take a moment to propagate.
        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text === 'x^{ab}') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{ab}', "Text should be auto-braced");
        // x(0)^(1){(2)a(3)b(4)}(5)
        // Our code sets selection to position charOffset + 1.
        // charOffset was 4 (after 'b'). So new position is 5 (after 'b', before '}').
        assert.strictEqual(editor.selection.active.character, 5, "Cursor should be inside braces");
        
        // Cleanup: close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Should not brace when disabled', async () => {
        // Disable auto-bracing in configuration
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('autoBracing.enabled', false, vscode.ConfigurationTarget.Global);

        // Create a new LaTeX document
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate typing 'b' at the end of 'x^a'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        // Wait a bit and check if it did NOT brace
        await new Promise(resolve => setTimeout(resolve, 500));

        assert.strictEqual(document.lineAt(0).text, 'x^ab', "Text should NOT be auto-braced when disabled");
        
        // Reset configuration
        await config.update('autoBracing.enabled', true, vscode.ConfigurationTarget.Global);
        
        // Cleanup: close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Should escape when Esc is pressed', async () => {
        // Create a new LaTeX document
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate pressing Esc
        await vscode.commands.executeCommand('tex-machina.escapeAutoBracing');

        // Simulate typing 'b' at the end of 'x^a'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        // Wait a bit and check if it did NOT brace
        await new Promise(resolve => setTimeout(resolve, 500));

        assert.strictEqual(document.lineAt(0).text, 'x^ab', "Text should NOT be auto-braced after Esc");
        
        // Cleanup: close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Math Splitter: Basic splitting at equal signs', () => {
        const input = "$a = b + c + d = e$";
        // Should only split at '='
        const expected = "\\begin{align}\n    a &= b + c + d \\\\\n    &= e\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: Respect nesting with equal signs', () => {
        const input = "$$f(x) = \\sum_{i=0}^{n} a_i x^i = 0$$";
        const expected = "\\begin{align}\n    f(x) &= \\sum_{i=0}^{n} a_i x^i \\\\\n    &= 0\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: No operators at top level', () => {
        const input = "$a + b$";
        const result = splitMathString(input);
        assert.strictEqual(result, input); // No '=' means no split
    });

    test('Math Splitter: Handle display math \\[ \\]', () => {
        const input = "\\[x = y = z\\]";
        const expected = "\\begin{align}\n    x &= y \\\\\n    &= z\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: Handle raw text without delimiters', () => {
        const input = "y''' + y'' + y' + 12 = 0 =";
        const result = splitMathString(input);
        // Should only split at the first '='
        assert.ok(result.startsWith("\\begin{align}"));
        assert.ok(result.includes("y''' + y'' + y' + 12 &= 0 ="));
        assert.ok(result.endsWith("\\end{align}"));
    });
});
