import json
import sys
import os

sys.path.append(os.getcwd())
from python_backend.query_parser import parse_tex_machina_query

def inspect_query(query):
    print("\n--- Inspecting Query: " + query + " ---")
    res = parse_tex_machina_query(query)
    if res["status"] == "success":
        print(json.dumps(res["ast"], indent=2, ensure_ascii=False))
    else:
        print("❌ FAILED: " + str(res.get('message')))

# Suspicious cases
inspect_query(r"? #i + 1 && loop { find 'figure' >> 'fig-[#i]' }")
inspect_query(r"? find 'figure' where not #scale < 1")
inspect_query(r"? find figure[@float > 1]")
inspect_query(r"? @img { >> #scale * 0.8 , <+ \"\centering\" }")
inspect_query(r"? find \includegraphics (?! \caption)")
inspect_query(r"? move ^(find \caption)^ >> figure.|")
inspect_query(r"? move ^(find \caption ~ \includegraphics < \caption)^ >> figure.| & find figure without \centering > \includegraphics <+ \"\centering\n\"")
