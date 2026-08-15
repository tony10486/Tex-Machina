"""
TeX-Machina 3D Plot — 실함수 오라클 + 극점/안장 분석 (Phase 2)

레벨셋 클립(levelset_clip.py)의 수치 기반이다. 원칙 (mesh contract):
- Python (sympy lambdify) 이 유일한 안전한 임의-LaTeX 평가자.
- 이 모듈은 |f(x,y)| (또는 복소 abs_phase 의 |w|) 를 numpy ufunc 로 만든 뒤
  극점 후보, 안장 임계값, cap-ring LUT 를 계산한다.

B1 (고리 합체) 근거:
  |Γ(-0.5, 0)| = 2√π ≈ 3.5449 가 극점 0 과 -1 사이 안장값이다.
  capP > max(안장) 이면 각 극점의 레벨셋이 분리된 닫힌 고리,
  capP < max(안장) 이면 이웃 극점의 고리가 합체(블롭)된다.
"""

from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import sympy as sp

# ---------------------------------------------------------------------------
# 오라클 생성
# ---------------------------------------------------------------------------

def make_oracle(expr: sp.Expr, var_list: List[sp.Symbol],
                modules: Optional[list] = None) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """|f(x,y)| numpy ufunc. 임의 LaTeX → SymPy expr → lambdify.

    복소 표현식(|w|): expr 에 sp.I 가 있으면 np.abs(lambdify 결과) 를 감싼다.
    modules 미지정 시 plot_engine 의 기존 람디파이 관례(numpy+scipy)를 따른다.
    """
    if modules is None:
        modules = ['numpy', 'scipy']
    f = sp.lambdify(var_list, expr, modules=modules)
    if expr.has(sp.I):
        def oracle(x: np.ndarray, y: np.ndarray) -> np.ndarray:
            w = f(x, y)
            with np.errstate(all='ignore'):
                return np.abs(np.asarray(w, dtype=np.complex128))
        return oracle

    def oracle(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        with np.errstate(all='ignore'):
            return np.abs(np.asarray(f(x, y), dtype=np.float64))
    return oracle


def phase_oracle(expr: sp.Expr, var_list: List[sp.Symbol]) -> Optional[Callable[[np.ndarray, np.ndarray], np.ndarray]]:
    """복소 위상 arg(w)/(2π) mod 1 — v3 abs_phase 컬러링용. 실함수면 None."""
    if not expr.has(sp.I):
        return None
    f = sp.lambdify(var_list, expr, modules=['numpy', 'scipy'])
    def phase(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        w = np.asarray(f(x, y), dtype=np.complex128)
        with np.errstate(all='ignore'):
            return (np.angle(w) / (2 * np.pi)) % 1.0
    return phase


# ---------------------------------------------------------------------------
# 극점/안장 분석
# ---------------------------------------------------------------------------

def detect_poles(oracle: Callable[[np.ndarray, np.ndarray], np.ndarray],
                 x_range: Tuple[float, float], y_range: Tuple[float, float],
                 grid: int = 100) -> List[Tuple[float, float]]:
    """조악 그리드에서 |f| 폭발(+부호 스캔)로 극점 씨앗을 찾는다.

    감마 같은 특수함수는 극점이 사전에 알려져 있지만, 일반 함수용 휴리스틱이다.
    - 도메인 **내부** 정점만 검사 (경계 오인 방지).
    - |f| 가 매우 커지는 정점을 8-이웃(2칸) 대비 폭발 비율로 판정.
    """
    xs = np.linspace(x_range[0], x_range[1], grid)
    ys = np.linspace(y_range[0], y_range[1], grid)
    X, Y = np.meshgrid(xs, ys)
    with np.errstate(all='ignore'):
        Z = np.abs(oracle(X, Y))
    Z = np.nan_to_num(Z, nan=0.0, posinf=1e30, neginf=0.0)

    # 내부 정점 기준 (경계 제외) — 경계의 큰 값은 도메인 밖 영향일 수 있음
    inner = Z[1:-1, 1:-1]
    threshold = max(float(inner.max()) * 0.5, 1e3)
    poles: List[Tuple[float, float]] = []
    seen: List[Tuple[int, int]] = []
    for i in range(2, grid - 2):
        for j in range(2, grid - 2):
            z = Z[i, j]
            if z < threshold:
                continue
            if any(abs(i - si) <= 2 and abs(j - sj) <= 2 for si, sj in seen):
                continue
            nb = max(Z[i-2:i+3, j-2:j+3].max(), 1.0)
            if z > nb * 20:
                poles.append((float(xs[j]), float(ys[i])))
                seen.append((i, j))
    return poles


def known_poles_for_expr(expr: sp.Expr, x_range: Tuple[float, float],
                         y_range: Tuple[float, float]) -> List[Tuple[float, float]]:
    """특수함수의 사전 알려진 극점 (감마: z = 0, -1, -2, ... 실수축).

    detect_poles(수치 스캔)가 그리드 정렬에 의존해 폴 축(y=0)을 놓칠 수 있으므로,
    해석적으로 알려진 폴을 먼저 반환한다. 일반 함수는 빈 목록 (detect_poles 사용).
    """
    poles: List[Tuple[float, float]] = []
    # 감마 함수 (sp.gamma): 단순 극점 z = 0, -1, -2, ...
    if expr.has(sp.gamma):
        start = int(np.floor(x_range[0]))
        end = int(np.ceil(x_range[1]))
        for n in range(start, end + 1):
            if n <= 0 and x_range[0] <= n <= x_range[1] and y_range[0] <= 0 <= y_range[1]:
                poles.append((float(n), 0.0))
    return poles


def inter_pole_saddle(oracle: Callable[[np.ndarray, np.ndarray], np.ndarray],
                      p1: Tuple[float, float], p2: Tuple[float, float],
                      samples: int = 400) -> float:
    """두 극점 사이 선분 위 |f| 의 최소값 = 안장 근사.

    B1 판정의 핵심: capP 가 이 값보다 크면 두 고리가 분리, 작으면 합체.
    """
    ts = np.linspace(0.0, 1.0, samples)
    xs = p1[0] + (p2[0] - p1[0]) * ts
    ys = p1[1] + (p2[1] - p1[1]) * ts
    with np.errstate(all='ignore'):
        vals = np.abs(oracle(xs, ys))
    vals = np.nan_to_num(vals, nan=np.inf, posinf=np.inf, neginf=np.inf)
    return float(np.min(vals))


def compute_saddle_thresholds(oracle: Callable[[np.ndarray, np.ndarray], np.ndarray],
                              poles: List[Tuple[float, float]]) -> Dict[int, float]:
    """극점 i 의 안장 임계 = 인접 극점(유클리드 최근접)과의 inter-pole saddle."""
    saddles: Dict[int, float] = {}
    for i, p in enumerate(poles):
        best_d = float('inf')
        best_saddle = float('inf')
        for j, q in enumerate(poles):
            if i == j:
                continue
            d = np.hypot(p[0] - q[0], p[1] - q[1])
            if d < best_d:
                best_d = d
                best_saddle = inter_pole_saddle(oracle, p, q)
        saddles[i] = best_saddle
    return saddles


def analytic_radius(n: int, capP: float, factorial: Optional[float] = None) -> float:
    """해석적 캡 반경 r_n = 1/(n!·capP) (잔류값 신원 — 괄호 시드/오라클용).

    capP=0 이면 ∞ (호출부가 유한 가드 처리). n! 은 math.factorial 대신 전달 가능.
    """
    if capP <= 0:
        return float('inf')
    from math import factorial as _factorial
    if factorial is None:
        factorial = float(_factorial(n))
    return 1.0 / (factorial * capP)


# ---------------------------------------------------------------------------
# cap-ring LUT (adversary 생존 기여 — Z 드래그 µs-ms 재클립용)
# ---------------------------------------------------------------------------

def build_cap_lut(expr: sp.Expr, var_list: List[sp.Symbol],
                  poles: List[Tuple[float, float]],
                  levels: Optional[List[float]] = None) -> Dict[str, Any]:
    """capP 레벨별 정확한 캡 링 좌표 LUT.

    반환 (mesh contract 의 CapLut):
      { "levels": [capP, ...],
        "rings": [ [ [ [x,y], ... 24각 ], ... 극점별 ], ... 레벨별 ] }
    계산은 levelset_clip.build_caps 의 방사형 이분법 결과를 재사용한다.
    (모듈 순환 방지를 위해 여기서는 레벨/폴 목록만 담는 셸을 만들고,
     실재 계산은 levelset_clip.build_cap_rings 에 위임한다.)
    """
    from levelset_clip import build_cap_rings  # 지연 import (순환 방지)
    if levels is None:
        levels = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
    oracle = make_oracle(expr, var_list)
    rings_per_level: List[List[List[Tuple[float, float]]]] = []
    for capP in levels:
        level_rings: List[List[Tuple[float, float]]] = []
        for (px, py) in poles:
            ring = build_cap_rings(oracle, px, py, capP,
                                   lambda n, cp=capP: analytic_radius(n, cp))
            level_rings.append(ring)
        rings_per_level.append(level_rings)
    return {
        "levels": levels,
        "rings": rings_per_level,
    }
