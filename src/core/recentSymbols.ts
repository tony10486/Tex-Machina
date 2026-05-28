import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

/**
 * [Recent Symbols]
 * Tracks and suggests frequently used LaTeX commands in the current document.
 * Triggered by Alt+Q to show a completion list.
 */

export function registerRecentSymbols(context: vscode.ExtensionContext) {
    // 1. Completion Provider Registration
    const provider = vscode.languages.registerCompletionItemProvider(
        'latex',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                // Only provide suggestions if we are in math mode
                if (!findMathAtPos(document, position)) {
                    return undefined;
                }

                const text = document.getText();
                const commandMap = new Map<string, number>();
                
                // Regex to find LaTeX commands like \alpha, \phi, etc.
                // Exclude common structural commands to focus on symbols
                const excludeList = ['\\begin', '\\end', '\\label', '\\cite', '\\ref', '\\section', '\\subsection'];
                const cmdRegex = /\\[a-zA-Z]+/g;
                let match;
                
                while ((match = cmdRegex.exec(text)) !== null) {
                    const cmd = match[0];
                    if (excludeList.includes(cmd)) { continue; }
                    commandMap.set(cmd, (commandMap.get(cmd) || 0) + 1);
                }

                // Sort by frequency and take top 10
                const sortedCommands = Array.from(commandMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12);

                return sortedCommands.map(([cmd, count], index) => {
                    const item = new vscode.CompletionItem(cmd, vscode.CompletionItemKind.Value);
                    item.detail = `최근 사용 (${count}회)`;
                    item.sortText = `000${index}`; // Ensure they appear at the top
                    item.insertText = cmd.startsWith('\\') ? cmd.substring(1) : cmd; // Handle \ prefixing if needed
                    
                    // Add a filter text so it doesn't disappear if user types
                    item.filterText = cmd; 
                    
                    // Better UX: replace the slash if the user already typed it
                    const line = document.lineAt(position.line).text;
                    const textBefore = line.substring(0, position.character);
                    if (textBefore.endsWith('\\')) {
                        item.range = new vscode.Range(position.translate(0, -1), position);
                    }

                    return item;
                });
            }
        }
    );

    // 2. Command to trigger completion
    const triggerCommand = vscode.commands.registerCommand('tex-machina.triggerRecentSymbols', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        // Automatically insert a backslash if not present to trigger native LaTeX completion logic
        const pos = editor.selection.active;
        const line = editor.document.lineAt(pos.line).text;
        if (pos.character === 0 || line[pos.character - 1] !== '\\') {
            await editor.edit(editBuilder => {
                editBuilder.insert(pos, '\\');
            }, { undoStopBefore: false, undoStopAfter: false });
        }

        // Trigger the completion list
        await vscode.commands.executeCommand('editor.action.triggerSuggest');
    });

    context.subscriptions.push(provider, triggerCommand);
}
