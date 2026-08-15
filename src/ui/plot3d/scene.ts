/**
 * TeX-Machina 3D Plot — Three.js 씬/메시 구축
 * ----------------------------------------------
 * mesh contract(src/ui/plot3d/mesh.ts)의 데이터만 소비한다. `f(x,y)` 평가 금지.
 *
 * v1 (`mode:"flat"`): Python 이 이미 플랫 클립(정점 클램프)을 적용했으므로
 * 추가 클리핑 없이 정점 색상 + 계산 법선으로 표면을 렌더한다 — 오늘의 x3dom과 동일 시각.
 *
 * 기본 시점 구성은 데모(index.html)와 동일한 우상향 방향조명 + 헴리스피어로
 * 곡면이 어둡지 않게 한다 (배경 적응형: 밝은 배경 → 조명 강도 보정).
 */

import * as THREE from 'three';
// three r170 addons 는 ESM — Node16(CJS) 타입 해석은 src/types/three-addons.d.ts 셰임 사용.
// esbuild 는 exports map(`./addons/*` → `./examples/jsm/*`) 으로 정상 번들한다.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Plot3DMeshPayload } from './mesh';

export interface SceneOptions {
    bgColor: string;
    ortho: boolean;
    headlight: boolean;
    axisStyle: 'cross' | 'arrows' | 'box' | 'none';
    showAxes: boolean;
    ambIntensity: number;
    dirIntensity: number;
    shdIntensity: number;
    meshColor: string;
    meshOpacity: number;
}

export interface Plot3DScene {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    controls: OrbitControls;
    surfaceGroup: THREE.Group;
    axesGroup: THREE.Group;
    labelGroup: THREE.Group;
    options: SceneOptions;
    ranges: { x: [number, number]; y: [number, number]; z: [number, number] };
    /** 리소스 전체 해제 (rebuild/dispose 시) */
    dispose(): void;
    /** 캔버스 크기 갱신 (ResizeObserver/패널 표시 시) */
    resize(w: number, h: number): void;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255) as [number, number, number];
}

/** 배경 밝기에 따라 조명 강도를 보정한다 (데모의 배경 적응형 조명). */
function adaptiveLightScale(bg: string): number {
    const [r, g, b] = hexToRgb(bg);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // 어두운 배경(기본)일수록 조명을 강하게, 밝은 배경은 약하게
    return 1.0 + (1.0 - lum) * 0.5;
}

/** 표면 정점 법선: BufferGeometry.computeVertexNormals() 는 flat/smooth 경계가
 *  부드럽지 않으므로, 데모와 동일하게 평균 법선을 사용한다(그대로 smooth Gouraud). */
function applyVertexNormals(geom: THREE.BufferGeometry): void {
    geom.computeVertexNormals();
}

export function buildScene(container: HTMLElement, options: SceneOptions): Plot3DScene {
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;

    // WebGL2 가용성 검사 — 실패 시 명확한 배너 (비활성 GPU/VM/RDP 폴백, Phase 4)
    const probe = document.createElement('canvas');
    const gl2 = probe.getContext('webgl2');
    if (!gl2) {
        const banner = document.createElement('div');
        banner.style.cssText = 'padding:16px;text-align:center;color:#e0a020;font-size:13px;';
        banner.textContent = '⚠ WebGL2 를 사용할 수 없습니다 — 이 환경(비활성 GPU/VM/RDP)에서는 3D 플롯을 표시할 수 없습니다.';
        container.appendChild(banner);
        throw new Error('WebGL2 not available');
    }

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true, // saveImage 캡처용
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(options.bgColor);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.set(6, 5, 8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const surfaceGroup = new THREE.Group();
    const axesGroup = new THREE.Group();
    const labelGroup = new THREE.Group();
    scene.add(surfaceGroup, axesGroup, labelGroup);

    const scale = adaptiveLightScale(options.bgColor);
    const ambient = new THREE.AmbientLight(0xffffff, 0.9 * scale);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2 * scale);
    dirLight.position.set(5, 10, 7);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x101010, 0.35 * scale);
    scene.add(ambient, dirLight, hemi);

    const state: Plot3DScene = {
        renderer, scene, camera, controls,
        surfaceGroup, axesGroup, labelGroup,
        options,
        ranges: { x: [-5, 5], y: [-5, 5], z: [-15, 15] },
        dispose() {
            controls.dispose();
            disposeGroup(surfaceGroup);
            disposeGroup(axesGroup);
            disposeGroup(labelGroup);
            renderer.setAnimationLoop(null);
            renderer.dispose();
            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        },
        resize(nw, nh) {
            renderer.setSize(nw, nh);
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.aspect = nw / nh;
                camera.updateProjectionMatrix();
            } else {
                updateOrtho(camera, nw, nh);
            }
        },
    };
    return state;
}

function updateOrtho(camera: THREE.OrthographicCamera, w: number, h: number): void {
    const half = 6;
    const aspect = w / h;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
}

function disposeGroup(group: THREE.Group): void {
    group.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {mesh.geometry.dispose();}
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) {mat.forEach(m => m.dispose());}
        else if (mat) {mat.dispose();}
    });
    group.clear();
}

/** 순환 위상 컬러맵 (v3 abs_phase) — hue wheel, phase∈[0,1) → RGB. */
function phaseToColor(phase: number): [number, number, number] {
    const h = ((phase % 1) + 1) % 1;
    const x = 1 - Math.abs((h * 6) % 2 - 1);
    let r = 1, g = 1, b = 1;
    if (h < 1 / 6) { r = 1; g = x; b = 0; }
    else if (h < 2 / 6) { r = x; g = 1; b = 0; }
    else if (h < 3 / 6) { r = 0; g = 1; b = x; }
    else if (h < 4 / 6) { r = 0; g = x; b = 1; }
    else if (h < 5 / 6) { r = x; g = 0; b = 1; }
    else { r = 1; g = 0; b = x; }
    return [r, g, b];
}

/** mesh contract 페이로드의 표면을 surfaceGroup 에 구축한다. */
export function applyMesh(scene: Plot3DScene, payload: Plot3DMeshPayload): void {
    const mesh = payload.mesh;
    disposeGroup(scene.surfaceGroup);
    scene.ranges = { x: payload.ranges.x, y: payload.ranges.y, z: payload.ranges.z };

    if (!mesh || !mesh.positions.length) return;

    const positions = new Float32Array(mesh.positions);
    const indices = new Uint32Array(mesh.indices);

    // 색상: 명시 colors 가 있으면 사용, v3 phase(순환 컬러맵)가 있으면 위상 색으로 대체
    let colors: Float32Array;
    if (mesh.phase && mesh.phase.length === mesh.positions.length / 3) {
        const arr = new Float32Array(mesh.phase.length * 3);
        for (let i = 0; i < mesh.phase.length; i++) {
            const [r, g, b] = phaseToColor(mesh.phase[i]);
            arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b;
        }
        colors = arr;
    } else {
        colors = new Float32Array(mesh.colors);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    applyVertexNormals(geom);

    const opts = scene.options;
    const base = hexToRgb(opts.meshColor);
    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: false, // smooth Gouraud (x3dom 기본과 유사)
        transparent: opts.meshOpacity < 1,
        opacity: opts.meshOpacity,
        specular: new THREE.Color(...base),
        shininess: opts.shdIntensity * 50,
    });

    const surface = new THREE.Mesh(geom, material);
    surface.frustumCulled = false; // 법선/경계 계산 생략 — 대형 그리드 성능
    scene.surfaceGroup.add(surface);
}

/** 축/틱/라벨 구축 (v1: 교차/화살표/박스/없음 + 라벨 텍스트). */
export function applyAxes(scene: Plot3DScene, payload: Plot3DMeshPayload): void {
    disposeGroup(scene.axesGroup);
    disposeGroup(scene.labelGroup);
    const { x, y, z } = scene.ranges;
    const style = scene.options.axisStyle;
    const show = scene.options.showAxes && style !== 'none';
    if (!show) {return;}

    const axisLen = 1.0;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x888888 });
    const axisPts: [THREE.Vector3, THREE.Vector3][] = [
        [new THREE.Vector3(x[0], 0, 0), new THREE.Vector3(x[1] + axisLen, 0, 0)],
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, z[1] + axisLen, 0)],
        [new THREE.Vector3(0, 0, y[0]), new THREE.Vector3(0, 0, y[1] + axisLen)],
    ];
    for (const [a, b] of axisPts) {
        const g = new THREE.BufferGeometry().setFromPoints([a, b]);
        scene.axesGroup.add(new THREE.Line(g, lineMat));
    }

    // 라벨 스프라이트
    const { labels } = payload.axes;
    const font = labels.font === 'SERIF' ? 'serif' : 'sans-serif';
    const mkLabel = (text: string, pos: THREE.Vector3) => {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 64;
        const ctx = cv.getContext('2d')!;
        ctx.font = `bold 36px ${font}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        const tex = new THREE.CanvasTexture(cv);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        sprite.position.copy(pos);
        sprite.scale.set(1.2, 0.3, 1);
        scene.labelGroup.add(sprite);
    };
    mkLabel(labels.x, new THREE.Vector3(x[1] + 0.6, 0, 0));
    mkLabel(labels.y, new THREE.Vector3(0, z[1] + 0.6, 0));
    mkLabel(labels.z, new THREE.Vector3(0, 0, y[1] + 0.6));
}
