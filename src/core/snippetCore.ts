/**
 * 스니펫 시스템의 순수 매칭/실행 로직.
 * VS Code에 의존하지 않는 순수 로직만 포함합니다.
 */
import type { SnippetDefinition } from './snippetTypes';

/** 스니펫 매칭에 사용되는 커서 주변 문맥 정보. */
export interface SnippetContext {
    isMath: boolean;
    envName: string | null;
    lineText: string;
    aroundText: string;
    position: { line: number; character: number };
    documentText: string;
    languageId: string;
}

/**
 * 스니펫이 현재 문맥에서 매칭되는지 확인합니다.
 * enabled, scope, envs, contextRegex 조건을 순서대로 검사합니다.
 * @param s 검사할 스니펫
 * @param ctx 커서 주변 문맥
 * @returns 모든 조건을 통과하면 true
 */
export function snippetMatches(s: SnippetDefinition, ctx: SnippetContext): boolean {
    // 1. 비활성화된 스니펫은 매칭하지 않음
    if (s.enabled === false) {
        return false;
    }

    // 2. scope 조건
    if (s.scope === 'math' && !ctx.isMath) {
        return false;
    }
    if (s.scope === 'text' && ctx.isMath) {
        return false;
    }

    // 3. envs 조건: 지정된 환경 내에서만 매칭
    if (s.envs !== undefined && s.envs.length > 0) {
        if (ctx.envName === null || !s.envs.includes(ctx.envName)) {
            return false;
        }
    }

    // 4. contextRegex 조건: 라인 또는 주변 텍스트에 대한 정규식 매칭
    if (s.contextRegex !== undefined && s.contextRegex.length > 0) {
        let regex: RegExp;
        try {
            regex = new RegExp(s.contextRegex);
        } catch (e) {
            return false;
        }
        const target = s.contextScope === 'around' ? ctx.aroundText : ctx.lineText;
        if (!regex.test(target)) {
            return false;
        }
    }

    // 5. 모든 조건 통과
    return true;
}

/**
 * 현재 문맥에 매칭되는 스니펫을 찾습니다.
 * name이 주어지면 해당 이름의 매칭 스니펫을 우선적으로 찾습니다.
 * @param snippets 후보 스니펫 목록
 * @param ctx 커서 주변 문맥
 * @param name 특정 이름을 지정하면 그 이름을 우선 검색
 * @returns 매칭된 스니펫 또는 null
 */
export function findMatchingSnippet(snippets: SnippetDefinition[], ctx: SnippetContext, name?: string): SnippetDefinition | null {
    const enabled = snippets.filter(s => s.enabled !== false);

    if (name !== undefined) {
        const byName = enabled.find(s => s.name === name && snippetMatches(s, ctx));
        if (byName !== undefined) {
            return byName;
        }
    }

    return enabled.find(s => snippetMatches(s, ctx)) ?? null;
}

/**
 * 커서 앞 텍스트 끝에서 트리거 토큰(triggerChar + 이름)을 파싱합니다.
 * 트리거 문자 바로 앞은 문자열 시작, 공백, 또는 여는 괄호여야 합니다.
 * 예: ";frac" -> { name: 'frac', start: 0 }, " ;frac" -> { name: 'frac', start: 1 }, "x;frac" -> null
 * @param textBeforeCursor 커서 앞 텍스트
 * @param triggerChar 트리거 문자 (예: ';')
 * @returns 파싱된 스니펫 이름과 트리거 문자의 시작 인덱스, 또는 null
 */
export function parseTrigger(textBeforeCursor: string, triggerChar: string): { name: string; start: number } | null {
    // 트리거 문자를 정규식 특수 문자로부터 이스케이프
    const escaped = triggerChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s({\\[])(?:${escaped})([A-Za-z0-9_-]+)$`);
    const match = regex.exec(textBeforeCursor);
    if (match === null) {
        return null;
    }
    const name = match[1];
    // 트리거 문자의 시작 인덱스 = 매치 시작 위치 + 접두어 이후 오프셋
    const start = match.index + (match[0].length - name.length - triggerChar.length);
    return { name, start };
}

/**
 * JS 스니펫 스크립트를 동기적으로 실행합니다.
 * code는 함수 본문이어야 하며 문자열을 return해야 합니다.
 * (예: "return selection.replace(/x/g, 'y')")
 * 비동기(async) 함수는 v1에서 지원되지 않습니다.
 * @param code 실행할 JS 함수 본문
 * @param selection 현재 선택 영역 텍스트 (빈 문자열 가능)
 * @param ctx 스니펫 문맥
 * @param name 스니펫 이름 (오류 메시지용)
 * @returns 스크립트가 반환한 문자열
 * @throws 결과가 문자열이 아니면 Error
 */
export function evaluateJsScript(code: string, selection: string, ctx: SnippetContext, name: string): string {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('selection', 'context', code);
    const result = fn(selection, ctx);
    if (typeof result !== 'string') {
        throw new Error(`JS 스니펫 '${name}' 결과가 문자열이 아닙니다.`);
    }
    return result;
}

/**
 * 스니펫의 최종 삽입 본문을 결정합니다.
 * - JS 스크립트가 있으면 실행 결과 사용
 * - Python 스크립트가 있으면 코드 자체를 반환 (vscode 계층이 Python 백엔드로 전달)
 * - 그 외에는 정적 body 사용
 * @param s 스니펫 정의
 * @param selection 현재 선택 영역 텍스트
 * @param ctx 스니펫 문맥
 * @param name 스니펫 이름 (JS 오류 메시지용)
 * @returns 삽입 본문과 그 종류
 */
export function resolveSnippetBody(s: SnippetDefinition, selection: string, ctx: SnippetContext, name: string): { kind: 'static' | 'js' | 'python'; value: string } {
    if (s.script?.type === 'js') {
        return { kind: 'js', value: evaluateJsScript(s.script.code, selection, ctx, name) };
    }
    if (s.script?.type === 'python') {
        return { kind: 'python', value: s.script.code };
    }
    return { kind: 'static', value: s.body };
}
