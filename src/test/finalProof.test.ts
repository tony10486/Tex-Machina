import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('Final Proof Test Suite', () => {
    test('PROVE: Transform definition with label using HSQ', async () => {
        const content = `\\begin{definition}[벡터의 합과 스칼라 곱의 성질]\\label{def:vector1}
    \\begin{itemize}
        \\item 모든 벡터 $\\mathbf{x}$, $\\mathbf{y}$에 대해서 $\\mathbf{x} + \\mathbf{y} = \\mathbf{y} + \\mathbf{x}$이다.
    \\end{itemize}
\\end{definition}`;

        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);
        const engine = new HSQEngine(editor);

        // 정규표현식 이스케이프를 고려한 최종 쿼리
        // (TS 문자열이므로 \\를 4개 사용하여 실제 엔진에 \\로 전달)
        const finalQuery = `; \\begin{definition} where $$ matches /\\\\label\\{(.*?)\\}\\s*([\\s\\S]*)/ >> \\defn{#0\\label{$1}}{$2}`;
        
        await engine.execute(finalQuery);
        
        // WorkspaceEdit 적용을 위해 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 500));

        const text = document.getText();
        console.log("--- TEST RESULT ---\n", text);

        assert.ok(text.includes('\\defn{벡터의 합과 스칼라 곱의 성질\\label{def:vector1}}'), 'Result should have nested label');
        assert.ok(text.includes('\\item 모든 벡터'), 'Body should be preserved');
        assert.ok(!text.includes('\\begin{definition}'), 'Old env should be gone');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
