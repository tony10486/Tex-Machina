/**
 * three r170 addons (OrbitControls) 타입 셰임
 * --------------------------------------------
 * 프로젝트 tsconfig 가 `module: Node16`(CJS) 이라 three 의 ESM addons 를 직접
 * import 하면 TS1479(CJS↔ESM)/TS2307 이 발생한다. esbuild 는 exports map
 * (`./addons/*` → `./examples/jsm/*`) 으로 정상 번들하므로, 타입만 셰임으로 제공한다.
 * 사용 API 는 데모(index.html)와 동일한 범위로 제한한다.
 */

declare module 'three/addons/controls/OrbitControls.js' {
    import { Camera, EventDispatcher } from 'three';

    export class OrbitControls extends EventDispatcher {
        constructor(object: Camera, domElement?: HTMLElement);
        object: Camera;
        domElement: HTMLElement;
        enableDamping: boolean;
        dampingFactor: number;
        target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
        autoRotate: boolean;
        update(deltaTime?: number): void;
        dispose(): void;
    }
}

// Node16 해석 시 exports map 타깃 경로로도 해석될 수 있어 함께 선언.
declare module 'three/examples/jsm/controls/OrbitControls.js' {
    import { Camera, EventDispatcher } from 'three';

    export class OrbitControls extends EventDispatcher {
        constructor(object: Camera, domElement?: HTMLElement);
        object: Camera;
        domElement: HTMLElement;
        enableDamping: boolean;
        dampingFactor: number;
        target: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
        autoRotate: boolean;
        update(deltaTime?: number): void;
        dispose(): void;
    }
}
