"""LaTeX 사전 파싱 정규화 모듈.

WHY (이 모듈이 필요한 이유):
    sympy.parsing.latex.parse_latex (sympy 1.14) 의 문법에는
    `\mathrm{...}` / `\text{...}` / `\operatorname{...}` 토큰이 없다.
    미지 명령어는 함수 호출처럼 취급되어 명령어 이름과 인자의 각 글자가
    각각 Symbol 곱으로 파싱된다.
    예: `\int x \, \mathrm{d}x` 는 Integral(x*(mathrm*(d*x)), x) 로 파싱되어
    `\frac{d \mathrm{x}^{3}}{3}` 같은 쓰레기 결과를 낸다 (정답은 x^2/2).
    `x \cdot \text{const}` 도 x·text·c·o·n·s·t 의 Symbol 곱이 된다.
    한편 괄호를 완전히 벗겨내도(예: `const`) parse_latex 는 다글자 단어를
    글자별 Symbol 곱으로 쪼개므로, 유일하게 단일 Symbol 을 보장하는 문법
    토큰 `\mathit{...}` 로 치환한다. `\mathrm{d}` 는 미분 기호 표기이므로
    특수 규칙으로 먼저 `d` 로 벗겨낸다 (parse_latex 의 미분 처리 활용).

WHEN (언제 실행해야 하는가):
    normalize_latex_preparse() 는 반드시 parse_latex() 호출 직전에 실행해야
    하며, \left(...\right) → (...) 형태의 기존 정규화 이후에 실행한다.
    텍스트 레벨에서 \mathrm/\text/\operatorname 를 \mathit 로 치환하여
    parse_latex 가 이를 Symbol 곱으로 오해하지 않게 한다.
"""

import re

import sympy as sp

# \mathrm{d} -> d  (\mathrm{d} 와 \mathrm{d } 모두 처리 — 미분 기호 표기)
_MATHRM_D_RE = re.compile(r'\\mathrm\{\s*d\s*\}')
# \mathrm{...} -> \mathit{...}  (\mathit 는 parse_latex 가 단일 Symbol 로 변환)
_MATHRM_RE = re.compile(r'\\mathrm\{([^{}]*)\}')
# \text{...} -> \mathit{...}
_TEXT_RE = re.compile(r'\\text\{([^{}]*)\}')
# \operatorname{...} -> \mathit{...}
_OPERATORNAME_RE = re.compile(r'\\operatorname\{([^{}]*)\}')


def normalize_latex_preparse(raw: str) -> str:
    """parse_latex 직전에 실행하는 LaTeX 정규화.

    - \\mathrm{d} -> d (공백 포함, 예: \\mathrm{d } 도 처리)
    - \\mathrm{...} -> \\mathit{...}
    - \\text{...} -> \\mathit{...}
    - \\operatorname{...} -> \\mathit{...}

    그 외의 모든 입력은 바이트 단위로 그대로 보존한다.
    중첩 중괄호(예: \\mathrm{\\frac{1}{2}})는 다루지 않는다 — 실제 수식에서
    \\mathrm/\\text 는 단일 단순 인자를 받는 경우가 압도적으로 많으며,
    재귀 파서를 도입하는 것보다 단순 정규식이 안전하다.
    """
    result = _MATHRM_D_RE.sub('d', raw)
    result = _MATHRM_RE.sub(r'\\mathit{\1}', result)
    result = _TEXT_RE.sub(r'\\mathit{\1}', result)
    result = _OPERATORNAME_RE.sub(r'\\mathit{\1}', result)
    return result


# parse_latex 결과의 Symbol → SymPy 상수 변환 후보 (이름 → sp 속성명)
# sympy 1.14 에서 sp.alpha 같은 속성은 존재하지 않고, sp.beta/sp.gamma/sp.zeta 는
# 함수 클래스이므로, 아래 테이블에 있어도 실제 상수(sp.Basic 인스턴스)만 변환된다.
_CONSTANT_CANDIDATES = {
    'pi': 'pi', 'alpha': 'alpha', 'beta': 'beta', 'gamma': 'gamma',
    'delta': 'delta', 'epsilon': 'epsilon', 'zeta': 'zeta', 'eta': 'eta',
    'theta': 'theta', 'iota': 'iota', 'kappa': 'kappa', 'lambda': 'lambda_',
    'mu': 'mu', 'nu': 'nu', 'xi': 'xi', 'omicron': 'omicron', 'rho': 'rho',
    'sigma': 'sigma', 'tau': 'tau', 'upsilon': 'upsilon', 'phi': 'phi',
    'chi': 'chi', 'psi': 'psi', 'omega': 'omega',
    'Delta': 'Delta', 'Gamma': 'Gamma', 'Theta': 'Theta', 'Lambda': 'Lambda',
    'Xi': 'Xi', 'Pi': 'Pi', 'Sigma': 'Sigma', 'Phi': 'Phi', 'Psi': 'Psi',
    'Omega': 'Omega', 'e': 'E',
}


def _build_constant_table(imaginary_unit: bool) -> dict:
    """변환 테이블 구성 (호출마다 새로 만들어 원본 표현식을 건드리지 않음).

    - getattr(sp, attr) 이 실제 sp.Basic 인스턴스(숫자/기호)일 때만 등록한다.
      sp.beta/sp.gamma/sp.zeta/sp.Lambda 는 FunctionClass 이므로 자동 제외되고,
      sympy 1.14 에 존재하지 않는 속성(alpha, Delta, ...)도 제외된다.
    - sp.Pi 는 sympy 1.14 에 없으므로 'Pi'(대문자 파이)는 sp.pi 로 매핑한다.
    - imaginary_unit=True 일 때만 'i' → sp.I 를 등록한다 (허수 단위 게이트).
    """
    table = {}
    for name, attr in _CONSTANT_CANDIDATES.items():
        const = getattr(sp, attr, None)
        if const is not None and isinstance(const, sp.Basic):
            table[name] = const
    if 'Pi' not in table and hasattr(sp, 'pi'):
        table['Pi'] = sp.pi
    if imaginary_unit:
        const_i = getattr(sp, 'I', None)
        if const_i is not None and isinstance(const_i, sp.Basic):
            table['i'] = const_i
    return table


def convert_sympy_constants(expr, imaginary_unit: bool = False):
    """parse_latex 결과의 그리스 문자/상수 Symbol 을 SymPy 상수로 변환.

    WHY: sympy.parsing.latex.parse_latex (sympy 1.14) 는 `\\pi` 를 sp.pi 가 아닌
    Symbol('pi') 로 파싱한다. Symbol('pi') 는 3.14159... 와 다른 객체이므로
    `\\int_0^\\pi \\sin(x)\\,dx` 가 2 대신 `1 - \\cos(pi)` 로 남고,
    `\\sin(\\pi)` 도 0 으로 계산되지 않는다.

    HOW: expr.free_symbols 를 순회하며 이름이 상수 테이블에 있으면
    expr.subs 로 대체한다 (replace 가 아닌 subs — 함수 규칙과의 충돌 회피).
    그리스 문자(alpha, theta, ...)는 sympy 에서 어차피 변수이므로 테이블에
    실제 상수가 없으면 그대로 둔다. 'e' → sp.E 는 기존 동작을 유지하고,
    'i' → sp.I 는 imaginary_unit=True 일 때만 적용한다.
    """
    table = _build_constant_table(imaginary_unit)
    if not table:
        return expr
    for sym in list(expr.free_symbols):
        const = table.get(sym.name)
        if const is not None and sym != const:
            expr = expr.subs(sym, const)
    return expr

