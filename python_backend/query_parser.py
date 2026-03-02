import re
import json

class QueryLexer:
    """
    Lexer for TeX-Machina Query Language.
    """
    def __init__(self, text):
        self.text = text
        self.pos = 0
        self.tokens = []
        
        # Literal operators (sorted by length descending to match longest first)
        ops = ['>>', '+>', '<+', '>+<', '><', '<>', '**', '</>', '<=>', '^^', 'vv', '&&', '&', ',', '->', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '|', '!', '$']
        ops_pattern = '|'.join(re.escape(op) for op in sorted(ops, key=len, reverse=True))

        self.patterns = [
            ('SUBQUERY_START', r'\^\('),
            ('SUBQUERY_END', r'\)\^'),
            ('LOOP_START', r'loop\s*\{'),
            ('LOOP_END', r'\}'),
            ('GROUP_START', r'\{'),
            ('GROUP_END', r'\}'),
            ('REGISTER_OP', r'->\s*//[a-zA-Z0-9_]+'),
            ('REGISTER_REF', r'//[a-zA-Z0-9_]+'),
            ('OPTION', r'-[a-z]+(?::[#@\w]+)?'),
            ('OPERATOR', ops_pattern),
            ('COMMAND', r'\b(?:find|exchange|move|duplicate|delete|insert|extract)(?::\[[^\]]+\])?'),
            ('ORDER_BY', r'order\s+by'),
            ('KEYWORD', r'\b(?:where|without|has|and|or|to|in)\b'),
            ('TAG', r'[#@][a-zA-Z0-9_]+(?:\[[^\]]+\])?(?:\{[^\}]+\})?'),
            ('IDENTIFIER', r'[a-zA-Z0-9_.*~?/:\\-]+'), 
            ('WHITESPACE', r'\s+'),
        ]

    def tokenize(self):
        text = self.text.strip()
        if text.startswith('?'):
            self.tokens.append(('PREFIX', '?'))
            text = text[1:].strip()
        
        while self.pos < len(text):
            # 1. Handle Strings
            if text[self.pos] in ("'", '"'):
                quote = text[self.pos]
                end = self.pos + 1
                while end < len(text):
                    if text[end] == quote:
                        escapes = 0
                        idx = end - 1
                        while idx >= self.pos and text[idx] == '\\':
                            escapes += 1
                            idx -= 1
                        if escapes % 2 == 0:
                            break
                    end += 1
                self.tokens.append(('STRING', text[self.pos:end+1]))
                self.pos = end + 1
                continue

            # 2. Handle Inline Conditions [...]
            if text[self.pos] == '[':
                depth = 0
                end = self.pos
                while end < len(text):
                    if text[end] == '[': depth += 1
                    elif text[end] == ']': depth -= 1
                    end += 1
                    if depth == 0: break
                self.tokens.append(('INLINE_COND', text[self.pos:end]))
                self.pos = end
                continue

            # 3. Match patterns
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
                self.pos += 1
                
        return self.tokens

class QueryParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self, offset=0):
        if self.pos + offset < len(self.tokens):
            return self.tokens[self.pos + offset]
        return None

    def consume(self, expected_type=None):
        token = self.peek()
        if not token: return None
        if expected_type and token[0] != expected_type: return None
        self.pos += 1
        return token

    def parse_query(self):
        # Consume PREFIX if it exists
        if self.peek() and self.peek()[0] == 'PREFIX':
            self.consume()
            
        if self.peek() and self.peek()[0] == 'LOOP_START':
            return self.parse_loop()
        
        statements = []
        while self.pos < len(self.tokens):
            statements.append(self.parse_statement())
            sep = self.peek()
            if sep and sep[1] in ('&', '&&', ','):
                statements[-1]['next_sep'] = self.consume()[1]
            else:
                break
        return {"type": "query", "statements": statements}

    def parse_loop(self):
        self.consume('LOOP_START')
        inner = self.parse_query()
        self.consume('LOOP_END')
        return {"type": "loop", "body": inner}

    def parse_statement(self):
        stmt = {"type": "statement"}
        
        # Command
        if self.peek() and self.peek()[0] == 'COMMAND':
            stmt['command'] = self.consume()[1]
        
        # Options
        stmt['options'] = []
        while self.peek() and self.peek()[0] == 'OPTION':
            stmt['options'].append(self.consume()[1])
        
        # First target/expression
        expr = self.parse_expression()
        if expr:
            stmt['target'] = expr
        
        # Tail
        while self.pos < len(self.tokens):
            token = self.peek()
            if not token: break
            
            if token[0] == 'INLINE_COND':
                stmt.setdefault('conditions', []).append({"type": "inline", "value": self.consume()[1]})
            elif token[0] == 'KEYWORD' and token[1] in ('where', 'without', 'has'):
                stmt.setdefault('conditions', []).append(self.parse_natural_condition())
            elif token[0] == 'OPERATOR' and token[1] not in ('&', '&&', ','):
                # Check if it's an assignment/mutation operator
                if token[1] in ('>>', '+>', '<+', '>+<', '><', '<>', '**', '</>', '<=>', '^^', 'vv'):
                    stmt['operator'] = self.consume()[1]
                    stmt['action'] = self.parse_expression()
                else:
                    # Other operators like <, >, == might be part of expressions or conditions
                    # For now, treat them as identifiers or special tokens
                    stmt.setdefault('extra_targets', []).append({"type": "operator", "value": self.consume()[1]})
            elif token[0] == 'REGISTER_OP':
                stmt['register_store'] = self.consume()[1].replace('->', '').strip()
            elif token[0] == 'ORDER_BY':
                stmt['order_by'] = self.parse_order_by()
            elif token[1] in ('&', '&&', ',', 'LOOP_END', 'SUBQUERY_END'):
                break
            else:
                extra = self.parse_expression()
                if extra:
                    stmt.setdefault('extra_targets', []).append(extra)
                else:
                    break
        
        return stmt

    def parse_expression(self):
        token = self.peek()
        if not token: return None
        
        if token[0] == 'STRING':
            val = self.consume()[1]
            return {"type": "string", "value": val[1:-1]}
        elif token[0] == 'SUBQUERY_START':
            self.consume()
            inner = self.parse_query()
            self.consume('SUBQUERY_END')
            return {"type": "subquery", "query": inner}
        elif token[0] == 'REGISTER_REF':
            return {"type": "register", "value": self.consume()[1]}
        elif token[0] == 'TAG':
            return {"type": "tag", "value": self.consume()[1]}
        elif token[0] == 'GROUP_START':
            self.consume()
            inner = self.parse_query()
            self.consume('GROUP_END')
            return {"type": "group", "body": inner}
        elif token[0] in ('IDENTIFIER', 'COMMAND', 'KEYWORD'):
            return {"type": "identifier", "value": self.consume()[1]}
        elif token[0] == 'LOOP_START':
            return self.parse_loop()
        
        return None

    def parse_natural_condition(self):
        keyword = self.consume()[1]
        tokens = []
        while self.pos < len(self.tokens):
            token = self.peek()
            if not token or token[0] in ('OPERATOR', 'KEYWORD', 'INLINE_COND', 'REGISTER_OP', 'ORDER_BY'):
                if token and token[1] in ('and', 'or'):
                    tokens.append(self.consume()[1])
                    continue
                break
            tokens.append(self.consume()[1])
        return {"type": "natural", "keyword": keyword, "value": " ".join(tokens)}

    def parse_order_by(self):
        self.consume('ORDER_BY')
        parts = []
        while self.pos < len(self.tokens):
            token = self.peek()
            if not token or token[0] in ('OPERATOR', 'KEYWORD', 'REGISTER_OP', 'SUBQUERY_END', 'LOOP_END', 'GROUP_END'):
                break
            parts.append(self.consume()[1])
        return {"criteria": " ".join(parts)}

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

if __name__ == "__main__":
    test_queries = [
        "? 'figure:27' <=> 'figure:58'",
        "? move 'minipage:27' to 82",
        "? find 'figure > \\includegraphics'",
        "? find -p:@float '... > \\includegraphics[*]' >> '1'",
        "? \\caption -> //1 & \\includegraphics -> //2 && move //1 >> //2.|",
        "? loop{find:[100-150] 'figure > ... > \\caption{*}' <+ '\"그림 [#i] : \"'}",
        "? @eq -> //maths & tabular$@cell[3, @all] -> //cells && move //maths >> //cells",
        "? find 'figure > center > \\includegraphics' ^^",
        "? @img { >> #scale * 0.8 , <+ \"\\centering\" }"
    ]
    
    for q in test_queries:
        print(f"Query: {q}")
        res = parse_tex_machina_query(q)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        print("-" * 40)
