import * as vscode from 'vscode';
import { isSubscriptToggleActive } from './toggleMode';
import { findMathAtPos } from './latexParser';

/**
 * [Linked Editing for Environments and Math Variables]
 * 1. Automatically synchronizes the environment name between \begin{env} and \end{env}.
 * 2. Synchronizes mathematical variables within the same math environment when Toggle Mode is active.
 * Implements LinkedEditingRangeProvider API.
 */

export function registerLinkedEditing(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerLinkedEditingRangeProvider(
        'latex',
        {
            async provideLinkedEditingRanges(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
                // Debounce to prevent heavy parsing during rapid cursor movement
                await new Promise(resolve => setTimeout(resolve, 50));
                if (token.isCancellationRequested) return undefined;

                // Check if Environment Linked Editing is enabled
                const config = vscode.workspace.getConfiguration('tex-machina');
                const envEnabled = config.get<boolean>('linkedEditing.enabled', true);

                // 1. Check for Environment Tags (\begin/\end)
                if (envEnabled) {
                    const envRanges = getEnvLinkedRanges(document, position);
                    if (envRanges) return envRanges;
                }

                if (token.isCancellationRequested) return undefined;

                // 2. Check for Mathematical Variables (Only when Toggle Mode is Active)
                if (isSubscriptToggleActive()) {
                    const mathRanges = getMathVariableLinkedRanges(document, position);
                    if (mathRanges) return mathRanges;
                }

                return undefined;
            }
        }
    );

    context.subscriptions.push(provider);
}

function getEnvLinkedRanges(document: vscode.TextDocument, position: vscode.Position): vscode.LinkedEditingRanges | undefined {
    const line = document.lineAt(position.line).text;
    const offset = position.character;

    const beginRegex = /\\begin\{([a-zA-Z]+\*?)\}/g;
    const endRegex = /\\end\{([a-zA-Z]+\*?)\}/g;
    
    let match;
    let foundMatch = null;
    let type: 'begin' | 'end' = 'begin';

    while ((match = beginRegex.exec(line)) !== null) {
        const start = match.index + 7;
        const end = start + match[1].length;
        if (offset >= start && offset <= end) {
            foundMatch = match;
            type = 'begin';
            break;
        }
    }

    if (!foundMatch) {
        while ((match = endRegex.exec(line)) !== null) {
            const start = match.index + 5;
            const end = start + match[1].length;
            if (offset >= start && offset <= end) {
                foundMatch = match;
                type = 'end';
                break;
            }
        }
    }

    if (!foundMatch) return undefined;

    const envName = foundMatch[1];
    const nameRangeInCurrentTag = new vscode.Range(
        new vscode.Position(position.line, foundMatch.index + (type === 'begin' ? 7 : 5)),
        new vscode.Position(position.line, foundMatch.index + (type === 'begin' ? 7 : 5) + envName.length)
    );

    let otherRange: vscode.Range | null = null;
    if (type === 'begin') {
        otherRange = findMatchingEnd(document, nameRangeInCurrentTag.end, envName);
    } else {
        otherRange = findMatchingBegin(document, nameRangeInCurrentTag.start, envName);
    }

    if (!otherRange) return undefined;

    const adjustedOtherRange = new vscode.Range(
        otherRange.start.translate(0, type === 'begin' ? 5 : 7),
        otherRange.end.translate(0, -1)
    );

    return new vscode.LinkedEditingRanges([nameRangeInCurrentTag, adjustedOtherRange]);
}

function findMatchingEnd(document: vscode.TextDocument, startPos: vscode.Position, envName: string): vscode.Range | null {
    let depth = 0;
    const docText = document.getText();
    const offset = document.offsetAt(startPos);
    const remainingText = docText.substring(offset);
    
    const beginPattern = `\\\\begin\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const endPattern = `\\\\end\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const regex = new RegExp(`(${beginPattern})|(${endPattern})`, 'g');
    
    let match;
    while ((match = regex.exec(remainingText)) !== null) {
        if (match[1]) { depth++; } 
        else if (match[2]) {
            if (depth === 0) {
                const matchStart = offset + match.index;
                const matchEnd = matchStart + match[0].length;
                return new vscode.Range(document.positionAt(matchStart), document.positionAt(matchEnd));
            }
            depth--;
        }
    }
    return null;
}

function findMatchingBegin(document: vscode.TextDocument, startPos: vscode.Position, envName: string): vscode.Range | null {
    let depth = 0;
    const docText = document.getText();
    const offset = document.offsetAt(startPos);
    const precedingText = docText.substring(0, offset);
    
    const beginPattern = `\\\\begin\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const endPattern = `\\\\end\\{${envName.replace(/\*/g, '\\*')}\\}`;
    const regex = new RegExp(`(${beginPattern})|(${endPattern})`, 'g');
    
    const matches = [];
    let match;
    while ((match = regex.exec(precedingText)) !== null) {
        matches.push(match);
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m[2]) { depth++; } // Found an \end
        else if (m[1]) { // Found a \begin
            if (depth === 0) {
                const matchStart = m.index;
                const matchEnd = matchStart + m[0].length;
                return new vscode.Range(document.positionAt(matchStart), document.positionAt(matchEnd));
            }
            depth--;
        }
    }
    return null;
}

/**
 * Finds all occurrences of the variable under the cursor within the current math environment.
 */
function getMathVariableLinkedRanges(document: vscode.TextDocument, position: vscode.Position): vscode.LinkedEditingRanges | undefined {
    // 1. Ensure we are in a math environment
    const mathEnv = findMathAtPos(document, position);
    if (!mathEnv) return undefined;

    // 2. Identify the symbol under the cursor
    const wordRange = document.getWordRangeAtPosition(position, /\\[a-zA-Z]+|(?<!\\)[a-zA-Z]/);
    if (!wordRange) return undefined;

    const symbol = document.getText(wordRange);
    
    // 3. Find all semantic occurrences of this symbol within the math environment
    const ranges: vscode.Range[] = [];
    const content = mathEnv.content;
    const startOffset = document.offsetAt(mathEnv.range.start) + mathEnv.prefixLen;
    
    let i = 0;
    const textModeCommands = ['\\text', '\\mathrm', '\\mathbf', '\\mathsf', '\\mathtt', '\\mathit', '\\mbox', '\\cite', '\\ref', '\\label'];

    while (i < content.length) {
        // Skip text mode commands
        let matchedTextCmd = false;
        for (const cmd of textModeCommands) {
            if (content.startsWith(cmd, i)) {
                let j = i + cmd.length;
                while (j < content.length && /\s/.test(content[j])) j++;
                if (content[j] === '{') {
                    i = j + 1;
                    let depth = 1;
                    while (i < content.length && depth > 0) {
                        if (content[i] === '{') depth++;
                        else if (content[i] === '}') depth--;
                        i++;
                    }
                    matchedTextCmd = true;
                    break;
                }
            }
        }
        if (matchedTextCmd) continue;

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

    if (ranges.length <= 1) return undefined;
    return new vscode.LinkedEditingRanges(ranges);
}

