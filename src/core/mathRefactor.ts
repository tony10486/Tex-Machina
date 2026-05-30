import * as vscode from 'vscode';
import { isSubscriptToggleActive, registerToggleFeature, isFeatureActive } from './toggleMode';
import { findMathAtPos, isInsideTextMode } from './latexParser';

export interface MathRange {
    range: vscode.Range;
    content: string;
    type: string;
}

let isInternalSelectionChange = false;
let lastMathEnvRange: vscode.Range | undefined;
let isRefactoringActive = false;

export function registerMathRefactor(context: vscode.ExtensionContext) {
    // 1. Traditional Manual Command (Still useful for explicit refactoring)
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.mathRefactor', async () => {
            if (!isSubscriptToggleActive()) {
                vscode.window.showWarningMessage('수학적 변수 일괄 변경 기능은 Toggle Mode가 활성화된 상태에서만 사용할 수 있습니다.');
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {return;}

            const document = editor.document;
            const selection = editor.selection;

            let oldSymbol = "";
            if (!selection.isEmpty) {
                oldSymbol = document.getText(selection).trim();
            } else {
                const range = document.getWordRangeAtPosition(selection.active, /\\[a-zA-Z]+|(?<!\\)[a-zA-Z0-9]+/);
                if (range) {
                    oldSymbol = document.getText(range);
                }
            }

            const inputOld = await vscode.window.showInputBox({
                prompt: '변경할 변수/기호를 입력하세요 (예: x 또는 \\alpha)',
                value: oldSymbol
            });

            if (!inputOld) {return;}

            const inputNew = await vscode.window.showInputBox({
                prompt: `${inputOld}를 무엇으로 바꾸시겠습니까? (예: \\theta)`,
                value: ''
            });

            if (inputNew === undefined) {return;}

            const scope = selection.isEmpty 
                ? new vscode.Range(selection.active.line, 0, selection.active.line, document.lineAt(selection.active.line).text.length)
                : selection;
            
            const mathRanges = findMathRanges(document, scope);

            if (mathRanges.length === 0) {
                vscode.window.showInformationMessage('선택한 영역(또는 현재 줄)에서 수식 영역을 찾지 못했습니다.');
                return;
            }

            await editor.edit(editBuilder => {
                let totalChanges = 0;
                for (const math of mathRanges) {
                    const refactored = refactorInMath(math.content, inputOld, inputNew);
                    if (refactored !== math.content) {
                        editBuilder.replace(math.range, refactored);
                        totalChanges++;
                    }
                }
                
                if (totalChanges > 0) {
                    vscode.window.showInformationMessage(`${totalChanges}개의 수식 영역에서 변수가 변경되었습니다.`);
                }
            });
        })
    );

    // 2. Automatic Multi-Cursor Variable Selection (Toggle Feature)
    registerToggleFeature({
        name: 'mathRefactor',
        onSelectionChange: async (event, editor) => {
            if (isInternalSelectionChange) {return;}

            const selection = event.selections[0];
            const document = editor.document;

            // 1. Auto-Deactivation: If multi-cursor is active and primary selection moves out of math environment, reset.
            if (isRefactoringActive && lastMathEnvRange) {
                if (!lastMathEnvRange.contains(selection.active)) {
                    isRefactoringActive = false;
                    lastMathEnvRange = undefined;
                    isInternalSelectionChange = true;
                    try {
                        editor.selections = [new vscode.Selection(selection.active, selection.active)];
                    } finally {
                        isInternalSelectionChange = false;
                    }
                    return;
                }
            }

            // 2. Trigger Check: Must have exactly ONE selection and it must NOT be empty (user must drag/select)
            if (event.selections.length !== 1 || selection.isEmpty) {
                return;
            }

            // 3. Identify the symbol under the selection
            const wordRange = document.getWordRangeAtPosition(selection.start, /\\[a-zA-Z]+|(?<!\\)[a-zA-Z0-9]+/);
            if (!wordRange) {return;}

            // The selection must match or be within the variable
            if (!wordRange.contains(selection)) {return;}

            const symbol = document.getText(wordRange);
            if (!symbol || symbol.length === 0) {return;}

            // 4. Ensure we are in a math environment
            const mathEnv = findMathAtPos(document, selection.active);
            if (!mathEnv) {return;}

            // 5. Text Mode Protection: Ensure the selection is not inside \text{...} or similar
            const offsetInContent = document.offsetAt(selection.start) - (document.offsetAt(mathEnv.range.start) + mathEnv.prefixLen);
            if (isInsideTextMode(mathEnv.content, offsetInContent)) {return;}

            // 6. Find all occurrences of this symbol in the same math environment
            const occurrences = findOccurrencesInMath(document, mathEnv, symbol);
            
            if (occurrences.length <= 1) {return;}

            // Check if we already have these selections to avoid unnecessary updates
            const currentSelections = editor.selections;
            if (occurrences.length === currentSelections.length && 
                occurrences.every((s, i) => s.isEqual(currentSelections[i]))) {
                return;
            }

            // 7. Update selections to include all occurrences (Multi-Cursor)
            isInternalSelectionChange = true;
            try {
                const newSelections = occurrences.map(range => new vscode.Selection(range.start, range.end));
                editor.selections = newSelections;
                isRefactoringActive = true;
                lastMathEnvRange = mathEnv.range;
            } finally {
                isInternalSelectionChange = false;
            }
        },
        onDeactivate: () => {
            isRefactoringActive = false;
            lastMathEnvRange = undefined;
        }
    });
}

/**
 * Checks if a given offset within the math content is inside a text-mode command.
 */

/**
 * Finds all semantic occurrences of a symbol within a math environment.
 * Reuses logic from Linked Editing for consistency.
 */
export function findOccurrencesInMath(document: vscode.TextDocument, mathEnv: any, symbol: string): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    const content = mathEnv.content;
    const envStartOffset = document.offsetAt(mathEnv.range.start);
    const startOffset = envStartOffset + mathEnv.prefixLen;
    
    let i = 0;
    const strictTextCommands = ['\\text', '\\mbox', '\\cite', '\\ref', '\\label'];

    while (i < content.length) {
        // Skip text mode commands
        let matchedTextCmd = false;
        for (const cmd of strictTextCommands) {
            if (content.startsWith(cmd, i)) {
                let j = i + cmd.length;
                while (j < content.length && /\s/.test(content[j])) {j++;}
                if (content[j] === '{') {
                    i = j + 1;
                    let depth = 1;
                    while (i < content.length && depth > 0) {
                        if (content[i] === '{') {depth++;}
                        else if (content[i] === '}') {depth--;}
                        i++;
                    }
                    matchedTextCmd = true;
                    break;
                }
            }
        }
        if (matchedTextCmd) {continue;}

        // Check for command symbol
        if (content[i] === '\\') {
            const rest = content.substring(i);
            const commandMatch = rest.match(/^\\[a-zA-Z]+\*?/);
            if (commandMatch) {
                if (commandMatch[0] === symbol) {
                    const nextChar = rest[commandMatch[0].length];
                    if (!nextChar || !/[a-zA-Z]/.test(nextChar)) {
                        ranges.push(new vscode.Range(document.positionAt(startOffset + i), document.positionAt(startOffset + i + symbol.length)));
                    }
                }
                i += commandMatch[0].length;
                continue;
            }
            i++;
            continue;
        }

        // Check for single char variable
        if (content.substring(i, i + symbol.length) === symbol && !symbol.startsWith('\\')) {
            const prevChar = i > 0 ? content[i - 1] : '';
            const nextChar = i + symbol.length < content.length ? content[i + symbol.length] : '';
            
            const isPrevValid = !/[a-zA-Z]/.test(prevChar);
            const isNextValid = !/[a-zA-Z]/.test(nextChar);

            if (isPrevValid && isNextValid) {
                ranges.push(new vscode.Range(document.positionAt(startOffset + i), document.positionAt(startOffset + i + symbol.length)));
            }
        }

        i++;
    }

    return ranges;
}


/**
 * Finds all math ranges in the document or within a specific selection.
 */
function findMathRanges(document: vscode.TextDocument, selection: vscode.Range | null): MathRange[] {
    const text = document.getText();
    const ranges: MathRange[] = [];
    const boundaryRegex = /\\begin\{([a-zA-Z]+\*?)\}|\\end\{([a-zA-Z]+\*?)\}|\$\$|\$(?<!\\\$)|\\\[|\\\]/g;

    const stack: { type: string, start: number, envName?: string, openTag: string }[] = [];
    
    let match: RegExpExecArray | null;
    while ((match = boundaryRegex.exec(text)) !== null) {
        const m = match[0];
        const pos = match.index;

        if (m.startsWith('\\begin')) {
            stack.push({ type: 'env', start: pos, envName: match[1], openTag: m });
        } else if (m.startsWith('\\end')) {
            const envName = match[2];
            const lastIdx = stack.map(s => s.envName).lastIndexOf(envName);
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = pos + m.length;
                addRangeIfIntersect(document, last.start, endPos, selection, ranges, last.openTag, m);
            }
        } else if (m === '$$' || m === '\\[' || m === '$') {
            const existingIdx = stack.findIndex(s => s.type === m);
            if (existingIdx !== -1) {
                const last = stack.splice(existingIdx, 1)[0];
                const endPos = pos + m.length;
                addRangeIfIntersect(document, last.start, endPos, selection, ranges, last.openTag, m);
            } else {
                stack.push({ type: m, start: pos, openTag: m });
            }
        } else if (m === '\\]') {
            const lastIdx = stack.findIndex(s => s.type === '\\[');
            if (lastIdx !== -1) {
                const last = stack.splice(lastIdx, 1)[0];
                const endPos = pos + m.length;
                addRangeIfIntersect(document, last.start, endPos, selection, ranges, last.openTag, m);
            }
        }
    }

    return ranges;
}

function addRangeIfIntersect(
    document: vscode.TextDocument, 
    startOffset: number, 
    endOffset: number, 
    selection: vscode.Range | null, 
    ranges: MathRange[],
    openTag: string,
    closeTag: string
) {
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset);
    const range = new vscode.Range(startPos, endPos);

    if (!selection || selection.intersection(range) !== undefined) {
        ranges.push({
            range,
            content: document.getText(range),
            type: openTag
        });
    }
}

export function refactorInMath(mathText: string, oldSym: string, newSym: string): string {
    let content = mathText;
    let prefix = "";
    let suffix = "";

    if (mathText.startsWith('$$') && mathText.endsWith('$$')) {
        prefix = '$$'; suffix = '$$';
        content = mathText.substring(2, mathText.length - 2);
    } else if (mathText.startsWith('\\[') && mathText.endsWith('\\]')) {
        prefix = '\\['; suffix = '\\]';
        content = mathText.substring(2, mathText.length - 2);
    } else if (mathText.startsWith('$') && mathText.endsWith('$')) {
        prefix = '$'; suffix = '$';
        content = mathText.substring(1, mathText.length - 1);
    } else if (mathText.startsWith('\\begin')) {
        const beginMatch = mathText.match(/^\\begin\{[a-zA-Z]+\*?\}/);
        const endMatch = mathText.match(/\\end\{[a-zA-Z]+\*?\}$/);
        if (beginMatch && endMatch) {
            prefix = beginMatch[0];
            suffix = endMatch[0];
            content = mathText.substring(prefix.length, mathText.length - suffix.length);
        }
    }
    
    return prefix + processContent(content, oldSym, newSym) + suffix;
}

function processContent(content: string, oldSym: string, newSym: string): string {
    let result = "";
    let i = 0;

    const textModeCommands = ['\\text', '\\mathrm', '\\mathbf', '\\mathsf', '\\mathtt', '\\mathit', '\\mbox', '\\cite', '\\ref', '\\label'];

    while (i < content.length) {
        let matchedTextCmd = false;
        for (const cmd of textModeCommands) {
            if (content.startsWith(cmd, i)) {
                let j = i + cmd.length;
                while (j < content.length && /\s/.test(content[j])) {j++;}
                
                if (content[j] === '{') {
                    result += content.substring(i, j + 1);
                    i = j + 1;
                    let depth = 1;
                    while (i < content.length && depth > 0) {
                        if (content[i] === '{') {depth++;}
                        else if (content[i] === '}') {depth--;}
                        result += content[i];
                        i++;
                    }
                    matchedTextCmd = true;
                    break;
                }
            }
        }
        if (matchedTextCmd) {continue;}

        if (content[i] === '\\') {
            if (oldSym.startsWith('\\')) {
                const rest = content.substring(i);
                const commandMatch = rest.match(/^\\[a-zA-Z]+\*?/);
                if (commandMatch && commandMatch[0] === oldSym) {
                    const nextChar = rest[commandMatch[0].length];
                    if (!nextChar || !/[a-zA-Z]/.test(nextChar)) {
                        result += newSym;
                        i += commandMatch[0].length;
                        continue;
                    }
                }
            }
            result += content[i];
            i++;
            while (i < content.length && /[a-zA-Z]/.test(content[i])) {
                result += content[i];
                i++;
            }
            if (i < content.length && content[i] === '*') {
                result += content[i];
                i++;
            }
            continue;
        }

        if (!oldSym.startsWith('\\')) {
            const rest = content.substring(i);
            if (rest.startsWith(oldSym)) {
                const prevChar = i > 0 ? content[i - 1] : '';
                const nextChar = i + oldSym.length < content.length ? content[i + oldSym.length] : '';
                
                const isPrevValid = !/[a-zA-Z]/.test(prevChar);
                const isNextValid = !/[a-zA-Z]/.test(nextChar);

                if (isPrevValid && isNextValid) {
                    result += newSym;
                    i += oldSym.length;
                    continue;
                }
            }
        }

        result += content[i];
        i++;
    }

    return result;
}
