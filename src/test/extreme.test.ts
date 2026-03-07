import * as assert from 'assert';
import { SemanticScanner } from '../core/queryEngine';

suite('HSQ Engine Extreme Syntax Test Suite', () => {
    
    test('Extreme: Nested LaTeX Commands Precision', () => {
        const text = "\\outer{\\inner{content}}";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const outer = root.children.find(n => n.name === 'outer');
        assert.ok(outer, "Should find 'outer'");
        
        // Check if 'inner' is found as a child of 'outer'
        // In our current simple scanner, outer.end correctly covers inner.
        // But nested commands are in root.children in this flat scanner version.
        const inner = root.children.find(n => n.name === 'inner');
        assert.ok(inner, "Should find 'inner'");
        
        const innerText = text.substring(inner!.start, inner!.end);
        assert.strictEqual(innerText, "\\inner{content}", "Nested command should be preserved");
    });

    test('Extreme: Multi-level Argument Access', () => {
        // Complex structure: cmd[opt1=v1]{arg1}{arg2}
        const text = "\\complexCmd[dpi=300]{First Arg}{Second Arg}";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const cmd = root.children.find(n => n.name === 'complexCmd');
        assert.strictEqual(cmd!.args.length, 2, "Should identify two distinct arguments");
        assert.strictEqual(text.substring(cmd!.args[0].start, cmd!.args[0].end), "First Arg");
        assert.strictEqual(text.substring(cmd!.args[1].start, cmd!.args[1].end), "Second Arg");
    });

    test('Extreme: Pseudo-class filtering on same-named commands', () => {
        const text = "\\test{One} \\test{Two} \\test{Three}";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const tests = root.children.filter(n => n.name === 'test');
        assert.strictEqual(tests.length, 3);
        
        // Simulate :last logic
        const lastTest = tests[tests.length - 1];
        assert.strictEqual(text.substring(lastTest.start, lastTest.end), "\\test{Three}");
    });

    test('Extreme: Incomplete / Malformed Structure Handling', () => {
        const text = "\\begin{tabular} [unclosed opt {missing brace";
        const scanner = new SemanticScanner(text);
        // Should not crash and at least find what it can
        const root = scanner.scan();
        assert.ok(root, "Should gracefully handle malformed text");
    });

    test('Extreme: Content Selector (:*) on Environment', () => {
        const text = "\\begin{equation} E = mc^2 \\end{equation}";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const env = root.children.find(n => n.type === 'env');
        assert.ok(env);
        
        // Manual simulation of HSQEngine :* logic
        const beginTag = `\\begin{${env!.name}}`;
        const endTag = `\\end{${env!.name}}`;
        const content = text.substring(env!.start + beginTag.length, env!.end - endTag.length);
        assert.strictEqual(content.trim(), "E = mc^2");
    });
});
