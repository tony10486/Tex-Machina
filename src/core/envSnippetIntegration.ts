import * as vscode from 'vscode';
import { SnippetManager } from './snippetManager';
import { SnippetDefinition } from './snippetTypes';
import { isInsideComment, isInsideVerbatim } from './latexParser';

/**
 * 스니펫이 특정 환경의 자동 삽입 대상인지 확인합니다.
 * autoInsertEnv가 true이고, (envs에 포함되거나 본문에 \begin{env}가 있는) 경우 true.
 */
export function targetsEnv(snippet: SnippetDefinition, env: string): boolean {
    if (snippet.autoInsertEnv !== true) {
        return false;
    }
    if ((snippet.envs ?? []).includes(env)) {
        return true;
    }
    const escaped = env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\\\begin\\s*\\{${escaped}\\}`).test(snippet.body);
}

/**
 * 스니펫 본문에서 첫 \begin{env}와 마지막 \end{env} 사이의 내용을 추출합니다.
 * 해당 태그가 없으면 기본값 '\n\t$1\n'을 반환합니다.
 */
export function extractEnvInner(body: string, env: string): string {
    const escaped = env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const beginRe = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`);
    const beginMatch = beginRe.exec(body);
    if (beginMatch === null) {
        return '\n\t$1\n';
    }

    const rest = body.substring(beginMatch.index + beginMatch[0].length);
    const endRe = new RegExp(`\\\\end\\s*\\{${escaped}\\}`, 'g');
    let lastEnd: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = endRe.exec(rest)) !== null) {
        lastEnd = m;
    }
    if (lastEnd === null) {
        return '\n\t$1\n';
    }
    return rest.substring(0, lastEnd.index);
}

/**
 * \begin{env} 입력 완료 시 해당 환경용 스니펫 본문을 자동 삽입합니다.
 * (완성 제안은 snippetTriggers.ts의 완성 공급자에서 처리합니다)
 */
export function registerEnvSnippetIntegration(context: vscode.ExtensionContext, manager: SnippetManager): void {
    let isProcessing = false;

    const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
        if (isProcessing) return;
        const doc = event.document;
        if (doc.languageId !== 'latex') return;

        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('snippets.autoInsertEnv', false)) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== doc) return;

        const lastChange = [...event.contentChanges].reverse().find(c => c.text.length > 0);
        if (!lastChange || lastChange.text.length > 10) return;

        isProcessing = true;
        try {
            const pos = lastChange.range.end;
            if (isInsideComment(doc, pos) || isInsideVerbatim(doc, pos)) return;

            const textBefore = doc.lineAt(pos.line).text.substring(0, pos.character);
            const match = textBefore.match(/(\\begin\s*\{)([^}]*)\}$/);
            if (!match) return;
            const envName = match[2];

            const candidates = Object.values(manager.getAll()).filter(s =>
                s.enabled !== false && targetsEnv(s, envName)
            );
            if (candidates.length !== 1) return;

            const snippet = candidates[0];
            const inner = extractEnvInner(snippet.body, envName) + '\n\\end{' + envName + '}' + '$0';
            await editor.insertSnippet(
                new vscode.SnippetString(inner),
                pos,
                { undoStopBefore: false, undoStopAfter: true }
            );
        } finally {
            isProcessing = false;
        }
    });

    context.subscriptions.push(changeListener);
}
