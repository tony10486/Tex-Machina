# 기능 16: 표/행렬 외부 데이터 붙여넣기 (Excel/CSV to Matrix/Tabular)

> **목표**: 엑셀, 구글 시트, CSV 등 외부 프로그램에서 복사한 셀 데이터를 VS Code LaTeX 에디터에 붙여넣을 때, 자동으로 `&`와 `\\`가 적용된 LaTeX `matrix` 또는 `tabular` 코드로 변환합니다.
> **품질 기준**: 상용(Commercial) 수준의 정확도, 예측 가능한 동작, 뛰어난 사용자 경험(UX).

---

## 1. 핵심 설계 결정 (Design Decisions)

### 1.1 작동 메커니즘: `DocumentPasteEditProvider` + Smart Detection
- **VS Code API**: `vscode.DocumentPasteEditProvider` (VS Code 1.85+)를 구현합니다.
- **동작 흐름**:
  1. 사용자가 외부 데이터를 복사 후 `Ctrl+V` (또는 `Cmd+V`) 실행.
  2. VS Code의 Native Paste 메뉴에 **"Paste as LaTeX Matrix/Table"** 옵션이 추가됩니다.
  3. **또는** (설정에 따라) 일반 붙여넣기를 감지하여, 탭/쉼표 구분 데이터를 인식하면 **자동으로 QuickPick**을 띄워 "LaTeX로 변환하시겠습니까?"를 묻습니다.
- **선택 이유**: VS Code 표준 API를 사용하여 확장 프로그램 간 충돌을 최소화하고, 사용자가 기대하는 네이티브 붙여넣기 경험을 유지하면서 고급 기능을 주입합니다.

### 1.2 출력 형식 결정 로직
- **자동 감지**: 커서가 수식 환경(`$...$`, `\[...\]`, `\begin{equation}...`, `\begin{align}...`, `\(...\)`) 내부에 있으면 **Matrix** 모드.
- **기본**: 커서가 일반 텍스트 영역이면 **Tabular** 모드.
- **수동 설정**: 모든 경우에 대해 QuickPick으로 "Matrix / Tabular / Cancel"을 묻는 옵션도 제공 (설정 `pasteExternalData.alwaysAskMode`).

### 1.3 Tabular 하위 스타일
- **Array 스타일**: `\begin{tabular}{ccc} ... \hline ... \end{tabular}` (classic).
- **Booktabs 스타일**: `\begin{tabular}{ccc} \toprule ... \midrule ... \bottomrule \end{tabular}` (modern, academic).
- **설정**: `tex-machina.pasteExternalData.tabularStyle` (`"array"` | `"booktabs"`)으로 기본값 설정.

---

## 2. 데이터 파이프라인 (Data Pipeline)

### 2.1 Stage 1: 클립보드 파싱 (Clipboard Parsing)
1. **MIME 타입 우선순위**:
   - `text/html` (Excel/Sheets가 복사할 때 제공): `<table>` 태그 파싱 → 행/열 구조 정확히 추출.
   - `text/tab-separated-values` (TSV): `\t` 기준 분할.
   - `text/plain`: 탭(`\t`) 우선, 없으면 쉼표(`,`) 또는 세미콜론(`;`)으로 분할. **따옴표 내 쉼표는 무시** (RFC 4180 준수).
2. **인코딩**: UTF-8 기준. BOM(`\ufeff`)은 제거.
3. **불규칙한 행 처리**: 모든 행을 **최대 열 개수**에 맞춰 빈 셀(`""`)로 자동 패딩. 단, 빈 행(모든 셀이 `""`)은 제거할지 설정으로 결정.

### 2.2 Stage 2: 셀 데이터 정제 (Cell Sanitization)
1. **Smart Escape**:
   - `\`로 시작하는 문자열: LaTeX 명령어로 간주, **보존** (예: `\alpha`, `\sum`, `\frac{1}{2}`).
   - 나머지 문자열: LaTeX 특수 문자 Escape 적용:
     - `&` → `\&`
     - `%` → `\%`
     - `$` → `\$`
     - `#` → `\#`
     - `_` → `\_`
     - `{` → `\{`
     - `}` → `\}`
     - `~` → `\textasciitilde{}`
     - `^` → `\textasciicircum{}`
     - `\` (단독, 명령어 아님) → `\textbackslash{}`
2. **숫자 포맷 변환**:
   - **천 단위 구분 쉼표**: `1,234.56` → `1\,234.56` (LaTeX 수평 간격). 단, 소수점이 없는 `1,234`도 동일하게 처리.
   - **지수 표기**: `1.23E+05` 또는 `1.23e5` → `1.23 \times 10^{5}`. 소문자/대문자 `e` 모두 대응.
   - **음수**: `-123`은 그대로. 다만 텍스트 모드에서 마이너스 기호가 `-`가 아닌 `$-$`가 되어야 할 필요는 없음 (tabular/math mode에 따라 달라질 수 있으나, 일단 Smart Escape 범주 밖).
3. **공백 처리**: 셀 내 앞뒤 공백은 `trim()` 적용. 셀 내부의 다중 공백은 LaTeX에서 무시되므로 그대로 두거나, `~`로 변환하지 않음 (설정으로 선택 가능).

### 2.3 Stage 3: 열 정렬 자동 감지 (Column Alignment Detection)
- **알고리즘** (행렬/Tabular 모두 적용):
  - 셀이 전부 숫자(정수, 실수, 지수 표기 포함) → `r` (Right aligned).
  - 셀이 전부 텍스트(알파벳, 한글, 특수 문자 포함) → `l` (Left aligned).
  - 혼합(숫자+텍스트) 또는 헤더로 추정(첫 행만 텍스트, 나머지 숫자) → `c` (Center aligned).
- **설정**: `tex-machina.pasteExternalData.alignmentMode` (`"auto"` | `"allCenter"` | `"allLeft"` | `"allRight"`)으로 사용자가 완전 수동 제어 가능.
- **Tabular 전용**: `\begin{tabular}{|r|c|l|}` 형태로 생성.
- **Matrix 전용**: 열 정렬은 행렬 환경 내에서 의미가 없으므로, 이 단계는 Tabular/Array 모드에서만 사용.

### 2.4 Stage 4: LaTeX 코드 생성 (Code Generation)

#### Matrix 모드 출력
```latex
\begin{pmatrix}
  a & b & c \\
  d & e & f \\
  g & h & i
\end{pmatrix}
```
- **환경 선택**: QuickPick 또는 설정으로 `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`, `matrix` 선택 가능.
- **행 구분**: 각 행 끝에 ` \\` 추가. 마지막 행은 선택적으로 ` \\` 추가 (설정 `trailingNewline`).
- **들여쓰기**: 현재 에디터의 들여쓰기(탭/공백) 및 깊이를 자동으로 감지하여 적용.

#### Tabular (Array) 모드 출력
```latex
\begin{tabular}{|r|c|l|}
  \hline
  Header 1 & Header 2 & Header 3 \\
  \hline
  1 & 2 & 3 \\
  4 & 5 & 6 \\
  \hline
\end{tabular}
```
- **테두리**: 설정 `pasteExternalData.hasBorders` (`true`/`false`). `true` 시 `|` 및 `\hline` 추가.
- **헤더 행 인식**: 설정 `pasteExternalData.hasHeader` (`true`/`false`/`auto`). `auto`일 때 첫 행이 텍스트이고 나머지가 숫자면 헤더로 간주. 헤더 햼 뒤 `\hline` 추가.

#### Tabular (Booktabs) 모드 출력
```latex
\begin{tabular}{rcl}
  \toprule
  Header 1 & Header 2 & Header 3 \\
  \midrule
  1 & 2 & 3 \\
  4 & 5 & 6 \\
  \bottomrule
\end{tabular}
```
- **Borderless**: Booktabs 스타일에서는 `|`와 `\hline`을 **절대 사용하지 않음**. `\toprule`, `\midrule`, `\bottomrule`만 사용.
- **헤더 구분**: 헤더 행이 감지되면 첫 번째 `\midrule`은 헤더 뒤에 배치. (첫 행: `\toprule` → 데이터 → `\midrule` → ... → `\bottomrule`).

---

## 3. 사용자 경험 (UX) 흐름

### 시나리오 A: 커서가 수식 환경 내부
1. 사용자가 엑셀에서 데이터 복사.
2. `Ctrl+V` 실행.
3. (설정 `autoPrompt: true`인 경우) "외부 데이터를 LaTeX Matrix로 변환할까요?" QuickPick 표시.
4. 사용자가 "예" 선택 → Matrix QuickPick (`pmatrix`, `bmatrix`...) 표시 → 코드 삽입.

### 시나리오 B: 커서가 일반 텍스트
1. 사용자가 엑셀에서 데이터 복사.
2. `Ctrl+V` 실행.
3. (설정 `autoPrompt: true`인 경우) "외부 데이터를 LaTeX Tabular로 변환할까요?" QuickPick 표시.
4. 사용자가 "예" 선택 → Tabular QuickPick (`array style`, `booktabs style`) 표시 → 코드 삽입.

### 시나리오 C: 미리보기 (Preview)
- **설정**: `pasteExternalData.showPreview` (`true`/`false`).
- `true`일 경우, QuickPick에 데이터의 첫 3행을 미리보기로 표시:
  ```
  [Preview]
  a & b & c \\
  d & e & f \\
  ... (4 more rows)
  
  [Insert as] > bmatrix
  [Cancel]
  ```

---

## 4. 설정 (Configuration) 명세

`package.json`에 다음 설정을 추가합니다:

```json
{
  "tex-machina.pasteExternalData.enabled": {
    "type": "boolean",
    "default": true,
    "description": "외부 데이터 자동 변환 기능을 활성화합니다."
  },
  "tex-machina.pasteExternalData.autoPrompt": {
    "type": "boolean",
    "default": true,
    "description": "탭/쉼표 구분 데이터를 감지하면 자동으로 변환 여부를 묻습니다."
  },
  "tex-machina.pasteExternalData.defaultMode": {
    "type": "string",
    "enum": ["auto", "matrix", "tabular"],
    "default": "auto",
    "description": "붙여넣기 시 기본 모드. 'auto'는 커서 위치의 수식 환경을 감지합니다."
  },
  "tex-machina.pasteExternalData.alwaysAskMode": {
    "type": "boolean",
    "default": false,
    "description": "항상 Matrix/Tabular 선택 QuickPick을 표시합니다."
  },
  "tex-machina.pasteExternalData.matrixType": {
    "type": "string",
    "enum": ["pmatrix", "bmatrix", "vmatrix", "Vmatrix", "Bmatrix", "matrix"],
    "default": "bmatrix",
    "description": "Matrix 모드에서 사용할 기본 행렬 환경."
  },
  "tex-machina.pasteExternalData.tabularStyle": {
    "type": "string",
    "enum": ["array", "booktabs"],
    "default": "array",
    "description": "Tabular 모드에서 사용할 기본 스타일."
  },
  "tex-machina.pasteExternalData.alignmentMode": {
    "type": "string",
    "enum": ["auto", "allCenter", "allLeft", "allRight"],
    "default": "auto",
    "description": "열 정렬 방식. 'auto'는 데이터 타입에 따라 자동 감지합니다."
  },
  "tex-machina.pasteExternalData.hasBorders": {
    "type": "boolean",
    "default": true,
    "description": "Array 스타일 Tabular에서 테두리(|, \\hline)를 추가합니다."
  },
  "tex-machina.pasteExternalData.hasHeader": {
    "type": "string",
    "enum": ["auto", "true", "false"],
    "default": "auto",
    "description": "첫 행을 헤더로 간주할지 여부. 'auto'는 첫 행이 텍스트일 때 자동 감지."
  },
  "tex-machina.pasteExternalData.escapeMode": {
    "type": "string",
    "enum": ["smart", "all", "none"],
    "default": "smart",
    "description": "특수 문자 이스케이프 방식. 'smart'는 LaTeX 명령어(\\...)는 보존합니다."
  },
  "tex-machina.pasteExternalData.showPreview": {
    "type": "boolean",
    "default": true,
    "description": "변환 전 변환될 코드의 미리보기를 QuickPick에 표시합니다."
  },
  "tex-machina.pasteExternalData.removeEmptyRows": {
    "type": "boolean",
    "default": true,
    "description": "데이터의 완전히 빈 행(Empty Row)을 제거합니다."
  }
}
```

---

## 5. 파일별 구현 계획 (Implementation Steps)

### Phase 1: 핵심 유틸리티 및 파서 (`src/core/pasteExternalData.ts`)
**책임**: 모든 데이터 처리 로직을 순수 함수로 구현하여 테스트 용이성 확보.

#### 5.1.1 데이터 파싱
- `parseClipboardData(clipboardText: string): string[][]`
  - TSV(탭) 우선, 쉼표/세미콜론 fallback.
  - CSV 따옴표 처리 `"..."` (RFC 4180).
  - 빈 행 제거 (설정 기반).
  - 불규칙한 행 → 빈 문자열 `""`로 패딩.

#### 5.1.2 Smart Escape
- `smartEscapeCell(cell: string): string`
  - `\[a-zA-Z]+` 패턴 감지 시 보존.
  - 나머지 특수 문자 Escape.
- `formatNumber(cell: string): string`
  - 천 단위 쉼표 → `\,`.
  - 지수 표기 → `\times 10^{...}`.

#### 5.1.3 열 정렬 감지
- `detectColumnAlignment(rows: string[][]): string[]`
  - 각 열의 모든 셀이 숫자면 `r`, 텍스트면 `l`, 혼합이면 `c`.
  - 숫자 판정: `/^[\d\s\,\.\+\-eE]+$/` (간략화).

#### 5.1.4 LaTeX 생성
- `generateMatrixLatex(rows: string[][], envName: string, indent: string): string`
- `generateTabularLatex(rows: string[][], alignments: string[], style: 'array'|'booktabs', hasBorders: boolean, hasHeader: boolean, indent: string): string`

### Phase 2: VS Code 통합 (`src/core/pasteExternalDataProvider.ts`)
**책임**: VS Code API와 연동하는 Paste Provider.

- **`PasteExternalDataProvider` 클래스** 구현:
  - `DocumentPasteEditProvider` 인터페이스 구현.
  - `prepareDocumentPaste`: 클립보드 데이터를 사전 분석하여 `DocumentPasteEdit` 준비.
  - `provideDocumentPasteEdits`: 실제 변환된 텍스트를 `DocumentPasteEdit`로 반환.
- **QuickPick 통합**:
  - `showPasteOptionsPrompt(parsedData: string[][], position: vscode.Position): Promise<string | null>`
  - 커서 위치의 수식 환경 감지 (`findInnermostEnvAtPos` 재사용).
  - Matrix/Tabular 모드 선택, 세부 옵션(환경명, 스타일) 선택.

### Phase 3: Extension 등록 (`src/extension.ts`)
- `registerPasteExternalData(context)` 호출 추가.
- `DocumentPasteEditProvider`를 `latex` 언어에 대해 등록:
  ```typescript
  vscode.languages.registerDocumentPasteEditProvider('latex', new PasteExternalDataProvider(), {
      providedPasteEditKinds: [vscode.DocumentPasteEditKind.Empty.append('latex')]
  })
  ```

### Phase 4: 설정 및 명령어 추가 (`package.json`)
- 위 Configuration 명세에 맞는 설정 추가.
- (선택) 명령어 추가: `tex-machina.pasteExternalData.forceMatrix`, `tex-machina.pasteExternalData.forceTabular` (키보드 단축키용).

### Phase 5: 테스트 (`src/test/pasteExternalData.test.ts`)
- **단위 테스트** (순수 함수 중심, 빠름):
  - 다양한 CSV/TSV 입력 파싱.
  - Smart Escape 케이스 (`\alpha`, `100%`, `1,234`).
  - 지수 표기 변환.
  - 불규칙 행 패딩.
  - 열 정렬 자동 감지.
- **통합 테스트** (VS Code Test Framework, 느림):
  - 클립보드 모킹 후 붙여넣기 이벤트 시뮬레이션.
  - 실제 에디터에 코드 삽입 및 커서 위치 검증.

---

## 6. 테스트 시나리오 (Test Scenarios)

### 6.1 단위 테스트 (Unit Tests)

| # | 입력 | 예상 결과 | 설명 |
|---|---|---|---|
| 1 | `a\tb\tc` | `[["a","b","c"]]` | 기본 TSV 파싱 |
| 2 | `1,2,3\n4,5,6` | `[["1","2","3"],["4","5","6"]]` | 기본 CSV 파싱 |
| 3 | `"He said, \"Hi\"",2` | `[["He said, \"Hi\"","2"]]` | 따옴표 내 쉼표 무시 |
| 4 | `a\tb\n1\t2\t3` | `[["a","b",""],["1","2","3"]]` | 불규칙 행 패딩 |
| 5 | `1,234.56` | `1\,234.56` | 천 단위 쉼표 → 수평 간격 |
| 6 | `1.23E+05` | `1.23 \times 10^{5}` | 지수 표기 변환 |
| 7 | `\alpha & 100%` | `\alpha` 보존, `\&` `\%` Escape | Smart Escape |
| 8 | `1,2\n3,4,5\n6` | `[["1","2",""],["3","4","5"],["6","",""]]` | 복잡한 불규칙 패딩 |

### 6.2 통합 테스트 (Integration Tests)

| # | 동작 | 검증 항목 |
|---|---|---|
| 1 | 수식 내부에서 붙여넣기 | `\begin{bmatrix}` 생성 여부 |
| 2 | 일반 텍스트에서 붙여넣기 | `\begin{tabular}` 생성 여부 |
| 3 | Booktabs 설정 후 붙여넣기 | `\toprule`, `\midrule`, `\bottomrule` 포함 여부 |
| 4 | 미리보기 QuickPick 표시 | 첫 3행이 QuickPick에 표시되는지 |

---

## 7. 기존 코드 재사용 (Code Reuse)

- **`src/core/latexParser.ts`**: `findInnermostEnvAtPos`, `isInsideComment`를 사용하여 커서가 수식 환경 내부인지 판정.
- **`src/core/matrixResizer.ts`**: 행렬 환경명 리스트(`isMatrixLike`)를 재사용하거나, 동일한 판정 로직을 공유.
- **`src/core/tableGenerator.ts`**: 기존 Tabular 생성 로직의 인터페이스(`TableOptions`)를 참고하여 일관성 유지. 다만 이번 기능은 동적 데이터를 받으므로 별도 모듈로 구현하되, 스타일(들여쓰기 등)은 맞춤.

---

## 8. 리스크 및 대응 (Risks & Mitigation)

| 리스크 | 영향 | 대응 |
|---|---|---|
| **VS Code Paste API 버전 차이** | 사용자의 VS Code 버전이 낮으면 API 미지원 | `DocumentPasteEditProvider`는 1.85+에 도입되었고, 이 프로젝트는 1.109+를 타겟으로 하므로 문제 없음. 안전장치로 `try-catch` 및 API 존재 여부 확인. |
| **클립보드 데이터 손상** | Excel이 HTML이 아닌 plain text만 제공 | TSV/Plain text fallback 파서가 견고하게 설계되어 있음. |
| **잘못된 자동 감지** | 텍스트 데이터를 행렬로 변환 | `autoPrompt`가 `true`인 경우 항상 사용자에게 확인. `alwaysAskMode`로 완전 수동 모드 가능. |
| **Performance** | 대용량 데이터(수천 행) 붙여넣기 시 지연 | 행 수가 100개 초과일 경우 "데이터가 큽니다. 일부만 변환할까요?" 경고 또는 `setTimeout` 기반 비동기 처리. |
| **Conflict with other extensions** | 다른 Paste Provider와 충돌 | VS Code는 여러 Provider를 동시에 지원. 우리의 Provider는 `kind`를 명시하여 충돌 최소화. |

---

## 9. 일정 (Timeline)

| 단계 | 작업 | 예상 소요 |
|---|---|---|
| **1** | 계획 확정 및 본 문서 최종 리뷰 | 1h |
| **2** | `src/core/pasteExternalData.ts` (순수 로직) 구현 | 4h |
| **3** | `src/core/pasteExternalDataProvider.ts` (VS Code 통합) 구현 | 3h |
| **4** | `src/extension.ts` 등록 및 `package.json` 설정/명령어 추가 | 1h |
| **5** | 단위 테스트 작성 (`src/test/pasteExternalData.test.ts`) | 3h |
| **6** | 통합 테스트 및 수동 QA (Excel, Google Sheets, CSV 파일) | 2h |
| **7** | `MAP.md` 업데이트 및 문서화 | 0.5h |
| **합계** | | **~14.5h** |

---

## 10. 기타 고려사항

- **한국어/다국어 지원**: 엑셀에서 복사한 한글 데이터가 깨지지 않도록 `text/html` 파싱 시 `charset=utf-8` 명시적 처리.
- **수식 데이터 연동**: 셀에 `=3.14*sqrt(2)` 같은 수식이 들어있는 경우, 이는 **이미 계산된 값**이 클립보드에 올라오므로(Excel의 기본 복사 동작), 추가 처리는 필요 없음. 다만 향후 "수식 그대로 가져오기" 확장을 염두에 두고 인터페이스를 유연하게 설계.
- **Undo/Redo**: `DocumentPasteEditProvider`를 통해 삽입하면 VS Code의 기본 Undo 스택에 자동으로 쌓이므로 `Ctrl+Z`가 정상 작동.

---

*계획서 작성일: 2026-05-30*
*버전: 1.0*
*상태: Review Pending*
