"""공유 LaTeX→SymPy 변환 계층 (파서 중복 제거 + 보안 통합).

WHY (이 모듈이 필요한 이유):
    코드베이스에는 LaTeX→SymPy 변환 경로가 세 갈래로 나뉘어 있었다.
    1. calc_engine.py 메인/ODE 경로의 parse_latex 직접 호출
    2. plot_engine.py 의 latex2sympy(또는 parse_latex) 시도
    3. Matrix([...]) 문자열 → safe_parse_expr 경로
    파서가 분산되면 어느 한 경로에 보안 수정을 해도 다른 경로에 적용되지
    않았고 (H2), AGENTS.md §5("모든 Python 계산 입력은 safe_parse_expr
    화이트리스트 경로를 거쳐라")를 위반할 수 있었다.

HOW (동작 방식):
    latex_to_sympy() 는 다음 파이프라인을 항상 실행한다.
        1. normalize_latex_preparse  (latex_normalize.py — 다른 작업자의 모듈, 미변경)
        2. sympy.parsing.latex.parse_latex
        3. convert_sympy_constants   (latex_normalize.py — 그리스 문자/상수 변환)
        4. parse_latex 실패 시 safe_parse_expr(evaluate=False) 로 폴백
           (utils.py 의 AST 검증 화이트리스트 경로 — eval/exec 차단)
        5. 전부 실패하면 한국어 ValueError

    또한 lambdify 의 "자동 __builtins__ 주입" 푸트건을 차단한다.
    sympy.lambdify 는 생성 코드를 exec() 로 실행하는데, 네임스페이스에
    '__builtins__' 키가 없으면 CPython 이 실제 builtins 를 주입한다.
    결과적으로 수식에 UndefinedFunction('open')/('eval') 같은 이름이 있으면
    lambdify 코드가 진짜 open()/eval() 을 호출할 수 있었다.
    LAMBDIFY_SAFE_NAMESPACE 는 '__builtins__': {} 를 명시해 주입을 차단하고,
    수학 함수만 화이트리스트로 등록한다.
"""

import numpy as np
import sympy as sp
from sympy.parsing.latex import parse_latex

from latex_normalize import normalize_latex_preparse, convert_sympy_constants
from utils import safe_parse_expr


def latex_to_sympy(latex, *, imaginary_unit=False, for_plot=False):
    """LaTeX 문자열을 SymPy 표현식으로 안전하게 변환하는 단일 진입점.

    파이프라인: normalize_latex_preparse → parse_latex → convert_sympy_constants
    → (parse 실패 시) safe_parse_expr 화이트리스트 폴백 → 한국어 ValueError.

    - imaginary_unit=True: 'i' → sp.I 변환 (허수 단위 게이트)
    - for_plot=True: sp.Eq 결과를 lhs - rhs 로 변환 (plot_engine 관례)
      (기본 False: Eq 는 그대로 유지 — ODE/solve 경로가 Eq 를 명시적으로
      처리하므로 기존 동작을 보존한다)
    """
    if not isinstance(latex, str) or not latex.strip():
        raise ValueError("수식을 해석할 수 없습니다: 빈 입력입니다.")

    preprocessed = normalize_latex_preparse(latex.strip())
    try:
        expr = parse_latex(preprocessed)
    except Exception as e:
        # parse_latex 실패 → utils.safe_parse_expr (AST 검증 + __builtins__ 차단) 로 폴백.
        # eval 기반 parse_expr 폴백은 샌드박스 이스케이프 경로(RCE)이므로 절대 사용하지 않는다 (S2).
        try:
            expr = safe_parse_expr(preprocessed, evaluate=False)
            if expr is None:  # safe_parse_expr 은 빈 문자열에 대해 None 을 반환
                raise ValueError("빈 수식")
        except Exception:
            reason = str(e).strip().split('\n')[0][:120] if str(e).strip() else "알 수 없는 오류"
            raise ValueError(
                f"수식을 해석할 수 없습니다: {latex[:80]}. 상세: {reason}"
            )

    expr = convert_sympy_constants(expr, imaginary_unit=imaginary_unit)

    # 방정식(Eq)은 plot_engine 관례대로 좌변 - 우변으로 변환 (for_plot=True 일 때만)
    if for_plot and isinstance(expr, sp.Eq):
        return expr.lhs - expr.rhs
    return expr


# lambdify 닫힌 네임스페이스 (lambdify footgun 방지):
# - '__builtins__': {} 로 exec 자동 builtins 주입을 차단한다 (open/eval/exec/__import__ 차단).
# - 수식에 실제로 등장할 수 있는 수학 함수만 명시적으로 등록한다.
# - gamma/zeta 는 등록하지 않는다: scipy 모듈('numpy','scipy')이 있으면 scipy.special 로
#   해석되어 배열 입력이 지원되고, 없으면 sympy 의 자동 이름 주입으로 기존과 동일하게
#   동작하므로 호출부별 행동 변화가 없다.
LAMBDIFY_SAFE_NAMESPACE = {
    '__builtins__': {},
    # 삼각/역삼각
    'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
    'asin': np.arcsin, 'acos': np.arccos, 'atan': np.arctan, 'atan2': np.arctan2,
    'sinh': np.sinh, 'cosh': np.cosh, 'tanh': np.tanh,
    'asinh': np.arcsinh, 'acosh': np.arccosh, 'atanh': np.arctanh,
    # numpy 에 없는 함수는 역수 형태로 매핑 (기존: 스칼라 전용 sp 함수 → 배열 TypeError)
    'sec': lambda x: 1 / np.cos(x),
    'csc': lambda x: 1 / np.sin(x),
    'cot': lambda x: 1 / np.tan(x),
    'asec': lambda x: np.arccos(1 / x),
    'acsc': lambda x: np.arcsin(1 / x),
    'acot': lambda x: np.arctan(1 / x),
    # 지수/로그/기타
    'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
    'abs': np.abs, 'sign': np.sign,
    'floor': np.floor, 'ceiling': np.ceil,
    'Min': np.minimum, 'Max': np.maximum,
    # 상수
    'pi': np.pi, 'e': np.e, 'E': np.e,
}


def safe_lambdify(args, expr, modules=('numpy',), extra=None):
    """lambdify 래퍼: __builtins__ 자동 주입을 차단한 닫힌 네임스페이스를 사용한다.

    - modules: 기존과 동일한 모듈 이름 목록 ('numpy', 'scipy' 등)
    - extra: 호출부별 추가 함수 dict (예: plot 의 {'gamma': sp.gamma, 'zeta': sp.zeta})
    - LAMBDIFY_SAFE_NAMESPACE 를 마지막에 병합하므로 '__builtins__': {} 가 항상 유지된다.
    """
    namespace = dict(LAMBDIFY_SAFE_NAMESPACE)
    if extra:
        namespace.update(extra)
    return sp.lambdify(args, expr, modules=[*modules, namespace])
