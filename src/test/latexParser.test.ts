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
        assert.strictEqual(math!.content, 'a=b');
    });

    test('findMathAtPos: should detect equation environment', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'latex', content: '\\begin{equation}\n x^2 \n\\end{equation}' });
        const pos = new vscode.Position(1, 2);
        const math = findMathAtPos(doc, pos);
        assert.ok(math);
        assert.strictEqual(math!.type, 'equation');
        assert.strictEqual(math!.content, 'x^2');
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
        // \alpha has no arguments, argsPart is empty.
        // Current logic: if !argsPart return false (changed to false to avoid accidental deletion of words)
        // Wait, my implementation returns false for \alpha now. Let's verify.
        assert.strictEqual(isCommandEmpty('\\alpha'), false);
    });
});
