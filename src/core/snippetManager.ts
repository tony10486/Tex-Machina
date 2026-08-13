import * as vscode from 'vscode';
import { SnippetDefinition, SNIPPET_STORAGE_KEY, BUILTIN_SNIPPETS, validateSnippet, normalizeSnippet } from './snippetTypes';
import { SnippetContext } from './snippetCore';
import { findMathAtPos, findEnclosingEnvContext } from './latexParser';

const SNIPPET_HIDDEN_KEY = 'tex-machina.snippets.hidden';

/**
 * 사용자 정의 스니펫의 저장/CRUD/내보내기/가져오기 및 문맥 구성을 담당합니다.
 * 내장 스니펫(BUILTIN_SNIPPETS)과 사용자 스니펫(globalState)을 병합해 제공합니다.
 */
export class SnippetManager {
    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 사용 가능한 모든 스니펫을 반환합니다.
     * [내장 스니펫 - 숨김 목록] 에 사용자 스니펫을 병합하며,
     * 같은 이름의 사용자 스니펫이 내장 스니펫을 덮어씁니다.
     */
    getAll(): Record<string, SnippetDefinition> {
        const hidden = new Set(this.context.globalState.get<string[]>(SNIPPET_HIDDEN_KEY, []));
        const user = this.context.globalState.get<Record<string, SnippetDefinition>>(SNIPPET_STORAGE_KEY, {});

        const result: Record<string, SnippetDefinition> = {};
        for (const builtin of BUILTIN_SNIPPETS) {
            if (hidden.has(builtin.name)) {
                continue;
            }
            result[builtin.name] = normalizeSnippet(builtin);
        }
        for (const [name, snippet] of Object.entries(user)) {
            result[name] = normalizeSnippet(snippet);
        }
        return result;
    }

    /** 이름으로 스니펫을 조회합니다. */
    get(name: string): SnippetDefinition | undefined {
        return this.getAll()[name];
    }

    /** 활성화된 스니펫 중 JS 스크립트를 가진 스니펫이 하나라도 있는지 확인합니다. */
    hasJsSnippets(): boolean {
        return Object.values(this.getAll()).some(s => s.enabled !== false && s.script?.type === 'js');
    }

    /**
     * 스니펫을 검증 후 저장합니다.
     * 검증 실패 시 { ok: false, error }를, 성공 시 { ok: true }를 반환합니다.
     */
    async save(snippet: SnippetDefinition): Promise<{ ok: true } | { ok: false; error: string }> {
        const validation = validateSnippet(snippet);
        if (!validation.ok) {
            return validation;
        }

        const record = this.context.globalState.get<Record<string, SnippetDefinition>>(SNIPPET_STORAGE_KEY, {});
        record[validation.value.name] = validation.value;
        await this.context.globalState.update(SNIPPET_STORAGE_KEY, record);

        const hidden = this.context.globalState.get<string[]>(SNIPPET_HIDDEN_KEY, []);
        if (hidden.includes(validation.value.name)) {
            await this.context.globalState.update(
                SNIPPET_HIDDEN_KEY,
                hidden.filter(n => n !== validation.value.name)
            );
        }

        return { ok: true };
    }

    /**
     * 스니펫을 삭제합니다.
     * 내장 스니펫 이름이면 숨김 목록에 추가하여 되살아나지 않도록 합니다.
     */
    async delete(name: string): Promise<void> {
        const record = this.context.globalState.get<Record<string, SnippetDefinition>>(SNIPPET_STORAGE_KEY, {});
        if (record[name]) {
            delete record[name];
            await this.context.globalState.update(SNIPPET_STORAGE_KEY, record);
        }

        if (BUILTIN_SNIPPETS.some(s => s.name === name)) {
            const hidden = this.context.globalState.get<string[]>(SNIPPET_HIDDEN_KEY, []);
            if (!hidden.includes(name)) {
                hidden.push(name);
                await this.context.globalState.update(SNIPPET_HIDDEN_KEY, hidden);
            }
        }
    }

    /** 모든 스니펫을 JSON 파일로 내보냅니다. 취소 시 아무것도 하지 않습니다. */
    async exportToFile(): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('tex-machina-snippets.json'),
            filters: { 'JSON': ['json'] }
        });
        if (!uri) {
            return;
        }

        const all = this.getAll();
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(all, null, 2), 'utf8'));
        vscode.window.showInformationMessage(`${Object.keys(all).length}개 스니펫을 내보냈습니다.`);
    }

    /**
     * JSON 파일에서 스니펫을 가져옵니다.
     * 객체(Record) 또는 배열 형태를 허용하며, 유효한 스니펫만 병합합니다.
     * @returns 가져온 스니펫 개수 (취소 시 0)
     */
    async importFromFile(): Promise<number> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] }
        });
        if (!uris || uris.length === 0) {
            return 0;
        }

        let raw: unknown;
        try {
            const content = await vscode.workspace.fs.readFile(uris[0]);
            raw = JSON.parse(Buffer.from(content).toString('utf8'));
        } catch (e: any) {
            vscode.window.showErrorMessage(`스니펫 파일을 읽지 못했습니다: ${e.message}`);
            return 0;
        }

        let entries: unknown[];
        if (Array.isArray(raw)) {
            entries = raw;
        } else if (raw !== null && typeof raw === 'object') {
            entries = Object.values(raw);
        } else {
            vscode.window.showErrorMessage('스니펫 파일 형식이 올바르지 않습니다. (객체 또는 배열이어야 합니다)');
            return 0;
        }

        const record = this.context.globalState.get<Record<string, SnippetDefinition>>(SNIPPET_STORAGE_KEY, {});
        let imported = 0;
        let skipped = 0;
        for (const entry of entries) {
            const validation = validateSnippet(entry);
            if (!validation.ok) {
                skipped++;
                continue;
            }
            record[validation.value.name] = validation.value;
            imported++;
        }
        await this.context.globalState.update(SNIPPET_STORAGE_KEY, record);

        vscode.window.showInformationMessage(`${imported}개 스니펫 가져옴 (${skipped}개 건너뜀)`);
        return imported;
    }

    /**
     * 커서 주변의 LaTeX 문맥 정보를 구성합니다.
     * includeDocumentText=true일 때만 전체 문서 텍스트를 포함합니다 (비용 절감).
     */
    buildContext(editor: vscode.TextEditor, position: vscode.Position, includeDocumentText: boolean = false): SnippetContext {
        const doc = editor.document;
        const mathEnv = findMathAtPos(doc, position);
        const envCtx = findEnclosingEnvContext(doc, position);
        const lineText = doc.lineAt(position.line).text;
        const aroundStart = Math.max(0, position.character - 30);
        const aroundEnd = Math.min(position.character + 10, lineText.length);
        const aroundText = lineText.substring(aroundStart, aroundEnd);
        return {
            isMath: !!mathEnv,
            envName: envCtx ? envCtx.envName : null,
            lineText,
            aroundText,
            position: { line: position.line, character: position.character },
            documentText: includeDocumentText ? doc.getText() : '',
            languageId: doc.languageId,
        };
    }
}
