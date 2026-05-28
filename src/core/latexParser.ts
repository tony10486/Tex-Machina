import * as vscode from 'vscode';

export interface MathEnvironment {
    range: vscode.Range;
    text: string;
    type: 'inline' | 'display' | 'equation';
    content: string;
}

/**
 * Finds the math environment ($...$, $$...$$, \[...\], \begin{equation}...\end{equation}, etc.) at the given position.
 */
export function findMathAtPos(document: vscode.TextDocument, pos: vscode.Position): MathEnvironment | null {
    const offset = document.offsetAt(pos);
    const lineCount = document.lineCount;
    
    // Scan up to 100 lines above and below to find the environment
    const startLine = Math.max(0, pos.line - 100);
    const endLine = Math.min(lineCount - 1, pos.line + 100);
    
    const rangeToSearch = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    const text = document.getText(rangeToSearch);
    const searchStartOffset = document.offsetAt(rangeToSearch.start);

    // Math environment regex
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|flalign|alignat)\*?\}[\s\S]*?\\end\{\2\*?\})/g;
    let match;
    while ((match = mathRegex.exec(text)) !== null) {
        const start = searchStartOffset + match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
            const matchedText = match[0];
            let type: 'inline' | 'display' | 'equation' = 'inline';
            let content = '';

            if (matchedText.startsWith('$$')) {
                type = 'display';
                content = matchedText.substring(2, matchedText.length - 2);
            } else if (matchedText.startsWith('\\[')) {
                type = 'display';
                content = matchedText.substring(2, matchedText.length - 2);
            } else if (matchedText.startsWith('$')) {
                type = 'inline';
                content = matchedText.substring(1, matchedText.length - 1);
            } else if (matchedText.startsWith('\\begin{equation')) {
                type = 'equation';
                const innerMatch = matchedText.match(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/);
                content = innerMatch ? innerMatch[1] : '';
            } else {
                // Other environments like align, gather etc.
                type = 'equation';
                const envName = match[2];
                const innerMatch = matchedText.match(new RegExp(`\\\\begin\\{${envName}\\*?\\}([\\s\\S]*?)\\\\end\\{${envName}\\*?\\}`));
                content = innerMatch ? innerMatch[1] : '';
            }

            return {
                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                text: matchedText,
                type: type,
                content: content.trim()
            };
        }
    }
    return null;
}

/**
 * Finds a LaTeX command starting at the given position on the same line.
 * Optimized to only look at the current line.
 */
export function findCommandAtCursor(document: vscode.TextDocument, pos: vscode.Position): { range: vscode.Range, text: string } | null {
    const lineText = document.lineAt(pos.line).text;
    const restOfLine = lineText.substring(pos.character);

    // Match \command followed by optional arguments like [], {}, _{}, ^{}
    // Supports spaces between command and arguments
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
    // Extract everything after the command name (\cmd or \cmd*)
    const argsMatch = commandText.match(/^\\[a-zA-Z]+\*?\s*([\s\S]*)$/);
    if (!argsMatch || !argsMatch[1]) return false; // Symbols like \alpha are not "structures" to be smart-deleted

    const argsPart = argsMatch[1];
    
    // Check if there's any non-whitespace character that is NOT a delimiter ({ } [ ] _ ^)
    // If it only contains delimiters and whitespace, it's considered empty.
    const contentRegex = /[^{}[\]_^\s]/;
    return !contentRegex.test(argsPart);
}
