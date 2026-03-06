import re
import json
try:
    from .query_parser import parse_tex_machina_query
except (ImportError, ValueError):
    from query_parser import parse_tex_machina_query

class QueryExecutor:
    def __init__(self, full_text):
        self.full_text = full_text
        self.registers = {}
        self.last_results = []
        self.wildcard_count = 0

    def execute_query(self, query_ast):
        if query_ast.get('type') != 'query':
            return {"status": "error", "message": "Invalid AST type"}
        
        modified_text = self.full_text
        
        for stmt in query_ast.get('statements', []):
            res = self.execute_statement(stmt, modified_text)
            if res['status'] == 'success':
                modified_text = res['text']
            else:
                return res
        
        return {"status": "success", "text": modified_text}

    def execute_statement(self, stmt, text):
        raw_command = stmt.get('command', 'find')
        command = raw_command.lower()
        
        # Extract line range if present
        line_range = None
        if ':' in command:
            cmd_part, range_part = command.split(':', 1)
            command = cmd_part
            range_match = re.search(r'\[(\d+)-(\d+)\]', range_part)
            if range_match:
                line_range = (int(range_match.group(1)), int(range_match.group(2)))

        target = stmt.get('target')
        operator = stmt.get('operator')
        action = stmt.get('action')
        
        if command == 'find' or not command:
            if operator == '>>':
                target_regex = self.path_to_regex(target)
                if not target_regex:
                    return {"status": "error", "message": "Unsupported target path"}
                
                # Check for Implicit Recursive Reference (tag with inner target)
                is_inner_ref = False
                if target.get('type') == 'tag' and '{*}' in target.get('value'):
                    is_inner_ref = True
                    self.wildcard_count = 1 # Start from \2 because \1 is the command prefix
                else:
                    self.wildcard_count = 0

                replacement_body = self.action_to_string(action, is_replacement=True)
                
                if is_inner_ref:
                    # Wrap the replacement to preserve \1 (prefix) and \3 (suffix)
                    replacement = r'\1' + replacement_body + r'\3'
                else:
                    replacement = replacement_body
                
                try:
                    if line_range:
                        return self.apply_to_range(text, target_regex, replacement, line_range)
                    
                    new_text = re.sub(target_regex, replacement, text, flags=re.DOTALL)
                    return {"status": "success", "text": new_text}
                except re.error as e:
                    return {"status": "error", "message": f"Regex error: {str(e)}"}
                
        elif command == 'delete':
            target_regex = self.path_to_regex(target)
            new_text = re.sub(target_regex, '', text, flags=re.DOTALL)
            return {"status": "success", "text": new_text}
            
        return {"status": "error", "message": f"Command '{command}' not fully implemented"}

    def apply_to_range(self, text, regex, replacement, line_range):
        lines = text.splitlines(True)
        start_line, end_line = line_range
        start_idx = max(0, start_line - 1)
        end_idx = min(len(lines), end_line)
        before = "".join(lines[:start_idx])
        target_content = "".join(lines[start_idx:end_idx])
        after = "".join(lines[end_idx:])
        new_target_content = re.sub(regex, replacement, target_content, flags=re.DOTALL)
        return {"status": "success", "text": before + new_target_content + after}

    def path_to_regex(self, target):
        if not target: return None
        
        if target.get('type') == 'string':
            val = target.get('value')
            # Handle @ shortcuts in strings
            val = val.replace('@img{*}', r'\\includegraphics(?:\[.*?\])?\{(.*?)\}')
            val = val.replace('@img', r'\\includegraphics(?:\[.*?\])?\{.*?\}')
            val = val.replace('@fig', r'\\begin\{figure\}(?:\[.*?\])?.*?\\end\{figure\}')
            
            parts = re.split(r'(!\*|\*)', val)
            res = ""
            for i, part in enumerate(parts):
                if i % 2 == 0:
                    res += re.escape(part)
                else:
                    res += r'\*' if part == '!*' else r'(.*?)'
            return res
        
        if target.get('type') == 'tag':
            val = target.get('value')
            if val.startswith('@img'):
                if '{*}' in val:
                    # Triple-group capture: 1=prefix, 2=inner(*), 3=suffix
                    return r'(\\includegraphics(?:\[.*?\])?\{)(.*?)(\})'
                return r'\\includegraphics(?:\[.*?\])?\{.*?\}'
            if val.startswith('@fig'):
                return r'\\begin\{figure\}(?:\[.*?\])?.*?\\end\{figure\}'
            return re.escape(val)
        
        if target.get('type') == 'path':
            elements = target.get('elements', [])
            return "".join(self.path_to_regex(el) or r'.*?' for el in elements)
        
        return None

    def action_to_string(self, action, is_replacement=False):
        if not action: return ""
        if isinstance(action, dict):
            if action.get('type') == 'string':
                val = action.get('value')
                return self.prepare_replacement(val) if is_replacement else val
            if action.get('type') in ('identifier', 'number', 'raw'):
                val = action.get('value')
                return self.prepare_replacement(val) if is_replacement else val
            if action.get('type') == 'tag':
                val = action.get('value')
                if is_replacement:
                    if val.startswith('@img'): return r'\includegraphics'
                    if val.startswith('@fig'): return r'\begin{figure}'
                return val
            if action.get('type') == 'action_complex':
                parts = action.get('parts', [])
                return "".join(self.action_to_string(p, is_replacement) for p in parts)
        return str(action)

    def prepare_replacement(self, val):
        parts = re.split(r'(!\*|\*)', val)
        new_parts = []
        for i, part in enumerate(parts):
            if i % 2 == 0:
                new_parts.append(part.replace('\\', '\\\\'))
            else:
                if part == '!*':
                    new_parts.append('*')
                else:
                    self.wildcard_count += 1
                    new_parts.append(f'\\{self.wildcard_count}')
        return "".join(new_parts)

def execute_query_on_text(text, query_str):
    parse_res = parse_tex_machina_query(query_str)
    if parse_res['status'] == 'error': return parse_res
    executor = QueryExecutor(text)
    return executor.execute_query(parse_res['ast'])
