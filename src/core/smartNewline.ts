import * as vscode from 'vscode';
import { findMathAtPos, isInsideComment, isInsideVerbatim } from './latexParser';

/**
 * [Smart Newline]
 * Automatically inserts context-appropriate elements (like \\ &) 
 * when pressing Enter within certain LaTeX environments,
 * and auto-indents after \begin{env}.
 */

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

function findEnclosingEnvContext(document: vscode.TextDocument, pos: vscode.Position): { envName: string; beginLine: number } | null {
    const offset = document.offsetAt(pos);
    const fullText = document.getText();
    const tagRegex = /\\(begin|end)\{([^}]+)\}/g;
    const stack: { name: string; line: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(fullText)) !== null) {
        if (match.index >= offset) { break; }
        const type = match[1] as 'begin' | 'end';
        const name = match[2];
        if (type === 'begin') {
            const tagPos = document.positionAt(match.index);
            stack.push({ name, line: tagPos.line });
        } else {
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].name === name) {
                    stack.splice(i, 1);
                    break;
                }
            }
        }
    }
    if (stack.length === 0) { return null; }
    const innermost = stack[stack.length - 1];
    return { envName: innermost.name, beginLine: innermost.line };
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

        if (isInsideComment(document, pos) || isInsideVerbatim(document, pos)) {
            await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
            return;
        }

        // 1. Math env with ENV_CONFIG: insert \\ + & (existing behavior)
        const mathEnv = findMathAtPos(document, pos);
        if (mathEnv) {
            const beginMatch = mathEnv.text.match(/^\\begin\{([^}]+)\}/);
            if (beginMatch) {
                const envName = beginMatch[1];
                const envConfig = ENV_CONFIG[envName];
                if (envConfig) {
                    const indent = getIndentation(editor);
                    const insertText = envConfig.ampersand ? `\\\\\n${indent}& ` : `\\\\\n${indent}`;
                    const line = document.lineAt(pos.line).text;
                    const textBeforeCursor = line.substring(0, pos.character).trim();
                    let finalInsert = insertText;
                    if (textBeforeCursor.endsWith('\\\\')) {
                        finalInsert = insertText.substring(2);
                    }
                    await editor.edit(editBuilder => {
                        editBuilder.insert(pos, finalInsert);
                    }, { undoStopBefore: true, undoStopAfter: true });
                    return;
                }
            }
        }

        // 2. Auto-indent after \begin{env} or before \end{env}
        const currentLineText = document.lineAt(pos.line).text;
        const textBeforeCursor = currentLineText.substring(0, pos.character);
        const textAfterCursor = currentLineText.substring(pos.character);
        const isRightAfterBegin = /\\begin\{[^}]+\}\s*$/.test(textBeforeCursor);
        const isEndOnlyLine = /^\s*\\end\{[^}]+\}\s*$/.test(currentLineText);
        const cursorBeforeEndOnEndLine = isEndOnlyLine && pos.character <= (currentLineText.indexOf('\\end'));

        if (isRightAfterBegin || cursorBeforeEndOnEndLine) {
            const indent = getIndentation(editor);
            const envCtx = findEnclosingEnvContext(document, pos);
            let beginIndent = '';
            let contentIndent = indent;

            if (envCtx) {
                const beginLineText = document.lineAt(envCtx.beginLine).text;
                beginIndent = beginLineText.match(/^(\s*)/)![1];
                contentIndent = beginIndent + indent;
            }

            const restIsOnlyEnd = /^\s*\\end\{[^}]+\}\s*$/.test(textAfterCursor);

            if (isRightAfterBegin && restIsOnlyEnd) {
                // \begin{env}\end{env} on same line, cursor after \begin
                const endMatch = textAfterCursor.match(/\\end\{([^}]+)\}/);
                const endTag = endMatch ? endMatch[0] : '';
                await editor.edit(editBuilder => {
                    editBuilder.replace(
                        new vscode.Range(pos.line, pos.character, pos.line, currentLineText.length),
                        `\n${contentIndent}\n${beginIndent}${endTag}`
                    );
                });
                editor.selection = new vscode.Selection(pos.line + 1, contentIndent.length, pos.line + 1, contentIndent.length);
            } else if (isRightAfterBegin) {
                // Cursor right after \begin{env}, content or \end on next line
                const nextLineNum = pos.line + 1;
                let nextLineIsEnd = false;
                if (nextLineNum < document.lineCount) {
                    const nextLineText = document.lineAt(nextLineNum).text.trim();
                    if (/^\\end\{[^}]+\}$/.test(nextLineText)) {
                        nextLineIsEnd = true;
                    }
                }
                await editor.edit(editBuilder => {
                    editBuilder.insert(pos, `\n${contentIndent}`);
                    if (nextLineIsEnd) {
                        const endLine = document.lineAt(nextLineNum);
                        const endIndent = endLine.text.match(/^(\s*)/)![1];
                        if (endIndent !== beginIndent) {
                            editBuilder.replace(
                                new vscode.Range(nextLineNum, 0, nextLineNum, endIndent.length),
                                beginIndent
                            );
                        }
                    }
                });
                editor.selection = new vscode.Selection(pos.line + 1, contentIndent.length, pos.line + 1, contentIndent.length);
            } else if (cursorBeforeEndOnEndLine) {
                // On a line that only contains \end{env}, cursor before \end
                const endMatch = currentLineText.match(/\\end\{([^}]+)\}/);
                const endTag = endMatch ? endMatch[0] : '';
                await editor.edit(editBuilder => {
                    editBuilder.replace(
                        new vscode.Range(pos.line, 0, pos.line, currentLineText.length),
                        `${contentIndent}\n${beginIndent}${endTag}`
                    );
                });
                editor.selection = new vscode.Selection(pos.line, contentIndent.length, pos.line, contentIndent.length);
            }
            return;
        }

        // 3. Default Enter
        await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
    });

    context.subscriptions.push(disposable);
}
