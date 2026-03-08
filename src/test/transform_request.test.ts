import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('Label Nesting Transformation Test Suite', () => {
    test('Transform definition with label to nested \defn macro', async () => {
        const content = `\\begin{definition}[벡터의 합과 스칼라 곱의 성질]\\label{def:vector1}
    \\begin{itemize}
        \\item 모든 벡터 $\\mathbf{x}$, $\\mathbf{y}$에 대해서 $\\mathbf{x} + \\mathbf{y} = \\mathbf{y} + \\mathbf{x}$이다.
    \\end{itemize}\\footnote{출처 : 프리드버그의 선형대수학}
\\end{definition}`;

        const document = await vscode.workspace.openTextDocument({ language: 'latex', content });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        
        // 쿼리 설명:
        // 1. \begin{definition} 전체를 $all로 잡음
        // 2. matches를 통해 $1(제목), $2(라벨), $3(본문) 추출
        // 3. \defn{제목\label{라벨}}{본문} 형태로 치환
        const query = `; find \\begin{definition} as $all >> \\defn{$1\\label{$2}}{$3} 
            where $all matches /\\\\begin\\{definition\\}\\[(.*?)\\]\\s*\\\\label\\{(.*?)\\}\\s*([\\s\\S]*?)\\\\end\\{definition\\}/`;
        
        await engine.execute(query);

        const text = document.getText();
        console.log("--- 변환 결과 ---\n", text);

        // 검증: 제목과 라벨이 합쳐졌는지 확인
        assert.ok(text.includes('\\defn{벡터의 합과 스칼라 곱의 성질\\label{def:vector1}}'), 'Label should be nested inside the first argument of \\defn');
        assert.ok(text.includes('\\item 모든 벡터'), 'Body content should be preserved');
        assert.ok(!text.includes('\\begin{definition}'), 'Original environment should be gone');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
