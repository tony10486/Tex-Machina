import * as vscode from 'vscode';

export interface ToggleFeature {
    name: string;
    triggerChars?: string[];
    onTextChange?: (event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor) => Promise<void> | void;
    onSelectionChange?: (event: vscode.TextEditorSelectionChangeEvent, editor: vscode.TextEditor) => Promise<void> | void;
    onActivate?: () => Promise<void> | void;
    onDeactivate?: () => Promise<void> | void;
}

const registeredFeatures: ToggleFeature[] = [];

export function registerToggleFeature(feature: ToggleFeature) {
    registeredFeatures.push(feature);
}

export function unregisterToggleFeature(featureName: string) {
    const idx = registeredFeatures.findIndex(f => f.name === featureName);
    if (idx !== -1) {
        registeredFeatures.splice(idx, 1);
    }
}


let isToggleActive = false;
let activeProfile: string | null = null; // "unconditional" or a number string like "1", "2"
let remainingTime = 0;
let timerId: NodeJS.Timeout | undefined = undefined;
let statusBarItem: vscode.StatusBarItem | undefined = undefined;
let originalColorCustomizations: any = undefined;

/**
 * Checks if a feature should be active.
 * A feature is active if:
 * 1. It is globally enabled in settings (NOT checked here, checked in the feature itself)
 * 2. OR Toggle Mode is active AND:
 *    a. Profile is 'unconditional'
 *    b. The current profile number is in the feature's 'toggleProfiles' setting.
 */
export function isFeatureActive(featureName: string): boolean {
    if (!isToggleActive) {
        return false;
    }
    if (activeProfile === 'unconditional') {
        return true;
    }
    if (activeProfile) {
        const config = vscode.workspace.getConfiguration('tex-machina');
        const profiles = config.get<any[]>('toggle.profiles', []);
        const profileNum = parseInt(activeProfile);
        const profileData = profiles.find(p => p.profile === profileNum);
        
        if (profileData && Array.isArray(profileData.features)) {
            return profileData.features.includes(featureName);
        }
    }
    return false;
}

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
                await activateToggleMode('unconditional');
            }
        })
    );

    const profiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    for (const profile of profiles) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`tex-machina.toggleSubscriptModeProfile${profile}`, async () => {
                if (isToggleActive) {
                    await deactivateToggleMode();
                } else {
                    await activateToggleMode(`${profile}`);
                }
            })
        );
    }

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

    // 3. Listen to text changes and delegate to registered features
    let textChangeTimeout: NodeJS.Timeout | undefined;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            if (editor.document.languageId !== 'latex') {
                return;
            }

            if (textChangeTimeout) {
                clearTimeout(textChangeTimeout);
            }

            textChangeTimeout = setTimeout(async () => {
                const config = vscode.workspace.getConfiguration('tex-machina');

                for (const feature of registeredFeatures) {
                    if (!feature.onTextChange) {
                        continue;
                    }

                    const isGloballyEnabled = config.get(`${feature.name}.enabled`, false);
                    if (!isGloballyEnabled && !isFeatureActive(feature.name)) {
                        continue;
                    }

                    if (feature.triggerChars) {
                        const hasTrigger = event.contentChanges.some(change =>
                            change.text.length > 0 &&
                            feature.triggerChars!.some(ch => change.text.includes(ch))
                        );
                        if (!hasTrigger) {
                            continue;
                        }
                    }

                    try {
                        await feature.onTextChange(event, editor);
                    } catch (e) {
                        console.error(`Error in toggle feature ${feature.name}:`, e);
                    }
                }
            }, 50);
        })
    );

    // 4. Listen to selection changes and delegate to registered features
    let selectionChangeTimeout: NodeJS.Timeout | undefined;
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((event) => {
            const editor = event.textEditor;
            if (editor.document.languageId !== 'latex') {
                return;
            }

            if (selectionChangeTimeout) {
                clearTimeout(selectionChangeTimeout);
            }

            selectionChangeTimeout = setTimeout(async () => {
                for (const feature of registeredFeatures) {
                    if (!feature.onSelectionChange) {
                        continue;
                    }

                    const config = vscode.workspace.getConfiguration('tex-machina');
                    const isGloballyEnabled = config.get(`${feature.name}.enabled`, false);

                    if (isGloballyEnabled || isFeatureActive(feature.name)) {
                        try {
                            await feature.onSelectionChange(event, editor);
                        } catch (e) {
                            console.error(`Error in toggle feature ${feature.name}:`, e);
                        }
                    }
                }
            }, 50);
        })
    );
}

async function activateToggleMode(profile: string) {
    isToggleActive = true;
    activeProfile = profile;

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

    // Notify all active features of activation
    for (const feature of registeredFeatures) {
        if (feature.onActivate && isFeatureActive(feature.name)) {
            try {
                await feature.onActivate();
            } catch (e) {
                console.error(`Error on activation of feature ${feature.name}:`, e);
            }
        }
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
    activeProfile = null;
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

    // Notify all features of deactivation
    for (const feature of registeredFeatures) {
        if (feature.onDeactivate) {
            try {
                await feature.onDeactivate();
            } catch (e) {
                console.error(`Error on deactivation of feature ${feature.name}:`, e);
            }
        }
    }
}

function updateStatusBar() {
    if (statusBarItem) {
        const profileDisplay = activeProfile === 'unconditional' ? 'ALL' : `#${activeProfile}`;
        statusBarItem.text = `$(clock) [${profileDisplay} | ${remainingTime}s]`;
    }
}

async function setStatusBarColorGreen() {
    try {
        if (statusBarItem) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    } catch (e) {
        console.error('Failed to set status bar background color', e);
    }
}

async function restoreStatusBarColor() {
    try {
        if (statusBarItem) {
            statusBarItem.backgroundColor = undefined;
        }
    } catch (e) {
        console.error('Failed to restore status bar background color', e);
    }
}
