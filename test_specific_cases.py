from python_backend.query_parser import QueryLexer

def test_lexer_tokens(query):
    lexer = QueryLexer(query)
    tokens = lexer.tokenize()
    print(f"Query: {query}")
    print(f"Tokens: {tokens}")
    print("-" * 20)

test_lexer_tokens(r"? find 'itemize > \item' ><> 'itemize'")
test_lexer_tokens(r'? find "!(figure > ... > \caption{\"임시\"})"')
test_lexer_tokens(r"? find \item (?= \item)")
test_lexer_tokens(r"? find #scale :!(<1)")
test_lexer_tokens(r"? find 'figure' :in(minipage)")
test_lexer_tokens(r"? find \frac{@arg[2]:@int} where @int == 0 >> 1")
