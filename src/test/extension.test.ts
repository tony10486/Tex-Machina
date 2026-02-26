import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseUserCommand } from '../core/commandParser';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

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
});
