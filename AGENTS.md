# AGENTS.md — TeX-Machina 개발 컨텍스트

이 문서는 opencode 등 AI 에이전트가 이 저장소에서 코드 작업을 할 때 반드시 알아야 하는
프로젝트 구조, 아키텍처, 규칙, 주의사항을 정리한 것이다. 작업을 시작하기 전에 전체를 읽어라.

---

## 1. 프로젝트 개요

**TeX-Machina** 는 VS Code용 LaTeX 편집 보조 확장 프로그램이다.

- 심볼릭 수학 계산 (SymPy 기반: 미분, 적분, 미분방정식, 라플라스/푸리에 변환, 행렬 연산, ODE/PDE 등)
- 수식 시각화 (`plot`: 2D/3D/complex, TikZ/pgfplots 코드 생성)
- 인용 관리 (`cite`: arXiv ID, DOI, Crossref, Semantic Scholar 검색)
- OEIS 수열 검색
- LaTeX 편집 보조 기능 30여 개 (자동 괄호, 스마트 따옴표, 매크로, 스니펫, 라벨 디펜던시 시각화 등)
- 기본값 `1.0.2`, `engines.vscode: ^1.109.0`, 활성화 이벤트 `onLanguage:latex`

**구조의 핵심**: TypeScript 확장(프론트) + Python 백엔드(계산 서버)의 **2계층 구조**.
TS 확장이 `python_backend/server.py`를 자식 프로세스로 띄우고 **stdio에 JSON 라인(newline-delimited JSON)** 으로 통신한다.

---

## 2. 디렉터리 구조

```
src/
├── extension.ts              # 엔트리포인트. activate()에서 모든 registerX() 호출
├── core/                     # 핵심 기능 모듈 (각 파일이 registerX(context, ...) 내보냄)
│   ├── commandParser.ts      # CLI 명령어 파서 (parseUserCommand, splitChain)
│   ├── latexParser.ts        # LaTeX 구조 파싱 (핵심 유틸, 500줄)
│   ├── macroManager.ts       # 컨텍스트 인지 매크로 (globalState 저장)
│   ├── snippetManager.ts     # 사용자 정의 스니펫 시스템
│   ├── mathAutoCalc.ts       # 수식 자동 계산 (Python 호출)
│   ├── pasteExternalData.ts  # 외부 데이터(CSV/TSV/HTML 표) → 행렬/테이블 변환
│   ├── argumentNavigation.ts # 명령어 인자 간 이동 (726줄 — 가장 큰 core 모듈)
│   └── ... (편집 보조 기능 다수)
├── services/
│   └── pythonService.ts      # ★ Python 백엔드 프로세스 관리 + stdio JSON 통신
├── ui/
│   └── webviewProvider.ts    # 사이드바 웹뷰 (매크로/스니펫/라벨 그래프/플롯) — 1330줄
└── test/                     # vscode-test 통합 테스트 (out/test/*.test.js로 컴파일)
    ├── testUtils.ts          # 테스트 헬퍼 (openDoc, waitForCondition 등)
    └── *.test.ts             # 기능별 테스트

python_backend/
├── server.py                 # ★ stdio 서버 메인 루프 (한 줄 = JSON 요청/응답)
├── calc_engine.py            # ★ 수학 연산 엔진 (execute_calc, get_calc_operations) — 1305줄
├── query_parser.py           # ★ TeX-Machina 쿼리 DSL 파서 (lexer+parser) — 315줄
├── query_engine.py           # 쿼리 DSL 실행기 (LaTeX 문서 변환 질의)
├── plot_engine.py            # 플롯 생성 (pgfplots 코드 + .dat 데이터 파일) — 791줄
├── matrix.py                 # 행렬 생성/분석
├── cite_engine.py            # 논문 인용 (arXiv/DOI/Crossref/SemanticScholar)
├── oeis_engine.py            # OEIS 검색
├── dimcheck_engine.py        # 차원/단위 검사
├── label_engine.py           # LaTeX 라벨 종속성 분석 (라벨 그래프용)
├── utils.py                  # ★ safe_parse_expr (보안 화이트리스트), strip_latex_delimiters
└── requirements.txt          # sympy, numpy, matplotlib, requests, scipy, latex2sympy2,
                              # mpmath, antlr4-python3-runtime==4.11.1, symengine>=0.11.0

dist/                         # esbuild 번들 결과 (extension.js) — 커밋되지 않음
out/                          # tsc 컴파일 결과 (테스트용) — 커밋되지 않음
```

---

## 3. 아키텍처 — TS↔Python 통신 프로토콜 (가장 중요)

### 프로세스 수명주기 (`src/services/pythonService.ts`)

1. `activate()` → `pythonService.start()` 호출.
2. `start()` 는 `ensurePythonEnvironment()` 로 Python 실행기를 찾는다:
   - 시스템 `python3`/`python3.12/11/10` (sympy import 가능한 것)
   - 확장에 번들된 `venv/`
   - 로그인 셸(`$SHELL -l -c 'which python3'` — pyenv/conda/asdf 반영)
   - 없으면 `globalStoragePath/venv`에 **새 venv 생성 + requirements.txt pip 설치** (알림 UI 표시)
3. `spawn(python, ['python_backend/server.py'])` 로 서버 기동.
4. 서버는 시작 시 `{"status":"ready","pid":...}` 한 줄 출력 → TS가 60초 타임아웃으로 대기.
5. 이후 **요청마다 requestId를 부여**하고 `resolvers` Map에 Promise를 등록, 응답이 오면 resolve.

### 요청 형식 (TS → Python, stdin에 JSON 한 줄 + `\n`)

```json
{
  "mainCommand": "calc",
  "subCommands": ["diff", "x"],
  "parallelOptions": ["newline"],
  "rawSelection": "\\frac{\\sin(x)}{x}",
  "config": {
    "laplace": {"source": "t", "target": "s"},
    "angleUnit": "deg",
    "precision": 10,
    "workspaceDir": "/path/to/tex/dir",
    "datDensity": 500,
    "yMultiplier": 5.0,
    "lineColor": "blue"
  },
  "requestId": "uuid"
}
```

### 응답 형식 (Python → TS)

```json
{ "status": "success", "latex": "\\frac{\\cos(x)}{x} - \\frac{\\sin(x)}{x^2}", "requestId": "uuid" }
{ "status": "error", "message": "에러 설명", "requestId": "uuid" }
```

- 성공 시 거의 항상 `latex` 키에 결과 LaTeX 문자열이 들어간다.
- 일부 명령은 `analysis`, `nodes`/`edges`(라벨), `fullText`(쿼리) 등 추가 키 사용.
- `server.py`의 루프는 **요청을 순차 처리**하며, 예외 발생 시 `{"status":"error","message":"Server Error: ..."}` 반환.

### 명령어 파싱 체인 (TS → Python)

`parseUserCommand(input, selection)` (`src/core/commandParser.ts`) 가 CLI 문자열을 파싱한다:

```
calc > diff > x          → mainCommand="calc", subCommands=["diff","x"]
taylor > x, 5 / newline / step=2  → subCommands=["taylor의 인자..."], parallelOptions=["newline","step=2"]
plot > 3d / samples=100
cmd1 && cmd2             → splitChain으로 분리 후 순차 실행 (executeChain)
```

- `>` = 메인/서브 구분, ` / `(앞 공백 포함 슬래시) = parallel 옵션 구분, `&&` = 명령어 체인.
- Python 쪽 `execute_calc`는 `mainCommand`/`subCommands`/`parallelOptions`/`config`/`rawSelection`을 받아 처리.

### Python 쪽 핵심 디스패치 (`python_backend/calc_engine.py`)

- `execute_calc(json_str)` → `json.loads` 후 `mainCommand` 기준 분기.
- 실제 연산 디스패치 테이블은 `get_calc_operations()` — ~40개 연산자(calc, simplify, diff, int, ode, laplace, matrix, plot, cite, oeis, dimcheck, error_prop, tensor_expand ...).
- LaTeX → SymPy 변환은 `sympy.parsing.latex.parse_latex` (공식 파서) 사용.
- 속도 최적화: `run_fast_op()` 이 symengine으로 diff/expand/simplify/det를 시도하고 실패하면 SymPy 폴백.

### 쿼리 DSL (`python_backend/query_parser.py`, `query_engine.py`)

`?`/`;` 접두어 + LaTeX 문서 구조를 질의/변형하는 전용 DSL이 있다 (mainCommand `"?"`).
`find/exchange/move/duplicate/delete/insert/extract` 명령, 태그(`#tag`/`@tag`), 변환 연산자
(`>>`, `:=`, `+=`, `-=`, `<->` 등), 조건절(`where/without/has`), `order by`, loop 등.
문서 수정은 `execute_query_on_text(full_text, query_str)` → `{"status":"success","fullText":...}`.
이 DSL을 수정할 때는 `query_parser.py`(lexer/parser)와 `query_engine.py`(실행기)를 함께 봐야 한다.

---

## 4. 빌드 / 테스트 / 실행

```bash
npm run check-types       # tsc --noEmit (타입 검사)
npm run lint              # eslint src
npm run compile           # check-types + lint + esbuild 번들 → dist/extension.js
npm run watch             # tsc + esbuild 병렬 watch (개발 시)
npm run package           # 프로덕션 빌드 (minify)
npm run compile-tests     # tsc -p . --outDir out (테스트를 out/test/로 컴파일)
npm test                  # 전체 테스트 (xvfb-run -a vscode-test)
npm run test:fast         # 파서/분할/단위/매크로 테스트
npm run test:integration  # 편집 보조 기능 통합 테스트
npm run test:webview      # 웹뷰 테스트
npm run test:calc         # calc 엔진 고난도/극한 테스트
npm run test:only -- out/test/파일.test.js   # 특정 테스트만
```

- **테스트는 실제 VS Code 인스턴스에서 실행**된다 (`@vscode/test-cli`, `.vscode-test.js`가 설정).
- `src/test/*.test.ts`를 수정하면 `npm run compile-tests`로 `out/test/`에 JS를 만든 뒤 실행해야 한다.
- 테스트 헬퍼: `testUtils.ts`의 `openDoc()`, `insertAt()`, `waitForCondition()`, `waitForExtension()`.
- 매크로/스니펫/설정 등은 `context.globalState`/`workspace.getConfiguration`을 쓰므로
  **순수 단위 테스트가 어렵다** — 통합 테스트 관례를 따르고 기존 테스트 패턴을 유지하라.

### 실행/디버깅

- F5 → "Run Extension" (`preLaunchTask: watch`가 tsc+esbuild watch를 먼저 실행).
- `dist/extension.js`가 실제 로드되는 엔트리 (esbuild 번들, `vscode`만 external).
- Python 백엔드 로그는 VS Code 디버그 콘솔에 `[PythonService] ...` / `Python Error: ...` 로 출력된다.

---

## 5. 코딩 규칙 & 관례

### 구조 관례 (중요)

- **기능 모듈 = 하나의 파일 + `registerX(context, ...)` 함수 내보내기**.
  `extension.ts`의 `registerFunctions` 배열에 추가하면 자동 등록된다.
  새 편집 보조 기능을 만들 때는 기존 모듈(예: `src/core/smartQuotes.ts`)의 패턴을 그대로 따라라:
  `registerX(context)` → `vscode.commands.registerCommand('tex-machina.x', ...)` 등
  `Disposable` 반환 → `activate()`가 `context.subscriptions`에 push.
- 파일이 비대해지면(250줄 이상) `latexParser.ts` 같은 공용 파서로 로직을 추출하는 것을 고려하라.

### 설정 (package.json `contributes.configuration`)

- 네임스페이스: `tex-machina.<기능>.<설정>` — 64개 키 존재.
- 예: `tex-machina.calc.settings`(객체: laplaceSource, angleUnit, precision, defaultDomain ...),
  `tex-machina.plot.datDensity`, `tex-machina.smartQuotes.enabled`, `tex-machina.cli.chainDelimiter`.
- 새 설정 추가 시 `package.json`에 스키마(타입/기본값/설명)를 반드시 등록하고
  `vscode.workspace.getConfiguration('tex-machina')`로 읽는다.

### 명령어

- 전역 커맨드 네임스페이스 `tex-machina.<action>` (43개 커맨드, 34개 키바인딩).
- 키바인딩은 `package.json`의 `contributes.keybindings`에 등록한다.

### 언어

- **UI 문자열, 코드 주석, 에러 메시지는 한국어**를 기본으로 쓴다 (프로젝트 관례).
- 코드 식별자는 영어. 변수/함수명은 기존 스타일(camelCase) 유지.

### 안티패턴 (지켜라)

- `as any` 등 타입 억제 금지 — `strict` 모드 유지.
- Python 계산 입력은 **반드시 `utils.safe_parse_expr` 화이트리스트 경로를 거쳐라**.
  `__builtins__` 차단 + 허용 SymPy 함수 리스트. 임의 `exec`/`eval` 금지
  (단, `snippet` 명령의 사용자 스크립트 실행은 예외 — 설계상 사용자 자신의 코드를 신뢰).
- `parse_latex` 는 사용자 입력을 그대로 파싱하므로 서버로 보내기 전
  `strip_latex_delimiters` 로 `$...$`, `\[...\]` 구분자를 제거하는 것을 잊지 말라.

---

## 6. 주요 모듈별 주의사항

| 모듈 | 주의사항 |
|---|---|
| `src/services/pythonService.ts` | 15초 요청 타임아웃, 60초 기동 타임아웃. `sendAndWait`의 reject는 호출부에서 처리 필요. 프로세스 종료 시 모든 pending resolver를 error로 resolve한다. |
| `src/core/latexParser.ts` | 여러 모듈(implicitSubscripts, mathRefactor 등)이 공유하는 파서. 변경 시 회귀 위험 큼 — 관련 테스트 반드시 실행. |
| `src/ui/webviewProvider.ts` | 웹뷰 HTML은 inline JS로 구성. `enableScripts: true`. 웹뷰 메시지 → 커맨드 브리지 패턴. 보안상 웹뷰로부터 받은 내용을 `vscode.commands`에 그대로 전달하는 패턴 주의. |
| `python_backend/calc_engine.py` | 가장 크고 복잡. `get_calc_operations()` 디스패치 테이블이 사실상의 API 명세. 연산 추가 시 여기 + QuickPick 명령 라이브러리(`extension.ts`의 `commandLib`) + README를 함께 갱신할 것. |
| `python_backend/query_parser.py` | 휴리스틱 lexer(정규식 기반) + hand-written parser. 토큰/연산자 추가 시 `MUTATION_OPS`, `ops` 리스트, `patterns`를 모두 손봐야 한다. |
| `python_backend/plot_engine.py` | `sympy_to_pgfplots_str`, 특이점 감지, .dat 파일 생성(`workspaceDir`에 저장). plot 명령은 선택 영역 대신 `workspaceDir`의 데이터 파일을 참조하는 TikZ 코드를 만들 수 있다. |
| `python_backend/server.py` | Python 3.12+ 호환용 `typing.io` shim을 main() 위에 주입한다. 새 진입점/새 서버를 만들지 말고 이 파일을 그대로 유지하라. |

---

## 7. 환경 / 기타

- **Git**: 현재 브랜치 `revised`. 작업 전 `git status`로 미커밋 변경 확인.
- `.gitignore`가 `out/`, `dist/`, `node_modules`, `venv/`, `.omo`, `.opencode`를 제외한다.
- Python 백엔드의 ruff 캐시(`.ruff_cache/`) 존재 — Python 쪽 린트는 ruff 기준.
- `esbuild.js`의 `PACKAGE_VERSION` define이 `"3.2.1"`로 하드코딩되어 있고 `package.json` 버전(1.0.2)과
  불일치한다. 버전 관련 작업 시 이 define을 함께 확인하라.
- VS Code API가 확장 프로세스에서만 사용 가능한 것에 유의: `src/core` 모듈 중
  순수 로직(파서 등)과 VS Code 의존 로직이 섞여 있으므로 단위 테스트는 파서 위주로 작성한다.
- 이 확장은 macOS/Windows/Linux 크로스 플랫폼을 고려한다
  (`process.platform === 'win32'` 분기가 `pythonService.ts` 등에 존재). Windows 경로 처리를 깨지 말 것.
- 패키징: `npm run package` 후 `*.vsix` 생성 (`@vscode/vsce` 기반, `.vscodeignore` 존재).
