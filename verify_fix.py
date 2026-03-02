import sympy as sp
import re
from typing import Tuple, List

PGF_SUPPORTED_FUNCS = (
    sp.sin, sp.cos, sp.tan, sp.asin, sp.acos, sp.atan, sp.atan2,
    sp.sinh, sp.cosh, sp.tanh,
    sp.sec, sp.csc, sp.cot, sp.asec, sp.acsc, sp.acot,
    sp.exp, sp.log, sp.Abs, sp.floor, sp.ceiling, sp.sqrt,
    sp.Min, sp.Max, sp.sign
)

def is_pgfplots_compatible(expr: sp.Expr) -> bool:
    funcs = expr.atoms(sp.Function)
    for f in funcs:
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

def sympy_to_pgfplots_str(expr: sp.Expr) -> str:
    expr_str = str(expr)
    expr_str = expr_str.replace('**', '^')
    replacements = {
        r'\bAbs\(': 'abs(',
        r'\bceiling\(': 'ceil(',
        r'\bfloor\(': 'floor(',
        r'\blog\(': 'ln(',
        r'\bMin\(': 'min(',
        r'\bMax\(': 'max(',
        r'\bSign\(': 'sign(',
        r'\bcsc\(': 'cosec(',
        r'\bE\b': 'e',
        r'\bpi\b': 'pi'
    }
    for pattern, repl in replacements.items():
        expr_str = re.sub(pattern, repl, expr_str)
    return expr_str

x = sp.Symbol('x')
y = sp.Symbol('y')
test_cases = [
    sp.sec(x),
    sp.csc(x),
    sp.cot(x),
    sp.atan2(y, x),
    sp.Min(x, 1),
    sp.Max(x, 0),
    sp.ceiling(x),
    sp.sign(x),
    sp.pi * x,
    sp.E ** x
]

for e in test_cases:
    comp = is_pgfplots_compatible(e)
    pgf_str = sympy_to_pgfplots_str(e)
    print(f"Expr: {e}")
    print(f"  Compatible: {comp}")
    print(f"  PGF Str: {pgf_str}")
    print("-" * 20)
