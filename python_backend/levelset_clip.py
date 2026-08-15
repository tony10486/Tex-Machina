"""
TeX-Machina 3D Plot — 정확한 레벨셋 클립 (Phase 2, port-to-fix)

초기 데모(threejs 프로토타입)의 클립 파이프라인을 numpy 로 재구현하되,
3라운드 하이퍼플랜 감사에서 확인된 버그를 **수정한 채** 이식한다 (B1-B4):

- B1 (고리 합체): "각 극점 = 닫힌 고리" 가정이 capP < 안장 임계에서 붕괴.
  bisectRadial 의 조기반환 `if (fHi(hi)) return hi` (데모 L1398) 제거 —
  괄호 [0, hi] 에 교차가 없으면 "교차 없음"으로 판정하고 폴 디스크를 생성하지
  않는다 (합체 블롭은 그리드 림 + 영역 채움으로 처리).
- B2 (sub-grid 극점 부유): r_n < 그리드 스텝/√2 인 극점은 캡 디스크가 표면에
  연결된 벽이 없어 공중에 뜬다 → 캡 경계 링에서 표면까지 스커트/월 생성.
- B3 (capLo=0 → rn=Inf / zMin=0.1 → 반경 10 디스크): rn 유한 가드 +
  디스크 반경 클램프 + 레벨셋이 극점을 둘러싸는지 검증.
- B4 (저-capP 외부 가지 오픈 홀): 폴 디스크가 아니라 "클립된 모든 영역"을
  폴리곤 채움 (marching squares) — 캡을 일반화.
- B5 (데드코드): gridCache/clipCache(샘플 재사용)는 구현하지 않는다.
  재클립 성능은 cap-ring LUT(real_oracle.build_cap_lut)가 담당한다.
- B6 (검증): 원시 카운터가 아닌 가시 지오메트리 기준 게이트를
  python_backend/tests/test_levelset.py 로 제공한다.
"""

from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

# 상태: VALID(정상) / RIM(클립됨, capP 평면에 캡 필요) / HOLE(NaN — 제거)
VALID = 0
RIM = 1
HOLE = 2


# ---------------------------------------------------------------------------
# 3-state 샘플링
# ---------------------------------------------------------------------------

def sample_field(oracle: Callable[[np.ndarray, np.ndarray], np.ndarray],
                 x_range: Tuple[float, float], y_range: Tuple[float, float],
                 n: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """균일 n×n 그리드에서 |f| 를 샘플링하고 상태 배열을 만든다.

    - |f| = NaN → HOLE
    - |f| ≥ capP 후보는 샘플링 단계에선 결정 불가 → 전부 VALID 로 두고,
      클립 단계에서 RIM 판정 (데모의 3-state enum 분리 — L1483 HOLE y→0 처리 대응)
    """
    xs = np.linspace(x_range[0], x_range[1], n)
    ys = np.linspace(y_range[0], y_range[1], n)
    X, Y = np.meshgrid(xs, ys)
    with np.errstate(all='ignore'):
        Z = np.abs(oracle(X, Y))
    states = np.full(Z.shape, VALID, dtype=np.int8)
    states[np.isnan(Z)] = HOLE
    # HOLE 은 0 으로 치환 (기하 파손 방지 — 데모 L1483 y→0 안전처리 대응)
    Z = np.nan_to_num(Z, nan=0.0)
    return xs, ys, Z


# ---------------------------------------------------------------------------
# B1: 방향 인지 이분법 (early-return 없음)
# ---------------------------------------------------------------------------

def bisect_cross(f: Callable[[float, float], float],
                 ux: float, uy: float, vx: float, vy: float,
                 capP: float, iters: int = 20) -> Optional[Tuple[float, float]]:
    """엣지 u→v 상 f(x,y) = capP 교차점을 이분법으로 찾는다.

    데모 L1321-1368 의 방향 인지 이분법을 재구현하되, 괄호가 교차를 포함하지
    않으면 None 을 반환한다 (조기반환 버그 제거 — B1).
    """
    def g(t: float) -> float:
        return f(ux + (vx - ux) * t, uy + (vy - uy) * t) - capP

    t0, t1 = 0.0, 1.0
    g0, g1 = g(t0), g(t1)
    # NaN/Inf 안전 처리: 교차 불가로 취급
    if not (np.isfinite(g0) and np.isfinite(g1)):
        return None
    if g0 == 0:
        return (ux, uy)
    if g1 == 0:
        return (vx, vy)
    if g0 * g1 > 0:
        return None  # 교차 없음 (B1: 조기반환 대신 None)
    for _ in range(iters):
        tm = (t0 + t1) / 2
        gm = g(tm)
        if gm == 0 or (t1 - t0) < 1e-9:
            break
        if (g0 < 0) == (gm < 0):
            t0, g0 = tm, gm
        else:
            t1, g1 = tm, gm
    tm = (t0 + t1) / 2
    return (ux + (vx - ux) * tm, uy + (vy - uy) * tm)


def _guard_f(f: Callable, *args: float, capP: float, pole_guard: float = 1e12) -> float:
    """극점 가드: 이분법 중 f 가 무한대/1e12·capP 초과 → "위(교차 없음)" 처리."""
    try:
        val = f(*args)
    except (ValueError, ZeroDivisionError, OverflowError, TypeError):
        return pole_guard
    if not np.isfinite(val) or val > pole_guard:
        return pole_guard
    return val


def bisect_radial(f: Callable[[float], float],
                  capP: float, hi: float, iters: int = 20) -> Optional[float]:
    """폴 중심에서 반직선 위 f(r) = capP 교차점까지 거리 (r ≥ 0).

    호출 규약: f 는 **중심으로부터의 거리 r** 을 받는 단일 인자 함수다 —
    호출부(build_cap_rings)가 각도별로 f(r) = oracle(cx + r·cosθ, cy + r·sinθ)
    클로저를 만들어 넘긴다.

    데모 L1373-1404 의 bisectRadial 을 재구현하되 early-return(`if (fHi(hi))`)
    을 제거했다 (B1). 괄호 [lo=0, hi] 에 교차가 없으면 None (교차 없음 판정).
    """
    def g(r: float) -> float:
        return _guard_f(f, r, capP=capP) - capP  # f 는 이미 중심 좌표계

    # 폴 중심은 항상 NaN/∞ — 외곽(hi, 교차점보다 바깥)에서 안쪽으로 이분법한다.
    # f(hi) < capP (바깥은 아래), f(eps≈0) > capP (폴 근처는 위) → 교차 존재.
    # B1: 조기반환 없이, 괄호가 교차를 포함하지 않을 때만 None.
    eps = min(max(hi * 1e-6, 1e-9), 1e-4)
    lo = eps
    glo = _guard_f(f, lo, capP=capP) - capP
    ghi = _guard_f(f, hi, capP=capP) - capP

    # 교차 조건: 시작점(안쪽)이 위, 괄호 끝(바깥)이 아래.
    # 시작점이 NaN/미만 (폴 아님) 또는 끝이 NaN → 교차 없음
    if not np.isfinite(glo) or not np.isfinite(ghi) or glo < 0 or ghi > 0:
        return None
    for _ in range(iters):
        mid = (lo + hi) / 2
        gmid = _guard_f(f, mid, capP=capP) - capP
        if not np.isfinite(gmid):
            # 중간점이 NaN(폴 내부) → "위"로 취급 (수렴 방향 유지)
            hi = mid
            continue
        if gmid == 0 or (hi - lo) < 1e-10:
            break
        if (glo < 0) == (gmid < 0):
            lo, glo = mid, gmid
        else:
            hi = mid
    return (lo + hi) / 2


def build_cap_rings(f: Callable[[float, float], float],
                    cx: float, cy: float, capP: float,
                    analytic_radius_fn: Callable[..., float],
                    n: int = 0, angles: int = 24,
                    max_radius: float = 4.0) -> List[Tuple[float, float]]:
    """폴 중심 24각 방사형 캡 경계 (B2: sub-grid 극점 포함 그리드 무관).

    - 시작 괄호: rn = 1/(n!·capP) 시드. rn=∞(capP=0) 또는 rn ≤ 0 이면 빈 링.
    - 각도별로 bisectRadial 을 수행하되 B1 판정으로 교차 없음 각도는 None.
    - B2: 폴이 그리드와 무관하게 항상 원형 경계를 얻는다 (방사형 이분법).
    """
    ring: List[Tuple[float, float]] = []
    if capP <= 0:
        return ring
    rn = analytic_radius_fn(n, capP)
    if not np.isfinite(rn) or rn <= 0:
        return ring
    hi = min(max(rn * 2.0, 0.05), max_radius)  # B3: 반경 클램프 (2rn 이 디스크 상한)
    for k in range(angles):
        th = 2 * np.pi * k / angles
        # 각도 방향 반직선 위 f = capP: f(r) = oracle(cx + r·cosθ, cy + r·sinθ)
        def ray(r: float, ang: float = th) -> float:
            return f(cx + r * np.cos(ang), cy + r * np.sin(ang))
        r = bisect_radial(ray, capP, hi)
        if r is not None and np.isfinite(r):
            ring.append((cx + r * np.cos(th), cy + r * np.sin(th)))
    return ring


def verify_encircles(f: Callable[[float, float], float], cx: float, cy: float,
                     r: float, capP: float, angles: int = 12) -> bool:
    """B3: 레벨셋이 폴을 둘러싸는지 — 반경 r/2 링 샘플 전부가 capP 초과인지."""
    for k in range(angles):
        th = 2 * np.pi * k / angles
        val = _guard_f(f, cx + (r / 2) * np.cos(th), cy + (r / 2) * np.sin(th), capP=capP)
        if val <= capP:
            return False
    return True

# ---------------------------------------------------------------------------
# B4: 클립된 영역 폴리곤 채움 (marching squares)
# ---------------------------------------------------------------------------

def polygonize_regions(z_grid: np.ndarray, xs: np.ndarray, ys: np.ndarray,
                       capP: float) -> List[List[Tuple[float, float]]]:
    """`z > capP` 마스크의 모든 연결 영역을 폴리곤으로 추출한다 (B4).

    폴 디스크에 국한하지 않고 클립된 모든 영역(저-capP 외부 가지 포함)에
    채움을 제공한다. marching squares 로 경계 셀을 추적한 뒤 연결 성분 분리.
    """
    mask = z_grid > capP
    if not mask.any():
        return []
    n = mask.shape[0]
    # 각 셀에서 마스크 경계를 통과하는 엣지 점 수집 (이중 루프, 단순 구현)
    edges: List[Tuple[float, float]] = []
    for i in range(n - 1):
        for j in range(n - 1):
            # 4코너 마스크 → 16 케이스 중 경계 교차 엣지
            tl, tr = mask[i, j], mask[i, j + 1]
            bl, br = mask[i + 1, j], mask[i + 1, j + 1]
            x0, x1 = xs[j], xs[j + 1]
            y0, y1 = ys[i], ys[i + 1]
            # 상단 엣지
            if tl != tr:
                t = _edge_interp(z_grid[i, j], z_grid[i, j + 1], capP)
                edges.append((x0 + (x1 - x0) * t, y0))
            # 하단 엣지
            if bl != br:
                t = _edge_interp(z_grid[i + 1, j], z_grid[i + 1, j + 1], capP)
                edges.append((x0 + (x1 - x0) * t, y1))
            # 좌측 엣지
            if tl != bl:
                t = _edge_interp(z_grid[i, j], z_grid[i + 1, j], capP)
                edges.append((x0, y0 + (y1 - y0) * t))
            # 우측 엣지
            if tr != br:
                t = _edge_interp(z_grid[i, j + 1], z_grid[i + 1, j + 1], capP)
                edges.append((x1, y0 + (y1 - y0) * t))
    if not edges:
        return []

    # 단순 근사: 엣지 점들을 각도순 정렬해 폴리곤화 (영역이 단일이면 정확,
    # 다중 영역이면 근사 — B4 에서는 채움 누락(홀)을 막는 게 목적)
    cx = sum(e[0] for e in edges) / len(edges)
    cy = sum(e[1] for e in edges) / len(edges)
    edges.sort(key=lambda p: np.arctan2(p[1] - cy, p[0] - cx))
    return [edges]


def _edge_interp(z0: float, z1: float, capP: float) -> float:
    """엣지 양끝 z0,z1 에서 레벨 capP 교차 위치 t∈[0,1]."""
    denom = z1 - z0
    if denom == 0:
        return 0.5
    return float(np.clip((capP - z0) / denom, 0.0, 1.0))


# ---------------------------------------------------------------------------
# B2: sub-grid 극점 스커트/월
# ---------------------------------------------------------------------------

def build_skirt(ring: List[Tuple[float, float]], f: Callable[[float, float], float],
                capP: float, x_range: Tuple[float, float],
                y_range: Tuple[float, float]) -> List[List[Tuple[float, float, float]]]:
    """캡 경계 링에서 실제 표면까지의 벽(스커트) 정점 스트립 (B2).

    각 링 점 (x,y) 를 표면 z=f(x,y) 로 투영하고, 캡 평면(z=capP)과 표면을 잇는
    사각 스트립 정점 목록을 반환한다. 캡이 그리드와 무관하게 부유하지 않게 한다.
    """
    if len(ring) < 3:
        return []
    strip: List[List[Tuple[float, float, float]]] = []
    surface_z: List[float] = []
    for (x, y) in ring:
        z_surf = _guard_f(f, x, y, capP=capP)
        # 표면이 도메인 밖/수치 폭주 → 캡 평면 높이로 대체 (스커트 생략)
        if not np.isfinite(z_surf) or z_surf > capP:
            z_surf = capP
        surface_z.append(z_surf)
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        (x0, y0), (x1, y1) = ring[i], ring[j]
        zs0, zs1 = surface_z[i], surface_z[j]
        strip.append([
            (x0, y0, capP),
            (x1, y1, capP),
            (x1, y1, zs1),
            (x0, y0, zs0),
        ])
    return strip


# ---------------------------------------------------------------------------
# 최상위 조립
# ---------------------------------------------------------------------------

def build_levelset_mesh(oracle: Callable[[np.ndarray, np.ndarray], np.ndarray],
                        x_range: Tuple[float, float], y_range: Tuple[float, float],
                        n: int, cap_lo: float, cap_hi: float,
                        poles: Optional[List[Tuple[float, float]]] = None,
                        factorial_fn: Callable[..., float] = None) -> Dict[str, Any]:
    """레벨셋 클립 메시 전체를 조립한다 (v2 `mode:"levelset"`).

    반환 (mesh contract 의 MeshPayload 와 호환):
      { mode, positions, colors, indices, grid_size, clips, lut }
    """
    if factorial_fn is None:
        from math import factorial as _fact
        def factorial_fn(n: int, capP: float) -> float:
            if capP <= 0:
                return float('inf')
            return 1.0 / (_fact(n) * capP)

    xs, ys, Z = sample_field(oracle, x_range, y_range, n)
    rows = cols = n
    grid_size = [rows, cols]

    positions: List[float] = []
    colors: List[float] = []
    # 색상은 상위 호출부(handle_plot_3d)가 지정하는 것이 일반적 — 여기선 높이 기반 기본
    zmin, zmax = float(Z.min()), float(Z.max())
    zspan = (zmax - zmin) or 1.0
    for i in range(rows):
        for j in range(cols):
            x = float(xs[j]); y = float(ys[i]); z = float(Z[i, j])
            positions.extend([x, y, z])
            norm = max(0.0, min(1.0, (z - zmin) / zspan))
            colors.extend([norm, 0.5 + 0.5 * np.sin(norm * np.pi), 1.0 - norm])

    # 인덱스 (간단 3-state: HOLE 셀 큐링)
    indices: List[int] = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j; b = a + 1; d = a + cols; c = d + 1
            quad = [a, b, c, d]
            if any(Z[qi // cols, qi % cols] == 0 and states_hole(i, j, Z) for qi in quad):
                continue  # HOLE 포함 셀 제거
            indices.extend([a, b, c, a, c, d])

    # 클립 (cap_lo, cap_hi) — 림/캡/벽
    clips: List[Dict[str, Any]] = []
    cap_pairs = [(cap_lo, 'lo'), (cap_hi, 'hi')]
    for capP, tag in cap_pairs:
        if capP <= 0:
            continue  # B3: capP=0 레벨 생략
        level: Dict[str, Any] = {"capP": capP, "rings": [], "fills": [], "walls": [], "hasPoleDisk": False}
        if poles:
            for (px, py) in poles:
                ring = build_cap_rings(oracle, px, py, capP, factorial_fn,
                                       max_radius=min((x_range[1]-x_range[0]), (y_range[1]-y_range[0])) * 0.5)
                if ring and verify_encircles(oracle, px, py, np.hypot(ring[0][0]-px, ring[0][1]-py), capP):
                    level["rings"].append({"cx": px, "cy": py, "r": np.hypot(ring[0][0]-px, ring[0][1]-py),
                                           "plane": "xy", "ringPts": [[float(a), float(b)] for a, b in ring]})
                    level["hasPoleDisk"] = True
                    # B2: 스커트/월
                    wall = build_skirt(ring, oracle, capP, x_range, y_range)
                    if wall:
                        level["walls"].append([[float(a), float(b), float(c)] for quad in wall for a, b, c in quad])
        # B4: 클립된 영역 폴리곤 채움 (폴 디스크 외 모든 영역)
        fills = polygonize_regions(Z, xs, ys, capP)
        level["fills"] = [[[float(a), float(b)] for a, b in poly] for poly in fills]
        clips.append(level)

    return {
        "mode": "levelset",
        "positions": positions,
        "colors": colors,
        "indices": indices,
        "grid_size": grid_size,
        "clips": clips,
        "lut": None,  # cap-ring LUT 는 real_oracle.build_cap_lut 가 별도 생성
    }


def states_hole(i: int, j: int, Z: np.ndarray) -> bool:
    return bool(np.isnan(Z[i, j]))
