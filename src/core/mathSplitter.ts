import * as vscode from 'vscode';

/**
 * [Math Auto-Splitter]
 * Converts long inline/display math into \begin{align} ... \end{align}
 * and splits at outermost = or + operators.
 */
export function registerMathSplitter(context: vscode.ExtensionContext) {
    let splitCommand = vscode.commands.registerCommand('tex-machina.splitMath', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const document = editor.document;
        const selection = editor.selection;
        let range: vscode.Range;
        let text: string;

        if (!selection.isEmpty) {
            range = new vscode.Range(selection.start, selection.end);
            text = document.getText(range);
        } else {
            // No selection: try to find the math environment at cursor
            const found = findMathAtPos(document, selection.active);
            if (!found) {
                vscode.window.showWarningMessage("커서 위치에서 수식을 찾을 수 없습니다.");
                return;
            }
            range = found.range;
            text = found.text;
        }

        const result = splitMathString(text);
        if (result === text) {
            vscode.window.showInformationMessage("분할할 수 있는 최외곽 = 또는 + 기호가 없습니다.");
            return;
        }

        await editor.edit(editBuilder => {
            editBuilder.replace(range, result);
        });
    });

    context.subscriptions.push(splitCommand);
}

/**
 * Finds the math environment ($...$, $$...$$, \[...\], \begin{align}...\end{align}, etc.) at the given position.
 */
export function findMathAtPos(document: vscode.TextDocument, pos: vscode.Position): { range: vscode.Range, text: string } | null {
    const text = document.getText();
    const offset = document.offsetAt(pos);

    // 확장된 수식 환경 정규표현식:
    // 1. $$...$$ 또는 $...$ 또는 \[...\]
    // 2. \begin{env}... \end{env} (equation, align, gather, multline, flalign, alignat 및 * 포함)
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
    let match;
    while ((match = mathRegex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
            return {
                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                text: match[0]
            };
        }
    }
    return null;
}

/**
 * The core logic for splitting math strings.
 */
export function splitMathString(text: string): string {
    // 1. Determine inner content and if it was wrapped
    let inner = text.trim();
    let wasWrapped = false;
    
    if (inner.startsWith('$$') && inner.endsWith('$$')) {
        inner = inner.substring(2, inner.length - 2).trim();
        wasWrapped = true;
    } else if (inner.startsWith('\\[') && inner.endsWith('\\]')) {
        inner = inner.substring(2, inner.length - 2).trim();
        wasWrapped = true;
    } else if (inner.startsWith('\\\[') && inner.endsWith('\\\]')) {
        // Handle escaped case if it comes in as \\\[ ... \\\] (3 chars)
        inner = inner.substring(3, inner.length - 3).trim();
        wasWrapped = true;
    } else if (inner.startsWith('$') && inner.endsWith('$')) {
        inner = inner.substring(1, inner.length - 1).trim();
        wasWrapped = true;
    }

    // 2. Find outermost = and +
    // We ignore operators at the very end of the string (like 'y = 0 =')
    const operators: { pos: number, char: string }[] = [];
    let depth = 0;
    
    for (let i = 0; i < inner.length; i++) {
        const char = inner[i];
        
        if (char === '{' || char === '(' || char === '[') {
            depth++;
        } else if (char === '}' || char === ')' || char === ']') {
            depth--;
        } else if (inner.substring(i).startsWith('\\begin')) {
            depth++;
            // Skip the word 'begin' to avoid re-matching
            i += 5;
        } else if (inner.substring(i).startsWith('\\end')) {
            depth--;
            // Skip the word 'end'
            i += 3;
        } else if (inner.substring(i).startsWith('\\left')) {
            depth++;
            i += 5;
        } else if (inner.substring(i).startsWith('\\right')) {
            depth--;
            i += 6;
        } else if (depth === 0) {
            if (char === '=') {
                // Only add if it's not the last character (ignoring trailing whitespace)
                const remaining = inner.substring(i + 1).trim();
                if (remaining.length > 0) {
                    operators.push({ pos: i, char });
                }
            }
        }
    }

    if (operators.length === 0) {
        return text;
    }

    // 3. Build the new align environment
    let result = "\\begin{align}\n    ";
    let lastPos = 0;

    for (let i = 0; i < operators.length; i++) {
        const op = operators[i];
        const segment = inner.substring(lastPos, op.pos).trim();
        
        if (i === 0) {
            // First segment: LHS & = ...
            result += `${segment} &${op.char} `;
        } else {
            // Subsequent segments: \\ & + ...
            result += `${segment} \\\\\n    &${op.char} `;
        }
        lastPos = op.pos + 1;
    }

    // Add the final segment
    result += inner.substring(lastPos).trim();
    result += "\n\\end{align}";

    return result;
}
