import sympy as sp
from sympy.parsing.latex import parse_latex  # 공식 파서 사용
import json
import re
import os
from functools import lru_cache
from utils import SAFE_SYMPY_DICT, safe_parse_expr, strip_latex_delimiters

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
        return parse_latex(final_latex_str)
    except:
        res_expr = 0
        for t in expanded_terms:
            try: res_expr += parse_latex(t)
            except: pass
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

def op_diff(expr, args):
    # 이미 Derivative 객체인 경우 (LaTeX에 \frac{d}{dx} 등이 포함됨)
    if isinstance(expr, sp.Derivative):
        if not args:
            return expr.doit()
        # 변수가 명시된 경우, 일단 doit() 한 뒤에 추가 미분을 수행하거나 
        # 혹은 명시된 변수가 이미 미분 변수에 포함되어 있다면 redundant한 요청으로 보고 doit()만 수행
        vars_to_diff = [sp.Symbol(v.strip()) for v in args[0].split(',')]
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
    vars_to_diff = [sp.Symbol(v.strip()) for v in args[0].split(',')]
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
        symbols = list(expr.free_symbols)
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

def preprocess_latex_ode(latex_str):
    r"""\frac{d^ny}{dx^n} 형태를 y' 형태로 변환하고, 독립 변수를 추출합니다."""
    indep = None
    
    # 그리스 문자 목록 (백슬래시 포함 여부와 상관없이)
    greek_list = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega']
    greek_pattern = r'\\?(?:' + '|'.join(greek_list) + r'|omicron|upsilon)'
    
    # 독립 변수 감지 (f(t) 형태에서 추출)
    m_indep = re.search(r"(?:[a-zA-Z]|\\(?:" + '|'.join(greek_list) + r"))'*\((\s*[a-zA-Z]\s*)\)", latex_str)
    if m_indep:
        indep = m_indep.group(1).strip()

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
        indep = m.group(3).replace('\\', '')
        return m.group(2).replace('\\', '') + "'" * int(m.group(1))
    
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
        rhs = safe_parse_expr(rhs_str.strip(), evaluate=False)
        
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
                    x0 = safe_parse_expr(x0_str, evaluate=False)
                    order = len(primes)
                    
                    if order == 0:
                        ics[target_func.subs(x, x0)] = rhs
                    else:
                        ics[target_func.diff(x, order).subs(x, x0)] = rhs
                except: pass
            
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
    ics_dict = {}
    t_span = [0, 10]
    num_points = 100
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
                    try:
                        t_span = [float(parts[0]), float(parts[1])]
                    except: pass
            elif 'points=' in arg:
                try:
                    num_points = int(arg.replace('points=', ''))
                except: pass
            elif 'plot=true' in arg:
                show_plot = True
                    
    if not ics_dict:
        return "Error: Numerical solving requires initial conditions (e.g., ic=y(0):1)"

    fixed_expr, y_func, t_var = fix_ode_expression(expr)
    
    y_prime = y_func.diff(t_var)
    sol_expr = sp.solve(fixed_expr, y_prime)
    if not sol_expr:
        return "Error: Could not solve for y' explicitly."
    
    # t_var(독립 변수)를 t로, y_func를 y로 lambdify
    f_np = sp.lambdify((t_var, y_func), sol_expr[0], 'numpy')
    def odefun(t, y): return f_np(t, y[0])
    
    t0_val = list(ics_dict.keys())[0]
    y0 = [ics_dict[t0_val]]
    t_eval = np.linspace(t_span[0], t_span[1], num_points)
    
    try:
        sol = solve_ivp(odefun, t_span, y0, t_eval=t_eval)
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
from query_engine import execute_query_on_text
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

def get_calc_operations():
    return {
        # 0. 행렬 및 인용
        "matrix": lambda x, v, p, c, s: handle_matrix(v, p),
        "cite": lambda x, v, p, c, s: handle_cite(v),
        "oeis": lambda x, v, p, c, s: handle_oeis(v),

        # 1. 기본 대수 및 해석 
        "calc": lambda x, v, p, c, s: x.doit(),
        "evaluate": lambda x, v, p, c, s: x.doit(),
        "simplify": lambda x, v, p, c, s: run_fast_op("simplify", x) or sp.simplify(x.doit()),
        "expand": lambda x, v, p, c, s: run_fast_op("expand", x) or sp.expand(x),
        "factor": lambda x, v, p, c, s: sp.factor(x),
        "solve": lambda x, v, p, c, s: sp.solve(x),
        "eval": lambda x, v, p, c, s: x.evalf(),
        
        # 2. 분수 및 삼각함수
        "apart": lambda x, v, p, c, s: sp.apart(x),
        "together": lambda x, v, p, c, s: sp.together(x),
        "trigsimp": lambda x, v, p, c, s: sp.trigsimp(x),
        "expand_trig": lambda x, v, p, c, s: sp.expand_trig(x),
        
        # 3. 미적분 계층
        "diff": lambda x, v, p, c, s: run_fast_op("diff", x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0] if x.free_symbols else sp.Symbol('x')) or op_diff(x, v),
        "int": lambda x, v, p, c, s: op_int(x, v),
        "limit": lambda x, v, p, c, s: op_limit(x, v),
        "taylor": lambda x, v, p, c, s: op_taylor(x, v, p),
        "asymp": lambda x, v, p, c, s: sp.series(x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0], sp.oo).removeO(),
        
        # 4. 선형대수 행렬 연산
        "det": lambda x, v, p, c, s: run_fast_op("det", x) or sp.Matrix(x).det(),
        "inv": lambda x, v, p, c, s: sp.Matrix(x).inv(),
        "eigen": lambda x, v, p, c, s: sp.Matrix(x).eigenvals(),
        "rref": lambda x, v, p, c, s: sp.Matrix(x).rref()[0],
        "rank": lambda x, v, p, c, s: sp.Matrix(x).rank(),
        "trace": lambda x, v, p, c, s: sp.Matrix(x).trace(),
        "transpose": lambda x, v, p, c, s: sp.Matrix(x).T,
        "nullspace": lambda x, v, p, c, s: sp.Matrix(x).nullspace(),
        "jacobian": lambda x, v, p, c, s: sp.Matrix(x).jacobian([sp.Symbol(sym) for sym in v[0].split(',')]) if v else x,
        "hessian": lambda x, v, p, c, s: sp.hessian(x, list(x.free_symbols)),
        
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
        "prime": lambda x, v, p, c, s: sp.isprime(int(sp.simplify(x))),
        "factorint": lambda x, v, p, c, s: sp.factorint(int(sp.simplify(x))),
        "logic": lambda x, v, p, c, s: sp.simplify_logic(x, form='cnf'),
        
        # 8. 물리 / 공학 유틸리티
        "dimcheck": lambda x, v, p, c, s: op_dimcheck_wrapper(x, v, p, s),
        "error_prop": lambda x, v, p, c, s: op_error_prop(x, v, p),
        "tensor_expand": lambda x, v, p, c, s: op_tensor_expand(x, v, p, s),

        # 9. 시각화 (Plotting)
        "plot": lambda x, v, p, c, s: handle_plot(s, v, p, c, os.getcwd())
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
        
        # [Fix] Greedy match for Matrix(...) to handle nested parentheses
        for func in ['det', 'tr', 'trace', 'inv', 'rank', 'transpose']:
            processed = re.sub(r'\\*' + func + r'\s*(Matrix\(.*\))', func + r'(\1)', processed)
            
        processed = re.sub(r'\\+([a-zA-Z]+)', r'\1', processed)
        processed = processed.replace('times', '*').replace('cdot', '*')
        
    return processed

@lru_cache(maxsize=1024)
def execute_calc(parsed_json_str):
    try:
        req = json.loads(parsed_json_str)
        main_cmd = req.get('mainCommand', '').strip()
        sub_cmds = req.get('subCommands', [])
        parallels = req.get('parallelOptions', [])
        config = req.get('config', {})
        selection = req.get('rawSelection', '').strip()
        selection = strip_latex_delimiters(selection)

        if main_cmd == "labels":
            filepath = config.get('filepath')
            if not filepath:
                return json.dumps({"status": "error", "message": "No file path provided for label discovery"})
            engine = LabelEngine()
            return json.dumps(engine.parse_file(filepath))

        if main_cmd == "?":
            full_text = req.get('fullText', '')
            # sub_cmds[0] should contain the query without '?'
            query_str = sub_cmds[0] if sub_cmds else selection
            res = execute_query_on_text(full_text, query_str)
            if res.get('status') == 'success':
                return json.dumps({
                    "status": "success",
                    "mainCommand": "?",
                    "fullText": res['text'],
                    "latex": ""
                })
            return json.dumps(res)
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
            return json.dumps({"status": "error", "message": "Selection is empty after stripping delimiters"})

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
                    expr = parse_latex(preprocessed)
                    if sp.Symbol('e') in expr.free_symbols:
                        expr = expr.subs(sp.Symbol('e'), sp.E)
                    exprs.append(expr)
            
            if found_ics:
                ode_args.append("ic=" + ",".join(found_ics))
            
            if not exprs:
                return json.dumps({"status": "error", "message": "No ODE expression found"})

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
                return json.dumps({"status": "error", "message": "No ODE expression found"})
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
                
                # e를 sp.E로 변환하기 위해 parse_latex의 결과를 보정하거나 
                # 파싱 전에 텍스트 레벨에서 e^... 형태를 변환 시도
                expr = parse_latex(preprocessed)
                if sp.Symbol('e') in expr.free_symbols:
                    expr = expr.subs(sp.Symbol('e'), sp.E)
            
            ops = get_calc_operations()
            if action not in ops:
                raise ValueError(f"Unknown action: {action}")
            result = ops[action](expr, sub_cmds, parallels, config, selection)
        
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
                    except: pass
            vars_list = list(all_vars)
        else:
            vars_list = [str(s) for s in expr.free_symbols]

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
