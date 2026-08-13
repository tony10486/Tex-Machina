import * as vscode from 'vscode';
import * as assert from 'assert';
import { getSelectionRangesAt } from '../core/selectionExpansion';

suite('Selection Expansion Test Suite', () => {
    test('Selection Expansion logic - Granular', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'latex',
            content: '\\begin{gather}\n    (f+g)(x) = f(x) + g(x)\n\\end{gather}'
        });

        // Position at 'x' in (f+g)(x)
        // \begin{gather}\n    (f+g)(x
        // 012345678901234 56789012345
        // \begin{gather} is index 0-14
        // \n is 14
        // '    ' is 15-19
        // '(f+g)(' is 19-24
        // 'x' is 24
        const pos = new vscode.Position(1, 10); // index 25 is after 'x'
        const ranges = getSelectionRangesAt(doc, pos);

        const rangeTexts = ranges.map(r => doc.getText(r));

        // Expected (at least):
        // 1. x
        // 2. (x)
        // 3. (f+g)(x)  <-- This is what the user says is missing
        // 4. (f+g)(x) = f(x) + g(x)
        // 5. ...
        
        assert.ok(rangeTexts.includes('x'), "Should include 'x'");
        assert.ok(rangeTexts.includes('(x)'), "Should include '(x)'");
        assert.ok(rangeTexts.includes('(f+g)(x)'), "Should include '(f+g)(x)'");
        assert.ok(rangeTexts.includes('(f+g)(x) = f(x) + g(x)'), "Should include the full line content");
    });
});
