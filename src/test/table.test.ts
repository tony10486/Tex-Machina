import * as assert from 'assert';
import { generateLatexTable, TableOptions } from '../core/tableGenerator';

suite('Table Generator Test Suite', () => {
    test('Generate basic table (3x3, no borders, no header)', () => {
        const options: TableOptions = {
            rows: 3,
            cols: 3,
            hasBorders: false,
            hasHeader: false,
            alignment: 'c'
        };
        const result = generateLatexTable(options);
        assert.ok(result.includes('\\begin{tabular}{ccc}'));
        assert.ok(result.includes('Data 1,1 & Data 1,2 & Data 1,3 \\\\'));
        assert.ok(result.includes('Data 3,1 & Data 3,2 & Data 3,3 \\\\'));
        assert.ok(result.includes('\\end{tabular}'));
        assert.ok(!result.includes('\\hline'));
    });

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
        assert.ok(result.includes('Data 2,1 & Data 2,2 \\\\'));
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
