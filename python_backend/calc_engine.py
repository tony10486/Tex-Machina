import sympy as sp
from sympy.parsing.latex import parse_latex  # 공식 파서 사용
import json
import re

def op_tensor_expand(expr, args):
    """
    아인슈타인 합 규약(Einstein summation) 해석 모듈
    문자열 레벨에서 위/아래 반복되는 인덱스를 찾아 Sum 연산으로 치환합니다.
    """
    # SymPy 객체로 넘어오기 전 원시 LaTeX 문자열을 받아 처리한다고 가정
    # 예: A_i B^i 형태에서 반복되는 인덱스 i를 찾음
    raw_str = args[0] if args else str(expr)
    
    # 1. 아랫첨자(_)와 윗첨자(^) 추출
    lower_indices = re.findall(r'_([a-zA-Z\d])', raw_str)
    upper_indices = re.findall(r'\^([a-zA-Z\d])', raw_str)
    
    # 2. 반복되는 인덱스 (더미 인덱스) 찾기
    dummy_indices = set(lower_indices).intersection(set(upper_indices))
    
    if not dummy_indices:
        return sp.simplify(expr) # 반복 인덱스가 없으면 단순화만 수행
        
    # 3. Sum 객체로 감싸기 (차원은 기본 3차원(1~3)으로 가정, 필요시 옵션 확장)
    result = expr
    for idx in dummy_indices:
        idx_sym = sp.Symbol(idx)
        # 예: 1부터 3까지 합산
        result = sp.Sum(result, (idx_sym, 1, 3)).doit()
        
    return result

# ==========================================
# 1. 특수 연산 헬퍼 함수 (Helper Functions)
# ==========================================

def op_diff(expr, args):
    """다변수 편미분 및 일반 미분 처리 [cite: 32]"""
    # 변수가 명시되지 않으면 첫 번째 자유 변수(알파벳 순)로 미분 [cite: 139]
    if not args:
        symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
        if not symbols:
            return 0
        return sp.diff(expr, symbols[0])
    
    # diff > x, y 형태의 다변수 편미분 지원 [cite: 32]
    vars_to_diff = [sp.Symbol(v.strip()) for v in args[0].split(',')]
    return sp.diff(expr, *vars_to_diff)

def op_taylor(expr, args, parallels):
    """테일러 급수 전개: taylor / [차수] 또는 taylor > [변수], [차수]"""
    # 1. 대상 변수 결정
    symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
    var = sp.Symbol(args[0]) if args else (symbols[0] if symbols else sp.Symbol('x'))
    
    # 2. 차수 결정 (parallels에서 숫자 찾기 우선, 없으면 args, 기본값 4)
    n = 4
    for p in parallels:
        if p.isdigit():
            n = int(p)
            break
    if len(args) > 1 and args[1].isdigit():
        n = int(args[1])
        
    # 3. 테일러 전개 실행
    # e^x 같은 경우를 위해 수식 내의 'e'를 sp.E로 교체 시도 (필요시)
    calc_expr = expr
    if sp.Symbol('e') in expr.free_symbols:
        calc_expr = expr.subs(sp.Symbol('e'), sp.E)
        
    series_poly = sp.series(calc_expr, var, 0, n).removeO()
    
    # 4. 낮은 차수부터 정렬하여 수동으로 LaTeX 생성
    terms = sp.Add.make_args(series_poly.expand())
    def get_degree(term):
        d = sp.degree(term, var)
        return int(d) if d.is_integer else 0
            
    sorted_terms = sorted(terms, key=get_degree)
    
    # 5. 수동 LaTeX 조립 (정렬 유지)
    latex_parts = []
    for i, term in enumerate(sorted_terms):
        term_latex = sp.latex(term)
        # 첫 번째 항이 아니고 양수이면 앞에 + 추가
        if i > 0 and not term_latex.startswith('-'):
            latex_parts.append(' + ' + term_latex)
        else:
            latex_parts.append(term_latex)
            
    return "".join(latex_parts)

def op_int(expr, args):
    """부정적분 및 정적분 처리 [cite: 32]"""
    if not args:
        symbols = list(expr.free_symbols)
        return sp.integrate(expr, symbols[0]) if symbols else expr
    
    # int > x, a, b 형태의 구간 입력 [cite: 32, 139]
    params = [p.strip() for p in args[0].split(',')]
    var = sp.Symbol(params[0])
    if len(params) == 3:
        return sp.integrate(expr, (var, sp.sympify(params[1]), sp.sympify(params[2])))
    return sp.integrate(expr, var)

def op_limit(expr, args):
    """극한 계산: limit > x, 0 또는 limit > x, oo, -"""
    if not args: return expr
    params = [p.strip() for p in args[0].split(',')]
    var = sp.Symbol(params[0])
    target = sp.sympify(params[1]) if len(params) > 1 else 0
    direction = params[2] if len(params) > 2 else '+'
    return sp.limit(expr, var, target, dir=direction)

def preprocess_latex_ode(latex_str):
    """\frac{d^ny}{dx^n} 형태를 y' 형태로 변환하여 파싱을 돕습니다."""
    # \frac{d^2y}{dx^2} -> y''
    latex_str = re.sub(r'\\frac\{d\^(\d+)y\}\{dx\^\1\}', lambda m: 'y' + "'" * int(m.group(1)), latex_str)
    # \frac{dy}{dx} -> y'
    latex_str = re.sub(r'\\frac\{dy\}\{dx\}', "y'", latex_str)
    return latex_str

def fix_ode_expression(expr, dep_var_name='y', indep_var_name=None):
    """파싱된 SymPy 수식을 ODE 풀이가 가능한 형태로 변환합니다."""
    # 독립 변수 감지 (기본값 x, t 등 표현식에 있는 것 우선)
    if indep_var_name is None:
        # expr의 모든 자유 변수 중 dep_var_name이 아닌 것 중 하나 선택
        other_symbols = [s for s in expr.free_symbols if not s.name.startswith(dep_var_name)]
        if other_symbols:
            x = other_symbols[0]
        else:
            x = sp.Symbol('x')
    else:
        x = sp.Symbol(indep_var_name)
        
    y = sp.Function(dep_var_name)(x)
    
    substitutions = {}
    for sym in expr.free_symbols:
        name = sym.name
        if name == dep_var_name:
            substitutions[sym] = y
        elif name.startswith(dep_var_name) and all(c == "'" for c in name[len(dep_var_name):]):
            order = name.count("'")
            substitutions[sym] = y.diff(x, order)
            
    return expr.subs(substitutions), y, x

def parse_ics(ics_str, y, x):
    """ic=y(0):1,y'(0):0 형태의 초기조건을 파싱합니다."""
    ics = {}
    if not ics_str:
        return ics
        
    pairs = ics_str.split(',')
    for pair in pairs:
        if ':' not in pair: continue
        lhs_str, rhs_str = pair.split(':')
        lhs_str = lhs_str.strip()
        rhs = sp.sympify(rhs_str.strip())
        
        if lhs_str == 'y(0)':
            ics[y.subs(x, 0)] = rhs
        elif lhs_str == "y'(0)":
            ics[y.diff(x).subs(x, 0)] = rhs
            
    return ics

def fix_system_ode(exprs, dep_var_names, indep_var_name='t'):
    """여러 수식과 여러 종속 변수를 처리합니다."""
    t = sp.Symbol(indep_var_name)
    funcs = {name: sp.Function(name)(t) for name in dep_var_names}
    
    fixed_exprs = []
    for expr in exprs:
        substitutions = {}
        for sym in expr.free_symbols:
            name = sym.name
            # x, y, z 등 종속 변수 감지
            base_name = name.rstrip("'")
            if base_name in funcs:
                order = name.count("'")
                if order == 0:
                    substitutions[sym] = funcs[base_name]
                else:
                    substitutions[sym] = funcs[base_name].diff(t, order)
        fixed_exprs.append(expr.subs(substitutions))
        
    return fixed_exprs, list(funcs.values()), t

def op_ode(expr, args):
    """상미분방정식(단일/연립) 해 도출 및 초기조건(ic) 부여 [cite: 33]"""
    # 1. 시스템 여부 확인 (쉼표나 세미콜론으로 구분된 경우)
    # 현재 expr은 parse_latex 결과이므로, raw selection을 다시 확인하거나
    # parse_latex가 단일 Eq만 반환한다면 호출부에서 분리해서 넘겨줘야 함.
    # 여기서는 편의상 단일 expr 내의 free_symbols를 보고 판단
    
    # 기본 종속 변수 후보군
    potential_dep_vars = ['y', 'x', 'z', 'u', 'v']
    found_vars = set()
    for sym in expr.free_symbols:
        base_name = sym.name.rstrip("'")
        if base_name in potential_dep_vars:
            found_vars.add(base_name)
            
    # 연립 방정식 처리 (여러 변수가 발견된 경우)
    if len(found_vars) > 1:
        fixed_exprs, funcs, t = fix_system_ode([expr], list(found_vars))
        # 만약 입력이 단일 Eq(x' - y, 0) 형태라면 하나만 풀림
        return sp.dsolve(fixed_exprs, funcs)

    # 단일 방정식 처리
    fixed_expr, y, x = fix_ode_expression(expr)
    
    ics = {}
    if args:
        for arg in args:
            if 'ic=' in arg:
                ics_str = arg.replace('ic=', '').strip()
                ics = parse_ics(ics_str, y, x)
                break
                
    return sp.dsolve(fixed_expr, y, ics=ics if ics else None)

def op_dimcheck(expr, args):
    """차원 및 단위 검사기 (Dimensional Analysis Check) [cite: 100]"""
    from sympy.physics.units import Dimension, dimensions
    # 수식의 좌변과 우변이 분리되어 있다고 가정 (Eq 객체)
    if isinstance(expr, sp.Eq):
        lhs_dim = Dimension(expr.lhs)
        rhs_dim = Dimension(expr.rhs)
        if lhs_dim != rhs_dim:
            return f"Error: [{lhs_dim}] != [{rhs_dim}]" # 단위 불일치 경고 [cite: 100]
        return "Dimensions match."
    return "Expression is not an equation."

def op_error_prop(expr, args, parallels):
    """실험물리학자를 위한 오차 전파 계산기 [cite: 114, 115]"""
    # parallels에서 err=x:0.1,y:0.2 파싱 [cite: 143]
    err_dict = {}
    for p in parallels:
        if p.startswith('err='):
            pairs = p.replace('err=', '').split(',')
            for pair in pairs:
                k, v = pair.split(':')
                err_dict[sp.Symbol(k)] = float(v)
                
    variance = 0
    symbols = list(expr.free_symbols)
    for sym in symbols:
        if sym in err_dict:
            # (∂V/∂I * ΔI)^2 형태의 편미분 제곱합 조립 [cite: 115, 116]
            partial_diff = sp.diff(expr, sym)
            variance += (partial_diff * err_dict[sym])**2
            
    return sp.sqrt(variance)

def fix_pde_expression(expr, dep_var_name='u'):
    """u(x, t) 등 다변수 함수가 포함된 PDE 표현식을 보정합니다."""
    # 자유 변수 중 종속 변수(u)를 제외한 것들을 독립 변수로 간주
    symbols = list(expr.free_symbols)
    indep_vars = [s for s in symbols if s.name != dep_var_name]
    
    if not indep_vars:
        # 독립 변수가 감지되지 않으면 기본값 x, y 설정
        indep_vars = [sp.Symbol('x'), sp.Symbol('y')]
        
    u = sp.Function(dep_var_name)(*indep_vars)
    
    substitutions = {}
    for sym in symbols:
        if sym.name == dep_var_name:
            substitutions[sym] = u
        # 이미 Derivative(u, x) 형태인 경우 내부는 u(x, y)로 바뀌어야 함
            
    # Derivative(u, x) -> Derivative(u(x, y), x) 처리를 위해 subs 수행
    fixed_expr = expr.subs(substitutions)
    return fixed_expr, u

import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt
import base64
from io import BytesIO

def op_num_solve(expr, args):
    """ODE를 수치적으로 풀고 결과를 반환하거나 그래프를 생성합니다."""
    # 1. 초기 조건 및 범위 파싱
    ics_dict = {}
    t_span = [0, 10]
    show_plot = False
    
    if args:
        for arg in args:
            if 'ic=' in arg:
                parts = arg.replace('ic=', '').split(':')
                if len(parts) == 2:
                    t0_str = re.search(r'\((.*?)\)', parts[0])
                    t0 = float(t0_str.group(1)) if t0_str else 0
                    ics_dict[t0] = float(parts[1])
            elif 't_span=' in arg:
                parts = arg.replace('t_span=', '').split(',')
                if len(parts) == 2:
                    t_span = [float(parts[0]), float(parts[1])]
            elif 'plot=true' in arg:
                show_plot = True
                    
    if not ics_dict:
        return "Error: Numerical solving requires initial conditions (e.g., ic=y(0):1)"

    # 2. ODE 변환
    fixed_expr, y_func, t_var = fix_ode_expression(expr)
    
    # y'에 대해 정리
    y_prime = y_func.diff(t_var)
    sol_expr = sp.solve(fixed_expr, y_prime)
    if not sol_expr:
        return "Error: Could not solve for y' explicitly."
    
    # t_var(독립 변수)를 t로, y_func를 y로 lambdify
    # 수식 내의 t_var를 실제 t_var Symbol로 치환 (가끔 parse_latex가 x, t 혼용할 때 대비)
    f_np = sp.lambdify((t_var, y_func), sol_expr[0], 'numpy')
    def odefun(t, y): return f_np(t, y[0])
    
    # 3. 수치적 통합
    t0_val = list(ics_dict.keys())[0]
    y0 = [ics_dict[t0_val]]
    t_eval = np.linspace(t_span[0], t_span[1], 100)
    
    try:
        sol = solve_ivp(odefun, t_span, y0, t_eval=t_eval)
    except Exception as e:
        return f"Error in numerical solver: {str(e)}"
    
    if show_plot:
        # 그래프 생성
        plt.figure(figsize=(6, 4))
        plt.plot(sol.t, sol.y[0], 'b-', label='y(t)')
        plt.title(f'Numerical Solution: ${sp.latex(expr)}$')
        plt.xlabel('t')
        plt.ylabel('y(t)')
        plt.grid(True)
        plt.legend()
        
        buf = BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close()
        img_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        # JSON 형태로 반환하여 웹뷰에서 안전하게 처리
        return json.dumps({"type": "plot", "data": f"data:image/png;base64,{img_base64}"})
    else:
        # 결과값만 반환 (샘플 포인트 5개)
        indices = [0, 24, 49, 74, 99] # 시작, 1/4, 중간, 3/4, 끝
        res_parts = []
        for idx in indices:
            t_val = round(sol.t[idx], 2)
            y_val = round(sol.y[0][idx], 4)
            res_parts.append(f"y({t_val}) \\approx {y_val}")
        
        return " \\\\ ".join(res_parts)

def op_pde(expr, args):
    """편미분방정식(PDE) 해 도출 [cite: 33]"""
    dep_var_name = 'u'
    for sym in expr.free_symbols:
        if sym.name in ['u', 'v', 'w']:
            dep_var_name = sym.name
            break
            
    fixed_expr, u = fix_pde_expression(expr, dep_var_name)
    try:
        return sp.pdsolve(fixed_expr, u)
    except Exception as e:
        # pdsolve 실패 시 dsolve 시도 (단일 변수 미분인 경우 dsolve가 처리 가능)
        try:
            return sp.dsolve(fixed_expr, u)
        except:
            raise e

def op_laplace(expr, args, config):
    """설정된 변수를 바탕으로 라플라스 변환을 수행합니다."""
    lp_config = config.get('laplace', {}) if config else {}
    source_var_name = args[0] if args else lp_config.get('source', 't')
    target_var_name = args[1] if len(args) > 1 else lp_config.get('target', 's')
    
    source_sym = sp.Symbol(source_var_name)
    target_sym = sp.Symbol(target_var_name)
    calc_expr = expr.subs(sp.Symbol('e'), sp.E)
    return sp.laplace_transform(calc_expr, source_sym, target_sym, noconds=True)

from matrix import handle_matrix

# ==========================================
# 2. 메인 계산 라우터 (Command Dictionary)
# ==========================================

def get_calc_operations():
    """제안서에 명시된 모든 연산자를 매핑하는 딕셔너리 """
    return {
        # 0. 행렬 생성 및 분석
        "matrix": lambda x, v, p, c: handle_matrix(v, p),

        # 1. 기본 대수 및 해석 
        "simplify": lambda x, v, p, c: sp.simplify(x),
        "expand": lambda x, v, p, c: sp.expand(x),
        "factor": lambda x, v, p, c: sp.factor(x),
        "solve": lambda x, v, p, c: sp.solve(x),
        "eval": lambda x, v, p, c: x.evalf(),
        
        # 2. 분수 및 삼각함수 [cite: 25]
        "apart": lambda x, v, p, c: sp.apart(x),
        "together": lambda x, v, p, c: sp.together(x),
        "trigsimp": lambda x, v, p, c: sp.trigsimp(x),
        "expand_trig": lambda x, v, p, c: sp.expand_trig(x),
        
        # 3. 미적분 계층 [cite: 25, 32]
        "diff": lambda x, v, p, c: op_diff(x, v),
        "int": lambda x, v, p, c: op_int(x, v),
        "limit": lambda x, v, p, c: op_limit(x, v),
        "taylor": lambda x, v, p, c: op_taylor(x, v, p),
        "asymp": lambda x, v, p, c: sp.series(x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0], sp.oo).removeO(), # 점근 전개 [cite: 40]
        
        # 4. 선형대수 행렬 연산 [cite: 26, 27, 35]
        "det": lambda x, v, p, c: sp.Matrix(x).det(),
        "inv": lambda x, v, p, c: sp.Matrix(x).inv(),
        "eigen": lambda x, v, p, c: sp.Matrix(x).eigenvals(),
        "rref": lambda x, v, p, c: sp.Matrix(x).rref()[0],
        "rank": lambda x, v, p, c: sp.Matrix(x).rank(),
        "trace": lambda x, v, p, c: sp.Matrix(x).trace(),
        "transpose": lambda x, v, p, c: sp.Matrix(x).T,
        "nullspace": lambda x, v, p, c: sp.Matrix(x).nullspace(),
        "jacobian": lambda x, v, p, c: sp.Matrix(x).jacobian([sp.Symbol(sym) for sym in v[0].split(',')]) if v else x, # 야코비 행렬 [cite: 35]
        "hessian": lambda x, v, p, c: sp.hessian(x, list(x.free_symbols)), # 헤세 행렬 [cite: 35]
        
        # 5. 미분방정식 및 변환 [cite: 28, 41]
        "ode": lambda x, v, p, c: op_ode(x, v),
        "num_solve": lambda x, v, p, c: op_num_solve(x, v),
        "pde": lambda x, v, p, c: op_pde(x, v),
        "laplace": lambda x, v, p, c: op_laplace(x, v, c),
        "ilaplace": lambda x, v, p, c: sp.inverse_laplace_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('s'), sp.Symbol('t'), noconds=True),
        "fourier": lambda x, v, p, c: sp.fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('x'), sp.Symbol('k')),
        "ifourier": lambda x, v, p, c: sp.inverse_fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('k'), sp.Symbol('x')),
        "ztrans": lambda x, v, p, c: sp.Sum(x * sp.Symbol('z')**(-sp.Symbol('n')), (sp.Symbol('n'), 0, sp.oo)).doit(), # Z-변환 [cite: 41]
        
        # 6. 복소해석학 [cite: 29, 30]
        "residue": lambda x, v, p, c: sp.residue(x, sp.Symbol(v[0]), sp.sympify(v[1]) if len(v)>1 else 0),
        "laurent": lambda x, v, p, c: sp.series(x, sp.Symbol(v[0]), 0, 4, dir='+').removeO(),
        "conjugate": lambda x, v, p, c: sp.conjugate(x),
        "re": lambda x, v, p, c: sp.re(x),
        "im": lambda x, v, p, c: sp.im(x),
        
        # 7. 정수론 및 이산수학 [cite: 30, 31, 39]
        "prime": lambda x, v, p, c: sp.isprime(int(sp.simplify(x))),
        "factorint": lambda x, v, p, c: sp.factorint(int(sp.simplify(x))),
        "logic": lambda x, v, p, c: sp.simplify_logic(x, form='cnf'), # 복잡한 논리식 최소화 [cite: 39]
        
        # 8. 물리 / 공학 유틸리티 [cite: 100, 115]
        "dimcheck": lambda x, v, p, c: op_dimcheck(x, v),
        "error_prop": lambda x, v, p, c: op_error_prop(x, v, p),
        "tensor_expand": lambda x, v, p, c: op_tensor_expand(x, v)
    }

# ==========================================
# 3. 메인 핸들러 (Node.js 통신 엔트리)
# ==========================================

def strip_latex_delimiters(text):
    r"""$...$, $$...$$, \[...\], \(...\) 등의 LaTeX 구분자를 제거합니다."""
    text = text.strip()
    # $$...$$ or \[...\]
    if (text.startswith('$$') and text.endswith('$$')) or (text.startswith(r'\[') and text.endswith(r'\]')):
        return text[2:-2].strip()
    # $...$ or \(...\)
    if (text.startswith('$') and text.endswith('$')) or (text.startswith(r'\(') and text.endswith(r'\)')):
        return text[1:-1].strip()
    return text

def execute_calc(parsed_json_str):
    try:
        req = json.loads(parsed_json_str)
        sub_cmds = req.get('subCommands', [])
        parallels = req.get('parallelOptions', [])
        config = req.get('config', {})
        selection = req.get('rawSelection', '').strip()
        selection = strip_latex_delimiters(selection)
        
        # 1. 수식 전처리 (ODE의 경우)
        action = sub_cmds[0] if sub_cmds else "simplify"
        
        if action == "matrix":
            # 행렬 명령은 수식 파싱 없이 바로 처리 (matrix.py 내부에서 파싱)
            matrix_res_json = handle_matrix(sub_cmds[1:], parallels)
            matrix_res = json.loads(matrix_res_json)
            
            if matrix_res["status"] == "error":
                return matrix_res_json
                
            return json.dumps({
                "status": "success",
                "latex": matrix_res["latex"],
                "analysis": matrix_res.get("analysis"),
                "vars": []
            })

        # 다른 명령어는 선택 영역이 필요함 
        if not selection:
            return json.dumps({"status": "error", "message": "Selection is empty after stripping delimiters"})

        if action == "ode":
            # ... (rest of the code unchanged)
            # 연립 방정식 분리 (쉼표나 세미콜론)
            parts = re.split(r'[,;]|\r?\n', selection)
            exprs = []
            for p in parts:
                if p.strip():
                    preprocessed = preprocess_latex_ode(p.strip())
                    exprs.append(parse_latex(preprocessed))
            
            # 수집된 모든 자유 변수 확인
            all_symbols = set()
            for e in exprs:
                all_symbols.update(e.free_symbols)
                
            potential_dep_vars = ['y', 'x', 'z', 'u', 'v']
            found_vars = set()
            for sym in all_symbols:
                base_name = sym.name.rstrip("'")
                if base_name in potential_dep_vars:
                    found_vars.add(base_name)
                    
            if len(found_vars) > 1 or len(exprs) > 1:
                # 연립 미분방정식 처리
                fixed_exprs, funcs, t = fix_system_ode(exprs, list(found_vars))
                
                # 방정식 개수와 변수 개수 맞추기 (부족하면 0=0 추가하여 dsolve 에러 방지)
                while len(fixed_exprs) < len(funcs):
                    fixed_exprs.append(sp.Eq(0, 0))
                
                result = sp.dsolve(fixed_exprs, funcs)
            else:
                # 단일 미분방정식 처리
                result = op_ode(exprs[0], sub_cmds[1:])
        else:
            # 2. 일반 수식 파싱
            expr = parse_latex(selection)
            
            # 3. 명령어 실행
            ops = get_calc_operations()
            if action not in ops:
                raise ValueError(f"Unknown action: {action}")
            result = ops[action](expr, sub_cmds[1:], parallels, config)
        
        # 4. 결과 포맷팅
        final_latex = result if isinstance(result, str) else sp.latex(result)
            
        # 5. 단계별 풀이 (Step-by-Step) [cite: 43, 144]
        steps = []
        step_level = next((int(p.split('=')[1]) for p in parallels if p.startswith('step=')), 0)
        
        # 변수 목록 추출
        if action in ["ode", "pde", "num_solve"]:
            # 연립 방정식인 경우 모든 변수 합치기
            all_vars = set()
            parts = re.split(r'[,;]|\r?\n', selection)
            for p in parts:
                if p.strip():
                    try:
                        # PDE는 preprocess_latex_ode가 필요없을 수 있으나 
                        # 미분 기호를 위해 공용 사용 가능
                        e = parse_latex(preprocess_latex_ode(p.strip()))
                        all_vars.update([str(s) for s in e.free_symbols])
                    except: pass
            vars_list = list(all_vars)
        else:
            vars_list = [str(s) for s in expr.free_symbols]

        if step_level > 0:
            # 수식 전개 과정을 AST 기반으로 추적 (MVP는 요약본 제공) [cite: 46, 145]
            steps.append(r"\text{Step 1: Parse input LaTeX}")
            steps.append(r"\text{Step 2: Apply " + action + r" operation}")
            steps.append(final_latex)
            
        return json.dumps({
            "status": "success",
            "latex": final_latex,
            "steps": steps if step_level > 0 else None,
            "vars": vars_list
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})
# 단독 실행 테스트용
if __name__ == "__main__":
    # 테스트 1: 다변수 편미분 [cite: 32]
    test_json = json.dumps({
        "rawSelection": r"x^2 y + y^3 \sin(x)",
        "subCommands": ["diff", "x, y"],
        "parallelOptions": []
    })
    print(execute_calc(test_json))