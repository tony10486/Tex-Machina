import * as assert from 'assert';
import {
    BUILTIN_SNIPPETS,
    validateSnippet,
    normalizeSnippet,
    SNIPPET_STORAGE_KEY
} from '../core/snippetTypes';
import type { SnippetDefinition } from '../core/snippetTypes';
import {
    snippetMatches,
    findMatchingSnippet,
    parseTrigger,
    evaluateJsScript,
    resolveSnippetBody
} from '../core/snippetCore';
import type { SnippetContext } from '../core/snippetCore';

suite('Snippet Types Test Suite', () => {
    test('SNIPPET_STORAGE_KEY has the documented value', () => {
        assert.strictEqual(SNIPPET_STORAGE_KEY, 'tex-machina.snippets');
    });

    suite('BUILTIN_SNIPPETS', () => {
        test('has at least 8 entries that all pass validation with unique names', () => {
            assert.ok(BUILTIN_SNIPPETS.length >= 8);
            for (const snippet of BUILTIN_SNIPPETS) {
                const result = validateSnippet(snippet);
                assert.strictEqual(result.ok, true, `builtin '${snippet.name}' should be valid`);
            }
            const names = BUILTIN_SNIPPETS.map(s => s.name);
            assert.strictEqual(new Set(names).size, names.length, 'builtin names should be unique');
        });

        test('frac/align/cases/textbf have the documented bodies', () => {
            const byName = new Map(BUILTIN_SNIPPETS.map(s => [s.name, s]));
            assert.strictEqual(byName.get('frac')!.body, '\\frac{$1}{$2}$0');
            assert.strictEqual(byName.get('align')!.body, '\\begin{align}\n\t$1\n\\end{align}$0');
            assert.strictEqual(byName.get('cases')!.body, '\\begin{cases}\n\t$1\n\\end{cases}$0');
            assert.strictEqual(byName.get('textbf')!.body, '\\textbf{$TM_SELECTED_TEXT}$0');
        });
    });

    suite('validateSnippet', () => {
        test('accepts a valid full snippet', () => {
            const valid: unknown = {
                name: 'my_snip',
                description: '설명',
                prefix: ['my'],
                body: '\\alpha',
                scope: 'math',
                envs: ['equation'],
                contextRegex: 'sum',
                contextScope: 'line',
                script: { type: 'js', code: 'return "x"' },
                autoInsertEnv: false,
                enabled: true
            };
            const result = validateSnippet(valid);
            assert.strictEqual(result.ok, true);
        });

        test('rejects a missing name', () => {
            assert.strictEqual(validateSnippet({ body: 'x' }).ok, false);
        });

        test('rejects invalid name characters', () => {
            assert.strictEqual(validateSnippet({ name: 'my snippet', body: 'x' }).ok, false);
            assert.strictEqual(validateSnippet({ name: 'frac/1', body: 'x' }).ok, false);
        });

        test('rejects a missing or empty body', () => {
            assert.strictEqual(validateSnippet({ name: 'ok' }).ok, false);
            assert.strictEqual(validateSnippet({ name: 'ok', body: '' }).ok, false);
        });

        test('rejects a bad scope', () => {
            assert.strictEqual(validateSnippet({ name: 'ok', body: 'x', scope: 'foo' }).ok, false);
        });

        test('rejects a bad contextScope', () => {
            assert.strictEqual(validateSnippet({ name: 'ok', body: 'x', contextScope: 'foo' }).ok, false);
        });

        test('rejects an invalid contextRegex', () => {
            assert.strictEqual(validateSnippet({ name: 'ok', body: 'x', contextRegex: '[' }).ok, false);
        });

        test('rejects a bad script type', () => {
            assert.strictEqual(validateSnippet({ name: 'ok', body: 'x', script: { type: 'ruby', code: 'x' } }).ok, false);
        });

        test('rejects null, undefined and non-object input', () => {
            assert.strictEqual(validateSnippet(null).ok, false);
            assert.strictEqual(validateSnippet(undefined).ok, false);
            assert.strictEqual(validateSnippet('not an object').ok, false);
        });
    });

    suite('normalizeSnippet', () => {
        test('fills defaults for missing fields', () => {
            const out = normalizeSnippet({ name: 'n', body: 'b' });
            assert.strictEqual(out.scope, 'any');
            assert.strictEqual(out.contextScope, 'line');
            assert.strictEqual(out.enabled, true);
            assert.deepStrictEqual(out.envs, []);
            assert.deepStrictEqual(out.prefix, []);
            assert.strictEqual(out.autoInsertEnv, false);
        });

        test('keeps name and body', () => {
            const out = normalizeSnippet({ name: 'keep', body: '\\frac{$1}{$2}$0' });
            assert.strictEqual(out.name, 'keep');
            assert.strictEqual(out.body, '\\frac{$1}{$2}$0');
        });

        test('keeps provided values', () => {
            const out = normalizeSnippet({
                name: 'n',
                body: 'b',
                description: 'd',
                prefix: ['p'],
                scope: 'text',
                envs: ['align'],
                contextRegex: 'sum',
                contextScope: 'around',
                autoInsertEnv: true,
                enabled: false
            });
            assert.strictEqual(out.description, 'd');
            assert.deepStrictEqual(out.prefix, ['p']);
            assert.strictEqual(out.scope, 'text');
            assert.deepStrictEqual(out.envs, ['align']);
            assert.strictEqual(out.contextRegex, 'sum');
            assert.strictEqual(out.contextScope, 'around');
            assert.strictEqual(out.autoInsertEnv, true);
            assert.strictEqual(out.enabled, false);
        });

        test('does not mutate the input object', () => {
            const minimal: SnippetDefinition = { name: 'n', body: 'b' };
            normalizeSnippet(minimal);
            assert.deepStrictEqual(minimal, { name: 'n', body: 'b' });

            const full: SnippetDefinition = {
                name: 'n2',
                body: 'b2',
                description: 'd',
                prefix: ['p'],
                scope: 'math',
                envs: ['eq'],
                contextRegex: 'sum',
                contextScope: 'around',
                autoInsertEnv: true,
                enabled: false
            };
            const snapshot: SnippetDefinition = JSON.parse(JSON.stringify(full));
            normalizeSnippet(full);
            assert.deepStrictEqual(full, snapshot);
        });
    });
});

suite('Snippet Core Test Suite', () => {
    function mkCtx(overrides: Partial<SnippetContext> = {}): SnippetContext {
        return {
            isMath: true,
            envName: 'equation',
            lineText: '',
            aroundText: '',
            position: { line: 0, character: 0 },
            documentText: '',
            languageId: 'latex',
            ...overrides
        };
    }

    suite('snippetMatches', () => {
        test('disabled snippets never match', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', enabled: false }, mkCtx()), false);
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', enabled: false, scope: 'any' }, mkCtx()), false);
        });

        test('scope math requires a math context', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', scope: 'math' }, mkCtx({ isMath: false })), false);
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', scope: 'math' }, mkCtx({ isMath: true })), true);
        });

        test('scope text requires a text context', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', scope: 'text' }, mkCtx({ isMath: true })), false);
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', scope: 'text' }, mkCtx({ isMath: false })), true);
        });

        test('scope any always matches when no other constraints are set', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', scope: 'any' }, mkCtx()), true);
            assert.strictEqual(
                snippetMatches({ name: 'x', body: 'x', scope: 'any' }, mkCtx({ isMath: false, envName: null, languageId: 'plaintext' })),
                true
            );
        });

        test('envs restrict matching to the listed environments', () => {
            const s: SnippetDefinition = { name: 'x', body: 'x', envs: ['align'] };
            assert.strictEqual(snippetMatches(s, mkCtx({ envName: 'equation' })), false);
            assert.strictEqual(snippetMatches(s, mkCtx({ envName: 'align' })), true);
        });

        test('an empty envs array passes the environment check', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', envs: [] }, mkCtx()), true);
        });

        test('contextRegex matches against lineText', () => {
            const s: SnippetDefinition = { name: 'x', body: 'x', contextRegex: '^\\\\frac' };
            assert.strictEqual(snippetMatches(s, mkCtx({ lineText: '\\frac{a}{b}' })), true);
            assert.strictEqual(snippetMatches(s, mkCtx({ lineText: 'x+y' })), false);
        });

        test('contextScope around tests aroundText instead of lineText', () => {
            const s: SnippetDefinition = { name: 'x', body: 'x', contextRegex: 'sum', contextScope: 'around' };
            assert.strictEqual(snippetMatches(s, mkCtx({ lineText: 'no match here', aroundText: 'a sum of things' })), true);
            assert.strictEqual(snippetMatches(s, mkCtx({ lineText: 'sum here', aroundText: 'nothing' })), false);
        });

        test('an invalid contextRegex returns false without throwing', () => {
            assert.strictEqual(snippetMatches({ name: 'x', body: 'x', contextRegex: '[' }, mkCtx()), false);
        });
    });

    suite('findMatchingSnippet', () => {
        test('prefers an exact name match even if another snippet matches earlier in array order', () => {
            const ctx = mkCtx();
            const snippets: SnippetDefinition[] = [
                { name: 'aaa', body: 'A', scope: 'any' },
                { name: 'frac', body: '\\frac{$1}{$2}$0', scope: 'any' }
            ];
            const found = findMatchingSnippet(snippets, ctx, 'frac');
            assert.strictEqual(found, snippets[1]);
        });

        test('returns the first matching snippet in array order when no name is given', () => {
            const ctx = mkCtx();
            const snippets: SnippetDefinition[] = [
                { name: 'aaa', body: 'A', scope: 'any' },
                { name: 'bbb', body: 'B', scope: 'any' }
            ];
            const found = findMatchingSnippet(snippets, ctx);
            assert.strictEqual(found, snippets[0]);
        });

        test('skips disabled snippets', () => {
            const ctx = mkCtx();
            const snippets: SnippetDefinition[] = [
                { name: 'aaa', body: 'A', scope: 'any', enabled: false },
                { name: 'bbb', body: 'B', scope: 'any' }
            ];
            assert.strictEqual(findMatchingSnippet(snippets, ctx), snippets[1]);

            const onlyDisabled: SnippetDefinition[] = [{ name: 'aaa', body: 'A', scope: 'any', enabled: false }];
            assert.strictEqual(findMatchingSnippet(onlyDisabled, ctx), null);
            assert.strictEqual(findMatchingSnippet(onlyDisabled, ctx, 'aaa'), null);
        });

        test('returns null when nothing matches', () => {
            const ctx = mkCtx({ isMath: true });
            const snippets: SnippetDefinition[] = [{ name: 'texty', body: 'T', scope: 'text' }];
            assert.strictEqual(findMatchingSnippet(snippets, ctx), null);
            assert.strictEqual(findMatchingSnippet(snippets, ctx, 'texty'), null);
            assert.strictEqual(findMatchingSnippet([], ctx), null);
        });
    });

    suite('parseTrigger', () => {
        test('parses a trigger at the very start of the text', () => {
            assert.deepStrictEqual(parseTrigger(';frac', ';'), { name: 'frac', start: 0 });
        });

        test('parses a trigger after a leading space', () => {
            assert.deepStrictEqual(parseTrigger(' ;frac', ';'), { name: 'frac', start: 1 });
        });

        test('parses a trigger after preceding text and a space', () => {
            assert.deepStrictEqual(parseTrigger('  x ;sum', ';'), { name: 'sum', start: 4 });
        });

        test('rejects a trigger not preceded by start/space/open bracket', () => {
            assert.strictEqual(parseTrigger('x;frac', ';'), null);
        });

        test('rejects trailing characters after the name', () => {
            assert.strictEqual(parseTrigger(';frac ', ';'), null);
            assert.strictEqual(parseTrigger(';frac;', ';'), null);
        });

        test('rejects a double trigger character', () => {
            assert.strictEqual(parseTrigger(';;frac', ';'), null);
        });

        test('supports a custom trigger character', () => {
            assert.deepStrictEqual(parseTrigger('@sum', '@'), { name: 'sum', start: 0 });
        });

        test('supports names with underscore and dash', () => {
            assert.deepStrictEqual(parseTrigger(';my_snip-x', ';'), { name: 'my_snip-x', start: 0 });
        });
    });

    suite('evaluateJsScript', () => {
        test('evaluates the script using the selection', () => {
            assert.strictEqual(evaluateJsScript('return selection.toUpperCase()', 'ab', mkCtx(), 'test'), 'AB');
        });

        test('throws when the result is not a string', () => {
            assert.throws(() => evaluateJsScript('return 42', '', mkCtx(), 'test'));
            assert.throws(() => evaluateJsScript('return { a: 1 }', '', mkCtx(), 'test'));
        });

        test('can access context fields', () => {
            assert.strictEqual(evaluateJsScript("return context.isMath ? 'M' : 'T'", '', mkCtx({ isMath: true }), 'test'), 'M');
            assert.strictEqual(evaluateJsScript("return context.isMath ? 'M' : 'T'", '', mkCtx({ isMath: false }), 'test'), 'T');
        });

        test('propagates errors thrown by the script', () => {
            assert.throws(() => evaluateJsScript("throw new Error('boom')", '', mkCtx(), 'test'));
        });
    });

    suite('resolveSnippetBody', () => {
        test('a static snippet returns the body unchanged', () => {
            const s: SnippetDefinition = { name: 'frac', body: '\\frac{$1}{$2}$0' };
            assert.deepStrictEqual(resolveSnippetBody(s, '', mkCtx(), 'frac'), { kind: 'static', value: '\\frac{$1}{$2}$0' });
        });

        test('a js script is evaluated', () => {
            const s: SnippetDefinition = { name: 'up', body: 'ignored', script: { type: 'js', code: 'return selection.toUpperCase()' } };
            assert.deepStrictEqual(resolveSnippetBody(s, 'ab', mkCtx(), 'up'), { kind: 'js', value: 'AB' });
        });

        test('a python script code is passed through unchanged', () => {
            const code = 'return transform(selection)';
            const s: SnippetDefinition = { name: 'py', body: 'ignored', script: { type: 'python', code } };
            assert.deepStrictEqual(resolveSnippetBody(s, '', mkCtx(), 'py'), { kind: 'python', value: code });
        });
    });
});
