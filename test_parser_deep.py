import json
import sys
import os

# Ensure we can import the parser
sys.path.append(os.getcwd())
from python_backend.query_parser import parse_tex_machina_query

def test_query(query):
    print(f"\nTesting Query: {query}")
    result = parse_tex_machina_query(query)
    if result["status"] == "success":
        print("✅ SUCCESS")
        # print(json.dumps(result["ast"], indent=2, ensure_ascii=True))
    else:
        print("❌ FAILED")
        print(f"Error: {result.get('message')}")
        # print(f"Trace: {result.get('trace')}")
    return result

# 1. Complex Hierarchy & Optional Existence
# The README mentions 'figure > minipage? > \includegraphics'
test_query("? find 'figure > minipage? > \\includegraphics'")

# 2. Block Absorption (Missing Mutation)
test_query("? 'itemize' ><> 'itemize'")

# 3. Reverse Selection & Deep Search
test_query("? find !(figure > ... > \\caption{'임시'})")

# 4. Complex Mutation with Math
test_query("? @img { >> #scale * 0.8 , <+ '\\centering' }")

# 5. Subqueries & Cursors
test_query("? move ^(find \\caption ~ \\includegraphics < \\caption)^ >> figure.|")

# 6. Natural Language Conditions with Logic
test_query("? 'figure' where #scale > 1 and #align == 'center' or without \\caption")

# 7. Order By with Direction and Index
test_query("? find 'figure' order by forward:reverse 1")

# 8. Nested Loops & Counters
test_query("? loop { find:[100-150] 'figure > ... > \\caption{*}' <+ '\"그림 [#i] : \"' }")

# 9. Register/Memory Operations
test_query("? @eq -> //maths & tabular$@cell[3, @all] -> //cells && move //maths >> //cells")

# 10. Tag with Quantifiers and Casts
test_query("? find \\frac{@arg[2]:@int} where @int == 0 >> 1")

# 11. Multiple statements and Separators
test_query("? find 'a' & find 'b' && move 'c' >> 'd' , delete 'e'")
