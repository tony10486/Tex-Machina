
import json
import sys
import os

sys.path.append(os.getcwd())
from python_backend.query_parser import parse_tex_machina_query

def test_query(query, show_ast=True):
    print(f"Testing Query: {query}")
    result = parse_tex_machina_query(query)
    if result["status"] == "success":
        print("✅ SUCCESS")
        if show_ast:
            print(json.dumps(result["ast"], indent=2, ensure_ascii=False))
    else:
        print("❌ FAILED")
        print(f"Error: {result.get('message')}")
    return result

# Path with optional existence (no quotes)
test_query("? find figure > minipage? > \includegraphics")

# Block absorption (no quotes)
test_query("? itemize ><> itemize")
