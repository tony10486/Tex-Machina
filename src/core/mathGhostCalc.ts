import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';
import { PythonService } from '../services/pythonService';
import { detectOperation, isInOpenMathEnv, extractExprFromLine, extractExprFromDocument } from './mathCalcUtils';

class MathGhostCalcProvider implements vscode.InlineCompletionItemProvider {
    private cache = new Map<string, { result: string; timestamp: number }>();
    private readonly CACHE_TTL = 10000;
    private readonly CACHE_MAX = 50;

    constructor(private pythonService: PythonService) {}

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('mathGhostCalc.enabled', true)) { return []; }

        if (token.isCancellationRequested) { return []; }
        if (position.character < 1) { return []; }

        const line = document.lineAt(position.line).text;
        const charBefore = line[position.character - 1];
        if (charBefore !== '=') { return []; }

        if (position.character >= 2) {
            const c2 = line[position.character - 2];
            if (['=', ':', '<', '>', '-', '!', '~', '&'].includes(c2)) { return []; }
        }

        const inMath = findMathAtPos(document, position.translate(0, -1)) ||
            isInOpenMathEnv(document, position);
        if (!inMath) { return []; }

        const expr = extractExprFromLine(line, position.character, 1) ||
            extractExprFromDocument(document, position, 1);
        if (!expr) { return []; }

        const cachedKey = expr.replace(/\s/g, '');
        const cached = this.cache.get(cachedKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return [new vscode.InlineCompletionItem(' ' + cached.result)];
        }

        const op = detectOperation(expr);
        const timeout = config.get<number>('mathGhostCalc.timeout', 20000);

        const calcSettings = config.get<any>('calc.settings', {});
        const requestConfig = {
            laplace: {
                source: calcSettings.laplaceSource || 't',
                target: calcSettings.laplaceTarget || 's'
            },
            angleUnit: calcSettings.angleUnit || 'deg',
            precision: calcSettings.precision,
            imaginaryUnit: calcSettings.imaginaryUnit,
            simplifyResult: calcSettings.simplifyResult,
            defaultDomain: calcSettings.defaultDomain,
            rationalNotation: calcSettings.rationalNotation,
            autoFactor: calcSettings.autoFactor
        };

        console.log('[GhostCalc] provider called', { triggerKind: context.triggerKind, charBefore, inMath: !!inMath, expr, mainCommand: op.mainCommand });

        try {
            const response = await Promise.race([
                this.pythonService.sendAndWait({
                    mainCommand: op.mainCommand,
                    subCommands: op.subCommands,
                    rawSelection: expr,
                    config: requestConfig
                }),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), timeout)
                )
            ]);

            if (token.isCancellationRequested) { return []; }

            console.log('[GhostCalc] Python response', JSON.stringify(response));

            if (response.status === 'success' && response.latex) {
                if (this.cache.size >= this.CACHE_MAX) {
                    const oldest = this.cache.keys().next().value;
                    if (oldest) { this.cache.delete(oldest); }
                }
                this.cache.set(cachedKey, { result: response.latex, timestamp: Date.now() });

                return [new vscode.InlineCompletionItem(' ' + response.latex)];
            } else {
                console.log('[GhostCalc] unexpected response', JSON.stringify(response));
            }
        } catch (e) {
            console.log('[GhostCalc] error', e);
        }

        return [];
    }
}

export function registerMathGhostCalc(context: vscode.ExtensionContext, pythonService: PythonService) {
    const provider = new MathGhostCalcProvider(pythonService);

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { language: 'latex' },
            provider
        )
    );

    console.log('[GhostCalc] provider registered for latex');
}
