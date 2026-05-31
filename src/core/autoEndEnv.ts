import * as vscode from 'vscode';
import { findEnclosingEnvContext, isInsideComment, isInsideVerbatim } from './latexParser';

export function registerAutoEndEnv(context: vscode.ExtensionContext) {
    let suggestTimeout: NodeJS.Timeout | undefined;

    const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
        const doc = event.document;
        if (doc.languageId !== 'latex') return;

        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('autoEndEnv.enabled', true)) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== doc) return;

        for (const change of event.contentChanges) {
            if (change.text.length === 0) continue;

            const pos = change.range.end;
            const lineText = doc.lineAt(pos.line).text;
            const textBefore = lineText.substring(0, pos.character);

            if (!/(?:^|\s+)\\end(?:\{[^}]*)?$/.test(textBefore)) continue;
            if (isInsideComment(doc, pos)) continue;

            if (suggestTimeout) clearTimeout(suggestTimeout);
            suggestTimeout = setTimeout(() => {
                vscode.commands.executeCommand('editor.action.triggerSuggest');
            }, 10);
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

                const fullMatch = match[1];
                const partialName = match[2];

                const envCtx = findEnclosingEnvContext(document, position);
                if (!envCtx) return;

                const envName = envCtx.envName;

                if (partialName !== undefined && !envName.startsWith(partialName)) return;

                const item = new vscode.CompletionItem(
                    `\\end{${envName}}`,
                    vscode.CompletionItemKind.Snippet
                );

                const hasBrace = partialName !== undefined;

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
