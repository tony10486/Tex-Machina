import * as vscode from 'vscode';
import { findMathAtPos, isInsideComment, isInsideVerbatim } from './latexParser';
import { registerToggleFeature } from './toggleMode';

export function registerIdxExpansion(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'idxExpansion',
        onTextChange: async (event, editor) => {
            for (const change of event.contentChanges) {
                if (change.text.length === 0) continue;

                const pos = change.range.end;
                const lineText = editor.document.lineAt(pos.line).text;
                const textBefore = lineText.substring(0, pos.character);

                if (isInsideComment(editor.document, pos) || isInsideVerbatim(editor.document, pos)) continue;

                const idxMatch = textBefore.match(/idx$/);
                if (!idxMatch) continue;

                const idxStart = pos.character - 3;

                // Don't expand if idx is preceded by backslash (\idx)
                if (idxStart > 0 && textBefore[idxStart - 1] === '\\') continue;

                // Don't expand if idx is inside unclosed braces
                let braceDepth = 0;
                let idxColonColonFound = false;
                for (let i = 0; i < idxStart; i++) {
                    if (textBefore[i] === '{') braceDepth++;
                    else if (textBefore[i] === '}') braceDepth--;
                }
                if (braceDepth > 0) continue;

                const replaceRange = new vscode.Range(new vscode.Position(pos.line, idxStart), pos);

                // Pattern 2 (priority): Two uppercase letters + idx → [G:H]
                const groupIdxMatch = textBefore.match(/([A-Z])([A-Z])idx$/);
                if (groupIdxMatch) {
                    const replacement = `[${groupIdxMatch[1]}:${groupIdxMatch[2]}]`;
                    const groupLen = groupIdxMatch[0].length;
                    const groupStart = pos.character - groupLen;
                    const groupRange = new vscode.Range(new vscode.Position(pos.line, groupStart), pos);
                    await editor.edit(editBuilder => {
                        editBuilder.replace(groupRange, replacement);
                    }, { undoStopBefore: false, undoStopAfter: false });
                    const newPos = new vscode.Position(pos.line, groupStart + replacement.length);
                    editor.selection = new vscode.Selection(newPos, newPos);
                    return;
                }

                // Pattern 1: In math mode, idx → {i \in I}
                if (findMathAtPos(editor.document, pos)) {
                    const replacement = `{i \\in I}`;
                    await editor.edit(editBuilder => {
                        editBuilder.replace(replaceRange, replacement);
                    }, { undoStopBefore: false, undoStopAfter: false });
                    const newPos = new vscode.Position(pos.line, idxStart + replacement.length);
                    editor.selection = new vscode.Selection(newPos, newPos);
                    return;
                }
            }
        }
    });
}
