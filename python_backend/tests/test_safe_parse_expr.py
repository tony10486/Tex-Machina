# -*- coding: utf-8 -*-
"""
safe_parse_expr 보안 검증 테스트 (FAIL-CLOSED).

safe_parse_expr는 사용자 입력을 SymPy로 파싱하기 전에 AST 검증을 수행해야 하며,
sympy의 S 싱글턴(내부적으로 fresh globals eval → 실제 __builtins__ 주입)을 통한
샌드박스 탈출 페이로드는 반드시 ValueError로 거부되어야 한다.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sympy as sp

from calc_engine import is_valid_ic_value, parse_ics
from utils import safe_parse_expr

# ---------------------------------------------------------------------------
# S 싱글턴 탈출 페이로드 (FAIL-CLOSE)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("payload", [
    # S()는 sympify → 내부 eval에 fresh globals(실제 __builtins__)가 주입되는 탈출 벡터
    "S('chr(95)+chr(95)+chr(105)+chr(109)+chr(112)+chr(111)+chr(114)+chr(116)')",
    'S(\'open("/etc/hosts").read()\')',
    "S('os.system(\"id\")')",
    "S('chr(95)+chr(95)+chr(105)')",
])
def test_s_singleton_escape_blocked(payload):
    """S(...) 계열 페이로드는 반드시 ValueError (FAIL-CLOSE)."""
    with pytest.raises(ValueError):
        safe_parse_expr(payload)


# ---------------------------------------------------------------------------
# 런타임 조합 / 속성 접근 / 미허용 호출 페이로드 (FAIL-CLOSE)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("payload", [
    # 런타임 문자열 조합으로 부분문자열 블랙리스트('__', 'import') 우회 시도
    "chr(95)+chr(95)+chr(105)+chr(109)+chr(112)+chr(111)+chr(114)+chr(116)",
    # 속성 접근: 클래스 객체 → MRO → __subclasses__() 사슬
    "().__class__.__mro__[1].__subclasses__()",
    # 미허용 함수 호출
    'open("/etc/hosts").read()',
    "getattr(__builtins__, 'open')",
    "__import__('os').system('id')",
    # 람다 호출 (허용 목록에 없는 호출)
    "(lambda: 1)()",
])
def test_runtime_constructed_escape_blocked(payload):
    """AST 검증이 속성 접근·미허용 호출·비리터럴 인덱싱을 차단해야 한다."""
    with pytest.raises(ValueError):
        safe_parse_expr(payload)


# ---------------------------------------------------------------------------
# 정상 수학 표현식은 그대로 동작해야 한다 (회귀 방지)
# ---------------------------------------------------------------------------

def test_normal_math_expression():
    expr = safe_parse_expr('x**2 + 2*x + 1')
    # evaluate=False(기본값)로 unevaluated Add가 반환되므로 equals()로 수학적 동치 검증
    assert expr.equals(sp.sympify('x**2 + 2*x + 1'))


def test_matrix_constructor():
    """행렬 경로(calc_engine matrix path, matrix.py)가 의존하는 Matrix 생성자."""
    expr = safe_parse_expr('Matrix([[1,2],[3,4]])')
    assert expr == sp.Matrix([[1, 2], [3, 4]])


def test_math_function_calls_allowed():
    """기존 호출자가 사용하는 순수 SymPy 함수 호출은 허용."""
    assert safe_parse_expr('sin(x)') == sp.sin(sp.Symbol('x'))
    assert safe_parse_expr('Rational(1,2)') == sp.Rational(1, 2)
    assert safe_parse_expr('Symbol("x")') == sp.Symbol('x')
    assert safe_parse_expr('Eq(x, y)') == sp.Eq(sp.Symbol('x'), sp.Symbol('y'))


def test_parse_expr_callers_params():
    """taylor at= / int bounds / limit target / residue point 형식의 인자."""
    assert safe_parse_expr('0', evaluate=True) == 0
    assert safe_parse_expr('oo') == sp.oo
    assert safe_parse_expr('pi/2', evaluate=True) == sp.pi / 2
    assert safe_parse_expr('-1') == -1


def test_empty_and_whitespace():
    assert safe_parse_expr('') is None
    assert safe_parse_expr(None) is None


def test_local_dict_merge_preserved():
    """local_dict 병합 동작은 그대로 유지되어야 한다."""
    custom = {'alpha': sp.Symbol('alpha')}
    expr = safe_parse_expr('alpha + 1', local_dict=custom)
    assert expr.equals(sp.Symbol('alpha') + 1)


def test_s_absent_from_safe_dict():
    """S 싱글턴은 화이트리스트에서 제거되어야 한다."""
    from utils import SAFE_SYMPY_DICT
    assert 'S' not in SAFE_SYMPY_DICT


# ---------------------------------------------------------------------------
# ODE 인라인 IC 값 형식 검증 (parse_ics / is_valid_ic_value)
# ---------------------------------------------------------------------------

def test_ic_value_validation_accepts():
    """숫자 리터럴 / 단순 심볼 / 단순 거듭제곱은 허용."""
    for v in ['1', '2.5', '-3', '+4.', 'x', 'y', 'e^{-t}', 'a^2', 'x^{-1}', 'e^-t']:
        assert is_valid_ic_value(v), f"should be valid: {v!r}"


def test_ic_value_validation_rejects():
    """임의 코드 페이로드 및 복잡 표현식은 거부."""
    for v in ["S('chr(95)+chr(95)')", 'open(1)', 'chr(95)+chr(95)',
              'x/2', 'e^{-t/2}', '', '1/2']:
        assert not is_valid_ic_value(v), f"should be invalid: {v!r}"


def test_parse_ics_valid():
    y = sp.Function('y')(sp.Symbol('t'))
    t = sp.Symbol('t')
    ics = parse_ics('y(0):1,y\'(0):0', [y], t)
    assert len(ics) == 2


def test_parse_ics_malicious_rhs_raises():
    """검증되지 않은 RHS는 safe_parse_expr 진입 전에 차단된다."""
    y = sp.Function('y')(sp.Symbol('t'))
    t = sp.Symbol('t')
    with pytest.raises(ValueError):
        parse_ics("y(0):S('chr(95)+chr(95)+chr(105)')", [y], t)
    with pytest.raises(ValueError):
        parse_ics('y(0):open(1)', [y], t)
