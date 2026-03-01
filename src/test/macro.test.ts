import * as assert from 'assert';
import { splitChain } from '../core/commandParser';
// Mocking vscode is hard in standalone tests, but let's test splitChain which is pure.

suite('Macro and Chaining Test Suite', () => {
    test('Command Parser: splitChain basics', () => {
        const input = "calc > diff && plot > 2d";
        const parts = splitChain(input);
        assert.deepStrictEqual(parts, ["calc > diff", "plot > 2d"]);
    });

    test('Command Parser: splitChain with escaped &&', () => {
        const input = "cmd1 \\&& cmd2 && cmd3";
        const parts = splitChain(input);
        assert.deepStrictEqual(parts, ["cmd1 \\&& cmd2", "cmd3"]);
    });

    test('Command Parser: splitChain with extra spaces', () => {
        const input = "  calc > diff   &&   plot > 2d  ";
        const parts = splitChain(input);
        assert.deepStrictEqual(parts, ["calc > diff", "plot > 2d"]);
    });

    test('Command Parser: splitChain with single command', () => {
        const input = "calc > diff";
        const parts = splitChain(input);
        assert.deepStrictEqual(parts, ["calc > diff"]);
    });

    test('Command Parser: splitChain with custom delimiter //', () => {
        const input = "calc > diff // plot > 2d";
        const parts = splitChain(input, "//");
        assert.deepStrictEqual(parts, ["calc > diff", "plot > 2d"]);
    });

    test('Command Parser: splitChain with custom delimiter |', () => {
        const input = "calc > diff | plot > 2d";
        const parts = splitChain(input, "|");
        assert.deepStrictEqual(parts, ["calc > diff", "plot > 2d"]);
    });
});
