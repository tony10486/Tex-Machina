import json
import sys
import os
import re

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

text = r"""\begin{figure}[H]
    \centering
    \includegraphics[width=0.4\linewidth]{1-4.png}
    \caption{공간곡선에서의 프레네 틀}
    \label{1-4}
\end{figure}"""

# The simple query that failed before
query = r'? @img{*} >> "images/*"'

test_query(query, text)
