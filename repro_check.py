import sympy as sp
from typing import Tuple, List

PGF_SUPPORTED_FUNCS = (
    sp.sin, sp.cos, sp.tan, sp.asin, sp.acos, sp.atan,
    sp.sinh, sp.cosh, sp.tanh,
    sp.exp, sp.log, sp.Abs, sp.floor, sp.ceiling, sp.sqrt
)

def is_pgfplots_compatible(expr: sp.Expr) -> bool:
    funcs = expr.atoms(sp.Function)
    print(f"Atoms for {expr}: {funcs}")
    for f in funcs:
        print(f"Checking atom: {f}, type: {type(f)}")
        if type(f) in PGF_SUPPORTED_FUNCS:
            continue
            
        try:
            types_only = tuple(t for t in PGF_SUPPORTED_FUNCS if isinstance(t, type))
            if isinstance(f, types_only):
                continue
        except:
            pass
            
        return False
    return True

x = sp.Symbol('x')
test_exprs = [
    sp.sin(x),
    sp.cos(x),
    x**2 + 1,
    sp.log(x),
    sp.exp(x),
    sp.sqrt(x),
    sp.tan(x),
    sp.Abs(x),
    sp.floor(x),
    sp.ceiling(x),
    sp.gamma(x)
]

for e in test_exprs:
    print(f"Expr: {e}, Compatible: {is_pgfplots_compatible(e)}")
    print("-" * 20)
