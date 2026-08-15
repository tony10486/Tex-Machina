import sympy as sp
from sympy.parsing.latex import parse_latex  # 공식 파서 사용
import json
import logging
import re
import os
from utils import SAFE_SYMPY_DICT, safe_parse_expr, strip_latex_delimiters
from latex_conversion import latex_to_sympy, safe_lambdify

# 모듈 레벨 로거 — 조용히 삼켜지던 예외를 서버 로그에서 추적할 수 있게 한다 (P17)
logger = logging.getLogger(__name__)

try:
    import symengine
    HAS_SYMENGINE = True
except ImportError:
    HAS_SYMENGINE = False

def op_tensor_expand(expr, args, parallels=[], selection=None):
    """
    아인슈타인 합 규약(Einstein summation) 해석 모듈
    문자열 레벨에서 위/아래 반복되는 인덱스를 찾아 Sum 연산으로 치환합니다.
    """
    raw_str = selection if selection else str(expr)
    
    # 1. 아랫첨자(_)와 윗첨자(^) 추출
    GREEK_LIST = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega']
    GREEK_PATTERN = '|'.join(GREEK_LIST)

    def extract_indices(text, prefix):
        pattern = prefix + r'(?:\{([a-zA-Z0-9\\\s]+)\}|(\\[a-zA-Z]+)|([a-zA-Z0-9]))'
        matches = re.findall(pattern, text)
        indices = []
        for m in matches:
            content = m[0] or m[1] or m[2]
            if not content: continue
            if content.startswith('\\'):
                indices.append(content.lstrip('\\'))
            elif m[0]:
                # 그리스 문자 및 단일 문자들을 개별 토큰으로 추출
                parts = re.findall(r'\\(?:' + GREEK_PATTERN + r')|[a-zA-Z0-9]', content)
                indices.extend([p.lstrip('\\') for p in parts])
            else:
                indices.append(content)
        return indices

    lower_indices = extract_indices(raw_str, '_')
    upper_indices = extract_indices(raw_str, r'\^')
    dummy_indices = set(lower_indices).intersection(set(upper_indices))
    
    if not dummy_indices:
        return sp.simplify(expr)
        
    dim = 3
    for p in parallels:
        if p.startswith('dim='):
            try: dim = int(p.split('=')[1])
            except: pass
    
    # [보안] 텐서 차원/인덱스 수 제한 — product(repeat=...) 지수 폭주 방지 (A1)
    if dim > 3:
        raise ValueError("텐서 차원이 너무 큽니다 (최대 3)")
    if len(dummy_indices) > 6:
        raise ValueError("텐서 반복 인덱스가 너무 많습니다 (최대 6개)")

    # 3. 문자열 레벨에서 확장 수행
    expanded_terms = []
    from itertools import product
    dummy_list = list(dummy_indices)
    
    for values in product(range(1, dim + 1), repeat=len(dummy_list)):
        term_str = raw_str
        for idx_name, val in zip(dummy_list, values):
            def repl_idx(m):
                prefix = m.group(1)
                content = m.group(2)
                if idx_name in GREEK_LIST:
                    pattern = r'\\' + re.escape(idx_name) + r'(?![a-zA-Z])'
                else:
                    pattern = r'(?<!\\)\b' + re.escape(idx_name) + r'\b'
                new_content = re.sub(pattern, str(val), content)
                return prefix + "{" + new_content + "}"
            
            term_str = re.sub(r'([_^])\{([^}]*)\}', repl_idx, term_str)
            if idx_name in GREEK_LIST:
                term_str = re.sub(r'([_^])\\' + re.escape(idx_name) + r'(?![a-zA-Z])', r'\g<1>' + str(val), term_str)
            else:
                term_str = re.sub(r'([_^])' + re.escape(idx_name) + r'\b', r'\g<1>' + str(val), term_str)
        expanded_terms.append(term_str)
        
    final_latex_str = " + ".join(expanded_terms)
    try:
        return latex_to_sympy(final_latex_str)
    except Exception:
        res_expr = 0
        for t in expanded_terms:
            try: res_expr += latex_to_sympy(t)
            except Exception: pass
        return res_expr

def format_step(text, latex_expr, level, target_level):
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
    # 이미 Integral 객체인 경우 integrand의 단계를 추출
    if isinstance(expr, sp.Integral):
        if not var or var in expr.variables:
            var = expr.variables[0]
            expr = expr.function

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
    # 이미 Derivative 객체인 경우 미분 대상 수식을 추출
    if isinstance(expr, sp.Derivative):
        if not var or var in expr.variables:
            var = expr.variables[0]
            expr = expr.expr

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

def _parse_var_csv(arg):
    """변수 CSV 파싱 (예: "x, y"). 빈/공백만 있는 이름은 오류 처리 (N1)."""
    names = [v.strip() for v in arg.split(',')]
    if any(not n for n in names):
        raise ValueError("변수 이름이 비어 있습니다")
    return [sp.Symbol(n) for n in names]

def op_diff(expr, args):
    # 이미 Derivative 객체인 경우 (LaTeX에 \frac{d}{dx} 등이 포함됨)
    if isinstance(expr, sp.Derivative):
        if not args:
            return expr.doit()
        # 변수가 명시된 경우, 일단 doit() 한 뒤에 추가 미분을 수행하거나 
        # 혹은 명시된 변수가 이미 미분 변수에 포함되어 있다면 redundant한 요청으로 보고 doit()만 수행
        vars_to_diff = _parse_var_csv(args[0])
        if all(v in expr.variables for v in vars_to_diff):
            return expr.doit()
        # 그 외의 경우 (예: d/dx 를 선택하고 diff > y 를 호출) doit() 후 새로 미분
        expr = expr.doit()

    # 변수가 명시되지 않으면 첫 번째 자유 변수(알파벳 순)로 미분
    if not args:
        symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
        if not symbols:
            return 0
        return sp.diff(expr, symbols[0])
    
    # diff > x, y 형태의 다변수 편미분 지원
    vars_to_diff = _parse_var_csv(args[0])
    return sp.diff(expr, *vars_to_diff)

def op_taylor(expr, args, parallels):
    """테일러 급수 전개: taylor / [차수] 또는 taylor > [변수], [차수], [지점]"""
    symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
    var = sp.Symbol(args[0]) if args else (symbols[0] if symbols else sp.Symbol('x'))
    
    # 2. 차수 결정 (parallels에서 order=N 또는 숫자 찾기, 없으면 args[1], 기본값 4)
    n = 4
    for p in parallels:
        if p.startswith('order='):
            try:
                n = int(p.split('=')[1])
                break
            except: pass
        elif p.isdigit():
            n = int(p)
            break
            
    if len(args) > 1 and args[1].isdigit():
        n = int(args[1])
    
    # taylor > 1000 (차수 단독) 형태: 숫자는 변수명이 될 수 없으므로 차수로 해석
    # (이전에는 args[0]='1000' 을 변수 Symbol('1000') 로 처리해 차수 캡이 우회됐다)
    if args and len(args) == 1 and args[0].isdigit():
        n = int(args[0])
        
    # [보안] 테일러 차수 제한 — 과도한 전개로 서버가 멈추는 것을 방지 (A1)
    if n > 100:
        raise ValueError("테일러 급수 차수는 100을 초과할 수 없습니다")
        
    # 3. 전개 지점 결정 (parallels에서 at=N, 없으면 args[2], 기본값 0)
    at = 0
    for p in parallels:
        if p.startswith('at='):
            try:
                at = safe_parse_expr(p.split('=')[1], evaluate=True)
                break
            except: pass
    
    if len(args) > 2:
        try:
            at = safe_parse_expr(args[2], evaluate=True)
        except: pass

    # 4. 테일러 전개 실행
    calc_expr = expr
    if sp.Symbol('e') in expr.free_symbols:
        calc_expr = expr.subs(sp.Symbol('e'), sp.E)
        
    series_poly = sp.series(calc_expr, var, at, n).removeO()
    
    # 5. 낮은 차수부터 정렬하여 수동으로 LaTeX 생성
    # [Fix] expand()를 제거하여 (x-a)^n 형태의 멱급수 꼴을 유지함
    terms = sp.Add.make_args(series_poly)
    def get_degree(term):
        # (x-a)**n 형태에서 차수 추출
        try:
            d = sp.degree(term, var)
            return int(d) if d.is_integer else 0
        except: return 0
            
    sorted_terms = sorted(terms, key=get_degree)
    
    # 6. 수동 LaTeX 조립 (정렬 유지)
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
    # 이미 Integral 객체인 경우 (LaTeX에 \int 가 포함됨)
    if isinstance(expr, sp.Integral):
        if not args:
            return expr.doit()
        # 사용자가 변수나 구간을 명시한 경우, 기존 적분은 풀고 새로 적용
        # 단, 명시된 변수가 이미 Integral의 변수에 포함되어 있다면 redundant로 보고 doit()
        params = [p.strip() for p in args[0].split(',')]
        var = sp.Symbol(params[0])
        if var in expr.variables:
            return expr.doit()
        expr = expr.doit()

    if not args:
        # [N3] free_symbols 는 set 순회라 PYTHONHASHSEED 에 따라 순서가 달라진다.
        # 단일 변수 선택 지점은 이름 기준 정렬로 결정적으로 만든다.
        symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
        return sp.integrate(expr, symbols[0]) if symbols else expr
    
    # int > x, a, b 형태의 구간 입력
    params = [p.strip() for p in args[0].split(',')]
    var = sp.Symbol(params[0])
    if len(params) == 3:
        return sp.integrate(expr, (var, safe_parse_expr(params[1], evaluate=False), safe_parse_expr(params[2], evaluate=False)))
    return sp.integrate(expr, var)

def op_limit(expr, args):
    """극한 계산: limit > x, 0 또는 limit > x, oo, -"""
    # 이미 Limit 객체인 경우 (LaTeX에 \lim 이 포함됨)
    if isinstance(expr, sp.Limit):
        if not args:
            return expr.doit()
        # 사용자가 변수나 대상을 명시한 경우, 기존 극한은 풀고 새로 적용
        # 단, 명시된 변수와 대상이 이미 Limit의 정보와 같다면 redundant로 보고 doit()
        params = [p.strip() for p in args[0].split(',')]
        var = sp.Symbol(params[0])
        target = safe_parse_expr(params[1], evaluate=False) if len(params) > 1 else 0
        if var == expr.variables[0] and target == expr.z0:
            return expr.doit()
        expr = expr.doit()

    if not args: return expr
    params = [p.strip() for p in args[0].split(',')]
    var = sp.Symbol(params[0])
    target = safe_parse_expr(params[1], evaluate=False) if len(params) > 1 else 0
    direction = params[2] if len(params) > 2 else '+'
    return sp.limit(expr, var, target, dir=direction)

# 잘 알려진 함수 이름 — 함수 호출 인자에서 독립 변수를 유추하지 않도록 제외 (M4)
_ODE_FUNC_NAMES = {
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch', 'log', 'ln', 'exp', 'sqrt',
    'abs', 'min', 'max', 'floor', 'ceil', 'sign', 'det', 'arg', 'Re', 'Im',
    'lim', 'inf', 'sup', 'gcd', 'lcm', 'erf', 'erfc', 'Gamma', 'zeta', 'frac',
}

# 상수 목록 — fix_ode_expression 과 동일하게 유지 (독립 변수 후보에서 제외)
_ODE_CONSTANTS = {'e', 'E', 'pi', 'I', 'i', 'j', 'g', 'L', 'k', 'm', 'M', 'G', 'R', 'C'}

def _detect_ode_indep_fallback(latex_str, dep_var):
    """함수 호출 인자·종속 변수·상수에 들어있지 않은 자유 변수에서 독립 변수를 찾습니다.

    결정적(deterministic): 등장 순서대로 후보를 수집하고, x/t/s/r/z 우선순위로 선택합니다.
    """
    # 1) 함수 호출 인자 마스킹: \cos(y), \sin(x), f(t) — 인자 안 변수는 후보에서 제외
    masked = re.sub(r'\\?[a-zA-Z]+\s*(\([^()]*\))', lambda m: ' ' * len(m.group(0)), latex_str)
    # 2) \left( ... \right) 형태의 함수 인자 마스킹
    masked = re.sub(r'\\left\s*(\([^()]*\))\\right\s*', lambda m: ' ' * len(m.group(0)), masked)
    # 3) 명령어 이름 마스킹: \cos, \frac, \theta 등 — 명령어 이름의 글자는 변수 후보가 아님
    masked = re.sub(r'\\[a-zA-Z]+', lambda m: ' ' * len(m.group(0)), masked)

    excluded = set(_ODE_CONSTANTS) | {dep_var, 'd'}
    candidates = []
    for name in re.findall(r'[a-zA-Z]+', masked):
        if name in excluded or len(name) != 1:
            continue
        if name not in candidates:
            candidates.append(name)

    if not candidates:
        return None
    preferred = ['x', 't', 's', 'r', 'z']
    for p in preferred:
        if p in candidates:
            return p
    return candidates[0]

def preprocess_latex_ode(latex_str):
    r"""\frac{d^ny}{dx^n} 형태를 y' 형태로 변환하고, 독립 변수를 추출합니다."""
    indep = None
    
    # 그리스 문자 목록 (백슬래시 포함 여부와 상관없이)
    greek_list = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega']
    greek_pattern = r'\\?(?:' + '|'.join(greek_list) + r'|omicron|upsilon)'
    
    # 종속 변수: 프라임이 붙은 기호의 기본 문자 (예: y' -> y, \theta' -> theta)
    m_dep = re.search(r"\\?([a-zA-Z]+)'", latex_str)
    dep_var = m_dep.group(1) if m_dep else None

    # 독립 변수 감지: 프라임이 붙은 함수 표기 f'(t), y''(x) 에서만 추출
    # (일반 함수 호출 cos(y) 는 미분 표기가 아니므로 제외 — cos(y) 의 y 를
    #  독립 변수로 오인하지 않는다. 이전 버그: y' - \cos(y) - x = 0 에서
    #  indep='y' 로 잘못 감지되어 해가 y(y) 로 나왔다 — M4)
    m_indep = re.search(r"([a-zA-Z]+)'+\(\s*([a-zA-Z]+)\s*\)", latex_str)
    if m_indep and m_indep.group(1) not in _ODE_FUNC_NAMES:
        indep = m_indep.group(2).strip()

    # 단일 알파벳 또는 그리스 문자 (캡처 그룹 포함)
    var_pattern = r'([a-zA-Z]|' + greek_pattern + r')'

    # 1. 점(dot) 표기법 처리 (보통 t를 독립변수로 함)
    if r'\ddot' in latex_str or r'\dot' in latex_str:
        if not indep: indep = 't'
        # \ddot{theta} 또는 \ddot theta 처리
        latex_str = re.sub(r'\\ddot\{' + var_pattern + r'\}', r"\1''", latex_str)
        latex_str = re.sub(r'\\ddot\s+' + var_pattern, r"\1''", latex_str)
        latex_str = re.sub(r'\\dot\{' + var_pattern + r'\}', r"\1'", latex_str)
        latex_str = re.sub(r'\\dot\s+' + var_pattern, r"\1'", latex_str)

    # 2. \prime, \doubleprime 등 처리
    latex_str = latex_str.replace(r'^{\prime\prime}', "''").replace(r'^{\prime}', "'")
    latex_str = latex_str.replace(r'\prime\prime', "''").replace(r'\prime', "'")
    
    # 3. \frac{d^2y}{dx^2} -> y'' (공백 및 변수 유연하게 대응)
    def repl_n(m):
        nonlocal indep
        # [보안] 미분 차수 제한 — "'" * N 문자열 폭주 방지 (A1)
        # 29자 입력 \frac{d^9999999y}{dx^9999999} 가 10MB 문자열을 만들 수 있다.
        order = int(m.group(1))
        if order > 1000:
            raise ValueError("미분 차수가 너무 큽니다 (최대 1000)")
        indep = m.group(3).replace('\\', '')
        return m.group(2).replace('\\', '') + "'" * order
    
    # var_pattern이 캡처 그룹을 가지고 있으므로 group 번호 주의 (1: 차수, 2: 종속변수, 3: 독립변수)
    # \frac{d^2 theta}{dt^2} 등
    latex_str = re.sub(r'\\frac\{d\^(\d+)\s*' + var_pattern + r'\}\{d' + var_pattern + r'\^\1\}', repl_n, latex_str)
    
    # 4. \frac{dy}{dx} -> y' (공백 허용)
    def repl_1(m):
        nonlocal indep
        indep = m.group(2).replace('\\', '')
        return m.group(1).replace('\\', '') + "'"
        
    latex_str = re.sub(r'\\frac\{d' + var_pattern + r'\}\{d' + var_pattern + r'\}', repl_1, latex_str)
    
    # 5. 프라임 기호가 붙은 그리스 문자 처리 (개선됨: 부분 매칭 및 중복 (t) 방지)
    target_indep = indep if indep else 'x'
    greek_pattern_combined = '|'.join(greek_list)
    # ('+(?!')) 가 전체 프라임 시퀀스를 매칭하도록 보장함
    # (?!\s*\() 는 뒤에 공백을 포함하여 괄호가 오는지 확인하여 중복 (t) 추가 방지
    latex_str = re.sub(r'\\(' + greek_pattern_combined + r")('+(?!'))(?!\s*\()", 
                       r'\\\1\2(' + target_indep + r')', 
                       latex_str)

    # 6. 아직 독립 변수를 못 찾았다면 자유 변수 후보에서 결정 (함수 호출 인자·상수·종속 변수 제외)
    if not indep:
        fallback = _detect_ode_indep_fallback(latex_str, dep_var)
        if fallback:
            indep = fallback

    return latex_str, indep

def fix_ode_expression(expr, dep_var_name='y', indep_var_name=None):
    """파싱된 SymPy 수식을 ODE 풀이가 가능한 형태로 변환합니다."""
    if sp.Symbol('e') in expr.free_symbols:
        expr = expr.subs(sp.Symbol('e'), sp.E)

    # 독립 변수 감지
    if indep_var_name is None:
        existing_funcs = [f for f in expr.atoms(sp.Function) if getattr(f.func, 'name', None) == dep_var_name]
        if existing_funcs:
            args = existing_funcs[0].args
            x = args[0] if args else sp.Symbol('x')
        else:
            other_symbols = [s for s in expr.free_symbols if not s.name.startswith(dep_var_name)]
            # e, pi, I 등 수학 상수 및 g, L, k, m, M 등 물리 상수 제외
            constants = ['e', 'E', 'pi', 'I', 'i', 'j', 'g', 'L', 'k', 'm', 'M', 'G', 'R', 'C']
            other_symbols = [s for s in other_symbols if s.name not in constants]
            
            # x, t, s, r, tau 등 우선순위
            preferred_names = ['x', 't', 's', 'r', 'tau', 'z']
            preferred = [s for s in other_symbols if s.name in preferred_names]
            if preferred:
                x = preferred[0]
            elif other_symbols:
                # 알파벳 역순으로 하여 보통 x, t 등이 선택되도록 유도 (a, b 보다는)
                x = sorted(other_symbols, key=lambda s: s.name, reverse=True)[0]
            else:
                x = sp.Symbol('x')
    else:
        x = sp.Symbol(indep_var_name)
        
    y = sp.Function(dep_var_name)(x)
    
    # Derivative 객체와 SymPy 심볼(') 모두 처리
    substitutions = {}
    
    # 1. 심볼 형태(y', y'') 처리
    for sym in expr.free_symbols:
        name = sym.name
        if name == dep_var_name:
            substitutions[sym] = y
        elif name.startswith(dep_var_name) and all(c == "'" for c in name[len(dep_var_name):]):
            order = name.count("'")
            substitutions[sym] = y.diff(x, order)
            
    # 2. 이미 존재하는 Derivative 객체 보정 (예: \frac{d}{dx}가 직접 파싱된 경우)
    def fix_derivatives(e):
        if isinstance(e, sp.Derivative):
            if getattr(e.expr, 'name', None) == dep_var_name:
                return e.subs(e.expr, y).subs(e.variables[0], x)
        return e
        
    fixed_expr = expr.subs(substitutions)
    # Derivative 객체 내부의 변수를 일치시킴 (Symbol 또는 Function 형태 모두 대응)
    def is_target_deriv(e):
        if not isinstance(e, sp.Derivative): return False
        sub_expr = e.expr
        if getattr(sub_expr, 'name', None) == dep_var_name: return True
        if hasattr(sub_expr, 'func') and getattr(sub_expr.func, 'name', None) == dep_var_name: return True
        return False

    fixed_expr = fixed_expr.replace(
        is_target_deriv,
        lambda e: y.diff(x, len(e.variables))
    )
    
    return fixed_expr, y, x

# 초기조건 값 형식 검증 (보안): 숫자 리터럴, 단순 심볼, 단순 거듭제곱만 허용
# S('chr(95)+...') 같은 safe_parse_expr 샌드박스 이스케이프 payload를 차단한다 (S1).
_IC_NUM_RE = re.compile(r'^[+-]?\d+\.?\d*$')
_IC_SYM_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9_]*$')
# a^2, a^{-1}, e^{-t}, e^-t, x^{-2} 등 — 지수는 수치/부호 있는 심볼 허용
_IC_POW_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9_]*\^\{?[+-]?[a-zA-Z0-9_]+\}?$')

def is_valid_ic_value(value_str):
    """초기조건 값/지점이 안전한 형식(수치·심볼·단순 거듭제곱)인지 검증합니다."""
    s = str(value_str).strip()
    return bool(_IC_NUM_RE.match(s) or _IC_SYM_RE.match(s) or _IC_POW_RE.match(s))

def parse_ics(ics_str, funcs, x):
    """ic=y(0):1,z(0):0 형태의 초기조건을 파싱합니다. 임의의 지점 x0 및 여러 함수를 지원합니다."""
    ics = {}
    if not ics_str:
        return ics
        
    if not isinstance(funcs, (list, tuple)):
        funcs_list = [funcs]
    else:
        funcs_list = funcs
        
    func_map = {}
    for f in funcs_list:
        if hasattr(f, 'func'):
            func_map[f.func.__name__] = f
        elif hasattr(f, 'name'):
            func_map[f.name] = f

    pairs = ics_str.split(',')
    for pair in pairs:
        pair = pair.strip()
        if not pair: continue
        
        if '=' in pair:
            lhs_str, rhs_str = pair.split('=', 1)
        elif ':' in pair:
            lhs_str, rhs_str = pair.split(':', 1)
        else:
            continue
            
        lhs_str = lhs_str.strip()
        # [보안] 초기조건 값(RHS)과 지점(x0)은 safe_parse_expr 호출 전에
        # 엄격한 형식(숫자/단순 심볼/단순 거듭제곱)으로 검증한다.
        # 검증 없이는 S('chr(95)+...') 같은 샌드박스 이스케이프 payload가
        # safe_parse_expr 에 도달해 RCE로 이어질 수 있다 (S1).
        rhs_str = rhs_str.strip()
        if not is_valid_ic_value(rhs_str):
            raise ValueError(f"초기조건 값 형식이 올바르지 않습니다: {rhs_str}")
        rhs = safe_parse_expr(rhs_str, evaluate=False)
        
        # 정규화하여 감지 (f(x0) 또는 f'(x0) 형태)
        clean_lhs = lhs_str.replace('\\', '').replace('{', '').replace('}', '').replace(' ', '')
        m = re.match(r"([a-zA-Z]+)('*)\((.*?)\)", clean_lhs)
        
        if m:
            func_name = m.group(1)
            primes = m.group(2)
            x0_str = m.group(3)
            
            if func_name in func_map:
                try:
                    target_func = func_map[func_name]
                    x0_str = x0_str.strip()
                    # [보안] IC 지점(x0)도 형식 검증 (S1 우회 벡터 차단)
                    if not is_valid_ic_value(x0_str):
                        raise ValueError(f"초기조건 지점 형식이 올바르지 않습니다: {x0_str}")
                    x0 = safe_parse_expr(x0_str, evaluate=False)
                    order = len(primes)
                    
                    if order == 0:
                        ics[target_func.subs(x, x0)] = rhs
                    else:
                        ics[target_func.diff(x, order).subs(x, x0)] = rhs
                except Exception as e:
                    # [P17] 초기조건 파싱 실패를 무시하지 않고 로그로 남긴다.
                    # IC가 조용히 누락되면 ODE 해가 틀려도 원인을 알 수 없었다.
                    logger.debug("parse_ics: %s(%s) 초기조건 파싱 실패: %s", func_name, x0_str, e)
            
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
        for f in expr.atoms(sp.Function):
            f_name = getattr(f.func, 'name', None)
            if f_name:
                if f_name in funcs:
                    substitutions[f] = funcs[f_name]

        fixed_exprs.append(expr.subs(substitutions))
        
    return fixed_exprs, list(funcs.values()), t

def op_ode(expr, args, indep_var_name=None):
    """상미분방정식(단일/연립) 해 도출 및 초기조건(ic) 부여"""
    # 1. 종속 변수 감지: 프라임(')이 붙은 변수 우선, 그 외 y, u, v, w 등
    symbols_with_primes = [sym for sym in expr.free_symbols if sym.name.endswith("'")]
    if symbols_with_primes:
        found_vars = {sym.name.rstrip("'").replace('\\', '') for sym in symbols_with_primes}
    else:
        # expr.atoms(sp.Function) 도 확인 (UndefinedFunction만 추출)
        existing_funcs = [getattr(f.func, 'name', None) for f in expr.atoms(sp.Function) 
                          if isinstance(f.func, sp.core.function.UndefinedFunction)]
        found_vars = {name.replace('\\', '') for name in existing_funcs if name}
        
        if not found_vars:
            potential_dep_vars = {'y', 'u', 'v', 'w', 'z', 'theta', 'phi', 'psi', 'eta', 'xi', 'omega'}
            found_vars = {sym.name.replace('\\', '') for sym in expr.free_symbols if sym.name.replace('\\', '') in potential_dep_vars}
            
    if not found_vars:
        found_vars = {'y'}
            
    if len(found_vars) > 1:
        fixed_exprs, funcs, t = fix_system_ode([expr], list(found_vars), indep_var_name or 't')
        try:
            return sp.dsolve(fixed_exprs, funcs)
        except Exception as e:
            return f"\\text{{System ODE solver failed: }}{sp.latex(str(e))}"

    dep_var = list(found_vars)[0]
    fixed_expr, y, x = fix_ode_expression(expr, dep_var_name=dep_var, indep_var_name=indep_var_name)
    
    ics = {}
    if args:
        all_ic_parts = []
        for arg in args:
            if 'ic=' in arg:
                all_ic_parts.append(arg.replace('ic=', '').strip())
        
        if all_ic_parts:
            # 여러 개의 ic= 인자를 콤마로 연결하여 한 번에 처리
            combined_ics_str = ",".join(all_ic_parts)
            ics = parse_ics(combined_ics_str, [y], x)
                
    try:
        # Eq 객체가 아니면 = 0으로 간주
        equation = fixed_expr if isinstance(fixed_expr, sp.Equality) else sp.Eq(fixed_expr, 0)
        return sp.dsolve(equation, y, ics=ics if ics else None)
    except Exception as e:
        # 에러 메시지를 정제하여 사용자에게 수학적 한계를 알림
        err_msg = str(e)
        expr_latex = sp.latex(equation)
        return f"\\text{{The ODE solver failed for }} {expr_latex}: {sp.latex(err_msg)}. \\\\ \\text{{This non-linear ODE may not have a closed-form solution.}} \\\\ \\text{{Recommendation: Use 'calc > num_solve' for numerical results.}}"

def op_dimcheck_wrapper(expr, args, parallels, selection):
    """차원 및 단위 검사기 (Dimensional Analysis Check)"""
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
    # parallels에서 err=x:0.1,y:0.2 파싱
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
            # (∂V/∂I * ΔI)^2 형태의 편미분 제곱합 조립
            partial_diff = sp.diff(expr, sym)
            variance += (partial_diff * err_dict[sym])**2
            
    return sp.sqrt(variance)

def fix_pde_expression(expr, dep_var_name='u'):
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
    # 1. 초기 조건 및 범위 파싱
    # ic=y(5):1,y'(0):2 형태의 초기조건 문자열을 (함수, 프라임수, t0, y0) 목록으로 파싱한다.
    # 기존 split(':') 방식은 다중 IC(y(0):1,y'(0):2)에서 값을 잘라내는 문제가 있어
    # 정규식 기반으로 전체 IC 문자열을 한 번에 처리한다 (M2).
    ic_re = re.compile(r"^\s*([a-zA-Z]+)\s*('*)\s*\(\s*(.+?)\s*\)\s*[:=]\s*(.+?)\s*$")
    ics = []  # (func_name, order, t0, y0)
    t_span = [0, 10]
    num_points = 100
    show_plot = False
    
    if args:
        for arg in args:
            if 'ic=' in arg:
                ic_str = arg.replace('ic=', '').strip()
                for part in ic_str.split(','):
                    part = part.strip()
                    if not part:
                        continue
                    m = ic_re.match(part)
                    if not m:
                        raise ValueError(f"초기조건 형식이 올바르지 않습니다: {part}")
                    func_name, primes, t0_str, y0_str = m.group(1), m.group(2), m.group(3), m.group(4)
                    # [보안] 값/지점 모두 is_valid_ic_value 화이트리스트 검증 (S1)
                    if not is_valid_ic_value(t0_str):
                        raise ValueError(f"초기조건 지점 형식이 올바르지 않습니다: {t0_str}")
                    if not is_valid_ic_value(y0_str):
                        raise ValueError(f"초기조건 값 형식이 올바르지 않습니다: {y0_str}")
                    try:
                        t0 = float(t0_str)
                        y0 = float(y0_str)
                    except ValueError:
                        raise ValueError(f"초기조건은 숫자여야 합니다: {part}") from None
                    ics.append((func_name, len(primes), t0, y0))
            elif 't_span=' in arg:
                parts = arg.replace('t_span=', '').split(',')
                if len(parts) == 2:
                    try:
                        t_span = [float(parts[0]), float(parts[1])]
                    except Exception as e:
                        # [P17] 잘못된 t_span 값은 무시하고 기본 범위(0~10)를 유지하되 로그 기록
                        logger.debug("num_solve: t_span 파싱 실패, 기본값 유지: %s", e)
            elif 'points=' in arg:
                try:
                    num_points = int(arg.replace('points=', ''))
                except Exception as e:
                    # [P17] 잘못된 points 값은 기본 샘플 수(100)로 폴백하되 로그 기록
                    logger.debug("num_solve: points 파싱 실패, 기본값 유지: %s", e)
            elif 'plot=true' in arg:
                show_plot = True

    if not ics:
        return "Error: Numerical solving requires initial conditions (e.g., ic=y(0):1)"

    if len(ics) > 2:
        raise ValueError("최대 2개의 초기조건을 지원합니다")

    # 함수명이 ODE의 종속 변수와 일치하는지 확인
    ode_dep_names = set()
    for f in expr.atoms(sp.Function):
        if isinstance(f.func, sp.core.function.UndefinedFunction):
            ode_dep_names.add(getattr(f.func, 'name', None))
    if ode_dep_names:
        for func_name, _, _, _ in ics:
            if func_name not in ode_dep_names:
                raise ValueError(f"초기조건 함수명({func_name})이 ODE의 종속 변수와 일치하지 않습니다")

    # 중복 IC 검사 (같은 함수+차수)
    seen = set()
    for func_name, order, _, _ in ics:
        key = (func_name, order)
        if key in seen:
            raise ValueError(f"중복된 초기조건입니다: {func_name}{chr(39) * order}(...)")
        seen.add(key)

    # 모든 IC의 t0는 동일해야 한다 (solve_ivp는 단일 시작점만 지원)
    t0_vals = {ic[2] for ic in ics}
    if len(t0_vals) > 1:
        raise ValueError("모든 초기조건은 같은 시점(t0)에 주어져야 합니다")
    t0_ic = ics[0][2]

    fixed_expr, y_func, t_var = fix_ode_expression(expr)

    # ODE 차수 감지: 최고차 미분 차수
    max_order = 0
    for d in fixed_expr.atoms(sp.Derivative):
        max_order = max(max_order, len(d.variables))

    ics_by_order = {order: (t0, y0) for func_name, order, t0, y0 in ics}

    if max_order == 1:
        if 1 in ics_by_order:
            raise ValueError("1계 미분방정식에는 y'(t0) 초기조건을 적용할 수 없습니다")
        if 0 not in ics_by_order:
            return "Error: Numerical solving requires initial conditions (e.g., ic=y(0):1)"
        t0 = ics_by_order[0][0]
        y0 = [ics_by_order[0][1]]
        y_prime = y_func.diff(t_var)
        sol_expr = sp.solve(fixed_expr, y_prime)
        if not sol_expr:
            return "Error: Could not solve for y' explicitly."
        f_np = safe_lambdify((t_var, y_func), sol_expr[0])
        def odefun(t, y): return f_np(t, y[0])
    else:
        if max_order != 2:
            return f"Error: {max_order}계 미분방정식의 수치해석은 지원되지 않습니다 (2계까지 지원)"
        if 0 not in ics_by_order or 1 not in ics_by_order:
            return "Error: 2계 미분방정식에는 y(t0)와 y'(t0) 초기조건이 모두 필요합니다 (예: ic=y(0):1,y'(0):0)"
        t0 = ics_by_order[0][0]
        y0 = [ics_by_order[0][1], ics_by_order[1][1]]
        y_prime = y_func.diff(t_var)
        y_double_prime = y_func.diff(t_var, 2)
        sol_expr = sp.solve(fixed_expr, y_double_prime)
        if not sol_expr:
            return "Error: Could not solve for y'' explicitly."
        yp_sym = sp.Symbol('yp')
        f2_np = safe_lambdify((t_var, y_func, yp_sym), sol_expr[0].subs(y_prime, yp_sym))
        def odefun(t, state): return [state[1], f2_np(t, state[0], state[1])]

    # t_span 옵션의 종료점을 t_final로 사용하고, 시작점은 초기조건의 t0로 결정한다.
    # (기존 버그: IC의 t0를 무시하고 t_span[0]=0에서 시작 → y(5)=1이 y(0)=1로 오용됨 — M2)
    t_start = t0
    t_end = t_span[1]
    if t_start == t_end:
        return "Error: t_span 종료점은 초기조건 시점(t0)과 달라야 합니다."
    t_eval = np.linspace(t_start, t_end, num_points)
    
    try:
        sol = solve_ivp(odefun, (t_start, t_end), y0, t_eval=t_eval)
    except Exception as e:
        return f"Error in numerical solver: {str(e)}"
    
    if show_plot:
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
        # 결과값만 반환 (유동적으로 샘플 포인트 선택)
        if len(sol.t) <= 5:
            indices = list(range(len(sol.t)))
        else:
            indices = [0, len(sol.t)//4, len(sol.t)//2, 3*len(sol.t)//4, len(sol.t)-1]
            
        res_parts = []
        for idx in indices:
            t_val = round(sol.t[idx], 2)
            y_val = round(sol.y[0][idx], 4)
            res_parts.append(f"y({t_val}) \\approx {y_val}")
        
        return " \\\\ ".join(res_parts)

def op_pde(expr, args):
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
from label_engine import LabelEngine

def run_fast_op(op_name, expr, *args):
    """SymEngine을 사용하여 연산을 가속합니다. 지원하지 않는 경우 SymPy로 폴백합니다."""
    if not HAS_SYMENGINE:
        return None
    
    try:
        se_expr = symengine.sympify(expr)
        
        if op_name == "diff":
            var = symengine.Symbol(str(args[0]))
            res = se_expr.diff(var)
            return sp.sympify(res) # 다시 SymPy로 변환하여 후속 처리(latex 등) 호환성 유지
        elif op_name == "expand":
            res = se_expr.expand()
            return sp.sympify(res)
        elif op_name == "simplify":
            # SymEngine의 simplify는 기능이 제한적일 수 있음
            if hasattr(se_expr, 'simplify'):
                res = se_expr.simplify()
                return sp.sympify(res)
        elif op_name == "det":
            se_mtx = symengine.Matrix(expr.tolist())
            res = se_mtx.det()
            return sp.sympify(res)
    except Exception:
        pass # 실패 시 None 반환하여 SymPy 폴백 유도
    return None

def _checked_int_value(x):
    """정수로 변환하되 자릿수 제한(20자리)을 적용합니다. (prime/factorint 폭주 방지 — A1)"""
    val = int(sp.simplify(x))
    if len(str(abs(val))) > 20:
        raise ValueError("숫자가 너무 큽니다 (최대 20자리)")
    return val

def _get_precision(config):
    """config 에서 precision 설정을 읽습니다 (없으면 기본 10). eval 연산에 사용 (N11)."""
    settings = config.get('settings') or {}
    try:
        return int(settings.get('precision') or config.get('precision') or 10)
    except (TypeError, ValueError):
        return 10

def get_calc_operations():
    # matrix/cite/oeis/plot 는 execute_calc 에서 조기 반환(전용 핸들러)되므로
    # 이 테이블에 존재하지 않는다 (죽은 디스패치 제거 — N10).
    return {
        # 1. 기본 대수 및 해석 
        "calc": lambda x, v, p, c, s: x.doit(),
        # 'evaluate' 는 'calc' 와 동일한 doit() 별칭 (하위 호환용 — 유지)
        "evaluate": lambda x, v, p, c, s: x.doit(),
        "simplify": lambda x, v, p, c, s: run_fast_op("simplify", x) or sp.simplify(x.doit()),
        "expand": lambda x, v, p, c, s: run_fast_op("expand", x) or sp.expand(x),
        "factor": lambda x, v, p, c, s: sp.factor(x),
        "solve": lambda x, v, p, c, s: sp.solve(x),
        "eval": lambda x, v, p, c, s: x.evalf(_get_precision(c)),
        
        # 2. 분수 및 삼각함수
        "apart": lambda x, v, p, c, s: sp.apart(x),
        "together": lambda x, v, p, c, s: sp.together(x),
        "trigsimp": lambda x, v, p, c, s: sp.trigsimp(x),
        "expand_trig": lambda x, v, p, c, s: sp.expand_trig(x),
        
        # 3. 미적분 계층
        "diff": lambda x, v, p, c, s: run_fast_op("diff", x, sp.Symbol(v[0]) if v else sorted(list(x.free_symbols), key=lambda s: s.name)[0] if x.free_symbols else sp.Symbol('x')) or op_diff(x, v),
        "int": lambda x, v, p, c, s: op_int(x, v),
        "limit": lambda x, v, p, c, s: op_limit(x, v),
        "taylor": lambda x, v, p, c, s: op_taylor(x, v, p),
        "asymp": lambda x, v, p, c, s: sp.series(x, sp.Symbol(v[0]) if v else sorted(list(x.free_symbols), key=lambda s: s.name)[0], sp.oo).removeO(),
        
        # 4. 선형대수 행렬 연산
        "det": lambda x, v, p, c, s: run_fast_op("det", x) or sp.Matrix(x).det(),
        "inv": lambda x, v, p, c, s: sp.Matrix(x).inv(),
        "eigen": lambda x, v, p, c, s: sp.Matrix(x).eigenvals(),
        "rref": lambda x, v, p, c, s: sp.Matrix(x).rref()[0],
        "rank": lambda x, v, p, c, s: sp.Matrix(x).rank(),
        "trace": lambda x, v, p, c, s: sp.Matrix(x).trace(),
        "transpose": lambda x, v, p, c, s: sp.Matrix(x).T,
        "nullspace": lambda x, v, p, c, s: sp.Matrix(x).nullspace(),
        # [Fix] 변수명 앞뒤 공백 제거 — 'jacobian > x, y' 에서 Symbol(' y') 가 생성되어
        # y 방향 미분이 누락되던 버그 수정 (P14)
        "jacobian": lambda x, v, p, c, s: sp.Matrix(x).jacobian([sp.Symbol(sym.strip()) for sym in v[0].split(',')]) if v else x,
        # [N3] free_symbols set 순회 비결정성 방지 — 이름 기준 정렬
        "hessian": lambda x, v, p, c, s: sp.hessian(x, sorted(list(x.free_symbols), key=lambda s: s.name)),
        
        # 5. 미분방정식 및 변환
        "ode": lambda x, v, p, c, s: op_ode(x, v),
        "num_solve": lambda x, v, p, c, s: op_num_solve(x, v),
        "pde": lambda x, v, p, c, s: op_pde(x, v),
        "laplace": lambda x, v, p, c, s: op_laplace(x, v, c),
        "ilaplace": lambda x, v, p, c, s: sp.inverse_laplace_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('s'), sp.Symbol('t'), noconds=True),
        "fourier": lambda x, v, p, c, s: sp.fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('x'), sp.Symbol('k')),
        "ifourier": lambda x, v, p, c, s: sp.inverse_fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('k'), sp.Symbol('x')),
        "ztrans": lambda x, v, p, c, s: sp.Sum(x * sp.Symbol('z')**(-sp.Symbol('n')), (sp.Symbol('n'), 0, sp.oo)).doit(),
        
        # 6. 복소해석학
        "residue": lambda x, v, p, c, s: sp.residue(x, sp.Symbol(v[0]), safe_parse_expr(v[1], evaluate=False) if len(v)>1 else 0),
        "laurent": lambda x, v, p, c, s: sp.series(x, sp.Symbol(v[0]), 0, 4, dir='+').removeO(),
        "conjugate": lambda x, v, p, c, s: sp.conjugate(x),
        "re": lambda x, v, p, c, s: sp.re(x),
        "im": lambda x, v, p, c, s: sp.im(x),

        # 7. 정수론 및 이산수학
        "prime": lambda x, v, p, c, s: sp.isprime(_checked_int_value(x)),
        "factorint": lambda x, v, p, c, s: sp.factorint(_checked_int_value(x)),
        "logic": lambda x, v, p, c, s: sp.simplify_logic(x, form='cnf'),
        
        # 8. 물리 / 공학 유틸리티
        "dimcheck": lambda x, v, p, c, s: op_dimcheck_wrapper(x, v, p, s),
        "error_prop": lambda x, v, p, c, s: op_error_prop(x, v, p),
        "tensor_expand": lambda x, v, p, c, s: op_tensor_expand(x, v, p, s),
    }

def preprocess_matrix_latex(latex_str):
    r"""
    \begin{bmatrix} ... \end{bmatrix} 형태를 SymPy Matrix 문자열로 변환합니다.
    """
    def repl(match):
        content = match.group(1).strip()
        # [Fix] 단일 백슬래시가 아닌 \\ (줄바꿈)으로 분리
        raw_parts = re.split(r'\\\\|\\cr', content)
        matrix_rows = []
        for part in raw_parts:
            part = part.strip()
            part = re.sub(r'^\[.*?\]', '', part).strip()
            if not part: continue
            cells = [c.strip() for c in part.split('&')]
            if any(cells):
                processed_cells = []
                for cell in cells:
                    try:
                        # parse_latex를 사용하여 각 셀을 SymPy 객체로 변환 후 문자열화
                        # 이렇게 하면 e^{ax} 등이 자동으로 exp(a*x) 등으로 변환됨
                        processed_cells.append(str(parse_latex(cell)))
                    except:
                        # 실패 시 수동 보정 폴백
                        cell = re.sub(r'\\([a-zA-Z]+)', r'\1', cell)
                        cell = re.sub(r'\^\{(.*?)\}', r'**(\1)', cell)
                        processed_cells.append(cell)
                matrix_rows.append("[" + ", ".join(processed_cells) + "]")
        return "Matrix([" + ", ".join(matrix_rows) + "])"

    pattern = r'\\begin\{[bpvVB]matrix\}(.*?)\\end\{[bpvVB]matrix\}'
    processed = re.sub(pattern, repl, latex_str, flags=re.DOTALL)
    
    # 2. 행렬 연산자 및 특수 기호 변환
    if 'Matrix' in processed:
        # 역행렬: ^{-1} -> .inv()
        processed = re.sub(r'\^\{\s*-\s*1\s*\}', '.inv()', processed)
        # 전치행렬: ^T, ^\top, ^\intercal -> .T
        processed = re.sub(r'\^\{\s*\\*(?:T|top|intercal)\s*\}|\^\\*(?:T|top|intercal)', '.T', processed)
        
        # [보안] safe_parse_expr AST 검증은 속성 접근(.inv()/.T)을 금지하므로
        # 함수 호출 형태(inv(...)/transpose(...))로 변환한다 (P1 화이트리스트 호환).
        # Matrix([...]) 의 괄호는 중첩 대괄호만 포함하므로 첫 ')' 에서 안전하게 종료된다.
        processed = re.sub(r'(Matrix\([^\n]*?\))\.inv\(\)', r'inv(\1)', processed)
        processed = re.sub(r'(Matrix\([^\n]*?\))\.T\b', r'transpose(\1)', processed)
        
        # [Fix] Greedy match for Matrix(...) to handle nested parentheses
        for func in ['det', 'tr', 'trace', 'inv', 'rank', 'transpose']:
            processed = re.sub(r'\\*' + func + r'\s*(Matrix\(.*\))', func + r'(\1)', processed)
            
        processed = re.sub(r'\\+([a-zA-Z]+)', r'\1', processed)
        processed = processed.replace('times', '*').replace('cdot', '*')
        
    return processed

# [Fix] lru_cache 제거 (P15): 캐시 키가 요청 JSON 전체이므로 항상 고유한
# requestId(crypto.randomUUID)가 포함되어 캐시가 절대 히트되지 않는데,
# 대신 최대 1024개의 대용량 응답(plot 3D 데이터, base64 이미지)이
# 메모리에 누적되는 문제가 있었다.

def _is_error_string(s):
    """문자열 결과가 오류 메시지인지 판별합니다 (P11).

    일부 연산자(op_ode, op_num_solve)는 실패 시 LaTeX 문자열을 반환하는데,
    이 문자열이 그대로 status:"success" latex 로 포장되어 사용자 문서에
    삽입되는 문제를 차단하기 위한 판별 헬퍼입니다.
    """
    t = s.strip()
    return (t.startswith("Error:")
            or t.startswith("Error in numerical solver:")
            or t.startswith("\\text{The ODE solver failed")
            or t.startswith("\\text{System ODE solver failed"))

def _error_message_text(s):
    """오류 문자열에서 LaTeX 명령을 벗겨낸 순수 텍스트 메시지를 추출합니다."""
    msg = re.sub(r'\\text\{([^{}]*)\}', r'\1', s)
    msg = msg.replace('\\\\', ' ').replace('\\', '').strip()
    return msg

def execute_calc(parsed_json_str):
    try:
        req = json.loads(parsed_json_str)
        main_cmd = req.get('mainCommand', '').strip()
        sub_cmds = req.get('subCommands', [])
        parallels = req.get('parallelOptions', [])
        config = req.get('config', {})
        # [N11] 설정 사용 현황:
        # - precision: eval 연산에서 소비됨 (_get_precision)
        # - imaginaryUnit: latex_to_sympy 변환 게이트로 사용됨
        # - angleUnit / simplifyResult: 현재 소비되지 않는 설정 (향후 연동 예정)
        selection = req.get('rawSelection', '').strip()
        selection = strip_latex_delimiters(selection)

        if main_cmd == "labels":
            filepath = config.get('filepath')
            if not filepath:
                return json.dumps({"status": "error", "message": "라벨 탐색을 위한 파일 경로가 제공되지 않았습니다"})
            engine = LabelEngine()
            return json.dumps(engine.parse_file(filepath))

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

        if action == "snippet":
            # 사용자 정의 스니펫 스크립트 실행 (사용자 자신의 코드이므로 신뢰함)
            code = sub_cmds[0] if sub_cmds else ""
            if not code:
                return json.dumps({"status": "error", "message": "Snippet script 코드가 비어 있습니다."})
            ns = {
                "selection": selection,
                "sp": sp,
                "parse_expr": safe_parse_expr,
                "to_latex": lambda expr: sp.latex(expr),
            }
            try:
                exec(code, ns)
            except Exception as e:
                return json.dumps({"status": "error", "message": f"Snippet script 오류: {type(e).__name__}: {e}"})
            result = ns.get("result")
            if result is None:
                return json.dumps({"status": "error", "message": "Snippet script에서 'result' 변수를 설정해야 합니다."})
            return json.dumps({"status": "success", "latex": str(result)})

        if action == "plot":
            # Plot 명령도 전용 핸들러에서 직접 파싱 및 처리
            workspace_dir = config.get('workspaceDir', os.getcwd())
            plot_res = handle_plot(selection, sub_cmds, parallels, config, workspace_dir)
            if plot_res.get("status") == "error":
                return json.dumps(plot_res)
            return json.dumps({
                "status": "success",
                "kind": plot_res.get("kind"),
                "latex": plot_res["latex"],
                "expr_latex": plot_res.get("expr_latex"),
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
            return json.dumps({"status": "error", "message": "구분자 제거 후 선택 영역이 비어 있습니다"})

        if action == "ode":
            # [Add] \begin{cases} ... \end{cases} 환경 전처리
            selection = re.sub(r'\\begin\{cases\}(.*?)\\end\{cases\}', r'\1', selection, flags=re.DOTALL)
            selection = selection.replace(r'\\', '\n') # cases 내부 줄바꿈을 개행으로 변환
            
            parts = re.split(r'[,;]|\r?\n', selection)
            exprs = []
            ode_args = sub_cmds.copy()
            detected_indeps = []
            
            # 초기 조건(IC)들을 수집하여 하나의 문자열로 합침
            found_ics = []
            for p in parts:
                p_strip = p.strip()
                if not p_strip: continue
                
                # y(0)=1, y'(0)=0 등의 패턴 감지 (LaTeX 및 일반 텍스트 대응)
                # 정규화하여 체크 (백슬래시, 중괄호 제거)
                norm_p = p_strip.replace('\\', '').replace('{', '').replace('}', '').replace(' ', '')
                is_explicit_ic = 'ic=' in p_strip
                # 패턴을 더 엄격하게 수정: '함수(숫자)=값' 또는 '함수'(숫자)=값' 형태만 허용
                # ^[a-zA-Z]+'*\(.*?\)[=:] 는 "alphatheta''(t)+betaphi'(t)=0" 전체를 IC로 오인할 수 있음
                # 따라서 '=' 앞부분이 순수하게 함수와 인자만 있는지 확인
                is_pattern_ic = False
                if '=' in norm_p or ':' in norm_p:
                    lhs = re.split(r'[=:]', norm_p)[0]
                    if re.match(r"^[a-zA-Z]+'*\([\d\.]+\)$", lhs):
                        is_pattern_ic = True
                
                if is_explicit_ic or is_pattern_ic:
                    ic_part = p_strip.replace('ic=', '').strip()
                    found_ics.append(ic_part)
                else:
                    preprocessed, indep = preprocess_latex_ode(p_strip)
                    if indep: detected_indeps.append(indep)
                    preprocessed = re.sub(r'\\([a-zA-Z]+)\s*\{\\left\s*\((.*?)\\right\s*\)\}', r'\\\1(\2)', preprocessed)
                    preprocessed = re.sub(r'\\left\s*\((.*?)\\right\s*\)', r'(\1)', preprocessed)
                    # [Fix] \mathrm{...} / \text{...} 정규화 (M3) + 상수 변환 (M1) —
                    # 공유 변환 계층(latex_to_sympy)에서 normalize + parse_latex +
                    # safe_parse_expr 폴백을 한 번에 처리한다 (H2 파서 중복 제거)
                    expr = latex_to_sympy(preprocessed)
                    if sp.Symbol('e') in expr.free_symbols:
                        expr = expr.subs(sp.Symbol('e'), sp.E)
                    exprs.append(expr)
            
            if found_ics:
                ode_args.append("ic=" + ",".join(found_ics))
            
            if not exprs:
                return json.dumps({"status": "error", "message": "ODE 식을 찾을 수 없습니다"})

            # 수집된 모든 자유 변수 및 함수 확인
            all_symbols = set()
            all_funcs = set()
            for e in exprs:
                all_symbols.update(e.free_symbols)
                # UndefinedFunction(사용자 정의 함수)만 종속 변수 후보로 추출
                # 이름을 추출할 때 백슬래시 제거하여 일관성 유지
                for f in e.atoms(sp.Function):
                    if isinstance(f.func, sp.core.function.UndefinedFunction):
                        name = getattr(f.func, 'name', None)
                        if name:
                            all_funcs.add(name.replace('\\', ''))
            
            # 종속 변수 감지: 프라임 붙은 변수 + y, u, v, w, z + 주요 그리스 문자
            potential_dep_vars = {'y', 'u', 'v', 'w', 'z', 'theta', 'phi', 'psi', 'eta', 'xi', 'omega'}
            found_vars = set()
            for sym in all_symbols:
                name = sym.name.replace('\\', '')
                if "'" in name:
                    found_vars.add(name.split("'")[0])
            
            for f_name in all_funcs:
                # f_name은 이미 백슬래시가 제거된 상태
                if "'" in f_name:
                    found_vars.add(f_name.split("'")[0])
                else:
                    found_vars.add(f_name)
            
            # [추가] atoms(sp.Function)에서 직접 이름 추출 (f_name 매핑이 안된 경우 대비)
            for e in exprs:
                for f in e.atoms(sp.Function):
                    f_func_name = getattr(f.func, 'name', None)
                    if f_func_name:
                        clean_f_name = f_func_name.replace('\\', '')
                        if "'" in clean_f_name:
                            found_vars.add(clean_f_name.split("'")[0])
                        elif isinstance(f.func, sp.core.function.UndefinedFunction):
                            found_vars.add(clean_f_name)

            # 만약 위에서 아무것도 발견되지 않았다면 기본 후보군에서 검색
            if not found_vars:
                found_vars.update({sym.name.replace('\\', '') for sym in all_symbols if sym.name.replace('\\', '') in potential_dep_vars})
            
            # [Final Safety] 여전히 비어있다면 y를 기본값으로 사용
            if not found_vars:
                found_vars = {'y'}
            
            # 주 독립 변수 결정 (가장 먼저 감지된 것 우선)
            # detected_indeps 가 비어있을 경우를 대비하여 안전하게 처리
            main_indep = None
            if detected_indeps:
                main_indep = detected_indeps[0]
            
            # 만약 detected_indeps가 없다면 자유 변수 중에서 t, x 순으로 찾음
            if not main_indep:
                names = {s.name for s in all_symbols}
                # t, x 뿐만 아니라 함수의 인자에서도 찾음
                for e in exprs:
                    for f in e.atoms(sp.Function):
                        if isinstance(f.func, sp.core.function.UndefinedFunction) and f.args:
                            arg_name = str(f.args[0])
                            if arg_name in ['t', 'x', 's', 'z']:
                                main_indep = arg_name
                                break
                    if main_indep: break
                
                if not main_indep:
                    if 't' in names: main_indep = 't'
                    elif 'x' in names: main_indep = 'x'

            if exprs: # [Fix] found_vars 여부와 상관없이 exprs가 있으면 시도
                if len(exprs) > 1 or len(found_vars) > 1:
                    if not found_vars: found_vars = {'y'}
                    fixed_exprs, funcs, t = fix_system_ode(exprs, list(found_vars), main_indep or 't')
                    while len(fixed_exprs) < len(funcs):
                        fixed_exprs.append(sp.Eq(0, 0))
                    
                    ics = {}
                    for arg in ode_args:
                        if 'ic=' in arg:
                            ics.update(parse_ics(arg.replace('ic=', '').strip(), funcs, t))
                    
                    result = sp.dsolve(fixed_exprs, funcs, ics=ics if ics else None)
                else:
                    if not found_vars: found_vars = {'y'}
                    result = op_ode(exprs[0], ode_args, indep_var_name=main_indep)
            else:
                return json.dumps({"status": "error", "message": "ODE 식을 찾을 수 없습니다"})
        else:
            # 행렬 환경이 포함되어 있으면 Matrix() 생성자로 변환
            if 'matrix' in selection:
                processed_selection = preprocess_matrix_latex(selection)
                # [Fix] Python 예약어인 lambda가 포함되어 있으면 구문 오류가 발생하므로 lamda로 치환
                processed_selection = re.sub(r'\blambda\b', 'lamda', processed_selection)
                # [Fix] = 을 == 로 치환하여 방정식 파싱 허용
                processed_selection = processed_selection.replace('=', '==')
                
                # Matrix([...]) 형태는 parse_latex 대신 parse_expr 사용
                # locals에 Matrix와 기본 함수들 추가
                calc_locals = {
                    'Matrix': sp.Matrix,
                    'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
                    'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt,
                    'pi': sp.pi, 'theta': sp.Symbol('theta'), 'phi': sp.Symbol('phi'),
                    'lamda': sp.Symbol('lambda'), # lambda -> lamda 매핑
                    'det': sp.det, 'tr': sp.trace, 'transpose': lambda m: m.T, 'inv': lambda m: m.inv(),
                    'diff': sp.diff, 'integrate': sp.integrate, 'limit': sp.limit
                }
                expr = safe_parse_expr(processed_selection, local_dict=calc_locals, evaluate=False)
            else:
                # [Pre-process for Gamma and other functions]
                # \Gamma{\left(z \right)} -> \Gamma(z)
                preprocessed = re.sub(r'\\([a-zA-Z]+)\s*\{\\left\s*\((.*?)\\right\s*\)\}', r'\\\1(\2)', selection)
                preprocessed = re.sub(r'\\left\s*\((.*?)\\right\s*\)', r'(\1)', preprocessed)
                # [Fix] parse_latex 는 그리스 문자/상수를 Symbol 로 파싱한다
                # (\pi → Symbol('pi') 는 sp.pi 가 아님). 공유 변환 계층 latex_to_sympy 가
                # \mathrm/\text/\operatorname 정규화(M3) + 상수 변환(M1) +
                # safe_parse_expr 화이트리스트 폴백(S2)까지 한 번에 수행한다 (H2).
                imaginary_unit = bool(
                    config.get('imaginaryUnit')
                    or (config.get('settings') or {}).get('imaginaryUnit')
                )
                expr = latex_to_sympy(preprocessed, imaginary_unit=imaginary_unit)
            
            ops = get_calc_operations()
            if action not in ops:
                raise ValueError(f"알 수 없는 명령입니다: {action}")
            result = ops[action](expr, sub_cmds, parallels, config, selection)

        # [N5] solve 결과가 빈 리스트이면 (x = x+1 같은 모순 또는 해가 없는 방정식)
        # 빈 리스트가 성공으로 포장되어 문서에 [] 가 삽입되는 것을 차단한다.
        # step=1 경로의 get_solve_steps(BooleanFalse) 크래시도 이 지점에서 함께 예방된다.
        if action == "solve" and isinstance(result, (list, tuple)) and len(result) == 0:
            return json.dumps({"status": "error", "message": "해가 없습니다 (모순된 방정식)"})

        # [Fix] 오류 문자열이 status:"success" latex 로 포장되어 문서에 삽입되는 문제 차단 (P11)
        # op_ode/op_num_solve 는 실패 시 오류 문자열을 반환한다. dimcheck(인라인 주석 렌더링,
        # '%' 로 시작)와 num_solve 의 plot JSON('{' 로 시작)은 의도된 반환이므로 제외된다.
        if isinstance(result, str) and _is_error_string(result):
            return json.dumps({"status": "error", "message": _error_message_text(result)})
        
        final_latex = result if isinstance(result, str) else sp.latex(result)
            
        steps = []
        step_level = next((int(p.split('=')[1]) for p in parallels if p.startswith('step=')), 0)
        
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
                    except Exception as ex:
                        # [P17] 개별 방정식 파싱 실패는 무시하되 로그로 남긴다.
                        # 조용히 삼키면 vars 목록이 비어 step/vars 기능이 오작동한다.
                        logger.debug("execute_calc: ODE 변수 수집 중 파싱 실패: %s", ex)
            vars_list = sorted(all_vars)  # [N3] set 순회 비결정성 제거 — 이름순 정렬
        else:
            # [N3] free_symbols set 순회 비결정성 제거 — 이름순 정렬
            vars_list = sorted(str(s) for s in expr.free_symbols)

        if step_level > 0:
            # 수식 전개 과정을 AST 기반으로 추적 (MVP는 요약본 제공)
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
    # 테스트 1: 다변수 편미분
    test_json = json.dumps({
        "rawSelection": r"x^2 y + y^3 \sin(x)",
        "subCommands": ["diff", "x, y"],
        "parallelOptions": []
    })
    print(execute_calc(test_json))
