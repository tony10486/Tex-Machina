import * as assert from 'assert';
import { getJumpPoints } from '../core/nodeNavigation';

suite('Formula Node Navigation Test Suite', () => {
    test('getJumpPoints for simple fraction should jump to slots', () => {
        const text = '\\frac{a}{b}';
        // \ 0, f 1, r 2, a 3, c 4, { 5, a 6, } 7, { 8, b 9, } 10
        // Slots: inside first { (6), inside second { (9)
        // Also 0 and end 11
        const points = getJumpPoints(text);
        // [0, 6, 9, 11]
        assert.deepStrictEqual(points, [0, 6, 9, 11]);
    });

    test('getJumpPoints for complex math block', () => {
        const text = '$\\frac{a}{b} \\int_{min}^{max}$';
        const points = getJumpPoints(text);
        
        // $ (0) -> content start (1)
        // \frac{ (1-6) -> slot (7)
        // }{ (7-9) -> slot (10)
        // } (10-11) -> (space)
        // \int_ (12-17)
        // { (18) -> slot (19)
        // }^{ (19-24) -> slot (25)
        // } (25-26) -> content end (28)
        
        assert.ok(points.includes(7), 'Should jump inside frac numerator');
        assert.ok(points.includes(10), 'Should jump inside frac denominator');
        assert.ok(!points.includes(18), 'Should NOT stop before subscript brace');
        assert.ok(points.includes(19), 'Should jump inside integral lower bound');
        assert.ok(!points.includes(24), 'Should NOT stop before superscript brace');
        assert.ok(points.includes(25), 'Should jump inside integral upper bound');
    });

    test('getJumpPoints for operators', () => {
        const text = 'x + y = z';
        const points = getJumpPoints(text);
        // x(0), space(1), +(2), space(3), y(4), space(5), =(6), space(7), z(8)
        // With space-skipping:
        // + is at 2. endPos starts at 3, but there is space at 3, so endPos becomes 4.
        // = is at 6. endPos starts at 7, but there is space at 7, so endPos becomes 8.
        assert.ok(points.includes(2), 'Should include start of +');
        assert.ok(points.includes(4), 'Should include start of y (after + space)');
        assert.ok(points.includes(6), 'Should include start of =');
        assert.ok(points.includes(8), 'Should include start of z (after = space)');
    });

    test('getJumpPoints for user reported string', () => {
        const text = '$\\frac{}{} \\int_{min}^{max} \\sum_{min}^{max} \\prod_{min}^{max}$';
        const points = getJumpPoints(text);
        
        // $ (0) -> content start (1)
        // \frac (1)
        // { (6) -> slot (7)
        // } (7)
        // { (8) -> slot (9)
        // } (9)
        // (space) (10)
        // \int (11)
        // _ (15)
        // { (16) -> slot (17)
        
        // The user says it lands at \frac 여기 {}
        // \ f r a c {
        // 0 1 2 3 4 5 6
        // Index 6 is right before the first brace content.
        
        assert.ok(!points.includes(6), 'Should NOT land before the first brace of frac');
        assert.ok(points.includes(7), 'Should land inside the first brace of frac');
    });
});
