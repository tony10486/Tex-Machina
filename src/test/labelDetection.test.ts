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
        assert.strictEqual(labels[1].label, 'lbl:text');
    });
});
