import * as vscode from 'vscode';

/**
 * [Math Auto-Splitter]
 * Converts long inline/display math into \begin{align} ... \end{align}
 * and splits at outermost = or + operators.
 */
export function registerMathSplitter(context: vscode.ExtensionContext) {
    let splitCommand = vscode.commands.registerCommand('tex-machina.splitMath', async (options?: { splitAtPlus?: boolean }) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const config = vscode.workspace.getConfiguration('tex-machina');
        const splitAtPlus = options?.splitAtPlus ?? config.get<boolean>('splitMath.atPlus', false);
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

        const result = splitMathString(text, splitAtPlus);
        if (result === text) {
            const msg = splitAtPlus ? "분할할 수 있는 최외곽 =, +, - 기호가 없습니다." : "분할할 수 있는 최외곽 = 기호가 없습니다.";
            vscode.window.showInformationMessage(msg);
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
 * @param text The math text to split
 * @param splitAtPlus If true, also split at outermost + and - operators.
 */
export function splitMathString(text: string, splitAtPlus: boolean = false): string {
    // 1. Determine inner content and if it was wrapped
    let inner = text.trim();
    let wasWrapped = false;
    let wrapperStart = "";
    let wrapperEnd = "";
    
    if (inner.startsWith('$$') && inner.endsWith('$$')) {
        inner = inner.substring(2, inner.length - 2).trim();
        wrapperStart = "$$";
        wrapperEnd = "$$";
        wasWrapped = true;
    } else if (inner.startsWith('\\[') && inner.endsWith('\\]')) {
        inner = inner.substring(2, inner.length - 2).trim();
        wrapperStart = "\\[";
        wrapperEnd = "\\]";
        wasWrapped = true;
    } else if (inner.startsWith('$') && inner.endsWith('$')) {
        inner = inner.substring(1, inner.length - 1).trim();
        wrapperStart = "$";
        wrapperEnd = "$";
        wasWrapped = true;
    }

    // 2. Find outermost = and (+, - if enabled)
    // We ignore operators at the very end of the string
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
            i += 5;
        } else if (inner.substring(i).startsWith('\\end')) {
            depth--;
            i += 3;
        } else if (inner.substring(i).startsWith('\\left')) {
            depth++;
            i += 5;
        } else if (inner.substring(i).startsWith('\\right')) {
            depth--;
            i += 6;
        } else if (depth === 0) {
            // Check for '='
            if (char === '=') {
                const remaining = inner.substring(i + 1).trim();
                if (remaining.length > 0) {
                    operators.push({ pos: i, char });
                }
            } 
            // Check for '+' or '-' if splitAtPlus is enabled
            else if (splitAtPlus && (char === '+' || char === '-')) {
                // Ignore unary operators at the start
                if (i > 0 && inner.substring(0, i).trim().length > 0) {
                    const remaining = inner.substring(i + 1).trim();
                    if (remaining.length > 0) {
                        operators.push({ pos: i, char });
                    }
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
