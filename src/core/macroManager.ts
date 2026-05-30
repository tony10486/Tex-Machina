import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

export class MacroManager {
    private static readonly STORAGE_KEY = 'tex-machina.macros';
    private cachedContexts: { name: string, regex: RegExp, scope: string }[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadConfig();
        // 설정 변경 감지 시 캐시 갱신
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('tex-machina.macros.customContexts')) {
                    this.loadConfig();
                }
            })
        );
    }

    /**
     * 설정을 로드하고 정규표현식을 미리 컴파일하여 캐싱합니다.
     */
    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('tex-machina');
        const customContexts = config.get<any[]>('macros.customContexts', []);
        this.cachedContexts = customContexts.map(ctx => {
            try {
                return {
                    name: ctx.name,
                    regex: new RegExp(ctx.regex),
                    scope: ctx.scope
                };
            } catch (e) {
                console.error(`Invalid regex in macro context '${ctx.name}': ${ctx.regex}`);
                return null;
            }
        }).filter((ctx): ctx is { name: string, regex: RegExp, scope: string } => ctx !== null);
    }

    /**
     * 저장된 모든 매크로를 가져옵니다.
     */
    getMacros(): Record<string, string> {
        return this.context.globalState.get<Record<string, string>>(MacroManager.STORAGE_KEY, {});
    }

    /**
     * 새 매크로를 정의합니다.
     * @param name 매크로 이름 (예: diff, diff:math, diff:text)
     * @param chain 명령어 체인
     */
    async defineMacro(name: string, chain: string): Promise<void> {
        const macros = this.getMacros();
        macros[name] = chain;
        await this.context.globalState.update(MacroManager.STORAGE_KEY, macros);
        vscode.window.showInformationMessage(`매크로 '${name}'이(가) 저장되었습니다: ${chain}`);
    }

    /**
     * 매크로를 삭제합니다.
     * @param name 매크로 이름
     */
    async deleteMacro(name: string): Promise<void> {
        const macros = this.getMacros();
        if (macros[name]) {
            delete macros[name];
            await this.context.globalState.update(MacroManager.STORAGE_KEY, macros);
            vscode.window.showInformationMessage(`매크로 '${name}'이(가) 삭제되었습니다.`);
        }
    }

    /**
     * 입력 문자열에서 매크로를 확장합니다.
     * @param input 사용자의 입력 (예: ;diffplot)
     * @param editor 현재 활성화된 에디터
     * @returns 확장된 명령어 체인
     */
    expand(input: string, editor?: vscode.TextEditor): string {
        const trimmed = input.trim();
        if (trimmed.startsWith(';')) {
            const name = trimmed.substring(1).trim();
            const macros = this.getMacros();

            // 컨텍스트 인지형 확장 시도
            if (editor) {
                let contextName = '';

                // 1. Math 모드 우선순위
                const isMath = !!findMathAtPos(editor.document, editor.selection.active);
                if (isMath) {
                    contextName = `${name}:math`;
                    if (macros[contextName]) { return macros[contextName]; }
                }

                // 2. 사용자 정의 컨텍스트 (캐싱된 정규표현식 사용)
                for (const ctx of this.cachedContexts) {
                    const lineText = editor.document.lineAt(editor.selection.active.line).text;
                    const checkText = (ctx.scope === 'around') 
                        ? editor.document.getText(new vscode.Range(
                            editor.selection.active.translate(0, -Math.min(editor.selection.active.character, 2)), 
                            editor.selection.active.translate(0, 2)
                          ))
                        : lineText;

                    if (ctx.regex.test(checkText)) {
                        contextName = `${name}:${ctx.name}`;
                        if (macros[contextName]) { return macros[contextName]; }
                    }
                }

                // 3. 마지막으로 Text 모드 시도
                if (!isMath) {
                    contextName = `${name}:text`;
                    if (macros[contextName]) { return macros[contextName]; }
                }
            }

            // 기본 확장 (컨텍스트가 없거나 해당 컨텍스트 매크로가 없는 경우)
            if (macros[name]) {
                return macros[name];
            }
        }
        return input;
    }

    /**
     * 매크로 정의 구문인지 확인하고 파싱합니다.
     * @param input 입력 문자열 (예: define:calc > diff && plot > 2d>:diffplot)
     */
    parseDefinition(input: string): { chain: string; name: string } | null {
        // define:명령어체인>:이름 (앞의 > 는 선택사항)
        // 이름 뒤에 :math 또는 :text 가 붙을 수 있음
        const match = input.match(/^>?\s*define:(.+)>:(.+)$/);
        if (match) {
            return {
                chain: match[1].trim(),
                name: match[2].trim()
            };
        }
        return null;
    }
}
