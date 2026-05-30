import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

/**
 * [Smart Newline]
 * Automatically inserts context-appropriate elements (like \\ &) 
 * when pressing Enter within certain LaTeX environments.
 */

// Environments that support multi-line structures (allow \\)
// Value indicates whether to include an ampersand (&) for alignment.
const ENV_CONFIG: Record<string, { ampersand: boolean }> = {
    'align': { ampersand: true },
    'align*': { ampersand: true },
    'alignat': { ampersand: true },
    'alignat*': { ampersand: true },
    'flalign': { ampersand: true },
    'flalign*': { ampersand: true },
    'gather': { ampersand: false },
    'gather*': { ampersand: false },
    'multline': { ampersand: false },
    'multline*': { ampersand: false },
    // equation and equation* are single-line environments and DO NOT allow \\.
    'matrix': { ampersand: false },
    'pmatrix': { ampersand: false },
    'bmatrix': { ampersand: false },
    'vmatrix': { ampersand: false },
    'Vmatrix': { ampersand: false },
    'cases': { ampersand: true },
};

function getIndentation(editor: vscode.TextEditor): string {
    const tabSize = Number(editor.options.tabSize) || 4;
    const insertSpaces = editor.options.insertSpaces;
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

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
        const beginMatch = mathEnv.text.match(/^\\begin\{([^}]+)\}/);
        if (!beginMatch) {
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
            return;
        }

        const envName = beginMatch[1];
        const envConfig = ENV_CONFIG[envName];

        if (envConfig) {
            const indent = getIndentation(editor);
            const insertText = envConfig.ampersand ? `\\\\\n${indent}& ` : `\\\\\n${indent}`;
            
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
