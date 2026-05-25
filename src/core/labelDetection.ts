import * as vscode from 'vscode';

export const unusedLabelDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.4',
    fontStyle: 'italic',
    after: {
        contentText: ' [unused]',
        color: '#888888',
        margin: '0 0 0 1em',
        fontStyle: 'normal'
    }
});

export interface LabelInfo {
    label: string;
    range: vscode.Range;
    context: string;
}

/**
 * Finds the context (surrounding environment or line) of a label.
 */
function getLabelContext(text: string, index: number): string {
    const before = text.substring(0, index);
    const after = text.substring(index);
    
    // Find the nearest \begin that isn't closed before the label
    const beginRegex = /\\begin\{([a-zA-Z]+\*?)\}/g;
    let match;
    let lastBeginMatch: { name: string, index: number } | undefined;
    
    while ((match = beginRegex.exec(before)) !== null) {
        lastBeginMatch = { name: match[1], index: match.index };
    }
    
    if (lastBeginMatch) {
        const envName = lastBeginMatch.name;
        const endTag = `\\end{${envName}}`;
        const endIdx = after.indexOf(endTag);
        
        if (endIdx !== -1) {
            // Simplified: return the whole environment text
            return text.substring(lastBeginMatch.index, index + endIdx + endTag.length);
        }
    }
    
    // Fallback: the line containing the label
    const lineStart = before.lastIndexOf('\n') + 1;
    let lineEnd = after.indexOf('\n');
    if (lineEnd === -1) { lineEnd = after.length; }
    return text.substring(lineStart, index + lineEnd);
}

export function findLabels(text: string, document: vscode.TextDocument): LabelInfo[] {
    const labels: LabelInfo[] = [];
    const labelRegex = /\\label\{([^}]+)\}/g;
    let match;

    while ((match = labelRegex.exec(text)) !== null) {
        const labelName = match[1];
        const index = match.index;
        const context = getLabelContext(text, index);
        const startPos = document.positionAt(index);
        const endPos = document.positionAt(index + match[0].length);
        labels.push({
            label: labelName,
            range: new vscode.Range(startPos, endPos),
            context: context
        });
    }

    return labels;
}

export function findReferences(text: string): Set<string> {
    const references = new Set<string>();
    // Commonly used LaTeX referencing and citation commands
    const refRegex = /\\(?:ref|cite|eqref|cref|Cref|autocite|textcite|nocite|pageref)\{([^}]+)\}/g;
    let match;

    while ((match = refRegex.exec(text)) !== null) {
        const keys = match[1].split(',').map(key => key.trim());
        keys.forEach(key => references.add(key));
    }

    return references;
}

export async function getUnusedLabels(document: vscode.TextDocument): Promise<LabelInfo[]> {
    const text = document.getText();
    const allLabels = findLabels(text, document);
    
    // Use the optimized cache from LabelTracker
    await labelTracker.syncWorkspaceRefs(document.uri);
    const allRefs = labelTracker.getGlobalRefs();

    return allLabels.filter(l => !allRefs.has(l.label));
}

export async function updateLabelDecorations(editor: vscode.TextEditor) {
    if (editor.document.languageId !== 'latex') {
        return;
    }

    const unusedLabels = await getUnusedLabels(editor.document);
    const decorations = unusedLabels.map(l => ({ range: l.range }));
    editor.setDecorations(unusedLabelDecorationType, decorations);
}

/**
 * Tracks label changes and notifies if referenced labels are modified or removed.
 */
class LabelTracker {
    private previousLabels: Map<string, Map<string, string>> = new Map();
    private fileRefCache: Map<string, Set<string>> = new Map();
    private allWorkspaceRefs: Set<string> = new Set();
    private isInitialized = false;

    public getGlobalRefs(): Set<string> {
        return this.allWorkspaceRefs;
    }

    async syncWorkspaceRefs(affectedUri?: vscode.Uri) {
        if (!this.isInitialized && !affectedUri) {
            const allRefs = new Set<string>();
            const texFiles = await vscode.workspace.findFiles('**/*.tex');
            
            for (const file of texFiles) {
                await this.updateFileRefCache(file);
            }
            this.rebuildGlobalRefs();
            this.isInitialized = true;
            return;
        }

        if (affectedUri) {
            await this.updateFileRefCache(affectedUri);
            this.rebuildGlobalRefs();
        }
    }

    private async updateFileRefCache(uri: vscode.Uri) {
        try {
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            let text: string;
            if (doc) {
                text = doc.getText();
            } else {
                const content = await vscode.workspace.fs.readFile(uri);
                text = new TextDecoder().decode(content);
            }
            this.fileRefCache.set(uri.toString(), findReferences(text));
        } catch (e) {
            this.fileRefCache.delete(uri.toString());
        }
    }

    private rebuildGlobalRefs() {
        const newGlobalRefs = new Set<string>();
        for (const refs of this.fileRefCache.values()) {
            refs.forEach(r => newGlobalRefs.add(r));
        }
        this.allWorkspaceRefs = newGlobalRefs;
    }

    async initialize() {
        if (this.isInitialized) { return; }
        await this.syncWorkspaceRefs();
        
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'latex') {
                this.recordDocumentState(doc);
            }
        }
    }

    recordDocumentState(document: vscode.TextDocument) {
        const labels = findLabels(document.getText(), document);
        this.previousLabels.set(document.uri.toString(), new Map(labels.map(l => [l.label, l.context])));
    }

    async checkChanges(document: vscode.TextDocument) {
        if (document.languageId !== 'latex') { return; }
        
        if (!this.isInitialized) {
            await this.initialize();
        }

        const uri = document.uri.toString();
        const currentLabels = findLabels(document.getText(), document);
        const currentLabelMap = new Map(currentLabels.map(l => [l.label, l.context]));
        const oldLabelMap = this.previousLabels.get(uri);

        if (oldLabelMap) {
            // Only sync the current document's references to be efficient
            await this.syncWorkspaceRefs(document.uri);

            for (const [label, oldContext] of oldLabelMap.entries()) {
                if (!currentLabelMap.has(label)) {
                    if (this.allWorkspaceRefs.has(label)) {
                        vscode.window.showWarningMessage(`참조된 라벨 '${label}'이(가) 삭제되거나 이름이 변경되었습니다.`);
                    }
                } else {
                    const newContext = currentLabelMap.get(label);
                    if (newContext !== oldContext) {
                        if (this.allWorkspaceRefs.has(label)) {
                            vscode.window.showInformationMessage(`참조된 라벨 '${label}'의 내용(수식/정리 등)이 수정되었습니다.`);
                        }
                    }
                }
            }
        }

        this.previousLabels.set(uri, currentLabelMap);
    }
}

const labelTracker = new LabelTracker();

let updateTimeout: NodeJS.Timeout | undefined;

export function registerLabelDetection(context: vscode.ExtensionContext) {
    // Initialize tracker
    labelTracker.initialize();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tex-machina.deleteUnusedLabels', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const unusedLabels = await getUnusedLabels(editor.document);
            if (unusedLabels.length === 0) {
                vscode.window.showInformationMessage("미사용된 라벨이 없습니다.");
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `${unusedLabels.length}개의 미사용 라벨을 삭제하시겠습니까? (이 작업은 현재 문서의 라벨만 삭제합니다)`,
                { modal: true },
                '삭제'
            );

            if (confirm === '삭제') {
                await editor.edit(editBuilder => {
                    // Sort ranges from bottom to top to avoid offset issues
                    const sortedLabels = [...unusedLabels].sort((a, b) => b.range.start.compareTo(a.range.start));
                    for (const label of sortedLabels) {
                        editBuilder.delete(label.range);
                    }
                });
                vscode.window.showInformationMessage(`${unusedLabels.length}개의 라벨이 삭제되었습니다.`);
                updateLabelDecorations(editor);
            }
        })
    );

    function triggerUpdate(editor: vscode.TextEditor | undefined) {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
            if (editor) {
                updateLabelDecorations(editor);
                labelTracker.checkChanges(editor.document);
            }
        }, 500); // Debounce reduced to 500ms for better responsiveness
    }

    // Update decorations and track changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            labelTracker.recordDocumentState(editor.document);
            triggerUpdate(editor);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId === 'latex') {
            labelTracker.recordDocumentState(doc);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            triggerUpdate(editor);
        }
    }, null, context.subscriptions);

    // Initial update
    if (vscode.window.activeTextEditor) {
        labelTracker.recordDocumentState(vscode.window.activeTextEditor.document);
        triggerUpdate(vscode.window.activeTextEditor);
    }
}

