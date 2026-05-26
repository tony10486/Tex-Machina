import * as vscode from 'vscode';

/**
 * [Linked Editing for Environments]
 * Automatically synchronizes the environment name between \begin{env} and \end{env}.
 * Implements LinkedEditingRangeProvider API.
 */

export function registerLinkedEditing(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerLinkedEditingRangeProvider(
        'latex',
        {
            provideLinkedEditingRanges(document: vscode.TextDocument, position: vscode.Position) {
                const config = vscode.workspace.getConfiguration('tex-machina');
                const enabled = config.get<boolean>('linkedEditing.enabled', true);
                if (!enabled) { return undefined; }

                const line = document.lineAt(position.line).text;
                const offset = position.character;

                // 1. Detect if cursor is inside \begin{...} or \end{...}
                const beginRegex = /\\begin\{([a-zA-Z]+\*?)\}/g;
                const endRegex = /\\end\{([a-zA-Z]+\*?)\}/g;
                
                let match;
                let foundMatch = null;
                let type: 'begin' | 'end' = 'begin';

                while ((match = beginRegex.exec(line)) !== null) {
                    const start = match.index + 7; // after "\begin{"
                    const end = start + match[1].length;
                    if (offset >= start && offset <= end) {
                        foundMatch = match;
                        type = 'begin';
                        break;
                    }
                }

                if (!foundMatch) {
                    while ((match = endRegex.exec(line)) !== null) {
                        const start = match.index + 5; // after "\end{"
                        const end = start + match[1].length;
                        if (offset >= start && offset <= end) {
                            foundMatch = match;
                            type = 'end';
                            break;
                        }
                    }
                }

                if (!foundMatch) { return undefined; }

                const envName = foundMatch[1];
                const nameRangeInCurrentTag = new vscode.Range(
                    new vscode.Position(position.line, foundMatch.index + (type === 'begin' ? 7 : 5)),
                    new vscode.Position(position.line, foundMatch.index + (type === 'begin' ? 7 : 5) + envName.length)
                );

                // 2. Find the matching counterpart
                let otherRange: vscode.Range | null = null;
                if (type === 'begin') {
                    otherRange = findMatchingEnd(document, nameRangeInCurrentTag.end, envName);
                } else {
                    otherRange = findMatchingBegin(document, nameRangeInCurrentTag.start, envName);
                }

                if (!otherRange) { return undefined; }

                // Adjust otherRange to only cover the NAME part (inside {})
                const adjustedOtherRange = new vscode.Range(
                    otherRange.start.translate(0, type === 'begin' ? 5 : 7), // if other is \end{, skip 5. if other is \begin{, skip 7.
                    otherRange.end.translate(0, -1) // skip closing }
                );

                return new vscode.LinkedEditingRanges([nameRangeInCurrentTag, adjustedOtherRange]);
            }
        }
    );

    context.subscriptions.push(provider);
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
    
    // Scan backwards is tricky with regex, so we find all and take the last one that matches our logic
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
