import * as assert from 'assert';
import { splitMathString } from '../core/mathSplitter';

suite('Math Splitter Test Suite', () => {
    test('Math Splitter: Basic splitting at equal signs', () => {
        const input = "$a = b + c + d = e$";
        const expected = "\\begin{align}\n    a &= b + c + d \\\\\n    &= e\n\\end{align}";
        const result = splitMathString(input);
        assert.strictEqual(result, expected);
    });

    test('Math Splitter: Split at plus and minus', () => {
        const input = "$a + b - c = d$";
        const res2 = splitMathString(input, true);
        assert.ok(res2.includes("&+"));
        assert.ok(res2.includes("&-"));
        assert.ok(res2.includes("&="));
    });
});
