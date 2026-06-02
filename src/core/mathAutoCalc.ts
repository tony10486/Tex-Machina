import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';
import { registerToggleFeature } from './toggleMode';
import { PythonService } from '../services/pythonService';
import {
    detectOperation,
    isInOpenMathEnv,
    extractExprFromLine,
    extractExprFromDocument
} from './mathCalcUtils';

export function registerMathAutoCalc(context: vscode.ExtensionContext, pythonService: PythonService) {
    registerToggleFeature({
        name: 'mathAutoCalc',
        triggerChars: ['.'],
        onTextChange: async (event, editor) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const enabled = config.get<boolean>('mathAutoCalc.enabled', true);
            if (!enabled) { return; }

            for (const change of event.contentChanges) {
                if (change.text.length === 0 || change.text.length > 3) { continue; }

                const pos = change.range.start.translate(0, change.text.length);
                const line = editor.document.lineAt(pos.line).text;
                const textBefore = line.substring(0, pos.character);

                if (!textBefore.endsWith('=..')) { continue; }

                const inMath = findMathAtPos(editor.document, pos.translate(0, -1)) ||
                    isInOpenMathEnv(editor.document, pos);
                if (!inMath) { continue; }

                const expr = extractExprFromLine(line, pos.character, 3) ||
                    extractExprFromDocument(editor.document, pos, 3);
                if (!expr) { continue; }

                const op = detectOperation(expr);

                const payload = {
                    mainCommand: op.mainCommand,
                    subCommands: op.subCommands,
                    rawSelection: expr,
                    config: {}
                };

                try {
                    const response = await pythonService.sendAndWait(payload);
                    if (response.status === 'success' && response.latex) {
                        const rangeToReplace = new vscode.Range(
                            pos.translate(0, -3),
                            pos
                        );

                        await editor.edit(editBuilder => {
                            editBuilder.replace(rangeToReplace, ' = ' + response.latex);
                        }, { undoStopBefore: false, undoStopAfter: false });
                    }
                } catch {
                    // Silently fail — leave =.. as-is
                }
            }
        }
    });
}
