import json
import sys
import os

# Ensure we can import from python_backend
sys.path.append(os.getcwd())

from python_backend.query_parser import parse_tex_machina_query

test_cases = [
    # Basic commands and operators
    "? exchange 'figure:27' <=> 'figure:58'",
    "? 'figure:27' <=> 'figure:58'",
    "? move 'minipage:27' to 82",
    "? find 'figure > \\centering' <+ 'minipage:27'",
    "? find -p:@float '... > \\includegraphics[*]' >> '1'",
    
    # Hierarchy and searching
    "? find 'figure > ... > \\caption'",
    "? find 'figure > minipage? > \\includegraphics'",
    "? find 'figure$ \\includegraphics'",
    "? find '!(figure > ... > \\caption{\"임시\"})'", 
    
    # Registers and flow control
    "? \\caption -> //1 & \\includegraphics -> //2 && move //1 >> //2.|",
    "? @eq -> //maths & tabular$@cell[3, @all] -> //cells && move //maths >> //cells",
    
    # Loops and shorthand
    "? loop{find:[100-150] 'figure > ... > \\caption{*}' <+ \"그림 [#i] : \"}",
    "? @img { >> #scale * 0.8 , <+ \"\\centering\" }",
    
    # Conditions
    "? find \\frac{@arg[2]:@int} where @int == 0 >> 1",
    "? find 'figure' where #scale > 1",
    "? find 'figure' without \\caption",
    
    # Sorting and Cursor
    "? find 'figure' order by reverse:1",
    "? move ^(find \\caption)^ >> figure.|",
    
    # Complex/New operators
    "? find 'itemize > \\item' ><> 'itemize'", 
    "? find 'figure > center > \\includegraphics' ^^",
    "? find 'figure' vv 'minipage'",
    
    # Tags and Regex
    "? find 'tabular > @row{3}'",
    "? find \\item (?= \\item)", 
    
    # Structural filters
    "? find 'figure' :in(minipage)", 
    "? find 'figure' :+ \\caption",
    "? find 'figure' :- \\caption",
    "? find #scale :!(<1)" 
]

for q in test_cases:
    print(f"Testing: {q}")
    result = parse_tex_machina_query(q)
    if result["status"] == "success":
        ast_str = json.dumps(result["ast"], ensure_ascii=False)
        # print(f"  AST: {ast_str}")
        
        # Specific check for known likely failures
        if "!(" in q and "!" not in ast_str:
             # Actually '!' is in ops, but '(' isn't tokenized. 
             # Let's see if the '!' at least made it.
             pass
        
        if "where" in q and "==" in q:
             # If == is an operator, it might be in extra_targets, not in the condition
             # Let's check where it ended up.
             found_eq = False
             for stmt in result["ast"].get("statements", []):
                 for cond in stmt.get("conditions", []):
                     if "==" in cond.get("value", ""):
                         found_eq = True
                 for target in stmt.get("extra_targets", []):
                     if target.get("value") == "==":
                         print("  [!] Issue: '==' captured as extra_target instead of natural condition value")
    else:
        print(f"  [X] Failed: {result.get('message')}")
    print("-" * 20)
