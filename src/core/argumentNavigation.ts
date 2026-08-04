import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

const TABLE_ENVS = new Set([
    'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix',
    'tabular', 'tabular*', 'array',
    'align', 'align*', 'gather', 'gather*', 'flalign', 'flalign*',
    'alignat', 'alignat*', 'multline', 'multline*',
    'cases', 'smallmatrix', 'subarray',
]);

const MATH_COMMANDS = new Set([
    '\\frac', '\\dfrac', '\\tfrac', '\\sqrt', '\\binom', '\\tbinom',
    '\\sum', '\\prod', '\\coprod', '\\int', '\\iint', '\\iiint', '\\oint',
    '\\lim', '\\min', '\\max', '\\sup', '\\inf', '\\gcd',
    '\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc',
    '\\sinh', '\\cosh', '\\tanh', '\\coth',
    '\\arcsin', '\\arccos', '\\arctan', '\\arctg',
    '\\log', '\\ln', '\\lg', '\\exp',
    '\\vec', '\\bar', '\\hat', '\\tilde', '\\dot', '\\ddot',
    '\\mathbb', '\\mathbf', '\\mathit', '\\mathsf', '\\mathcal', '\\mathfrak', '\\mathrm', '\\mathscr',
    '\\operatorname', '\\boldsymbol', '\\bm',
    '\\left', '\\right', '\\bigl', '\\bigr', '\\Bigl', '\\Bigr', '\\biggl', '\\biggr',
    '\\text', '\\textbf', '\\textit', '\\textrm', '\\textsf', '\\texttt', '\\mbox',
    '\\overline', '\\underline', '\\overbrace', '\\underbrace',
    '\\stackrel', '\\overset', '\\underset',
    '\\substack', '\\sideset',
    '\\pmod', '\\bmod', '\\pod',
    '\\displaystyle', '\\textstyle', '\\scriptstyle', '\\scriptscriptstyle',
    '\\xleftarrow', '\\xrightarrow',
    '\\phantom', '\\hphantom', '\\vphantom',
    '\\binom', '\\choose',
    '\\cline', '\\hline',
    '\\color', '\\colorbox', '\\fcolorbox',
    '\\not', '\\neq', '\\le', '\\ge', '\\equiv', '\\approx', '\\sim', '\\simeq',
    '\\cong', '\\propto', '\\prec', '\\succ', '\\preceq', '\\succeq',
    '\\cup', '\\cap', '\\setminus', '\\subset', '\\supset', '\\subseteq', '\\supseteq',
    '\\in', '\\notin', '\\ni', '\\emptyset', '\\varnothing',
    '\\forall', '\\exists', '\\nexists', '\\neg',
    '\\implies', '\\impliedby', '\\iff',
    '\\land', '\\lor', '\\vee', '\\wedge',
    '\\rightarrow', '\\leftarrow', '\\Rightarrow', '\\Leftarrow',
    '\\mapsto', '\\hookrightarrow', '\\hookleftarrow',
    '\\uparrow', '\\downarrow', '\\Uparrow', '\\Downarrow',
    '\\nearrow', '\\searrow', '\\swarrow', '\\nwarrow',
    '\\to', '\\gets', '\\rangle', '\\langle',
    '\\ldots', '\\cdots', '\\vdots', '\\ddots',
    '\\quad', '\\qquad',
    '\\prime', '\\partial', '\\infty', '\\nabla',
    '\\angle', '\\triangle', '\\square', '\\diamond',
    '\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\varepsilon',
    '\\zeta', '\\eta', '\\theta', '\\vartheta', '\\iota', '\\kappa',
    '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\varpi',
    '\\rho', '\\varrho', '\\sigma', '\\varsigma', '\\tau', '\\upsilon',
    '\\phi', '\\varphi', '\\chi', '\\psi', '\\omega',
    '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi',
    '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega',
    '\\aleph', '\\beth', '\\gimel', '\\daleth',
    '\\Re', '\\Im', '\\wp',
]);

interface CommandArg {
    range: vscode.Range;
    contentRange: vscode.Range;
    bracketType: '{' | '[';
    commandName: string;
}

interface CommandInfo {
    name: string;
    range: vscode.Range;
    args: CommandArg[];
}

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

function isInsideMathEnv(document: vscode.TextDocument, pos: vscode.Position): boolean {
    const mathEnv = findMathAtPos(document, pos);
    return mathEnv !== null;
}

function isLineCommented(lineText: string): boolean {
    const trimmed = lineText.trimStart();
    if (trimmed.startsWith('%')) {
        let backslashCount = 0;
        for (let i = lineText.indexOf('%') - 1; i >= 0; i--) {
            if (lineText[i] === '\\') { backslashCount++; }
            else { break; }
        }
        return backslashCount % 2 === 0;
    }
    return false;
}

function isTableEnv(envName: string | undefined): boolean {
    if (!envName) { return false; }
    return TABLE_ENVS.has(envName.replace(/\*$/, '').replace(/ $/, ''));
}

function findTableEnvAtPos(document: vscode.TextDocument, pos: vscode.Position): vscode.Range | null {
    const offset = document.offsetAt(pos);
    const startLine = Math.max(0, pos.line - 50);
    const endLine = Math.min(document.lineCount - 1, pos.line + 50);
    const safeEndLine = Math.max(0, Math.min(endLine, document.lineCount - 1));
    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, document.lineAt(safeEndLine).text.length));
    const text = document.getText(range);
    const baseOffset = document.offsetAt(range.start);

    const beginRegex = /\\begin\s*\{([^}]+)\}/g;
    const stack: { envName: string; startOffset: number }[] = [];
    let m: RegExpExecArray | null;

    while ((m = beginRegex.exec(text)) !== null) {
        const envName = m[1].trim();
        const absStart = baseOffset + m.index;
        const closeTag = `\\end{${envName}}`;
        let searchFrom = m.index + m[0].length;
        let depth = 1;
        let endIdx = -1;

        while (depth > 0 && searchFrom < text.length) {
            const nextBegin = text.indexOf(`\\begin{${envName}}`, searchFrom);
            const nextEnd = text.indexOf(closeTag, searchFrom);

            if (nextEnd === -1) { break; }
            if (nextBegin !== -1 && nextBegin < nextEnd) {
                depth++;
                searchFrom = nextBegin + 1;
            } else {
                depth--;
                if (depth === 0) { endIdx = nextEnd; }
                searchFrom = nextEnd + 1;
            }
        }

        if (endIdx !== -1) {
            const absEnd = baseOffset + endIdx + closeTag.length;
            if (offset >= absStart && offset <= absEnd && isTableEnv(envName)) {
                stack.push({ envName, startOffset: absStart });
            }
        }
    }

    if (stack.length === 0) { return null; }

    let best = stack[0];
    for (const s of stack) {
        if (s.startOffset > best.startOffset) {
            best = s;
        }
    }

    const envName = best.envName;
    const closeTag = `\\end{${envName}}`;
    const contentStartOffset = best.startOffset + `\\begin{${envName}}`.length;

    let searchFrom = best.startOffset - baseOffset + `\\begin{${envName}}`.length;
    let depth = 1;
    let endIdx = -1;
    while (depth > 0 && searchFrom < text.length) {
        const nextBegin = text.indexOf(`\\begin{${envName}}`, searchFrom);
        const nextEnd = text.indexOf(closeTag, searchFrom);
        if (nextEnd === -1) { break; }
        if (nextBegin !== -1 && nextBegin < nextEnd) {
            depth++;
            searchFrom = nextBegin + 1;
        } else {
            depth--;
            if (depth === 0) { endIdx = nextEnd; }
            searchFrom = nextEnd + 1;
        }
    }
    if (endIdx === -1) { return null; }

    return new vscode.Range(
        document.positionAt(best.startOffset),
        document.positionAt(baseOffset + endIdx + closeTag.length)
    );
}

function findTopLevelAmpersands(lineText: string): number[] {
    const positions: number[] = [];
    let depth = 0;
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '\\' && i + 1 < lineText.length) {
            i++;
            continue;
        }
        if (lineText[i] === '{' || lineText[i] === '[' || lineText[i] === '(') {
            depth++;
        } else if (lineText[i] === '}' || lineText[i] === ']' || lineText[i] === ')') {
            depth--;
        } else if (lineText[i] === '&' && depth === 0) {
            positions.push(i);
        }
    }
    return positions;
}

function findTopLevelRowEnd(lineText: string): number {
    let depth = 0;
    for (let i = 0; i < lineText.length - 1; i++) {
        if (lineText[i] === '\\' && i + 1 < lineText.length) {
            if (lineText[i + 1] === '\\' && depth === 0) {
                return i;
            }
            i++;
            continue;
        }
        if (lineText[i] === '{' || lineText[i] === '[') { depth++; }
        else if (lineText[i] === '}' || lineText[i] === ']') { depth--; }
    }
    return lineText.length;
}

function findCellRange(lineText: string, ampersands: number[], rowEnd: number, cellIdx: number): { start: number; end: number } {
    const cellStart = cellIdx === 0 ? 0 : ampersands[cellIdx - 1] + 1;
    const cellEnd = cellIdx < ampersands.length ? ampersands[cellIdx] : rowEnd;
    const raw = lineText.substring(cellStart, cellEnd);
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmedEnd = raw.trimEnd().length;
    return {
        start: cellStart + trimmedStart,
        end: cellStart + trimmedEnd,
    };
}

function findCurrentCellIdx(charPos: number, ampersands: number[]): number {
    for (let i = 0; i < ampersands.length; i++) {
        if (charPos <= ampersands[i]) { return i; }
    }
    return ampersands.length;
}

function smartTabForward(editor: vscode.TextEditor): boolean {
    const document = editor.document;
    const pos = editor.selection.active;

    if (!findTableEnvAtPos(document, pos)) {
        return false;
    }

    const lineNum = Math.max(0, Math.min(pos.line, document.lineCount - 1));
    const lineText = document.lineAt(lineNum).text;
    const charPos = editor.selection.start.character;
    const ampersands = findTopLevelAmpersands(lineText);
    const rowEnd = findTopLevelRowEnd(lineText);

    const currentCellIdx = findCurrentCellIdx(charPos, ampersands);
    const nextCellIdx = currentCellIdx + 1;

    if (nextCellIdx < ampersands.length + 1) {
        const cell = findCellRange(lineText, ampersands, rowEnd, nextCellIdx);
        if (cell.start < cell.end) {
            editor.selection = new vscode.Selection(pos.line, cell.start, pos.line, cell.end);
        } else {
            const insertPos = nextCellIdx <= ampersands.length && nextCellIdx > 0
                ? ampersands[nextCellIdx - 1] + 1
                : lineText.length;
            editor.selection = new vscode.Selection(pos.line, insertPos, pos.line, insertPos);
        }
        return true;
    }

    const envRange = findTableEnvAtPos(document, pos);
    if (!envRange) {
        return false;
    }
    for (let nextLine = pos.line + 1; nextLine <= envRange.end.line; nextLine++) {
        const safeNextLine = Math.max(0, Math.min(nextLine, document.lineCount - 1));
        const nextLineText = document.lineAt(safeNextLine).text;
        if (nextLineText.trim().length === 0 || nextLineText.trim().startsWith('%')) {
            continue;
        }
        if (nextLineText.trimStart().startsWith('\\end')) {
            break;
        }
        const nextAmpersands = findTopLevelAmpersands(nextLineText);
        const nextRowEnd = findTopLevelRowEnd(nextLineText);
        if (nextAmpersands.length > 0) {
            const cell = findCellRange(nextLineText, nextAmpersands, nextRowEnd, 0);
            if (cell.start < cell.end) {
                editor.selection = new vscode.Selection(nextLine, cell.start, nextLine, cell.end);
            } else {
                editor.selection = new vscode.Selection(nextLine, nextAmpersands[0] + 1, nextLine, nextAmpersands[0] + 1);
            }
        } else {
            const firstCell = findCellRange(nextLineText, [], nextRowEnd, 0);
            if (firstCell.start < firstCell.end) {
                editor.selection = new vscode.Selection(nextLine, firstCell.start, nextLine, firstCell.end);
            } else {
                editor.selection = new vscode.Selection(nextLine, 0, nextLine, 0);
            }
        }
        return true;
    }
    return false;
}

function smartTabBackward(editor: vscode.TextEditor): boolean {
    const document = editor.document;
    const pos = editor.selection.active;

    if (!findTableEnvAtPos(document, pos)) {
        return false;
    }

    const lineNum = Math.max(0, Math.min(pos.line, document.lineCount - 1));
    const lineText = document.lineAt(lineNum).text;
    const charPos = editor.selection.start.character;
    const ampersands = findTopLevelAmpersands(lineText);
    const rowEnd = findTopLevelRowEnd(lineText);

    const currentCellIdx = findCurrentCellIdx(charPos, ampersands);

    if (currentCellIdx > 0) {
        const prevCellIdx = currentCellIdx - 1;
        const cell = findCellRange(lineText, ampersands, rowEnd, prevCellIdx);
        editor.selection = new vscode.Selection(pos.line, cell.end, pos.line, cell.start);
        return true;
    }

    const prevLineNum = pos.line - 1;
    if (prevLineNum < 0) { return false; }
    const safePrevLine = Math.max(0, Math.min(prevLineNum, document.lineCount - 1));
    const prevLineText = document.lineAt(safePrevLine).text;
    const prevAmps = findTopLevelAmpersands(prevLineText);
    const prevRowEnd = findTopLevelRowEnd(prevLineText);
    const lastCellIdx = prevAmps.length;
    const cell = findCellRange(prevLineText, prevAmps, prevRowEnd, lastCellIdx);
    editor.selection = new vscode.Selection(prevLineNum, cell.end, prevLineNum, cell.start);
    return true;
}

function parseCommandOnLine(
    lineText: string,
    startChar: number,
    doc: vscode.TextDocument,
    docOffsetBase: number
): CommandInfo | null {
    const rest = lineText.substring(startChar);
    if (!rest.startsWith('\\')) {
        return null;
    }

    let i = 1;
    while (i < rest.length && /[a-zA-Z]/.test(rest[i])) {
        i++;
    }
    if (i < rest.length && rest[i] === '*') {
        i++;
    }
    if (i <= 1) {
        return null;
    }

    const cmdName = rest.substring(0, i);
    if (cmdName === '\\begin' || cmdName === '\\end') {
        return null;
    }

    const cmdStartOffset = docOffsetBase + startChar;
    const cmdStartPosition = doc.positionAt(cmdStartOffset);

    const args: CommandArg[] = [];
    let pos = i;

    while (pos < rest.length) {
        let j = pos;
        while (j < rest.length && /\s/.test(rest[j])) {
            j++;
        }
        if (j >= rest.length) {
            break;
        }

        const ch = rest[j];
        if (ch === '{') {
            const closeIdx = findClosingBracket(rest, j, '{', '}');
            if (closeIdx === -1) {
                break;
            }
            const openAbsOffset = docOffsetBase + startChar + j;
            const closeAbsOffset = docOffsetBase + startChar + closeIdx;
            args.push({
                range: new vscode.Range(doc.positionAt(openAbsOffset), doc.positionAt(closeAbsOffset + 1)),
                contentRange: new vscode.Range(doc.positionAt(openAbsOffset + 1), doc.positionAt(closeAbsOffset)),
                bracketType: '{',
                commandName: cmdName,
            });
            pos = closeIdx + 1;
        } else if (ch === '[') {
            const closeIdx = findClosingBracket(rest, j, '[', ']');
            if (closeIdx === -1) {
                break;
            }
            const openAbsOffset = docOffsetBase + startChar + j;
            const closeAbsOffset = docOffsetBase + startChar + closeIdx;
            args.push({
                range: new vscode.Range(doc.positionAt(openAbsOffset), doc.positionAt(closeAbsOffset + 1)),
                contentRange: new vscode.Range(doc.positionAt(openAbsOffset + 1), doc.positionAt(closeAbsOffset)),
                bracketType: '[',
                commandName: cmdName,
            });
            pos = closeIdx + 1;
        } else {
            break;
        }
    }

    if (args.length === 0) {
        return null;
    }

    const lastArg = args[args.length - 1];
    const cmdEndOffset = doc.offsetAt(lastArg.range.end);

    return {
        name: cmdName,
        range: new vscode.Range(cmdStartPosition, doc.positionAt(cmdEndOffset)),
        args,
    };
}

function findCurrentArg(
    document: vscode.TextDocument,
    position: vscode.Position
): CommandArg | null {
    const offset = document.offsetAt(position);
    const lineNum = Math.max(0, Math.min(position.line, document.lineCount - 1));
    const lineText = document.lineAt(lineNum).text;
    const cmdRegex = /\\[a-zA-Z]+\*?/g;
    let match: RegExpExecArray | null;

    while ((match = cmdRegex.exec(lineText)) !== null) {
        const cmdStartChar = match.index;
        const cmdName = match[0];

        if (cmdName === '\\begin' || cmdName === '\\end') {
            continue;
        }

        const lineOffset = document.offsetAt(new vscode.Position(position.line, 0));
        const cmdInfo = parseCommandOnLine(lineText, cmdStartChar, document, lineOffset);

        if (!cmdInfo) {
            continue;
        }

        for (const arg of cmdInfo.args) {
            const argStartOffset = document.offsetAt(arg.range.start);
            const argEndOffset = document.offsetAt(arg.range.end);

            if (offset >= argStartOffset && offset <= argEndOffset) {
                return arg;
            }
        }
    }

    return null;
}

function* scanCommands(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
    reverse: boolean = false
): Generator<CommandInfo> {
    if (reverse) {
        for (let lineNum = endLine; lineNum >= startLine; lineNum--) {
            const safeLineNum = Math.max(0, Math.min(lineNum, document.lineCount - 1));
            const lineText = document.lineAt(safeLineNum).text;
            if (isLineCommented(lineText)) {
                continue;
            }
            const lineOffset = document.offsetAt(new vscode.Position(lineNum, 0));
            const cmdRegex = /\\[a-zA-Z]+\*?/g;
            const commandsOnLine: CommandInfo[] = [];
            let match: RegExpExecArray | null;

            while ((match = cmdRegex.exec(lineText)) !== null) {
                const cmdStartChar = match.index;
                const cmdName = match[0];
                if (cmdName === '\\begin' || cmdName === '\\end') {
                    continue;
                }
                const cmdInfo = parseCommandOnLine(lineText, cmdStartChar, document, lineOffset);
                if (cmdInfo) {
                    commandsOnLine.push(cmdInfo);
                }
            }

            for (let i = commandsOnLine.length - 1; i >= 0; i--) {
                yield commandsOnLine[i];
            }
        }
    } else {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const safeLineNum = Math.max(0, Math.min(lineNum, document.lineCount - 1));
            const lineText = document.lineAt(safeLineNum).text;
            if (isLineCommented(lineText)) {
                continue;
            }
            const lineOffset = document.offsetAt(new vscode.Position(lineNum, 0));
            const cmdRegex = /\\[a-zA-Z]+\*?/g;
            let match: RegExpExecArray | null;

            while ((match = cmdRegex.exec(lineText)) !== null) {
                const cmdStartChar = match.index;
                const cmdName = match[0];
                if (cmdName === '\\begin' || cmdName === '\\end') {
                    continue;
                }
                const cmdInfo = parseCommandOnLine(lineText, cmdStartChar, document, lineOffset);
                if (cmdInfo) {
                    yield cmdInfo;
                }
            }
        }
    }
}

function getCurrentCommandEndOffset(document: vscode.TextDocument, pos: vscode.Position): number {
    const lineNum = Math.max(0, Math.min(pos.line, document.lineCount - 1));
    const lineText = document.lineAt(lineNum).text;
    const lineOffset = document.offsetAt(new vscode.Position(pos.line, 0));
    const cursorOffset = document.offsetAt(pos);
    const cmdRegex = /\\[a-zA-Z]+\*?/g;
    let m: RegExpExecArray | null;
    while ((m = cmdRegex.exec(lineText)) !== null) {
        const info = parseCommandOnLine(lineText, m.index, document, lineOffset);
        if (info) {
            for (const arg of info.args) {
                const argStart = document.offsetAt(arg.range.start);
                const argEnd = document.offsetAt(arg.range.end);
                if (cursorOffset >= argStart && cursorOffset <= argEnd) {
                    return document.offsetAt(info.range.end);
                }
            }
        }
    }
    return cursorOffset;
}

function getCurrentCommandStartOffset(document: vscode.TextDocument, pos: vscode.Position): number {
    const lineNum = Math.max(0, Math.min(pos.line, document.lineCount - 1));
    const lineText = document.lineAt(lineNum).text;
    const lineOffset = document.offsetAt(new vscode.Position(pos.line, 0));
    const cursorOffset = document.offsetAt(pos);
    const cmdRegex = /\\[a-zA-Z]+\*?/g;
    let m: RegExpExecArray | null;
    while ((m = cmdRegex.exec(lineText)) !== null) {
        const info = parseCommandOnLine(lineText, m.index, document, lineOffset);
        if (info) {
            for (const arg of info.args) {
                const argStart = document.offsetAt(arg.range.start);
                const argEnd = document.offsetAt(arg.range.end);
                if (cursorOffset >= argStart && cursorOffset <= argEnd) {
                    return document.offsetAt(info.range.start);
                }
            }
        }
    }
    return cursorOffset;
}

function navigateArgumentForward(editor: vscode.TextEditor): boolean {
    const document = editor.document;
    const pos = editor.selection.active;

    const currentArg = findCurrentArg(document, pos);
    if (!currentArg) {
        return false;
    }

    if (isInsideMathEnv(document, pos)) {
        return false;
    }

    const targetBracketType = currentArg.bracketType;
    const currentCmdEndOffset = getCurrentCommandEndOffset(document, pos);

    const currentLine = pos.line;
    const startLine = Math.max(0, currentLine - 50);
    const endLine = Math.min(document.lineCount - 1, currentLine + 50);

    for (const cmdInfo of scanCommands(document, startLine, endLine, false)) {
        const cmdStartOffset = document.offsetAt(cmdInfo.range.start);
        if (cmdStartOffset <= currentCmdEndOffset) {
            continue;
        }

        const cmdPos = document.positionAt(cmdStartOffset);
        if (isInsideMathEnv(document, cmdPos)) {
            continue;
        }

        if (MATH_COMMANDS.has(cmdInfo.name)) {
            continue;
        }

        const matchingArg = cmdInfo.args.find(a => a.bracketType === targetBracketType);
        if (matchingArg) {
            editor.selection = new vscode.Selection(matchingArg.contentRange.start, matchingArg.contentRange.end);
            editor.revealRange(matchingArg.contentRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return true;
        }
    }

    for (const cmdInfo of scanCommands(document, startLine, endLine, false)) {
        const cmdPos = document.positionAt(document.offsetAt(cmdInfo.range.start));
        if (isInsideMathEnv(document, cmdPos)) {
            continue;
        }
        if (MATH_COMMANDS.has(cmdInfo.name)) {
            continue;
        }

        const matchingArg = cmdInfo.args.find(a => a.bracketType === targetBracketType);
        if (matchingArg) {
            editor.selection = new vscode.Selection(matchingArg.contentRange.start, matchingArg.contentRange.end);
            editor.revealRange(matchingArg.contentRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return true;
        }
    }

    return false;
}

function navigateArgumentBackward(editor: vscode.TextEditor): boolean {
    const document = editor.document;
    const pos = editor.selection.active;

    const currentArg = findCurrentArg(document, pos);
    if (!currentArg) {
        return false;
    }

    if (isInsideMathEnv(document, pos)) {
        return false;
    }

    const targetBracketType = currentArg.bracketType;
    const currentCmdStartOffset = getCurrentCommandStartOffset(document, pos);

    const currentLine = pos.line;
    const startLine = Math.max(0, currentLine - 50);
    const endLine = Math.min(document.lineCount - 1, currentLine + 50);

    for (const cmdInfo of scanCommands(document, startLine, endLine, true)) {
        const cmdEndOffset = document.offsetAt(cmdInfo.range.end);
        if (cmdEndOffset > currentCmdStartOffset) {
            continue;
        }

        const cmdPos = document.positionAt(document.offsetAt(cmdInfo.range.start));
        if (isInsideMathEnv(document, cmdPos)) {
            continue;
        }

        if (MATH_COMMANDS.has(cmdInfo.name)) {
            continue;
        }

        const matchingArgs = cmdInfo.args.filter(a => a.bracketType === targetBracketType);
        if (matchingArgs.length > 0) {
            const matchingArg = matchingArgs[matchingArgs.length - 1];
            editor.selection = new vscode.Selection(matchingArg.contentRange.end, matchingArg.contentRange.start);
            editor.revealRange(matchingArg.contentRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return true;
        }
    }

    for (const cmdInfo of scanCommands(document, startLine, endLine, true)) {
        const cmdPos = document.positionAt(document.offsetAt(cmdInfo.range.start));
        if (isInsideMathEnv(document, cmdPos)) {
            continue;
        }
        if (MATH_COMMANDS.has(cmdInfo.name)) {
            continue;
        }

        const matchingArgs = cmdInfo.args.filter(a => a.bracketType === targetBracketType);
        if (matchingArgs.length > 0) {
            const matchingArg = matchingArgs[matchingArgs.length - 1];
            editor.selection = new vscode.Selection(matchingArg.contentRange.end, matchingArg.contentRange.start);
            editor.revealRange(matchingArg.contentRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return true;
        }
    }

    return false;
}

export function registerArgumentNavigation(context: vscode.ExtensionContext) {
    const forwardCmd = vscode.commands.registerTextEditorCommand(
        'tex-machina.navigateArgumentForward',
        async (editor) => {
            if (editor.document.languageId !== 'latex') {
                await vscode.commands.executeCommand('tab');
                return;
            }

            const config = vscode.workspace.getConfiguration('tex-machina');
            if (!config.get<boolean>('argumentNavigation.enabled', true)) {
                await vscode.commands.executeCommand('tab');
                return;
            }

            if (smartTabForward(editor)) { return; }
            if (navigateArgumentForward(editor)) { return; }
            await vscode.commands.executeCommand('tab');
        }
    );

    const backwardCmd = vscode.commands.registerTextEditorCommand(
        'tex-machina.navigateArgumentBackward',
        async (editor) => {
            if (editor.document.languageId !== 'latex') {
                await vscode.commands.executeCommand('outdent');
                return;
            }

            const config = vscode.workspace.getConfiguration('tex-machina');
            if (!config.get<boolean>('argumentNavigation.enabled', true)) {
                await vscode.commands.executeCommand('outdent');
                return;
            }

            if (smartTabBackward(editor)) { return; }
            if (navigateArgumentBackward(editor)) { return; }
            await vscode.commands.executeCommand('outdent');
        }
    );

    context.subscriptions.push(forwardCmd, backwardCmd);
}
