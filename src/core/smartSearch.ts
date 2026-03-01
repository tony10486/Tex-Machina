import * as vscode from 'vscode';

export interface SmartSearchQuery {
    parentEnv?: string;
    targetCmd: string;
    excludeAttr?: string;
    injection: string;
}

/**
 * ('figure > \includegraphics:not([alt])').inject('alt={}') 형태의 쿼리를 파싱합니다.
 */
export function parseSmartQuery(input: string): SmartSearchQuery | null {
    // 1. 전체 구조 파싱: (selector).inject('injection')
    const mainRegex = /^\s*\(?\s*['"]?(.+?)['"]?\s*\)\s*\.inject\s*\(\s*['"](.+?)['"]\s*\)\s*$/;
    const mainMatch = input.match(mainRegex);
    if (!mainMatch) {
        return null;
    }

    const selector = mainMatch[1].trim();
    const injection = mainMatch[2];

    // 2. selector 파싱: [parentEnv > ] [\\]targetCmd [:not([excludeAttr])]
    const selectorRegex = /^(?:([\w-]+)\s*>\s*)?\\*([\w*]+)(?::not\(\[([\w-]+)\]\))?$/;
    const selectorMatch = selector.match(selectorRegex);
    if (!selectorMatch) {
        return null;
    }

    return {
        parentEnv: selectorMatch[1],
        targetCmd: selectorMatch[2],
        excludeAttr: selectorMatch[3],
        injection: injection
    };
}

/**
 * 스마트 검색 및 주입을 수행합니다.
 */
export async function performSmartSearchInject(editor: vscode.TextEditor, queryStr: string): Promise<number> {
    const query = parseSmartQuery(queryStr);
    if (!query) {
        throw new Error("올바르지 않은 쿼리 형식입니다.");
    }

    const document = editor.document;
    const fullText = document.getText();
    let editCount = 0;

    const searchRanges: [number, number][] = [];
    if (query.parentEnv) {
        const combinedRegex = new RegExp(`\\\\begin\\{${query.parentEnv}\\}|\\\\end\\{${query.parentEnv}\\}`, 'g');
        let stack = 0;
        let currentStart = -1;
        let match;
        while ((match = combinedRegex.exec(fullText)) !== null) {
            if (match[0].startsWith('\\begin')) {
                if (stack === 0) {
                    currentStart = match.index;
                }
                stack++;
            } else {
                stack--;
                if (stack === 0 && currentStart !== -1) {
                    searchRanges.push([currentStart, match.index + match[0].length]);
                    currentStart = -1;
                }
            }
        }
    } else {
        searchRanges.push([0, fullText.length]);
    }

    const edits: { range: vscode.Range, newText: string }[] = [];

    for (const [start, end] of searchRanges) {
        const rangeText = fullText.substring(start, end);
        // 명령어 탐색 (옵션 및 필수 인자 포함, 공백 보존용 캡처 그룹)
        const cmdRegex = new RegExp(`\\\\${query.targetCmd}(\\s*\\[([^\\]]*)\\])?(\\s*\\{([^\\}]*)\\})?`, 'g');
        
        let match;
        while ((match = cmdRegex.exec(rangeText)) !== null) {
            const fullMatch = match[0];
            const optSpace = match[1] ? match[1].match(/^\s*/)?.[0] || "" : "";
            const options = match[2]; // undefined if no []
            const argPart = match[3] || ""; // e.g. " {file}"
            
            // 제외 속성이 이미 포함되어 있는지 확인
            if (query.excludeAttr && options && options.includes(query.excludeAttr)) {
                continue;
            }

            let newText = fullMatch;
            if (query.injection.includes('=')) {
                if (options !== undefined) {
                    // 기존 옵션에 추가
                    newText = `\\${query.targetCmd}${optSpace}[${options}, ${query.injection}]${argPart}`;
                } else {
                    // 새 옵션 생성
                    newText = `\\${query.targetCmd}[${query.injection}]${argPart}`;
                }
            } else {
                // 단순 주입 (끝에 추가)
                newText = fullMatch + query.injection;
            }

            const matchStart = start + match.index;
            const matchEnd = matchStart + fullMatch.length;
            
            edits.push({
                range: new vscode.Range(document.positionAt(matchStart), document.positionAt(matchEnd)),
                newText: newText
            });
            editCount++;
        }
    }

    if (edits.length > 0) {
        await editor.edit(editBuilder => {
            for (let i = edits.length - 1; i >= 0; i--) {
                editBuilder.replace(edits[i].range, edits[i].newText);
            }
        });
    }

    return editCount;
}
