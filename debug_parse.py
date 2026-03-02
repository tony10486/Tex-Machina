import sympy as sp
import re
try:
    from latex2sympy2 import latex2sympy
except ImportError:
    try:
        from sympy.parsing.latex import parse_latex as latex2sympy
    except ImportError:
        latex2sympy = None

if latex2sympy:
    expr = latex2sympy(r"\sin(x)")
    print(f"Expr: {expr}")
    funcs = expr.atoms(sp.Function)
    print(f"Atoms(Function): {funcs}")
    for f in funcs:
        print(f"Type(f): {type(f)}")
        print(f"f.func: {f.func}")
        print(f"sp.sin: {sp.sin}")
        print(f"Type(f) == sp.sin: {type(f) == sp.sin}")
        print(f"f.func == sp.sin: {f.func == sp.sin}")
        print(f"isinstance(f, type(sp.sin(sp.Symbol('x')))): {isinstance(f, type(sp.sin(sp.Symbol('x'))))}")
else:
    print("latex2sympy not available")
