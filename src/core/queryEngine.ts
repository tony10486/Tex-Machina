import * as vscode from 'vscode';

// --- AST Nodes ---
export interface LatexNode {
    type: 'root' | 'cmd' | 'env' | 'arg' | 'opt' | 'text' | 'prop' | 'val';
    name?: string;
    start: number; 
    end: number;
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

        const envRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
        let match;
        while ((match = envRegex.exec(txt)) !== null) {
            const envNode: LatexNode = { 
                type: 'env', name: match[1], start: offset + match.index, end: offset + match.index + match[0].length, 
                children: [], opts: [], args: [], parent: parentNode || root
            };
            const innerRoot = this.scan(match[2], offset + match.index + `\\begin{${match[1]}}`.length, envNode);
            envNode.children = innerRoot.children;
            root.children.push(envNode);
            occupied.push({ start: match.index, end: match.index + match[0].length });
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
            cmdNode.end = offset + pos;
            root.children.push(cmdNode);
            occupied.push({ start: s, end: pos });
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
        'cell': ['tabular', 'table', 'longtable', 'tabular*', 'array'],
        'eslint.config.mjs': ['eslint.config.mjs'],
        'requirements.txt': ['requirements.txt'],
        'mathSplitter.test.ts': ['mathSplitter.test.ts']
    };

    private expand(n: string): string[] {
        const c = n.replace(/^[@\\]+/, '');
        if (n.startsWith('@') && this.shortcuts[c]) return this.shortcuts[c];
        return [c];
    }

    private parseAction(raw: string) {
        const actionOps = ['>>', ':=', '+=', '-=', '><', '<>', '>+<', '+>', '<+', '^^', 'vv'];
        let op = "", opIdx = -1;
        for (const ao of actionOps) {
            const idx = raw.indexOf(ao); 
            if (idx !== -1 && (opIdx === -1 || idx < opIdx)) { opIdx = idx; op = ao; }
        }
        let aT = "", sf = raw;
        if (opIdx !== -1) { aT = raw.substring(opIdx + op.length).trim(); sf = raw.substring(0, opIdx).trim(); }
        
        let sV = "", sR = "";
        const asM = sf.match(/\bas\s+\$([a-zA-Z0-9_]+)/);
        if (asM) { sV = asM[1]; sf = sf.replace(asM[0], '').trim(); }
        const regM = sf.match(/->\s*\/\/([0-9]+)/);
        if (regM) { sR = regM[1]; sf = sf.replace(regM[0], '').trim(); }

        const fK = ['where', 'without', 'has'];
        let fI = -1;
        for (const fk of fK) {
            const idx = sf.search(new RegExp(`\\b${fk}\\b`));
            if (idx !== -1 && (fI === -1 || idx < fI)) fI = idx;
        }
        let sel = sf, fil = "";
        if (fI !== -1) { sel = sf.substring(0, fI).trim(); fil = sf.substring(fI).trim(); }
        
        let cM: 'before' | 'after' | 'inside-start' | 'inside-end' | 'replace' = 'replace';
        if (sel.startsWith('.|') && sel.endsWith('|')) { cM = 'inside-start'; sel = sel.slice(2, -1); }
        else if (sel.startsWith('.|')) { cM = 'before'; sel = sel.slice(2); }
        else if (sel.endsWith('|.')) { cM = 'after'; sel = sel.slice(0, -2); }
        else if (sel.endsWith('.|')) { cM = 'inside-end'; sel = sel.slice(0, -2); }
        else if (sel.startsWith('|') && sel.endsWith('.')) { cM = 'after'; sel = sel.slice(1, -1); }

        return { selector: sel, filter: fil, op, actionText: aT, storageVar: sV, storageReg: sR, cursorMode: cM };
    }

    private matchNode(n: LatexNode, targetNames: string[], selector: string, text: string): boolean {
        const nt = text.substring(n.start, n.end);
        return targetNames.includes(n.name || '') || targetNames.includes(n.type) || targetNames.includes(nt) || (selector.startsWith('\\begin{') && nt.startsWith(selector));
    }

    private resolveHierarchy(selectorStr: string, root: LatexNode, text: string): LatexNode[] {
        const segments: { op: string, sel: string }[] = [];
        const regex = /\s*(>|~|\.\.\.|<|<<|\$|\s)\s*/g;
        let match;
        let lastIdx = 0;
        let lastOp = "..."; 

        while ((match = regex.exec(selectorStr)) !== null) {
            const selPart = selectorStr.substring(lastIdx, match.index).trim();
            if (selPart) segments.push({ op: lastOp, sel: selPart });
            lastOp = match[1].trim() || "...";
            lastIdx = regex.lastIndex;
        }
        const finalPart = selectorStr.substring(lastIdx).trim();
        if (finalPart) segments.push({ op: lastOp, sel: finalPart });

        if (segments.length === 0) return [];

        let currentNodes: LatexNode[] = [root];
        for (const seg of segments) {
            let nextNodes: LatexNode[] = [];
            let targetSel = seg.sel;
            let filterPart = "";
            const fK = ['where', 'without', 'has'];
            for (const fk of fK) {
                const idx = targetSel.search(new RegExp(`\\b${fk}\\b`));
                if (idx !== -1) {
                    filterPart = targetSel.substring(idx);
                    targetSel = targetSel.substring(0, idx).trim();
                    break;
                }
            }
            if (targetSel.includes('[') && targetSel.endsWith(']')) {
                const i = targetSel.indexOf('[');
                filterPart = "where " + targetSel.substring(i + 1, targetSel.length - 1);
                targetSel = targetSel.substring(0, i).trim();
            }

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
                        let rowOffset = 0;
                        const rows = inner.split(/\\\\/);
                        for (let r = 0; r < rows.length; r++) {
                            const row = rows[r];
                            let cellOffset = 0;
                            const cells = row.split('&');
                            for (let i = 0; i < cells.length; i++) {
                                const cellText = cells[i];
                                const trimmed = cellText.trim();
                                const trimStart = cellText.indexOf(trimmed);
                                const cellStart = startOffset + rowOffset + cellOffset + (trimStart !== -1 ? trimStart : 0);
                                const cellEnd = cellStart + trimmed.length;
                                nextNodes.push({ type: 'text', start: cellStart, end: cellEnd, children: [], opts: [], args: [], parent: node });
                                cellOffset += cellText.length + 1;
                            }
                            rowOffset += row.length + 2;
                        }
                    } else if (this.matchNode(node, targetNames, targetSel, text)) {
                        nextNodes.push(node);
                    }
                };

                if (seg.op === ">") n.children.forEach(addIfMatch);
                else if (seg.op === "..." || seg.op === " ") {
                    const collect = (nodes: LatexNode[]) => {
                        for (const child of nodes) {
                            addIfMatch(child);
                            collect(child.children);
                        }
                    };
                    addIfMatch(n);
                    collect(n.children);
                } else if (seg.op === "~") {
                    if (n.parent) {
                        const idx = n.parent.children.indexOf(n);
                        if (idx !== -1 && idx < n.parent.children.length - 1) addIfMatch(n.parent.children[idx + 1]);
                    }
                } else if (seg.op === "<") {
                    if (n.parent) addIfMatch(n.parent);
                } else if (seg.op === "<<") {
                    let p = n.parent; while (p) { addIfMatch(p); p = p.parent; }
                } else if (seg.op === "$") {
                    const collect = (nodes: LatexNode[]) => {
                        for (const child of nodes) {
                            addIfMatch(child); collect(child.children);
                        }
                    };
                    collect(n.children);
                }
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

            if (expr.startsWith('^(') && expr.endsWith(')^')) {
                const sub = expr.slice(2, -2);
                return this.resolveHierarchy(sub, t, text).length > 0;
            }

            const tt = text.substring(t.start, t.end);
            const regexMatch = expr.match(/\$\$\s+matches\s+\/(.*)\//);
            if (regexMatch) {
                const content = (t.type === 'env') ? tt.substring(`\\begin{${t.name}}`.length, tt.length - `\\end{${t.name}}`.length).trim() : (t.type === 'cmd' && t.args.length > 0) ? text.substring(t.args[0].start, t.args[0].end).trim() : tt.trim();
                return new RegExp(regexMatch[1]).test(content);
            }

            const numCompMatch = expr.match(/(?:#|_#)([a-zA-Z]+)\s*(>|<|>=|<=|==|!=)\s*([\d\.]+(?:[a-z]+|%)?)/);
            if (numCompMatch) {
                const propName = numCompMatch[1];
                const op = numCompMatch[2];
                const valStr = numCompMatch[3];
                let actual: number | undefined;
                for (const opt of t.opts) {
                    const optText = text.substring(opt.start, opt.end);
                    const m = optText.match(new RegExp(`${propName}=([\\d\\.]+)`));
                    if (m) { actual = parseFloat(m[1]); break; }
                }
                if (actual !== undefined) {
                    const target = parseFloat(valStr);
                    if (op === '>') return actual > target;
                    if (op === '<') return actual < target;
                    if (op === '>=') return actual >= target;
                    if (op === '<=') return actual <= target;
                    if (op === '==') return actual === target;
                    if (op === '!=') return actual !== target;
                }
                return false;
            }

            const eqMatch = expr.match(/\$\$\s*==\s*"(.*?)"/);
            if (eqMatch) {
                const content = (t.type === 'env') ? tt.substring(`\\begin{${t.name}}`.length, tt.length - `\\end{${t.name}}`.length).trim() : (t.type === 'cmd' && t.args.length > 0) ? text.substring(t.args[0].start, t.args[0].end).trim() : tt.trim();
                return content === eqMatch[1];
            }

            return true;
        };

        return evalExpr(filterStr);
    }

    public async execute(queryStr: string): Promise<boolean> {
        if (queryStr.startsWith(';')) queryStr = queryStr.substring(1).trim();
        HSQEngine.globalCounter = 0;

        const syncStages = queryStr.split(/\s+&&\s+/);
        if (syncStages.length > 1) {
            for (const stage of syncStages) {
                await this.execute(";" + stage);
            }
            return true;
        }

        const document = this.editor.document;
        const text = document.getText();
        const root = new SemanticScanner(text).scan();
        const edit = new vscode.WorkspaceEdit();

        const pipes: string[] = queryStr.split(/\s*(?<!\.)\|(?!\.)\s*/);
        if (pipes.length === 0) return false;

        let firstPart = pipes[0];
        let command = 'find';
        const cmdM = firstPart.match(/^(find|move|exchange|duplicate|delete|insert|extract)\b/);
        if (cmdM) { command = cmdM[1]; firstPart = firstPart.substring(cmdM[0].length).trim(); }

        const firstActionParsed = this.parseAction(firstPart);
        let selStr = firstActionParsed.selector;
        let orderBy: string | null = null;
        let actionsRaw: string[] = [];

        if (firstPart.includes('{')) {
            const start = firstPart.indexOf('{'), end = firstPart.lastIndexOf('}');
            selStr = firstPart.substring(0, start).trim();
            const obM = selStr.match(/order by\s+([^\s{}&]+)/);
            if (obM) { orderBy = obM[1]; selStr = selStr.replace(obM[0], '').trim(); }
            actionsRaw = firstPart.substring(start + 1, end).split(/,(?![^()]*\))/).map(a => a.trim());
        } else {
            const pts = firstPart.split(/\s+&\s+/);
            const obM = pts[0].match(/order by\s+([^\s&]+)/);
            if (obM) { orderBy = obM[1]; pts[0] = pts[0].replace(obM[0], '').trim(); }
            
            const firstA = this.parseAction(pts[0]);
            selStr = firstA.selector;
            actionsRaw = pts.map(p => p.trim());
            if (actionsRaw.length === 0) actionsRaw = [""]; 
        }

        const isContent = selStr.endsWith(':*');
        if (isContent) selStr = selStr.slice(0, -2);
        let pseudo = "";
        if (selStr.includes(':') && !selStr.includes('\\begin{')) { 
            const pts = selStr.split(':'); selStr = pts[0]; pseudo = pts[1]; 
        }

        let targets = this.resolveHierarchy(selStr, root, text);
        if (firstActionParsed.filter && !firstPart.includes('{')) {
            targets = targets.filter(t => this.evaluateFilter(t, firstActionParsed.filter, text));
        }

        // To avoid overlapping ranges, only take top-most targets if they are nested
        targets = targets.filter((t1, i) => !targets.some((t2, j) => i !== j && t1.start >= t2.start && t1.end <= t2.end));

        if (orderBy) {
            targets.sort((a, b) => {
                if (orderBy === '$$') {
                    const valA = text.substring(a.start, a.end), valB = text.substring(b.start, b.end);
                    return valA.localeCompare(valB);
                }
                if (orderBy?.startsWith('#')) {
                    const prop = orderBy.substring(1);
                    const getP = (node: LatexNode) => {
                        for (const o of node.opts) {
                            const m = text.substring(o.start, o.end).match(new RegExp(`${prop}=([\\d\\.]+)`));
                            if (m) return parseFloat(m[1]);
                        }
                        return 0;
                    };
                    return getP(a) - getP(b);
                }
                return 0;
            });
        }

        if (pseudo === 'first') targets = targets.slice(0, 1);
        else if (pseudo === 'last') targets = targets.slice(-1);
        else if (pseudo && pseudo.startsWith('nth(')) {
            const n = parseInt(pseudo.match(/\d+/)?.[0] || "1");
            targets = targets.slice(n - 1, n);
        }

        if (command === 'extract' && targets.length > 0) {
            edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), targets.map(t => text.substring(t.start, t.end)).join('\n\n'));
            return await vscode.workspace.applyEdit(edit);
        }

        for (let j = 0; j < targets.length; j++) {
            const t = targets[j];
            const fullVal = text.substring(t.start, t.end);
            let baseVal = fullVal, baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end));

            if (isContent || (t.type === 'cmd' && t.args.length > 0)) {
                if (t.type === 'cmd' && t.args.length > 0) {
                    baseVal = text.substring(t.args[0].start, t.args[0].end);
                    baseRange = new vscode.Range(document.positionAt(t.args[0].start), document.positionAt(t.args[0].end));
                } else if (t.type === 'env') {
                    const s = t.start + `\\begin{${t.name}}`.length, e = t.end - `\\end{${t.name}}`.length;
                    baseVal = text.substring(s, e); baseRange = new vscode.Range(document.positionAt(s), document.positionAt(e));
                }
            }

            HSQEngine.globalCounter++;
            const getV = (cv: string) => ({
                '$$': cv, '#i': HSQEngine.globalCounter.toString(), '#j': (j + 1).toString(),
                '_': cv, '_#w': 'width', '_#h': 'height',
                ...Object.fromEntries(Object.entries(HSQEngine.globalState).map(([k, v]) => [`$${k}`, v])),
                ...Object.fromEntries(Object.entries(HSQEngine.registers).map(([k, v]) => [`//${k}`, v])),
                ...Object.fromEntries(t.opts.flatMap(o => text.substring(o.start, o.end).split(',').map(p => {
                    const [pk, pv] = p.split('=').map(s => s.trim());
                    return pk && pv ? [`#${pk}`, pv] : pk ? [`#${pk}`, pk] : null;
                }).filter(Boolean)) as [string, string][])
            });

            const rep = (s: string, cv: string) => {
                let r = s; const vs = getV(cv);
                for (const [k, v] of Object.entries(vs)) r = r.split(k).join(v);
                return r.replace(/^['"]|['"]$/g, '');
            };

            const evalM = (ex: string, cv: string) => {
                const vs = getV(cv); let ev = ex;
                for (const [k, v] of Object.entries(vs)) if (!isNaN(parseFloat(v))) ev = ev.split(k).join(v);
                try {
                    const percM = ev.match(/([\d\.]+)\s*([\+\-\*\/=]+)\s*([\d\.]+)%/);
                    if (percM) {
                        const b = parseFloat(percM[1]), o = percM[2], p = parseFloat(percM[3])/100;
                        if (o.includes('+')) return Math.round(b * (1+p)).toString();
                        if (o.includes('-')) return Math.round(b * (1-p)).toString();
                    }
                    const clean = ev.replace(/[a-zA-Z#_]+/g, '').trim();
                    return eval(clean || "0").toString();
                } catch { return ex; }
            };

            if (command === 'delete') edit.delete(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)));
            else if (command === 'duplicate') edit.insert(document.uri, document.positionAt(t.end), "\n" + fullVal);
            else if (command === 'move') {
                const a = this.parseAction(actionsRaw[0]);
                const rawD = rep(a.actionText.replace('.|', '').replace('|.', '').trim(), baseVal);
                const findD = this.resolveHierarchy(rawD, root, text)[0];
                if (findD) {
                    edit.delete(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)));
                    edit.insert(document.uri, document.positionAt(a.actionText.includes('.|') ? findD.end : findD.start), fullVal);
                }
            } else if (command === 'exchange') {
                const a = this.parseAction(actionsRaw[0]);
                let target2Str = rep(a.actionText, baseVal);
                let t2Pseudo = "";
                if (target2Str.includes(':') && !target2Str.includes('\\begin{')) {
                    const pts = target2Str.split(':'); target2Str = pts[0]; t2Pseudo = pts[1];
                }
                const rootAgain = new SemanticScanner(text).scan();
                let target2Nodes = this.resolveHierarchy(target2Str, rootAgain, text);
                if (t2Pseudo === 'first') target2Nodes = target2Nodes.slice(0, 1);
                if (t2Pseudo === 'last') target2Nodes = target2Nodes.slice(-1);
                if (target2Nodes.length > 0) {
                    const t2 = target2Nodes[0];
                    edit.replace(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)), text.substring(t2.start, t2.end));
                    edit.replace(document.uri, new vscode.Range(document.positionAt(t2.start), document.positionAt(t2.end)), fullVal);
                    break; 
                }
            } else if (command === 'insert') {
                const a = this.parseAction(actionsRaw[0]);
                let insertPos = a.actionText.startsWith('.|') ? t.start : a.actionText.endsWith('.|') ? t.end : t.start;
                edit.insert(document.uri, document.positionAt(insertPos), rep(selStr.startsWith('"') ? selStr : fullVal, baseVal));
            } else {
                let currentVal = baseVal;
                let prependStr = "", appendStr = "";
                let didReplace = false;

                const applyTrait = (p: string) => {
                    const cleanP = p.trim();
                    if (cleanP === '+ bold') { currentVal = `\\textbf{${currentVal}}`; didReplace = true; }
                    else if (cleanP === '+ italic') { currentVal = `\\textit{${currentVal}}`; didReplace = true; }
                    else if (cleanP === '- clear') {
                        if (t.type === 'cmd' || t.type === 'env') {
                            currentVal = baseVal; baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)); didReplace = true;
                        } else {
                            currentVal = currentVal.replace(/\\(?:textbf|textit|underline|sout)\{([^}]+)\}/g, '$1'); didReplace = true;
                        }
                    }
                };

                for (let aRaw of actionsRaw) {
                    if (!aRaw) continue;
                    if (aRaw.includes('bold') || aRaw.includes('italic') || aRaw.includes('clear')) { applyTrait(aRaw); continue; }
                    
                    // If it's the FIRST action and didn't start with an operator, it might have selector/filter part
                    // We need to strip them.
                    if (aRaw.includes(selStr) && !aRaw.startsWith('>>') && !aRaw.startsWith(':=') && !aRaw.startsWith('+=') && !aRaw.startsWith('-=')) {
                        const idx = aRaw.indexOf(selStr);
                        aRaw = aRaw.substring(idx + selStr.length).trim();
                    }

                    const a = this.parseAction(aRaw.startsWith('>>') || aRaw.startsWith(':=') || aRaw.startsWith('+=') || aRaw.startsWith('-=') || aRaw.startsWith('><') || aRaw.startsWith('<>') || aRaw.startsWith('>+<') || aRaw.startsWith('+>') || aRaw.startsWith('<+') || aRaw.startsWith('^^') || aRaw.startsWith('vv') ? aRaw : ">> " + aRaw);
                    if (a.storageVar) HSQEngine.globalState[a.storageVar] = currentVal;
                    if (a.storageReg) HSQEngine.registers[a.storageReg] = currentVal;
                    
                    if (a.op === '>>' || a.op === ':=' || a.op === '+=' || a.op === '-=') {
                        if (a.actionText.includes('#') && !a.actionText.includes('"')) {
                            const pMatch = a.actionText.match(/#([a-zA-Z]+)\s*(>>|:=|\+=|-=|=)?\s*(.*)/);
                            if (pMatch) {
                                const pN = pMatch[1], pOp = pMatch[2] || a.op, pValRaw = pMatch[3];
                                const pVal = pValRaw.startsWith('=') ? pValRaw.substring(1).trim() : pValRaw.trim();
                                const opt = t.opts.find(o => text.substring(o.start, o.end).includes(pN));
                                if (opt) {
                                    const optText = text.substring(opt.start, opt.end);
                                    const m = optText.match(new RegExp(`${pN}=([\\d\\.]+)`));
                                    const currentPropVal = m ? m[1] : "0";
                                    const newVal = evalM(`${currentPropVal} ${pOp.replace(':=', '').replace('>>', '').replace('=', '') || '+'} ${pVal}`, currentVal);
                                    edit.replace(document.uri, new vscode.Range(document.positionAt(opt.start), document.positionAt(opt.end)), optText.replace(new RegExp(`${pN}=([\\d\\.]+)`), `${pN}=${newVal}`));
                                } else {
                                    if (t.opts.length > 0) {
                                        const lastOpt = t.opts[t.opts.length - 1];
                                        edit.insert(document.uri, document.positionAt(lastOpt.end), `,${pN}=${rep(pVal, currentVal)}`);
                                    } else if (t.type === 'cmd') {
                                        edit.insert(document.uri, document.positionAt(t.start + t.name!.length + 1), `[${pN}=${rep(pVal, currentVal)}]`);
                                    } else if (t.type === 'env') {
                                        edit.insert(document.uri, document.positionAt(t.start + `\\begin{${t.name}}`.length), `[${pN}=${rep(pVal, currentVal)}]`);
                                    }
                                }
                            } else { currentVal = rep(a.actionText, currentVal); didReplace = true; }
                        } else { currentVal = rep(a.actionText, currentVal); didReplace = true; }
                    }
                    else if (a.op === '><') { currentVal = `\\begin{${rep(a.actionText, currentVal)}}\n${currentVal}\n\\end{${rep(a.actionText, currentVal)}}`; didReplace = true; }
                    else if (a.op === '<>') { if (t.type === 'env') { currentVal = fullVal.substring(`\\begin{${t.name}}`.length, fullVal.length - `\\end{${t.name}}`.length).trim(); didReplace = true; baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)); } }
                    else if (a.op === '>+<') { currentVal = a.actionText.includes('$$') ? rep(a.actionText, currentVal) : `${rep(a.actionText, currentVal)}${currentVal}${rep(a.actionText, currentVal)}`; didReplace = true; if (!isContent) baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)); }
                    else if (a.op === '+>') appendStr += rep(a.actionText, currentVal);
                    else if (a.op === '<+') prependStr = rep(a.actionText, currentVal) + prependStr;
                }

                for (let i = 1; i < pipes.length; i++) applyTrait(pipes[i]);

                if (didReplace || prependStr || appendStr) {
                    const fullNodeRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end));
                    if (didReplace && baseRange.isEqual(fullNodeRange)) {
                        edit.replace(document.uri, fullNodeRange, prependStr + currentVal + appendStr);
                    } else if (didReplace) {
                        const startOff = document.offsetAt(baseRange.start), endOff = document.offsetAt(baseRange.end);
                        const prefix = text.substring(t.start, startOff);
                        const suffix = text.substring(endOff, t.end);
                        edit.replace(document.uri, fullNodeRange, prependStr + prefix + currentVal + suffix + appendStr);
                    } else {
                        if (prependStr) edit.insert(document.uri, document.positionAt(t.start), prependStr);
                        if (appendStr) edit.insert(document.uri, document.positionAt(t.end), appendStr);
                    }
                }
            }
        }
        return await vscode.workspace.applyEdit(edit);
    }
}
