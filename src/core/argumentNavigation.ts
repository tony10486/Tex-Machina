import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

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
    const lineText = document.lineAt(position.line).text;
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
            const lineText = document.lineAt(lineNum).text;
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
            const lineText = document.lineAt(lineNum).text;
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
    const lineText = document.lineAt(pos.line).text;
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
    const lineText = document.lineAt(pos.line).text;
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

function navigateForward(editor: vscode.TextEditor): boolean {
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

    const lineCount = document.lineCount;

    for (const cmdInfo of scanCommands(document, 0, lineCount - 1, false)) {
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

    for (const cmdInfo of scanCommands(document, 0, lineCount - 1, false)) {
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

function navigateBackward(editor: vscode.TextEditor): boolean {
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

    const lineCount = document.lineCount;

    for (const cmdInfo of scanCommands(document, 0, lineCount - 1, true)) {
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

    for (const cmdInfo of scanCommands(document, 0, lineCount - 1, true)) {
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

            const handled = navigateForward(editor);
            if (!handled) {
                await vscode.commands.executeCommand('tab');
            }
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

            const handled = navigateBackward(editor);
            if (!handled) {
                await vscode.commands.executeCommand('outdent');
            }
        }
    );

    context.subscriptions.push(forwardCmd, backwardCmd);
}
