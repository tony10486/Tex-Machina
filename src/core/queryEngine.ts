import * as vscode from 'vscode';

// --- AST Nodes ---
export interface LatexNode {
    type: 'root' | 'cmd' | 'env' | 'arg' | 'opt' | 'text' | 'prop' | 'val';
    name?: string;
    start: number; // Document absolute character offset
    end: number;
    children: LatexNode[];
    opts: LatexNode[];
    args: LatexNode[];
    parent?: LatexNode;
}

// --- Semantic Scanner ---
export class SemanticScanner {
    constructor(private text: string) {}

    scan(): LatexNode {
        const root: LatexNode = { type: 'root', start: 0, end: this.text.length, children: [], opts: [], args: [] };
        const occupied: {start: number, end: number}[] = [];

        // 1. Environments (\begin{env}...\end{env})
        const envRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
        let match;
        while ((match = envRegex.exec(this.text)) !== null) {
            const node: LatexNode = { type: 'env', name: match[1], start: match.index, end: match.index + match[0].length, children: [], opts: [], args: [] };
            root.children.push(node);
            occupied.push({ start: node.start, end: node.end });
        }

        // 2. Commands (\cmd[opt]{arg})
        const cmdRegex = /\\([a-zA-Z]+)/g;
        while ((match = cmdRegex.exec(this.text)) !== null) {
            if (match[1] === 'begin' || match[1] === 'end') {continue;}

            const cmdNode: LatexNode = { type: 'cmd', name: match[1], start: match.index, end: match.index + match[0].length, children: [], opts: [], args: [] };
            let pos = cmdNode.end;
            
            while (pos < this.text.length) {
                if (/\s/.test(this.text[pos])) { pos++; continue; }
                if (this.text[pos] === '[') {
                    const e = this.findMatching(pos, '[', ']');
                    if (e !== -1) {
                        const optNode: LatexNode = { type: 'opt', start: pos + 1, end: e - 1, children: [], opts: [], args: [] };
                        this.scanProperties(optNode);
                        cmdNode.opts.push(optNode);
                        cmdNode.children.push(optNode);
                        pos = e;
                        continue;
                    }
                }
                if (this.text[pos] === '{') {
                    const e = this.findMatching(pos, '{', '}');
                    if (e !== -1) {
                        const argNode: LatexNode = { type: 'arg', start: pos + 1, end: e - 1, children: [], opts: [], args: [] };
                        cmdNode.args.push(argNode);
                        cmdNode.children.push(argNode);
                        pos = e;
                        continue;
                    }
                }
                break;
            }
            cmdNode.end = pos;

            const parent = root.children.find(n => n.type === 'env' && cmdNode.start > n.start && cmdNode.end < n.end);
            if (parent) {
                cmdNode.parent = parent;
                parent.children.push(cmdNode);
            } else {
                root.children.push(cmdNode);
            }
            occupied.push({ start: cmdNode.start, end: cmdNode.end });
        }

        const wordRegex = /\b[a-zA-Z0-9_]+\b/g;
        while ((match = wordRegex.exec(this.text)) !== null) {
            const s = match.index;
            const e = s + match[0].length;
            if (s > 0 && this.text[s - 1] === '\\') {continue;}
            if (occupied.some(occ => s >= occ.start && s < occ.end)) {continue;}
            
            const textNode: LatexNode = { type: 'text', start: s, end: e, children: [], opts: [], args: [] };
            const parent = root.children.find(n => n.type === 'env' && textNode.start > n.start && textNode.end < n.end);
            if (parent) {
                textNode.parent = parent;
                parent.children.push(textNode);
            } else {
                root.children.push(textNode);
            }
        }

        return root;
    }

    private scanProperties(optNode: LatexNode) {
        const txt = this.text.substring(optNode.start, optNode.end);
        const propRegex = /([a-zA-Z]+)=([^,\]]+)/g;
        let m;
        while ((m = propRegex.exec(txt)) !== null) {
            const propNode: LatexNode = { type: 'prop', name: m[1], start: optNode.start + m.index, end: optNode.start + m.index + m[1].length, children: [], opts: [], args: [] };
            const valNode: LatexNode = { type: 'val', start: optNode.start + m.index + m[0].indexOf(m[2]), end: optNode.start + m.index + m[0].length, children: [], opts: [], args: [] };
            propNode.children.push(valNode);
            optNode.children.push(propNode);
        }
    }

    private findMatching(start: number, open: string, close: string): number {
        let depth = 0;
        for (let i = start; i < this.text.length; i++) {
            if (this.text[i] === open) {depth++;}
            else if (this.text[i] === close) {
                depth--;
                if (depth === 0) {return i + 1;}
            }
        }
        return -1;
    }
}

// --- Enhanced Query Executor ---
export class HSQEngine {
    constructor(private editor: vscode.TextEditor) {}

    public async execute(queryStr: string): Promise<boolean> {
        if (queryStr.startsWith(';') || queryStr.startsWith('?')) {
            queryStr = queryStr.substring(1).trim();
        }

        const document = this.editor.document;
        const text = document.getText();
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();
        const edit = new vscode.WorkspaceEdit();
        
        const pipes = queryStr.split('|').map(p => p.trim());
        if (pipes.length === 0) {return false;}

        const firstPipe = pipes[0];
        const opMatch = firstPipe.match(/^(.*?)(>>|\+=|-=|\+>|<+|>+<|:=)(.*)$/);
        
        let selectorStr = opMatch ? opMatch[1].trim() : firstPipe;
        const op = opMatch ? opMatch[2].trim() : "";
        const actionRaw = opMatch ? opMatch[3].trim().replace(/^['"]|['"]$/g, '') : "";

        let targets: LatexNode[] = this.resolveSelector(selectorStr, root, text);

        for (const t of targets) {
            let currentVal = text.substring(t.start, t.end);
            
            let rangeStart = t.start;
            let rangeEnd = t.end;
            if (selectorStr.includes(':*')) {
                if (t.type === 'cmd' && t.args.length > 0) {
                    rangeStart = t.args[0].start; 
                    rangeEnd = t.args[0].end;
                } else if (t.type === 'env') {
                    const beginLen = `\\begin{${t.name}}`.length;
                    const endLen = `\\end{${t.name}}`.length;
                    rangeStart += beginLen; 
                    rangeEnd -= endLen;
                }
                currentVal = text.substring(rangeStart, rangeEnd);
            }

            let newVal = currentVal;
            const loopVars = { '$$': currentVal };

            if (op === '>>') {
                newVal = actionRaw.replace(/\$\$/g, loopVars['$$']);
            } else if (op === '+>') {
                newVal = currentVal + actionRaw.replace(/\$\$/g, loopVars['$$']);
            } else if (op === '<+') {
                newVal = actionRaw.replace(/\$\$/g, loopVars['$$']) + currentVal;
            } else if (op === '>+<') {
                newVal = actionRaw.replace(/\$\$/g, currentVal);
            } else if (op === '+=' || op === '-=') {
                newVal = this.applyNumericOp(t, currentVal, op, actionRaw);
                if (newVal === currentVal) {continue;}
            } else if (op === ':=') {
                this.applyAttributeAssign(t, actionRaw, edit, document);
                continue; 
            }

            for (let i = 1; i < pipes.length; i++) {
                const p = pipes[i];
                if (p === '+ bold') {newVal = `\\textbf{${newVal}}`;}
                else if (p === '+ italic') {newVal = `\\textit{${newVal}}`;}
                else if (p === '- clear') {newVal = newVal.replace(/\\(?:textbf|textit|underline)\{([^}]+)\}/g, '$1');}
            }

            if (op !== ':=') {
                edit.replace(document.uri, new vscode.Range(document.positionAt(rangeStart), document.positionAt(rangeEnd)), newVal);
            }
        }

        return await vscode.workspace.applyEdit(edit);
    }

    private resolveSelector(selectorStr: string, root: LatexNode, docText: string): LatexNode[] {
        const segments = selectorStr.split('>').map(s => s.trim());
        let pool = this.flattenNodes(root);

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            // Split by keywords (where, without, has, and, or, not) or pseudo-classes
            const parts = segment.split(/\s+(where|without|has|and|or|not)\s+|(?=:)|(?=\[)/);
            const baseTagStr = parts[0].trim();
            const tag = this.mapTag(baseTagStr);

            pool = pool.filter(n => {
                const isTagMatch = n.name === tag || n.type === tag || (n.type === 'text' && n.name === tag);
                if (!isTagMatch) return false;
                
                // Hierarchical check
                if (i > 0) {
                    const prevTag = this.mapTag(segments[i-1].split(/\s+/)[0]);
                    if (!n.parent || (n.parent.name !== prevTag && n.parent.type !== prevTag)) return false;
                }

                // Apply conditions within segment
                return this.evaluateComplexFilter(n, segment, docText);
            });
        }

        if (selectorStr.includes(':first')) pool = pool.slice(0, 1);
        if (selectorStr.includes(':last')) pool = pool.slice(-1);

        return pool;
    }

    private evaluateComplexFilter(node: LatexNode, filterStr: string, docText: string): boolean {
        // Simple natural language filter parser
        const tokens = filterStr.split(/\s+/);
        let result = true;
        let currentOp = 'and';

        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i].toLowerCase();
            if (token === 'and') { currentOp = 'and'; continue; }
            if (token === 'or') { currentOp = 'or'; continue; }
            if (token === 'not') { /* handle next */ continue; }

            let match = false;
            if (token === 'without' || token === 'has') {
                const target = tokens[i + 1]?.replace(/^\\/, '');
                const hasChild = node.children.some(c => c.name === target || c.type === target);
                match = (token === 'has') ? hasChild : !hasChild;
                i++;
            } else if (token === 'where' || token.startsWith('#') || token.startsWith('[')) {
                // Property check
                match = this.evaluatePropertyFilter(node, tokens.slice(i).join(' '), docText);
                break; // where consumes the rest for simplicity in this proto
            } else if (token.startsWith(':')) {
                continue; // handled by resolveSelector
            } else {
                continue;
            }

            if (currentOp === 'and') result = result && match;
            else if (currentOp === 'or') result = result || match;
        }

        return result;
    }

    private evaluatePropertyFilter(node: LatexNode, filter: string, docText: string): boolean {
        // [title="Intro"] or #w > 10
        const attrMatch = filter.match(/(?:where\s+)?#([a-z]+)\s*([<>=!]+)\s*([^ ]+)/i) ||
                          filter.match(/\[([a-z]+)\s*=\s*["']?([^"']+)["']?\]/i);
        
        if (!attrMatch) return true;

        const attrName = this.mapAttr(attrMatch[1]);
        const op = attrMatch[2] || '==';
        const targetVal = attrMatch[3] || attrMatch[2];

        for (const o of node.opts) {
            for (const p of o.children) {
                if (p.type === 'prop' && p.name === attrName) {
                    const val = docText.substring(p.children[0].start, p.children[0].end).trim();
                    if (op === '==' || op === '=') return val === targetVal;
                    if (op === '!=') return val !== targetVal;
                    
                    const numVal = parseFloat(val);
                    const numTarget = parseFloat(targetVal);
                    if (!isNaN(numVal) && !isNaN(numTarget)) {
                        if (op === '>') return numVal > numTarget;
                        if (op === '<') return numVal < numTarget;
                        if (op === '>=') return numVal >= numTarget;
                        if (op === '<=') return numVal <= numTarget;
                    }
                }
            }
        }
        return false;
    }

    private mapTag(tag: string): string {
        const mapping: Record<string, string> = {
            '@img': 'includegraphics',
            '@fig': 'figure',
            '@tbl': 'tabular',
            '@eq': 'equation',
            '@math': 'inline_math',
            'img': 'includegraphics',
            'fig': 'figure'
        };
        return mapping[tag] || tag.replace(/^@/, '').replace(/^\\/, '');
    }

    private flattenNodes(root: LatexNode): LatexNode[] {
        let result: LatexNode[] = [];
        for (const child of root.children) {
            result.push(child);
            result = result.concat(this.flattenNodes(child));
        }
        return result;
    }

    private applyNumericOp(node: LatexNode, currentVal: string, op: string, action: string): string {
        if (action.startsWith('#')) {
            const attrMatch = action.match(/^#([a-z]+)\s*([\+\-]=)?\s*([\d\.]+%?)/);
            if (attrMatch && node.type === 'cmd') {
                const attr = this.mapAttr(attrMatch[1]);
                for (const o of node.opts) {
                    for (const p of o.children) {
                        if (p.type === 'prop' && p.name === attr) {
                            const valNode = p.children[0];
                            const currText = this.editor.document.getText(new vscode.Range(this.editor.document.positionAt(valNode.start), this.editor.document.positionAt(valNode.end)));
                            const numMatch = currText.match(/([\d\.]+)/);
                            if (numMatch) {
                                let currV = parseFloat(numMatch[1]);
                                let delta = parseFloat(attrMatch[3]);
                                if (attrMatch[3].includes('%')) {delta = currV * (delta / 100);}
                                const newV = Math.round((op === '+=' ? currV + delta : currV - delta) * 100) / 100;
                                return currentVal.replace(currText, currText.replace(numMatch[1], newV.toString()));
                            }
                        }
                    }
                }
            }
        }
        return currentVal.replace(/([\d\.]+)/, (m) => {
            let currV = parseFloat(m);
            let delta = parseFloat(action);
            if (action.includes('%')) {delta = currV * (delta / 100);}
            return (Math.round((op === '+=' ? currV + delta : currV - delta) * 100) / 100).toString();
        });
    }

    private applyAttributeAssign(node: LatexNode, action: string, edit: vscode.WorkspaceEdit, doc: vscode.TextDocument) {
        const match = action.match(/^#([a-z]+)\s*:=\s*(.*)$/);
        if (!match || node.type !== 'cmd') {return;}

        const attr = this.mapAttr(match[1]);
        const newVal = match[2];

        let found = false;
        for (const o of node.opts) {
            for (const p of o.children) {
                if (p.type === 'prop' && p.name === attr) {
                    const valNode = p.children[0];
                    edit.replace(doc.uri, new vscode.Range(doc.positionAt(valNode.start), doc.positionAt(valNode.end)), newVal);
                    found = true;
                }
            }
        }
        if (!found && node.opts.length > 0) {
            edit.insert(doc.uri, doc.positionAt(node.opts[0].end), `, ${attr}=${newVal}`);
        } else if (!found) {
            edit.insert(doc.uri, doc.positionAt(node.start + node.name!.length + 1), `[${attr}=${newVal}]`);
        }
    }

    private mapAttr(abbr: string): string {
        const mapping: Record<string, string> = { 'w': 'width', 'h': 'height', 's': 'scale' };
        return mapping[abbr] || abbr;
    }
}
