import re
import json
import os
import sys
import bisect

# Ensure local imports work
sys.path.append(os.path.dirname(__file__))
try:
    from query_parser import parse_tex_machina_query
except ImportError:
    # Fallback for different environments
    from .query_parser import parse_tex_machina_query

class LatexNode:
    def __init__(self, ntype, name, start, end, raw=None):
        self.ntype = ntype; self.name = name; self.start = start; self.end = end; self.raw = raw
        self.children = []; self.parent = None; self.args = []; self.opts = []
        self.is_inside = False; self.at_start = False; self.cursor_pos = None
    def add_child(self, child): child.parent = self; self.children.append(child)
    def get_text(self, text): return text[self.start:self.end]
    def __repr__(self): return f"LatexNode({self.ntype}, {self.name}, {self.start}:{self.end})"

class LatexScanner:
    def __init__(self, text): self.text = text; self.pos = 0
    def scan(self): root = LatexNode('root', 'root', 0, len(self.text)); self.pos = 0; self._scan_recursive(root); return root
    def _scan_recursive(self, parent_node):
        while self.pos < len(self.text):
            chunk = self.text[self.pos:]
            m = re.match(r'\\begin\{([a-zA-Z0-9*]+)\}', chunk)
            if m:
                name = m.group(1); start = self.pos; self.pos += len(m.group(0))
                env_node = LatexNode('env', name, start, -1); parent_node.add_child(env_node)
                self._scan_recursive(env_node); continue
            m = re.match(r'\\end\{([a-zA-Z0-9*]+)\}', chunk)
            if m:
                name = m.group(1)
                if parent_node.ntype == 'env' and parent_node.name == name:
                    self.pos += len(m.group(0)); parent_node.end = self.pos; return
            m = re.match(r'(\$\$|\\\[|\\\(|\$)', chunk)
            if m:
                # Check if escaped
                if self.pos == 0 or self.text[self.pos-1] != '\\':
                    m_start = m.group(1); start = self.pos; self.pos += len(m_start)
                    m_end = {'$$':'$$', r'\[':r'\]', r'\(':r'\)', '$':'$'}.get(m_start, '$')
                    end_pos = self.text.find(m_end, self.pos)
                    if end_pos != -1:
                        self.pos = end_pos + len(m_end); parent_node.add_child(LatexNode('math', m_start, start, self.pos)); continue
                    else: self.pos = start
            if chunk.startswith('&'):
                parent_node.add_child(LatexNode('special', '&', self.pos, self.pos+1))
                self.pos += 1; continue
            m = re.match(r'\\([a-zA-Z*]+|.)', chunk, re.DOTALL)
            if m:
                name = m.group(1); start = self.pos; self.pos += len(m.group(0))
                cmd_node = LatexNode('cmd', name, start, self.pos); parent_node.add_child(cmd_node)
                while self.pos < len(self.text):
                    # Robust argument scanning that allows whitespace/newlines
                    if self.pos < len(self.text) and self.text[self.pos] in ' \t\n\r':
                        self.pos += 1; continue
                    if self.pos < len(self.text) and self.text[self.pos] == '[':
                        e = self._find_matching(self.pos, '[', ']')
                        if e != -1:
                            node = LatexNode('opt', None, self.pos + 1, e - 1); cmd_node.opts.append(node); cmd_node.add_child(node)
                            self.pos = e; cmd_node.end = e; continue
                    elif self.pos < len(self.text) and self.text[self.pos] == '{':
                        e = self._find_matching(self.pos, '{', '}')
                        if e != -1:
                            node = LatexNode('arg', None, self.pos + 1, e - 1); cmd_node.args.append(node); cmd_node.add_child(node)
                            self.pos = e; cmd_node.end = e; continue
                    break
                continue
            next_pos = len(self.text)
            for p in [r'\\begin', r'\\end', r'\\', r'\$\$', r'\$', r'\{', r'\}', r'\[', r'\]', '&']:
                res = re.search(p, self.text[self.pos+1:])
                if res: next_pos = min(next_pos, self.pos + 1 + res.start())
            if next_pos > self.pos: parent_node.add_child(LatexNode('text', None, self.pos, next_pos)); self.pos = next_pos
            else: parent_node.add_child(LatexNode('text', None, self.pos, self.pos+1)); self.pos += 1
    def _find_matching(self, start, o, c):
        d = 0
        for i in range(start, len(self.text)):
            if self.text[i] == o: d += 1
            elif self.text[i] == c:
                d -= 1
                if d == 0: return i + 1
        return -1

class QueryExecutor:
    def __init__(self, text): 
        self.text = text; self.registers = {}; self.loop_vars = {'#i': 1, '#j': 1}
        self.line_offsets = []; self.rescan()
    def rescan(self): 
        self.root = LatexScanner(self.text).scan()
        self.line_offsets = [0]
        for m in re.finditer(r'\n', self.text): self.line_offsets.append(m.end())
    def update_offsets(self, pos, shift):
        if shift == 0: return
        for reg in self.registers.values():
            for n in reg:
                if n.start >= pos: n.start += shift
                if n.end >= pos: n.end += shift
                if n.cursor_pos is not None and n.cursor_pos >= pos: n.cursor_pos += shift
    def get_line_number(self, pos):
        return bisect.bisect_right(self.line_offsets, pos)
    def execute_query(self, query_ast):
        if query_ast.get('type') != 'query': return {"status": "error", "message": "Invalid AST"}
        last_targets = []
        for stmt in query_ast.get('statements', []):
            if stmt.get('type') == 'loop':
                res = self.execute_loop(stmt); last_targets = []
            else:
                res = self.execute_statement(stmt); last_targets = res.get('targets', [])
            if res['status'] == 'error': return res
            if stmt.get('next_sep') == '&&': self.rescan()
        return {"status": "success", "text": self.text, "targets": last_targets}
    def execute_loop(self, loop_stmt):
        self.loop_vars['#i'] = 1
        for _ in range(100):
            old_text = self.text; res = self.execute_query(loop_stmt['body'])
            if res['status'] == 'error': return res
            if self.text == old_text: break
            self.loop_vars['#i'] += 1; self.rescan()
        return {"status": "success"}
    
    def _get_dest_nodes(self, stmt):
        dest_nodes = []
        if stmt.get('extra_targets'):
            dest_nodes = self.resolve_path(stmt['extra_targets'][0], [self.root])
        elif stmt.get('action'):
            action = stmt['action']
            if isinstance(action, dict) and action['type'] == 'register':
                dest_nodes = self.registers.get(action['value'], [])
            elif isinstance(action, list) and len(action) > 0 and action[0]['type'] == 'register':
                dest_nodes = self.registers.get(action[0]['value'], [])
            else:
                dest_nodes = self.resolve_path(action, [self.root])
        return dest_nodes

    def execute_statement(self, stmt):
        cmd = stmt.get('command', 'find').lower(); line_range = None
        if ':' in cmd:
            m = re.search(r'\[(\d+)-(\d+)\]', cmd)
            if m: line_range = (int(m.group(1)), int(m.group(2)))
        targets = self.resolve_path(stmt.get('target'), [self.root])
        
        # Deduplicate targets by identity
        def uniq_nodes(seq):
            seen = set(); return [x for x in seq if not (id(x) in seen or seen.add(id(x)))]
        targets = uniq_nodes(targets)
        
        if line_range:
            s_off = self.line_offsets[max(0, line_range[0]-1)] if line_range[0]-1 < len(self.line_offsets) else len(self.text)
            e_off = self.line_offsets[min(line_range[1], len(self.line_offsets)-1)] if line_range[1] < len(self.line_offsets) else len(self.text)
            targets = [t for t in targets if t.start >= s_off and t.end <= e_off]
        
        for cond in stmt.get('conditions', []): targets = self.apply_condition(cond, targets)
        if stmt.get('order_by'): targets = self.apply_sort(stmt['order_by'], targets)
        if stmt.get('register_store'): self.registers[stmt['register_store']] = targets
        
        op = stmt.get('operator'); action = stmt.get('action')
        if 'find' in cmd or not cmd:
            all_targets = targets[:]
            for extra in stmt.get('extra_targets', []):
                if isinstance(extra, dict): all_targets.extend(self.resolve_path(extra, [self.root]))
            if op: self.apply_mutation(op, all_targets, action, stmt.get('options', []))
        elif cmd.startswith('delete'): 
            all_targets = targets[:]
            self.apply_mutation('>>', all_targets, [{"type":"raw", "value":""}], stmt.get('options', []))
        elif cmd.startswith('exchange'):
            all_targets = targets[:]
            dest_nodes = self._get_dest_nodes(stmt)
            if targets and dest_nodes:
                target2 = dest_nodes
                pairs = list(zip(targets, target2))
                pairs.sort(key=lambda p: min(p[0].start, p[1].start), reverse=True)
                for t1, t2 in pairs:
                    if t1.start > t2.start: t1, t2 = t2, t1
                    if t1.end > t2.start: continue
                    s1, e1, s2, e2 = t1.start, t1.end, t2.start, t2.end
                    txt1, txt2 = self.text[s1:e1], self.text[s2:e2]
                    self.text = self.text[:s1] + txt2 + self.text[e1:s2] + txt1 + self.text[e2:]
                self.rescan()
        elif cmd.startswith('move') or cmd.startswith('duplicate'):
            all_targets = targets[:]
            dest_nodes = self._get_dest_nodes(stmt)
            if targets and dest_nodes:
                source_text = "".join(t.get_text(self.text) for t in targets); dest = dest_nodes[0]
                insert_pos = dest.cursor_pos if dest.cursor_pos is not None else dest.end
                if dest.cursor_pos is None and dest.ntype == 'env': insert_pos = dest.end - len(f"\\end{{{dest.name}}}")
                if cmd.startswith('move'):
                    for t in sorted(targets, key=lambda x: x.start, reverse=True): 
                        self.text = self.text[:t.start] + self.text[t.end:]
                        self.update_offsets(t.start, -(t.end - t.start))
                    self.rescan(); 
                    dest_nodes = self._get_dest_nodes(stmt)
                    if dest_nodes:
                        dest = dest_nodes[0]
                        insert_pos = dest.cursor_pos if dest.cursor_pos is not None else dest.end
                        if dest.cursor_pos is None and dest.ntype == 'env': insert_pos = dest.end - len(f"\\end{{{dest.name}}}")
                self.text = self.text[:insert_pos] + source_text + self.text[insert_pos:]
                self.update_offsets(insert_pos, len(source_text)); self.rescan()
        elif cmd.startswith('extract'): 
            all_targets = targets[:]
            self.text = "\n".join(t.get_text(self.text) for t in targets); self.rescan()
        else:
            all_targets = targets[:]
            
        return {"status": "success", "text": self.text, "targets": all_targets}

    def resolve_path(self, path, current_nodes):
        if not path: return []
        if isinstance(path, list):
            nodes = current_nodes
            for el in path: nodes = self.resolve_path(el, nodes)
            return nodes
        if path['type'] == 'register': return self.registers.get(path['value'], [])
        if path['type'] == 'subquery':
            sub = QueryExecutor(self.text); sub.registers = self.registers.copy()
            res = sub.execute_query(path['query']); return res.get('targets', [])
        
        elements = path['elements'] if path['type'] == 'path' else [path]
        nodes = current_nodes; i = 0; want_start = False; want_inside = False
        
        def uniq(seq):
            seen = set(); return [x for x in seq if not (id(x) in seen or seen.add(id(x)))]

        is_first_atom = True
        while i < len(elements):
            el = elements[i]
            if el['type'] == 'path_op':
                op = el['value']
                if op == '>': nodes = [c for n in nodes for c in n.children]
                elif op == '~': nodes = [c for n in nodes if n.parent for c in n.parent.children if c != n]
                elif op == '<': nodes = [n.parent for n in nodes if n.parent]
                elif op == '<<': 
                    anc = []
                    for n in nodes:
                        p = n.parent
                        while p: anc.append(p); p = p.parent
                    nodes = anc
                elif op in ('...', '$'):
                    desc = []
                    for n in nodes: desc.extend(self.all_descendants(n))
                    nodes = desc
                nodes = uniq(nodes)
                is_first_atom = False
            elif el['type'] == 'cursor':
                if el['value'] == '|': want_start = True
                elif el['value'] == '.': want_inside = True
                if i == len(elements) - 1: nodes = self.match_node(nodes, el, want_start, want_inside)
            elif el['type'] == 'string' and any(op in el['value'] for op in ('>', '...', '$', '~', '<')):
                # [FIX] Handle shorthand path strings by splitting them
                shorthand = el['value']
                m = re.search(r'(\{.*\}|\[.*\])$', shorthand)
                suffix = m.group(1) if m else ""
                core = shorthand[:len(shorthand)-len(suffix)]
                
                parts = re.split(r'\s*(>|~|\.\.\.|<|<<|\$)\s*', core)
                new_elements = []
                for j, part in enumerate(parts):
                    if part in ('>', '~', '...', '<', '<<', '$'):
                        new_elements.append({'type': 'path_op', 'value': part})
                    elif part.strip():
                        atom = {'type': 'identifier', 'value': part.strip()}
                        if j == len(parts) - 1 and suffix:
                            atom['value'] += suffix
                            atom['type'] = 'string'
                        new_elements.append(atom)
                
                # Resolve the reconstructed path
                for sub_el in new_elements:
                    nodes = self.resolve_path(sub_el, nodes)
                is_first_atom = False
            else:
                if is_first_atom and nodes == [self.root]:
                    search_pool = self.all_descendants(self.root)
                    new_nodes = self.match_node(search_pool, el, want_start, want_inside)
                else:
                    new_nodes = self.match_node(nodes, el, want_start, want_inside)
                
                if not new_nodes and el.get('optional'): pass
                else: nodes = new_nodes
                want_start = want_inside = False
                is_first_atom = False
            i += 1
        return nodes

    def match_node(self, nodes, pattern, at_start=False, is_inside=False):
        results = []
        p_type = pattern.get('type'); p_val = pattern.get('value')
        if p_type == 'cursor':
            for n in nodes:
                v = LatexNode('cursor', 'cursor', -1, -1)
                if p_val == '|':
                    if is_inside:
                        if n.ntype == 'env': v.cursor_pos = n.end - len(f"\\end{{{n.name}}}")
                        else: v.cursor_pos = n.end
                    else: v.cursor_pos = n.start if at_start else n.end
                    v.start = v.end = v.cursor_pos; results.append(v)
                elif p_val == '.':
                    v = LatexNode(n.ntype, n.name, n.start, n.end); v.children = n.children; v.is_inside = True
                    if n.ntype == 'env': v.cursor_pos = n.start + len(f"\\begin{{{n.name}}}")
                    else: v.cursor_pos = n.start
                    results.append(v)
            return results
        
        is_tag = p_type == 'tag' or (p_type == 'string' and p_val and (p_val.startswith('@') or p_val.startswith('#')))
        if (is_tag or p_type == 'string') and p_val and ('{' in p_val and '}' in p_val):
            m = re.search(r'\{(.*?)\}', p_val)
            brace_content = m.group(1) if m else ""
            raw_name = p_val.split('{')[0]
            
            if is_tag:
                if raw_name.startswith('@img'): cmd_name = 'includegraphics'
                elif raw_name.startswith('@fig'): cmd_name = 'figure'
                elif raw_name.startswith('@tbl'): cmd_name = 'tabular'
                else: cmd_name = raw_name.lstrip('@#')
            else:
                cmd_name = raw_name.strip('\\')
                
            for n in nodes:
                cands = [n] if (n.name == cmd_name or n.ntype == cmd_name) else self.all_descendants(n)
                for cand in cands:
                    if (cand.name == cmd_name or cand.ntype == cmd_name) and cand.args:
                        target_arg = cand.args[0]
                        if '|' in brace_content:
                            v = LatexNode('cursor', 'cursor', -1, -1)
                            v.cursor_pos = target_arg.start
                            v.start = v.end = v.cursor_pos
                            v.context_node = target_arg
                            results.append(v)
                        else:
                            results.append(target_arg)
            return results

        if p_type == 'tag':
            if p_val.startswith(('@row', '@col', '@cell')): return self.resolve_grid_tag(nodes, p_val, at_start, is_inside)
            if p_val.startswith('@arg'):
                m = re.search(r'\[(\d+)\]', p_val); idx = int(m.group(1)) if m else 1
                for n in nodes:
                    if n.ntype == 'cmd' and len(n.args) >= idx: results.append(n.args[idx-1])
                return results
        if p_type == 'unary' and pattern.get('op') == '!':
            for n in nodes:
                if self.resolve_path(pattern['expr'], [n]): results.append(n)
            return results
        
        for cand in nodes:
            if self.node_matches(cand, p_type, p_val):
                if at_start:
                    v = LatexNode('cursor', 'cursor', -1, -1); v.cursor_pos = cand.start; v.start = v.end = v.cursor_pos; results.append(v)
                elif is_inside:
                    v = LatexNode('cursor', 'cursor', -1, -1)
                    if cand.ntype == 'env': v.cursor_pos = cand.start + len(f"\\begin{{{cand.name}}}")
                    else: v.cursor_pos = cand.start
                    v.start = v.end = v.cursor_pos; results.append(v)
                elif pattern.get('body'):
                    if cand.ntype == 'cmd' and cand.args: results.append(cand.args[0])
                    else: results.append(cand)
                else: results.append(cand)
        return results

    def node_matches(self, node, p_type, p_val):
        if not p_val: return False
        if p_type == 'tag':
            if p_val.startswith('@img'): p_type = 'identifier'; p_val = 'includegraphics'
            elif p_val.startswith('@fig'): p_type = 'identifier'; p_val = 'figure'
            elif p_val.startswith('@tbl'): p_type = 'identifier'; p_val = 'tabular'
        
        line_num = None
        if ':' in p_val:
            parts = p_val.rsplit(':', 1)
            if parts[1].isdigit(): p_val = parts[0]; line_num = int(parts[1])

        val = p_val
        if val.startswith('\\'):
            if val == '\\' or val == '\\\\': val = '\\'
            else: val = val.lstrip('\\')
        
        match = False
        if p_type in ('identifier', 'string'):
            if node.name == val or node.name == p_val or (node.name and node.name.lstrip('\\') == val.lstrip('\\')): match = True
            elif node.ntype == val: match = True
            elif p_type == 'string':
                node_text = node.get_text(self.text).strip()
                # Use regex for flexible matching ignoring whitespace/newlines
                pattern = re.escape(p_val).replace(r'\ ', r'\s*')
                if re.search(pattern, node_text, re.DOTALL): match = True
        
        if match and line_num: return self.get_line_number(node.start) == line_num
        return match

    def resolve_grid_tag(self, nodes, tag, at_start=False, is_inside=False):
        results = []
        def uniq(seq):
            seen = set(); return [x for x in seq if not (id(x) in seen or seen.add(id(x)))]
        parents = uniq([n.parent for n in nodes if n.parent])
        node_ids = {id(n) for n in nodes}
        if not parents:
            parents = [n for n in nodes if n.ntype == 'env']
            node_ids = {id(n) for n in nodes for c in n.children}
            
        for p in parents:
            rows_data = [[]]; current_row = rows_data[0]
            for c in p.children:
                if c.ntype == 'cmd' and c.name == '\\': rows_data.append([]); current_row = rows_data[-1]
                else: current_row.append(c)
            
            def is_content(c): return c.ntype != 'text' or c.get_text(self.text).strip()
            rows_data = [r for r in rows_data if any(is_content(c) for c in r)]
            
            if tag.startswith('@row'):
                m = re.search(r'\[(\d+)\]', tag); r_idx = int(m.group(1)) - 1 if m else 0
                if 0 <= r_idx < len(rows_data):
                    r_nodes = [c for c in rows_data[r_idx] if is_content(c)]
                    if r_nodes and (not node_ids or any(id(rn) in node_ids for rn in rows_data[r_idx])):
                        row_node = LatexNode('row', 'row', r_nodes[0].start, r_nodes[-1].end)
                        row_node.children = rows_data[r_idx]; row_node.parent = p; results.append(row_node)
            elif tag.startswith('@col') or tag.startswith('@cell'):
                col_idx = -1; row_idx = -1
                if tag.startswith('@cell'):
                    m = re.search(r'\[(\d+),\s*(\d+)\]', tag)
                    if m: row_idx = int(m.group(1)) - 1; col_idx = int(m.group(2)) - 1
                else:
                    m = re.search(r'\[(\d+)\]', tag); col_idx = int(m.group(1)) - 1 if m else 0
                
                target_rows = [rows_data[row_idx]] if 0 <= row_idx < len(rows_data) else rows_data
                for r in target_rows:
                    if node_ids and not any(id(rn) in node_ids for rn in r): continue
                    cells = [[]]; curr_cell = cells[0]
                    for c in r:
                        if c.ntype == 'special' and c.name == '&': cells.append([]); curr_cell = cells[-1]
                        else: curr_cell.append(c)
                    if 0 <= col_idx < len(cells):
                        c_nodes = [c for c in cells[col_idx] if is_content(c)]
                        if c_nodes:
                            cell_node = LatexNode('cell', 'cell', c_nodes[0].start, c_nodes[-1].end)
                            cell_node.children = cells[col_idx]; cell_node.parent = p; results.append(cell_node)
        
        final_results = []
        for n in results:
            if at_start:
                v = LatexNode('cursor', 'cursor', -1, -1); v.cursor_pos = n.start; v.start = v.end = v.cursor_pos; final_results.append(v)
            elif is_inside:
                v = LatexNode('cursor', 'cursor', -1, -1); v.cursor_pos = n.start; v.start = v.end = v.cursor_pos; final_results.append(v)
            else: final_results.append(n)
        return final_results

    def all_descendants(self, node):
        res = []
        for c in node.children: res.append(c); res.extend(self.all_descendants(c))
        return res
    
    def apply_condition(self, cond, targets):
        if cond['type'] == 'natural':
            kw, val = cond['keyword'], cond['value'].strip("'\" ")
            if kw == 'has': return [t for t in targets if any(self.node_matches(d, 'identifier', val) for d in self.all_descendants(t))]
            if kw == 'without': 
                return [t for t in targets if not any(self.node_matches(d, 'string', val) for d in ([t] + self.all_descendants(t)))]
        elif cond['type'] == 'inline':
            v = cond['value'].strip()
            if v.startswith('#'): return [t for t in targets if self.get_property(t, v)]
        return targets
    def apply_sort(self, order_stmt, targets):
        crit = order_stmt.get('criteria', '').lower()
        if 'reverse' in crit: targets.sort(key=lambda x: x.start, reverse=True)
        elif 'shortest' in crit: targets.sort(key=lambda x: (x.end - x.start))
        elif 'longest' in crit: targets.sort(key=lambda x: (x.end - x.start), reverse=True)
        elif 'inner' in crit: targets.sort(key=lambda x: self.get_depth(x), reverse=True)
        elif 'outer' in crit: targets.sort(key=lambda x: self.get_depth(x))
        return targets
    def get_depth(self, node):
        d = 0; p = node.parent
        while p: d += 1; p = p.parent
        return d
    def apply_mutation(self, op, targets, action, options):
        targets.sort(key=lambda x: x.start, reverse=True); self.loop_vars['#j'] = 1
        for t in targets:
            repl = self.evaluate_action(action, t); pos = t.cursor_pos if t.cursor_pos is not None else t.start
            old_len = (t.end - t.start) if t.cursor_pos is None else 0
            if op == '>>': self.text = self.text[:pos] + repl + self.text[pos + old_len:]
            elif op == '+>': self.text = self.text[:t.end] + repl + self.text[t.end:]; pos = t.end; old_len = 0
            elif op == '<+': self.text = self.text[:t.start] + repl + self.text[t.start:]; pos = t.start; old_len = 0
            elif op == '><': 
                content = t.get_text(self.text); repl_full = f"\\begin{{{repl}}}\n{content}\n\\end{{{repl}}}"
                self.text = self.text[:t.start] + repl_full + self.text[t.end:]; pos = t.start; old_len = t.end - t.start; repl = repl_full
            elif op == '<>':
                if t.ntype == 'env':
                    s = t.start + len(f"\\begin{{{t.name}}}"); e = t.end - len(f"\\end{{{t.name}}}")
                    repl = self.text[s:e]; self.text = self.text[:t.start] + repl + self.text[t.end:]
                    pos = t.start; old_len = t.end - t.start
            elif op == '**':
                try: n = int(repl)
                except: n = 1
                repl = t.get_text(self.text) * n; self.text = self.text[:t.end] + repl + self.text[t.end:]
                pos = t.end; old_len = 0
            self.update_offsets(pos, len(repl) - old_len); self.loop_vars['#j'] += 1
        return {"status": "success"}
    def get_property(self, node, prop):
        pm = {'#w': 'width', '#s': 'scale', '#h': 'height', '#c': 'color', '#scale': ['width', 'scale', 'height']}
        tp = pm.get(prop, [prop.lstrip('#')])
        if isinstance(tp, str): tp = [tp]
        for o in node.opts:
            ot = o.get_text(self.text).strip('[]')
            for p in ot.split(','):
                if '=' in p:
                    k, v = p.split('=', 1)
                    if k.strip() in tp: return v.strip()
        return ""
    def evaluate_action(self, action, context_node):
        if not action: return ""
        res = ""; parts = action if isinstance(action, list) else [action]
        for p in parts:
            v = ""
            if p['type'] == 'raw': v = p['value'].replace('#j', str(self.loop_vars['#j'])).replace('#i', str(self.loop_vars['#i']))
            elif p['type'] == 'string': v = p['value']
            elif p['type'] == 'identifier' and p['value'] == 'null': v = ""
            elif p['type'] == 'register':
                reg_nodes = self.registers.get(p['value'], [])
                v = "".join(n.get_text(self.text) for n in reg_nodes)
            elif p['type'] == 'self_ref':
                prop = p.get('property')
                if prop and prop.startswith('_{#'): v = self.get_property(context_node, prop[3:-1])
                elif prop == '_{':
                    if context_node.args: v = context_node.args[0].get_text(self.text)
                elif prop == '_[':
                    if context_node.opts: v = context_node.opts[0].get_text(self.text)
                else: v = context_node.get_text(self.text)
            if '*' in v:
                target = context_node
                if target.ntype == 'cursor' and hasattr(target, 'context_node'):
                    target = target.context_node
                
                if target.ntype == 'arg': v = v.replace('*', target.get_text(self.text))
                elif target.ntype == 'cmd' and target.args: v = v.replace('*', target.args[0].get_text(self.text))
            res += v
        return res


def execute_query_on_text(text, query_str):
    res = parse_tex_machina_query(query_str)
    if res['status'] == 'error': return res
    executor = QueryExecutor(text); return executor.execute_query(res['ast'])

if __name__ == "__main__": pass
