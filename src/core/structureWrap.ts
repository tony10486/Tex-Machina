import * as vscode from 'vscode';
import { findMathAtPos, isInsideComment, isInsideVerbatim } from './latexParser';

export interface EnvDef {
    id: string;
    name: string;
    hasTitle: boolean;
}

const DEFAULT_ENVS: EnvDef[] = [
    { id: 'thm',     name: 'theorem',     hasTitle: true },
    { id: 'lemma',   name: 'lemma',       hasTitle: true },
    { id: 'proof',   name: 'proof',       hasTitle: false },
    { id: 'defn',    name: 'definition',  hasTitle: true },
    { id: 'cor',     name: 'corollary',   hasTitle: true },
    { id: 'prop',    name: 'proposition', hasTitle: true },
    { id: 'box',     name: 'tcolorbox',   hasTitle: true },
    { id: 'remark',  name: 'remark',      hasTitle: false },
    { id: 'example', name: 'example',     hasTitle: true },
];

function getEnvDefs(): EnvDef[] {
    const config = vscode.workspace.getConfiguration('tex-machina');
    const custom = config.get<Record<string, { name: string; hasTitle: boolean }>>('structureWrap.environments', {});
    const envMap = new Map<string, EnvDef>();
    for (const env of DEFAULT_ENVS) {
        envMap.set(env.id, env);
    }
    for (const [id, def] of Object.entries(custom)) {
        if (def.name) {
            envMap.set(id, { id, name: def.name, hasTitle: def.hasTitle ?? true });
        }
    }
    return Array.from(envMap.values());
}

export function resolveEnvDef(id: string): EnvDef | undefined {
    return getEnvDefs().find(e => e.id === id);
}

export function findContentRange(document: vscode.TextDocument, pos: vscode.Position): vscode.Range | null {
    const mathEnv = findMathAtPos(document, pos);
    if (mathEnv && (mathEnv.type === 'display' || mathEnv.type === 'equation')) {
        return mathEnv.range;
    }

    const textBeforePos = document.getText(new vscode.Range(new vscode.Position(0, 0), pos));
    const boundaryRegex = /\\begin\s*\{([^}]+)\}|\\end\s*\{([^}]+)\}|\$\$|\\\[|\\\]|\\\(|\\\)/g;
    let lastMatch: RegExpExecArray | null = null;
    while (true) {
        const m = boundaryRegex.exec(textBeforePos);
        if (!m) break;
        lastMatch = m;
    }

    if (lastMatch) {
        const endTag = lastMatch[0];
        const closeTags = ['$$', '\\]', '\\)'];
        if (closeTags.includes(endTag)) {
            const openTag = endTag === '$$' ? '$$' : (endTag === '\\]' ? '\\[' : '\\(');
            const openIdx = textBeforePos.lastIndexOf(openTag, lastMatch.index - 1);
            if (openIdx !== -1 && openTag === endTag ? true : openIdx < lastMatch.index) {
                const openPos = document.positionAt(openIdx);
                const endPos = document.positionAt(lastMatch.index + endTag.length);
                const envType = endTag === '$$' ? 'display' : (endTag === '\\]' ? 'display' : 'inline');
                if (envType === 'display') {
                    return new vscode.Range(openPos, endPos);
                }
            }
        }
        const envEndMatch = lastMatch[0].startsWith('\\end');
        if (envEndMatch) {
            const envName = lastMatch[2];
            const mathEnvs = ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
                'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*', 'displaymath'];
            if (envName && mathEnvs.includes(envName)) {
                const beginPattern = `\\\\begin\\s*\\{${envName.replace(/\*/g, '\\*')}\\}`;
                const beginRegex = new RegExp(beginPattern, 'g');
                let beginMatch: RegExpExecArray | null = null;
                while (true) {
                    const bm = beginRegex.exec(textBeforePos);
                    if (!bm) break;
                    if (bm.index < lastMatch.index) beginMatch = bm;
                }
                if (beginMatch) {
                    const openPos = document.positionAt(beginMatch.index);
                    const endPos = document.positionAt(lastMatch.index + lastMatch[0].length);
                    return new vscode.Range(openPos, endPos);
                }
            }
        }
    }

    let startLine = Math.max(0, pos.line - 1);
    while (startLine > 0) {
        const lineText = document.lineAt(startLine - 1).text;
        if (lineText.trim() === '') break;
        startLine--;
    }
    const contentRange = new vscode.Range(
        new vscode.Position(startLine, 0),
        pos
    );
    if (contentRange.isEmpty) return null;
    return contentRange;
}

export async function wrapStructure(editor: vscode.TextEditor, envDef: EnvDef): Promise<boolean> {
    const document = editor.document;
    const cursorPos = editor.selection.active;

    if (isInsideComment(document, cursorPos) || isInsideVerbatim(document, cursorPos)) {
        vscode.window.showErrorMessage('Cannot wrap inside a comment or verbatim environment.');
        return false;
    }

    const contentRange = findContentRange(document, cursorPos);
    if (!contentRange) {
        vscode.window.showWarningMessage('No content found to wrap.');
        return false;
    }

    const content = document.getText(contentRange);
    if (content.trim().length === 0) {
        vscode.window.showWarningMessage('No content found to wrap.');
        return false;
    }

    const leadingSpaces = document.lineAt(contentRange.start.line).text.match(/^(\s*)/)?.[1] || '';
    const indentedContent = content.split('\n').map((line, i) =>
        i === 0 ? line : leadingSpaces + line
    ).join('\n');

    const titleBehavior = vscode.workspace.getConfiguration('tex-machina')
        .get<string>('structureWrap.titleBehavior', 'none');

    let titlePart = '';
    let cursorOffset = 0;
    if (titleBehavior === 'cursor' && envDef.hasTitle) {
        if (envDef.name === 'tcolorbox') {
            titlePart = '[title=]';
            cursorOffset = leadingSpaces.length + `\\begin{${envDef.name}}[title=`.length;
        } else {
            titlePart = '[]';
            cursorOffset = leadingSpaces.length + `\\begin{${envDef.name}}[`.length;
        }
    }

    const wrapped = `${leadingSpaces}\\begin{${envDef.name}}${titlePart}\n${indentedContent}\n${leadingSpaces}\\end{${envDef.name}}`;

    const success = await editor.edit(editBuilder => {
        editBuilder.replace(contentRange, wrapped);
    });

    if (success && titleBehavior === 'cursor' && envDef.hasTitle) {
        const startLine = contentRange.start.line;
        const newPos = new vscode.Position(startLine, cursorOffset);
        editor.selection = new vscode.Selection(newPos, newPos);
        editor.revealRange(new vscode.Range(newPos, newPos));
    }

    return success;
}

export function registerStructureWrap(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('tex-machina.wrapStructure', async (editor, _editBuilder, ...args: any[]) => {
            const envId: string | undefined = args[0];
            if (!envId) {
                const envs = getEnvDefs();
                const picks = envs.map(e => ({
                    label: e.id,
                    description: `${e.name}${e.hasTitle ? ' (title)' : ''}`,
                    envDef: e,
                }));
                const selected = await vscode.window.showQuickPick(picks, {
                    placeHolder: 'Select environment to wrap with',
                });
                if (!selected) return;
                await wrapStructure(editor, selected.envDef);
                return;
            }

            const envDef = resolveEnvDef(envId);
            if (!envDef) {
                const available = getEnvDefs().map(e => e.id).join(', ');
                vscode.window.showErrorMessage(`Unknown environment '${envId}'. Available: ${available}`);
                return;
            }
            await wrapStructure(editor, envDef);
        })
    );
}
