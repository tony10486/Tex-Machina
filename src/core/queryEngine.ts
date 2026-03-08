import * as vscode from 'vscode';

// --- AST Nodes ---
export interface LatexNode {
    type: 'root' | 'cmd' | 'env' | 'arg' | 'opt' | 'text' | 'prop' | 'val';
    name?: string;
    start: number; 
    end: number;
    contentStart?: number;
    contentEnd?: number;
    children: LatexNode[];
    opts: LatexNode[];
    args: LatexNode[];
    parent?: LatexNode;
}

// --- Semantic Scanner ---
export class SemanticScanner {
    constructor(private text: string) {}

    public scan(textSegment?: string, offset: number = 0, parentNode?: LatexNode): LatexNode {
        const txt = textSegment !== undefined ? textSegment : this.text;
        const root: LatexNode = { type: 'root', start: offset, end: offset + txt.length, children: [], opts: [], args: [], parent: parentNode };
        const occupied: {start: number, end: number}[] = [];

        const envRegex = /\\begin\{([a-zA-Z*]+)\}/g;
        let match;
        while ((match = envRegex.exec(txt)) !== null) {
            const envName = match[1];
            const startPos = match.index;
            if (occupied.some(occ => startPos >= occ.start && startPos < occ.end)) continue;

            const openTagEnd = match.index + match[0].length;
            const envNode: LatexNode = { 
                type: 'env', name: envName, start: offset + startPos, end: offset + startPos, 
                children: [], opts: [], args: [], parent: parentNode || root
            };

            let currentPos = openTagEnd;
            while (currentPos < txt.length) {
                if (/\s/.test(txt[currentPos])) { currentPos++; continue; }
                if (txt[currentPos] === '[') {
                    const e = this.findMatching(txt, currentPos, '[', ']');
                    if (e !== -1) {
                        const optNode: LatexNode = { type: 'opt', start: offset + currentPos + 1, end: offset + e - 1, children: [], opts: [], args: [], parent: envNode };
                        envNode.opts.push(optNode); envNode.children.push(optNode);
                        currentPos = e; continue;
                    }
                }
                if (txt[currentPos] === '{') {
                    const e = this.findMatching(txt, currentPos, '{', '}');
                    if (e !== -1) {
                        const argNode: LatexNode = { type: 'arg', start: offset + currentPos + 1, end: offset + e - 1, children: [], opts: [], args: [], parent: envNode };
                        envNode.args.push(argNode); envNode.children.push(argNode);
                        currentPos = e; continue;
                    }
                }
                break;
            }

            envNode.contentStart = offset + currentPos;
            const endTag = `\\end{${envName}}`;
            let endTagIdx = -1, depth = 1, searchPos = currentPos;
            while (depth > 0) {
                const nextBegin = txt.indexOf(`\\begin{${envName}}`, searchPos);
                const nextEnd = txt.indexOf(endTag, searchPos);
                if (nextEnd === -1) break;
                if (nextBegin !== -1 && nextBegin < nextEnd) {
                    depth++; searchPos = nextBegin + `\\begin{${envName}}`.length;
                } else {
                    depth--;
                    if (depth === 0) endTagIdx = nextEnd;
                    else searchPos = nextEnd + endTag.length;
                }
            }

            if (endTagIdx !== -1) {
                const endPos = endTagIdx + endTag.length;
                envNode.contentEnd = offset + endTagIdx;
                envNode.end = offset + endPos;
                const innerText = txt.substring(currentPos, endTagIdx);
                const innerRoot = this.scan(innerText, offset + currentPos, envNode);
                envNode.children.push(...innerRoot.children);
                root.children.push(envNode);
                occupied.push({ start: startPos, end: endPos });
            }
        }

        const cmdRegex = /\\([a-zA-Z]+)/g;
        while ((match = cmdRegex.exec(txt)) !== null) {
            const s = match.index;
            if (occupied.some(occ => s >= occ.start && s < occ.end)) continue;
            const cmdNode: LatexNode = { type: 'cmd', name: match[1], start: offset + s, end: offset + s + match[0].length, children: [], opts: [], args: [], parent: parentNode || root };
            let pos = s + match[0].length;
            while (pos < txt.length) {
                if (/\s/.test(txt[pos])) { pos++; continue; }
                if (txt[pos] === '[') {
                    const e = this.findMatching(txt, pos, '[', ']');
                    if (e !== -1) {
                        const optNode: LatexNode = { type: 'opt', start: offset + pos + 1, end: offset + e - 1, children: [], opts: [], args: [], parent: cmdNode };
                        this.scanProperties(txt, optNode, offset);
                        cmdNode.opts.push(optNode); cmdNode.children.push(optNode);
                        pos = e; continue;
                    }
                }
                if (txt[pos] === '{') {
                    const e = this.findMatching(txt, pos, '{', '}');
                    if (e !== -1) {
                        const argNode: LatexNode = { type: 'arg', start: offset + pos + 1, end: offset + e - 1, children: [], opts: [], args: [], parent: cmdNode };
                        const argInner = this.scan(txt.substring(pos + 1, e - 1), offset + pos + 1, argNode);
                        argNode.children = argInner.children;
                        cmdNode.args.push(argNode); cmdNode.children.push(argNode);
                        pos = e; continue;
                    }
                }
                break;
            }
            cmdNode.end = offset + pos; root.children.push(cmdNode); occupied.push({ start: s, end: pos });
        }

        const wordRegex = /[a-zA-Z0-9_=]+/g;
        while ((match = wordRegex.exec(txt)) !== null) {
            const s = match.index;
            if (s > 0 && txt[s - 1] === '\\') continue;
            if (occupied.some(occ => s >= occ.start && s < occ.end)) continue;
            root.children.push({ type: 'text', start: offset + s, end: offset + s + match[0].length, children: [], opts: [], args: [], parent: parentNode || root });
        }
        return root;
    }

    private scanProperties(fullTxt: string, optNode: LatexNode, docOffset: number) {
        const txt = fullTxt.substring(optNode.start - docOffset, optNode.end - docOffset);
        const propRegex = /([a-zA-Z]+)=([^,\]]+)/g;
        let m;
        while ((m = propRegex.exec(txt)) !== null) {
            const propNode: LatexNode = { type: 'prop', name: m[1], start: optNode.start + m.index, end: optNode.start + m.index + m[1].length, children: [], opts: [], args: [], parent: optNode };
            const valNode: LatexNode = { type: 'val', start: optNode.start + m.index + m[0].indexOf(m[2]), end: optNode.start + m.index + m[0].length, children: [], opts: [], args: [], parent: propNode };
            propNode.children.push(valNode); optNode.children.push(propNode);
        }
    }

    private findMatching(txt: string, start: number, open: string, close: string): number {
        let depth = 0;
        for (let i = start; i < txt.length; i++) {
            if (txt[i] === open) depth++;
            else if (txt[i] === close) { depth--; if (depth === 0) return i + 1; }
        }
        return -1;
    }
}

// --- Query Executor ---
export class HSQEngine {
    private static globalState: Record<string, string> = {};
    private static registers: Record<string, string> = {};
    private static globalCounter: number = 0;

    constructor(private editor: vscode.TextEditor) {}

    private shortcuts: Record<string, string[]> = {
        'img': ['includegraphics'], 'fig': ['figure', 'figure*'], 'tbl': ['tabular', 'table', 'longtable', 'tabular*'],
        'eq': ['equation', 'align', 'gather', 'multline', 'gather*', 'math'], 
        'math': ['equation', 'align', 'gather', 'text', 'math'],
        'cell': ['tabular', 'table', 'longtable', 'tabular*', 'array']
    };

    private expand(n: string): string[] {
        let c = n.replace(/^[@\\]+/, '');
        const envM = n.match(/\\begin\{([a-zA-Z*]+)\}/);
        if (envM) c = envM[1];
        if (n.startsWith('@') && this.shortcuts[c]) return this.shortcuts[c];
        return [c];
    }

    private parseAction(raw: string) {
        const actionOps = ['>>', ':=', '+=', '-=', '><', '<>', '>+<', '+>', '<+', '^^', 'vv', '<->', '<=>'];
        let op = "", opIdx = -1;
        for (const ao of actionOps) {
            const idx = raw.indexOf(ao);
            if (idx !== -1 && (opIdx === -1 || idx < opIdx)) { opIdx = idx; op = ao; }
        }
        let selAndFil = raw, actionText = "";
        if (opIdx !== -1) {
            selAndFil = raw.substring(0, opIdx).trim();
            actionText = raw.substring(opIdx + op.length).trim();
        }
        let sV = "", sR = "";
        const asM = selAndFil.match(/\bas\s+\$([a-zA-Z0-9_]+)/);
        if (asM) { sV = asM[1]; selAndFil = selAndFil.replace(asM[0], '').trim(); }
        const regM = selAndFil.match(/->\s*\/\/([0-9]+)/);
        if (regM) { sR = regM[1]; selAndFil = selAndFil.replace(regM[0], '').trim(); }
        const fK = ['where', 'without', 'has'];
        let fI = -1, fil = "";
        for (const fk of fK) {
            const idx = selAndFil.search(new RegExp(`\\b${fk}\\b`));
            if (idx !== -1 && (fI === -1 || idx < fI)) fI = idx;
        }
        let sel = selAndFil;
        if (fI !== -1) { sel = selAndFil.substring(0, fI).trim(); fil = selAndFil.substring(fI).trim(); }
        return { selector: sel, filter: fil, op, actionText, storageVar: sV, storageReg: sR };
    }

    private matchNode(n: LatexNode, targetNames: string[], selector: string, text: string): boolean {
        const nt = text.substring(n.start, n.end);
        return targetNames.includes(n.name || '') || targetNames.includes(n.type) || targetNames.includes(nt);
    }

    private resolveHierarchy(selectorStr: string, root: LatexNode, text: string): LatexNode[] {
        const segments: { op: string, sel: string }[] = [];
        const regex = /\s*(>|~|\.\.\.|<|<<|\$|\s)\s*/g;
        let match; let lastIdx = 0; let lastOp = "..."; 
        while ((match = regex.exec(selectorStr)) !== null) {
            const selPart = selectorStr.substring(lastIdx, match.index).trim();
            if (selPart) segments.push({ op: lastOp, sel: selPart });
            lastOp = match[1].trim() || "..."; lastIdx = regex.lastIndex;
        }
        const finalPart = selectorStr.substring(lastIdx).trim();
        if (finalPart) segments.push({ op: lastOp, sel: finalPart });
        if (segments.length === 0) return [];
        let currentNodes: LatexNode[] = [root];
        for (const seg of segments) {
            let nextNodes: LatexNode[] = [];
            const parsed = this.parseAction(seg.sel);
            let targetSel = parsed.selector;
            let filterPart = parsed.filter;
            const targetNames = this.expand(targetSel);
            const isCell = targetSel.startsWith('@cell');
            for (const n of currentNodes) {
                const addIfMatch = (node: LatexNode) => {
                    if (isCell && this.shortcuts.cell.includes(node.name || '')) {
                        const s = node.start + `\\begin{${node.name}}`.length, e = node.end - `\\end{${node.name}}`.length;
                        const contentWithOpt = text.substring(s, e);
                        const optM = contentWithOpt.match(/^\{[^}]+\}/);
                        const startOffset = optM ? s + optM[0].length : s;
                        const inner = text.substring(startOffset, e);
                        let rowOffset = 0; const rows = inner.split(/\\\\/);
                        for (let r = 0; r < rows.length; r++) {
                            const row = rows[r]; let cellOffset = 0; const cells = row.split('&');
                            for (let i = 0; i < cells.length; i++) {
                                const cellText = cells[i]; const trimmed = cellText.trim();
                                const trimStart = cellText.indexOf(trimmed);
                                const cellStart = startOffset + rowOffset + cellOffset + (trimStart !== -1 ? trimStart : 0);
                                const cellEnd = cellStart + trimmed.length;
                                nextNodes.push({ type: 'text', start: cellStart, end: cellEnd, children: [], opts: [], args: [], parent: node });
                                cellOffset += cellText.length + 1;
                            }
                            rowOffset += row.length + 2;
                        }
                    } else if (this.matchNode(node, targetNames, targetSel, text)) nextNodes.push(node);
                };
                if (seg.op === ">") n.children.forEach(addIfMatch);
                else if (seg.op === "..." || seg.op === " ") {
                    const collect = (nodes: LatexNode[]) => { for (const child of nodes) { addIfMatch(child); collect(child.children); } };
                    addIfMatch(n); collect(n.children);
                } else if (seg.op === "~") { if (n.parent) { const idx = n.parent.children.indexOf(n); if (idx !== -1 && idx < n.parent.children.length - 1) addIfMatch(n.parent.children[idx + 1]); } }
                else if (seg.op === "<") { if (n.parent) addIfMatch(n.parent); }
                else if (seg.op === "<<") { let p = n.parent; while (p) { addIfMatch(p); p = p.parent; } }
                else if (seg.op === "$") { const collect = (nodes: LatexNode[]) => { for (const child of nodes) { addIfMatch(child); collect(child.children); } }; collect(n.children); }
            }
            currentNodes = Array.from(new Set(nextNodes));
            if (filterPart) currentNodes = currentNodes.filter(t => this.evaluateFilter(t, filterPart, text));
        }
        return currentNodes;
    }

    private evaluateFilter(t: LatexNode, filterStr: string, text: string): boolean {
        if (!filterStr) return true;
        const evalExpr = (expr: string): boolean => {
            if (expr.includes(' or ')) return expr.split(' or ').some(part => evalExpr(part.trim()));
            if (expr.includes(' and ')) return expr.split(' and ').every(part => evalExpr(part.trim()));
            if (expr.startsWith('not ')) return !evalExpr(expr.substring(4).trim());
            if (expr.startsWith('where ')) return evalExpr(expr.substring(6).trim());
            const hasC = (nodes: LatexNode[], name: string): boolean => nodes.some(n => n.name === name || hasC(n.children, name));
            if (expr.startsWith('has ')) return hasC(t.children, this.expand(expr.substring(4).trim())[0]);
            if (expr.startsWith('without ')) return !hasC(t.children, this.expand(expr.substring(8).trim())[0]);
            if (expr.startsWith('^(') && expr.endsWith(')^')) return this.resolveHierarchy(expr.slice(2, -2), t, text).length > 0;
            const tt = text.substring(t.start, t.end);
            const matchesRegex = /(.+?)\s+matches\s+\/(.*)\/(?:\s+as\s+\$([a-zA-Z0-9_]+))?/;
            const regexMatch = expr.match(matchesRegex);
            if (regexMatch) {
                const sourceVar = regexMatch[1].trim(), pattern = regexMatch[2], alias = regexMatch[3];
                let sourceText = tt;
                if (sourceVar === '$$') {
                    if (t.type === 'env' && t.contentStart !== undefined && t.contentEnd !== undefined) sourceText = text.substring(t.contentStart, t.contentEnd).trim();
                    else sourceText = (t.type === 'cmd' && t.args.length > 0) ? text.substring(t.args[0].start, t.args[0].end).trim() : tt.trim();
                } else if (sourceVar.startsWith('$')) sourceText = HSQEngine.globalState[sourceVar.substring(1)] || "";
                const re = new RegExp(pattern);
                const m = sourceText.match(re);
                if (m) {
                    if (alias) HSQEngine.globalState[alias] = m[0];
                    for (let i = 1; i < m.length; i++) HSQEngine.globalState[i.toString()] = m[i] || "";
                    return true;
                }
                return false;
            }
            return true;
        };
        return evalExpr(filterStr);
    }

    public async execute(queryStr: string): Promise<boolean> {
        if (queryStr.startsWith(';')) queryStr = queryStr.substring(1).trim();
        const document = this.editor.document; const text = document.getText();
        const root = new SemanticScanner(text).scan(); const edit = new vscode.WorkspaceEdit();
        const firstActionParsed = this.parseAction(queryStr);
        let targets = this.resolveHierarchy(firstActionParsed.selector, root, text);
        const filterToEval = firstActionParsed.filter;
        for (let j = 0; j < targets.length; j++) {
            const t = targets[j];
            for (let k = 0; k < 10; k++) delete HSQEngine.globalState[k.toString()];
            if (filterToEval && !this.evaluateFilter(t, filterToEval, text)) continue;
            let baseVal = text.substring(t.start, t.end), baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end));
            if (t.type === 'env' && t.contentStart !== undefined && t.contentEnd !== undefined) {
                baseVal = text.substring(t.contentStart, t.contentEnd);
                baseRange = new vscode.Range(document.positionAt(t.contentStart), document.positionAt(t.contentEnd));
            }
            HSQEngine.globalCounter++;
            const getV = (cv: string) => {
                const vs: Record<string, string> = { '$$': cv, '#j': (j + 1).toString(), '_': cv };
                Object.entries(HSQEngine.globalState).forEach(([k, v]) => vs[`$${k}`] = v);
                t.opts.forEach((o, idx) => { vs[`#${idx}`] = text.substring(o.start, o.end).trim(); });
                return vs;
            };
            const rep = (s: string, cv: string) => {
                let r = s; const vs = getV(cv);
                const items = Object.entries(vs).sort((a, b) => b[0].length - a[0].length);
                for (const [k, v] of items) r = r.split(k).join(v);
                return r;
            };
            const action = firstActionParsed.actionText;
            if (firstActionParsed.op === '>>') {
                const newVal = rep(action, baseVal);
                edit.replace(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)), newVal);
            }
        }
        return await vscode.workspace.applyEdit(edit);
    }
}
