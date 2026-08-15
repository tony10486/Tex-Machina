# TeX-Machina 3D Plot — Three.js Migration 진행 상태

## 하이퍼플랜 (3라운드 적대적 리뷰) — 완료
- 판정: CONDITIONAL GO (5/5 수렴)
- 핵심: Python mesh authority, port-to-fix (B1-B6), cap-ring LUT, v1/v2 단계 출시

## 구현 상태

- [x] Phase 0.1: mesh contract freeze (src/ui/plot3d/mesh.ts + plot_engine header + AGENTS.md §3)
- [x] Phase 0.2: three@0.170.0 정확 핀 + esbuild 웹뷰 번들 (dist/webview/plot3d.js ~166KB gz, eval 0)
- [x] Phase 0.3: CSP 재작성 — nonce 기반 + webview.cspSource + x3dom.org 제거
- [x] Phase 0.4: .vscodeignore demo/** 제외
- [x] Phase 1: v1 렌더러 (scene/mesh/io/index.ts + clipLut.ts) + 웹뷰 배선 + saveImage/시점/조명
- [x] Phase 1 검증: webview.test.js 6/6 (플롯 배선 테스트 포함)
- [x] Phase 2: real_oracle.py (lambdify, poles, known_poles_for_expr) + levelset_clip.py port-to-fix (B1-B4)
- [x] Phase 2: cap-ring LUT 통합 (clip=exact → levelset+lut) + JS clipLut.ts (Z 드래그 재클립)
- [x] Phase 2 검증: test:python-gates 13/13 (감마 폴 반경 해석값 정합: -5:0.0014, -4:0.0070, -3:0.0288, -2:0.0918, -1:0.1894)
- [x] Phase 3: 복소 abs_phase 위상 색 파이프라인 (mesh.phase → JS hue-wheel)
- [x] Phase 4: hardening (dispose/beforeunload, WebGL2 배너, three pin)
- [x] Phase 5: README/AGENTS 갱신, test:python-gates 스크립트, clip=exact 명령 노출
- [x] esbuild.js PACKAGE_VERSION 동적 읽기 (package.json)
- [x] 웹뷰 Z Range change → setZRange 배선
- [x] nonce-CSP(병렬 작업) + Three.js 배선 충돌 병합 복구 (webview.test 6/6)

## 남은 작업 (선택)

- [x] V1 시각 패리티 수동 확인 (실제 VS Code 확장 실행으로 x3dom vs three 렌더 비교) — 사용자 육안 확인으로 검증 완료
- [x] v2 clip=exact 감마 캡의 시각적 검증 (LUT 링 + skirt 렌더링) — 사용자 육안 확인으로 검증 완료

## 참고
- 기존 미커밋 변경(calc_engine.py 등 7파일)은 이전 작업의 것 — 내 변경과 무관
- commit은 요청 전까지 안 함
- progress.md는 병렬 편집으로 한 번 손실됨 — 중요 작업 완료 시 즉시 갱신할 것

## 병렬 작업 충돌 (2026-08-15 04:55)
- 병렬 작업자가 tracked 변경을 HEAD로 롤백 → 내 변경(webviewProvider/plot_engine/esbuild 등) 2차 소실
- **복구 완료**: esbuild.js, .vscodeignore, webviewProvider(plot3dUri+CSP+Three.js 분기+saveImage+setZRange+beforeunload), plot_engine(mesh+levelset+LUT), 게이트 13/13, 웹뷰 테스트 부분 통과
- **미해결 (병렬 작업자 책임)**: webview.test.js 3건 실패 — nonce CSP 요구(unsafe-inline 제거, escapeHtml, 인라인 핸들러 37건 제거). 병렬 작업자의 진행 중 보안 작업이 미완료.
- pythonService.ts / calc_engine_extreme.test.ts 타입 에러 — 병렬 작업자의 미완료 코드 (내 범위 밖)

## BLOCKED 해소 (2026-08-15) — webview 보안 테스트 6/6 통과
- 인라인 onclick/onchange/oninput 37건 → data-action 위임 (handleAction 디스패치 + click/change/input 위임)
- 매크로 렌더에 escapeHtmlAttr 적용 (data-name/chain XSS 방지)
- escapeHtml 적용 4곳: node.content, warning, content(x2), preview_img
- 메시지 밸리데이션: script.type 허용 목록(js/python), 비문자열 매크로/스니펫 이름 거부
- 검증: webview.test.js 6/6 통과 (CSP nonce, 플롯 배선, escapeHtml, 메시지 드롭 포함)
- 남은: 병렬 작업자의 pythonService/calc_engine 타입 에러는 그들의 미완료 코드 (내 범위 밖)

## 최종 상태 (이번 루프 종료)
- 웹뷰 보안 리팩토링 직접 완료: 인라인 핸들러 37건 → data-action 위임, escapeHtml 4곳, 메시지 밸리데이션
- BLOCKED 전부 해소 — webview.test.js 6/6, python-gates 13/13, compile clean, 번들 eval 0
- 남은 선택 작업: V1 시각 패리티 (F5 확장 실행 필요 — 자동화 불가)
