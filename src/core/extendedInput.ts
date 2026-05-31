import * as vscode from 'vscode';

const EXTENDED_MAPPINGS: Record<string, string> = {
    'a': '\\alpha',
    'b': '\\beta',
    'g': '\\gamma',
    'd': '\\delta',
    'e': '\\epsilon',
    'z': '\\zeta',
    'h': '\\eta',
    'q': '\\theta',
    'i': '\\in',
    'k': '\\kappa',
    'l': '\\lambda',
    'm': '\\mu',
    'n': '\\nu',
    'x': '\\xi',
    'o': '\\omicron',
    'p': '\\pi',
    'r': '\\rho',
    's': '\\sigma',
    't': '\\tau',
    'u': '\\upsilon',
    'f': '\\phi',
    'c': '\\chi',
    'y': '\\psi',
    'w': '\\omega',

    'A': '\\Alpha',
    'B': '\\Beta',
    'G': '\\Gamma',
    'D': '\\Delta',
    'E': '\\exists',
    'Z': '\\Zeta',
    'H': '\\Eta',
    'Q': '\\Theta',
    'I': '\\infty',
    'K': '\\Kappa',
    'L': '\\Lambda',
    'M': '\\Mu',
    'N': '\\nabla',
    'X': '\\Xi',
    'O': '\\Omicron',
    'P': '\\Pi',
    'R': '\\Rho',
    'S': '\\Sigma',
    'T': '\\Tau',
    'U': '\\Upsilon',
    'F': '\\Phi',
    'C': '\\Chi',
    'Y': '\\Psi',
    'W': '\\Omega',

    '*': '\\times',
    '.': '\\cdot',
    '{': '\\subset',
    '}': '\\supset',
    '0': '\\emptyset',
    '/': '\\setminus',
    '+': '\\cup',
    '-': '\\cap',
    '(': '\\langle',
    ')': '\\rangle',
    '|': '\\vee',
    '&': '\\wedge',
};

const WRAPPING_CHARS = new Set(['^', '~']);
const WRAPPING_MAPPINGS: Record<string, string> = {
    '^': '\\hat{}',
    '~': '\\tilde{}',
};

let isExtendedInputActive = false;
let remainingTime = 0;
let timerId: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let autoCloseDisposable: vscode.Disposable | undefined;

function updateStatusBar() {
    if (statusBarItem) {
        statusBarItem.text = `$(symbol-key) [EI | ${remainingTime}s]`;
    }
}

function isSingleShotMode(): boolean {
    return vscode.workspace.getConfiguration('tex-machina').get<boolean>('extendedInput.singleShot', true);
}

function activateExtendedInput() {
    isExtendedInputActive = true;

    autoCloseDisposable = vscode.languages.setLanguageConfiguration('latex', {
        autoClosingPairs: []
    });

    if (!isSingleShotMode()) {
        const config = vscode.workspace.getConfiguration('tex-machina');
        remainingTime = config.get<number>('toggle.duration', 10);
        updateStatusBar();
        statusBarItem?.show();

        if (timerId) { clearInterval(timerId); }
        timerId = setInterval(() => {
            remainingTime--;
            if (remainingTime <= 0) { deactivateExtendedInput(); }
            else { updateStatusBar(); }
        }, 1000);
    }
}

function deactivateExtendedInput() {
    isExtendedInputActive = false;
    remainingTime = 0;
    if (timerId) { clearInterval(timerId); timerId = undefined; }
    statusBarItem?.hide();
    if (autoCloseDisposable) {
        autoCloseDisposable.dispose();
        autoCloseDisposable = undefined;
    }
}

export function registerExtendedInput(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    statusBarItem.command = 'tex-machina.toggleExtendedInput';
    statusBarItem.tooltip = 'Click to deactivate extended input mode';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.toggleExtendedInput', async () => {
            if (isExtendedInputActive) { deactivateExtendedInput(); }
            else { activateExtendedInput(); }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) { return; }
            if (editor.document.languageId !== 'latex') { return; }
            if (!isExtendedInputActive) { return; }

            let expanded = false;

            for (const change of event.contentChanges) {
                if (change.text.length !== 1) { continue; }
                const char = change.text;
                const pos = change.range.start;

                const nextChar = (() => {
                    const line = editor.document.lineAt(pos.line).text;
                    const nextPos = pos.character + 1;
                    return nextPos < line.length ? line[nextPos] : '';
                })();

                // Suppress auto-closed brackets that aren't mapped
                if (!EXTENDED_MAPPINGS[char] && !WRAPPING_CHARS.has(char) && nextChar) {
                    const closePairs: Record<string, string> = { '[': ']', '(': ')', '{': '}' };
                    if (closePairs[char] === nextChar) {
                        editor.edit(eb => {
                            eb.delete(new vscode.Range(pos.translate(0, 1), pos.translate(0, 2)));
                        }, { undoStopBefore: false, undoStopAfter: false });
                    }
                    continue;
                }

                if (WRAPPING_CHARS.has(char)) {
                    const replacement = WRAPPING_MAPPINGS[char];
                    editor.edit(eb => {
                        eb.replace(new vscode.Range(pos, pos.translate(0, 1)), replacement);
                    }, { undoStopBefore: false, undoStopAfter: false });
                    const newPos = pos.translate(0, replacement.length - 1);
                    editor.selection = new vscode.Selection(newPos, newPos);
                    expanded = true;
                    break;
                }

                const replacement = EXTENDED_MAPPINGS[char];
                if (!replacement) { continue; }

                editor.edit(eb => {
                    eb.replace(new vscode.Range(pos, pos.translate(0, 1)), replacement);
                }, { undoStopBefore: false, undoStopAfter: false });
                expanded = true;
            }

            if (expanded && isSingleShotMode()) {
                deactivateExtendedInput();
            }
        })
    );
}
