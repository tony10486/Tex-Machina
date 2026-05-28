import * as assert from 'assert';
import { generateLatexTable, TableOptions } from '../core/tableGenerator';

suite('Table Generator Test Suite', () => {
    test('Generate table with borders and header (2x2)', () => {
        const options: TableOptions = {
            rows: 2,
            cols: 2,
            hasBorders: true,
            hasHeader: true,
            alignment: 'l'
        };
        const result = generateLatexTable(options);
        assert.ok(result.includes('\\begin{tabular}{|l|l|}'));
        assert.ok(result.includes('\\hline'));
        assert.ok(result.includes('Header 1 & Header 2 \\\\'));
        assert.ok(result.includes('\\end{tabular}'));
    });

    test('Alignment check (right)', () => {
        const options: TableOptions = {
            rows: 1,
            cols: 2,
            hasBorders: false,
            hasHeader: false,
            alignment: 'r'
        };
        const result = generateLatexTable(options);
        assert.ok(result.includes('\\begin{tabular}{rr}'));
    });
});
