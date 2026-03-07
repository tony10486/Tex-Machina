# TeX-Machina 프로젝트 개선 제안서 (Unified)

이 문서는 TeX-Machina VS Code 확장 프로그램의 코드베이스 분석을 통해 도출된 아키텍처, 성능, 유지보수 및 UX 측면의 종합적인 개선 방안을 정리한 것입니다.

## 1. 확장 프로그램 아키텍처 (Extension Architecture)

### 1.1 `extension.ts` 리팩토링 (God Object 분리)
- **현황**: `extension.ts`가 Python 프로세스 관리, 명령어 등록, UI 업데이트, 설정 로드 등 너무 많은 책임을 보유(700라인 이상).
- **개선**: 기능을 전문화된 서비스 클래스로 분리하여 모듈성 확보.
    - `PythonBridge`: Python 프로세스 생명주기 및 `stdin/stdout` 통신(JSON-RPC 스타일) 관리.
    - `CommandManager`: VS Code 명령어(`registerCommand`) 등록 및 라우팅.
    - `WebviewManager`: 웹뷰 프로바이더 등록, 메시징 및 UI 상태 관리.
    - `StatusManager`: 상태 표시줄(StatusBar) 및 전역 상태(현재 에디터, 선택 영역 등) 관리.

### 1.2 Webview Modernization
- **현황**: `webviewProvider.ts` 내부에 거대한 HTML/JS/CSS 문자열이 포함되어 유지보수 및 타입 체크가 어려움.
- **개선**: 프론트엔드 코드(Svelte, React, 또는 Pure TS)를 별도 프로젝트로 분리하고 `esbuild`로 번들링하여 로드하도록 변경.

### 1.3 세션 격리 및 요청 라우팅
- **문제**: 여러 에디터 탭에서 발생하는 비동기 응답이 전역 변수 공유로 인해 섞일 위험이 있음.
- **개선**: 요청마다 고유한 `requestId`를 부여하고, 이를 기반으로 콜백을 매칭하는 `RequestRouter` 패턴 도입.

## 2. 통신 프로토콜 및 백엔드 (Bridge & Backend)

### 2.1 통신 프로토콜 정형화 (Schema-based JSON-RPC)
- **개선**: TypeScript(`Zod`)와 Python(`Pydantic`)을 사용하여 양측의 데이터 스키마를 엄격히 검증.
- **에러 전파**: Python 예외 발생 시 `traceback`을 구조화된 JSON 응답에 포함하여 구체적인 에러 원인과 스택 트레이스를 확인할 수 있게 개선.

### 2.2 Python 엔진 성능 및 구조 최적화
- **비동기 처리**: `asyncio` 또는 워커 스레드를 활용하여 무거운 작업(ODE solving, 대량 쿼리)이 다른 요청을 차단하지 않도록 개선.
- **`calc` 기능의 모듈화**: 
    - **플러그인 레지스트리**: 데코레이터(`@register_calc`)를 사용하여 각 계산 기능을 독립 파일로 분리하고 동적으로 로드.
    - **표준 파이프라인**: 모든 모듈이 `Pre-process -> Validate -> Compute -> Post-process` 인터페이스를 따르도록 설계.
- **시각화 데이터 관리**: 오래된 `.dat` 파일을 자동 삭제하는 `DataGarbageCollector` 도입 및 대용량 데이터의 이진(Base64) 전송 검토.

## 3. 핵심 로직 및 파싱 (Parsing & Logic)

### 3.1 정규표현식 기반 파싱의 한계 극복
- **현황**: 복잡한 LaTeX 구조나 중첩된 괄호 처리에 취약하며, 명령어 구분자(` /`, `>`)가 수식 내 연산자와 충돌할 위험이 있음.
- **개선**: 
    - `latex-utensils` 등 AST 파서를 도입하여 구조적 분석 수행.
    - `latex2sympy2` AST를 직접 조작하여 더 정교한 수식 변환 구현.
    - `commandParser.ts`를 상태 머신 기반으로 개편하여 문맥에 따른 구분자 해석 강화.

### 3.2 지능형 내비게이션 및 스캔
- **시맨틱 내비게이션**: 수식 구조를 트리 형태로 파싱하여 "분자 -> 분모 -> 다음 항" 순으로 논리적 이동 구현.
- **증분 인덱싱(Incremental Indexing)**: 대규모 프로젝트에서 수정된 파일의 라벨 정보만 부분적으로 재스캔하여 성능 최적화.

## 4. 테스트 및 품질 관리 (QA & DevOps)

### 4.1 테스트 자동화 강화
- **통합 테스트**: 실제 Python 프로세스와 통신하는 엔드투엔드(E2E) 테스트 시나리오 추가.
- **회귀 테스트**: 주요 수학 연산(ODE, Integral, Laplace 등)에 대한 100개 이상의 표준 LaTeX 입출력 테스트 케이스 확보.

### 4.2 CI/CD 및 모니터링
- **자동화**: GitHub Actions를 통해 Push/PR 시 린트, 타입 체크, 테스트 자동 실행.
- **성능 모니터링**: 명령어 실행 시간을 측정하여 지연 발생 시 사용자에게 진행 상태(Progress Bar) 표시.

## 5. 기타 UX 및 확장성

- **사용자 정의 확장**: 단위(`unitExpander.ts`) 및 매크로 리스트를 하드코딩하지 않고 `package.json` 설정을 통해 사용자가 직접 등록 가능하게 변경.
- **의존성 관리**: `requirements.txt` 내 라이브러리 버전을 고정(Pinning)하여 개발 및 사용자 환경의 일관성 유지.
