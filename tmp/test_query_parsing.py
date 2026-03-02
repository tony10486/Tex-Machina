import sys
import os
import json

# 파서 임포트를 위해 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_backend.query_parser import parse_tex_machina_query

def run_extreme_test():
    # 극한의 복합 쿼리 (raw string 사용 및 따옴표 처리)
    extreme_query = r"""
? loop { 
    find:[1-500] 'figure > minipage? > @img[#w:@dimen > 10cm]' 
    where has \caption and without \label or #c == "red" 
    -> //big_figs 
    { 
        >> #s * 0.5, 
        <+ "\centering\n", 
        +> ^(find '... > \label{*}' >> "fig:#i")^ 
    } 
} 
& find 'tabular'[@row > 5] -> //large_tables 
&& move //big_figs >> //large_tables.| 
order by longest:reverse
"""

    print(f"Testing Extreme Query:\n{extreme_query}\n")
    
    result = parse_tex_machina_query(extreme_query)
    
    if result["status"] == "success":
        print("✅ Parsing Successful!")
        # 가독성을 위해 AST의 일부 핵심 구조 확인
        ast = result["ast"]
        print(f"Root Type: {ast['type']}")
        
        # 전체 결과 출력
        print("\nFull AST Output:")
        # 인코딩 문제 방지를 위해 sys.stdout.buffer.write 사용 가능하지만 일반 print로 시도
        json_output = json.dumps(result, indent=2, ensure_ascii=False)
        print(json_output)
    else:
        print("❌ Parsing Failed!")
        print(f"Error: {result.get('message')}")
        if "trace" in result:
            print(result["trace"])

if __name__ == "__main__":
    run_extreme_test()
