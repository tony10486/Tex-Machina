import * as assert from 'assert';
import { getJumpPoints } from '../core/nodeNavigation';

suite('Formula Node Navigation Test Suite', () => {
    test('getJumpPoints for simple fraction should jump to slots', () => {
        const text = '\\frac{a}{b}';
        const points = getJumpPoints(text);
        assert.deepStrictEqual(points, [0, 6, 9, 11]);
    });

    test('getJumpPoints for complex math block', () => {
        const text = '$\\frac{a}{b} \\int_{min}^{max}$';
        const points = getJumpPoints(text);
        assert.ok(points.includes(7), 'Should jump inside frac numerator');
        assert.ok(points.includes(10), 'Should jump inside frac denominator');
        assert.ok(points.includes(19), 'Should jump inside integral lower bound');
        assert.ok(points.includes(25), 'Should jump inside integral upper bound');
    });
});
