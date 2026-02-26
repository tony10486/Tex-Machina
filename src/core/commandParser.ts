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

        if (char === '/' && !isParallelSection) {
            pushToCmds();
            isParallelSection = true;
            continue;
        }
        if (char === '>' && !isParallelSection) {
            pushToCmds();
            continue;
        }
        // 개선: 앞에 공백이 있는 '/'만 새로운 옵션 구분자로 인식 (예: " / set="는 OK, "M/(L*T)"는 무시)
        if (char === '/' && isParallelSection && i > 0 && input[i-1] === ' ') {
            parallels.push(buffer.trim());
            buffer = "";
            continue;
        }
        buffer += char;
    }

    function pushToCmds() {
        if (isParallelSection) {return;}// 병렬 구역에서는 명령어를 추가하지 않음
        const trimmed = buffer.trim();
        if (trimmed) {
            if (!isMainCmdParsed) { mainCmd = trimmed; isMainCmdParsed = true; }
            else { subCmds.push(trimmed); }
        }
        buffer = "";
    }

    pushToCmds();
    if (isParallelSection) {parallels.push(buffer.trim());}

    return { mainCommand: mainCmd, subCommands: subCmds, parallelOptions: parallels, rawSelection: selection };
}