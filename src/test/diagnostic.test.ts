import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('HSQ Engine Diagnostic Test', () => {
    test('Diagnostic: Why does the definition query fail?', async () => {
        const content = `\\begin{definition}[벡터의 합과 스칼라 곱의 성질]\\label{def:vector1}
    \\begin{itemize}
        \\item 모든 벡터 $\\mathbf{x}$, $\\mathbf{y}$에 대해서 $\\mathbf{x} + \\mathbf{y} = \\mathbf{y} + \\mathbf{x}$이다.
        \\item 모든 벡터 $\\mathbf{x, y, z}$에 대해서 $(\\mathbf{x} + \\mathbf{y}) + \\mathbf{z} = \\mathbf{x} + (\\mathbf{y} + \\mathbf{z})$이다. 
    \\end{itemize}\\footnote{출처 : 프리드버그의 선형대수학}
\\end{definition}`;

        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        const engine = new HSQEngine(editor);

        // 사용자가 입력한 쿼리 (이스케이프 주의)
        const userQuery = `; \\begin{definition} >> \\defn{#0\\label{$1}}{$2} where $$ matches /\\\\label\\{(.*?)\\}\\s*([\\s\\S]*)/`;
        
        console.log("실행 쿼리:", userQuery);
        const success = await engine.execute(userQuery);
        
        const finalResult = document.getText();
        console.log("--- 최종 결과 ---");
        console.log(finalResult);

        if (!success || finalResult === content) {
            console.error("❌ 변환 실패: 대상이 매칭되지 않았거나 변경되지 않았습니다.");
        } else {
            console.log("✅ 변환 성공!");
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
