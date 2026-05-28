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
        const sequence = config.get<string[]>('mathToggle.sequence', ['inline', 'display', 'equation']);
        
        if (sequence.length === 0) return;

        // Determine current type in terms of sequence elements
        let currentType = mathEnv.type;
        // If it's 'equation' type in mathEnv, it might be 'align', 'gather' etc. in sequence
        if (currentType === 'equation') {
            const envMatch = mathEnv.text.match(/\\begin\{([a-zA-Z]+\*?)\}/);
            if (envMatch && sequence.includes(envMatch[1])) {
                currentType = envMatch[1] as any;
            }
        }

        const currentIndex = sequence.indexOf(currentType);
        const nextIndex = (currentIndex + 1) % sequence.length;
        const nextType = sequence[nextIndex];

        const content = mathEnv.content;
        let newText = '';

        if (nextType === 'inline') {
            const singleLineContent = content.replace(/\s+/g, ' ').trim();
            newText = `$${singleLineContent}$`;
        } else if (nextType === 'display') {
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
