import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

export function registerMathToggle(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerTextEditorCommand('tex-machina.toggleMathMode', async (editor) => {
        const document = editor.document;
        const selection = editor.selection;
        
        const mathEnv = findMathAtPos(document, selection.active);
        if (!mathEnv) {
            vscode.window.showInformationMessage("커서 위치에서 수식 환경을 찾을 수 없습니다.");
            return;
        }

        const config = vscode.workspace.getConfiguration('tex-machina');
        const sequence = config.get<string[]>('mathToggle.sequence', ['$', '\\[', 'equation']);
        
        if (sequence.length === 0) return;

        // Map internal types to user-friendly sequence names
        let currentType = '';
        if (mathEnv.type === 'inline') {
            currentType = '$';
        } else if (mathEnv.type === 'display') {
            // Note: Parser treats both $$ and \[ as 'display'. 
            // We'll check the actual text to be precise if the user has both in their sequence.
            currentType = mathEnv.text.startsWith('$$') ? '$$' : '\\[';
        } else {
            // equation or other \begin{env}
            const envMatch = mathEnv.text.match(/\\begin\{([a-zA-Z]+\*?)\}/);
            currentType = envMatch ? envMatch[1] : 'equation';
        }

        let currentIndex = sequence.indexOf(currentType);
        
        // Fallback: if current environment is not in sequence, try to find a close match
        if (currentIndex === -1) {
            if (mathEnv.type === 'inline') currentIndex = sequence.indexOf('$');
            else if (mathEnv.type === 'display') currentIndex = sequence.indexOf('\\[') !== -1 ? sequence.indexOf('\\[') : sequence.indexOf('$$');
            else currentIndex = sequence.indexOf('equation');
        }

        const nextIndex = (currentIndex + 1) % sequence.length;
        const nextType = sequence[nextIndex];

        const content = mathEnv.content;
        let newText = '';

        if (nextType === '$') {
            const singleLineContent = content.replace(/\s+/g, ' ').trim();
            newText = `$${singleLineContent}$`;
        } else if (nextType === '$$') {
            newText = `$$\n    ${content}\n$$`;
        } else if (nextType === '\\[') {
            newText = `\\[\n    ${content}\n\\]`;
        } else {
            // Environment types (equation, align, gather, etc.)
            newText = `\\begin{${nextType}}\n    ${content}\n\\end{${nextType}}`;
        }

        await editor.edit(editBuilder => {
            editBuilder.replace(mathEnv.range, newText);
        });
    });

    context.subscriptions.push(disposable);
}
