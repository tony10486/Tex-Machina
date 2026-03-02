import * as assert from 'assert';
import * as vscode from 'vscode';
import { findLabels, findReferences } from '../core/labelDetection';

suite('Label Detection Test Suite', () => {
    test('findReferences should find all references', () => {
        const text = 'As seen in \\ref{eq:1} and \\cite{paper1, paper2}. Also \\eqref{eq:2}.';
        const refs = findReferences(text);
        assert.strictEqual(refs.has('eq:1'), true);
        assert.strictEqual(refs.has('paper1'), true);
        assert.strictEqual(refs.has('paper2'), true);
        assert.strictEqual(refs.has('eq:2'), true);
        assert.strictEqual(refs.size, 4);
    });

    test('findReferences should handle various commands', () => {
        const text = '\\cref{c1} \\Cref{C2} \\autocite{a1} \\textcite{t1} \\nocite{n1} \\pageref{p1}';
        const refs = findReferences(text);
        assert.strictEqual(refs.has('c1'), true);
        assert.strictEqual(refs.has('C2'), true);
        assert.strictEqual(refs.has('a1'), true);
        assert.strictEqual(refs.has('t1'), true);
        assert.strictEqual(refs.has('n1'), true);
        assert.strictEqual(refs.has('p1'), true);
        assert.strictEqual(refs.size, 6);
    });

    test('findLabels should find all labels and their context', async () => {
        const content = `
\\begin{equation}
    E = mc^2 \\label{eq:einstein}
\\end{equation}

Some text here.
\\label{lbl:text}
`;
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'latex'
        });
        const labels = findLabels(doc.getText(), doc);
        
        assert.strictEqual(labels.length, 2);
        
        assert.strictEqual(labels[0].label, 'eq:einstein');
        assert.ok(labels[0].context.includes('\\begin{equation}'));
        assert.ok(labels[0].context.includes('E = mc^2'));
        assert.ok(labels[0].context.includes('\\end{equation}'));
        
        assert.strictEqual(labels[1].label, 'lbl:text');
        // Fallback context should be the line
        assert.strictEqual(labels[1].context.trim(), '\\label{lbl:text}');
    });

    test('findLabels should handle nested-like environments simply', async () => {
        const content = `
\\begin{theorem}
    \\begin{equation}
        1+1=2 \\label{eq:oneplusone}
    \\end{equation}
\\end{theorem}
`;
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'latex'
        });
        const labels = findLabels(doc.getText(), doc);
        
        assert.strictEqual(labels.length, 1);
        assert.strictEqual(labels[0].label, 'eq:oneplusone');
        // It should pick the inner-most environment it finds before the label
        assert.ok(labels[0].context.includes('\\begin{equation}'));
        assert.ok(labels[0].context.includes('\\end{equation}'));
    });
});
