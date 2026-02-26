import sympy as sp
from typing import Dict, Any, Union
import re

# Vol 1. 5.1장 규격에 따른 안전한 파서
from sympy.parsing.latex import parse_latex as latex2sympy

# ---------------------------------------------------------------------------
# [1] 기본 차원 기호(Base Dimensions) 및 표준 매핑 (Mechanics & Electromagnetism)
# ---------------------------------------------------------------------------
# 질량(M), 길이(L), 시간(T), 전류(I), 온도(Theta)
M, L, T_dim, I, Theta = sp.symbols('M L T I Theta', positive=True)

# 널리 쓰이는 물리학 변수들의 기본 차원 매핑 사전
STANDARD_DIM_MAP = {
    # 1. 질량, 시간, 길이
    'm': M, 'M': M,
    't': T_dim, 'T': T_dim,
    'x': L, 'y': L, 'z': L, 'r': L, 'l': L, 'd': L, 'h': L,
    
    # 2. 역학 (Mechanics)
    'v': L / T_dim, 'u': L / T_dim, 'c': L / T_dim, # 속도
    'a': L / T_dim**2, 'g': L / T_dim**2,           # 가속도
    'F': M * L / T_dim**2, 'N': M * L / T_dim**2,   # 힘
    'p': M * L / T_dim,                             # 운동량
    'E': M * L**2 / T_dim**2, 'U': M * L**2 / T_dim**2, 'K': M * L**2 / T_dim**2, 'W': M * L**2 / T_dim**2, # 에너지/일
    'P': M * L**2 / T_dim**3,                       # 일률 (Power)
    'rho': M / L**3,                                # 밀도
    'A': L**2,                                      # 면적
    'V': L**3,                                      # 부피
    'omega': 1 / T_dim,                             # 각속도
    
    # 3. 전자기학 (Electromagnetism)
    'q': I * T_dim, 'Q': I * T_dim,                 # 전하량
    'V_e': M * L**2 / (I * T_dim**3),               # 전위 (Voltage)
    'R': M * L**2 / (I**2 * T_dim**3),              # 저항
    'B': M / (I * T_dim**2),                        # 자기장
    
    # 4. 무차원 (Dimensionless) 상수 및 각도
    'theta': sp.S.One, 'phi': sp.S.One, 'alpha': sp.S.One, 'beta': sp.S.One, 'pi': sp.S.One,
    'constant': sp.S.One, 'text': sp.S.One
}

# ---------------------------------------------------------------------------
# [2] 차원 추적 코어 알고리즘 (Recursive Dimension Tracker)
# ---------------------------------------------------------------------------

def _get_dimension(expr: sp.Expr, dim_map: Dict[str, sp.Expr]) -> sp.Expr:
    """
    주어진 SymPy 표현식의 물리적 차원을 재귀적으로 계산하고, 
    덧셈이나 초월함수 내부에서 차원 불일치가 발생하면 ValueError를 던집니다.
    """
    # 1. 상수 및 숫자 (무차원)
    if isinstance(expr, sp.Number):
        return sp.S.One
        
    # 2. 단일 변수 (매핑 사전에서 검색, 없으면 임시 미지 차원으로 취급)
    elif isinstance(expr, sp.Symbol):
        if expr.name in dim_map:
            return dim_map[expr.name]
        # LaTeX \text{...} 이나 'constant' 처리
        elif 'text' in expr.name or expr.name == 'constant':
            return sp.S.One
        else:
            # 매핑에 없는 변수는 [var_name] 형태의 새로운 차원 기호로 간주
            return sp.Symbol(f"[{expr.name}]", positive=True)
            
    # 3. 곱셈 (차원의 곱)
    elif isinstance(expr, sp.Mul):
        dim = sp.S.One
        for arg in expr.args:
            dim *= _get_dimension(arg, dim_map)
        return sp.simplify(dim)
        
    # 4. 거듭제곱 (지수는 무차원이어야 하며, 밑의 차원을 지수만큼 제곱)
    elif isinstance(expr, sp.Pow):
        base_dim = _get_dimension(expr.base, dim_map)
        exp_dim = _get_dimension(expr.exp, dim_map)
        
        # 지수부가 변수/차원을 가지는 경우 (예: x^t) 에러 발생
        if exp_dim != sp.S.One and not isinstance(exp_dim, sp.Symbol):
            raise ValueError(f"거듭제곱의 지수(Exponent)는 무차원이어야 합니다. 현재 지수부의 차원: ${sp.latex(exp_dim)}$")
        
        return sp.simplify(base_dim ** expr.exp)
        
    # 5. 덧셈/뺄셈 (모든 항의 차원이 완벽히 동일해야 함!)
    elif isinstance(expr, sp.Add):
        dims = [_get_dimension(arg, dim_map) for arg in expr.args]
        first_dim = dims[0]
        
        for i, d in enumerate(dims[1:], 1):
            # 차원의 비가 1이 아니라면 불일치 (예: L / (L/T) != 1)
            if sp.simplify(first_dim / d) != 1:
                term1 = sp.latex(expr.args[0])
                term2 = sp.latex(expr.args[i])
                raise ValueError(
                    f"차원 불일치(덧셈/뺄셈): '{term1}'의 차원은 ${sp.latex(first_dim)}$ 이지만, "
                    f"'{term2}'의 차원은 ${sp.latex(d)}$ 입니다."
                )
        return first_dim
        
    # 6. 미분 및 적분 (Calculus)
    elif isinstance(expr, sp.Derivative):
        # d(f) / dx -> dim(f) / dim(x)
        dim_func = _get_dimension(expr.expr, dim_map)
        dim_vars = sp.S.One
        for var, count in expr.variable_count:
            dim_vars *= _get_dimension(var, dim_map) ** count
        return sp.simplify(dim_func / dim_vars)
        
    elif isinstance(expr, sp.Integral):
        # int f dx -> dim(f) * dim(x)
        dim_func = _get_dimension(expr.function, dim_map)
        dim_vars = sp.S.One
        for var, _ in expr.limits:
            dim_vars *= _get_dimension(var, dim_map)
        return sp.simplify(dim_func * dim_vars)
        
    # 7. 초월함수 (sin, cos, exp, log 등)
    elif isinstance(expr, sp.Function):
        # 초월함수의 내부 인자는 반드시 무차원이어야 함 (예: sin(x)에서 x가 길이면 오류)
        arg_dim = _get_dimension(expr.args[0], dim_map)
        if sp.simplify(arg_dim) != sp.S.One and not isinstance(arg_dim, sp.Symbol):
            func_name = expr.func.__name__
            raise ValueError(fr"초월함수(\\{func_name})의 인자는 무차원이어야 합니다. 현재 인자 차원: ${sp.latex(arg_dim)}$")
        return sp.S.One
        
    # 방정식 형태 (LHS = RHS)
    elif isinstance(expr, sp.Eq):
        lhs_dim = _get_dimension(expr.lhs, dim_map)
        rhs_dim = _get_dimension(expr.rhs, dim_map)
        if sp.simplify(lhs_dim / rhs_dim) != 1:
            raise ValueError(
                f"방정식 차원 불일치: 좌변(LHS)의 차원은 ${sp.latex(lhs_dim)}$ 이고, "
                f"우변(RHS)의 차원은 ${sp.latex(rhs_dim)}$ 입니다."
            )
        return lhs_dim
        
    return sp.S.One

# ---------------------------------------------------------------------------
# [3] 유저 커스텀 매핑 파서 및 메인 핸들러
# ---------------------------------------------------------------------------

def _parse_custom_dims(parallels: list) -> Dict[str, sp.Expr]:
    """
    유저가 입력한 커스텀 차원 설정을 파싱합니다.
    예: / set=v:L/T, R:L
    """
    custom_map = STANDARD_DIM_MAP.copy()
    
    set_opt = next((p for p in parallels if p.startswith('set=')), None)
    if set_opt:
        raw_map = set_opt.replace('set=', '').strip()
        pairs = raw_map.split(',')
        for pair in pairs:
            if ':' in pair:
                var_name, dim_str = pair.split(':')
                var_name = var_name.strip()
                # 간단한 M, L, T 문자열을 심볼로 변환
                try:
                    # 안전을 위해 미리 정의된 기호(M, L, T, I, Theta)만 eval 허용
                    allowed_locals = {'M': M, 'L': L, 'T': T_dim, 'I': I, 'Theta': Theta}
                    dim_expr = sp.sympify(dim_str.strip(), locals=allowed_locals)
                    custom_map[var_name] = dim_expr
                except Exception:
                    continue
    return custom_map

def handle_dimcheck(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    calc > dimcheck 커맨드의 메인 라우터 진입점 (main.py에서 호출됨)
    """
    raw_latex = params.get("rawSelection", "").strip()
    parallels = params.get("parallelOptions",[])
    
    if not raw_latex:
        raise ValueError("검사할 수식이 선택되지 않았습니다.")
        
    try:
        # 1. LaTeX -> SymPy AST 변환
        expr = latex2sympy(raw_latex)
        
        # 2. 커스텀 차원 맵핑 생성
        dim_map = _parse_custom_dims(parallels)
        
        # 3. 차원 검사 수행
        final_dim = _get_dimension(expr, dim_map)
        
        # 4. 성공 응답 생성 (수식 위에 % 주석으로 검사 통과 및 최종 차원 삽입)
        # 무차원인 경우 '1' 대신 'Dimensionless'로 표기
        dim_latex = "Dimensionless" if final_dim == sp.S.One else sp.latex(final_dim)
        
        res_latex = f"% [DimCheck Passed] Dimension: ${dim_latex}$\n{raw_latex}"
        
        return {
            "latex": res_latex,
            "html_preview": f"<div style='color: green;'>✅ 차원 검사 통과 (Dimension: {dim_latex})</div>"
        }
        
    except ValueError as ve:
        # 차원 불일치 또는 파싱 에러 발생 시
        error_msg = str(ve)
        res_latex = f"% [DimCheck Error] {error_msg}\n{raw_latex}"
        
        return {
            "latex": res_latex,
            "html_preview": f"<div style='color: red;'>❌ <b>차원 검사 실패:</b><br/>{error_msg}</div>",
            "error": {
                "code": 400,
                "message": "Dimension Mismatch",
                "details": error_msg
            }
        }
    except Exception as e:
        raise RuntimeError(f"차원 검사 중 알 수 없는 오류 발생: {str(e)}")
