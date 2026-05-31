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

export function isInOpenMathEnv(line: string, charPos: number): boolean {
    const textBefore = line.substring(0, charPos);

    if (textBefore.includes('\\[')) {
        const lastOpen = textBefore.lastIndexOf('\\[');
        const after = textBefore.substring(lastOpen + 2);
        if (!after.includes('\\]')) {
            return true;
        }
    }
    if (textBefore.includes('\\(')) {
        const lastOpen = textBefore.lastIndexOf('\\(');
        const after = textBefore.substring(lastOpen + 2);
        if (!after.includes('\\)')) {
            return true;
        }
    }

    const beginMatch = textBefore.match(/\\begin\s*\{((?:equation|align|gather|multline|flalign|alignat|displaymath)\*?)\}/);
    if (beginMatch) {
        const envName = beginMatch[1];
        const afterOpen = textBefore.substring(beginMatch.index! + beginMatch[0].length);
        if (afterOpen.includes('\\end{' + envName + '}')) {
            return false;
        }
        return true;
    }

    const dollarCount = (textBefore.match(/\$/g) || []).length;
    if (dollarCount % 2 === 1) {
        return true;
    }

    return false;
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
        if (ch === '$' || ch === '\\') {
            if (ch === '$') {
                exprStart = i + 1;
                break;
            }
            if (ch === '\\') {
                if (line.substring(i, i + 2) === '\\[' || line.substring(i, i + 2) === '\\(') {
                    exprStart = i + 2;
                    break;
                }
                if (line.substring(i, i + 6) === '\\begin') {
                    const bracketStart = line.indexOf('{', i);
                    const bracketEnd = line.indexOf('}', bracketStart);
                    if (bracketStart > 0 && bracketEnd > bracketStart) {
                        exprStart = bracketEnd + 1;
                        break;
                    }
                }
                exprStart = i;
                break;
            }
        }
    }

    const expr = line.substring(exprStart, exprEnd).trim();
    return expr || null;
}
