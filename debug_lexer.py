import re
from python_backend.query_parser import QueryLexer

def debug_lexer(text):
    lexer = QueryLexer(text)
    text_to_scan = text.strip()
    if text_to_scan.startswith('?'):
        print("Matched PREFIX: ?")
        text_to_scan = text_to_scan[1:].strip()
    
    pos = 0
    while pos < len(text_to_scan):
        matched = False
        for name, pattern in lexer.patterns:
            regex = re.compile(pattern)
            match = regex.match(text_to_scan, pos)
            if match:
                value = match.group(0)
                if name != 'WHITESPACE':
                    print(f"Matched {name}: {value} at {pos}")
                else:
                    # print(f"Matched WHITESPACE at {pos}")
                    pass
                pos += len(value)
                matched = True
                break
        
        if not matched:
            print(f"Skipping: {repr(text_to_scan[pos])} at {pos}")
            pos += 1

debug_lexer(r"? find \frac{@arg[2]:@int} where @int == 0 >> 1")
