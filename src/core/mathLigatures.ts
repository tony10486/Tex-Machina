import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';
import { registerToggleFeature } from './toggleMode';

interface PatternEntry {
    trigger: string;
    replacement: string;
    regex: RegExp;
}

function buildPatternRegex(trigger: string): RegExp {
    const parts = trigger.split(/\{\}/);
    const escapedParts = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = escapedParts.join('(.+?)');
    return new RegExp(pattern + '$');
}

export function registerMathLigatures(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'mathLigatures',
        onTextChange: async (event, editor) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const enabled = config.get<boolean>('mathLigatures.enabled', true);
            if (!enabled) { return; }

            const rawMappings = config.get<Record<string, string>>('mathLigatures.mappings', {});

            const simple: Record<string, string> = {};
            const patterns: PatternEntry[] = [];

            for (const [trigger, replacement] of Object.entries(rawMappings)) {
                if (trigger.includes('{}')) {
                    patterns.push({ trigger, replacement, regex: buildPatternRegex(trigger) });
                } else {
                    simple[trigger] = replacement;
                }
            }
            patterns.sort((a, b) => b.trigger.length - a.trigger.length);

            const sortedSimpleKeys = Object.keys(simple).sort((a, b) => b.length - a.length);

            for (const change of event.contentChanges) {
                if (change.text.length === 0 || change.text.length > 3) { continue; }

                const pos = change.range.start.translate(0, change.text.length);
                const line = editor.document.lineAt(pos.line).text;
                const textBefore = line.substring(0, pos.character);

                let patternApplied = false;

                if (change.text === ' ' && patterns.length > 0) {
                    const textBeforeSpace = line.substring(0, pos.character - 1);

                    for (const entry of patterns) {
                        const match = textBeforeSpace.match(entry.regex);
                        if (match && findMathAtPos(editor.document, pos.translate(0, -1))) {
                            const matchedText = match[0];
                            const rangeToReplace = new vscode.Range(
                                pos.translate(0, -matchedText.length - 1),
                                pos
                            );

                            let result = entry.replacement;
                            for (let i = 1; i < match.length; i++) {
                                result = result.replaceAll('$' + i, match[i]);
                            }

                            await editor.edit(editBuilder => {
                                editBuilder.replace(rangeToReplace, result + ' ');
                            }, { undoStopBefore: false, undoStopAfter: false });

                            patternApplied = true;
                            break;
                        }
                    }
                }

                if (patternApplied) { continue; }

                for (const key of sortedSimpleKeys) {
                    if (textBefore.endsWith(key)) {
                        if (findMathAtPos(editor.document, pos.translate(0, -1))) {
                            const rangeToReplace = new vscode.Range(
                                pos.translate(0, -key.length),
                                pos
                            );

                            await editor.edit(editBuilder => {
                                editBuilder.replace(rangeToReplace, simple[key]);
                            }, { undoStopBefore: false, undoStopAfter: false });

                            break;
                        }
                    }
                }
            }
        }
    });
}
