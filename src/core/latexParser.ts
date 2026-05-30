import * as vscode from 'vscode';

export interface MathEnvironment {
    range: vscode.Range;
    text: string;
    type: 'inline' | 'display' | 'equation';
    content: string;
    envName?: string;
    prefixLen: number;
}

/**
 * Checks if the given position is inside a LaTeX comment.
 */
export function isInsideComment(document: vscode.TextDocument, pos: vscode.Position): boolean {
    const lineText = document.lineAt(pos.line).text;
    const textBefore = lineText.substring(0, pos.character);
    
    // Find unescaped %
    let i = 0;
    while (i < textBefore.length) {
        const char = textBefore[i];
        if (char === '%') {
            let backslashCount = 0;
            for (let j = i - 1; j >= 0; j--) {
                if (textBefore[j] === '\\') {backslashCount++;}
                else {break;}
            }
            if (backslashCount % 2 === 0) {
                return true;
            }
        }
        i++;
    }
    return false;
}

/**
 * Checks if the given position is inside a verbatim-like environment or command.
 */
export function isInsideVerbatim(document: vscode.TextDocument, pos: vscode.Position): boolean {
    const offset = document.offsetAt(pos);
    const startLine = Math.max(0, pos.line - 150);
    const endLine = Math.min(document.lineCount - 1, pos.line + 150);
    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, document.lineAt(endLine).text.length));
    const text = document.getText(range);
    const searchStartOffset = document.offsetAt(range.start);

    // 1. Verbatim environments
    const verbatimRegex = /\\begin\s*\{(verbatim|lstlisting|minted|comment|code)\}[\s\S]*?\\end\s*\{\1\}/g;
    let match: RegExpExecArray | null;
    while ((match = verbatimRegex.exec(text)) !== null) {
        const start = searchStartOffset + match.index;
        const end = start + match[0].length;
        if (offset >= start && offset < end) {return true;}
    }

    // 2. \verb command
    const verbRegex = /\\verb([^\s])[\s\S]*?\1/g;
    while ((match = verbRegex.exec(text)) !== null) {
        const start = searchStartOffset + match.index;
        const end = start + match[0].length;
        if (offset >= start && offset < end) {return true;}
    }

    return false;
}

/**
 * Finds the innermost LaTeX environment at the given position.
 * Handles nested environments correctly by finding the tightest pair of \begin and \end.
 * Improved to skip comments, verbatim environments, and handle whitespace/different math modes.
 */
export function findInnermostEnvAtPos(document: vscode.TextDocument, pos: vscode.Position): MathEnvironment | null {
    if (isInsideComment(document, pos) || isInsideVerbatim(document, pos)) {
        return null;
    }

    const offset = document.offsetAt(pos);
    const lineCount = document.lineCount;
    
    // Search a reasonable window around the cursor
    const startLine = Math.max(0, pos.line - 150);
    const endLine = Math.min(lineCount - 1, pos.line + 150);
    
    const rangeToSearch = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    const text = document.getText(rangeToSearch);
    const searchStartOffset = document.offsetAt(rangeToSearch.start);

    // Boundary regex for environments and math modes
    // Handle whitespace in \begin{...} and \end{...}
    // Handle $$, $, \[, \], \(, \)
    const boundaryRegex = /\\begin\s*\{([^}]+)\}|\\end\s*\{([^}]+)\}|\$\$|(?<!\\)\$|\\\[|\\\]|\\\(|\\\)/g;
    
    const stack: { type: string, start: number, envName?: string, tagLen: number }[] = [];
    const candidates: MathEnvironment[] = [];

    // Pre-calculate comment and verbatim ranges to skip
    const skipRanges: { start: number, end: number }[] = [];
    
    // Find comments: % to end of line, but not escaped \%
    const commentRegex = /%/g;
    let match: RegExpExecArray | null;
    while ((match = commentRegex.exec(text)) !== null) {
        let backslashCount = 0;
        for (let i = match.index - 1; i >= 0; i--) {
            if (text[i] === '\\') {backslashCount++;}
            else {break;}
        }
        if (backslashCount % 2 === 0) {
            const lineEnd = text.indexOf('\n', match.index);
            const end = lineEnd === -1 ? text.length : lineEnd;
            skipRanges.push({ start: match.index, end: end });
            commentRegex.lastIndex = end;
        }
    }

    // Find verbatim environments
    const verbatimRegex = /\\begin\s*\{(verbatim|lstlisting|minted|comment|code)\}[\s\S]*?\\end\s*\{\1\}/g;
    while ((match = verbatimRegex.exec(text)) !== null) {
        skipRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    // Find \verb commands
    const verbRegex = /\\verb([^\s])[\s\S]*?\1/g;
    while ((match = verbRegex.exec(text)) !== null) {
        skipRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    const isSkipped = (idx: number) => {
        return skipRanges.some(r => idx >= r.start && idx < r.end);
    };

    boundaryRegex.lastIndex = 0;
    while ((match = boundaryRegex.exec(text)) !== null) {
        if (isSkipped(match.index)) {continue;}

        const m = match[0];
        const posInDoc = searchStartOffset + match.index;

        if (m.startsWith('\\begin')) {
            const envName = (match[1] || '').replace(/\s+/g, ' ').trim();
            stack.push({ type: 'begin', start: posInDoc, envName, tagLen: m.length });
        } else if (m.startsWith('\\end')) {
            const currentEndName = (match[2] || '').replace(/\s+/g, ' ').trim();
            const lastIdx = stack.map(s => s.envName).lastIndexOf(currentEndName);
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = posInDoc + m.length;
                if (offset >= last.start && offset <= endPos) {
                    // Only treat as math if it's a known math environment
                    const mathEnvs = [
                        'equation', 'equation*', 'equation *',
                        'align', 'align*', 'align *',
                        'gather', 'gather*', 'gather *',
                        'multline', 'multline*', 'multline *',
                        'flalign', 'flalign*', 'flalign *',
                        'alignat', 'alignat*', 'alignat *',
                        'displaymath'
                    ];
                    if (mathEnvs.includes(last.envName!)) {
                        candidates.push({
                            range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                            text: text.substring(last.start - searchStartOffset, endPos - searchStartOffset),
                            type: 'equation',
                            content: text.substring(last.start + last.tagLen - searchStartOffset, posInDoc - searchStartOffset),
                            envName: last.envName,
                            prefixLen: last.tagLen
                        });
                    }
                }
            }
        } else if (m === '$$' || m === '\\[' || m === '$' || m === '\\(') {
            const closeTag = m === '$$' ? '$$' : (m === '\\[' ? '\\]' : (m === '$' ? '$' : '\\)'));
            const existingIdx = stack.findIndex(s => s.type === m);
            
            // If it's $, we need to be careful as it's the same for open/close
            if (m === '$' || m === '$$') {
                if (existingIdx !== -1) {
                    const last = stack.splice(existingIdx, 1)[0];
                    const endPos = posInDoc + m.length;
                    if (offset >= last.start && offset <= endPos) {
                        candidates.push({
                            range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                            text: text.substring(last.start - searchStartOffset, endPos - searchStartOffset),
                            type: m === '$' ? 'inline' : 'display',
                            content: text.substring(last.start + last.tagLen - searchStartOffset, posInDoc - searchStartOffset),
                            prefixLen: last.tagLen
                        });
                    }
                } else {
                    stack.push({ type: m, start: posInDoc, tagLen: m.length });
                }
            } else {
                // For \[ and \(, we just push to stack and wait for \] and \)
                stack.push({ type: m, start: posInDoc, tagLen: m.length });
            }
        } else if (m === '\\]' || m === '\\)') {
            const openTag = m === '\\]' ? '\\[' : '\\(';
            const lastIdx = stack.map(s => s.type).lastIndexOf(openTag);
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = posInDoc + m.length;
                if (offset >= last.start && offset <= endPos) {
                    candidates.push({
                        range: new vscode.Range(document.positionAt(last.start), document.positionAt(endPos)),
                        text: text.substring(last.start - searchStartOffset, endPos - searchStartOffset),
                        type: openTag === '\\[' ? 'display' : 'inline',
                        content: text.substring(last.start + last.tagLen - searchStartOffset, posInDoc - searchStartOffset),
                        prefixLen: last.tagLen
                    });
                }
            }
        }
    }


    if (candidates.length === 0) {return null;}

    return candidates.reduce((prev, curr) => {
        return curr.text.length < prev.text.length ? curr : prev;
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
 * Uses a manual scan to avoid ReDoS and support nested braces.
 */
export function findCommandAtCursor(document: vscode.TextDocument, pos: vscode.Position): { range: vscode.Range, text: string } | null {
    const lineText = document.lineAt(pos.line).text;
    const restOfLine = lineText.substring(pos.character);

    if (!restOfLine.startsWith('\\')) {
        return null;
    }

    let i = 1; // skip backslash
    // Match command name: [a-zA-Z]+
    while (i < restOfLine.length && /[a-zA-Z]/.test(restOfLine[i])) {
        i++;
    }
    // Optional asterisk
    if (i < restOfLine.length && restOfLine[i] === '*') {
        i++;
    }

    // Match optional arguments like [], {}, _{}, ^{}
    while (i < restOfLine.length) {
        let j = i;
        // Skip whitespace before argument
        while (j < restOfLine.length && /\s/.test(restOfLine[j])) {
            j++;
        }

        if (j >= restOfLine.length) {
            break;
        }

        const char = restOfLine[j];
        if (char === '[') {
            const end = findClosingBracket(restOfLine, j, '[', ']');
            if (end !== -1) {
                i = end + 1;
                continue;
            }
        } else if (char === '{') {
            const end = findClosingBracket(restOfLine, j, '{', '}');
            if (end !== -1) {
                i = end + 1;
                continue;
            }
        } else if (char === '_' || char === '^') {
            let k = j + 1;
            // Skip whitespace after _ or ^ to look for {
            while (k < restOfLine.length && /\s/.test(restOfLine[k])) {
                k++;
            }
            if (k < restOfLine.length && restOfLine[k] === '{') {
                const end = findClosingBracket(restOfLine, k, '{', '}');
                if (end !== -1) {
                    i = end + 1;
                    continue;
                }
            } else {
                // If no {, check if there was an immediate character (no spaces allowed for single char arg)
                const immediateChar = restOfLine[j + 1];
                if (immediateChar && !/[\s{}]/.test(immediateChar)) {
                    i = j + 2;
                    continue;
                }
            }
        }
        break; // No more arguments matched
    }

    const commandText = restOfLine.substring(0, i);
    if (commandText === '\\') {
        return null;
    }

    return {
        range: new vscode.Range(pos, pos.translate(0, i)),
        text: commandText
    };
}

/**
 * Finds the index of the matching closing bracket, handling nested brackets and escaped characters.
 */
function findClosingBracket(text: string, start: number, open: string, close: string): number {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '\\' && i + 1 < text.length) {
            i++;
            continue;
        }
        if (text[i] === open) {
            depth++;
        } else if (text[i] === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}


/**
 * Checks if a given offset within the math content is inside a text-mode command.
 * Offset is relative to the start of 'content'.
 */
export function isInsideTextMode(content: string, offsetInContent: number): boolean {
    let i = 0;
    // Commands that contain non-math text or should be treated as literal text for certain features.
    const strictTextCommands = [
        '\\text', '\\mbox', '\\cite', '\\ref', '\\label'
    ];

    while (i < content.length) {
        if (content[i] === '\\') {
            const rest = content.substring(i);
            const commandMatch = rest.match(/^\\[a-zA-Z]+\*?/);
            if (commandMatch) {
                const cmd = commandMatch[0];
                if (strictTextCommands.includes(cmd)) {
                    let j = i + cmd.length;
                    while (j < content.length && /\s/.test(content[j])) {j++;}
                    if (content[j] === '{') {
                        const start = i; // Include backslash
                        i = j + 1;
                        let depth = 1;
                        while (i < content.length && depth > 0) {
                            if (content[i] === '{') {depth++;}
                            else if (content[i] === '}') {depth--;}
                            i++;
                        }
                        const end = i - 1;
                        if (offsetInContent >= start && offsetInContent <= end + 1) {
                            return true;
                        }
                        continue;
                    }
                }
                i += commandMatch[0].length;
                continue;
            }
        }
        i++;
    }
    return false;
}

/**
 * Checks if a LaTeX command structure is "empty" (only whitespace or delimiters in arguments).
 */
export function isCommandEmpty(commandText: string): boolean {
    const argsMatch = commandText.match(/^\\[a-zA-Z]+\*?\s*([\s\S]*)$/);
    if (!argsMatch || !argsMatch[1]) {return false;}

    const argsPart = argsMatch[1];
    const contentRegex = /[^{}[\]_^\s]/;
    return !contentRegex.test(argsPart);
}
