import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

/**
 * [Recent Symbols]
 * Tracks and suggests frequently used LaTeX commands in the current document.
 * Performance optimized: Uses background caching and debounced scanning.
 */

class SymbolFrequencyManager {
    private frequencyCache = new Map<string, Map<string, number>>();
    private scanTimers = new Map<string, NodeJS.Timeout>();
    private excludeList = ['\\begin', '\\end', '\\label', '\\cite', '\\ref', '\\section', '\\subsection'];
    private cmdRegex = /\\[a-zA-Z]+/g;

    constructor() {
        // Initial scan for all open LaTeX documents
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'latex') {
                this.scanDocument(doc);
            }
        });
    }

    public getFrequencies(uri: string): Map<string, number> | undefined {
        return this.frequencyCache.get(uri);
    }

    public requestScan(document: vscode.TextDocument) {
        if (document.languageId !== 'latex') { return; }
        
        const uri = document.uri.toString();
        if (this.scanTimers.has(uri)) {
            clearTimeout(this.scanTimers.get(uri)!);
        }

        // Debounce scan to 500ms to avoid excessive overhead during typing
        const timer = setTimeout(() => {
            this.scanDocument(document);
            this.scanTimers.delete(uri);
        }, 500);

        this.scanTimers.set(uri, timer);
    }

    private scanDocument(document: vscode.TextDocument) {
        const text = document.getText();
        const commandMap = new Map<string, number>();
        
        let match;
        // Reset regex state
        this.cmdRegex.lastIndex = 0;
        
        while ((match = this.cmdRegex.exec(text)) !== null) {
            const cmd = match[0];
            if (this.excludeList.includes(cmd)) { continue; }
            commandMap.set(cmd, (commandMap.get(cmd) || 0) + 1);
        }

        this.frequencyCache.set(document.uri.toString(), commandMap);
    }

    public disposeDocument(uri: string) {
        this.frequencyCache.delete(uri);
        if (this.scanTimers.has(uri)) {
            clearTimeout(this.scanTimers.get(uri)!);
            this.scanTimers.delete(uri);
        }
    }
}

export function registerRecentSymbols(context: vscode.ExtensionContext) {
    const manager = new SymbolFrequencyManager();

    // 1. Listen for document changes to update cache
    const changeListener = vscode.workspace.onDidChangeTextDocument(e => {
        manager.requestScan(e.document);
    });

    const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
        manager.requestScan(doc);
    });

    const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
        manager.disposeDocument(doc.uri.toString());
    });

    // 2. Completion Provider Registration
    const provider = vscode.languages.registerCompletionItemProvider(
        'latex',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                // Only provide suggestions if we are in math mode
                if (!findMathAtPos(document, position)) {
                    return undefined;
                }

                const commandMap = manager.getFrequencies(document.uri.toString());
                if (!commandMap) {
                    return undefined;
                }

                // Sort by frequency and take top 12
                const sortedCommands = Array.from(commandMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12);

                return sortedCommands.map(([cmd, count], index) => {
                    const item = new vscode.CompletionItem(cmd, vscode.CompletionItemKind.Value);
                    item.detail = `최근 사용 (${count}회)`;
                    item.sortText = `000${index.toString().padStart(3, '0')}`; // Ensure they appear at the top
                    item.insertText = cmd.startsWith('\\') ? cmd.substring(1) : cmd; 
                    
                    item.filterText = cmd; 
                    
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

    context.subscriptions.push(
        provider, 
        triggerCommand, 
        changeListener, 
        openListener, 
        closeListener
    );
}
