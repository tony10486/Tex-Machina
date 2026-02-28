import sympy as sp
from sympy.parsing.latex import parse_latex  # 공식 파서 사용
import json
import re
import os

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
# 1. 특수 연산 및 단계별 풀이 (Step-by-Step)
# ==========================================

def format_step(text, latex_expr, level, target_level):
    """레벨에 따른 단계 포맷팅"""
    if target_level >= level:
        if latex_expr:
            return f"\\text{{{text}}}: {sp.latex(latex_expr)}"
        return f"\\text{{{text}}}"
    return None

def get_solve_steps(expr, var, level):
    steps = []
    # 방정식 형태 확인 (Eq 객체가 아니면 = 0으로 간주)
    equation = expr if isinstance(expr, sp.Equality) else sp.Eq(expr, 0)
    lhs = sp.expand(equation.lhs - equation.rhs)
    
    # 1. 유형 판별
    degree = sp.degree(lhs, var)
    
    if level >= 1:
        steps.append(f"\\text{{Step 1: Identify equation type - Degree {degree} polynomial in }}{sp.latex(var)}")

    if degree == 1:
        # 일차 방정식: ax + b = 0 -> x = -b/a
        a = lhs.coeff(var, 1)
        b = lhs.subs(var, 0)
        if level >= 3:
            steps.append(f"\\text{{Move constant term to RHS: }}{sp.latex(a*var)} = {sp.latex(-b)}")
            steps.append(f"\\text{{Divide by coefficient of }}{sp.latex(var)} (a={sp.latex(a)}): {sp.latex(var)} = {sp.latex(-b/a)}")
        elif level >= 2:
            steps.append(f"\\text{{Isolate }}{sp.latex(var)}: {sp.latex(var)} = \\frac{{-{sp.latex(b)}}}{{{sp.latex(a)}}}")
        steps.append(f"\\text{{Final Answer: }}{sp.latex(var)} = {sp.latex(sp.solve(equation, var)[0])}")
        
    elif degree == 2:
        # 이차 방정식: ax^2 + bx + c = 0
        a = lhs.coeff(var, 2)
        b = lhs.coeff(var, 1)
        c = lhs.subs(var, 0)
        
        if level >= 1:
            steps.append(f"\\text{{Apply Quadratic Formula: }} {sp.latex(var)} = \\frac{{-b \\pm \\sqrt{{b^2 - 4ac}}}}{{2a}}")
        
        if level >= 2:
            disc = b**2 - 4*a*c
            steps.append(f"\\text{{Calculate Discriminant (D): }} D = b^2 - 4ac = {sp.latex(disc)}")
            if level >= 3:
                steps.append(f"\\text{{Substitute values: }} a={sp.latex(a)}, b={sp.latex(b)}, c={sp.latex(c)}")
                steps.append(f"\\text{{Numerator: }} -({sp.latex(b)}) \\pm \\sqrt{{{sp.latex(disc)}}}")
                steps.append(f"\\text{{Denominator: }} 2({sp.latex(a)}) = {sp.latex(2*a)}")
        
        sols = sp.solve(equation, var)
        steps.append(f"\\text{{Solutions: }} {sp.latex(sols)}")
    else:
        steps.append(r"\text{Complex equation detected. Using general solver.}")
        steps.append(f"\\text{{Result: }} {sp.latex(sp.solve(equation, var))}")
        
    return steps

def get_int_steps(expr, var, level):
    steps = []
    try:
        from sympy.integrals.manualintegrate import integral_steps
        
        def format_rule(rule):
            name = type(rule).__name__.replace("Rule", "")
            if name == "Power":
                return f"\\text{{Power Rule: }}\\int x^n dx = \\frac{{x^{{n+1}}}}{{n+1}}"
            elif name == "ConstantTimes":
                return f"\\text{{Constant Multiple Rule: }}\\int a f(x) dx = a \\int f(x) dx"
            elif name == "Add":
                return f"\\text{{Sum Rule: }}\\int (f+g) dx = \\int f dx + \\int g dx"
            elif name == "Parts":
                return f"\\text{{Integration by Parts: }} u = {sp.latex(rule.u)}, dv = {sp.latex(rule.dv)}dx"
            elif name == "U":
                return f"\\text{{U-Substitution: }} u = {sp.latex(rule.u_func)}"
            elif name == "Exp":
                return f"\\text{{Exponential Rule: }}\\int e^x dx = e^x"
            elif name == "Trig":
                return f"\\text{{Trigonometric Integral: }}\\int {sp.latex(rule.integrand)} dx"
            elif name == "Alternative":
                return None
            return f"\\text{{Applying {name} Rule}}"

        rule_tree = integral_steps(expr, var)
        
        # 트리 재귀 탐색
        def extract_steps(rule):
            res = []
            f = format_rule(rule)
            if f: res.append(f)
            
            if hasattr(rule, 'substep'):
                res.extend(extract_steps(rule.substep))
            elif hasattr(rule, 'substeps'):
                for s in rule.substeps:
                    res.extend(extract_steps(s))
            elif hasattr(rule, 'alternatives'):
                # 가장 좋은 첫 번째 대안 선택
                res.extend(extract_steps(rule.alternatives[0]))
            return res

        visited_rules = extract_steps(rule_tree)
        # 중복 설명 제거 (순서 유지)
        seen = set()
        unique_rules = []
        for r in visited_rules:
            if r not in seen:
                unique_rules.append(r)
                seen.add(r)
        
        if level == 1:
            steps.append(unique_rules[0] if unique_rules else r"\text{Basic Integration}")
        elif level == 2:
            steps.extend(unique_rules[:3])
        else:
            steps.extend(unique_rules)
            
        res = sp.integrate(expr, var)
        steps.append(f"\\text{{Final Result: }} {sp.latex(res)} + C")
    except:
        steps.append(r"\text{Calculated using standard integration techniques.}")
        steps.append(f"\\text{{Result: }} {sp.latex(sp.integrate(expr, var))} + C")
    return steps

def get_diff_steps(expr, var, level):
    steps = []
    # 단순 미분 분해
    if level >= 1:
        steps.append(f"\\text{{Step 1: Differentiate }}{sp.latex(expr)}\\text{{ with respect to }}{sp.latex(var)}")
    
    if expr.is_Add:
        if level >= 2:
            steps.append(r"\text{Apply Sum Rule: } (f+g)' = f' + g'")
        if level >= 3:
            for arg in expr.args:
                steps.append(f"\\text{{- Term: }}{sp.latex(arg)} \\to {sp.latex(sp.diff(arg, var))}")
    elif expr.is_Mul:
        if level >= 2:
            steps.append(r"\text{Apply Product Rule: } (uv)' = u'v + uv'")
            
    res = sp.diff(expr, var)
    steps.append(f"\\text{{Final Result: }} {sp.latex(res)}")
    return steps

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
    r"""\frac{d^ny}{dx^n} 형태를 y' 형태로 변환하고, \prime 등 LaTeX 특수 기호를 정리합니다."""
    # 1. \prime, \doubleprime 등 처리
    latex_str = latex_str.replace(r'^{\prime\prime}', "''").replace(r'^{\prime}', "'")
    latex_str = latex_str.replace(r'\prime\prime', "''").replace(r'\prime', "'")
    
    # 2. \frac{d^2y}{dx^2} -> y''
    latex_str = re.sub(r'\\frac\{d\^(\d+)([a-zA-Z])\}\{d([a-zA-Z])\^\1\}', lambda m: m.group(2) + "'" * int(m.group(1)), latex_str)
    # 3. \frac{dy}{dx} -> y'
    latex_str = re.sub(r'\\frac\{d([a-zA-Z])\}\{d([a-zA-Z])\}', r"\1'", latex_str)
    return latex_str

def fix_ode_expression(expr, dep_var_name='y', indep_var_name=None):
    """파싱된 SymPy 수식을 ODE 풀이가 가능한 형태로 변환합니다."""
    # 0. e를 sp.E로 변환 (상수로 처리하여 독립 변수 오판 방지)
    if sp.Symbol('e') in expr.free_symbols:
        expr = expr.subs(sp.Symbol('e'), sp.E)

    # 독립 변수 감지
    if indep_var_name is None:
        # expr에 이미 Function(dep_var_name)(...)이 있는지 확인
        # f.func.name이 없을 수 있으므로 getattr 사용 (주로 UndefinedFunction인 경우에만 name이 있음)
        existing_funcs = [f for f in expr.atoms(sp.Function) if getattr(f.func, 'name', None) == dep_var_name]
        if existing_funcs:
            # 첫 번째 발견된 함수의 인자를 독립 변수로 사용
            args = existing_funcs[0].args
            x = args[0] if args else sp.Symbol('x')
        else:
            # expr의 모든 자유 변수 중 dep_var_name이 아닌 것 추출
            other_symbols = [s for s in expr.free_symbols if not s.name.startswith(dep_var_name)]
            # e, pi, I 등 상수 제외
            other_symbols = [s for s in other_symbols if s.name not in ['e', 'pi', 'I', 'i', 'j']]
            
            # x, t, s, r 우선순위
            preferred = [s for s in other_symbols if s.name in ['x', 't', 's', 'r']]
            if preferred:
                x = preferred[0]
            elif other_symbols:
                x = sorted(other_symbols, key=lambda s: s.name)[0]
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
    # 1. 종속 변수 감지: 프라임(')이 붙은 변수 우선, 그 외 y, u, v, w 등
    symbols_with_primes = [sym for sym in expr.free_symbols if sym.name.endswith("'")]
    if symbols_with_primes:
        found_vars = {sym.name.rstrip("'") for sym in symbols_with_primes}
    else:
        # expr.atoms(sp.Function) 도 확인 (UndefinedFunction만 추출)
        existing_funcs = [getattr(f.func, 'name', None) for f in expr.atoms(sp.Function) 
                          if isinstance(f.func, sp.core.function.UndefinedFunction)]
        found_vars = {name for name in existing_funcs if name}
        
        if not found_vars:
            potential_dep_vars = ['y', 'u', 'v', 'w', 'z']
            found_vars = {sym.name for sym in expr.free_symbols if sym.name in potential_dep_vars}
            
    if not found_vars:
        found_vars = {'y'}
            
    # 연립 방정식 처리 (여러 변수가 발견된 경우)
    if len(found_vars) > 1:
        fixed_exprs, funcs, t = fix_system_ode([expr], list(found_vars))
        return sp.dsolve(fixed_exprs, funcs)

    # 단일 방정식 처리
    dep_var = list(found_vars)[0]
    fixed_expr, y, x = fix_ode_expression(expr, dep_var_name=dep_var)
    
    ics = {}
    if args:
        for arg in args:
            if 'ic=' in arg:
                ics_str = arg.replace('ic=', '').strip()
                ics = parse_ics(ics_str, y, x)
                break
                
    return sp.dsolve(fixed_expr, y, ics=ics if ics else None)

def op_dimcheck_wrapper(expr, args, parallels, selection):
    """차원 및 단위 검사기 (Dimensional Analysis Check) [cite: 100]"""
    # selection: 원본 LaTeX 수식
    # parallels: 병렬 옵션 (예: set=v:L/T)
    params = {
        "rawSelection": selection,
        "parallelOptions": parallels
    }
    res = handle_dimcheck(params)
    if "error" in res:
        # 에러가 발생하더라도 LaTeX 결과는 포함되어 있음 (% [DimCheck Error] ...)
        return res["latex"]
    return res["latex"]

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
    # 0. e를 sp.E로 변환
    if sp.Symbol('e') in expr.free_symbols:
        expr = expr.subs(sp.Symbol('e'), sp.E)

    # 자유 변수 중 종속 변수(u)를 제외한 것들을 독립 변수로 간주
    symbols = list(expr.free_symbols)
    indep_vars = [s for s in symbols if s.name != dep_var_name]
    
    # e, pi, I 등 상수 제외
    indep_vars = [s for s in indep_vars if s.name not in ['e', 'pi', 'I', 'i', 'j']]
    
    if not indep_vars:
        # 독립 변수가 감지되지 않으면 기본값 x, y 설정
        indep_vars = [sp.Symbol('x'), sp.Symbol('y')]
    else:
        # 일관성을 위해 정렬
        indep_vars = sorted(indep_vars, key=lambda s: s.name)
        
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
from dimcheck_engine import handle_dimcheck
from plot_engine import handle_plot
from cite_engine import handle_cite
from oeis_engine import handle_oeis

# ==========================================
# 2. 메인 계산 라우터 (Command Dictionary)
# ==========================================

def get_calc_operations():
    """제안서에 명시된 모든 연산자를 매핑하는 딕셔너리 """
    return {
        # 0. 행렬 및 인용
        "matrix": lambda x, v, p, c, s: handle_matrix(v, p),
        "cite": lambda x, v, p, c, s: handle_cite(v),
        "oeis": lambda x, v, p, c, s: handle_oeis(v),

        # 1. 기본 대수 및 해석 
        "simplify": lambda x, v, p, c, s: sp.simplify(x),
        "expand": lambda x, v, p, c, s: sp.expand(x),
        "factor": lambda x, v, p, c, s: sp.factor(x),
        "solve": lambda x, v, p, c, s: sp.solve(x),
        "eval": lambda x, v, p, c, s: x.evalf(),
        
        # 2. 분수 및 삼각함수 [cite: 25]
        "apart": lambda x, v, p, c, s: sp.apart(x),
        "together": lambda x, v, p, c, s: sp.together(x),
        "trigsimp": lambda x, v, p, c, s: sp.trigsimp(x),
        "expand_trig": lambda x, v, p, c, s: sp.expand_trig(x),
        
        # 3. 미적분 계층 [cite: 25, 32]
        "diff": lambda x, v, p, c, s: op_diff(x, v),
        "int": lambda x, v, p, c, s: op_int(x, v),
        "limit": lambda x, v, p, c, s: op_limit(x, v),
        "taylor": lambda x, v, p, c, s: op_taylor(x, v, p),
        "asymp": lambda x, v, p, c, s: sp.series(x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0], sp.oo).removeO(), # 점근 전개 [cite: 40]
        
        # 4. 선형대수 행렬 연산 [cite: 26, 27, 35]
        "det": lambda x, v, p, c, s: sp.Matrix(x).det(),
        "inv": lambda x, v, p, c, s: sp.Matrix(x).inv(),
        "eigen": lambda x, v, p, c, s: sp.Matrix(x).eigenvals(),
        "rref": lambda x, v, p, c, s: sp.Matrix(x).rref()[0],
        "rank": lambda x, v, p, c, s: sp.Matrix(x).rank(),
        "trace": lambda x, v, p, c, s: sp.Matrix(x).trace(),
        "transpose": lambda x, v, p, c, s: sp.Matrix(x).T,
        "nullspace": lambda x, v, p, c, s: sp.Matrix(x).nullspace(),
        "jacobian": lambda x, v, p, c, s: sp.Matrix(x).jacobian([sp.Symbol(sym) for sym in v[0].split(',')]) if v else x, # 야코비 행렬 [cite: 35]
        "hessian": lambda x, v, p, c, s: sp.hessian(x, list(x.free_symbols)), # 헤세 행렬 [cite: 35]
        
        # 5. 미분방정식 및 변환 [cite: 28, 41]
        "ode": lambda x, v, p, c, s: op_ode(x, v),
        "num_solve": lambda x, v, p, c, s: op_num_solve(x, v),
        "pde": lambda x, v, p, c, s: op_pde(x, v),
        "laplace": lambda x, v, p, c, s: op_laplace(x, v, c),
        "ilaplace": lambda x, v, p, c, s: sp.inverse_laplace_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('s'), sp.Symbol('t'), noconds=True),
        "fourier": lambda x, v, p, c, s: sp.fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('x'), sp.Symbol('k')),
        "ifourier": lambda x, v, p, c, s: sp.inverse_fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('k'), sp.Symbol('x')),
        "ztrans": lambda x, v, p, c, s: sp.Sum(x * sp.Symbol('z')**(-sp.Symbol('n')), (sp.Symbol('n'), 0, sp.oo)).doit(), # Z-변환 [cite: 41]
        
        # 6. 복소해석학 [cite: 29, 30]
        "residue": lambda x, v, p, c, s: sp.residue(x, sp.Symbol(v[0]), sp.sympify(v[1]) if len(v)>1 else 0),
        "laurent": lambda x, v, p, c, s: sp.series(x, sp.Symbol(v[0]), 0, 4, dir='+').removeO(),
        "conjugate": lambda x, v, p, c, s: sp.conjugate(x),
        "re": lambda x, v, p, c, s: sp.re(x),
        "im": lambda x, v, p, c, s: sp.im(x),

        # 7. 정수론 및 이산수학 [cite: 30, 31, 39]
        "prime": lambda x, v, p, c, s: sp.isprime(int(sp.simplify(x))),
        "factorint": lambda x, v, p, c, s: sp.factorint(int(sp.simplify(x))),
        "logic": lambda x, v, p, c, s: sp.simplify_logic(x, form='cnf'), # 복잡한 논리식 최소화 [cite: 39]
        
        # 8. 물리 / 공학 유틸리티 [cite: 100, 115]
        "dimcheck": lambda x, v, p, c, s: op_dimcheck_wrapper(x, v, p, s),
        "error_prop": lambda x, v, p, c, s: op_error_prop(x, v, p),
        "tensor_expand": lambda x, v, p, c, s: op_tensor_expand(x, v),

        # 9. 시각화 (Plotting)
        "plot": lambda x, v, p, c, s: handle_plot(s, v, p, c, os.getcwd())
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

def preprocess_matrix_latex(latex_str):
    r"""
    \begin{bmatrix} ... \end{bmatrix} 형태를 SymPy Matrix 문자열로 변환합니다.
    또한 행렬 간 연산 기호(\times, ^T, ^-1 등)를 SymPy 형식으로 변환합니다.
    """
    # 1. 행렬 환경을 먼저 Matrix()로 변환
    def repl(match):
        content = match.group(1).strip()
        raw_parts = content.split('\\')
        matrix_rows = []
        for part in raw_parts:
            part = part.strip()
            part = re.sub(r'^cr|^\[.*?\]', '', part).strip()
            if not part: continue
            cells = [c.strip() for c in part.split('&')]
            if any(cells):
                matrix_rows.append("[" + ", ".join(cells) + "]")
        return "Matrix([" + ", ".join(matrix_rows) + "])"

    pattern = r'\\begin\{[bpvVB]matrix\}(.*?)\\end\{[bpvVB]matrix\}'
    processed = re.sub(pattern, repl, latex_str, flags=re.DOTALL)
    
    # 2. 행렬 연산자 및 특수 기호 변환
    if 'Matrix' in processed:
        # 역행렬: ^{-1} -> .inv()
        processed = re.sub(r'\^\{\s*-\s*1\s*\}', '.inv()', processed)
        # 전치행렬: ^T, ^\top, ^\intercal -> .T (백슬래시 유무와 상관없이 매칭)
        processed = re.sub(r'\^\{\s*\\*(?:T|top|intercal)\s*\}|\^\\*(?:T|top|intercal)', '.T', processed)
        # 거듭제곱: ^{n} -> **n
        processed = re.sub(r'\^\{\s*(\d+)\s*\}|\^(\d+)', r'**\1\2', processed)
        
        # 곱셈 및 기타 LaTeX 명령어 처리
        # 모든 \command 형태에서 \를 제거하고 times/cdot은 *로 교환
        processed = re.sub(r'\\+(times|cdot)', '*', processed)
        processed = re.sub(r'\\+([a-zA-Z]+)', r'\1', processed)
        
        # 특정 명령어들을 연산자로 변환 (이미 \ 가 제거된 경우 대비)
        processed = processed.replace('times', '*').replace('cdot', '*')
        
        # 중괄호 제거 및 일반화
        processed = processed.replace('{', '(').replace('}', ')')
        
    return processed

def execute_calc(parsed_json_str):
    try:
        req = json.loads(parsed_json_str)
        main_cmd = req.get('mainCommand', '').strip()
        sub_cmds = req.get('subCommands', [])
        parallels = req.get('parallelOptions', [])
        config = req.get('config', {})
        selection = req.get('rawSelection', '').strip()
        selection = strip_latex_delimiters(selection)
        
        # 1. 수식 전처리 및 액션 결정
        if main_cmd == "calc" and sub_cmds:
            action = sub_cmds.pop(0)
        elif main_cmd:
            action = main_cmd
        elif sub_cmds:
            action = sub_cmds.pop(0)
        else:
            action = "simplify"
        
        if action == "matrix":
            # 행렬 명령은 수식 파싱 없이 바로 처리 (matrix.py 내부에서 파싱)
            matrix_res_json = handle_matrix(sub_cmds, parallels, config)
            matrix_res = json.loads(matrix_res_json)
            
            if matrix_res["status"] == "error":
                return matrix_res_json
                
            return json.dumps({
                "status": "success",
                "latex": matrix_res["latex"],
                "analysis": matrix_res.get("analysis"),
                "vars": []
            })

        if action == "cite":
            # cite 명령은 인터넷 검색이 필요함
            cite_res = handle_cite(sub_cmds)
            return json.dumps(cite_res)

        if action == "oeis":
            # oeis 명령도 인터넷 검색이 필요함
            oeis_res = handle_oeis(sub_cmds)
            return json.dumps(oeis_res)

        if action == "plot":
            # Plot 명령도 전용 핸들러에서 직접 파싱 및 처리
            workspace_dir = config.get('workspaceDir', os.getcwd())
            plot_res = handle_plot(selection, sub_cmds, parallels, config, workspace_dir)
            if plot_res.get("status") == "error":
                return json.dumps(plot_res)
            return json.dumps({
                "status": "success",
                "latex": plot_res["latex"],
                "vars": plot_res.get("vars", []),
                "x3d_data": plot_res.get("x3d_data"),
                "warning": plot_res.get("warning"),
                "dat_content": plot_res.get("dat_content"),
                "dat_filename": plot_res.get("dat_filename"),
                "preview_img": plot_res.get("preview_img"),
                "export_content": plot_res.get("export_content"),
                "export_format": plot_res.get("export_format")
            })

        # 다른 명령어는 선택 영역이 필요함 
        if not selection:
            return json.dumps({"status": "error", "message": "Selection is empty after stripping delimiters"})

        if action == "ode":
            parts = re.split(r'[,;]|\r?\n', selection)
            exprs = []
            ode_args = sub_cmds.copy()
            for p in parts:
                p_strip = p.strip()
                if not p_strip: continue
                if 'ic=' in p_strip:
                    ode_args.append(p_strip)
                else:
                    preprocessed = preprocess_latex_ode(p_strip)
                    preprocessed = re.sub(r'\\([a-zA-Z]+)\s*\{\\left\((.*?)\\right\)\}', r'\\\1(\2)', preprocessed)
                    preprocessed = preprocessed.replace(r'\left(', '(').replace(r'\right)', ')')
                    exprs.append(parse_latex(preprocessed))
            
            if not exprs:
                return json.dumps({"status": "error", "message": "No ODE expression found"})

            # 수집된 모든 자유 변수 및 함수 확인
            all_symbols = set()
            all_funcs = set()
            for e in exprs:
                all_symbols.update(e.free_symbols)
                # UndefinedFunction(사용자 정의 함수)만 종속 변수 후보로 추출
                all_funcs.update([getattr(f.func, 'name', None) for f in e.atoms(sp.Function) 
                                  if isinstance(f.func, sp.core.function.UndefinedFunction)])
            all_funcs = {name for name in all_funcs if name}
                
            # 종속 변수 감지: 프라임 붙은 변수 + y, u, v, w, z
            potential_dep_vars = {'y', 'u', 'v', 'w', 'z'}
            found_vars = {sym.name.rstrip("'") for sym in all_symbols if sym.name.endswith("'")}
            found_vars.update(all_funcs)
            # 만약 위에서 아무것도 발견되지 않았다면 기본 후보군에서 검색
            if not found_vars:
                found_vars.update({sym.name for sym in all_symbols if sym.name in potential_dep_vars})
            
            if len(exprs) > 1 or len(found_vars) > 1:
                # 연립 미분방정식 처리
                if not found_vars: found_vars = {'y'}
                fixed_exprs, funcs, t = fix_system_ode(exprs, list(found_vars))
                while len(fixed_exprs) < len(funcs):
                    fixed_exprs.append(sp.Eq(0, 0))
                result = sp.dsolve(fixed_exprs, funcs)
            else:
                # 단일 미분방정식 처리
                result = op_ode(exprs[0], ode_args)
        else:
            # 2. 일반 수식 파싱
            # 행렬 환경이 포함되어 있으면 Matrix() 생성자로 변환
            if 'matrix' in selection:
                processed_selection = preprocess_matrix_latex(selection)
                # Matrix([...]) 형태는 parse_latex 대신 sympify 사용
                # locals에 Matrix와 기본 함수들 추가
                calc_locals = {
                    'Matrix': sp.Matrix,
                    'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
                    'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt,
                    'pi': sp.pi, 'theta': sp.Symbol('theta'), 'phi': sp.Symbol('phi')
                }
                expr = sp.sympify(processed_selection, locals=calc_locals)
            else:
                # [Pre-process for Gamma and other functions]
                # \Gamma{\left(z \right)} -> \Gamma(z)
                preprocessed = re.sub(r'\\([a-zA-Z]+)\s*\{\\left\((.*?)\\right\)\}', r'\\\1(\2)', selection)
                preprocessed = preprocessed.replace(r'\left(', '(').replace(r'\right)', ')')
                expr = parse_latex(preprocessed)
            
            # 3. 명령어 실행
            ops = get_calc_operations()
            if action not in ops:
                raise ValueError(f"Unknown action: {action}")
            result = ops[action](expr, sub_cmds, parallels, config, selection)
        
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
            if action == "solve":
                var = sp.Symbol(vars_list[0]) if vars_list else sp.Symbol('x')
                steps = get_solve_steps(expr, var, step_level)
            elif action == "int":
                var = sp.Symbol(vars_list[0]) if vars_list else sp.Symbol('x')
                steps = get_int_steps(expr, var, step_level)
            elif action == "diff":
                var = sp.Symbol(vars_list[0]) if vars_list else sp.Symbol('x')
                steps = get_diff_steps(expr, var, step_level)
            else:
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
