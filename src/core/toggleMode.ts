import * as vscode from 'vscode';

export interface ToggleFeature {
    name: string;
    onTextChange?: (event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor) => Promise<void> | void;
    onActivate?: () => Promise<void> | void;
    onDeactivate?: () => Promise<void> | void;
}

const registeredFeatures: ToggleFeature[] = [];

export function registerToggleFeature(feature: ToggleFeature) {
    registeredFeatures.push(feature);
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
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            // Only run inside LaTeX files
            if (editor.document.languageId !== 'latex') {
                return;
            }

            // Execute all active registered toggle features
            for (const feature of registeredFeatures) {
                if (!feature.onTextChange) {
                    continue;
                }

                // A feature runs if it's globally enabled OR if it's active in the current toggle profile
                const config = vscode.workspace.getConfiguration('tex-machina');
                const isGloballyEnabled = config.get(`${feature.name}.enabled`, false);

                if (isGloballyEnabled || isFeatureActive(feature.name)) {
                    try {
                        await feature.onTextChange(event, editor);
                    } catch (e) {
                        console.error(`Error in toggle feature ${feature.name}:`, e);
                    }
                }
            }
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
