import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDoc, closeEditor, insertAt, waitForLine, waitForIncludes } from './testUtils';

suite('Markdown Test Suite', () => {
    test('**bold** space should become \\textbf{bold}', async () => {
        const { document, editor } = await openDoc('**bold**');
        await insertAt(editor, 0, 8, ' ');
        assert.ok(await waitForLine(document, 0, '\\textbf{bold} '));
        await closeEditor();
    });

    test('*italic* space should become \\textit{italic}', async () => {
        const { document, editor } = await openDoc('*italic*');
        await insertAt(editor, 0, 8, ' ');
        assert.ok(await waitForLine(document, 0, '\\textit{italic} '));
        await closeEditor();
    });

    test('- space at start should become itemize environment', async () => {
        const { document, editor } = await openDoc('-');
        await insertAt(editor, 0, 1, ' ');
        assert.ok(await waitForIncludes(document, '\\begin{itemize}'));
        await closeEditor();
    });

    test('#Section# space should become \\section{Section}', async () => {
        const { document, editor } = await openDoc('#My Section#');
        await insertAt(editor, 0, 12, ' ');
        assert.ok(await waitForIncludes(document, '\\section{My Section}'));
        await closeEditor();
    });

    test('##Sub## space should become \\subsection{Sub}', async () => {
        const { document, editor } = await openDoc('##Sub##');
        await insertAt(editor, 0, 7, ' ');
        assert.ok(await waitForIncludes(document, '\\subsection{Sub}'));
        await closeEditor();
    });

    test('~~strike~~ space should become \\sout{strike}', async () => {
        const { document, editor } = await openDoc('~~strike~~');
        await insertAt(editor, 0, 10, ' ');
        assert.ok(await waitForIncludes(document, '\\sout{strike}'));
        await closeEditor();
    });
});
