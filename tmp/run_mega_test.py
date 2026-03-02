import sys
import os
import json

# 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_backend.query_parser import parse_tex_machina_query
from python_backend.query_engine import execute_query_on_text

def test_mega():
    tex_path = 'tmp/mega_complex_test.tex'
    if not os.path.exists(tex_path):
        print(f"File not found: {tex_path}")
        return
        
    with open(tex_path, 'r') as f:
        text = f.read()
    
    # 1. Parsing Test for an extremely complex query
    mega_query = r"""
? loop { 
    find 'figure > @img[#w > 0.5\textwidth]' 
    where has \caption 
    -> //large_imgs 
    { 
        >> #s * 0.8,
        +> ^(find '... > \caption{*}' >> "\caption{* (Scaled)}")^
    }
} 
& find 'tabular'[@row > 5] -> //long_tables 
&& "0" >> "ZERO" 
&& move //large_imgs >> //long_tables.|
order by inner:forward
"""
    print("--- MEGA PARSING TEST ---")
    parse_res = parse_tex_machina_query(mega_query)
    if parse_res['status'] == 'success':
        print("✅ Mega Query Parsed Successfully!")
    else:
        print(f"❌ Mega Query Parsing Failed: {parse_res['message']}")
        # print(parse_res.get('trace'))
        return

    # 2. Execution Test
    practical_query = (
        r'? @img >> "[[IMG]]" '
        r'&& "undefined" >> "FIXED_VALUE" '
        r'&& delete "A 6-row table" '
        r'&& find "Level 3: Target Item" >> "Level 3: FOUND" '
        r'&& "E_1 = m_1 c^2" >> "ENERGY_FORMULA_1"'
    )
    
    print("\n--- PRACTICAL EXECUTION TEST ---")
    exec_res = execute_query_on_text(text, practical_query)
    
    if exec_res['status'] == 'success':
        print("✅ Execution Successful!")
        out = exec_res['text']
        
        checks = {
            "Images replaced": "[[IMG]]" in out,
            "Undefined fixed": "FIXED_VALUE" in out,
            "Table caption deleted": "A 6-row table" not in out,
            "Nested item found": "Level 3: FOUND" in out,
            "Appendix formulas updated": "ENERGY_FORMULA_1" in out
        }
        
        for name, passed in checks.items():
            print(f"{'[OK]' if passed else '[FAIL]'} {name}")
            
        with open('tmp/mega_test_result.tex', 'w') as f:
            f.write(out)
        print("\nFull result saved to tmp/mega_test_result.tex")
    else:
        print(f"❌ Execution Failed: {exec_res['message']}")

if __name__ == "__main__":
    test_mega()
