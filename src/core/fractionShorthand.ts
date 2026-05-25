import * as vscode from 'vscode';
import { findMathAtPos } from './mathSplitter';

export function registerFractionShorthand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const config = vscode.workspace.getConfiguration('tex-machina');
            const isEnabled = config.get('fractionShorthand.enabled', true);
            if (!isEnabled) return;

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) return;
            if (editor.document.languageId !== 'latex') return;

            for (const change of event.contentChanges) {
                if (change.text !== ' ') continue;

                const line = change.range.start.line;
                const charOffsetAfter = change.range.start.character + 1;
                const lineText = editor.document.lineAt(line).text;
                const textBeforeSpace = lineText.substring(0, charOffsetAfter);

                // 이미 수식 모드라면 건너뜀
                if (findMathAtPos(editor.document, change.range.start)) continue;

                // 1. 단순 숫자: (\d+)/(\d+) -> \frac{1}{2}
                // 2. 괄호 포함: \(([^)]+)\)/([^ ]+) -> \frac{a+b}{c}
                // 3. 변수/기호: ([a-zA-Z0-9]+)/([a-zA-Z0-9]+) -> \frac{x}{y}
                
                // (분자)/(분모) 형태 찾기.
                // 괄호, 백슬래시, 숫자, 문자, 기호 등을 포괄하도록 정규식 완화
                const fracRegex = /((?:\((?:[^()]|(?:\([^()]*\)))*\)|[a-zA-Z0-9\\]+))\/\s*([a-zA-Z0-9\\]+)\s$/;
                const match = textBeforeSpace.match(fracRegex);

                if (match) {
                    const fullMatch = match[0];
                    let numerator = match[1];
                    const denominator = match[2];

                    // 괄호로 감싸진 경우 괄호 제거
                    if (numerator.startsWith('(') && numerator.endsWith(')')) {
                        numerator = numerator.substring(1, numerator.length - 1);
                    }

                    const replacement = `\\frac{${numerator}}{${denominator}}`;
                    const startPos = charOffsetAfter - fullMatch.length;

                    await editor.edit(editBuilder => {
                        editBuilder.replace(
                            new vscode.Range(new vscode.Position(line, startPos), new vscode.Position(line, charOffsetAfter)),
                            replacement + ' '
                        );
                    }, { undoStopBefore: false, undoStopAfter: false });
                }
            }
        })
    );
}
