import * as assert from 'assert';
import { splitMathString } from '../core/mathSplitter';

suite('Math Splitter Test Suite', () => {
    test('Math Splitter: Basic splitting at equal signs', () => {
        const input = "$a = b + c + d = e$";
        const expected = "\\begin{align}\n    a &= b + c + d \\\\\n    &= e\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: Respect nesting with equal signs', () => {
        const input = "$$f(x) = \\sum_{i=0}^{n} a_i x^i = 0$$";
        const expected = "\\begin{align}\n    f(x) &= \\sum_{i=0}^{n} a_i x^i \\\\\n    &= 0\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: No operators at top level', () => {
        const input = "$a + b$";
        const result = splitMathString(input);
        assert.strictEqual(result, input);
    });

    test('Math Splitter: Handle display math \\[ \]', () => {
        const input = "\\[x = y = z\\]";
        const expected = "\\begin{align}\n    x &= y \\\\\n    &= z\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: Split at plus and minus', () => {
        const input = "$a + b - c = d$";
        const res1 = splitMathString(input, false);
        assert.ok(res1.includes("a + b - c &="));

        const res2 = splitMathString(input, true);
        assert.ok(res2.includes("&+"));
        assert.ok(res2.includes("&-"));
        assert.ok(res2.includes("&="));
        assert.ok(res2.includes("a &+"));
        assert.ok(res2.includes("b \\\\"));
        assert.ok(res2.includes("c \\\\"));
    });

    test('Math Splitter: Handle raw text without delimiters', () => {
        const input = "y''' + y'' + y' + 12 = 0 =";
        const result = splitMathString(input);
        assert.ok(result.startsWith("\\begin{align}"));
        assert.ok(result.includes("y''' + y'' + y' + 12 &= 0 ="));
        assert.ok(result.endsWith("\\end{align}"));
    });

    test('Math Splitter: Extremely complex nesting', () => {
        const input = "$$f(x) = \\begin{cases} a=b & x=0 \\\\ c=d & x>0 \\end{cases} = 1$$";
        const result = splitMathString(input);
        assert.ok(result.includes("f(x) &="));
        assert.ok(result.includes("&= 1"));
        const casesPart = result.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/)?.[1];
        assert.ok(casesPart && !casesPart.includes("&="));
    });
});
