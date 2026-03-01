import * as assert from 'assert';
import * as vscode from 'vscode';
import { performance } from 'perf_hooks';
import { parseUserCommand } from '../core/commandParser';
import { splitMathString } from '../core/mathSplitter';
import { expandSiunitx } from '../core/unitExpander';

suite('Pure Logic Performance Test Suite', () => {

    test('Pure Logic: Command Parser (10,000 runs)', () => {
        const input = "taylor > x, 5 / newline / step=2";
        const selection = "sin(x)";
        
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            parseUserCommand(input, selection);
        }
        const end = performance.now();
        const avg = (end - start) / 10000;
        console.log(`[Perf] Command Parser average: ${avg.toFixed(4)}ms (${(avg * 1000).toFixed(2)}μs)`);
    });

    test('Pure Logic: Math Splitter (10,000 runs)', () => {
        const input = "f(x) = \int_{a}^{b} g(t) dt = G(b) - G(a)";
        
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            splitMathString(input);
        }
        const end = performance.now();
        const avg = (end - start) / 10000;
        console.log(`[Perf] Math Splitter average: ${avg.toFixed(4)}ms (${(avg * 1000).toFixed(2)}μs)`);
    });

    test('Pure Logic: Unit Expander (1,000 runs)', () => {
        const input = "\meter\per\second\squared";
        
        const start = performance.now();
        for (let i = 0; i < 1000; i++) {
            expandSiunitx(input);
        }
        const end = performance.now();
        const avg = (end - start) / 1000;
        console.log(`[Perf] Unit Expander average: ${avg.toFixed(4)}ms (${(avg * 1000).toFixed(2)}μs)`);
    });

    test('Editor Interaction: Auto-bracing (No artificial delay)', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: 'x^a' });
        const editor = await vscode.window.showTextDocument(document);
        
        // Wait for extension to be active
        await new Promise(resolve => setTimeout(resolve, 500));

        const start = performance.now();
        // Simulate 'b' insertion
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 3), 'b');
        });

        // Wait for change to reflect WITHOUT fixed long setTimeout
        let success = false;
        for (let i = 0; i < 100; i++) {
            if (document.lineAt(0).text === 'x^{ab}') {
                success = true;
                break;
            }
            await new Promise(resolve => setImmediate(resolve)); // yield to event loop
        }
        const end = performance.now();
        
        console.log(`[Perf] Auto-bracing (Editor + Event Loop): ${(end - start).toFixed(2)}ms (Success: ${success})`);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Editor Interaction: Markdown Bold (No artificial delay)', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '**test**' });
        const editor = await vscode.window.showTextDocument(document);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        const start = performance.now();
        // Simulate space insertion
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(0, 8), ' ');
        });

        let success = false;
        for (let i = 0; i < 100; i++) {
            if (document.lineAt(0).text.includes('	extbf{test}')) {
                success = true;
                break;
            }
            await new Promise(resolve => setImmediate(resolve));
        }
        const end = performance.now();
        
        console.log(`[Perf] Markdown Bold (Editor + Event Loop): ${(end - start).toFixed(2)}ms (Success: ${success})`);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
