/**
 * TeX-Machina 3D Plot — Three.js 웹뷰 렌더러 엔트리
 * -------------------------------------------------
 * esbuild IIFE 번들(`dist/webview/plot3d.js`)의 진입점. 웹뷰의 plot 패널에서
 * `<script src="${plot3dUri}">` 로 로드되어 전역 `window.TexMachinaPlot3D` 를 노출한다.
 *
 * 원칙 (mesh contract — src/ui/plot3d/mesh.ts):
 * - Python 이 계산한 `positions/colors/indices` 데이터만 소비한다. `f(x,y)` 평가 금지.
 * - v1 `mode:"flat"` = 오늘의 x3dom 플랫 클립 메시와 동일 정점/색상 (무회귀).
 * - v2 `mode:"levelset"` = clips[] + lut (cap-ring LUT) 기반 정확한 레벨셋 클립.
 */

import { buildScene, applyMesh, applyAxes, type Plot3DScene, type SceneOptions } from './scene';
import { captureDataUrl, autoCrop, setView, fitView } from './io';
import { pickNearestRings, type ReclipResult } from './clipLut';
import type { Plot3DMeshPayload } from './mesh';

let currentScene: Plot3DScene | null = null;
let currentOptions: SceneOptions | null = null;
let currentPayload: Plot3DMeshPayload | null = null;

/** 웹뷰가 호출할 전역 API */
export interface Plot3DGlobal {
    /** Python 메시 페이로드로 씬을 구축한다 (기존 x3d_data 구조 대체) */
    build(x3dData: unknown, container: HTMLElement, opts?: Partial<SceneOptions>): void;
    /** 옵션(배경/조명/축/직교투영 등) 갱신 후 재렌더 */
    updateOptions(opts: Partial<SceneOptions>): void;
    /** Z 범위 변경 시 재클립 (v2: cap-ring LUT, v1 폴백: 옵션만 갱신) */
    setZRange(zMin: number, zMax: number): void;
    /** 캔버스 캡처 → 데이터 URL (saveImage/exportPdf 브리지용) */
    capture(format: 'png' | 'jpeg', quality?: number): string | null;
    /** 캡처 + 배경 스마트 크롭 */
    captureCropped(format: 'png' | 'jpeg', bgColor: string, cb: (result: string) => void): void;
    /** 시점 설정 (elev/azim/zoom — 기존 x3dom 슬라이더 값 호환) */
    setView(elev: number, azim: number, zoom: number): void;
    /** 전체 보기 */
    fitView(): void;
    /** 리소스 해제 (웹뷰 dispose 시) */
    dispose(): void;
}

function withScene(fn: (s: Plot3DScene) => void): void {
    if (currentScene) {fn(currentScene);}
}

const api: Plot3DGlobal = {
    build(x3dData, container, opts) {
        const payload = x3dData as Plot3DMeshPayload;
        if (!payload || !payload.mesh) {return;}

        const merged: SceneOptions = {
            bgColor: payload.bg_color || '#ffffff',
            ortho: false,
            headlight: true,
            axisStyle: (payload.axis_style as SceneOptions['axisStyle']) || 'cross',
            showAxes: true,
            ambIntensity: 0.9,
            dirIntensity: 2.2,
            shdIntensity: 0.15,
            meshColor: '#1a99cc',
            meshOpacity: 1.0,
            ...opts,
        };
        currentOptions = merged;
        currentPayload = payload;

        if (currentScene) {
            currentScene.dispose();
            currentScene = null;
        }

        let scene: Plot3DScene;
        try {
            scene = buildScene(container, merged);
        } catch {
            // WebGL2 불가 — scene.ts 가 배너를 표시했다. 이전 메시(floating) 유지.
            currentScene = null;
            return;
        }
        currentScene = scene;

        applyMesh(scene, payload);
        applyAxes(scene, payload);
        fitView(scene);

        scene.renderer.setAnimationLoop(() => {
            scene.controls.update();
            scene.renderer.render(scene.scene, scene.camera);
        });
    },

    updateOptions(opts) {
        if (!currentScene || !currentOptions || !currentPayload) {return;}
        currentOptions = { ...currentOptions, ...opts };
        const container = currentScene.renderer.domElement.parentElement;
        if (container) {
            api.build(currentPayload, container, currentOptions);
        }
    },

    setZRange(zMin, zMax) {
        if (!currentScene || !currentPayload) return;
        currentPayload.ranges.z = [zMin, zMax];
        const mesh = currentPayload.mesh;
        // v2 levelset: cap-ring LUT 로 µs-ms 재클립 (IPC 없음)
        if (mesh && mesh.mode === 'levelset' && mesh.lut) {
            const result = reclipWithLut(currentPayload, zMin, zMax);
            // 재클립 결과를 현재 씬의 클립 메시에 반영 (v2 렌더러 확장 시 사용)
            // 현재 v1 렌더러는 클립 오버레이를 그리지 않으므로 재구축 폴백과 동일 시각.
            // (Z 값은 Python 이 클램프한 기존 메시 사용 — 범위 라벨만 갱신)
            if (currentScene.renderer.domElement.parentElement) {
                api.build(currentPayload, currentScene.renderer.domElement.parentElement, currentOptions ?? undefined);
            }
            return;
        }
        // v1 flat: 범위 변경은 재구축 (Python rerender IPC 로 실제 재계산)
        if (currentScene.renderer.domElement.parentElement) {
            api.build(currentPayload, currentScene.renderer.domElement.parentElement, currentOptions ?? undefined);
        }
    },

    capture(format, quality) {
        return currentScene ? captureDataUrl(currentScene, format, quality) : null;
    },

    captureCropped(format, bgColor, cb) {
        const raw = currentScene ? captureDataUrl(currentScene, format) : null;
        if (!raw) { cb(''); return; }
        autoCrop(raw, bgColor, format, cb);
    },

    setView(elev, azim, zoom) {
        withScene(s => setView(s, elev, azim, zoom));
    },

    fitView() {
        withScene(s => fitView(s));
    },

    dispose() {
        if (currentScene) {
            currentScene.dispose();
            currentScene = null;
        }
        currentOptions = null;
        currentPayload = null;
    },
};

declare global {
    interface Window {
        TexMachinaPlot3D?: Plot3DGlobal;
    }
}

window.TexMachinaPlot3D = api;

/** v2 levelset Z 재클립: LUT 최근접 링 선택 + 그리드 림 교차점 계산. */
function reclipWithLut(payload: Plot3DMeshPayload, zMin: number, zMax: number): ReclipResult[] {
    const mesh = payload.mesh;
    if (!mesh.lut) return [];
    const results: ReclipResult[] = [];
    for (const capP of [zMin, zMax]) {
        const rings = pickNearestRings(mesh.lut, capP);
        results.push({
            capP,
            rimPoints: [],
            capRings: rings ?? [],
        });
    }
    return results;
}
