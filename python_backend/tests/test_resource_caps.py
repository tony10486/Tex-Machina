# -*- coding: utf-8 -*-
"""
리소스 캡(resource cap) 검증 테스트.

과도한 요청이 계산 서버를 영구적으로 멈추게(백엔드 웨지) 하는 것을 방지하는
캡들이 제대로 동작하는지 검증한다:
  - 미분 차수(d^N) 캡
  - 테일러 급수 차수 캡
  - 행렬 크기 캡
  - 플롯 샘플 수 캡
  - 서버 입력 줄 길이 캡
"""
import json
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calc_engine
import server


def _run(req: dict) -> dict:
    """execute_calc를 통해 요청을 보내고 JSON 응답을 dict로 반환."""
    return json.loads(calc_engine.execute_calc(json.dumps(req)))


def test_dn_exponent_cap_fast():
    """d^9999999 형태는 오류를 빠르게(<2s) 반환해야 하며 10MB 문자열을 만들면 안 된다."""
    t0 = time.time()
    res = _run({
        'mainCommand': 'calc',
        'subCommands': ['ode'],
        'rawSelection': r'\frac{d^9999999y}{dx^9999999}',
        'config': {},
        'requestId': 'w1',
    })
    elapsed = time.time() - t0
    assert res['status'] == 'error'
    assert '미분 차수가 너무 큽니다' in res['message']
    assert elapsed < 2.0, f"캡 적용에 {elapsed:.2f}s 소요 (2s 초과)"


def test_taylor_order_cap():
    """테일러 차수 1000은 오류를 반환해야 한다."""
    res = _run({
        'mainCommand': 'calc',
        'subCommands': ['taylor', '1000'],
        'rawSelection': 'e^x',
        'config': {},
        'requestId': 'w2',
    })
    assert res['status'] == 'error'
    assert '테일러 급수 차수는 100을 초과할 수 없습니다' in res['message']


def test_matrix_size_cap():
    """999999x999999 행렬은 오류를 반환해야 한다."""
    res = _run({
        'mainCommand': 'calc',
        'subCommands': ['matrix', '999999x999999'],
        'parallelOptions': [],
        'rawSelection': '',
        'config': {},
        'requestId': 'w3',
    })
    assert res['status'] == 'error'
    assert '행렬 크기는 500×500을 초과할 수 없습니다' in res['message']


def test_plot_samples_cap():
    """samples=1000000000 플롯은 오류를 반환해야 한다."""
    res = _run({
        'mainCommand': 'plot',
        'subCommands': ['2d'],
        'parallelOptions': ['samples=1000000000'],
        'rawSelection': r'\sin(x)',
        'config': {},
        'requestId': 'w4',
    })
    assert res['status'] == 'error'
    assert '샘플 수가 너무 큽니다' in res['message']


def test_line_length_cap():
    """1MB를 초과하는 입력 줄은 거부되어야 한다 (json.loads 이전에 차단)."""
    long_line = 'x' * (server.MAX_LINE_LENGTH + 1)
    assert server.is_line_too_long(long_line) is True
    assert server.is_line_too_long('x' * server.MAX_LINE_LENGTH) is False
