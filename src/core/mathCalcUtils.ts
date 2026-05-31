import * as vscode from 'vscode';

export interface CalcOperation {
    mainCommand: string;
    subCommands: string[];
}

export function detectOperation(expr: string): CalcOperation {
    const s = expr.replace(/\s/g, '');

    if (s.includes('\\int') || s.includes('\\iint') || s.includes('\\iiint')) {
        return { mainCommand: 'calc', subCommands: [] };
    }
    if (s.includes('\\frac{d') || s.includes('\\partial')) {
        return { mainCommand: 'calc', subCommands: [] };
    }
    if (s.includes('\\lim')) {
        return { mainCommand: 'calc', subCommands: [] };
    }
    if (s.includes('\\sum') || s.includes('\\prod')) {
        return { mainCommand: 'calc', subCommands: [] };
    }

    if (s.includes('\\sin') || s.includes('\\cos') || s.includes('\\tan') ||
        s.includes('\\log') || s.includes('\\ln') || s.includes('\\exp')) {
        return { mainCommand: 'simplify', subCommands: [] };
    }

    if (/[a-zA-Z]/.test(s) && /\^/.test(s)) {
        return { mainCommand: 'expand', subCommands: [] };
    }

    return { mainCommand: 'simplify', subCommands: [] };
}

const MATH_OPENERS: { start: string; end: string }[] = [
    { start: '\\[', end: '\\]' },
    { start: '\\(', end: '\\)' },
    { start: '$$', end: '$$' },
];

const ENV_REGEX = /\\begin\s*\{((?:equation|align|gather|multline|flalign|alignat|displaymath)\*?)\}/;

function findMathOpenBefore(text: string): { start: number; prefixLen: number } | null {
    for (const pair of MATH_OPENERS) {
        const idx = text.lastIndexOf(pair.start);
        if (idx >= 0) {
            const after = text.substring(idx + pair.start.length);
            if (!after.includes(pair.end)) {
                return { start: idx, prefixLen: pair.start.length };
            }
        }
    }

    const envMatch = text.match(ENV_REGEX);
    if (envMatch) {
        const idx = envMatch.index!;
        const after = text.substring(idx + envMatch[0].length);
        if (!after.includes('\\end{' + envMatch[1] + '}')) {
            return { start: idx, prefixLen: envMatch[0].length };
        }
    }

    let count = 0;
    let lastIdx = -1;
    let i = 0;
    while (i < text.length) {
        if (text[i] === '$') {
            if (i + 1 < text.length && text[i + 1] === '$') {
                count += 2;
                lastIdx = i;
                i += 2;
            } else {
                count++;
                lastIdx = i;
                i++;
            }
        } else {
            i++;
        }
    }
    if (count % 2 === 1) {
        return { start: lastIdx, prefixLen: 1 };
    }

    return null;
}

export function isInOpenMathEnv(document: vscode.TextDocument, pos: vscode.Position): boolean {
    const startLine = Math.max(0, pos.line - 150);
    let combined = '';

    for (let l = startLine; l <= pos.line; l++) {
        const lineText = document.lineAt(l).text;
        const charLimit = (l === pos.line) ? pos.character : lineText.length;
        combined += '\n' + lineText.substring(0, charLimit);
    }

    return findMathOpenBefore(combined) !== null;
}

export function extractExprFromLine(
    line: string,
    cursorChar: number,
    triggerLength: number
): string | null {
    const triggerStart = cursorChar - triggerLength;
    if (triggerStart <= 0) { return null; }

    const exprEnd = triggerStart;
    let exprStart = 0;

    for (let i = exprEnd - 1; i >= 0; i--) {
        const ch = line[i];
        if (ch === '$') {
            if (i > 0 && line[i - 1] === '$') {
                i--;
            }
            exprStart = i + 1;
            break;
        }
        if (ch === '\\') {
            if (line.startsWith('\\[', i) || line.startsWith('\\(', i)) {
                exprStart = i + 2;
                break;
            }
            if (line.startsWith('\\begin', i)) {
                const bracketStart = line.indexOf('{', i);
                const bracketEnd = line.indexOf('}', bracketStart);
                if (bracketStart > 0 && bracketEnd > bracketStart) {
                    exprStart = bracketEnd + 1;
                    break;
                }
            }
        }
    }

    const expr = line.substring(exprStart, exprEnd).trim();
    return expr || null;
}

export function extractExprFromDocument(
    document: vscode.TextDocument,
    pos: vscode.Position,
    triggerLength: number
): string | null {
    const cursorOffset = document.offsetAt(pos);
    const exprEnd = cursorOffset - triggerLength;
    if (exprEnd <= 0) { return null; }

    const startLine = Math.max(0, pos.line - 150);
    const docStart = document.offsetAt(new vscode.Position(startLine, 0));
    const beforeText = document.getText().substring(docStart, exprEnd);

    const found = findMathOpenBefore(beforeText);
    if (!found) { return null; }

    const expr = beforeText.substring(found.start + found.prefixLen).trim();
    return expr || null;
}
