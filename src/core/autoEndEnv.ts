import * as vscode from 'vscode';
import { findEnclosingEnvContext, isInsideComment, isInsideVerbatim } from './latexParser';

export function registerAutoEndEnv(context: vscode.ExtensionContext) {
    let isProcessing = false;

    const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
        if (isProcessing) return;
        const doc = event.document;
        if (doc.languageId !== 'latex') return;

        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('autoEndEnv.enabled', true)) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== doc) return;

        isProcessing = true;
        try {
            for (const change of event.contentChanges) {
                if (change.text.length === 0) continue;

                const pos = change.range.end;
                const lineText = doc.lineAt(pos.line).text;
                const textBefore = lineText.substring(0, pos.character);

                const match = textBefore.match(/(?:^|\s+)(\\end(?:\{([^}]*))?)$/);
                if (!match) continue;
                if (isInsideComment(doc, pos)) continue;

                const partialName = match[2];

                const envCtx = findEnclosingEnvContext(doc, pos);
                if (!envCtx) continue;

                if (partialName !== undefined && !envCtx.envName.startsWith(partialName)) continue;

                await editor.edit(editBuilder => {
                    if (partialName === undefined) {
                        editBuilder.insert(pos, `{${envCtx.envName}}`);
                    } else if (partialName === '') {
                        editBuilder.insert(pos, `${envCtx.envName}}`);
                    } else {
                        const replaceFrom = pos.translate(0, -partialName.length);
                        editBuilder.replace(
                            new vscode.Range(replaceFrom, pos),
                            `${envCtx.envName}}`
                        );
                    }
                }, { undoStopBefore: false, undoStopAfter: true });
                return;
            }
        } finally {
            isProcessing = false;
        }
    });

    const provider = vscode.languages.registerCompletionItemProvider(
        'latex',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const config = vscode.workspace.getConfiguration('tex-machina');
                if (!config.get<boolean>('autoEndEnv.enabled', true)) return;

                if (isInsideComment(document, position) || isInsideVerbatim(document, position)) return;

                const lineText = document.lineAt(position.line).text;
                const textBefore = lineText.substring(0, position.character);

                const match = textBefore.match(/(?:^|\s+)(\\end(?:\{([^}]*))?)$/);
                if (!match) return;

                const partialName = match[2];

                const envCtx = findEnclosingEnvContext(document, position);
                if (!envCtx) return;

                if (partialName !== undefined && !envCtx.envName.startsWith(partialName)) return;

                const envName = envCtx.envName;
                const hasBrace = partialName !== undefined;

                const item = new vscode.CompletionItem(
                    `\\end{${envName}}`,
                    vscode.CompletionItemKind.Snippet
                );

                if (!hasBrace) {
                    item.range = new vscode.Range(position, position);
                    item.insertText = `{${envName}}`;
                } else if (partialName === '') {
                    item.range = new vscode.Range(position, position);
                    item.insertText = `${envName}}`;
                } else {
                    const partialStart = position.character - partialName.length;
                    item.range = new vscode.Range(
                        new vscode.Position(position.line, partialStart),
                        position
                    );
                    item.insertText = `${envName}}`;
                }

                item.detail = `환경 닫기: ${envName}`;
                item.sortText = '0';
                item.filterText = `\\end{${envName}}`;

                return [item];
            }
        },
        '\\', '{'
    );

    context.subscriptions.push(changeListener, provider);
}
