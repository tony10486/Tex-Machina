import * as vscode from 'vscode';

export class MacroManager {
    private static readonly STORAGE_KEY = 'tex-machina.macros';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * 저장된 모든 매크로를 가져옵니다.
     */
    getMacros(): Record<string, string> {
        return this.context.globalState.get<Record<string, string>>(MacroManager.STORAGE_KEY, {});
    }

    /**
     * 새 매크로를 정의합니다.
     * @param name 매크로 이름
     * @param chain 명령어 체인
     */
    async defineMacro(name: string, chain: string): Promise<void> {
        const macros = this.getMacros();
        macros[name] = chain;
        await this.context.globalState.update(MacroManager.STORAGE_KEY, macros);
        vscode.window.showInformationMessage(`매크로 '${name}'이(가) 저장되었습니다: ${chain}`);
    }

    /**
     * 입력 문자열에서 매크로를 확장합니다.
     * @param input 사용자의 입력 (예: ;diffplot)
     * @returns 확장된 명령어 체인
     */
    expand(input: string): string {
        const trimmed = input.trim();
        if (trimmed.startsWith(';')) {
            const name = trimmed.substring(1).trim();
            const macros = this.getMacros();
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
