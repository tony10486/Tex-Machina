import sys
import os
import json

# 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_backend.query_engine import execute_query_on_text

def test_run():
    tex_path = 'tmp/complex_test.tex'
    if not os.path.exists(tex_path):
        print(f"File not found: {tex_path}")
        return
        
    with open(tex_path, 'r') as f:
        text = f.read()
    
    # Test 1: Simple replace
    query1 = '? @img >> "REPLACED_IMAGE"'
    print(f"Running Query 1: {query1}")
    res1 = execute_query_on_text(text, query1)
    if res1['status'] == 'success':
        print("Success!")
        # print(res1['text'])
    else:
        print(f"Error: {res1['message']}")

    # Test 2: Delete figure
    query2 = '? delete @fig'
    print(f"Running Query 2: {query2}")
    res2 = execute_query_on_text(text, query2)
    if res2['status'] == 'success':
        print("Success!")
        # print(res2['text'])
    else:
        print(f"Error: {res2['message']}")

    # Test 4: Sequential replace
    query4 = '? @img >> "IMAGE_REPLACED" && "A cute dog" >> "A beautiful dog"'
    print(f"Running Query 4: {query4}")
    res4 = execute_query_on_text(text, query4)
    if res4['status'] == 'success':
        print("Success! (Excerpts):")
        if "IMAGE_REPLACED" in res4['text'] and "A beautiful dog" in res4['text']:
            print("Both replacements found!")
        else:
            print("One or more replacements MISSING!")
    else:
        print(f"Error: {res4['message']}")

if __name__ == "__main__":
    test_run()
