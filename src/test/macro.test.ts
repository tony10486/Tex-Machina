import * as assert from 'assert';
import { splitChain } from '../core/commandParser';
import { MacroManager } from '../core/macroManager';

suite('Macro and Chaining Test Suite', () => {
    test('MacroManager: parseDefinition basics', () => {
        // vscode.ExtensionContext는 null로 처리 (로직만 테스트)
        const manager = new MacroManager(null as any);
        
        const input1 = "define:calc > diff && plot > 2d>:diffplot";
        const res1 = manager.parseDefinition(input1);
        assert.ok(res1);
        assert.strictEqual(res1!.chain, "calc > diff && plot > 2d");
        assert.strictEqual(res1!.name, "diffplot");

        const input2 = "> define:matrix > p > 2x2>:mat2x2";
        const res2 = manager.parseDefinition(input2);
        assert.ok(res2);
        assert.strictEqual(res2!.chain, "matrix > p > 2x2");
        assert.strictEqual(res2!.name, "mat2x2");
    });

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
