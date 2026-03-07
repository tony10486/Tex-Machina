import * as assert from 'assert';
import * as vscode from 'vscode';
import { HSQEngine } from '../core/queryEngine';

suite('Query Engine Filter Test Suite', () => {
    test('Filter: without caption', async () => {
        const docText = `
\\begin{figure}
    \\includegraphics[width=0.5]{fig1}
    \\caption{Fig 1}
\\end{figure}
\\begin{figure}
    \\includegraphics[width=0.8]{fig2}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ content: docText, language: 'latex' });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // 캡션이 없는 피겨만 골라 뒤에 텍스트 추가
        await engine.execute('; @fig without caption +> "\\n% NO CAPTION"');

        const resultText = document.getText();
        assert.ok(resultText.includes('% NO CAPTION'), "Should contain the added comment");
        
        // 캡션이 있는 피겨(fig1)는 변하지 않아야 함
        const fig1Section = resultText.substring(0, resultText.indexOf('fig2'));
        assert.ok(!fig1Section.includes('% NO CAPTION'), "Figure with caption should not be modified");
    });

    test('Filter: where #w > 0.6', async () => {
        const docText = `
\\includegraphics[width=0.3]{small}
\\includegraphics[width=0.9]{large}
`;
        const document = await vscode.workspace.openTextDocument({ content: docText, language: 'latex' });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // 너비가 0.6보다 큰 이미지만 골라 속성 수정
        await engine.execute('; @img where #w > 0.6 >> #w := 1.0');

        const resultText = document.getText();
        assert.ok(resultText.includes('width=1.0]{large}'), "Large image width should be updated to 1.0");
        assert.ok(resultText.includes('width=0.3]{small}'), "Small image width should remain 0.3");
    });

    test('Filter: complex logical (has caption and #w < 0.5)', async () => {
        const docText = `
\\begin{figure}
    \\includegraphics[width=0.2]{small_with_cap}
    \\caption{Small}
\\end{figure}
\\begin{figure}
    \\includegraphics[width=0.8]{large_with_cap}
    \\caption{Large}
\\end{figure}
`;
        const document = await vscode.workspace.openTextDocument({ content: docText, language: 'latex' });
        const editor = await vscode.window.showTextDocument(document);

        const engine = new HSQEngine(editor);
        // 캡션이 있고 너비가 0.5보다 작은 피겨만 골라 태그 추가
        await engine.execute('; @fig has caption and #w < 0.5 +> "\\n% MATCH"');

        const resultText = document.getText();
        assert.ok(resultText.includes('small_with_cap'), "Should contain small image");
        const smallFigMatch = resultText.includes('small_with_cap') && resultText.includes('% MATCH');
        assert.ok(smallFigMatch, "Small figure should match");
        
        const largeFigPart = resultText.substring(resultText.indexOf('large_with_cap'));
        assert.ok(!largeFigPart.includes('% MATCH'), "Large figure should not match");
    });
});
