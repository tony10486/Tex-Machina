/**
 * TeX-Machina 3D Plot — cap-ring LUT 재클립 (v2, Phase 2)
 * ---------------------------------------------------------
 * Z 드래그 시 Python IPC 왕복 없이 µs-ms 재클립을 수행한다 (adversary 생존 기여).
 *
 * 원칙:
 * - Python 이 사전 계산한 cap-ring LUT(real_oracle.build_cap_lut)와 **실제 샘플링된
 *   z 그리드**만 사용한다. f(x,y) 평가 금지 — bilinear interpolation 오라클은
 *   하이퍼플랜에서 기각됨 (sub-grid 극점을 보간으로 잡을 수 없음).
 * - "재클립" = 그리드 엣지의 z=capP 교차점(실제 샘플 선형 보간) + LUT 링 선택.
 */

/** 그리드 엣지에서 z = capP 교차점을 찾는다 (행/열 방향, 실제 샘플 선형 보간). */
export function gridRimCrossings(
    z: number[],
    gridSize: [number, number],
    capP: number,
): { x: number; y: number; z: number }[] {
    const [rows, cols] = gridSize;
    const pts: { x: number; y: number; z: number }[] = [];
    // 셀 좌표는 정규화 [0..1] — 실제 좌표는 상위에서 스케일링 필요 (여기선 인덱스 기반)
    for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
            const a = i * cols + j;        // (i, j)
            const b = a + 1;               // (i, j+1)
            const c = a + cols;            // (i+1, j)
            // 수평 엣지 (i,j)-(i,j+1)
            const za = z[a], zb = z[b];
            if (Math.min(za, zb) < capP && Math.max(za, zb) > capP) {
                const t = (capP - za) / (zb - za);
                pts.push({ x: j + t, y: i, z: capP });
            }
            // 수직 엣지 (i,j)-(i+1,j)
            const zc = z[c];
            if (Math.min(za, zc) < capP && Math.max(za, zc) > capP) {
                const t = (capP - za) / (zc - za);
                pts.push({ x: j, y: i + t, z: capP });
            }
        }
    }
    return pts;
}

/** LUT 레벨에서 capP 에 가장 가까운 링 집합을 선택한다 (폴별 24각 좌표). */
export function pickNearestRings(
    lut: { levels: number[]; rings: [number, number][][][] },
    capP: number,
): [number, number][][] | null {
    if (!lut || !lut.levels.length) return null;
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < lut.levels.length; k++) {
        const d = Math.abs(lut.levels[k] - capP);
        if (d < bestDist) { bestDist = d; best = k; }
    }
    // 선택한 레벨에 폴 링이 실제로 있는지 (없으면 null → 그리드 림만 사용)
    const rings = lut.rings[best];
    if (!rings || rings.length === 0) return null;
    return rings;
}

/** 재클립 결과 — 표면 그리드 림 교차점 + LUT 캡 링 (v2 렌더러가 소비). */
export interface ReclipResult {
    capP: number;
    rimPoints: { x: number; y: number; z: number }[];
    capRings: [number, number][][];
}
