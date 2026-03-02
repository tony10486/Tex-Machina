import json
import sys
import os

sys.path.append(os.getcwd())
from python_backend.query_parser import parse_tex_machina_query

test_cases = {
    "Basic Commands": [
        r"? find 'figure'",
        r"? find:[100-150] 'figure'",
        r"? exchange 'figure:27' <=> 'figure:58'",
        r"? move 'minipage:27' to 82",
        r"? find 'figure > \centering' <+ 'minipage:27'",
        r"? duplicate 'figure' to 100",
        r"? delete 'figure'",
        r"? insert 'figure' at 50",
        r"? extract 'figure' to 'output.tex'"
    ],
    "Options": [
        r"? find -a 'figure'",
        r"? find -f 'figure'",
        r"? find -p:3 'figure'",
        r"? find -p:@float 'figure'",
        r"? find -ask 'figure'"
    ],
    "Tags & Abbreviations": [
        r"? find #scale",
        r"? find #geometry",
        r"? find #align",
        r"? find #color",
        r"? find @float",
        r"? find @int",
        r"? find @string",
        r"? find @dimen",
        r"? find @math",
        r"? find @brace",
        r"? find @braket",
        r"? find @arg[1]",
        r"? find @col[2]",
        r"? find @row[3]",
        r"? find @img",
        r"? find @fig",
        r"? find @tbl",
        r"? find #w",
        r"? find #s",
        r"? find #h",
        r"? find #c"
    ],
    "Hierarchy Operators": [
        r"? find 'figure > \includegraphics'",
        r"? find '\includegraphics ~ \caption'",
        r"? find '\caption < figure'",
        r"? find '\caption << figure'",
        r"? find 'figure > ... > \caption'",
        r"? find 'figure > minipage? > \includegraphics'",
        r"? find 'figure$\caption'",
        r"? find '!(figure > ... > \caption{\"임시\"})'"
    ],
    "Mutation Operators": [
        r"? find '\includegraphics{*}' >> 'new_name'",
        r"? find '\includegraphics' +> '\caption{test}'",
        r"? find '\includegraphics' <+ '\centering'",
        r"? find 'itemize' >< 'center'",
        r"? find 'center' <>",
        r"? find 'item' ** 3",
        r"? find 'itemize' >+< 'itemize'",
        r"? find 'text' </> ','",
        r"? find '\textbf{a}' <=> '\textit{a}'",
        r"? find 'figure > center > \includegraphics' ^^",
        r"? find 'itemize' vv '\item'",
        r"? find 'itemize' ><> 'itemize'"
    ],
    "Flow Control & Memory": [
        r"? find 'a' & find 'b'",
        r"? find 'a' && find 'b'",
        r"? find 'a' , find 'b'",
        r"? move ^(find \caption)^ >> figure.|",
        r"? loop { find 'a' >> 'b' }",
        r"? #i + 1 && loop { find 'figure' >> 'fig-[#i]' }",
        r"? \caption -> //1 & \includegraphics -> //2 && move //1 >> //2.|"
    ],
    "Filters & Conditions": [
        r"? find figure[@float > 1]",
        r"? find 'figure' where #scale > 1",
        r"? find 'figure' without \caption",
        r"? find 'figure' has \includegraphics",
        r"? find 'figure' where #scale > 1 and #align == 'center'",
        r"? find 'figure' where not #scale < 1"
    ],
    "Regex & Structural": [
        r"? find \item*",
        r"? find @row{3}",
        r"? find \includegraphics (?= \caption)",
        r"? find \includegraphics (?! \caption)",
        r"? find \caption (?<= \includegraphics)",
        r"? find \caption (?<! \includegraphics)"
    ],
    "Self Reference & Cursor": [
        r"? @img >> _{#scale * 0.8}",
        r"? @img { >> #scale * 0.8 , <+ \"\centering\" }",
        r"? find 'figure > \includegraphics[|]'",
        r"? move 'caption' >> figure.|",
        r"? move 'caption' >> .|figure|",
        r"? move 'caption' >> figure.|."
    ],
    "Math/Mixed action": [
        r"? #scale >> #scale * 0.5",
        r"? #scale >> \"0.5\""
    ]
}

def run_tests():
    total = 0
    passed = 0
    results = {}

    for category, queries in test_cases.items():
        category_results = []
        for query in queries:
            total += 1
            res = parse_tex_machina_query(query)
            if res["status"] == "success":
                passed += 1
                category_results.append({"query": query, "status": "✅"})
            else:
                category_results.append({
                    "query": query, 
                    "status": "❌", 
                    "error": res.get("message"),
                    "trace": res.get("trace")
                })
        results[category] = category_results

    print(f"Summary: {passed}/{total} passed")
    
    for category, category_results in results.items():
        print(f"\n### {category}")
        for res in category_results:
            print(f"{res['status']} {res['query']}")
            if res['status'] == "❌":
                print(f"   Error: {res['error']}")
                # print(f"   Trace: {res['trace']}")

if __name__ == "__main__":
    run_tests()
