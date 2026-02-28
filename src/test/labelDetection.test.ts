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

    test('findLabels should find all labels', async () => {
        // Create a mock document-like environment or use a real one if possible
        // Actually, we can test the regex logic by extracting the regex to a separate function if needed,
        // but for now let's use a real document in a workspace-based test if we can.
        // For VSCode extension tests, we usually have access to the VSCode API.
        const doc = await vscode.workspace.openTextDocument({
            content: '\\label{eq:1} some text \\label{fig:2}',
            language: 'latex'
        });
        const labels = findLabels(doc.getText(), doc);
        assert.strictEqual(labels.length, 2);
        assert.strictEqual(labels[0].label, 'eq:1');
        assert.strictEqual(labels[1].label, 'fig:2');
    });
});
