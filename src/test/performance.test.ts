import * as assert from 'assert';
import { SemanticScanner } from '../core/queryEngine';

suite('HSQ Engine Performance & Optimization Suite', () => {
    
    test('Performance: 10,000 lines should be scanned under 100ms', () => {
        const lines = 10000;
        const text = "\\section{Start}\n" + Array(lines).fill("This is a line with \\keyword{val} and some text.").join("\n") + "\n\\section{End}";
        
        const startTime = Date.now();
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        const endTime = Date.now();
        
        const duration = endTime - startTime;
        console.log(`      🚀 10,000 lines scanned in: ${duration}ms`);
        
        // Target: under 100ms (Previous Python was ~6600ms)
        assert.ok(duration < 100, `Optimization Failed: Took ${duration}ms, should be < 100ms`);
        assert.ok(root.children.length > 10000, "Should have correctly identified nodes");
    });

    test('Precision: Semantic identification of nested properties', () => {
        const text = "\\includegraphics[width=0.5, scale=1.2]{fig.png}";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const img = root.children.find(n => n.name === 'includegraphics');
        assert.ok(img, "Should find includegraphics node");
        
        const opt = img!.children.find(c => c.type === 'opt');
        assert.ok(opt, "Should find options node");
        
        const widthProp = opt!.children.find(c => c.name === 'width');
        assert.ok(widthProp, "Should identify 'width' as a property");
        
        const valNode = widthProp!.children[0];
        assert.strictEqual(text.substring(valNode.start, valNode.end), "0.5", "Property value should be correct");
    });

    test('Safety: Plain text exclusion near commands', () => {
        const text = "Word \\command{arg} Another";
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        
        const textNodes = root.children.filter(n => n.type === 'text');
        const cmdNodes = root.children.filter(n => n.type === 'cmd');
        
        assert.strictEqual(cmdNodes.length, 1);
        // 'command' should NOT be in textNodes
        const hasOverlap = textNodes.some(tn => text.substring(tn.start, tn.end) === 'command');
        assert.strictEqual(hasOverlap, false, "Command names should not be misidentified as plain text");
    });
});
