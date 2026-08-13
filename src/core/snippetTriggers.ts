import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { PythonService } from '../services/pythonService';
import { SnippetDefinition, SnippetScope } from './snippetTypes';
import { parseTrigger, snippetMatches, resolveSnippetBody } from './snippetCore';
import { isInsideComment, isInsideVerbatim } from './latexParser';
import { targetsEnv } from './envSnippetIntegration';

let isProcessing = false;

interface SnippetQuickPickItem extends vscode.QuickPickItem {
    snippet: SnippetDefinition;
}

/** 스니펫이 대상으로 하는 환경 이름 목록 (envs 필드 + body의 \begin{...}). */
function snippetEnvNames(snippet: SnippetDefinition): string[] {
    const envs = new Set<string>();
    for (const env of snippet.envs ?? []) {
        envs.add(env);
    }
    const bodyRe = /\\begin\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = bodyRe.exec(snippet.body)) !== null) {
        envs.add(m[1]);
    }
    return [...envs];
}

/**
 * 스니펫 타이핑 트리거, 완성 공급자, 그리고 명령어를 등록합니다.
 */
export function registerSnippetTriggers(
    context: vscode.ExtensionContext,
    manager: SnippetManager,
    pythonService: PythonService,
    onSnippetsChanged: () => void
): void {
    // (a) 타이핑 트리거: `;name` 입력 시 스니펫 본문으로 확장
    const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
        if (isProcessing) return;
        const doc = event.document;
        if (doc.languageId !== 'latex') return;

        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('snippets.enabled', true)) return;
        const triggerChar = config.get<string>('snippets.triggerChar', ';');

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== doc) return;

        const lastChange = [...event.contentChanges].reverse().find(c => c.text.length > 0);
        if (!lastChange || lastChange.text.length > 10) return;

        isProcessing = true;
        try {
            const pos = lastChange.range.end;
            if (isInsideComment(doc, pos) || isInsideVerbatim(doc, pos)) return;

            const textBefore = doc.lineAt(pos.line).text.substring(0, pos.character);
            const parsed = parseTrigger(textBefore, triggerChar);
            if (!parsed) return;

            // 정확한 이름 우선, 없으면 prefix 일치 스니펫
            let snippet = manager.get(parsed.name);
            if (!snippet) {
                snippet = Object.values(manager.getAll()).find(s =>
                    s.enabled !== false && (s.prefix ?? []).includes(parsed.name)
                );
            }
            if (!snippet) return;

            const ctx = manager.buildContext(editor, pos, manager.hasJsSnippets());
            if (!snippetMatches(snippet, ctx)) return;

            const selectionText = editor.document.getText(editor.selection);
            const resolved = resolveSnippetBody(snippet, selectionText, ctx, snippet.name);
            let body: string | null = null;
            if (resolved.kind === 'python') {
                const resp = await pythonService.sendAndWait({
                    mainCommand: 'snippet',
                    subCommands: [resolved.value],
                    rawSelection: selectionText
                });
                if (resp.status !== 'success') {
                    vscode.window.showErrorMessage(resp.message ?? '스니펫 실행에 실패했습니다.');
                    return;
                }
                body = resp.latex;
            } else {
                body = resolved.value;
            }
            if (body === null) return;

            // `;name` 토큰만 교체 (앞의 공백은 유지)
            const insertRange = new vscode.Range(new vscode.Position(pos.line, parsed.start), pos);
            await editor.insertSnippet(
                new vscode.SnippetString(body),
                insertRange,
                { undoStopBefore: false, undoStopAfter: true }
            );
        } finally {
            isProcessing = false;
        }
    });

    // (b) 완성 공급자: `;name` 스니펫 완성 + \begin{env} 환경 스니펫 완성
    const provider = vscode.languages.registerCompletionItemProvider(
        'latex',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
                const config = vscode.workspace.getConfiguration('tex-machina');
                if (!config.get<boolean>('snippets.enabled', true)) return [];

                if (isInsideComment(document, position) || isInsideVerbatim(document, position)) return [];

                const editor = vscode.window.activeTextEditor;
                if (!editor) return [];

                const items: vscode.CompletionItem[] = [];
                const lineText = document.lineAt(position.line).text;
                const textBefore = lineText.substring(0, position.character);
                const triggerChar = config.get<string>('snippets.triggerChar', ';');

                // 1) `;partial` 스니펫 완성
                const parsed = parseTrigger(textBefore, triggerChar);
                if (parsed) {
                    const partial = parsed.name;
                    const ctx = manager.buildContext(editor, position, false);
                    const range = new vscode.Range(position.line, parsed.start, position.line, position.character);
                    for (const snippet of Object.values(manager.getAll())) {
                        if (!snippetMatches(snippet, ctx)) continue;
                        const matchesPartial = snippet.name.startsWith(partial) ||
                            (snippet.prefix ?? []).some(p => p.startsWith(partial));
                        if (!matchesPartial) continue;
                        const item = new vscode.CompletionItem(`;${snippet.name}`, vscode.CompletionItemKind.Snippet);
                        item.insertText = new vscode.SnippetString(snippet.body);
                        item.range = range;
                        item.detail = snippet.description || snippet.scope;
                        item.sortText = '0';
                        items.push(item);
                    }
                }

                // 2) \begin{partial} 환경 스니펫 완성
                const envMatch = textBefore.match(/(\\begin\s*\{)([^}]*)$/);
                if (envMatch) {
                    const partial = envMatch[2];
                    const beginStart = envMatch.index ?? 0;
                    const range = new vscode.Range(position.line, beginStart, position.line, position.character);
                    const seen = new Set<string>();
                    for (const snippet of Object.values(manager.getAll())) {
                        if (snippet.enabled === false || snippet.autoInsertEnv !== true) continue;
                        for (const env of snippetEnvNames(snippet)) {
                            if (seen.has(env)) continue;
                            if (!env.startsWith(partial)) continue;
                            if (!targetsEnv(snippet, env)) continue;
                            seen.add(env);
                            const item = new vscode.CompletionItem(`\\begin{${env}}`, vscode.CompletionItemKind.Snippet);
                            item.insertText = new vscode.SnippetString(snippet.body);
                            item.range = range;
                            item.detail = snippet.description || 'env 스니펫';
                            item.sortText = '1';
                            items.push(item);
                        }
                    }
                }

                return items;
            }
        },
        ';', '\\', '{'
    );

    // (c) 명령어들

    /** 스니펫 이름(또는 prefix)으로 본문을 해석해 현재 에디터에 삽입합니다. */
    const insertSnippetIntoEditor = async (name: string): Promise<void> => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        let snippet = manager.get(name);
        if (!snippet) {
            snippet = Object.values(manager.getAll()).find(s =>
                s.enabled !== false && (s.prefix ?? []).includes(name)
            );
        }
        if (!snippet) {
            vscode.window.showErrorMessage(`스니펫 '${name}'을(를) 찾을 수 없습니다.`);
            return;
        }

        const pos = editor.selection.active;
        const ctx = manager.buildContext(editor, pos, manager.hasJsSnippets());
        if (!snippetMatches(snippet, ctx)) {
            vscode.window.showErrorMessage(`스니펫 '${name}'이(가) 현재 문맥에 맞지 않습니다.`);
            return;
        }

        const selectionText = editor.document.getText(editor.selection);
        const resolved = resolveSnippetBody(snippet, selectionText, ctx, snippet.name);
        let body: string | null = null;
        if (resolved.kind === 'python') {
            const resp = await pythonService.sendAndWait({
                mainCommand: 'snippet',
                subCommands: [resolved.value],
                rawSelection: selectionText
            });
            if (resp.status !== 'success') {
                vscode.window.showErrorMessage(resp.message ?? '스니펫 실행에 실패했습니다.');
                return;
            }
            body = resp.latex;
        } else {
            body = resolved.value;
        }
        if (body === null) return;

        await editor.insertSnippet(
            new vscode.SnippetString(body),
            editor.selection,
            { undoStopBefore: false, undoStopAfter: true }
        );
    };

    const commands = [
        vscode.commands.registerCommand('tex-machina.snippets.save', async (snippet: any) => {
            const res = await manager.save(snippet);
            if (!res.ok) {
                vscode.window.showErrorMessage(res.error);
                return;
            }
            onSnippetsChanged();
        }),
        vscode.commands.registerCommand('tex-machina.snippets.delete', async (name: string) => {
            await manager.delete(name);
            onSnippetsChanged();
        }),
        vscode.commands.registerCommand('tex-machina.snippets.insert', async (name?: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            if (name !== undefined && name.length > 0) {
                await insertSnippetIntoEditor(name);
                return;
            }

            const ctx = manager.buildContext(editor, editor.selection.active, false);
            const items: SnippetQuickPickItem[] = Object.values(manager.getAll())
                .filter(s => s.enabled !== false && snippetMatches(s, ctx))
                .map(s => ({
                    label: `;${s.name}`,
                    detail: s.description || undefined,
                    description: s.scope,
                    snippet: s
                }));
            const picked = await vscode.window.showQuickPick(items, { placeHolder: '삽입할 스니펫을 선택하세요' });
            if (!picked) return;
            await insertSnippetIntoEditor(picked.snippet.name);
        }),
        vscode.commands.registerCommand('tex-machina.snippets.create', async () => {
            const name = await vscode.window.showInputBox({
                prompt: '스니펫 이름 (영문, 숫자, _, - 만 허용)',
                placeHolder: '예: myfrac',
                validateInput: (value: string) => {
                    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                        return '이름은 영문, 숫자, "_", "-"만 허용됩니다.';
                    }
                    if (manager.get(value)) {
                        return '이미 존재하는 스니펫 이름입니다.';
                    }
                    return undefined;
                }
            });
            if (!name) return;

            const scope = await vscode.window.showQuickPick(['any', 'math', 'text'], {
                placeHolder: '적용 범위를 선택하세요'
            });
            if (!scope) return;

            const body = await vscode.window.showInputBox({
                prompt: '스니펫 본문 (탭 정지점: $1, $2, $0)',
                value: '\\frac{$1}{$2}$0'
            });
            if (body === undefined) return;

            const description = await vscode.window.showInputBox({
                prompt: '스니펫 설명 (선택 사항)'
            });

            const snippet: SnippetDefinition = { name, scope: scope as SnippetScope, body };
            if (description) snippet.description = description;

            const res = await manager.save(snippet);
            if (!res.ok) {
                vscode.window.showErrorMessage(res.error);
                return;
            }
            onSnippetsChanged();
            vscode.window.showInformationMessage(`스니펫 '${name}'이(가) 생성되었습니다.`);
        }),
        vscode.commands.registerCommand('tex-machina.snippets.edit', async () => {
            const items: SnippetQuickPickItem[] = Object.values(manager.getAll())
                .filter(s => s.enabled !== false)
                .map(s => ({
                    label: `;${s.name}`,
                    detail: s.description || undefined,
                    description: s.scope,
                    snippet: s
                }));
            const picked = await vscode.window.showQuickPick(items, { placeHolder: '수정할 스니펫을 선택하세요' });
            if (!picked) return;

            const newBody = await vscode.window.showInputBox({
                prompt: `스니펫 '${picked.snippet.name}'의 새 본문`,
                value: picked.snippet.body
            });
            if (newBody === undefined) return;

            const res = await manager.save({ ...picked.snippet, body: newBody });
            if (!res.ok) {
                vscode.window.showErrorMessage(res.error);
                return;
            }
            onSnippetsChanged();
        }),
        vscode.commands.registerCommand('tex-machina.snippets.export', async () => {
            await manager.exportToFile();
        }),
        vscode.commands.registerCommand('tex-machina.snippets.import', async () => {
            const n = await manager.importFromFile();
            if (n > 0) onSnippetsChanged();
        })
    ];

    context.subscriptions.push(changeListener, provider, ...commands);
}
