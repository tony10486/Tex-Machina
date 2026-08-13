/**
 * 스니펫 시스템의 순수 타입 정의 및 검증 유틸리티.
 * VS Code에 의존하지 않는 순수 로직만 포함합니다.
 */

/** 스니펫이 적용되는 문맥 범위. */
export type SnippetScope = 'any' | 'math' | 'text';

/** 스니펫에 연결된 스크립트 정의. */
export interface SnippetScript {
    type: 'js' | 'python';
    code: string;
}

/** 사용자 정의 스니펫 정의. */
export interface SnippetDefinition {
    name: string;
    description?: string;
    prefix?: string[];
    body: string;
    scope?: SnippetScope;
    envs?: string[];
    contextRegex?: string;
    contextScope?: 'line' | 'around';
    script?: SnippetScript;
    autoInsertEnv?: boolean;
    enabled?: boolean;
}

/** 사용자 정의 스니펫이 저장되는 storage 키. */
export const SNIPPET_STORAGE_KEY = 'tex-machina.snippets';

/** 기본 내장 스니펫 목록. */
export const BUILTIN_SNIPPETS: SnippetDefinition[] = [
    { name: 'frac', description: '분수', prefix: ['fr'], body: '\\frac{$1}{$2}$0', scope: 'math' },
    { name: 'sqrt', description: '제곱근', prefix: ['sq'], body: '\\sqrt{$1}$0', scope: 'math' },
    { name: 'sum', description: '시그마 합', body: '\\sum_{$1}^{$2}$0', scope: 'math' },
    { name: 'int', description: '적분', body: '\\int_{$1}^{$2}$0', scope: 'math' },
    { name: 'align', description: 'align 환경 블록', body: '\\begin{align}\n\t$1\n\\end{align}$0', scope: 'any', autoInsertEnv: true },
    { name: 'cases', description: 'cases 환경', body: '\\begin{cases}\n\t$1\n\\end{cases}$0', scope: 'math', autoInsertEnv: true },
    { name: 'textbf', description: '굵은 글씨 (선택 영역)', prefix: ['tb'], body: '\\textbf{$TM_SELECTED_TEXT}$0', scope: 'text' },
    { name: 'emph', description: '이탤릭 (선택 영역)', body: '\\emph{$TM_SELECTED_TEXT}$0', scope: 'text' }
];

/** 검증 결과: 성공 시 정규화된 스니펫, 실패 시 오류 메시지. */
export type ValidationResult = { ok: true; value: SnippetDefinition } | { ok: false; error: string };

/**
 * 원본 데이터가 유효한 SnippetDefinition인지 검증합니다.
 * @param raw 검증할 원본 값 (plain object 또는 SnippetDefinition)
 * @returns 성공 시 { ok: true, value: 정규화된 스니펫 }, 실패 시 { ok: false, error: 한국어 오류 메시지 }
 */
export function validateSnippet(raw: unknown): ValidationResult {
    if (raw === null || typeof raw !== 'object') {
        return { ok: false, error: '스니펫은 객체여야 합니다.' };
    }
    const obj = raw as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name.length === 0) {
        return { ok: false, error: 'name은 비어 있지 않은 문자열이어야 합니다.' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(obj.name)) {
        return { ok: false, error: `name '${obj.name}'은(는) 영문, 숫자, '_', '-'만 허용됩니다.` };
    }

    if (typeof obj.body !== 'string' || obj.body.length === 0) {
        return { ok: false, error: 'body는 비어 있지 않은 문자열이어야 합니다.' };
    }

    if (obj.scope !== undefined && obj.scope !== 'any' && obj.scope !== 'math' && obj.scope !== 'text') {
        return { ok: false, error: `scope '${String(obj.scope)}'은(는) 'any', 'math', 'text' 중 하나여야 합니다.` };
    }

    if (obj.envs !== undefined) {
        if (!Array.isArray(obj.envs) || !obj.envs.every(e => typeof e === 'string')) {
            return { ok: false, error: 'envs는 문자열 배열이어야 합니다.' };
        }
    }

    if (obj.contextRegex !== undefined) {
        if (typeof obj.contextRegex !== 'string') {
            return { ok: false, error: 'contextRegex는 문자열이어야 합니다.' };
        }
        try {
            new RegExp(obj.contextRegex);
        } catch (e) {
            return { ok: false, error: `contextRegex '${obj.contextRegex}'은(는) 올바른 정규식이 아닙니다.` };
        }
    }

    if (obj.contextScope !== undefined && obj.contextScope !== 'line' && obj.contextScope !== 'around') {
        return { ok: false, error: `contextScope '${String(obj.contextScope)}'은(는) 'line', 'around' 중 하나여야 합니다.` };
    }

    if (obj.script !== undefined) {
        const script = obj.script as Record<string, unknown>;
        if (script === null || typeof script !== 'object') {
            return { ok: false, error: 'script는 객체여야 합니다.' };
        }
        if (script.type !== 'js' && script.type !== 'python') {
            return { ok: false, error: `script.type '${String(script.type)}'은(는) 'js', 'python' 중 하나여야 합니다.` };
        }
        if (typeof script.code !== 'string' || script.code.length === 0) {
            return { ok: false, error: 'script.code는 비어 있지 않은 문자열이어야 합니다.' };
        }
    }

    if (obj.enabled !== undefined && typeof obj.enabled !== 'boolean') {
        return { ok: false, error: 'enabled는 불리언이어야 합니다.' };
    }

    const normalized: SnippetDefinition = {
        name: obj.name,
        body: obj.body,
        description: typeof obj.description === 'string' ? obj.description : undefined,
        prefix: Array.isArray(obj.prefix) ? obj.prefix.filter((p): p is string => typeof p === 'string') : undefined,
        scope: obj.scope as SnippetScope | undefined,
        envs: Array.isArray(obj.envs) ? (obj.envs as string[]) : undefined,
        contextRegex: typeof obj.contextRegex === 'string' ? obj.contextRegex : undefined,
        contextScope: obj.contextScope as 'line' | 'around' | undefined,
        script: typeof obj.script === 'object' && obj.script !== null
            ? { type: (obj.script as Record<string, unknown>).type as 'js' | 'python', code: (obj.script as Record<string, unknown>).code as string }
            : undefined,
        autoInsertEnv: typeof obj.autoInsertEnv === 'boolean' ? obj.autoInsertEnv : undefined,
        enabled: typeof obj.enabled === 'boolean' ? obj.enabled : undefined
    };

    return { ok: true, value: normalizeSnippet(normalized) };
}

/**
 * 스니펫의 누락된 필드를 기본값으로 채운 새 객체를 반환합니다.
 * @param s 원본 스니펫 (변경하지 않음)
 * @returns 모든 기본값이 채워진 새 SnippetDefinition
 */
export function normalizeSnippet(s: SnippetDefinition): SnippetDefinition {
    return {
        name: s.name,
        body: s.body,
        description: s.description !== undefined ? s.description : undefined,
        prefix: s.prefix !== undefined ? s.prefix : [],
        scope: s.scope !== undefined ? s.scope : 'any',
        envs: s.envs !== undefined ? s.envs : [],
        contextRegex: s.contextRegex !== undefined ? s.contextRegex : undefined,
        contextScope: s.contextScope !== undefined ? s.contextScope : 'line',
        script: s.script !== undefined ? s.script : undefined,
        autoInsertEnv: s.autoInsertEnv !== undefined ? s.autoInsertEnv : false,
        enabled: s.enabled !== undefined ? s.enabled : true
    };
}
