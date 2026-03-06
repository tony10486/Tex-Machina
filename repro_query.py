import json
import sys
import os

# Add current directory to path to import local modules
sys.path.append(os.getcwd())
from python_backend.query_engine import execute_query_on_text

def test_query(query_str, input_text):
    print(f"Testing Query: {query_str}")
    result = execute_query_on_text(input_text, query_str)
    if result['status'] == 'success':
        print("Resulting Text:")
        print(result['text'])
    else:
        print(f"Error: {result.get('message')}")
        if 'trace' in result:
            print(result['trace'])

with open('tmp/test.tex', 'r') as f:
    text = f.read()

# Query attempt 2: No spaces, handle optional arguments with *
query2 = r"? find '\begin{figure}*\includegraphics*{*}*\end{figure}' >> '\begin{figure}*\includegraphics*{images/*}*\end{figure}'"

test_query(query2, text)
