import * as assert from 'assert';
import { parseUserCommand } from '../core/commandParser';

suite('Command Parser Test Suite', () => {
	test('Command Parser: Basic diff command', () => {
        const input = "diff > x";
        const selection = "x^2 + y";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "diff");
        assert.deepStrictEqual(result.subCommands, ["x"]);
        assert.strictEqual(result.rawSelection, selection);
	});

    test('Command Parser: Command with parallel options', () => {
        const input = "taylor > x, 5 / newline / step=2";
        const selection = "sin(x)";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "taylor");
        assert.deepStrictEqual(result.subCommands, ["x, 5"]);
        assert.deepStrictEqual(result.parallelOptions, ["newline", "step=2"]);
    });

    test('Command Parser: Multiple subcommands', () => {
        const input = "solve > x > real";
        const selection = "x^2 - 1 = 0";
        const result = parseUserCommand(input, selection);
        
        assert.strictEqual(result.mainCommand, "solve");
        assert.deepStrictEqual(result.subCommands, ["x", "real"]);
    });

    test('Command Parser: Tricky edge cases', () => {
        const input1 = "  solve  >  x  >  real  /  newline  /  step=3  ";
        const res1 = parseUserCommand(input1, "x^2-1=0");
        assert.strictEqual(res1.mainCommand, "solve");
        assert.deepStrictEqual(res1.subCommands, ["x", "real"]);
        assert.deepStrictEqual(res1.parallelOptions, ["newline", "step=3"]);

        const input2 = "solve>>>x";
        const res2 = parseUserCommand(input2, "x=0");
        assert.strictEqual(res2.mainCommand, "solve");
    });
});
