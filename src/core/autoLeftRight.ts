import * as vscode from 'vscode';
import { findMathAtPos } from './mathSplitter';

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
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('autoLeftRight.enabled', true);
            if (!isEnabled) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            if (editor.document.languageId !== 'latex') {
                return;
            }

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
                } else if (text.startsWith('{') && text.endsWith('}')) {
                    // For grouping braces, we usually don't want \left\{ unless they are visible.
                    // But in LaTeX, literal braces are \{ \}.
                    // If the user uses a snippet that inserts {content}, we might not want to touch it
                    // unless they specifically want visible braces.
                    // Given the prompt " (, [, { ", it might mean visible ones.
                    // Let's stick to literal ones for now.
                }

                if (open && isTall(inner)) {
                    // Verify we are in math mode
                    if (findMathAtPos(editor.document, change.range.start)) {
                        const newText = `\\left${open}${inner}\\right${close}`;
                        
                        // Apply the change
                        // We use a small delay or ensure we don't trigger recursively
                        // In VS Code, edits from onDidChangeTextDocument are usually fine 
                        // if they don't trigger the same pattern.
                        await editor.edit(editBuilder => {
                            editBuilder.replace(change.range, newText);
                        }, { undoStopBefore: false, undoStopAfter: false });
                    }
                }
            }
        })
    );
}

function isTall(text: string): boolean {
    // Check for explicit tall macros
    if (TALL_ELEMENTS.some(el => text.includes(el))) {
        return true;
    }
    
    // Check for superscripts or subscripts that might be tall (e.g. ^{...} with \frac)
    // For simplicity, we just look for ^ or _ followed by {
    // But maybe it's too aggressive. Let's stick to the macro list for now.
    
    return false;
}
