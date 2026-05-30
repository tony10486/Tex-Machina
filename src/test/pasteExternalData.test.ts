import * as assert from 'assert';
import {
    parseClipboardData,
    smartEscapeCell,
    formatNumber,
    detectColumnAlignment,
    detectHeader,
    generateMatrixLatex,
    generateTabularLatex,
    buildPreview,
} from '../core/pasteExternalData';

suite('pasteExternalData Unit Tests', () => {
    // parseClipboardData uses workspace config for removeEmptyRows.
    // In test env the default (true) should apply.

    suite('parseClipboardData', () => {
        test('basic TSV', () => {
            const result = parseClipboardData('a\tb\tc');
            assert.deepStrictEqual(result, [['a', 'b', 'c']]);
        });

        test('basic CSV with comma', () => {
            const result = parseClipboardData('1,2,3\n4,5,6');
            assert.deepStrictEqual(result, [['1', '2', '3'], ['4', '5', '6']]);
        });

        test('CSV with quoted comma inside', () => {
            const result = parseClipboardData('"He said, hi",2\n3,4');
            assert.deepStrictEqual(result, [['He said, hi', '2'], ['3', '4']]);
        });

        test('irregular rows padded', () => {
            const result = parseClipboardData('a\tb\n1\t2\t3');
            assert.deepStrictEqual(result, [['a', 'b', ''], ['1', '2', '3']]);
        });

        test('removes empty rows by default', () => {
            const result = parseClipboardData('1\t2\n\t\n3\t4');
            assert.deepStrictEqual(result, [['1', '2'], ['3', '4']]);
        });

        test('semicolon delimiter fallback', () => {
            const result = parseClipboardData('a;b;c\n1;2;3');
            assert.deepStrictEqual(result, [['a', 'b', 'c'], ['1', '2', '3']]);
        });

        test('real-world CSV with mixed text and LaTeX command', () => {
            const data = 'Paasdf,asdf,asdf,asdf\n1,24,1,sd\n12312,1242,4,\\sin';
            const result = parseClipboardData(data);
            assert.strictEqual(result.length, 3);
            assert.deepStrictEqual(result[0], ['Paasdf', 'asdf', 'asdf', 'asdf']);
            assert.deepStrictEqual(result[1], ['1', '24', '1', 'sd']);
            assert.deepStrictEqual(result[2], ['12312', '1242', '4', '\\sin']);
        });

        test('CSV with quoted cells containing commas', () => {
            const data = '"He said, hi",2,3\n4,5,6';
            const result = parseClipboardData(data);
            assert.deepStrictEqual(result[0], ['He said, hi', '2', '3']);
            assert.deepStrictEqual(result[1], ['4', '5', '6']);
        });
    });

    suite('smartEscapeCell', () => {
        test('smart mode preserves LaTeX command', () => {
            assert.strictEqual(smartEscapeCell('\\alpha', 'smart'), '\\alpha');
        });

        test('smart mode escapes special chars', () => {
            assert.strictEqual(smartEscapeCell('100%', 'smart'), '100\\%');
            assert.strictEqual(smartEscapeCell('A & B', 'smart'), 'A \\& B');
            assert.strictEqual(smartEscapeCell('$10', 'smart'), '\\$10');
        });

        test('smart mode escapes backslash that is not a command', () => {
            // A single backslash is not a command, it should be escaped
            const result = smartEscapeCell('\\', 'smart');
            assert.strictEqual(result, '\\textbackslash{}');
        });

        test('all mode escapes everything', () => {
            assert.strictEqual(smartEscapeCell('\\alpha', 'all').includes('\\alpha'), false);
            assert.strictEqual(smartEscapeCell('100%', 'all'), '100\\%');
        });

        test('none mode leaves as-is', () => {
            assert.strictEqual(smartEscapeCell('100%', 'none'), '100%');
        });
    });

    suite('formatNumber', () => {
        test('thousand separator comma', () => {
            assert.strictEqual(formatNumber('1,234.56'), '1\\,234.56');
        });

        test('thousand separator does not touch irregular commas', () => {
            assert.strictEqual(formatNumber('1,2,3'), '1,2,3');
        });

        test('scientific notation E+', () => {
            assert.strictEqual(formatNumber('1.23E+05'), '1.23 \\times 10^{5}');
        });

        test('scientific notation e lowercase', () => {
            assert.strictEqual(formatNumber('1.23e-5'), '1.23 \\times 10^{-5}');
        });

        test('mixed text not affected', () => {
            assert.strictEqual(formatNumber('abc'), 'abc');
        });
    });

    suite('detectColumnAlignment', () => {
        test('numeric column -> r', () => {
            const rows = [['1', '2'], ['3', '4']];
            assert.deepStrictEqual(detectColumnAlignment(rows), ['r', 'r']);
        });

        test('text column -> l', () => {
            const rows = [['Name', 'City'], ['Alice', 'Seoul']];
            assert.deepStrictEqual(detectColumnAlignment(rows), ['l', 'l']);
        });

        test('mixed column -> c', () => {
            const rows = [['1', 'A'], ['2', 'B']];
            assert.deepStrictEqual(detectColumnAlignment(rows), ['r', 'l']);
        });
    });

    suite('detectHeader', () => {
        test('first row text, rest numeric -> true', () => {
            const rows = [['Name', 'Value'], ['Alice', '100'], ['Bob', '200']];
            assert.strictEqual(detectHeader(rows), true);
        });

        test('all numeric -> false', () => {
            const rows = [['1', '2'], ['3', '4']];
            assert.strictEqual(detectHeader(rows), false);
        });

        test('single row -> false', () => {
            const rows = [['A', 'B']];
            assert.strictEqual(detectHeader(rows), false);
        });
    });

    suite('generateMatrixLatex', () => {
        test('basic bmatrix', () => {
            const rows = [['1', '2'], ['3', '4']];
            const latex = generateMatrixLatex(rows, 'bmatrix', '  ', 'smart');
            assert.ok(latex.includes('\\begin{bmatrix}'));
            assert.ok(latex.includes('1 & 2'));
            assert.ok(latex.includes('3 & 4'));
            assert.ok(latex.includes('\\end{bmatrix}'));
            assert.ok(latex.includes('\\\\'));
        });
    });

    suite('generateTabularLatex', () => {
        test('array style with borders', () => {
            const rows = [['A', 'B'], ['1', '2']];
            const latex = generateTabularLatex(rows, ['l', 'r'], 'array', true, false, '  ', 'smart');
            assert.ok(latex.includes('\\begin{tabular}{|l|r|}'));
            assert.ok(latex.includes('\\hline'));
            assert.ok(latex.includes('A & B'));
            assert.ok(latex.includes('1 & 2'));
        });

        test('booktabs style', () => {
            const rows = [['A', 'B'], ['1', '2']];
            const latex = generateTabularLatex(rows, ['l', 'r'], 'booktabs', false, false, '  ', 'smart');
            assert.ok(latex.includes('\\toprule'));
            assert.ok(latex.includes('\\bottomrule'));
            assert.ok(!latex.includes('\\hline'));
            assert.ok(!latex.includes('|'));
        });

        test('header detection in array style', () => {
            const rows = [['Name', 'Val'], ['Alice', '100']];
            const latex = generateTabularLatex(rows, ['l', 'r'], 'array', true, true, '  ', 'smart');
            assert.ok(latex.includes('Name & Val'));
            assert.ok(latex.includes('Alice & 100'));
            assert.ok(latex.includes('\\hline'));
        });
    });

    suite('buildPreview', () => {
        test('shows all rows when <= maxRows', () => {
            const rows = [['a', 'b'], ['c', 'd']];
            const preview = buildPreview(rows, 3);
            assert.ok(preview.includes('a | b'));
            assert.ok(preview.includes('c | d'));
            assert.ok(!preview.includes('more rows'));
        });

        test('truncates after maxRows', () => {
            const rows = [['1'], ['2'], ['3'], ['4']];
            const preview = buildPreview(rows, 3);
            assert.ok(preview.includes('1'));
            assert.ok(preview.includes('(1 more rows)'));
        });
    });
});
