
import json
import sys
import os

# 현재 디렉토리를 path에 추가하여 python_backend 임포트 가능하게 함
sys.path.append(os.getcwd())

try:
    from python_backend.query_parser import parse_tex_machina_query
except ImportError:
    print("Error: python_backend/query_parser.py를 찾을 수 없습니다.")
    sys.exit(1)

attack_queries = {
    "1. Cursor Ambiguity": "? move 'caption' >> figure.|",
    "2. Self-ref Property": "? @img >> _{#scale * 0.5}",
    "3. Negative Lookahead": "? find \includegraphics (?! \caption)",
    "4. Quantifier Clash": "? find @row{3} > @cell",
    "5. Chained Mutation": "? find 'a' >> 'b' +> 'c'",
    "6. Math Evaluation": "? #scale >> #scale * 0.8 / 2",
    "7. Deep Search Clash": "? find figure > ... > caption"
}

def run_test():
    report = {}
    for name, query in attack_queries.items():
        report[name] = parse_tex_machina_query(query)
    
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    run_test()
