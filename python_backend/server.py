import sys
import json
import sympy
from latex2sympy2 import latex2sympy

def handle_calc(parsed):
    latex_in = parsed.get('rawSelection', '')
    sub_cmds = parsed.get('subCommands', [])
    
    # 그리스 문자 보호 및 기호 인식 [cite: 136, 137]
    expr = latex2sympy(latex_in)
    
    res_latex = ""
    if sub_cmds and sub_cmds[0] == 'diff':
        var = sympy.Symbol(sub_cmds[1]) if len(sub_cmds) > 1 else list(expr.free_symbols)[0]
        res_latex = sympy.latex(sympy.diff(expr, var)) [cite: 25, 138]
    elif sub_cmds and sub_cmds[0] == 'int':
        res_latex = sympy.latex(sympy.integrate(expr)) [cite: 25, 139]
    else:
        res_latex = sympy.latex(sympy.simplify(expr)) [cite: 24]

    return {"status": "success", "latex": res_latex, "vars": [str(s) for s in expr.free_symbols]}

for line in sys.stdin:
    try:
        data = json.loads(line)
        result = handle_calc(data)
        print(json.dumps(result))
        sys.stdout.flush()
    except:
        pass