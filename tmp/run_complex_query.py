import sys
import os
import json

# 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_backend.query_engine import execute_query_on_text

def test_complex():
    tex_path = 'tmp/complex_test.tex'
    if not os.path.exists(tex_path):
        print(f"File not found: {tex_path}")
        return
        
    with open(tex_path, 'r') as f:
        text = f.read()
    
    # Very complex query
    query = '? @img >> "IMAGE_REPLACED" && delete "Status & Value" && "A majestic dog" >> "A brave dog" && move author >> 10'
    print(f"Running Complex Query:\n{query}\n")
    
    res = execute_query_on_text(text, query)
    
    if res['status'] == 'success':
        print("✅ Success!")
        output_text = res['text']
        
        # Verify changes
        if "IMAGE_REPLACED" in output_text:
            print("- @img replaced correctly")
        if "Status & Value" not in output_text:
            print("- Deletion worked")
        if "A brave dog" in output_text:
            print("- Text replacement worked")
        
        # Check author position (roughly)
        lines = output_text.splitlines()
        for i, line in enumerate(lines[:15]):
            if "author" in line:
                print(f"- Move worked (author found at line {i+1})")
                break
            
        # Write back to see the results
        with open('tmp/complex_test_result.tex', 'w') as f:
            f.write(output_text)
        print("\nResults written to tmp/complex_test_result.tex")
    else:
        print(f"❌ Error: {res['message']}")

if __name__ == "__main__":
    test_complex()
