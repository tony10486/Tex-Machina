import re
import json

class QueryLexer:
    def __init__(self, text):
        self.text = text
        self.pos = 0
        self.tokens = []
        
        # New Operators: added <->, :=, +=, -=, |, .|, |.
        ops = [
            '<->', ':=', '+=', '-=', '>>', '+>', '<+', '>+<', '><>', '><', '<>', '**', 
            '<=>', '^^', 'vv', '&&', '->', '==', '!=', '<=', '>=', 
            '::', '...', '_{', '_[', '_{#', '.|', '|.'
        ]
        single_ops = list('+-*/|!$()>~?,:=.[]{}|') # Added | as single op too
        self.all_ops = sorted(list(set(ops + single_ops)), key=len, reverse=True)
        self.ops_pattern = '|'.join(re.escape(op) for op in self.all_ops)

        self.patterns = [
            ('SUBQUERY_START', r'\^\('),
            ('SUBQUERY_END', r'\)\^'),
            ('LOOP_START', r'loop\s*\{'),
            ('ALIAS', r'\bas\s+\$[a-zA-Z0-9_]+'), # as $var
            ('REGISTER_OP', r'->\s*//[a-zA-Z0-9_]+'),
            ('REGISTER_REF', r'//[a-zA-Z0-9_]+|\$[a-zA-Z0-9_]+'), # Support $var
            ('OPTION', r'-[a-z]+(?::[#@\w]+)?'),
            ('COMMAND', r'\b(?:find|exchange|move|duplicate|delete|insert|extract)(?::\[[^\]]+\])?'),
            ('ORDER_BY', r'order\s+by'),
            ('KEYWORD', r'\b(?:where|without|has|and|or|to|in|at|not|as|bold|italic|clear)\b'),
            ('TAG', r'[#@][a-zA-Z0-9_]+(?:\[[^\]]+\])?(?:\{[^\}]+\})?(?::[#@a-zA-Z0-9_*:]+)?'),
            ('NUMBER', r'\d+\%\b|\d+\.\d+|\d+'), # Support 10%
            ('IDENTIFIER', r'\\[a-zA-Z0-9*]+|[a-zA-Z0-9_]+'),
            ('OPERATOR', self.ops_pattern),
            ('WHITESPACE', r'\s+'),
        ]

    def tokenize(self):
        text = self.text.strip()
        # New prefix: ; instead of ?
        if text.startswith(';'):
            self.tokens.append(('PREFIX', ';'))
            text = text[1:].strip()
        elif text.startswith('?'): # Backwards compat
            self.tokens.append(('PREFIX', '?'))
            text = text[1:].strip()
        
        while self.pos < len(text):
            if text[self.pos] in ("'", '"'):
                quote = text[self.pos]
                end = self.pos + 1
                while end < len(text):
                    if text[end] == quote and (end == 0 or text[end-1] != '\\'):
                        break
                    end += 1
                self.tokens.append(('STRING', text[self.pos:end+1]))
                self.pos = end + 1
                continue

            matched = False
            for name, pattern in self.patterns:
                regex = re.compile(pattern)
                match = regex.match(text, self.pos)
                if match:
                    value = match.group(0)
                    if name != 'WHITESPACE':
                        self.tokens.append((name, value))
                    self.pos += len(value)
                    matched = True
                    break
            
            if not matched:
                if not text[self.pos].isspace():
                    self.tokens.append(('OPERATOR', text[self.pos]))
                self.pos += 1
                
        return self.tokens

class QueryParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self, offset=0):
        return self.tokens[self.pos + offset] if self.pos + offset < len(self.tokens) else None

    def consume(self, expected_type=None, expected_val=None):
        token = self.peek()
        if not token: return None
        if expected_type and token[0] != expected_type: return None
        if expected_val and token[1] != expected_val: return None
        self.pos += 1
        return token

    def parse_query(self):
        if self.peek() and self.peek()[0] == 'PREFIX': self.consume()
        
        statements = []
        while self.pos < len(self.tokens):
            if self.peek() and self.peek()[0] == 'LOOP_START':
                statements.append(self.parse_loop())
            else:
                statements.append(self.parse_statement())
                
            sep = self.peek()
            # New separators: | and , in addition to &
            if sep and sep[1] in ('&', '&&', ',', '|', ';'):
                statements[-1]['next_sep'] = self.consume()[1]
            else:
                break
        return {"type": "query", "statements": statements}

    def parse_loop(self):
        self.consume('LOOP_START')
        inner = self.parse_query()
        self.consume('OPERATOR', '}')
        return {"type": "loop", "body": inner}

    def parse_statement(self):
        stmt = {"type": "statement"}
        
        # 1. Command & Options (Optional now)
        if self.peek() and self.peek()[0] == 'COMMAND':
            stmt['command'] = self.consume()[1]
        
        while self.peek() and self.peek()[0] == 'OPTION':
            stmt.setdefault('options', []).append(self.consume()[1])
        
        # 2. Target Path (Explicit or Implicit find)
        stmt['target'] = self.parse_path()
        
        # 3. Actions or Tail
        while self.pos < len(self.tokens):
            t = self.peek()
            if not t or t[1] in ('&', '&&', ',', '|', ';', ')^', '}'): break
            
            # New operators: <->, :=, +=, -=, >>, etc.
            if t[1] in ('>>', '<->', ':=', '+=', '-=', '+>', '<+', '>+<', '><>', '><', '<>', '**', '</>', '<=>', '^^', 'vv'):
                stmt['operator'] = self.consume()[1]
                stmt['action'] = self.parse_action_block()
            
            elif t[0] == 'ALIAS':
                stmt['alias'] = self.consume()[1].replace('as', '').strip()
            elif t[0] == 'REGISTER_OP':
                stmt['register_store'] = self.consume()[1].replace('->', '').strip()
            elif t[0] == 'ORDER_BY':
                stmt['order_by'] = self.parse_order_by()
            elif t[0] == 'KEYWORD' and t[1] in ('where', 'without', 'has'):
                stmt.setdefault('conditions', []).append(self.parse_natural_condition())
            elif t[0] == 'KEYWORD' and t[1] in ('bold', 'italic', 'clear'):
                # Trait operators (+ bold, - italic)
                # Check previous token for +/-
                prev = self.tokens[self.pos - 1] if self.pos > 0 else None
                op = prev[1] if prev and prev[1] in ('+', '-') else '+'
                stmt.setdefault('traits', []).append({"op": op, "trait": self.consume()[1]})
            elif t[1] == '[': 
                stmt.setdefault('conditions', []).append({"type": "inline", "value": self.parse_bracket_content()})
            elif t[1] == '{':
                # Block scope
                self.consume()
                stmt['block'] = self.parse_query()
                self.consume('OPERATOR', '}')
            else:
                extra = self.parse_path()
                if extra: 
                    stmt.setdefault('extra_targets', []).append(extra)
                elif t[0] in ('OPERATOR', 'NUMBER', 'IDENTIFIER', 'TAG', 'KEYWORD'):
                    stmt.setdefault('extra_targets', []).append({"type": "raw", "value": self.consume()[1]})
                else:
                    self.pos += 1
                
        return stmt

    def parse_path(self):
        parts = []
        while self.pos < len(self.tokens):
            t = self.peek()
            if not t or t[1] in ('&', '&&', ',', '|', ';', '->', '>>', '<->', ':=', '+=', '-=', 'where', 'without', 'has', ')^', '}', 'order', 'as'):
                break
            
            if t[1] in ('>', '~', '...', '<', '<<', '$'):
                parts.append({"type": "path_op", "value": self.consume()[1]})
                continue

            atom = self.parse_atom()
            if atom:
                next_t = self.peek()
                if next_t and next_t[1] == '?':
                    atom['optional'] = True
                    self.consume()
                parts.append(atom)
            else:
                break
        
        if not parts: return None
        return parts[0] if len(parts) == 1 else {"type": "path", "elements": parts}

    def parse_atom(self):
        t = self.peek()
        if not t: return None

        if t[1] == '_':
            self.consume()
            atom = {"type": "self_ref", "value": "_"}
            next_t = self.peek()
            if next_t and next_t[1] in ('_{', '_[', '_{#'):
                atom['property'] = self.consume()[1]
                atom['content'] = self.parse_bracket_content()
            return atom
        
        if t[0] == 'TAG': return {"type": "tag", "value": self.consume()[1]}
        if t[0] == 'STRING': return {"type": "string", "value": self.consume()[1][1:-1]}
        if t[0] == 'NUMBER': return {"type": "number", "value": self.consume()[1]}
        if t[0] == 'IDENTIFIER': return {"type": "identifier", "value": self.consume()[1]}
        if t[0] == 'REGISTER_REF': return {"type": "register", "value": self.consume()[1]}
        
        if t[0] == 'SUBQUERY_START':
            self.consume()
            inner = self.parse_query()
            self.consume('SUBQUERY_END')
            return {"type": "subquery", "query": inner}
        
        if t[1] == '{':
            # This could be a property mutation {width: 0.8} or a block
            # For now, if it's inside a path, it's likely property-related if it has :
            # But parse_statement handles block. parse_atom handles nested groups.
            self.consume()
            inner = self.parse_query()
            self.consume('OPERATOR', '}')
            return {"type": "group", "body": inner}

        if t[1] in ('|', '.', '.|', '|.'):
            return {"type": "cursor", "value": self.consume()[1]}

        if t[1] in ('(', '(?!', '(?=', '(?<!', '(?<='):
            op = self.consume()[1]
            inner = []
            while self.peek() and self.peek()[1] != ')':
                inner.append(self.parse_path() or {"type": "raw", "value": self.consume()[1]})
            self.consume('OPERATOR', ')')
            return {"type": "regex_group", "op": op, "body": inner}

        if t[1] == '!':
            self.consume()
            return {"type": "unary", "op": "!", "expr": self.parse_atom()}

        return None

    def parse_action_block(self):
        parts = []
        while self.pos < len(self.tokens):
            t = self.peek()
            if not t or t[1] in ('&', '&&', ',', '|', ';', ')^', '}', '->'): break
            
            atom = self.parse_atom()
            if atom:
                parts.append(atom)
            elif t[0] in ('OPERATOR', 'IDENTIFIER', 'KEYWORD', 'NUMBER', 'TAG'):
                parts.append({"type": "raw", "value": self.consume()[1]})
            else:
                break
        return parts[0] if len(parts) == 1 else {"type": "action_complex", "parts": parts}

    def parse_bracket_content(self):
        start_node = self.peek()
        if not start_node: return ""
        start_char = start_node[1][-1]
        end_char = ']' if start_char == '[' else '}'
        
        depth = 0
        content = []
        while self.pos < len(self.tokens):
            t = self.consume()
            if t[1].endswith(start_char): depth += 1
            elif t[1] == end_char: depth -= 1
            
            if depth == 0: break
            content.append(t[1])
            
        if content and content[0] == start_node[1]:
            content = content[1:]
        return "".join(content)

    def parse_natural_condition(self):
        keyword = self.consume()[1]
        expr = []
        mutation_ops = ('>>', '<->', ':=', '+=', '-=', '+>', '<+', '>+<', '><>', '><', '<>', '**', '</>', '<=>', '^^', 'vv')
        while self.pos < len(self.tokens):
            t = self.peek()
            if not t or t[1] in ('&', '&&', ',', '|', ';', '->', ')^', '}', 'order', 'to', 'at', '{'): break
            if t[0] == 'REGISTER_OP' or t[0] == 'ALIAS': break
            if t[1] in mutation_ops: break
            if t[0] == 'KEYWORD' and t[1] not in ('and', 'or', 'not'): break
            expr.append(self.consume()[1])
        return {"type": "natural", "keyword": keyword, "value": " ".join(expr)}

    def parse_order_by(self):
        self.consume('ORDER_BY')
        criteria = []
        while self.pos < len(self.tokens):
            t = self.peek()
            if not t or t[1] in ('&', '&&', ',', '|', ';', ')^', '}'): break
            criteria.append(self.consume()[1])
        return {"criteria": " ".join(criteria)}

def parse_tex_machina_query(query_str):
    try:
        lexer = QueryLexer(query_str)
        tokens = lexer.tokenize()
        parser = QueryParser(tokens)
        result = parser.parse_query()
        return {"status": "success", "ast": result}
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "trace": traceback.format_exc()}
