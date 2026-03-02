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
        command = stmt.get('command', 'find').lower()
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
                
                replacement = self.action_to_string(action)
                new_text = re.sub(target_regex, replacement, text)
                return {"status": "success", "text": new_text}
                
        elif command == 'delete':
            target_regex = self.path_to_regex(target)
            new_text = re.sub(target_regex, '', text)
            return {"status": "success", "text": new_text}
            
        elif command == 'move':
            target_regex = self.path_to_regex(target)
            match = re.search(target_regex, text)
            if not match:
                return {"status": "error", "message": f"Target not found: {target}"}
            
            content = match.group(0)
            text_removed = text[:match.start()] + text[match.end():]
            
            # Simple line-based move if action or extra_targets is a number (line)
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

    def path_to_regex(self, target):
        """Converts a query path AST to a regex pattern."""
        if not target: return None
        
        if target.get('type') == 'string':
            return re.escape(target.get('value'))
        
        if target.get('type') == 'identifier':
            val = target.get('value')
            if val.startswith('\\'):
                return re.escape(val) + r'(?:\{.*?\})?'
            return re.escape(val)
        
        if target.get('type') == 'tag':
            val = target.get('value')
            if val == '@img': return r'\\includegraphics(?:\[.*?\])?\{.*?\}'
            if val == '@fig': return r'\\begin\{figure\}.*?\\end\{figure\}'
        
        if target.get('type') == 'path':
            # Handle simple paths like 'figure > \includegraphics'
            elements = target.get('elements', [])
            # This is a very simplified version
            parts = []
            for el in elements:
                if el.get('type') == 'identifier':
                    parts.append(re.escape(el.get('value')))
                elif el.get('type') == 'path_op' and el.get('value') == '>':
                    parts.append(r'.*?')
            return "".join(parts)

        return None

    def action_to_string(self, action):
        if not action: return ""
        if isinstance(action, dict):
            if action.get('type') == 'string':
                return action.get('value')
            if action.get('type') == 'identifier':
                return action.get('value')
        return str(action)

def execute_query_on_text(text, query_str):
    parse_res = parse_tex_machina_query(query_str)
    if parse_res['status'] == 'error':
        return parse_res
    
    executor = QueryExecutor(text)
    return executor.execute_query(parse_res['ast'])
