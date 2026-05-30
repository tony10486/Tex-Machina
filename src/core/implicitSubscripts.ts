import * as vscode from 'vscode';
import { registerToggleFeature } from './toggleMode';
import { findMathAtPos, isInsideComment, isInsideVerbatim } from './latexParser';

export function registerImplicitSubscripts() {
    registerToggleFeature({
        name: 'implicitSubscripts',
        onTextChange: async (event, editor) => {
            for (const change of event.contentChanges) {
                // Only trigger on typing a single digit to prevent lag on pasting or multi-character insertion
                if (!/^\d$/.test(change.text)) {
                    continue;
                }

                const pos = change.range.start;
                const document = editor.document;

                // Performance & Context check: 
                // We must skip comments and verbatim environments.
                if (isInsideComment(document, pos) || isInsideVerbatim(document, pos)) {
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

                // Define transformation patterns (ordered from most specific to least specific)
                const rule3 = /([a-zA-Z]|\\[a-zA-Z]+)_\{(\d+)\}(\d)$/; // x_{12}3 -> x_{123}
                const rule2 = /([a-zA-Z]|\\[a-zA-Z]+)_(\d)(\d)$/;     // x_12 -> x_{12}
                const rule1 = /([a-zA-Z]|\\[a-zA-Z]+)(\d)$/;          // x1 -> x_1

                let match = rule3.exec(textBefore);
                let replacement = '';
                
                if (match) {
                    const variable = match[1];
                    const existingDigits = match[2];
                    const typedDigit = match[3];
                    replacement = `${variable}_{${existingDigits}${typedDigit}}`;
                } else {
                    match = rule2.exec(textBefore);
                    if (match) {
                        const variable = match[1];
                        const existingDigit = match[2];
                        const typedDigit = match[3];
                        replacement = `${variable}_{${existingDigit}${typedDigit}}`;
                    } else {
                        match = rule1.exec(textBefore);
                        if (match) {
                            const variable = match[1];
                            const typedDigit = match[2];
                            replacement = `${variable}_${typedDigit}`;
                        }
                    }
                }

                // If any rule matched, perform the replacement edit in the editor
                if (match && replacement) {
                    const matchLen = match[0].length;
                    const startChar = charOffsetAfter - matchLen;
                    const rangeToReplace = new vscode.Range(
                        new vscode.Position(line, startChar),
                        new vscode.Position(line, charOffsetAfter)
                    );

                    // Apply the edit
                    await editor.edit(editBuilder => {
                        editBuilder.replace(rangeToReplace, replacement);
                    });
                }
            }
        }
    });
}
