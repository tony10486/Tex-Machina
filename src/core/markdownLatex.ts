import * as vscode from 'vscode';

export function registerMarkdownLatex(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('markdownLatex.enabled', true);
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
                // We are looking for space insertion
                if (change.text !== ' ') {
                    continue;
                }

                const line = change.range.start.line;
                const charOffsetAfter = change.range.start.character + 1;
                const lineText = editor.document.lineAt(line).text;
                const textBeforeSpace = lineText.substring(0, charOffsetAfter);

                // 1. Check for Bold: **text** followed by space
                const boldRegex = /\*\*([^*]+)\*\* $/;
                const boldMatch = textBeforeSpace.match(boldRegex);
                if (boldMatch) {
                    const fullMatch = boldMatch[0];
                    const content = boldMatch[1];
                    const startPos = charOffsetAfter - fullMatch.length;
                    
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, startPos), new vscode.Position(line, charOffsetAfter)),
                            `\\textbf{${content}} `
                        );
                    }, { undoStopBefore: false, undoStopAfter: false });
                    continue; 
                }

                // 2. Check for Italic: *text* followed by space
                const italicRegex = /(?<!\*)\*([^*]+)\* $/;
                const italicMatch = textBeforeSpace.match(italicRegex);
                if (italicMatch) {
                    const fullMatch = italicMatch[0];
                    const content = italicMatch[1];
                    const startPos = charOffsetAfter - fullMatch.length;
                    
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, startPos), new vscode.Position(line, charOffsetAfter)),
                            `\\textit{${content}} `
                        );
                    }, { undoStopBefore: false, undoStopAfter: false });
                    continue; 
                }

                // 3. Check for Strikethrough: ~~text~~ followed by space
                const strikeRegex = /~~([^~]+)~~ $/;
                const strikeMatch = textBeforeSpace.match(strikeRegex);
                if (strikeMatch) {
                    const fullMatch = strikeMatch[0];
                    const content = strikeMatch[1];
                    const startPos = charOffsetAfter - fullMatch.length;
                    
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, startPos), new vscode.Position(line, charOffsetAfter)),
                            `\\sout{${content}} `
                        );
                    }, { undoStopBefore: false, undoStopAfter: false });
                    continue; 
                }

                // 4. Check for Section: #Text# followed by space (must be at start of line)
                const sectionRegex = /^#([^#]+)# $/;
                const sectionMatch = textBeforeSpace.match(sectionRegex);
                if (sectionMatch) {
                    const content = sectionMatch[1];
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, charOffsetAfter)),
                            `\\section{${content}}\n`
                        );
                    }, { undoStopBefore: true, undoStopAfter: true });
                    continue;
                }

                // 5. Check for Subsection: ##Text## followed by space
                const subsectionRegex = /^##([^#]+)## $/;
                const subsectionMatch = textBeforeSpace.match(subsectionRegex);
                if (subsectionMatch) {
                    const content = subsectionMatch[1];
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, charOffsetAfter)),
                            `\\subsection{${content}}\n`
                        );
                    }, { undoStopBefore: true, undoStopAfter: true });
                    continue;
                }

                // 6. Check for Gather: > Text followed by space
                const gatherRegex = /^> (.+) $/;
                const gatherMatch = textBeforeSpace.match(gatherRegex);
                if (gatherMatch) {
                    const content = gatherMatch[1];
                    const replacement = `\\begin{gather}\n    ${content}\n\\end{gather}\n`;
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, charOffsetAfter)),
                            replacement
                        );
                    }, { undoStopBefore: true, undoStopAfter: true });
                    continue;
                }

                // 7. Check for Itemize: "- " at the beginning of the line
                const itemizeRegex = /^\s*-\s$/;
                if (itemizeRegex.test(textBeforeSpace)) {
                    const indentation = textBeforeSpace.match(/^\s*/)?.[0] || "";
                    const replacement = `${indentation}\\begin{itemize}\n${indentation}    \\item \n${indentation}\\end{itemize}`;
                    
                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, charOffsetAfter)),
                            replacement
                        );
                    }, { undoStopBefore: true, undoStopAfter: true });

                    const newPosition = new vscode.Position(line + 1, indentation.length + 10);
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                }
            }
        })
    );
}
