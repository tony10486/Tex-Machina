import * as vscode from 'vscode';
import { registerToggleFeature, isFeatureActive } from './toggleMode';
import { findMathAtPos } from './latexParser';

let isMathNavActive = false;
let isSelectContentEnabled = true;
let jumpSymbols: string[] = ["\\\\", "&", "=", "+", "-", "*", "/", "<", ">", ",", ";", ":"];
let selectBrackets: string[] = ["{}", "[]", "()"];
let skipCommands: string[] = ["\\frac", "\\sqrt", "\\int", "\\sum", "\\prod", "\\lim", "\\vec", "\\bar", "\\hat", "\\tilde", "\\dot", "\\ddot", "\\sin", "\\cos", "\\tan", "\\log", "\\ln"];
let boundaryBehavior: 'before' | 'after' | 'both' = 'both';

/**
 * Formula Node Navigation:
 * Toggles a mode where Alt+Arrow keys jump between mathematical nodes (hierarchy)
 * instead of words.
 */
export function registerNodeNavigation(context: vscode.ExtensionContext) {
    const updateLocalConfig = () => {
        const config = vscode.workspace.getConfiguration('tex-machina');
        
        // A feature is active if it's globally enabled OR if it's active in the current toggle profile
        const isEnabledGlobal = config.get<boolean>('mathNav.enabled', false);
        isMathNavActive = isEnabledGlobal || isFeatureActive('mathNav');

        isSelectContentEnabled = config.get<boolean>('mathNav.selectContent.enabled', true);
        jumpSymbols = config.get<string[]>('mathNav.jumpSymbols', ["\\\\", "&", "=", "+", "-", "*", "/", "<", ">", ",", ";", ":"]);
        selectBrackets = config.get<string[]>('mathNav.selectBrackets', ["{}", "[]", "()"]);
        skipCommands = config.get<string[]>('mathNav.skipCommands', ["\\frac", "\\sqrt", "\\int", "\\sum", "\\prod", "\\lim", "\\vec", "\\bar", "\\hat", "\\tilde", "\\dot", "\\ddot", "\\sin", "\\cos", "\\tan", "\\log", "\\ln"]);
        boundaryBehavior = config.get<'before' | 'after' | 'both'>('mathNav.boundaryBehavior', 'both');
        vscode.commands.executeCommand('setContext', 'tex-machina.mathNavActive', isMathNavActive);
    };

    updateLocalConfig();

    // Register as a toggle feature to listen for activation/deactivation events
    registerToggleFeature({
        name: 'mathNav',
        onActivate: () => {
            updateLocalConfig();
        },
        onDeactivate: () => {
            updateLocalConfig();
        }
    });

    // Toggle Command: cmd+shift+' l
    let toggleCommand = vscode.commands.registerCommand('tex-machina.toggleMathNav', () => {
        isMathNavActive = !isMathNavActive;
        console.log(`[MathNav] Toggled: ${isMathNavActive}`);
        vscode.commands.executeCommand('setContext', 'tex-machina.mathNavActive', isMathNavActive);
        
        // Update configuration to persist the change
        vscode.workspace.getConfiguration('tex-machina').update('mathNav.enabled', isMathNavActive, vscode.ConfigurationTarget.Global);

        if (isMathNavActive) {
            vscode.window.showInformationMessage("Math Navigation Mode: ON");
        } else {
            vscode.window.showInformationMessage("Math Navigation Mode: OFF");
        }
    });

    // Navigation Commands
    let navRight = vscode.commands.registerCommand('tex-machina.mathNavRight', () => {
        navigate('right');
    });

    let navLeft = vscode.commands.registerCommand('tex-machina.mathNavLeft', () => {
        navigate('left');
    });

    context.subscriptions.push(toggleCommand, navRight, navLeft);

    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('tex-machina.mathNav')) {
            updateLocalConfig();
        }
    }));
}

function navigate(direction: 'left' | 'right') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    if (!isMathNavActive) {
        if (direction === 'right') {
            vscode.commands.executeCommand('cursorWordEndRight');
        } else {
            vscode.commands.executeCommand('cursorWordStartLeft');
        }
        return;
    }

    const document = editor.document;
    const pos = editor.selection.active;

    const mathBlock = findMathAtPos(document, pos);
    if (!mathBlock) {
        // Fallback to word navigation if not in a math block
        if (direction === 'right') {
            vscode.commands.executeCommand('cursorWordEndRight');
        } else {
            vscode.commands.executeCommand('cursorWordStartLeft');
        }
        return;
    }

    const relativeOffset = document.offsetAt(pos) - document.offsetAt(mathBlock.range.start);
    const points = getJumpPoints(mathBlock.text);

    let targetOffset: number | undefined;
    if (direction === 'right') {
        targetOffset = points.find(p => p > relativeOffset);
        if (targetOffset === undefined) {
            // Already at the end or beyond points, move out of math block
            vscode.commands.executeCommand('cursorWordEndRight');
            return;
        }
    } else {
        targetOffset = [...points].reverse().find(p => p < relativeOffset);
        if (targetOffset === undefined) {
            // Already at the start, move out of math block
            vscode.commands.executeCommand('cursorWordStartLeft');
            return;
        }
    }

    const targetPos = document.positionAt(document.offsetAt(mathBlock.range.start) + targetOffset);
    
    // Check if we should select content (if it's after an opening brace)
    let selection: vscode.Selection | undefined;
    if (isSelectContentEnabled) {
        const charBefore = targetOffset > 0 ? mathBlock.text[targetOffset - 1] : '';
        const openingBrackets = selectBrackets.map(b => b[0]);
        const bracketIdx = openingBrackets.indexOf(charBefore);
        
        if (bracketIdx !== -1) {
            const pair = selectBrackets[bracketIdx];
            const open = pair[0];
            const close = pair[1];
            const endOffset = findMatchingBracket(mathBlock.text, targetOffset - 1, open, close);
            if (endOffset !== -1 && endOffset > targetOffset) {
                const endPos = document.positionAt(document.offsetAt(mathBlock.range.start) + endOffset);
                selection = new vscode.Selection(targetPos, endPos);
            }
        }
    }

    if (selection) {
        if (direction === 'left') {
            editor.selection = new vscode.Selection(selection.active, selection.anchor);
        } else {
            editor.selection = selection;
        }
    } else {
        editor.selection = new vscode.Selection(targetPos, targetPos);
    }
    editor.revealRange(new vscode.Range(targetPos, targetPos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Finds the matching closing bracket for an opening bracket at the given index.
 */
function findMatchingBracket(text: string, startIdx: number, open: string, close: string): number {
    let depth = 1;
    for (let i = startIdx + 1; i < text.length; i++) {
        if (text[i] === open) {
            depth++;
        } else if (text[i] === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Generates a list of "jump points"
 based on mathematical hierarchy.
 * Focuses on semantic "slots" (inside braces, after script markers, etc.)
 */
export function getJumpPoints(text: string): number[] {
    const points: Set<number> = new Set();
    
    // 1. Math block content boundaries (skip the delimiters like $ or $$)
    if (text.startsWith('$$')) { points.add(2); points.add(text.length - 2); }
    else if (text.startsWith('$')) { points.add(1); points.add(text.length - 1); }
    else if (text.startsWith('\\[')) { points.add(2); points.add(text.length - 2); }

    // 2. Identify structural elements and semantic slots
    // Separate multi-character and single-character symbols for correct regex construction
    const openingBrackets = selectBrackets.map(b => b[0]);
    const multiCharSymbols = jumpSymbols.filter(s => s.length > 1).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const singleCharSymbols = jumpSymbols.filter(s => s.length === 1);
    const brackets = [...new Set([...openingBrackets, ...selectBrackets.map(b => b[1])])];
    
    // Combine all single characters into a character class
    const charClassContent = [...new Set([...singleCharSymbols, ...brackets, '^', '_', '&'])]
        .map(s => s.replace(/[\]\-\\]/g, '\\$&')) // Escape special characters in character class
        .join('');
    
    const pattern = `\\\\\\\\|\\\\\\{|\\\\\\}|\\\\\\[|\\\\\\]|\\\\(?:[a-zA-Z]+)${multiCharSymbols ? '|' + multiCharSymbols : ''}|[${charClassContent}]`;
    const regex = new RegExp(pattern, 'g');
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        const m = match[0];
        const pos = match.index;

        if (openingBrackets.includes(m)) {
            // Slot: Inside the opening bracket
            points.add(pos + 1);
        } else if (m === '^' || m === '_') {
            // If the script is followed by a bracket, let the bracket handle the jump point (inside the slot)
            let nextChar = pos + 1 < text.length ? text[pos + 1] : '';
            if (openingBrackets.includes(nextChar)) {
                // Skip adding a point before the bracket
            } else {
                // Slot: Right after the script marker
                points.add(pos + 1);
                if (pos + 1 < text.length && !/\s/.test(nextChar)) {
                    points.add(pos + 2);
                }
            }
        } else if (jumpSymbols.includes(m)) {
            // Alignment markers and major operators act as node boundaries
            if (boundaryBehavior === 'before' || boundaryBehavior === 'both') {
                points.add(pos);
            }
            if (boundaryBehavior === 'after' || boundaryBehavior === 'both') {
                let endPos = pos + m.length;
                while (endPos < text.length && /\s/.test(text[endPos])) {
                    endPos++;
                }
                points.add(endPos);
            }
        } else if (m.startsWith('\\')) {
            // For major commands, we usually want to jump straight to their arguments.
            if (!skipCommands.some(p => m.startsWith(p))) {
                points.add(pos);
            }
            // Escape sequences like \{ should be treated as atoms
            if (m === '\\{' || m === '\\}' || m === '\\[' || m === '\\]') {
                points.add(pos + m.length);
            }
        }
    }

    // Always include the start and end of the string
    points.add(0);
    points.add(text.length);

    // Sort and return unique points
    return Array.from(points).filter(p => p >= 0 && p <= text.length).sort((a, b) => a - b);
}
