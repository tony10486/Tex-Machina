import sympy as sp

x = sp.Symbol('x')
test_exprs = [
    sp.sqrt(x),
    sp.sin(x),
    sp.log(x),
    sp.exp(x),
    sp.Rational(1, 2),
    sp.pi,
    sp.E,
    x**2,
    sp.Abs(x),
    sp.floor(x),
    sp.ceiling(x),
    sp.sec(x)
]

for e in test_exprs:
    print(f"Expr: {e}, str: {str(e)}, type: {type(e)}")
