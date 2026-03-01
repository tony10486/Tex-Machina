import * as assert from 'assert';
import * as vscode from 'vscode';
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

    test('MacroManager: context-aware expansion (math vs text)', async () => {
        // Mock globalState
        const mockStorage: Record<string, any> = {};
        const mockContext: any = {
            globalState: {
                get: (key: string, defaultValue: any) => mockStorage[key] || defaultValue,
                update: (key: string, value: any) => { mockStorage[key] = value; return Promise.resolve(); }
            }
        };

        const manager = new MacroManager(mockContext);
        
        // Define macros
        await manager.defineMacro('abc:math', 'math_result');
        await manager.defineMacro('abc:text', 'text_result');
        await manager.defineMacro('abc', 'default_result');

        // Mock Document and Editor
        const createMockEditor = (text: string, pos: number): any => ({
            document: {
                getText: (range?: vscode.Range) => {
                    if (range) {
                        return text.substring(range.start.character, range.end.character);
                    }
                    return text;
                },
                offsetAt: (p: any) => p.character, // Simple offset for testing
                positionAt: (offset: number) => ({ character: offset, line: 0 }),
                lineAt: (line: number) => ({
                    text: text.split('\n')[line] || ""
                })
            },
            selection: {
                active: { character: pos, line: 0 },
                translate: (deltaLine: number) => ({ character: pos, line: deltaLine }) // simplistic
            }
        });

        // 1. Math mode (inside $...$)
        const mathEditor = createMockEditor("$ a + b $", 5);
        assert.strictEqual(manager.expand(";abc", mathEditor), "math_result");

        // 2. Text mode (outside)
        const textEditor = createMockEditor("Hello world", 5);
        assert.strictEqual(manager.expand(";abc", textEditor), "text_result");

        // 3. Various math environments (align, equation, etc.)
        const alignEditor = createMockEditor("\\begin{align}\n a = b \n\\end{align}", 15);
        assert.strictEqual(manager.expand(";abc", alignEditor), "math_result");

        const equationEditor = createMockEditor("\\begin{equation*} x^2 \\end{equation*}", 20);
        assert.strictEqual(manager.expand(";abc", equationEditor), "math_result");

        // 4. Fallback to default if context macro doesn't exist
        await manager.defineMacro('only_default', 'def');
        assert.strictEqual(manager.expand(";only_default", mathEditor), "def");
        assert.strictEqual(manager.expand(";only_default", textEditor), "def");
    });
});
