# TeX-Machina Codebase Map

> **주의 (WARNING):** 이 파일을 수정하기 전에 반드시 실제 코드의 위치와 내용을 확인하십시오. 다른 AI 에이전트나 개발자가 이 지도를 참고하여 코드를 수정할 때, 실제 코드의 위치가 변경되었음에도 이 파일이 업데이트되지 않아 엉뚱한 곳을 수정하는 불상사를 방지해야 합니다. 코드를 수정한 후에는 이 지도 파일도 반드시 함께 업데이트하십시오.

이 지도는 TeX-Machina 확장 프로그램의 주요 기능들이 구현된 위치를 안내합니다.

## Core Logic (핵심 로직)

| 기능 | 파일 경로 | 설명 |
| :--- | :--- | :--- |
| **중앙 토글 관리** | `src/core/toggleMode.ts` | 토글 모드 활성화, 프로필 관리, 이벤트 디스패칭의 핵심. |
| **암시적 첨자** | `src/core/implicitSubscripts.ts` | `x1` -> `x_1` 등 첨자 자동 변환 로직. |
| **스마트 괄호** | `src/core/autoBracing.ts` | `_`, `^` 뒤의 자동 중괄호 `{}` 삽입 및 이스케이프 처리. |
| **자동 \left/\right** | `src/core/autoLeftRight.ts` | 수식 요소 높이에 따른 괄호 자동 확장. |
| **수식 모드 자동 전환** | `src/core/mathAutoWrap.ts` | 그리스 문자 등 입력 시 자동으로 `$ $` 삽입. |
| **분수 자동 변환** | `src/core/fractionShorthand.ts` | `1/2` -> `\frac{1}{2}` 등 분수 숏핸드 처리. |
| **마크다운 스타일** | `src/core/markdownLatex.ts` | `**bold**`, `- item` 등 마크다운 문법 변환. |
| **스마트 따옴표** | `src/core/smartQuotes.ts` | `"` 입력 시 `` ` 또는 `''`로 상황별 변환. |
| **말줄임표 변환** | `src/core/ellipsis.ts` | `...` 입력 시 `\dots` 또는 `\cdots`로 변환. |
| **수식 계층 점프** | `src/core/nodeNavigation.ts` | `Alt+방향키`를 이용한 수식 내 구조적 이동. |
| **단위 확장** | `src/core/unitExpander.ts` | `10m/s` -> `\SI{10}{m/s}` 변환 로직. |
| **수식 자동 분할** | `src/core/mathSplitter.ts` | 긴 수식을 `align` 환경으로 분할. |
| **라벨 감지 및 관리** | `src/core/labelDetection.ts` | 라벨 탐색, 미사용 라벨 확인 및 삭제. |
| **매크로 관리** | `src/core/macroManager.ts` | 컨텍스트 인지 매크로 정의 및 실행. |
| **스캔 방지** | `src/core/scanPrevention.ts` | 보안용 스캔 방지 패턴 삽입. |
| **다이어크리틱** | `src/core/diacritics.ts` | `\hat`, `\tilde` 등 상단 기호 입력 명령. |
| **스마트 줄바꿈** | `src/core/smartNewline.ts` | 수식 환경 내 `Enter` 입력 시 `\\` 및 `&` 자동 삽입. |
| **수식 전용 리가처** | `src/core/mathLigatures.ts` | `<=`, `->` 등 기호 조합의 LaTeX 명령어 즉시 변환. |
| **최근 기호 추천** | `src/core/recentSymbols.ts` | `Alt+Q` 시 문서 내 빈도 기반 기호 자동완성 제공. |
| **스마트 선택 확장** | `src/core/selectionExpansion.ts` | 수학적 계층 구조에 따른 단계별 선택 영역 확장. |
| **환경 이름 동기화** | `src/core/linkedEditing.ts` | `\begin`과 `\end` 사이의 환경 이름 실시간 동기화. |
| **외부 데이터 붙여넣기** | `src/core/pasteExternalData.ts` | Excel/CSV/TSV 데이터를 LaTeX `matrix`/`tabular`로 변환. Smart Escape, 지수/천단위 포맷, Booktabs/Array 스타일 지원. |
| **외부 데이터 붙여넣기 통합** | `src/core/pasteExternalDataProvider.ts` | `DocumentPasteEditProvider` 구현. VS Code 기본 붙여넣기 메뉴에 "Paste as LaTeX Matrix/Table" 주입. |

## Extension Entry & UI

- **진입점 (`src/extension.ts`)**: 확장 프로그램의 활성화(`activate`) 및 모든 기능 등록/초기화가 이루어지는 곳입니다.
- **Python 서비스 (`src/services/pythonService.ts`)**: 파이썬 프로세스 생명주기 관리 및 비동기 통신 전담.
- **웹뷰 프로바이더 (`src/ui/webviewProvider.ts`)**: 우측 패널의 UI 구성, 표 생성기 인터페이스, 라벨 그래프 시각화 등을 담당합니다.
- **설정 정의 (`package.json`)**: 모든 설정 항목(Configuration), 명령어(Commands), 단축키(Keybindings)가 정의되어 있습니다.

## Python Backend (`python_backend/`)

- **서버 (`server.py`)**: VS Code와 통신하는 메인 데몬.
- **계산 엔진 (`calc_engine.py`)**: SymPy를 이용한 모든 수치/기호 연산 처리.
- **행렬 처리 (`matrix.py`)**: 행렬 연산 및 분석.
- **그래프 생성 (`plot_engine.py`)**: 2D/3D 그래프 및 복소수 도메인 컬러링.
- **인용구 관리 (`cite_engine.py`)**: DOI/제목 기반 서지 정보 검색 및 `.bib` 관리.
- **수열 검색 (`oeis_engine.py`)**: OEIS 데이터베이스 연동.

---
*마지막 업데이트: 2026-05-26*
