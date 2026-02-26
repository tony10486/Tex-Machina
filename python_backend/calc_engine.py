import sympy as sp
from sympy.parsing.latex import parse_latex  # 공식 파서 사용
import json

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
    if not args:
        # 변수가 명시되지 않으면 첫 번째 자유 변수로 미분 [cite: 139]
        symbols = list(expr.free_symbols)
        return sp.diff(expr, symbols[0]) if symbols else 0
    
    # diff > x, y 형태의 다변수 편미분 지원 [cite: 32]
    vars_to_diff = [sp.Symbol(v.strip()) for v in args[0].split(',')]
    return sp.diff(expr, *vars_to_diff)

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

def op_ode(expr, args):
    """상미분방정식 해 도출 및 초기조건(ic) 부여 [cite: 33]"""
    if args and 'ic' in args[0]:
        # ic=y(0):1,y'(0):0 형태 파싱 (단순화된 예시)
        # 실제 구현시에는 dictionary 형태로 sp.dsolve에 ict 매개변수 전달
        pass 
    return sp.dsolve(expr)

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

# ==========================================
# 2. 메인 계산 라우터 (Command Dictionary)
# ==========================================

def get_calc_operations():
    """제안서에 명시된 모든 연산자를 매핑하는 딕셔너리 """
    return {
        # 1. 기본 대수 및 해석 
        "simplify": lambda x, v: sp.simplify(x),
        "expand": lambda x, v: sp.expand(x),
        "factor": lambda x, v: sp.factor(x),
        "solve": lambda x, v: sp.solve(x),
        "eval": lambda x, v: x.evalf(),
        
        # 2. 분수 및 삼각함수 [cite: 25]
        "apart": lambda x, v: sp.apart(x),
        "together": lambda x, v: sp.together(x),
        "trigsimp": lambda x, v: sp.trigsimp(x),
        "expand_trig": lambda x, v: sp.expand_trig(x),
        
        # 3. 미적분 계층 [cite: 25, 32]
        "diff": op_diff,
        "int": op_int,
        "limit": op_limit,
        "taylor": lambda x, v: sp.series(x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0], 0, 4 if len(v)<2 else int(v[1])).removeO(),
        "asymp": lambda x, v: sp.series(x, sp.Symbol(v[0]) if v else list(x.free_symbols)[0], sp.oo).removeO(), # 점근 전개 [cite: 40]
        
        # 4. 선형대수 행렬 연산 [cite: 26, 27, 35]
        "det": lambda x, v: sp.Matrix(x).det(),
        "inv": lambda x, v: sp.Matrix(x).inv(),
        "eigen": lambda x, v: sp.Matrix(x).eigenvals(),
        "rref": lambda x, v: sp.Matrix(x).rref()[0],
        "rank": lambda x, v: sp.Matrix(x).rank(),
        "trace": lambda x, v: sp.Matrix(x).trace(),
        "transpose": lambda x, v: sp.Matrix(x).T,
        "nullspace": lambda x, v: sp.Matrix(x).nullspace(),
        "jacobian": lambda x, v: sp.Matrix(x).jacobian([sp.Symbol(sym) for sym in v[0].split(',')]) if v else x, # 야코비 행렬 [cite: 35]
        "hessian": lambda x, v: sp.hessian(x, list(x.free_symbols)), # 헤세 행렬 [cite: 35]
        
        # 5. 미분방정식 및 변환 [cite: 28, 41]
        "ode": op_ode,
        "laplace": lambda x, v: sp.laplace_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('t'), sp.Symbol('s'), noconds=True),
        "ilaplace": lambda x, v: sp.inverse_laplace_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('s'), sp.Symbol('t'), noconds=True),
        "fourier": lambda x, v: sp.fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('x'), sp.Symbol('k')),
        "ifourier": lambda x, v: sp.inverse_fourier_transform(x, sp.Symbol(v[0]) if v else sp.Symbol('k'), sp.Symbol('x')),
        "ztrans": lambda x, v: sp.Sum(x * sp.Symbol('z')**(-sp.Symbol('n')), (sp.Symbol('n'), 0, sp.oo)).doit(), # Z-변환 [cite: 41]
        
        # 6. 복소해석학 [cite: 29, 30]
        "residue": lambda x, v: sp.residue(x, sp.Symbol(v[0]), sp.sympify(v[1]) if len(v)>1 else 0),
        "laurent": lambda x, v: sp.series(x, sp.Symbol(v[0]), 0, 4, dir='+').removeO(),
        "conjugate": lambda x, v: sp.conjugate(x),
        "re": lambda x, v: sp.re(x),
        "im": lambda x, v: sp.im(x),
        
        # 7. 정수론 및 이산수학 [cite: 30, 31, 39]
        "prime": lambda x, v: sp.isprime(int(sp.simplify(x))),
        "factorint": lambda x, v: sp.factorint(int(sp.simplify(x))),
        "logic": lambda x, v: sp.simplify_logic(x, form='cnf'), # 복잡한 논리식 최소화 [cite: 39]
        
        # 8. 물리 / 공학 유틸리티 [cite: 100, 115]
        "dimcheck": op_dimcheck,
        "error_prop": lambda x, v, p: op_error_prop(x, v, p),
        "tensor_expand": lambda x, v: op_tensor_expand(x, v)
    }

# ==========================================
# 3. 메인 핸들러 (Node.js 통신 엔트리)
# ==========================================

def execute_calc(parsed_json_str):
    """Node.js에서 넘겨받은 JSON을 파싱하여 연산을 수행하는 메인 함수"""
    try:
        request = json.loads(parsed_json_str)
        selection = request.get('rawSelection', '')
        sub_cmds = request.get('subCommands', [])
        parallels = request.get('parallelOptions', [])
        
        # 1. 수식 파싱 (SymPy 공식 내장 파서로 교체!)
        expr = parse_latex(selection)
        
        # 2. 명령어 식별
        action = sub_cmds[0] if sub_cmds else "simplify"
        args = sub_cmds[1:] if len(sub_cmds) > 1 else []
        
        operations = get_calc_operations()
        
        if action not in operations:
            raise ValueError(f"지원하지 않는 calc 연산입니다: {action}")
            
        # 3. 연산 수행
        func = operations[action]
        
        # error_prop은 병치 옵션(parallels) 데이터가 필요하므로 예외 처리
        if action == "error_prop":
            result_expr = func(expr, args, parallels)
        else:
            result_expr = func(expr, args)
            
        # 4. 단계별 풀이 (Step-by-Step) 처리 [cite: 43]
        steps_output = []
        step_level = 0
        for p in parallels:
            if p.startswith('step='):
                step_level = int(p.split('=')[1]) # 풀이의 상세도 결정 [cite: 43]
                
        if step_level > 0:
            # Level 1: 핵심 공식 적용 및 최종 답안 [cite: 44]
            # Level 2~3 구현을 위해서는 AST 트리 순회(Walk) 알고리즘 추가 필요 [cite: 45, 145]
            steps_output.append(r"\begin{aligned}")
            steps_output.append(f"&\\text{{Apply }} {action} \\text{{ operation...}} \\\\")
            steps_output.append(f"&= {sp.latex(result_expr)}")
            steps_output.append(r"\end{aligned}")

        # 5. 결과 반환 (JSON)
        response = {
            "status": "success",
            "latex": sp.latex(result_expr),
            "action_performed": action,
            "steps": steps_output if step_level > 0 else None,
            "free_symbols": [str(s) for s in expr.free_symbols] if hasattr(expr, 'free_symbols') else []
        }
        return json.dumps(response)
        
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        })

# 단독 실행 테스트용
if __name__ == "__main__":
    # 테스트 1: 다변수 편미분 [cite: 32]
    test_json = json.dumps({
        "rawSelection": r"x^2 y + y^3 \sin(x)",
        "subCommands": ["diff", "x, y"],
        "parallelOptions": []
    })
    print(execute_calc(test_json))