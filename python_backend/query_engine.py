import re
import sys
import os

sys.path.append(os.path.dirname(__file__))
from query_parser import parse_tex_machina_query

class LatexNode:
    def __init__(self, ntype, name, start, end):
        self.ntype = ntype; self.name = name; self.start = start; self.end = end
        self.children = []; self.args = []; self.opts = []
        self.cursor_pos = None
    def add_child(self, child): child.parent = self; self.children.append(child)
    def get_text(self, text): return text[self.start:self.end]

class SimpleScanner:
    def __init__(self, text): self.text = text
    def scan(self):
        root = LatexNode('root', 'root', 0, len(self.text))
        occupied = [] # List of (start, end) already taken by cmds/envs
        
        # 1. LaTeX Commands & Arguments
        for m in re.finditer(r'\\([a-zA-Z]+)', self.text):
            node = LatexNode('cmd', m.group(1), m.start(), m.end())
            pos = m.end()
            while pos < len(self.text):
                if self.text[pos] in ' \t\n\r': pos += 1; continue
                if self.text[pos] == '[':
                    e = self._find_matching(pos, '[', ']')
                    if e != -1:
                        opt = LatexNode('opt', None, pos + 1, e - 1)
                        self._scan_properties(opt); node.opts.append(opt); node.add_child(opt); pos = e; continue
                if self.text[pos] == '{':
                    e = self._find_matching(pos, '{', '}')
                    if e != -1:
                        arg = LatexNode('arg', None, pos + 1, e - 1)
                        node.args.append(arg); node.add_child(arg); pos = e; continue
                break
            node.end = pos
            root.add_child(node); occupied.append((node.start, node.end))

        # 2. Environments
        for m in re.finditer(r'\\begin\{([a-zA-Z*]+)\}(.*?)\\end\{\1\}', self.text, re.DOTALL):
            node = LatexNode('env', m.group(1), m.start(), m.end())
            root.add_child(node); occupied.append((node.start, node.end))

        # 3. Words (EXCLUDE OCCUPIED)
        for m in re.finditer(r'\b[a-zA-Z0-9_]+\b', self.text):
            s, e = m.start(), m.end()
            if any(os <= s < oe for os, oe in occupied): continue
            if s > 0 and self.text[s-1] == '\\': continue
            root.add_child(LatexNode('text', None, s, e))
            
        return root

    def _scan_properties(self, opt_node):
        txt = opt_node.get_text(self.text)
        for m in re.finditer(r'([a-zA-Z]+)=([^,\]]+)', txt):
            prop = LatexNode('prop', m.group(1), opt_node.start + m.start(1), opt_node.start + m.end(1))
            val = LatexNode('val', None, opt_node.start + m.start(2), opt_node.start + m.end(2))
            prop.add_child(val); opt_node.add_child(prop)

    def _find_matching(self, s, o, c):
        d = 0
        for i in range(s, len(self.text)):
            if self.text[i] == o: d += 1
            elif self.text[i] == c:
                d -= 1
                if d == 0: return i + 1
        return -1

class QueryExecutor:
    def __init__(self, text):
        self.text = text; self.loop_vars = {'$$': ''}; self.edits = []

    def execute_query(self, ast, context_nodes=None):
        statements = ast.get('statements', [])
        i = 0
        while i < len(statements):
            pipeline = []
            while i < len(statements):
                pipeline.append(statements[i]); sep = statements[i].get('next_sep')
                i += 1
                if sep != '|': break
            self.run_pipeline(pipeline, context_nodes)

        self.edits.sort(key=lambda x: x[0], reverse=True)
        for s, e, r in self.edits:
            self.text = self.text[:s] + r + self.text[e:]
        self.edits = []
        return {"status": "success", "text": self.text, "targets": []}

    def run_pipeline(self, pipeline, context_nodes):
        if not pipeline: return
        scanner = SimpleScanner(self.text); root = scanner.scan()
        base_pool = context_nodes if context_nodes else root.children

        targets = self.resolve_path(pipeline[0].get('target'), base_pool)
        vnodes = []
        for t in targets:
            vnodes.append({'start': t.start, 'end': t.end, 'val': t.get_text(self.text), 'node': t, 'cursor': t.cursor_pos})

        for stmt in pipeline:
            for vn in vnodes:
                self.loop_vars['$$'] = vn['val']
                if stmt.get('traits'):
                    for tr in stmt['traits']:
                        if tr['trait'] == 'bold' and tr['op'] == '+': vn['val'] = f"\\textbf{{{vn['val']}}}"
                        elif tr['trait'] == 'clear': vn['val'] = re.sub(r'\\(?:textbf|textit)\{(.*?)\}', r'\1', vn['val'])
                
                if stmt.get('block'):
                    # Nested block modifies the virtual node's current value
                    sub_ex = QueryExecutor(vn['val'])
                    sub_res = sub_ex.execute_query(stmt['block'])
                    vn['val'] = sub_res['text']

                op = stmt.get('operator')
                if op == '>>': vn['val'] = self.eval_action(stmt.get('action'))
                elif op in ('+=', '-='):
                    repl = self.eval_action(stmt.get('action'))
                    m_curr = re.search(r'([\d\.]+)', vn['val'])
                    m_delta = re.search(r'([\d\.]+)', repl)
                    if m_curr and m_delta:
                        curr_v = float(m_curr.group(1)); delta = float(m_delta.group(1))
                        if '%' in repl: delta = curr_v * (delta / 100.0)
                        new_v = round(curr_v + delta if op == '+=' else curr_v - delta, 2)
                        vn['val'] = vn['val'].replace(m_curr.group(1), str(new_v))

        for vn in vnodes:
            if vn['cursor'] is not None: self.edits.append((vn['cursor'], vn['cursor'], vn['val']))
            else: self.edits.append((vn['start'], vn['end'], vn['val']))

    def resolve_path(self, path, pool):
        if not path: return pool
        if path.get('type') == 'cursor':
            results = []
            for n in pool:
                c = LatexNode('cursor', 'cursor', -1, -1)
                c.cursor_pos = n.end if path.get('value') == '.|' else n.start
                results.append(c)
            return results

        t_val = path.get('value', '').lstrip('\\')
        pseudo = None
        if ':' in t_val: t_val, pseudo = t_val.split(':', 1)
        if t_val == 'img': t_val = 'includegraphics'
        
        matches = []
        for n in pool:
            if n.name == t_val or n.ntype == t_val or (n.ntype == 'text' and n.get_text(self.text) == t_val):
                matches.append(n)
            # Recursively check children for property matches
            for c in n.children:
                if c.name == t_val or c.ntype == t_val: matches.append(c)
                for cc in c.children:
                    if cc.name == t_val or cc.ntype == t_val: matches.append(cc)

        if pseudo == 'first': return matches[:1]
        if pseudo == 'last': return matches[-1:]
        return matches

    def eval_action(self, action):
        if not action: return ""
        if isinstance(action, dict): return action.get('value', '').replace('$$', self.loop_vars['$$'])
        if isinstance(action, list): return "".join(self.eval_action(a) for a in action)
        return str(action).replace('$$', self.loop_vars['$$'])

def execute_query_on_text(text, query):
    res = parse_tex_machina_query(query)
    if res['status'] == 'error': return res
    ex = QueryExecutor(text); return ex.execute_query(res['ast'])
