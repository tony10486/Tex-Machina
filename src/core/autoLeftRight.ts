import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';
import { registerToggleFeature } from './toggleMode';

/**
 * [Auto \left \right]
 * Automatically expands (, [, \{ to \left(, \left[, \left\{
 * when they wrap "tall" elements like \frac, \int, etc. in math mode.
 */

const TALL_ELEMENTS = [
    '\\frac', '\\dfrac', '\\tfrac',
    '\\int', '\\iint', '\\iiint', '\\oint',
    '\\sum', '\\prod', '\\coprod',
    '\\sqrt',
    '\\binom', '\\dbinom', '\\tbinom',
    '\\matrix', '\\pmatrix', '\\bmatrix', '\\vmatrix', '\\Vmatrix',
    '\\cases', '\\begin',
    '\\V', '\\vert', '\\Vert', // For | and || if used with \left \right
    '\\langle', '\\rangle'
];

export function registerAutoLeftRight(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'autoLeftRight',
        onTextChange: async (event, editor) => {
            for (const change of event.contentChanges) {
                const text = change.text;
                if (!text || text.length < 2) {
                    continue;
                }

                // Check for wrapping patterns: (content), [content], \{content\}
                let open = '';
                let close = '';
                let inner = '';

                if (text.startsWith('(') && text.endsWith(')')) {
                    open = '('; close = ')';
                    inner = text.substring(1, text.length - 1);
                } else if (text.startsWith('[') && text.endsWith(']')) {
                    open = '['; close = ']';
                    inner = text.substring(1, text.length - 1);
                } else if (text.startsWith('\\{') && text.endsWith('\\}')) {
                    open = '\\{'; close = '\\}';
                    inner = text.substring(2, text.length - 2);
                }

                if (open && isTall(inner)) {
                    // Verify we are in math mode
                    if (findMathAtPos(editor.document, change.range.start)) {
                        const newText = `\\left${open}${inner}\\right${close}`;
                        
                        await editor.edit(editBuilder => {
                            editBuilder.replace(change.range, newText);
                        }, { undoStopBefore: false, undoStopAfter: false });
                    }
                }
            }
        }
    });
}

function isTall(text: string): boolean {
    // Check for explicit tall macros
    if (TALL_ELEMENTS.some(el => text.includes(el))) {
        return true;
    }
    
    return false;
}
