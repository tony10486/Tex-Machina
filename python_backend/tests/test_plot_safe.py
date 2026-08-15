"""plot_engine 보안 테스트: eval 기반 parse_expr 샌드박스 이스케이프(RCE) 회귀 방지.

과거 plot_engine._safe_latex_parse 는 latex2sympy 실패 시
SAFE_SYMPY_DICT = {'__builtins__': {}} + 전 sympy 속성을 global_dict 로 넘긴
parse_expr 폴백을 사용했다. 이 dict 는 속성 접근(().__class__... 체인)을 막지 못해
임의 명령 실행이 가능했다 (CVE 패턴: __subclasses__() 로 system 찾기).
이 테스트는 해당 경로가 제거되었고, 실패 시 한국어 ValueError 를 던지는지 검증한다.
"""
import os

import pytest

import plot_engine
from utils import safe_parse_expr

# 실공격 페이로드 — 실제 실행되면 안 되므로 여기서는 "호출하면 반드시 예외"만 검증한다.
RCE_PAYLOAD = "().__class__.__mro__[1].__subclasses__()[166].__init__.__globals__['system']('touch /tmp/pwned')"


@pytest.fixture(autouse=True)
def _clean_pwn_file():
    """테스트 전/후 /tmp/pwned 파일이 존재하지 않음을 보장한다."""
    path = "/tmp/pwned"
    if os.path.exists(path):
        os.remove(path)
    yield
    if os.path.exists(path):
        os.remove(path)


def test_rce_payload_raises_and_does_not_execute():
    """RCE 페이로드는 ValueError 를 던지며 /tmp/pwned 를 생성하지 않아야 한다."""
    with pytest.raises(ValueError):
        plot_engine._safe_latex_parse(RCE_PAYLOAD)
    assert not os.path.exists("/tmp/pwned"), "페이로드가 실행되어 파일이 생성되었습니다!"


def test_rce_payload_error_message_is_korean():
    """에러 메시지는 한국어여야 한다."""
    with pytest.raises(ValueError, match="수식을 해석할 수 없습니다"):
        plot_engine._safe_latex_parse(RCE_PAYLOAD)


def test_python_pow_expr_graceful():
    """'x**2 + 1' 은 파싱되거나 한국어 ValueError 를 던져야 한다.

    원래는 이 입력이 eval 기반 폴백으로 파싱됐지만 이제 해당 경로가 없다.
    latex2sympy/sympy parse_latex 가 처리하면 성공, 실패해도 날것 AttributeError
    같은 게 아니라 한국어 ValueError 여야 한다.
    """
    try:
        expr = plot_engine._safe_latex_parse("x**2 + 1")
        # 파싱 성공 시 sympy 표현식이어야 한다
        assert expr is not None
    except ValueError as e:
        assert "수식을 해석할 수 없습니다" in str(e)


def test_sin_latex_parses_to_sympy_expr():
    """r'\sin(x)' 는 정상적으로 sympy 표현식으로 파싱되어야 한다."""
    expr = plot_engine._safe_latex_parse(r"\sin(x)")
    import sympy as sp
    assert isinstance(expr, sp.Expr)
    assert expr.free_symbols == {sp.Symbol('x')}


def test_numeric_bounds_still_parse():
    """플롯 범위(bounds) 파싱은 safe_parse_expr 를 거쳐 숫자로 파싱되어야 한다."""
    assert float(safe_parse_expr('3.5', evaluate=False).evalf()) == 3.5
    assert float(safe_parse_expr('-3', evaluate=False).evalf()) == -3.0


def test_no_eval_fallback_path_remains():
    """plot_engine 소스에 사용자 입력을 받는 eval 기반 parse_expr 폴백이 남아있지 않아야 한다."""
    import inspect
    src = inspect.getsource(plot_engine)
    # SAFE_SYMPY_DICT 전역 딕셔너리 구성이 제거되어야 한다
    assert "SAFE_SYMPY_DICT = {'__builtins__': {}}" not in src
    # plot_engine 내부에서 parse_expr 를 직접 import 해서 쓰는 경로가 없어야 한다
    assert "from sympy.parsing.sympy_parser import parse_expr" not in src
