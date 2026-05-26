import * as vscode from 'vscode';
import { registerToggleFeature } from './toggleMode';

export function registerEllipsis(context: vscode.ExtensionContext) {
    registerToggleFeature({
        name: 'ellipsis',
        onTextChange: async (event, editor) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            
            for (const change of event.contentChanges) {
                // Check if the inserted text is exactly a dot
                if (change.text !== '.') {
                    continue;
                }

                const position = change.range.start;
                const document = editor.document;

                // We need at least two more characters before this one
                if (position.character < 2) {
                    continue;
                }

                const line = position.line;
                if (line >= document.lineCount) continue;
                
                const lineText = document.lineAt(line).text;
                const charOffset = position.character;
                
                // Check if the previous two characters are also dots
                if (lineText[charOffset - 1] === '.' && lineText[charOffset - 2] === '.') {
                    const macro = config.get<string>('ellipsis.macro', '\\dots');
                    
                    // The third dot has already been inserted at 'position'
                    // So we replace the range from charOffset-2 to charOffset+1
                    const rangeToReplace = new vscode.Range(
                        new vscode.Position(line, charOffset - 2),
                        new vscode.Position(line, charOffset + 1)
                    );

                    await editor.edit(editBuilder => {
                        editBuilder.replace(rangeToReplace, macro);
                    }, { undoStopBefore: false, undoStopAfter: false });
                }
            }
        }
    });
}
