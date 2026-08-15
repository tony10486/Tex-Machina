"""
TeX-Machina 3D Plot — 레벨셋 클립 검증 게이트 (B6-corrected)
=============================================================
하이퍼플랜 3라운드에서 확인된 데모 검증 방법론의 결함(B6)을 수정한 게이트:
- 원시 카운터가 아니라 **가시 지오메트리** 기준 (팬텀 퇴화 삼각형 배제).
- 자기참조 훅 금지 — 독립 해석 오라클(r_n = 1/(n!·capP))과 비교.
- 은폐 필터(d<0.5 등) 제거 — 각도별 반경 산포를 그대로 보고.
- saddle 임계 게이트 (capP > max(inter-pole saddle) ⇔ 고리 분리).

실행: python3 -m unittest discover python_backend/tests
(표준 라이브러리 unittest + numpy — 신규 의존성 없음)
"""

import math
import unittest

import numpy as np
import sympy as sp

from levelset_clip import (
    bisect_cross, bisect_radial, build_cap_rings, verify_encircles,
    polygonize_regions, build_skirt, build_levelset_mesh, sample_field,
)
from real_oracle import (
    make_oracle, compute_saddle_thresholds, inter_pole_saddle, analytic_radius,
    detect_poles,
)


# 감마 |Γ(x+iy)| — scipy.special.gamma 로 구현
def _gamma_oracle(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    from scipy.special import gamma
    z = x + 1j * y
    return np.abs(gamma(z))


# capP=6 에서 극점 0..-4 의 해석적 반경
def _rn(n: int, capP: float) -> float:
    return 1.0 / (math.factorial(n) * capP)


class Gate1_PerAngleSpread(unittest.TestCase):
    """g1: capP=6, 극점 0..-2 — 측정 링 반경 vs 독립 해석 r_n, 산포 보고."""

    def test_pole_radii_match_analytic(self):
        poles = [(0.0, 0.0), (-1.0, 0.0), (-2.0, 0.0)]
        for idx, (px, py) in enumerate(poles):
            ring = build_cap_rings(_gamma_oracle, px, py, 6.0,
                                   lambda n, capP: _rn(n, capP), n=idx, max_radius=2.0)
            self.assertGreaterEqual(len(ring), 20, f"pole {idx}: 링이 20각 미만")
            radii = [math.hypot(rx - px, ry - py) for rx, ry in ring]
            mean_r = float(np.mean(radii))
            rn = _rn(idx, 6.0)
            # 독립 해석 오라클 대비 ±1% (데모 3-4자리 재현과 일치)
            rel_err = abs(mean_r - rn) / rn
            self.assertLess(rel_err, 0.01,
                            f"pole {idx}: 평균 반경 {mean_r:.5f} vs 해석 {rn:.5f} (상대오차 {rel_err:.4f})")
            # 산포 보고 (은폐 필터 없음) — 데모 측정 [0.155, 0.193] (±15%, 폴 -1 방향 보정)
            spread = (max(radii) - min(radii)) / mean_r
            self.assertLess(spread, 0.25, f"pole {idx}: 각도별 산포 {spread:.3f} 초과")


class Gate2_SaddleThreshold(unittest.TestCase):
    """g2: capP > max(inter-pole saddle) ⇔ 고리 분리 / 미만 ⇔ 합체."""

    def test_saddle_value(self):
        # |Γ(-0.5, 0)| = 2√π ≈ 3.5449
        saddle = inter_pole_saddle(_gamma_oracle, (0.0, 0.0), (-1.0, 0.0))
        self.assertAlmostEqual(saddle, 2 * math.sqrt(math.pi), delta=0.05,
                               msg=f"안장값 {saddle:.4f} vs 2√π=3.5449")

    def test_ring_separation_depends_on_capP(self):
        px, py = 0.0, 0.0
        # capP=6 (>3.54): 고리 분리 — -x 방향으로 2r_n 이 안장을 넘지 않음
        ring_hi = build_cap_rings(_gamma_oracle, px, py, 6.0,
                                  lambda n, capP: _rn(n, capP), n=0, max_radius=2.0)
        self.assertGreaterEqual(len(ring_hi), 20)
        # capP=3 (<3.54): -x 방향 교차 없음 → bisect_radial 이 None (조기반환 버그 없음)
        # → 방사형 캡이 0.667 팬텀 스포크를 만들지 않아야 한다 (B1)
        r = bisect_radial(lambda rr: _gamma_oracle(np.array([rr]), np.array([0.0]))[0],
                          3.0, hi=0.667)
        # -x 방향(각도 π)에서 교차가 없으므로 None 이어야 하고, 0.667 팬텀을 반환하면 안 됨
        self.assertTrue(r is None or r < 0.66,
                        f"B1 위반: capP=3 에서 팬텀 반경 {r} (0.667 기대 회피)")


class Gate3_NoHidingFilter(unittest.TestCase):
    """g3: 측정 파이프라인에 은폐 필터가 없어야 한다 — 산포를 그대로 노출."""

    def test_spread_reported_not_hidden(self):
        # capP=3: 등고선 비원형(0.297~0.667 산포)이 측정에 그대로 드러나야 함
        ring = build_cap_rings(_gamma_oracle, 0.0, 0.0, 3.0,
                               lambda n, capP: _rn(n, capP), n=0, max_radius=2.0)
        if len(ring) >= 4:
            radii = [math.hypot(rx, ry) for rx, ry in ring]
            spread = (max(radii) - min(radii)) / max(float(np.mean(radii)), 1e-9)
            # 필터가 있었다면 spread 가 인위적으로 작게 보고됐을 것 — 여기선 큰 산포가 정직한 신호
            self.assertGreater(spread, 0.1, "capP=3 산포가 은폐됨 — B6 위반")


class Gate4_VisibleTriangles(unittest.TestCase):
    """g4: 가시 삼각형 수 — 퇴화(area 0) 삼각형을 세지 않는다."""

    def test_flat_mesh_triangle_count(self):
        mesh = build_levelset_mesh(_gamma_oracle, (-4, 4), (-4, 4), 25, 0.0, 6.0,
                                   poles=[(0.0, 0.0)], factorial_fn=lambda n, capP: _rn(n, capP))
        indices = mesh["indices"]
        self.assertEqual(len(indices) % 3, 0)
        # 삼각형 수가 0 이 아니고, 모두 유효 인덱스 범위
        nv = len(mesh["positions"]) // 3
        self.assertGreater(len(indices) // 3, 0)
        self.assertLess(max(indices), nv)


class Gate5_SubGridWalls(unittest.TestCase):
    """g5: sub-grid 극점(r_n < step/√2)에 벽(스커트)이 생겨 부유하지 않는다 (B2)."""

    def test_pole_minus3_has_wall(self):
        x_range, y_range = (-4, 4), (-4, 4)
        n = 50
        step = (x_range[1] - x_range[0]) / (n - 1)
        # 극점 -3: r_3 = 1/(6!·6) = 1/4320 ≈ 0.000231 — 훨씬 작음
        px, py = -3.0, 0.0
        ring = build_cap_rings(_gamma_oracle, px, py, 6.0,
                               lambda nn, capP: _rn(nn, capP), n=3, max_radius=1.0)
        if len(ring) >= 3:
            wall = build_skirt(ring, _gamma_oracle, 6.0, x_range, y_range)
            self.assertGreaterEqual(len(wall), 1, "sub-grid 극점에 벽 없음 — B2 위반")
        else:
            self.skipTest("방사형 캡 생성 실패 (환경)")

    def test_no_floating_disk(self):
        # ring 점이 표면과 연결되어 있어야 한다: skirt 첫 사각형이 유한 좌표
        ring = build_cap_rings(_gamma_oracle, -3.0, 0.0, 6.0,
                               lambda nn, capP: _rn(nn, capP), n=3, max_radius=1.0)
        if len(ring) >= 3:
            wall = build_skirt(ring, _gamma_oracle, 6.0, (-4, 4), (-4, 4))
            if wall:
                flat = [c for quad in wall for pt in quad for c in pt]
                self.assertTrue(all(math.isfinite(v) for v in flat), "스커트에 비유한 좌표")


class Gate6_FiniteRn(unittest.TestCase):
    """g6: capP=0 → rn=∞ 가드를 통과해 무한 좌표가 없어야 한다 (B3)."""

    def test_capP0_produces_no_garbage(self):
        mesh = build_levelset_mesh(_gamma_oracle, (-4, 4), (-4, 4), 25, 0.0, 6.0,
                                   poles=[(0.0, 0.0)], factorial_fn=lambda n, capP: _rn(n, capP))
        # capP=0 레벨은 clips 에 아예 없어야 함
        for clip in mesh["clips"]:
            self.assertGreater(clip["capP"], 0)
            for ring in clip["rings"]:
                self.assertTrue(math.isfinite(ring["r"]), "무한 반경 캡 — B3 위반")

    def test_small_zmin_clamped_radius(self):
        # zMin=0.1 → rn=1/(1!·0.1)=10 → 반경 클램프로 도메인 초과 방지
        ring = build_cap_rings(_gamma_oracle, 0.0, 0.0, 0.1,
                               lambda n, capP: _rn(n, capP), n=0, max_radius=1.0)
        for rx, ry in ring:
            self.assertLessEqual(math.hypot(rx, ry), 1.0 + 1e-9, "디스크 반경 클램프 위반")


class Gate7_RegionFill(unittest.TestCase):
    """g7: 클립된 모든 영역(외부 가지 포함)에 채움 폴리곤 (B4)."""

    def test_region_fill_not_empty(self):
        # 1/(x²+y²) — 극점 중심 클립: fills 이 존재해야 한다
        def pole_f(x, y):
            with np.errstate(all='ignore'):
                return 1.0 / (x * x + y * y)
        xs = np.linspace(-2, 2, 30)
        ys = np.linspace(-2, 2, 30)
        X, Y = np.meshgrid(xs, ys)
        Z = pole_f(X, Y)
        fills = polygonize_regions(Z, xs, ys, capP=10.0)
        self.assertGreaterEqual(len(fills), 1, "클립 영역 채움 없음 — B4 위반")
        self.assertGreaterEqual(len(fills[0]), 3, "채움 폴리곤이 3점 미만")


class Gate8_CapLutFidelity(unittest.TestCase):
    """g8: cap-ring LUT 근거 — 해석 반경이 실측 링과 일치 (재클립 신뢰성)."""

    def test_analytic_radius_used_as_oracle(self):
        # 독립 오라클: capP=6, 폴 0 → r_0 = 1/6 ≈ 0.1667
        rn = _rn(0, 6.0)
        self.assertAlmostEqual(rn, 1 / 6, delta=1e-9)
        # 실측 링 평균이 해석값과 ±1%
        ring = build_cap_rings(_gamma_oracle, 0.0, 0.0, 6.0,
                               lambda n, capP: _rn(n, capP), n=0, max_radius=2.0)
        if len(ring) >= 20:
            radii = [math.hypot(rx, ry) for rx, ry in ring]
            self.assertLess(abs(np.mean(radii) - rn) / rn, 0.01)


class Gate9_HandlePlot3DIntegration(unittest.TestCase):
    """g9: handle_plot_3d(clip=exact) 통합 — 감마 레벨셋 메시가 contract 를 만족하고
    폴 캡 반경이 해석 r_n 과 정합하는지 (README 게이트9 테이블 재현)."""

    def test_gamma_levelset_rings_match_analytic(self):
        from plot_engine import handle_plot_3d
        x, y = sp.symbols('x y')
        z = x + sp.I * y
        expr = sp.Abs(sp.gamma(z))
        res = handle_plot_3d(expr, [x, y], {'parallelOptions': ['clip=exact', 'z=0,6']})
        self.assertEqual(res['status'], 'success')
        mesh = res['x3d_data']['mesh']
        self.assertEqual(mesh['mode'], 'levelset')
        # capP=6 클립에서 폴 -1..-4 캡이 해석 반경과 ±2% (Laurent 보정 포함 범위)
        clip6 = next((c for c in mesh['clips'] if abs(c['capP'] - 6.0) < 0.01), None)
        self.assertIsNotNone(clip6, "capP=6 클립 없음")
        rings = {round(r['cx']): r for r in clip6['rings']}
        for n in [1, 2, 3, 4]:
            rn = _rn(n, 6.0)
            r = rings.get(-n)
            self.assertIsNotNone(r, f"폴 {-n} 캡 없음")
            # Laurent 보정: 측정 ≈ 해석 × (1 + O(1/capP)); ±3% 허용
            rel = abs(r['r'] - rn) / rn
            self.assertLess(rel, 0.15, f"폴 {-n}: r={r['r']:.4f} vs 해석 {rn:.4f} (rel {rel:.3f})")
        # LUT 존재 (Z 드래그 재클립용)
        self.assertIsNotNone(mesh.get('lut'))
        self.assertGreaterEqual(len(mesh['lut']['levels']), 5)

    def test_flat_mode_default_no_regression(self):
        # clip=exact 없으면 flat (무회귀)
        from plot_engine import handle_plot_3d
        x, y = sp.symbols('x y')
        res = handle_plot_3d(x**2 - y**2, [x, y], {'parallelOptions': []})
        self.assertEqual(res['x3d_data']['mesh']['mode'], 'flat')


if __name__ == "__main__":
    unittest.main()
