import * as vscode from 'vscode';

export function registerSmartQuotes(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('smartQuotes.enabled', true);
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
                // Check if the inserted text is exactly a double quote
                if (change.text !== '"') {
                    continue;
                }

                const position = change.range.start;
                const document = editor.document;

                if (isInsideVerbatim(document, position)) {
                    continue;
                }

                // Determine if it should be an opening or closing quote
                const line = position.line;
                const charOffset = position.character;
                const lineText = document.lineAt(line).text;
                
                // If it's escaped by a backslash, skip it (e.g., \"o for umlaut)
                if (charOffset > 0 && lineText[charOffset - 1] === '\\') {
                    continue;
                }

                // Heuristic for opening vs closing:
                // If it's at the start of the line or preceded by whitespace/opening delimiters, it's an opening quote.
                let isOpening = false;
                if (charOffset === 0) {
                    isOpening = true;
                } else {
                    const prevChar = lineText[charOffset - 1];
                    if (/\s|[\(\{\[]/.test(prevChar)) {
                        isOpening = true;
                    }
                }

                const replacement = isOpening ? '``' : "''";

                // Replace the double quote with smart quotes
                // The double quote has already been inserted, so it's at 'position'
                const rangeToReplace = new vscode.Range(position, position.translate(0, 1));

                await editor.edit(editBuilder => {
                    editBuilder.replace(rangeToReplace, replacement);
                }, { undoStopBefore: false, undoStopAfter: false });
            }
        })
    );
}

function isInsideVerbatim(document: vscode.TextDocument, position: vscode.Position): boolean {
    // For simplicity and performance, we scan a reasonable number of lines backwards
    // to see if we are inside a verbatim environment.
    const startLine = Math.max(0, position.line - 100);
    const range = new vscode.Range(new vscode.Position(startLine, 0), position);
    const text = document.getText(range);

    const lastBegin = text.lastIndexOf('\\begin{verbatim}');
    const lastEnd = text.lastIndexOf('\\end{verbatim}');

    // Also check for other common code environments
    const codeEnvironments = ['lstlisting', 'minted', 'code'];
    let latestBegin = lastBegin;
    let latestEnd = lastEnd;

    for (const env of codeEnvironments) {
        const b = text.lastIndexOf(`\\begin{${env}}`);
        const e = text.lastIndexOf(`\\end{${env}}`);
        if (b > latestBegin) {
            latestBegin = b;
            latestEnd = e;
        }
    }

    if (latestBegin === -1) {
        return false;
    }

    return latestBegin > latestEnd;
}
