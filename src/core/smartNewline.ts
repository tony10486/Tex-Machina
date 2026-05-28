import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

/**
 * [Smart Newline]
 * Automatically inserts context-appropriate elements (like \\ &) 
 * when pressing Enter within certain LaTeX environments.
 */

const ENV_AUTO_INSERT: Record<string, string> = {
    'align': '\\\\\n    & ',
    'align*': '\\\\\n    & ',
    'alignat': '\\\\\n    & ',
    'alignat*': '\\\\\n    & ',
    'flalign': '\\\\\n    & ',
    'flalign*': '\\\\\n    & ',
    'gather': '\\\\\n    ',
    'gather*': '\\\\\n    ',
    'multline': '\\\\\n    ',
    'multline*': '\\\\\n    ',
    'equation': '\\\\\n    ',
    'equation*': '\\\\\n    ',
    'matrix': '\\\\\n    ',
    'pmatrix': '\\\\\n    ',
    'bmatrix': '\\\\\n    ',
    'vmatrix': '\\\\\n    ',
    'Vmatrix': '\\\\\n    ',
    'cases': '\\\\\n    & ',
};

export function registerSmartNewline(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('tex-machina.smartNewline', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const config = vscode.workspace.getConfiguration('tex-machina');
        const enabled = config.get<boolean>('smartNewline.enabled', true);

        if (!enabled || editor.document.languageId !== 'latex') {
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
            return;
        }

        const selection = editor.selection;
        const pos = selection.active;
        const document = editor.document;

        // 1. Check if we are inside a math environment
        const mathEnv = findMathAtPos(document, pos);
        if (!mathEnv) {
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
            return;
        }

        // 2. Identify the specific environment name
        // regex to match \begin{envname}
        const beginMatch = mathEnv.text.match(/^\\begin\{([^}]+)\}/);
        if (!beginMatch) {
            // Probably inline math $...$ or \[...\]
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
            return;
        }

        const envName = beginMatch[1];
        const insertText = ENV_AUTO_INSERT[envName];

        if (insertText) {
            // Check if the current line already ends with \\ to avoid duplication
            const line = document.lineAt(pos.line).text;
            const textBeforeCursor = line.substring(0, pos.character).trim();
            
            let finalInsert = insertText;
            if (textBeforeCursor.endsWith('\\\\')) {
                // If line already has \\, just insert the rest (newline and indentation/alignment)
                finalInsert = insertText.substring(2);
            }

            await editor.edit(editBuilder => {
                editBuilder.insert(pos, finalInsert);
            }, { undoStopBefore: true, undoStopAfter: true });
        } else {
            // Default behavior for other environments
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
        }
    });

    context.subscriptions.push(disposable);
}
