import * as vscode from 'vscode';

const POLL_INTERVAL = 10;
const INIT_DELAY = 30;

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function openDoc(content: string, language = 'latex'): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor }> {
    const document = await vscode.workspace.openTextDocument({ language, content });
    const editor = await vscode.window.showTextDocument(document);
    await sleep(INIT_DELAY);
    return { document, editor };
}

export async function closeEditor(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

export async function waitForLine(document: vscode.TextDocument, line: number, expected: string, timeout = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (document.lineAt(line).text === expected) { return true; }
        await sleep(POLL_INTERVAL);
    }
    return document.lineAt(line).text === expected;
}

export async function waitForIncludes(document: vscode.TextDocument, substring: string, timeout = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (document.getText().includes(substring)) { return true; }
        await sleep(POLL_INTERVAL);
    }
    return document.getText().includes(substring);
}

export async function waitForNotIncludes(document: vscode.TextDocument, substring: string, timeout = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (!document.getText().includes(substring)) { return true; }
        await sleep(POLL_INTERVAL);
    }
    return !document.getText().includes(substring);
}

export async function waitForCondition(fn: () => boolean, timeout = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) { return true; }
        await sleep(POLL_INTERVAL);
    }
    return fn();
}

export async function waitForExtension(timeout = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const commands = await vscode.commands.getCommands(true);
        if (commands.includes('tex-machina.smartBackspace')) {
            return;
        }
        await sleep(100);
    }
    throw new Error('Extension activation timed out: tex-machina.smartBackspace command not found');
}

export async function insertAt(editor: vscode.TextEditor, line: number, char: number, text: string): Promise<void> {
    await editor.edit(eb => eb.insert(new vscode.Position(line, char), text));
}
