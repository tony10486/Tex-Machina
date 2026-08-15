/**
 * TeX-Machina 3D Plot — 캡처/시점/리사이즈 유틸
 * ----------------------------------------------
 * saveImage/exportPdf 브리지를 위한 캔버스 캡처와 시점 제어.
 * `<a download>` 는 웹뷰에서 차단되므로 여기서는 데이터 URL만 반환하고
 * 웹뷰 inline 스크립트가 기존 postMessage→internalSaveWebviewImage 로 저장한다.
 */

import type { Plot3DScene } from './scene';

/** 캔버스 → 데이터 URL (preserveDrawingBuffer:true 필요). */
export function captureDataUrl(scene: Plot3DScene, format: 'png' | 'jpeg', quality = 0.92): string | null {
    try {
        const canvas = scene.renderer.domElement;
        if (format === 'jpeg') {
            return canvas.toDataURL('image/jpeg', quality);
        }
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

/** 배경색 기반 스마트 크롭 — webviewProvider의 autoCrop 과 동일 알고리즘. */
export function autoCrop(imgData: string, bgColor: string, format: 'png' | 'jpeg', callback: (result: string) => void): void {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const rBg = parseInt(bgColor.slice(1, 3), 16);
        const gBg = parseInt(bgColor.slice(3, 5), 16);
        const bBg = parseInt(bgColor.slice(5, 7), 16);
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        let found = false;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                const diff = Math.abs(data[i] - rBg) + Math.abs(data[i + 1] - gBg) + Math.abs(data[i + 2] - bBg);
                if (diff > 15) {
                    if (x < minX) {minX = x;}
                    if (x > maxX) {maxX = x;}
                    if (y < minY) {minY = y;}
                    if (y > maxY) {maxY = y;}
                    found = true;
                }
            }
        }
        if (!found) { callback(imgData); return; }
        const pad = 10;
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(canvas.width, maxX + pad); maxY = Math.min(canvas.height, maxY + pad);
        const cropW = maxX - minX, cropH = maxY - minY;
        const cropped = document.createElement('canvas');
        cropped.width = cropW; cropped.height = cropH;
        cropped.getContext('2d')!.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        callback(cropped.toDataURL('image/' + format));
    };
    img.src = imgData;
}

/** 카메라 시점 설정 — 기존 x3dom Viewpoint 값과 호환 (elev/azim/zoom). */
export function setView(scene: Plot3DScene, elev: number, azim: number, zoom: number): void {
    const radius = 12 * (1 / (zoom || 1));
    const phi = (90 - elev) * Math.PI / 180;
    const theta = azim * Math.PI / 180;
    scene.camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta),
    );
    scene.controls.target.set(0, 0, 0);
    scene.controls.update();
}

/** 씬 전체에 fit (데모 fitView 대체). */
export function fitView(scene: Plot3DScene): void {
    const { x, y, z } = scene.ranges;
    const cx = (x[0] + x[1]) / 2, cy = (y[0] + y[1]) / 2, cz = (z[0] + z[1]) / 2;
    const extent = Math.max(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
    scene.controls.target.set(cx, cz, cy); // three: y=height(복소 z축 역할)
    scene.camera.position.set(cx + extent * 0.9, cz + extent * 0.7, cy + extent * 1.1);
    scene.controls.update();
}
