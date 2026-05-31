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
        _context: vscode.InlineCompletionContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        const config = vscode.workspace.getConfiguration('tex-machina');
        if (!config.get<boolean>('mathGhostCalc.enabled', true)) { return []; }

        if (position.character < 1) { return []; }

        const line = document.lineAt(position.line).text;
        const charBefore = line[position.character - 1];
        if (charBefore !== '=') { return []; }

        if (position.character >= 2) {
            const c2 = line[position.character - 2];
            if (['=', ':', '<', '>', '-', '!', '~'].includes(c2)) { return []; }
        }

        const inMath = findMathAtPos(document, position.translate(0, -1)) ||
            isInOpenMathEnv(document, position);
        if (!inMath) { return []; }

        const expr = extractExprFromLine(line, position.character, 1) ||
            extractExprFromDocument(document, position, 1);
        if (!expr) { return []; }

        const exprMin = expr.replace(/\s/g, '');
        if (!/[a-zA-Z\\]/.test(exprMin)) { return []; }

        const cached = this.cache.get(exprMin);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return [new vscode.InlineCompletionItem(' ' + cached.result)];
        }

        const op = detectOperation(expr);
        const timeout = config.get<number>('mathGhostCalc.timeout', 10000);

        try {
            const response = await Promise.race([
                this.pythonService.sendAndWait({
                    mainCommand: op.mainCommand,
                    subCommands: op.subCommands,
                    rawSelection: expr,
                    config: {}
                }),
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), timeout)
                )
            ]);

            if (response.status === 'success' && response.latex) {
                if (this.cache.size >= this.CACHE_MAX) {
                    const oldest = this.cache.keys().next().value;
                    if (oldest) { this.cache.delete(oldest); }
                }
                this.cache.set(exprMin, { result: response.latex, timestamp: Date.now() });

                return [new vscode.InlineCompletionItem(' ' + response.latex)];
            }
        } catch {
            // Silently fail — no ghost text shown
        }

        return [];
    }
}

export function registerMathGhostCalc(context: vscode.ExtensionContext, pythonService: PythonService) {
    const provider = new MathGhostCalcProvider(pythonService);

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { language: 'latex', scheme: 'file' },
            provider
        )
    );
}
