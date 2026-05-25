import * as vscode from 'vscode';
import { findMathAtPos } from './mathSplitter';

const MATH_MACROS = [
    // Greek letters
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
    // Operators and functions
    'sum', 'prod', 'int', 'iint', 'iiint', 'oint', 'lim', 'max', 'min', 'inf', 'sup',
    'sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'exp', 'sqrt', 'deg', 'det', 'dim', 'ker', 'arg',
    'nabla', 'partial', 'infty', 'forall', 'exists', 'neg', 'lor', 'land', 'parallel',
    'cdot', 'times', 'div', 'pm', 'mp', 'oplus', 'otimes', 'odot', 'dagger', 'star',
    'approx', 'cong', 'equiv', 'neq', 'le', 'ge', 'll', 'gg', 'prec', 'succ', 'subset', 'supset', 'subseteq', 'supseteq', 'in', 'ni', 'mid',
    'frac', 'binom', 'left', 'right'
];

export function registerMathAutoWrap(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('autoMathWrap.enabled', true);
            if (!isEnabled) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) {
                return;
            }

            if (editor.document.languageId !== 'latex') {
                return;
            }

            for (const change of event.contentChanges) {
                // Trigger on space insertion
                if (change.text !== ' ') {
                    continue;
                }

                const line = change.range.start.line;
                if (line >= editor.document.lineCount) continue;
                const charOffsetAfter = change.range.start.character + 1;
                const lineText = editor.document.lineAt(line).text;
                const textBeforeSpace = lineText.substring(0, charOffsetAfter);

                // Check if we are already in math mode
                if (findMathAtPos(editor.document, change.range.start)) {
                    continue;
                }

                // Match \macro followed by space at the end of textBeforeSpace
                // Pattern: \ followed by alpha characters, then a space
                const macroRegex = /\\([a-zA-Z]+) $/;
                const match = textBeforeSpace.match(macroRegex);

                if (match) {
                    const macroName = match[1];
                    if (MATH_MACROS.includes(macroName)) {
                        const fullMatch = match[0]; // e.g., "\alpha "
                        const startPos = charOffsetAfter - fullMatch.length;
                        
                        await editor.edit(editBuilder => {
                            editBuilder.replace(
                                new vscode.Range(new vscode.Position(line, startPos), new vscode.Position(line, charOffsetAfter)),
                                `$${fullMatch.trim()}$ `
                            );
                        }, { undoStopBefore: false, undoStopAfter: false });
                    }
                }
            }
        })
    );
}
