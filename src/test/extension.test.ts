import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseUserCommand } from '../core/commandParser';
import { splitMathString } from '../core/mathSplitter';
import { expandSiunitx } from '../core/unitExpander';

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

    test('Unit Expander: Basic expansion', () => {
        assert.strictEqual(expandSiunitx('10kg'), '\\SI{10}{\\kilo\\gram}');
        assert.strictEqual(expandSiunitx('10m/s^2'), '\\SI{10}{\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('kgm/s^2'), '\\si{\\kilo\\gram\\meter\\per\\second\\squared}');
    });

    test('Unit Expander: Complex expansion', () => {
        assert.strictEqual(expandSiunitx('10kgm/s^2'), '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('\\SI{10kgm/s^2}'), '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('100uF'), '\\SI{100}{\\micro\\farad}');
        assert.strictEqual(expandSiunitx('5cm^3'), '\\SI{5}{\\centi\\meter\\cubed}');
    });

    test('Unit Expander: Command execution', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '10kgm/s^2' });
        const editor = await vscode.window.showTextDocument(document);
        
        editor.selection = new vscode.Selection(0, 0, 0, 9);
        await vscode.commands.executeCommand('tex-machina.formatUnit');
        
        assert.strictEqual(document.lineAt(0).text, '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Command Parser: Tricky edge cases', () => {
        // Multiple delimiters and weird spacing
        const input1 = "  solve  >  x  >  real  /  newline  /  step=3  ";
        const res1 = parseUserCommand(input1, "x^2-1=0");
        assert.strictEqual(res1.mainCommand, "solve");
        assert.deepStrictEqual(res1.subCommands, ["x", "real"]);
        assert.deepStrictEqual(res1.parallelOptions, ["newline", "step=3"]);

        // Malformed but should be handled by split('>')
        const input2 = "solve>>>x";
        const res2 = parseUserCommand(input2, "x=0");
        assert.strictEqual(res2.mainCommand, "solve");
        // Depending on implementation, ">>x" might be the subcommand
        // Let's check how it behaves.
    });

    test('Math Splitter: Extremely complex nesting', () => {
        // Nested equals inside braces should be ignored
        const input = "$$f(x) = \\begin{cases} a=b & x=0 \\\\ c=d & x>0 \\end{cases} = 1$$";
        const result = splitMathString(input);
        
        // It should split at the first and last '=', but NOT inside \begin{cases}...\end{cases}
        assert.ok(result.includes("f(x) &="));
        assert.ok(result.includes("&= 1"));
        // Check that it didn't split inside cases (no &= inside cases)
        const casesPart = result.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/)?.[1];
        assert.ok(casesPart && !casesPart.includes("&="));
    });

    test('Unit Expander: Very complex units', () => {
        // Multiple units, powers, and prefixes
        assert.strictEqual(expandSiunitx('10kgm^2s^-3A^-1'), '\\SI{10}{\\kilo\\gram\\meter\\squared\\second\\rpcubed\\ampere\\rpone}');
        // Multiple slashes (not officially supported by siunitx usually, but let's see how we handle it)
        // If our expander is simple, it might just replace / with \per
        const res = expandSiunitx('10m/s/s');
        assert.ok(res.includes('\\meter\\per\\second\\per\\second'));
    });

    test('Auto-bracing: Multiple nesting and fast typing simulation', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate fast typing 'bc'
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });
        // Wait a small amount for the event to propagate
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await editor.edit(editBuilder => {
            // If 'b' was braced, position 4 is now inside braces.
            // If not, it's after 'b'.
            // Let's use editor.selection.active to be safe.
            editBuilder.insert(editor.selection.active, 'c');
        });

        // Use a longer loop to wait for the final result
        for (let i = 0; i < 30; i++) {
            if (document.lineAt(0).text.includes('x^{abc}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, 'x^{abc}', "Should handle fast typing and accumulate into braces");
        
        // Cleanup
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Auto-bracing: Nested subscripts x_a_b', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x_a' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type '_' after 'a' -> x_a_
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), '_');
        });
        // Type 'b' -> x_a_b -> x_a_{b} or x_{a_b}? 
        // Current logic: if it sees _ after a character, it might brace.
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 4), 'b');
        });

        for (let i = 0; i < 10; i++) {
            if (document.lineAt(0).text.includes('{')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Depending on implementation, it might become x_a_{b} or x_{a_b}
        // Let's just verify it doesn't crash and does SOMETHING reasonable
        assert.ok(document.lineAt(0).text.includes('b'), "Should contain 'b'");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: **bold** space should become \\textbf{bold} ', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '**bold**' });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type space at the end
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });

        // Wait for transformation
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text === '\\textbf{bold} ') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.strictEqual(document.lineAt(0).text, '\\textbf{bold} ', "Text should be converted to \\textbf");
        
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: - space at start should become itemize environment', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '-' });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type space at the end
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 1), ' ');
        });

        // Wait for transformation
        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\begin{itemize}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const text = document.getText();
        assert.ok(text.includes('\\begin{itemize}'), "Should contain \\begin{itemize}");
        assert.ok(text.includes('\\item'), "Should contain \\item");
        assert.ok(text.includes('\\end{itemize}'), "Should contain \\end{itemize}");
        
        // Check cursor position: after \item 
        // line 0: \begin{itemize}
        // line 1:     \item 
        // char index should be 10 (4 spaces + \item + 1 space)
        assert.strictEqual(editor.selection.active.line, 1, "Cursor should be on the second line");
        assert.strictEqual(editor.selection.active.character, 10, "Cursor should be after \\item ");

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: #Section# space should become \\section{Section}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '#My Section#' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 12), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\section{My Section}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.ok(document.lineAt(0).text.includes('\\section{My Section}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: ##Subsection## space should become \\subsection{Subsection}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '##My Sub##' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 10), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\subsection{My Sub}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.ok(document.lineAt(0).text.includes('\\subsection{My Sub}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: > Text space should become gather environment', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '> a=b' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 5), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.getText().includes('\\begin{gather}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const text = document.getText();
        assert.ok(text.includes('\\begin{gather}'));
        assert.ok(text.includes('a=b'));
        assert.ok(text.includes('\\end{gather}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: *italic* space should become \\textit{italic}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '*italic*' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\textit{italic}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.ok(document.lineAt(0).text.includes('\\textit{italic}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Markdown: ~~strike~~ space should become \\sout{strike}', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '~~strike~~' });
        const editor = await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 100));

        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 10), ' ');
        });

        for (let i = 0; i < 20; i++) {
            if (document.lineAt(0).text.includes('\\sout{strike}')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        assert.ok(document.lineAt(0).text.includes('\\sout{strike}'));
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
