import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

function formatDisplayMath(
    openTag: string,
    closeTag: string,
    content: string,
    mathRange: vscode.Range,
    lineText: string,
    tabSize: number,
): string {
    const baseIndent = lineText.match(/^\s*/)?.[0] || '';
    const innerIndent = baseIndent + ' '.repeat(tabSize);

    const cleanContent = content.trim();
    const indentedContent = cleanContent.split('\n')
        .map(l => {
            const s = l.trim();
            return s ? innerIndent + s : '';
        })
        .join('\n');

    let text = `${openTag}\n${indentedContent}\n${baseIndent}${closeTag}`;

    const isSameLine = mathRange.start.line === mathRange.end.line;
    if (isSameLine) {
        const textBefore = lineText.substring(0, mathRange.start.character);
        const hasTextBefore = /\S/.test(textBefore);
        if (hasTextBefore) {
            text = '\n' + baseIndent + text;
        }
    }

    return text;
}

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

        if (sequence.length === 0) { return; }

        let currentType = '';
        if (mathEnv.type === 'inline') {
            currentType = '$';
        } else if (mathEnv.type === 'display') {
            currentType = mathEnv.text.startsWith('$$') ? '$$' : '\\[';
        } else {
            const envMatch = mathEnv.text.match(/\\begin\{([a-zA-Z]+\*?)\}/);
            currentType = envMatch ? envMatch[1] : 'equation';
        }

        let currentIndex = sequence.indexOf(currentType);

        if (currentIndex === -1) {
            if (mathEnv.type === 'inline') { currentIndex = sequence.indexOf('$'); }
            else if (mathEnv.type === 'display') {
                const bracketIdx = sequence.indexOf('\\[');
                currentIndex = bracketIdx !== -1 ? bracketIdx : sequence.indexOf('$$');
            }
            else { currentIndex = sequence.indexOf('equation'); }
        }

        const nextIndex = (currentIndex + 1) % sequence.length;
        const nextType = sequence[nextIndex];

        const content = mathEnv.content;
        let newText = '';

        if (nextType === '$') {
            const singleLineContent = content.replace(/\s+/g, ' ').trim();
            newText = `$${singleLineContent}$`;
        } else {
            const lineText = document.lineAt(mathEnv.range.start.line).text;
            const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;

            let openTag: string;
            let closeTag: string;

            if (nextType === '$$') {
                openTag = '$$';
                closeTag = '$$';
            } else if (nextType === '\\[') {
                openTag = '\\[';
                closeTag = '\\]';
            } else {
                openTag = `\\begin{${nextType}}`;
                closeTag = `\\end{${nextType}}`;
            }

            newText = formatDisplayMath(openTag, closeTag, content, mathEnv.range, lineText, tabSize);
        }

        await editor.edit(editBuilder => {
            editBuilder.replace(mathEnv.range, newText);
        });
    });

    context.subscriptions.push(disposable);
}
