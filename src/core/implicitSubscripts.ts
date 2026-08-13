import * as vscode from 'vscode';
import { registerToggleFeature, unregisterToggleFeature } from './toggleMode';
import { findMathAtPos, isInsideComment, isInsideVerbatim, isInsideTextMode } from './latexParser';

/**
 * Determines the replacement string for implicit subscript transformation.
 * Returns null if no transformation should occur.
 */
export function getSubscriptReplacement(textBefore: string): string | null {
    // Define transformation patterns (ordered from most specific to least specific)
    const rule3 = /([a-zA-Z]|\\[a-zA-Z]+)_\{(\d+)\}(\d)$/; // x_{12}3 -> x_{123}
    const rule2 = /([a-zA-Z]|\\[a-zA-Z]+)_(\d)(\d)$/;     // x_12 -> x_{12}
    const rule1 = /([a-zA-Z]|\\[a-zA-Z]+)(\d)$/;          // x1 -> x_1

    let match = rule3.exec(textBefore);
    if (match) {
        const variable = match[1];
        const existingDigits = match[2];
        const typedDigit = match[3];
        return `${variable}_{${existingDigits}${typedDigit}}`;
    }

    match = rule2.exec(textBefore);
    if (match) {
        const variable = match[1];
        const existingDigit = match[2];
        const typedDigit = match[3];
        return `${variable}_{${existingDigit}${typedDigit}}`;
    }

    match = rule1.exec(textBefore);
    if (match) {
        const variable = match[1];
        const typedDigit = match[2];
        return `${variable}_${typedDigit}`;
    }

    return null;
}

export function registerImplicitSubscripts(): vscode.Disposable {
    const feature = {
        name: 'implicitSubscripts',
        triggerChars: ['0','1','2','3','4','5','6','7','8','9'],
        onTextChange: async (event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor) => {

            for (const change of event.contentChanges) {
                // Only trigger on typing a single digit to prevent lag on pasting or multi-character insertion
                if (!/^\d$/.test(change.text)) {
                    continue;
                }

                const pos = change.range.start;
                const document = editor.document;

                // 1. Context check: Skip comments and verbatim environments
                if (isInsideComment(document, pos) || isInsideVerbatim(document, pos)) {
                    continue;
                }

                // 2. Strict Mode: Only trigger inside math mode ($...$, \[...\], \begin{equation}...)
                // This prevents accidental transformations in \label{fig1}, file paths, or normal text.
                const mathEnv = findMathAtPos(document, pos);
                if (!mathEnv) {
                    continue;
                }

                // 3. Text Mode Protection: Ensure we are not inside \text{...} or \cite{...} within math
                const offsetInContent = document.offsetAt(pos) - (document.offsetAt(mathEnv.range.start) + mathEnv.prefixLen);
                if (isInsideTextMode(mathEnv.content, offsetInContent)) {
                    continue;
                }

                const line = pos.line;
                if (line >= document.lineCount) {
                    continue;
                }

                const lineText = document.lineAt(line).text;
                // Index after the newly typed digit is inserted
                const charOffsetAfter = pos.character + 1;
                if (charOffsetAfter <= 1) {
                    continue;
                }

                const textBefore = lineText.substring(0, charOffsetAfter);
                const replacement = getSubscriptReplacement(textBefore);

                if (replacement) {
                    // Calculate the range to replace based on the length of the match
                    // We need to re-run the regex to get the match length
                    const match = /([a-zA-Z]|\\[a-zA-Z]+)(_\{(\d+)\}|_(\d)|)(\d)$/.exec(textBefore);
                    if (match) {
                        const matchLen = match[0].length;
                        const startChar = charOffsetAfter - matchLen;
                        const rangeToReplace = new vscode.Range(
                            new vscode.Position(line, startChar),
                            new vscode.Position(line, charOffsetAfter)
                        );

                        await editor.edit(editBuilder => {
                            editBuilder.replace(rangeToReplace, replacement);
                        });
                    }
                }
            }
        }
    };
    registerToggleFeature(feature);
    return new vscode.Disposable(() => {
        unregisterToggleFeature('implicitSubscripts');
    });
}
