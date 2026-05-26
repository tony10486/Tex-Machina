import * as vscode from 'vscode';

let isToggleActive = false;
let remainingTime = 0;
let timerId: NodeJS.Timeout | undefined = undefined;
let statusBarItem: vscode.StatusBarItem | undefined = undefined;
let originalColorCustomizations: any = undefined;

// Export active state so other features can check it if needed
export function isSubscriptToggleActive(): boolean {
    return isToggleActive;
}

export function registerToggleMode(context: vscode.ExtensionContext) {
    // 1. Create the Status Bar Item (reusable)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'tex-machina.toggleSubscriptMode'; // Allow clicking it to turn off
    statusBarItem.tooltip = 'Click to deactivate LaTeX subscript toggle mode';
    context.subscriptions.push(statusBarItem);

    // 2. Register the Toggle Command
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.toggleSubscriptMode', async () => {
            if (isToggleActive) {
                await deactivateToggleMode();
            } else {
                await activateToggleMode();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.isSubscriptToggleActive', () => {
            return isToggleActive;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.deactivateSubscriptToggle', async () => {
            await deactivateToggleMode();
        })
    );

    // 3. Listen to text changes for implicit subscripts (Optimized: exits instantly if inactive)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            // Highly optimized fast-path check
            if (!isToggleActive) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            // Only run inside LaTeX files
            if (editor.document.languageId !== 'latex') {
                return;
            }

            // Apply conversions for typed digits
            for (const change of event.contentChanges) {
                // Only trigger on typing a single digit to prevent lag on pasting or multi-character insertion
                if (!/^\d$/.test(change.text)) {
                    continue;
                }

                const line = change.range.start.line;
                if (line >= editor.document.lineCount) {
                    continue;
                }

                const lineText = editor.document.lineAt(line).text;
                // Index after the newly typed digit is inserted
                const charOffsetAfter = change.range.start.character + 1;
                if (charOffsetAfter <= 1) {
                    continue;
                }

                const textBefore = lineText.substring(0, charOffsetAfter);

                // Define transformation patterns (ordered from most specific to least specific)
                const rule3 = /([a-zA-Z]|\\[a-zA-Z]+)_\{(\d+)\}(\d)$/; // x_{12}3 -> x_{123}
                const rule2 = /([a-zA-Z]|\\[a-zA-Z]+)_(\d)(\d)$/;     // x_12 -> x_{12}
                const rule1 = /([a-zA-Z]|\\[a-zA-Z]+)(\d)$/;          // x1 -> x_1

                let match = rule3.exec(textBefore);
                let replacement = '';
                
                if (match) {
                    const variable = match[1];
                    const existingDigits = match[2];
                    const typedDigit = match[3];
                    replacement = `${variable}_{${existingDigits}${typedDigit}}`;
                } else {
                    match = rule2.exec(textBefore);
                    if (match) {
                        const variable = match[1];
                        const existingDigit = match[2];
                        const typedDigit = match[3];
                        replacement = `${variable}_{${existingDigit}${typedDigit}}`;
                    } else {
                        match = rule1.exec(textBefore);
                        if (match) {
                            const variable = match[1];
                            const typedDigit = match[2];
                            replacement = `${variable}_${typedDigit}`;
                        }
                    }
                }

                // If any rule matched, perform the replacement edit in the editor
                if (match && replacement) {
                    const matchLen = match[0].length;
                    const startChar = charOffsetAfter - matchLen;
                    const rangeToReplace = new vscode.Range(
                        new vscode.Position(line, startChar),
                        new vscode.Position(line, charOffsetAfter)
                    );

                    // Apply the edit asynchronously (without blocking typing)
                    await editor.edit(editBuilder => {
                        editBuilder.replace(rangeToReplace, replacement);
                    });
                }
            }
        })
    );
}

async function activateToggleMode() {
    isToggleActive = true;

    // Read configured duration in seconds (default 10)
    const config = vscode.workspace.getConfiguration('tex-machina');
    remainingTime = config.get<number>('toggle.duration', 10);

    // Update Status Bar Item
    updateStatusBar();
    statusBarItem?.show();

    // Optionally change the status bar background to green
    const changeColor = config.get<boolean>('toggle.changeStatusBarColor', true);
    if (changeColor) {
        await setStatusBarColorGreen();
    }

    // Start Timer
    if (timerId) {
        clearInterval(timerId);
    }
    timerId = setInterval(async () => {
        remainingTime--;
        if (remainingTime <= 0) {
            await deactivateToggleMode();
        } else {
            updateStatusBar();
        }
    }, 1000);
}

export async function deactivateToggleMode() {
    isToggleActive = false;
    remainingTime = 0;

    // Clear Timer
    if (timerId) {
        clearInterval(timerId);
        timerId = undefined;
    }

    // Hide Status Bar Item
    statusBarItem?.hide();

    // Revert status bar background color
    await restoreStatusBarColor();
}

function updateStatusBar() {
    if (statusBarItem) {
        statusBarItem.text = `$(clock) [${remainingTime}s]`;
    }
}

async function setStatusBarColorGreen() {
    try {
        const config = vscode.workspace.getConfiguration();
        const currentColorCustomizations = config.get<any>('workbench.colorCustomizations') || {};
        
        if (originalColorCustomizations === undefined) {
            originalColorCustomizations = { ...currentColorCustomizations };
        }
        
        const newColors = {
            ...currentColorCustomizations,
            "statusBar.background": "#2e7d32",
            "statusBar.noFolderBackground": "#2e7d32",
            "statusBar.debuggingBackground": "#2e7d32",
            "statusBar.foreground": "#ffffff"
        };
        
        const target = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        await config.update('workbench.colorCustomizations', newColors, target);
    } catch (e) {
        console.error('Failed to set green status bar background color', e);
    }
}

async function restoreStatusBarColor() {
    try {
        const config = vscode.workspace.getConfiguration();
        const currentColorCustomizations = config.get<any>('workbench.colorCustomizations') || {};
        
        const newColors = { ...currentColorCustomizations };
        delete newColors["statusBar.background"];
        delete newColors["statusBar.noFolderBackground"];
        delete newColors["statusBar.debuggingBackground"];
        delete newColors["statusBar.foreground"];
        
        if (originalColorCustomizations) {
            if (originalColorCustomizations["statusBar.background"] !== undefined) {
                newColors["statusBar.background"] = originalColorCustomizations["statusBar.background"];
            }
            if (originalColorCustomizations["statusBar.noFolderBackground"] !== undefined) {
                newColors["statusBar.noFolderBackground"] = originalColorCustomizations["statusBar.noFolderBackground"];
            }
            if (originalColorCustomizations["statusBar.debuggingBackground"] !== undefined) {
                newColors["statusBar.debuggingBackground"] = originalColorCustomizations["statusBar.debuggingBackground"];
            }
            if (originalColorCustomizations["statusBar.foreground"] !== undefined) {
                newColors["statusBar.foreground"] = originalColorCustomizations["statusBar.foreground"];
            }
        }
        
        const target = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        const valueToUpdate = Object.keys(newColors).length > 0 ? newColors : undefined;
        await config.update('workbench.colorCustomizations', valueToUpdate, target);
        originalColorCustomizations = undefined;
    } catch (e) {
        console.error('Failed to restore status bar background color', e);
    }
}
