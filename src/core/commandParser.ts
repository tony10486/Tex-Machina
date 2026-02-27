export interface ParsedCommand {
    mainCommand: string;
    subCommands: string[];
    parallelOptions: string[];
    rawSelection: string;
}

export function parseUserCommand(input: string, selection: string): ParsedCommand {
    let mainCmd = "";
    const subCmds: string[] = [];
    const parallels: string[] = [];
    let buffer = "";
    let isEscaped = false;
    let isParallelSection = false;
    let isMainCmdParsed = false;

    // 제안서 준수: O(N) 시간 복잡도의 단일 루프 [cite: 132]
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (isEscaped) { buffer += char; isEscaped = false; continue; }
        if (char === '\\') { isEscaped = true; continue; } // 이스케이프 처리 [cite: 128]

        // 개선: 앞에 공백이 있는 '/'만 옵션 섹션 시작으로 인식
        if (char === '/' && !isParallelSection && i > 0 && input[i-1] === ' ') {
            pushToCmds();
            isParallelSection = true;
            continue;
        }
        if (char === '>' && !isParallelSection) {
            pushToCmds();
            continue;
        }
        // 개선: 앞에 공백이 있는 '/'만 새로운 옵션 구분자로 인식
        if (char === '/' && isParallelSection && i > 0 && input[i-1] === ' ') {
            parallels.push(buffer.trim());
            buffer = "";
            continue;
        }
        buffer += char;
    }

    function pushToCmds() {
        const trimmed = buffer.trim();
        if (trimmed) {
            if (!isMainCmdParsed) {
                mainCmd = trimmed;
                isMainCmdParsed = true;
            } else {
                subCmds.push(trimmed);
            }
        }
        buffer = "";
    }

    // 최종 정리: 마지막 조각 처리
    if (isParallelSection) {
        const trimmed = buffer.trim();
        if (trimmed) {
            parallels.push(trimmed);
        }
    } else {
        pushToCmds();
    }

    return { mainCommand: mainCmd, subCommands: subCmds, parallelOptions: parallels, rawSelection: selection };
}