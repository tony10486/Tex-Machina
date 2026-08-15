/**
 * TeX-Machina 3D Plot — Mesh Contract
 * ------------------------------------
 * Python 백엔드(`python_backend/plot_engine.py`의 `handle_plot_3d`)가 웹뷰 Three.js 렌더러로
 * 전송하는 메시 데이터의 단일 스키마(단일 진실 원천).
 *
 * 원칙:
 * - **Python(문서 없이 lambdify)이 유일한 안전한 임의-LaTeX 평가자.** JS는 이 스키마에 담긴
 *   데이터만 소비하며 `f(x,y)`를 절대 평가하지 않는다 (eval/인터프리터 금지 — CSP/보안).
 * - v1 = `mode:"flat"` (오늘의 x3dom과 동일한 플랫 클립 메시, 무회귀).
 *   v2 = `mode:"levelset"` (정확한 레벨셋 클립: 림/캡/벽 + cap-ring LUT).
 * - 색상은 Python이 정점마다 계산해 전송 (컬러 스킴/복소 위상 포함).
 *
 * 버전 히스토리:
 * - v1.0 (2026-08-15): flat 모드 스키마 고정. x3d_data.points/colors + webview의
 *   quad-strip 인덱스 생성을 대체.
 * - v2 (예정): clips[] (capP 레벨별 링/채움/벽) + lut (cap-ring LUT) + mode:"levelset".
 * - v3 (예정): complex.phase (abs_phase 위상 컬러, 림/캡 정점 위상색).
 */

/** 정점 위치/색상은 [x,y,z]|[r,g,b] 평면 배열 (Float32Array 호환) */
export type FloatTriple = [number, number, number];

/** 도메인 범위 */
export interface PlotRange {
    x: [number, number];
    y: [number, number];
    z: [number, number];
}

/** 축 라벨/스타일 */
export interface AxesConfig {
    style: 'cross' | 'arrows' | 'box' | 'none';
    labels: { x: string; y: string; z: string; font: string };
}

/** v2: capP 레벨의 캡 링 하나 (Python 실함수 이분법으로 계산된 정확한 경계) */
export interface CapRing {
    /** 폴 중심 (도메인 좌표) */
    cx: number;
    cy: number;
    /** 해석적 r_n = 1/(n!·capP) — 괄호 시드/검증 오라클 값 */
    r: number;
    /** 캡 평면: 'xy' (z=capP 평면) */
    plane: 'xy';
    /** 24각 방사형 이분법 결과 경계점 [x,y] 목록 */
    ringPts: FloatTriple[];
    /** 경계점별 RGB (v3: 복소 위상 컬러) */
    ringColors: FloatTriple[];
}

/** v2: clip 레벨 (capP 하나)의 캡 구조 전체 */
export interface ClipSet {
    /** 레벨셋 값 (예: capP=6) */
    capP: number;
    /** 폴 디스크 캡 링 (B1: 고리 영역 내일 때만 존재) */
    rings: CapRing[];
    /** 클립된 영역 채움 폴리곤 (B4: 폴 디스크 외 모든 클립 영역 포함) */
    fills: FloatTriple[][];
    /** 캡 경계에서 표면까지의 벽 (B2: sub-grid 극점용) — [x,y,z] 스트립 */
    walls: FloatTriple[][];
    /** 폴 디스크 캡이 존재하는가 (B1 영역 판정 결과) */
    hasPoleDisk: boolean;
}

/** v2: cap-ring LUT — Z 드래그 시 IPC 없이 µs-ms 재클립을 위한 사전 계산 링 */
export interface CapLut {
    /** 캡 레벨 목록 (예: [3, 3.5, ..., 6]) */
    levels: number[];
    /** 레벨 인덱스 → 폴 인덱스 → 24각 링 좌표 [x,y] 목록 (Python real_oracle.build_cap_lut) */
    rings: [number, number][][][];
}

/** 메시 본체 (v1/v2 공통) */
export interface MeshPayload {
    /** 'flat' = 오늘의 플랫 클립 (v1) | 'levelset' = 정확한 레벨셋 클립 (v2) */
    mode: 'flat' | 'levelset';
    /** 정점 위치 [x,y,z, x,y,z, ...] */
    positions: number[];
    /** 정점 색상 [r,g,b, r,g,b, ...] (0..1) */
    colors: number[];
    /** 삼각형 인덱스 [i0,i1,i2, i3,i4,i5, ...] (strip 아님) */
    indices: number[];
    /** 그리드 크기 [rows, cols] — Z 드래그 재클립에 필요 */
    grid_size: [number, number];
    /** v2 전용: clip 레벨별 캡 구조 */
    clips?: ClipSet[];
    /** v2 전용: cap-ring LUT */
    lut?: CapLut;
    /** v3 전용: 정점별 위상 (abs_phase) */
    phase?: number[];
}

/** Python → 웹뷰 plot 메시 전체 페이로드 */
export interface Plot3DMeshPayload {
    /** LaTeX 표현 */
    expr: string;
    /** 그리드 크기 (호환) */
    grid_size: [number, number];
    ranges: PlotRange;
    /** 메시 본체 */
    mesh: MeshPayload;
    /** 축 설정 */
    axes: AxesConfig;
    bg_color: string;
    axis_style: 'cross' | 'arrows' | 'box' | 'none';
    color_scheme: string;
    preset_name?: string;
    complex_mode?: string;
}
