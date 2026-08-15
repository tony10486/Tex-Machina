r"""수식 정확성 회귀 테스트: \mathrm/\text LaTeX 정규화 검증.

parse_latex 는 \mathrm{...} / \text{...} / \operatorname{...} 를 Symbol 곱으로
잘못 파싱한다 (예: \int x \, \mathrm{d}x -> Integral(x*(mathrm*(d*x)), x)).
latex_normalize.normalize_latex_preparse 가 parse_latex 직전에 이를 제거하므로
정상적인 수학 결과가 나와야 한다.
"""
import json
import re

import pytest

import calc_engine


def _calc(raw_selection: str, sub_commands=None):
    """execute_calc 호출 헬퍼 — 결과 JSON 문자열 반환."""
    return calc_engine.execute_calc(json.dumps({
        'mainCommand': 'calc',
        'subCommands': sub_commands or ['calc'],
        'rawSelection': raw_selection,
        'config': {},
        'requestId': 'test',
    }))


def test_mathrm_dx_parses():
    r"""\int x \, \mathrm{d}x 는 x^2/2 로 계산되어야 한다 (Symbol 곱 버그 방지)."""
    result = json.loads(_calc(r'\int x \, \mathrm{d}x'))
    assert result['status'] == 'success'
    assert r'\frac{x^{2}}{2}' in result['latex']
    assert 'mathrm' not in result['latex']


def test_text_const_parses():
    r"""x \cdot \text{const} 는 const*x 로 계산되어야 한다 (Symbol 곱 버그 방지)."""
    result = json.loads(_calc(r'x \cdot \text{const}'))
    assert result['status'] == 'success'
    # Symbol 곱이 아니라 단일 상수 곱이어야 함 (const 는 단일 Symbol)
    assert result['latex'].strip() == 'const x'
    assert set(result['vars']) == {'x', 'const'}


def test_mathrm_normalize_unit():
    r"""normalize_latex_preparse 단위 테스트: \mathrm{d} 및 \mathit 치환 처리."""
    from latex_normalize import normalize_latex_preparse

    assert normalize_latex_preparse(r'\mathrm{d}') == 'd'
    assert normalize_latex_preparse(r'\mathrm{d }') == 'd'
    assert normalize_latex_preparse(r'\mathrm{const}') == r'\mathit{const}'
    assert normalize_latex_preparse(r'\text{const}') == r'\mathit{const}'
    assert normalize_latex_preparse(r'\operatorname{div}') == r'\mathit{div}'
    # 나머지는 그대로 보존
    assert normalize_latex_preparse(r'\int x \, dx') == r'\int x \, dx'
    assert normalize_latex_preparse(r'\frac{\sin(x)}{x}') == r'\frac{\sin(x)}{x}'


def test_no_regression_frac_sin_x():
    r"""기존 경로 회귀 방지: \frac{\sin(x)}{x} 미분은 그대로 동작해야 한다."""
    result = json.loads(_calc(r'\frac{\sin(x)}{x}', ['diff', 'x']))
    assert result['status'] == 'success'
    # 출력 LaTeX 을 다시 파싱해 수학적으로 sin(x)/x 의 도함수와 일치하는지 확인
    # (문자열 형태는 sympy 버전에 따라 \cos{\left(x \right)} 등으로 달라질 수 있음)
    import sympy as sp
    from sympy.parsing.latex import parse_latex

    assert sp.simplify(
        parse_latex(result['latex']) - sp.diff(parse_latex(r'\frac{\sin(x)}{x}'), sp.Symbol('x'))
    ) == 0


# ---------------------------------------------------------------------------
# num_solve 수치해석 초기조건 정확성 (t0 ≠ 0 버그 회귀 테스트)
# ---------------------------------------------------------------------------

def _y_values(latex: str) -> dict:
    """'y(5.0) \\approx 1.0 \\\\ y(1.0) \\approx 0.0184' 형태에서 (t -> y) 매핑 추출."""
    return {float(m.group(1)): float(m.group(2))
            for m in re.finditer(r"y\((-?[\d.]+)\)\s*\\approx\s*(-?[\d.]+)", latex)}


def test_num_solve_ic_t0_not_zero():
    """ic=y(5):1, t_span=0,1 → y'=y 의 해는 y(t)=e^{t-5} 계열 (y(1) ≈ e^{-4} ≈ 0.0183).

    기존 버그: IC의 t0(5)를 무시하고 t_span[0]=0에서 y(0)=1로 적분하여
    y(1)≈2.7183 을 반환했다. 수정 후에는 t0에서 시작하는 (역방향) 적분이어야 한다.
    """
    result = json.loads(_calc(r"y' = y", ['num_solve', 'ic=y(5):1', 't_span=0,1']))
    assert result['status'] == 'success'
    assert 0.015 < _y_values(result['latex'])[1.0] < 0.022  # e^{-4} ≈ 0.0183


def test_num_solve_ic_t0_zero_no_regression():
    """ic=y(0):1 (t_span 기본값) → e^t 계열, y(10) ≈ e^{10} ≈ 22026 으로 유지되어야 한다."""
    result = json.loads(_calc(r"y' = y", ['num_solve', 'ic=y(0):1']))
    assert result['status'] == 'success'
    assert _y_values(result['latex'])[10.0] > 15000


def test_num_solve_second_order_multi_ic():
    """2계 다중 IC: y''=-y, ic=y(0):1,y'(0):0 → cos(t), y(3) ≈ -0.99."""
    result = json.loads(_calc(r"y'' = -y", ['num_solve', "ic=y(0):1,y'(0):0", 't_span=0,3']))
    assert result['status'] == 'success'
    assert -1.05 < _y_values(result['latex'])[3.0] < -0.9


def test_num_solve_duplicate_ic_error():
    """중복 IC (y(0):1,y(0):2) 는 오류 응답이어야 한다 (조용한 무시 금지)."""
    result = json.loads(_calc(r"y' = y", ['num_solve', 'ic=y(0):1,y(0):2']))
    assert result['status'] == 'error'
    assert '중복된 초기조건' in result['message']


def test_num_solve_unparseable_ic_error():
    """파싱 불가 IC 는 오류 응답이어야 한다 (조용한 무시 금지)."""
    result = json.loads(_calc(r"y' = y", ['num_solve', 'ic=foo']))
    assert result['status'] == 'error'
    assert '초기조건 형식이 올바르지 않습니다' in result['message']


def test_num_solve_too_many_ics_error():
    """IC 3개 이상은 오류 응답이어야 한다."""
    result = json.loads(_calc(r"y'' = -y", ['num_solve', "ic=y(0):1,y'(0):0,y''(0):0"]))
    assert result['status'] == 'error'
    assert '최대 2개의 초기조건' in result['message']


# ---------------------------------------------------------------------------
# ODE 독립 변수 휴리스틱 (함수 호출 인자 오인 버그 회귀 테스트)
# ---------------------------------------------------------------------------

def test_ode_indep_var_excludes_func_args():
    r"""ODE 독립 변수 휴리스틱이 함수 호출 인자(e^{-y} 의 y)를 독립 변수로 오인하면 안 된다.

    y' = x e^{-y} 의 독립 변수는 y(함수 인자)가 아니라 x(자유 변수)여야 한다.
    과거 버그: \cos(y) 인자에서 y를 독립 변수로 잘못 추출해 y(y) 형태로 풀렸음.
    (P11 이후 dsolve 실패 시 status:error 를 반환하므로, 이 회귀 테스트는
    실재로 풀리는 분리 가능형 방정식으로 검증한다.)
    """
    result = json.loads(_calc(r"y' = x e^{-y}", ['ode']))
    assert result['status'] == 'success'
    # y(x) 형태로 구성되어야 하고, y(y) 는 절대 나타나면 안 된다
    assert r'y{\left(x \right)}' in result['latex']
    assert r'y{\left(y \right)}' not in result['latex']


def test_ode_indep_var_prime():
    """프라임 표기 y'' + y = 0 은 기본 독립 변수 x 로 풀려야 한다 (회귀 방지)."""
    result = json.loads(_calc(r"y'' + y = 0", ['ode']))
    assert result['status'] == 'success'
    assert r'y{\left(x \right)} = C_{1} \sin{\left(x \right)} + C_{2} \cos{\left(x \right)}' in result['latex']


def test_ode_indep_var_frac():
    r"""\frac{dy}{dx} 표기는 분모의 변수(x)를 독립 변수로 사용해야 한다."""
    result = json.loads(_calc(r'\frac{dy}{dx} - y = \cos(x)', ['ode']))
    assert result['status'] == 'success'
    assert r'y{\left(x \right)} = C_{1} e^{x}' in result['latex']


# ---------------------------------------------------------------------------
# 그리스 문자/상수 변환 (parse_latex 가 Symbol('pi') 로 파싱하는 버그 회귀 테스트)
# ---------------------------------------------------------------------------

def test_pi_constant_parses():
    r"""\int_0^\pi \sin(x)\,dx 는 2 여야 한다 (Symbol('pi') 버그: 1 - \cos(pi)).

    parse_latex 는 \pi 를 sp.pi 가 아닌 Symbol('pi') 로 파싱하므로 적분이
    계산되지 않고 남는다. convert_sympy_constants 가 Symbol('pi')→sp.pi 로
    변환한 뒤 적분해야 정답 2 가 나온다.
    """
    result = json.loads(_calc(r'\int_{0}^{\pi} \sin(x) \, dx'))
    assert result['status'] == 'success'
    assert result['latex'] == '2'


def test_sin_pi_is_zero():
    r"""\sin(\pi) 는 0 이어야 한다 (Symbol('pi') 버그: sin(pi) 그대로 남음)."""
    result = json.loads(_calc(r'\sin(\pi)', ['eval']))
    assert result['status'] == 'success'
    assert result['latex'] == '0'


def test_imaginary_unit_gate():
    r"""e^{i\pi} 는 imaginaryUnit 설정 시 -1, 미설정(기본) 시 기호식으로 남아야 한다.

    'i'→sp.I 변환은 config.imaginaryUnit 이 참일 때만 적용된다 (게이트).
    게이트가 꺼져 있으면 사용자의 i 변수를 허수로 오인해 -1 을 조용히
    만들면 안 된다.
    """
    def run(config):
        return json.loads(calc_engine.execute_calc(json.dumps({
            'mainCommand': 'calc',
            'subCommands': ['eval'],
            'rawSelection': r'e^{i \pi}',
            'config': config,
            'requestId': 'test-iu',
        })))

    on = run({'imaginaryUnit': True})
    assert on['status'] == 'success'
    assert on['latex'] == '-1.0'

    off = run({})
    assert off['status'] == 'success'
    assert off['latex'] == r'e^{\pi i}'
    assert 'i' in off['vars']
