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
}

// --- Semantic Scanner ---
export class SemanticScanner {
    constructor(private text: string) {}

    scan(): LatexNode {
        const root: LatexNode = { type: 'root', start: 0, end: this.text.length, children: [], opts: [], args: [] };
        const occupied: {start: number, end: number}[] = [];

        // 1. Commands (\cmd[opt]{arg})
        const cmdRegex = /\\([a-zA-Z]+)/g;
        let match;
        while ((match = cmdRegex.exec(this.text)) !== null) {
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
            root.children.push(cmdNode);
            occupied.push({ start: cmdNode.start, end: cmdNode.end });
        }

        // 2. Environments (\begin{env}...\end{env})
        const envRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
        while ((match = envRegex.exec(this.text)) !== null) {
            root.children.push({ type: 'env', name: match[1], start: match.index, end: match.index + match[0].length, children: [], opts: [], args: [] });
            occupied.push({ start: match.index, end: match.index + match[0].length });
        }

        // 3. Plain Text Words
        const wordRegex = /\b[a-zA-Z0-9_]+\b/g;
        while ((match = wordRegex.exec(this.text)) !== null) {
            const s = match.index;
            const e = s + match[0].length;
            // Skip if inside a command or right after a backslash
            if (s > 0 && this.text[s - 1] === '\\') {continue;}
            if (occupied.some(occ => s >= occ.start && s < occ.end)) {continue;}
            
            root.children.push({ type: 'text', start: s, end: e, children: [], opts: [], args: [] });
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

// --- Query Executor using WorkspaceEdit ---
export class HSQEngine {
    constructor(private editor: vscode.TextEditor) {}

    public async execute(queryStr: string): Promise<boolean> {
        // Strip prefix
        if (queryStr.startsWith(';')) {queryStr = queryStr.substring(1).trim();}

        const document = this.editor.document;
        const text = document.getText();
        
        const scanner = new SemanticScanner(text);
        const root = scanner.scan();

        const edit = new vscode.WorkspaceEdit();
        let loopVars: Record<string, string> = { '$$': '' };

        // ---------------------------------------------------------
        // [Simple Parser for Prototype] 
        // Handles: "selector >> action | + trait"
        // ---------------------------------------------------------
        
        // 1. Split by pipeline
        const pipes = queryStr.split('|').map(p => p.trim());
        if (pipes.length === 0) {return false;}

        // Parse first pipe for selector
        const firstPipe = pipes[0];
        let selector = "";
        let op = "";
        let action = "";
        
        const replaceMatch = firstPipe.match(/^(.*?)(>>|\+=|-=)(.*)$/);
        if (replaceMatch) {
            selector = replaceMatch[1].trim();
            op = replaceMatch[2].trim();
            action = replaceMatch[3].trim().replace(/^['"]|['"]$/g, ''); // strip quotes
        } else {
            selector = firstPipe; // Only selection, maybe traits follow
        }

        // 2. Resolve Targets
        let targets: LatexNode[] = [];
        let cursorType: 'none' | 'start' | 'end' = 'none';

        if (selector.endsWith('.|')) { cursorType = 'end'; selector = selector.slice(0, -2); }
        else if (selector.endsWith('|.')) { cursorType = 'start'; selector = selector.slice(0, -2); }

        let isContentSelector = false;
        if (selector.endsWith(':*')) { isContentSelector = true; selector = selector.slice(0, -2); }

        let pseudo = "";
        if (selector.includes(':')) {
            const parts = selector.split(':');
            selector = parts[0];
            pseudo = parts[1];
        }

        selector = selector.replace(/^@/, '').replace(/^\\/, '');
        if (selector === 'img') {selector = 'includegraphics';}

        for (const n of root.children) {
            if (n.name === selector || n.type === selector || (n.type === 'text' && text.substring(n.start, n.end) === selector)) {
                targets.push(n);
            }
        }

        if (pseudo === 'first') {targets = targets.slice(0, 1);}
        if (pseudo === 'last') {targets = targets.slice(-1);}

        // 3. Process Pipeline for each target
        for (const t of targets) {
            let val = text.substring(t.start, t.end);
            if (isContentSelector) {
                if (t.type === 'cmd' && t.args.length > 0) {val = text.substring(t.args[0].start, t.args[0].end);}
                else if (t.type === 'env') {
                    const beginTag = `\\begin{${t.name}}`;
                    const endTag = `\\end{${t.name}}`;
                    val = text.substring(t.start + beginTag.length, t.end - endTag.length);
                }
            }

            loopVars['$$'] = val;

            // Apply operations from first pipe
            if (op === '>>') {
                val = action.replace('$$', loopVars['$$']);
            } else if (op === '+=' || op === '-=') {
                if (t.type === 'cmd') {
                    for (const o of t.opts) {
                        let otxt = text.substring(o.start, o.end);
                        const m = otxt.match(/([\d\.]+)/);
                        if (m) {
                            let currV = parseFloat(m[1]);
                            let delta = parseFloat(action.match(/[\d\.]+/)?.[0] || "0");
                            if (action.includes('%')) {delta = currV * (delta / 100);}
                            let newV = Math.round((op === '+=' ? currV + delta : currV - delta) * 100) / 100;
                            
                            // Edit directly on option
                            const replaceRange = new vscode.Range(document.positionAt(o.start), document.positionAt(o.end));
                            edit.replace(document.uri, replaceRange, otxt.replace(m[1], newV.toString()));
                        }
                    }
                    continue; // Skip main replacement since we edited options
                }
            }

            // Apply subsequent pipes (Traits, etc)
            for (let i = 1; i < pipes.length; i++) {
                const p = pipes[i];
                if (p === '+ bold') {val = `\\textbf{${val}}`;}
                else if (p === '- clear') {val = val.replace(/\\(?:textbf|textit|underline)\{([^}]+)\}/g, '$1');}
            }

            // 4. Register Edit
            if (cursorType === 'end') {
                edit.insert(document.uri, document.positionAt(t.end), val);
            } else if (cursorType === 'start') {
                edit.insert(document.uri, document.positionAt(t.start), val);
            } else {
                let s = t.start;
                let e = t.end;
                if (isContentSelector) {
                    if (t.type === 'cmd' && t.args.length > 0) { s = t.args[0].start; e = t.args[0].end; }
                    else if (t.type === 'env') {
                        s += `\\begin{${t.name}}`.length;
                        e -= `\\end{${t.name}}`.length;
                    }
                }
                edit.replace(document.uri, new vscode.Range(document.positionAt(s), document.positionAt(e)), val);
            }
        }

        // Apply all edits transactionally
        return await vscode.workspace.applyEdit(edit);
    }
}