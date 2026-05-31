import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

interface ShorthandMapping {
    [abbreviation: string]: string;
}

const DEFAULT_MAPPINGS: ShorthandMapping = {
    "bc": "\\bigcup",
};

let isActive = false;
let shorthandStart: vscode.Position | null = null;
let remainingTime = 0;
let timerId: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

function updateStatusBar() {
    if (statusBarItem) {
        statusBarItem.text = `$(symbol-misc) [SH | ${remainingTime}s]`;
    }
}

function isSingleShotMode(): boolean {
    return vscode.workspace.getConfiguration('tex-machina').get<boolean>('shorthandMode.singleShot', true);
}

function activateShorthandMode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    isActive = true;
    shorthandStart = editor.selection.active;

    if (!isSingleShotMode()) {
        const config = vscode.workspace.getConfiguration('tex-machina');
        remainingTime = config.get<number>('toggle.duration', 10);
        updateStatusBar();
        statusBarItem?.show();

        if (timerId) { clearInterval(timerId); }
        timerId = setInterval(() => {
            remainingTime--;
            if (remainingTime <= 0) { deactivateShorthandMode(); }
            else { updateStatusBar(); }
        }, 1000);
    }
}

function deactivateShorthandMode() {
    isActive = false;
    shorthandStart = null;
    remainingTime = 0;
    if (timerId) { clearInterval(timerId); timerId = undefined; }
    statusBarItem?.hide();
}

function lookupShorthand(abbr: string): string | undefined {
    const config = vscode.workspace.getConfiguration('tex-machina');
    const customMappings = config.get<ShorthandMapping>('shorthandMode.mappings', {});
    if (customMappings[abbr]) return customMappings[abbr];
    if (DEFAULT_MAPPINGS[abbr]) return DEFAULT_MAPPINGS[abbr];
    return undefined;
}

function expandSuffix(text: string, inMath: boolean): string {
    if (text === 'idx' && inMath) {
        return 'i \\in I';
    }
    return text;
}

export function registerShorthandMode(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
    statusBarItem.command = 'tex-machina.toggleShorthandMode';
    statusBarItem.tooltip = 'Click to deactivate shorthand mode';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.toggleShorthandMode', async () => {
            if (isActive) { deactivateShorthandMode(); }
            else { activateShorthandMode(); }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) return;
            if (editor.document.languageId !== 'latex') return;
            if (!isActive || !shorthandStart) return;

            for (const change of event.contentChanges) {
                if (change.text.includes('\n')) {
                    deactivateShorthandMode();
                    return;
                }

                if (change.text !== ' ') continue;

                const cursorPos = change.range.end;
                const bufferRange = new vscode.Range(shorthandStart, cursorPos);
                const bufferText = editor.document.getText(bufferRange).trimEnd();

                if (!bufferText) {
                    deactivateShorthandMode();
                    return;
                }

                const commaIdx = bufferText.indexOf(',');
                let expandedResult: string;

                if (commaIdx === -1) {
                    const mapped = lookupShorthand(bufferText);
                    expandedResult = mapped || bufferText;
                } else {
                    const prefix = bufferText.substring(0, commaIdx);
                    const suffix = bufferText.substring(commaIdx + 1);

                    const mappedPrefix = lookupShorthand(prefix) || prefix;

                    if (suffix) {
                        const inMath = findMathAtPos(editor.document, shorthandStart) !== null;
                        const expandedSuffix = expandSuffix(suffix, inMath);
                        expandedResult = `${mappedPrefix}_{${expandedSuffix}}`;
                    } else {
                        expandedResult = mappedPrefix;
                    }
                }

                const replaceRange = new vscode.Range(shorthandStart, cursorPos);

                editor.edit(editBuilder => {
                    editBuilder.replace(replaceRange, expandedResult + ' ');
                }, { undoStopBefore: false, undoStopAfter: false });

                if (isSingleShotMode()) {
                    deactivateShorthandMode();
                } else {
                    shorthandStart = new vscode.Position(
                        replaceRange.start.line,
                        replaceRange.start.character + expandedResult.length + 1
                    );
                }
                return;
            }
        })
    );
}
