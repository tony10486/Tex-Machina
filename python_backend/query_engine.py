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
        
        # Extract line range if present (e.g., find:[8-33])
        line_range = None
        if ':' in command:
            cmd_part, range_part = command.split(':', 1)
            command = cmd_part
            # Extract numbers from [8-33]
            range_match = re.search(r'\[(\d+)-(\d+)\]', range_part)
            if range_match:
                line_range = (int(range_match.group(1)), int(range_match.group(2)))

        target = stmt.get('target')
        operator = stmt.get('operator')
        action = stmt.get('action')
        
        # Simple implementation of find and replace (>>)
        if command == 'find' or not command:
            if not operator:
                # Just find and return locations/results (not implemented for full text return yet)
                return {"status": "success", "text": text}
            
            if operator == '>>':
                # Replace logic
                target_regex = self.path_to_regex(target)
                if not target_regex:
                    return {"status": "error", "message": "Unsupported target path"}
                
                self.wildcard_count = 0
                replacement = self.action_to_string(action, is_replacement=True)
                
                try:
                    if line_range:
                        return self.apply_to_range(text, target_regex, replacement, line_range)
                    
                    new_text = re.sub(target_regex, replacement, text)
                    return {"status": "success", "text": new_text}
                except re.error as e:
                    return {"status": "error", "message": f"Regex error: {str(e)}"}
                
        elif command == 'delete':
            target_regex = self.path_to_regex(target)
            if line_range:
                return self.apply_to_range(text, target_regex, '', line_range)
            new_text = re.sub(target_regex, '', text)
            return {"status": "success", "text": new_text}
            
        elif command == 'move':
            target_regex = self.path_to_regex(target)
            
            # For move, we search in the whole text or range
            search_text = text
            offset = 0
            if line_range:
                lines = text.splitlines(True)
                start_line, end_line = line_range
                search_text = "".join(lines[start_line-1:end_line])
                offset = sum(len(l) for l in lines[:start_line-1])

            match = re.search(target_regex, search_text)
            if not match:
                return {"status": "error", "message": f"Target not found: {target}"}
            
            content = match.group(0)
            # Remove from original text using absolute positions
            abs_start = offset + match.start()
            abs_end = offset + match.end()
            text_removed = text[:abs_start] + text[abs_end:]
            
            # Simple line-based move if action or extra_targets is a number (line)
            self.wildcard_count = 0
            action_str = self.action_to_string(action)
            extra_targets = stmt.get('extra_targets', [])
            if not action_str and extra_targets:
                # Try to find a number in extra_targets (e.g., 'to 3')
                for et in extra_targets:
                    if et.get('type') == 'number' or (et.get('type') == 'raw' and et.get('value').isdigit()):
                        action_str = et.get('value')
                        break
            
            if action_str and action_str.isdigit():
                line_num = int(action_str)
                lines = text_removed.splitlines(True)
                if line_num <= len(lines):
                    lines.insert(line_num - 1, content + ('\n' if not content.endswith('\n') else ''))
                    return {"status": "success", "text": "".join(lines)}
                else:
                    return {"status": "success", "text": text_removed + '\n' + content}
            
        return {"status": "error", "message": f"Command '{command}' not yet fully implemented in engine"}

    def apply_to_range(self, text, regex, replacement, line_range):
        lines = text.splitlines(True)
        start_line, end_line = line_range
        
        # Adjust to 0-based indices
        start_idx = max(0, start_line - 1)
        end_idx = min(len(lines), end_line)
        
        before = "".join(lines[:start_idx])
        target_content = "".join(lines[start_idx:end_idx])
        after = "".join(lines[end_idx:])
        
        new_target_content = re.sub(regex, replacement, target_content)
        return {"status": "success", "text": before + new_target_content + after}

    def path_to_regex(self, target):
        """Converts a query path AST to a regex pattern."""
        if not target: return None
        
        if target.get('type') == 'string':
            val = target.get('value')
            # Handle !* as literal * and * as capture group (.*?)
            parts = re.split(r'(!\*|\*)', val)
            res = ""
            for i, part in enumerate(parts):
                if i % 2 == 0:
                    res += re.escape(part)
                else:
                    if part == '!*':
                        res += r'\*'
                    else: # part == '*'
                        res += r'(.*?)'
            return res
        
        if target.get('type') == 'identifier':
            val = target.get('value')
            if val.startswith('\\'):
                return re.escape(val) + r'(?:\{.*?\})?'
            return re.escape(val)
        
        if target.get('type') == 'tag':
            val = target.get('value')
            if val == '@img': return r'\\includegraphics(?:\[.*?\])?\{.*?\}'
            if val == '@fig': return r'\\begin\{figure\}.*?\\end\{figure\}'
        
        if target.get('type') == 'group':
            # This is a bit complex, but for simple cases like {Gemini CLI}
            # we can try to reconstruct the text
            body = target.get('body', {})
            if body.get('type') == 'query':
                # Just a very simple heuristic for now
                return r'\{.*?\}'
        
        if target.get('type') == 'path':
            elements = target.get('elements', [])
            parts = []
            for el in elements:
                res = self.path_to_regex(el)
                if res:
                    parts.append(res)
                elif el.get('type') == 'path_op':
                    op = el.get('value')
                    if op == '>': parts.append(r'.*?')
                    elif op == '...': parts.append(r'.*?')
                    elif op == '~': parts.append(r'.*?')
            return "".join(parts)

        return None

    def action_to_string(self, action, is_replacement=False):
        if not action: return ""
        if isinstance(action, dict):
            if action.get('type') == 'string':
                val = action.get('value')
                if is_replacement:
                    return self.prepare_replacement(val)
                return val
            if action.get('type') == 'identifier':
                return action.get('value')
            if action.get('type') == 'number':
                return action.get('value')
            if action.get('type') == 'tag':
                return action.get('value')
            if action.get('type') == 'raw':
                val = action.get('value')
                if is_replacement:
                    return self.prepare_replacement(val)
                return val
            if action.get('type') == 'action_complex':
                parts = action.get('parts', [])
                return "".join(self.action_to_string(p, is_replacement) for p in parts)
        return str(action)

    def prepare_replacement(self, val):
        # Replacement side: !* is literal *, * is \1, \2, ...
        parts = re.split(r'(!\*|\*)', val)
        new_parts = []
        for i, part in enumerate(parts):
            if i % 2 == 0:
                # re.sub replacement needs \ to be escaped as \\
                new_parts.append(part.replace('\\', '\\\\'))
            else:
                if part == '!*':
                    new_parts.append('*')
                else: # part == '*'
                    self.wildcard_count += 1
                    new_parts.append(f'\\{self.wildcard_count}')
        return "".join(new_parts)

def execute_query_on_text(text, query_str):
    parse_res = parse_tex_machina_query(query_str)
    if parse_res['status'] == 'error':
        return parse_res
    
    executor = QueryExecutor(text)
    return executor.execute_query(parse_res['ast'])
