import * as vscode from 'vscode';

export interface MathEnvironment {
    range: vscode.Range;
    text: string;
    type: 'inline' | 'display' | 'equation';
    content: string;
    envName?: string;
}

/**
 * Finds the innermost LaTeX environment at the given position.
 * Handles nested environments correctly by finding the tightest pair of \begin and \end.
 */
export function findInnermostEnvAtPos(document: vscode.TextDocument, pos: vscode.Position): MathEnvironment | null {
    const offset = document.offsetAt(pos);
    const lineCount = document.lineCount;
    
    const startLine = Math.max(0, pos.line - 100);
    const endLine = Math.min(lineCount - 1, pos.line + 100);
    
    const rangeToSearch = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    const text = document.getText(rangeToSearch);
    const searchStartOffset = document.offsetAt(rangeToSearch.start);

    const boundaryRegex = /\\begin\{([a-zA-Z]+\*?)\}|\\end\{([a-zA-Z]+\*?)\}|\$\$|\$|\\\[|\\\]/g;
    
    const stack: { type: string, start: number, envName?: string }[] = [];
    const candidates: MathEnvironment[] = [];

    let match: RegExpExecArray | null;
    while ((match = boundaryRegex.exec(text)) !== null) {
        const m = match[0];
        const posInDoc = searchStartOffset + match.index;

        if (m.startsWith('\\begin')) {
            stack.push({ type: 'begin', start: posInDoc, envName: match[1] });
        } else if (m.startsWith('\\end')) {
            const currentEndName = match[2];
            const lastIdx = stack.map(s => s.envName).lastIndexOf(currentEndName);
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = posInDoc + m.length;
                if (offset >= last.start && offset <= endPos) {
                    candidates.push({
                        range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                        text: document.getText(new vscode.Range(document.positionAt(last.start), document.positionAt(endPos))),
                        type: 'equation',
                        content: document.getText(new vscode.Range(document.positionAt(last.start + m.length), document.positionAt(posInDoc))),
                        envName: last.envName
                    });
                }
            }
        } else if (m === '$$' || m === '\\[' || m === '$') {
            const existingIdx = stack.findIndex(s => s.type === m);
            if (existingIdx !== -1) {
                const last = stack.splice(existingIdx, 1)[0];
                const endPos = posInDoc + m.length;
                if (offset >= last.start && offset <= endPos) {
                    candidates.push({
                        range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                        text: document.getText(new vscode.Range(document.positionAt(last.start), document.positionAt(endPos))),
                        type: m === '$' ? 'inline' : 'display',
                        content: document.getText(new vscode.Range(document.positionAt(last.start + m.length), document.positionAt(posInDoc)))
                    });
                }
            } else {
                stack.push({ type: m, start: posInDoc });
            }
        } else if (m === '\\]') {
            const lastIdx = stack.findIndex(s => s.type === '\\[');
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = posInDoc + m.length;
                if (offset >= last.start && offset <= endPos) {
                    candidates.push({
                        range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                        text: document.getText(new vscode.Range(document.positionAt(last.start), document.positionAt(endPos))),
                        type: 'display',
                        content: document.getText(new vscode.Range(document.positionAt(last.start + 2), document.positionAt(posInDoc)))
                    });
                }
            }
        }
    }

    if (candidates.length === 0) return null;

    return candidates.reduce((prev, curr) => {
        const prevLen = document.offsetAt(prev.range.end) - document.offsetAt(prev.range.start);
        const currLen = document.offsetAt(curr.range.end) - document.offsetAt(curr.range.start);
        return currLen < prevLen ? curr : prev;
    });
}

/**
 * Finds the math environment ($...$, $$...$$, \[...\], \begin{equation}...\end{equation}, etc.) at the given position.
 */
export function findMathAtPos(document: vscode.TextDocument, pos: vscode.Position): MathEnvironment | null {
    // Re-use innermost for consistency
    return findInnermostEnvAtPos(document, pos);
}

/**
 * Splits a string by a delimiter only at the top level of bracket nesting.
 */
export function splitTopLevel(text: string, delimiter: string): string[] {
    const result: string[] = [];
    let start = 0;
    let depth = 0;
    const delimLen = delimiter.length;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '{' || char === '[' || char === '(') {
            depth++;
        } else if (char === '}' || char === ']' || char === ')') {
            depth--;
        } else if (depth === 0 && text.substring(i, i + delimLen) === delimiter) {
            result.push(text.substring(start, i));
            start = i + delimLen;
            i += delimLen - 1;
        }
    }
    result.push(text.substring(start));
    return result;
}

/**
 * Finds a LaTeX command starting at the given position on the same line.
 * Optimized to only look at the current line.
 */
export function findCommandAtCursor(document: vscode.TextDocument, pos: vscode.Position): { range: vscode.Range, text: string } | null {
    const lineText = document.lineAt(pos.line).text;
    const restOfLine = lineText.substring(pos.character);

    // Match \command followed by optional arguments like [], {}, _{}, ^{}
    const commandRegex = /^\\[a-zA-Z]+\*?(?:\s*(?:\[[^\]]*\]|\{[^\}]*\}|_[^ \t\r\n{}]|_\s*\{[^\}]*\}|\^[^ \t\r\n{}]|\^\s*\{[^\}]*\}))*/;
    const match = restOfLine.match(commandRegex);

    if (match) {
        return {
            range: new vscode.Range(pos, pos.translate(0, match[0].length)),
            text: match[0]
        };
    }
    return null;
}

/**
 * Checks if a LaTeX command structure is "empty" (only whitespace or delimiters in arguments).
 */
export function isCommandEmpty(commandText: string): boolean {
    const argsMatch = commandText.match(/^\\[a-zA-Z]+\*?\s*([\s\S]*)$/);
    if (!argsMatch || !argsMatch[1]) return false;

    const argsPart = argsMatch[1];
    const contentRegex = /[^{}[\]_^\s]/;
    return !contentRegex.test(argsPart);
}
