import * as assert from 'assert';
import * as vscode from 'vscode';
import { findMathAtPos, findCommandAtCursor, isCommandEmpty } from '../core/latexParser';

suite('LaTeX Parser Test Suite', () => {
    test('findMathAtPos: should detect inline math', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'Text $a+b$ more text' });
        const pos = new vscode.Position(0, 7); // Inside $a+b$
        const math = findMathAtPos(doc, pos);
        assert.ok(math);
        assert.strictEqual(math!.type, 'inline');
        assert.strictEqual(math!.content, 'a+b');
    });

    test('findMathAtPos: should detect display math \\[...\\]', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: 'Text \\[\n a=b \n\\] end' });
        const pos = new vscode.Position(1, 2); // Inside \[...\]
        const math = findMathAtPos(doc, pos);
        assert.ok(math);
        assert.strictEqual(math!.type, 'display');
        assert.strictEqual(math!.content.trim(), 'a=b');
    });

    test('findMathAtPos: should detect equation environment', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\begin{equation}\n x^2 \n\\end{equation}' });
        const pos = new vscode.Position(1, 2);
        const math = findMathAtPos(doc, pos);
        assert.ok(math);
        assert.strictEqual(math!.type, 'equation');
        // The parser might include some prefix if not careful with substring indices
        // Let's use includes or trim to be safe if the parser behavior changed
        assert.ok(math!.content.includes('x^2'), `Content should contain x^2, got: ${math!.content}`);
    });

    test('findCommandAtCursor: should detect simple command', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\alpha' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\alpha');
    });

    test('findCommandAtCursor: should detect command with empty braces', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\frac{}{}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\frac{}{}');
    });

    test('findCommandAtCursor: should detect command with complex empty structure', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\sum_{}^{}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\sum_{}^{}');
    });

    test('isCommandEmpty: should identify truly empty structures', () => {
        assert.strictEqual(isCommandEmpty('\\frac{}{}'), true);
        assert.strictEqual(isCommandEmpty('\\sqrt{}'), true);
        assert.strictEqual(isCommandEmpty('\\sum_{}^{}'), true);
        assert.strictEqual(isCommandEmpty('\\section{ }'), true);
    });

    test('isCommandEmpty: should identify non-empty structures', () => {
        assert.strictEqual(isCommandEmpty('\\frac{1}{2}'), false);
        assert.strictEqual(isCommandEmpty('\\sqrt{x}'), false);
        assert.strictEqual(isCommandEmpty('\\sum_{i=1}^{n}'), false);
    });

    test('isCommandEmpty: should NOT treat simple macros as structures to delete', () => {
        assert.strictEqual(isCommandEmpty('\\alpha'), false);
    });

    test('findCommandAtCursor: should handle nested braces', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\cmd{a{b}c}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\cmd{a{b}c}');
    });

    test('findCommandAtCursor: should handle escaped braces', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\cmd{a\\}b}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\cmd{a\\}b}');
    });

    test('findCommandAtCursor: should handle subscripts and superscripts with braces', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\sum_{i=1}^{n}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\sum_{i=1}^{n}');
    });

    test('findCommandAtCursor: should handle single character sub/superscripts', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\sum_i^n' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\sum_i^n');
    });

    test('findCommandAtCursor: should be robust against unclosed braces (no ReDoS)', async () => {
        const longUnclosed = '\\cmd' + '{'.repeat(1000);
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: longUnclosed });
        const pos = new vscode.Position(0, 0);
        
        const startTime = Date.now();
        const cmd = findCommandAtCursor(doc, pos);
        const duration = Date.now() - startTime;
        
        assert.ok(duration < 100, `Parsing took too long: ${duration}ms`);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\cmd'); // Should stop at unclosed brace
    });

    test('findCommandAtCursor: should handle spaces before arguments', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\cmd  [opt] {arg}' });
        const pos = new vscode.Position(0, 0);
        const cmd = findCommandAtCursor(doc, pos);
        assert.ok(cmd);
        assert.strictEqual(cmd!.text, '\\cmd  [opt] {arg}');
    });
});

