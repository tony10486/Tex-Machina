import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';
import { registerToggleFeature } from './toggleMode';

/**
 * [Mathematical Ligatures]
 * Converts common symbol combinations into LaTeX commands in math mode.
 */

const LIGATURES: Record<string, string> = {
    '<=': '\\le ',
    '>=': '\\ge ',
    '!=': '\\neq ',
    '~=': '\\approx ',
    '~~': '\\approx ',
    '~': '\\sim ',
    '<<': '\\ll ',
    '>>': '\\gg ',
    '==': '\\equiv ',
    ':=': '\\coloneqq ',
    '->': '\\to ',
    '=>': '\\implies ',
    '<-': '\\leftarrow ',
    '<->': '\\leftrightarrow ',
    '<=>': '\\iff ',
    '|->': '\\mapsto ',
    '&&': '\\land ',
    '||': '\\lor ',
    '+-': '\\pm ',
};

// Sort keys by length descending to match longest possible pattern first
const SORTED_LIGATURE_KEYS = Object.keys(LIGATURES).sort((a, b) => b.length - a.length);

export function registerMathLigatures(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'mathLigatures',
        onTextChange: async (event, editor) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const enabled = config.get<boolean>('mathLigatures.enabled', true);
            if (!enabled) { return; }

            for (const change of event.contentChanges) {
                // We only care about single character or short string insertions
                if (change.text.length === 0 || change.text.length > 3) { continue; }

                const pos = change.range.start.translate(0, change.text.length);
                const line = editor.document.lineAt(pos.line).text;
                const textBefore = line.substring(0, pos.character);

                // Check each ligature pattern
                for (const key of SORTED_LIGATURE_KEYS) {
                    if (textBefore.endsWith(key)) {
                        // Ensure we are in math mode
                        if (findMathAtPos(editor.document, pos.translate(0, -1))) {
                            const rangeToReplace = new vscode.Range(
                                pos.translate(0, -key.length),
                                pos
                            );
                            const replacement = LIGATURES[key];

                            await editor.edit(editBuilder => {
                                editBuilder.replace(rangeToReplace, replacement);
                            }, { undoStopBefore: false, undoStopAfter: false });
                            
                            break; // Match found and applied
                        }
                    }
                }
            }
        }
    });
}
