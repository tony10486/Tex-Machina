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

    private parseAction(raw: string) {
        const actionOps = ['>>', ':=', '\\+=', '-=', '><', '<>', '>\\+<', '\\+>', '<\\+', '\\^\\^', 'vv'];
        const filterKeywords = ['where', 'without', 'has'];
        let op = "", opIdx = -1;
        for (const ao of actionOps) {
            const cAo = ao.replace(/\\/g, '');
            const idx = raw.indexOf(cAo); 
            if (idx !== -1 && (opIdx === -1 || idx < opIdx)) { opIdx = idx; op = cAo; }
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
        else if (sel.endsWith('.|')) { cM = 'inside-end'; sel = sel.slice(0, -2); }
        else if (sel.startsWith('|') && sel.endsWith('.')) { cM = 'after'; sel = sel.slice(1, -1); }

        return { selector: sel, filter: fil, op, actionText: aT, storageVar: sV, storageReg: sR, cursorMode: cM };
    }

    public async execute(queryStr: string): Promise<boolean> {
        if (queryStr.startsWith(';')) queryStr = queryStr.substring(1).trim();
        HSQEngine.globalCounter = 0;

        const document = this.editor.document;
        const text = document.getText();
        const root = new SemanticScanner(text).scan();
        const edit = new vscode.WorkspaceEdit();

        const pipes: string[] = [];
        let buf = "";
        for (let i = 0; i < queryStr.length; i++) {
            const c = queryStr[i], p = i > 0 ? queryStr[i-1] : "", n = i < queryStr.length - 1 ? queryStr[i+1] : "";
            if (c === '|' && p !== '.' && n !== '.') { pipes.push(buf.trim()); buf = ""; }
            else buf += c;
        }
        if (buf.trim()) pipes.push(buf.trim());
        if (pipes.length === 0) return false;

        let command = 'find', firstPart = pipes[0];
        const cmdM = firstPart.match(/^(find|move|exchange|duplicate|delete|insert|extract)\b/);
        if (cmdM) { command = cmdM[1]; firstPart = firstPart.substring(cmdM[0].length).trim(); }

        const actionsRaw = firstPart.split(/\s+&\s+/).map(a => a.trim());
        const primary = this.parseAction(actionsRaw[0]);
        let sel = primary.selector;
        const isContent = sel.endsWith(':*');
        if (isContent) sel = sel.slice(0, -2);
        let pseudo = "";
        if (sel.includes(':')) { const pts = sel.split(':'); sel = pts[0]; pseudo = pts[1]; }

        const shortcuts: Record<string, string[]> = {
            'img': ['includegraphics'], 'fig': ['figure', 'figure*'], 'tbl': ['tabular', 'table'],
            'eq': ['equation', 'align', 'gather', 'multline'], 'math': ['equation', 'align', 'gather', 'text']
        };
        const expand = (n: string): string[] => {
            const c = n.replace(/^[@\\]/, '');
            return (n.startsWith('@') && shortcuts[c]) ? shortcuts[c] : [c];
        };

        const targetNames = expand(sel);
        let targets: LatexNode[] = [];
        const collect = (nodes: LatexNode[]) => {
            for (const n of nodes) {
                const nt = text.substring(n.start, n.end);
                const isM = targetNames.includes(n.name || '') || targetNames.includes(n.type) || targetNames.includes(nt) || (sel.startsWith('\\begin{') && nt.startsWith(sel));
                if (isM) targets.push(n);
                collect(n.children);
            }
        };
        collect(root.children);

        if (primary.filter) {
            targets = targets.filter(t => {
                const tt = text.substring(t.start, t.end);
                const hasC = (nodes: LatexNode[], name: string): boolean => nodes.some(n => n.name === name || hasC(n.children, name));
                if (primary.filter.startsWith('without')) return !hasC(t.children, expand(primary.filter.substring(7).trim())[0]);
                if (primary.filter.startsWith('has')) return hasC(t.children, expand(primary.filter.substring(3).trim())[0]);
                if (primary.filter.startsWith('where')) {
                    const m = primary.filter.match(/where\s+\$\$\s*==\s*"(.*?)"/);
                    if (m) {
                        let c = (t.type === 'env') ? tt.substring(`\\begin{${t.name}}`.length, tt.length - `\\end{${t.name}}`.length).trim() : (t.type === 'cmd' && t.args.length > 0) ? text.substring(t.args[0].start, t.args[0].end).trim() : tt.trim();
                        return c === m[1];
                    }
                }
                return true;
            });
        }

        if (pseudo === 'first') targets = targets.slice(0, 1);
        if (pseudo === 'last') targets = targets.slice(-1);

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
                ...Object.fromEntries(Object.entries(HSQEngine.globalState).map(([k, v]) => [`$${k}`, v])),
                ...Object.fromEntries(Object.entries(HSQEngine.registers).map(([k, v]) => [`//${k}`, v])),
                ...Object.fromEntries(t.opts.flatMap(o => text.substring(o.start, o.end).split(',').map(p => {
                    const [pk, pv] = p.split('=').map(s => s.trim());
                    return pk && pv ? [`#${pk}`, pv] : null;
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
                    if (ev.includes('%')) {
                        const m = ev.match(/([\d\.]+)\s*([\+\-\*\/])\s*([\d\.]+)%/);
                        if (m) {
                            const b = parseFloat(m[1]), o = m[2], p = parseFloat(m[3])/100;
                            return Math.round(o === '+' ? b * (1+p) : b * (1-p)).toString();
                        }
                    }
                    return eval(ev.replace(/[a-zA-Z#]+/g, '')).toString();
                } catch { return ex; }
            };

            if (command === 'delete') edit.delete(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)));
            else if (command === 'duplicate') edit.insert(document.uri, document.positionAt(t.end), "\n" + fullVal);
            else if (command === 'move') {
                const a = this.parseAction(actionsRaw[0]);
                const rawD = rep(a.actionText.replace('.|', '').replace('|.', '').trim(), baseVal);
                const findD = (nodes: LatexNode[]): LatexNode | undefined => {
                    for (const n of nodes) {
                        const dNames = expand(rawD);
                        if ((n.name && dNames.includes(n.name)) || dNames.includes(n.type) || text.substring(n.start, n.end).includes(rawD)) return n;
                        const cr = findD(n.children); if (cr) return cr;
                    }
                };
                const dNode = findD(root.children);
                if (dNode) {
                    edit.delete(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)));
                    edit.insert(document.uri, document.positionAt(a.actionText.includes('.|') ? dNode.end : dNode.start), fullVal);
                }
            } else {
                let currentVal = baseVal;
                let prependStr = "", appendStr = "";
                let didReplace = false;

                for (const aRaw of actionsRaw) {
                    const a = this.parseAction(aRaw);
                    if (a.storageVar) HSQEngine.globalState[a.storageVar] = currentVal;
                    if (a.storageReg) HSQEngine.registers[a.storageReg] = currentVal;
                    if (!a.op) continue;
                    let actRes = currentVal;
                    
                    if (a.op === '>>' || a.op === ':=') {
                        if (a.actionText.includes('#') && !a.actionText.includes('"')) {
                            const pN = a.actionText.split(':=')[0].trim().replace('#', '');
                            const rM = evalM(a.actionText.includes(':=') ? a.actionText.split(':=')[1].trim() : a.actionText, currentVal);
                            if (a.actionText.includes(':=')) {
                                const opt = t.opts.find(o => text.substring(o.start, o.end).includes(pN));
                                if (opt) { edit.replace(document.uri, new vscode.Range(document.positionAt(opt.start), document.positionAt(opt.end)), text.substring(opt.start, opt.end).replace(new RegExp(`${pN}=([\\d\\.]+)`), `${pN}=${rM}`)); continue; }
                            }
                            actRes = rM;
                        } else actRes = rep(a.actionText, currentVal);
                    }
                    else if (a.op === '><') actRes = `\\begin{${rep(a.actionText, currentVal)}}\n${isContent ? currentVal : fullVal}\n\\end{${rep(a.actionText, currentVal)}}`;
                    else if (a.op === '<>') { 
                        if (t.type === 'env') { actRes = fullVal.substring(`\\begin{${t.name}}`.length, fullVal.length - `\\end{${t.name}}`.length).trim(); baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)); }
                    }
                    else if (a.op === '>+<') { const wrap = isContent ? currentVal : fullVal; actRes = a.actionText.includes('$$') ? rep(a.actionText, currentVal) : `${rep(a.actionText, currentVal)}${wrap}${rep(a.actionText, currentVal)}`; if (!isContent) baseRange = new vscode.Range(document.positionAt(t.start), document.positionAt(t.end)); }
                    else if (a.op === '+>') { actRes = rep(a.actionText, currentVal); }
                    else if (a.op === '<+') { actRes = rep(a.actionText, currentVal); }
                    else if (a.op === '^^') {
                        let pe = t.parent; while (pe && pe.type !== 'env' && pe.type !== 'root') pe = pe.parent;
                        if (pe && pe.type !== 'root') { edit.delete(document.uri, new vscode.Range(document.positionAt(t.start), document.positionAt(t.end))); edit.insert(document.uri, document.positionAt(pe.end), "\n" + fullVal); return await vscode.workspace.applyEdit(edit); }
                    }

                    if (a.op === '+>') { appendStr += actRes; continue; }
                    if (a.op === '<+') { prependStr = actRes + prependStr; continue; }

                    if (a.cursorMode === 'before') { prependStr = actRes + prependStr; }
                    else if (a.cursorMode === 'after') { appendStr += actRes; }
                    else if (a.cursorMode === 'inside-start') { currentVal = actRes + currentVal; didReplace = true; }
                    else if (a.cursorMode === 'inside-end') { currentVal = currentVal + actRes; didReplace = true; }
                    else { currentVal = actRes; didReplace = true; }
                }

                if (didReplace) {
                    for (let i = 1; i < pipes.length; i++) {
                        const p = pipes[i];
                        if (p === '+ bold') currentVal = `\\textbf{${currentVal}}`;
                        else if (p === '+ italic') currentVal = `\\textit{${currentVal}}`;
                        else if (p === '- clear') currentVal = currentVal.replace(/\\(?:textbf|textit|underline)\{([^}]+)\}/g, '$1');
                    }
                }

                if (prependStr) edit.insert(document.uri, document.positionAt(t.start), prependStr);
                if (appendStr) edit.insert(document.uri, document.positionAt(t.end), appendStr);
                if (didReplace && currentVal !== baseVal) edit.replace(document.uri, baseRange, currentVal);
            }
        }
        return await vscode.workspace.applyEdit(edit);
    }
}
