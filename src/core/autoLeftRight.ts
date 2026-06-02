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

const CLOSE_TO_OPEN: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
};

function findMatchingOpen(textBefore: string, closeChar: string): number {
    const open = CLOSE_TO_OPEN[closeChar];
    if (!open) { return -1; }
    let depth = 0;
    for (let i = textBefore.length - 1; i >= 0; i--) {
        if (textBefore[i] === closeChar) { depth++; }
        else if (textBefore[i] === open) {
            if (depth === 0) { return i; }
            depth--;
        }
    }
    return -1;
}

export function registerAutoLeftRight(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'autoLeftRight',
        triggerChars: [')', ']', '}'],
        onTextChange: async (event, editor) => {
            const enabled = vscode.workspace.getConfiguration('tex-machina').get<boolean>('autoLeftRight.enabled', true);
            if (!enabled) { return; }

            for (const change of event.contentChanges) {
                const text = change.text;
                const pos = change.range.start;

                // Multi-character insert (pasted or selected wrap)
                if (text.length >= 2) {
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

                    if (open && findMathAtPos(editor.document, pos) && isTall(inner)) {
                        const replacement = `\\left${open}${inner}\\right${close}`;
                        await editor.edit(editBuilder => {
                            editBuilder.replace(change.range, replacement);
                        }, { undoStopBefore: false, undoStopAfter: false });
                        // Place cursor right after inner content
                        const cursorCol = change.range.start.character + 6 + inner.length;
                        editor.selection = new vscode.Selection(
                            new vscode.Position(pos.line, cursorCol),
                            new vscode.Position(pos.line, cursorCol)
                        );
                    }
                    continue;
                }

                // Single character: check document state for bracket pair completion
                if (text.length !== 1) { continue; }

                if (!findMathAtPos(editor.document, pos)) { continue; }

                const line = editor.document.lineAt(pos.line).text;
                const afterChar = pos.character + text.length;
                const closeBracket = line[afterChar];

                // Check if cursor is right before a close bracket (auto-closed or typed)
                if (!closeBracket || !CLOSE_TO_OPEN[closeBracket]) { continue; }

                const textBefore = line.substring(0, afterChar);
                const openPos = findMatchingOpen(textBefore, closeBracket);
                if (openPos < 0) { continue; }

                // Skip if already wrapped with \left...\right
                if (textBefore.substring(0, openPos).endsWith('\\left')) { continue; }

                const inner = line.substring(openPos + 1, afterChar);
                if (!isTall(inner)) { continue; }

                const openChar = CLOSE_TO_OPEN[closeBracket];
                const replacement = `\\left${openChar}${inner}\\right${closeBracket}`;
                await editor.edit(editBuilder => {
                    editBuilder.replace(
                        new vscode.Range(pos.line, openPos, pos.line, afterChar + 1),
                        replacement
                    );
                }, { undoStopBefore: false, undoStopAfter: false });
                // Place cursor right after inner content, before \right
                const cursorCol = openPos + 6 + inner.length;
                editor.selection = new vscode.Selection(
                    new vscode.Position(pos.line, cursorCol),
                    new vscode.Position(pos.line, cursorCol)
                );
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
