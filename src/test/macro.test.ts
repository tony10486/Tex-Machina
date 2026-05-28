import * as assert from 'assert';
import * as vscode from 'vscode';
import { splitChain } from '../core/commandParser';
import { MacroManager } from '../core/macroManager';

suite('Macro and Chaining Test Suite', () => {
    test('MacroManager: parseDefinition basics', () => {
        const manager = new MacroManager(null as any);
        const input1 = "define:calc > diff && plot > 2d>:diffplot";
        const res1 = manager.parseDefinition(input1);
        assert.ok(res1);
        assert.strictEqual(res1!.chain, "calc > diff && plot > 2d");
        assert.strictEqual(res1!.name, "diffplot");
    });

    test('Command Parser: splitChain basics', () => {
        const input = "calc > diff && plot > 2d";
        const parts = splitChain(input);
        assert.deepStrictEqual(parts, ["calc > diff", "plot > 2d"]);
    });

    test('MacroManager: context-aware expansion (math vs text)', async () => {
        const mockStorage: Record<string, any> = {};
        const mockContext: any = {
            globalState: {
                get: (key: string, defaultValue: any) => mockStorage[key] || defaultValue,
                update: (key: string, value: any) => { mockStorage[key] = value; return Promise.resolve(); }
            }
        };

        const manager = new MacroManager(mockContext);
        await manager.defineMacro('abc:math', 'math_result');
        await manager.defineMacro('abc:text', 'text_result');

        const createMockEditor = (text: string, pos: number): any => {
            return {
                document: {
                    getText: (range?: vscode.Range) => text,
                    offsetAt: (p: any) => pos,
                    positionAt: (offset: number) => ({ line: 0, character: offset }),
                    lineAt: (line: number) => ({ text: text }),
                    lineCount: 1
                },
                selection: { active: { line: 0, character: pos } }
            };
        };

        assert.strictEqual(manager.expand(";abc", createMockEditor("$ abc $", 2)), "math_result");
        assert.strictEqual(manager.expand(";abc", createMockEditor("abc", 1)), "text_result");
    });
});
