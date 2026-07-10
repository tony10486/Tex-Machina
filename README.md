# TeX-Machina
TeX-Machina는 VS code용 LaTeX 확장 프로그램입니다. LaTeX 문서를 작성하면서 필요한 기능과, 반복 작업의 간편화를 위해 제작되었습니다. 
## Features
### Calculation
NumPy, SymPy, SciPy 패키지를 이용한 기호 기반 연산 기능입니다. `calc` 명령어를 통해 사용할 수 있습니다.

### 상세 예시 및 활용 
`calc` 기능은 문서 내의 LaTeX 수식을 드래그(선택)한 후 명령어를 입력하거나, 명령어 뒤에 직접 수식을 입력하여 사용할 수 있습니다.
- 미분/적분: 복잡한 합성함수의 미분이나 치환/부분적분이 필요한 수식도 한 번에 계산합니다.
  - 사용: `\frac{\sin(x)}{x}` 선택 -> `calc > diff > x` 입력
  - 결과: `\frac{\cos(x)}{x} - \frac{\sin(x)}{x^2}`
- 테일러 급수: 특정 지점에서의 근사식을 생성합니다.
  - 사용: `e^x` 선택 -> `calc > taylor / 5` 입력
  - 결과: `1 + x + \frac{x^2}{2} + \frac{x^3}{6} + \frac{x^4}{24} + O(x^5)`
- 자동 행렬곱: `\begin{pmatrix} ... \end{pmatrix} \cdot \begin{pmatrix} ... \end{pmatrix}` 형태를 감지하여 결과 행렬을 생성합니다.
- RREF 및 행렬식: 선형 시스템 풀이를 위한 기약 행사다리꼴 변환이나 역행렬 존재 여부 확인이 간편합니다.
  - 사용: 3x3 행렬 선택 -> `calc > rref`
  - 특징: 계산 과정에서 분수 형태(`\frac{a}{b}`)를 유지하여 정확한 대수적 결과를 제공합니다.
- 대수적인 방정식의 풀이: 다항방정식뿐만 아니라 초월함수가 포함된 방정식의 해를 구합니다.
  - 사용: `x^2 - 5x + 6 = 0` -> `calc > solve` -> 결과: `x=2, 3`
- 미분방정식과 초기조건: `y'' + y = 0` 선택 -> `calc > ode / ic=y(0):1,y'(0):0` 입력
  - 결과: `y(x) = \cos(x)`
- 단위/차원 검사 (`dimcheck`): 수식의 좌변과 우변의 물리적 차원이 일치하는지 검사합니다.
  - 사용: `E = mc^3` 선택 -> `calc > dimcheck`
  - 결과: `Dimension Error: L^2 M T^{-2} \neq L^3 M T^{-3}` (에러 위치와 차원 차이 표시)
- 적분 변환: 라플라스, 푸리에 변환을 통해 제어 공학이나 신호 처리 수식을 정리합니다.
  - 사용: `\sin(at)` 선택 -> `calc > laplace`
  - 결과: `\frac{a}{s^2 + a^2}`

### 식 정리 및 간소화
- `simplify`: 결과가 너무 복잡할 때 SymPy를 사용하여 식을 가장 짧은 형태로 정리합니다.
- `trigsimp`: `\sin^2(x) + \cos^2(x)`와 같은 삼각항등식을 계산합니다.
- `apart` (부분분수): 복잡한 유리함수를 적분하기 쉬운 형태로 쪼갭니다.
  - 사용: `\frac{1}{x^2-1}` -> `calc > apart` -> 결과: `\frac{1}{2(x-1)} - \frac{1}{2(x+1)}`

### 행렬 생성 도구 (`matrix >`)
복잡하고 귀찮은 행렬 입력 과정을 간단하게 해결할 수 있습니다.

#### 1. 기본 환경 및 스타일 선택
명령어 뒤에 한 글자 옵션을 붙여 괄호 스타일을 결정할 수 있습니다.
- `matrix > p >` : 소괄호 (`pmatrix`, `( )`)
- `matrix > b >` : 대괄호 (`bmatrix`, `[ ]`) - 기본값
- `matrix > v >` : 수직바 (`vmatrix`, `| |`) - 주로 행렬식(Determinant) 표현에 사용
- `matrix > V >` : 이중 수직바 (`Vmatrix`, `|| ||`)
- `matrix > B >` : 중괄호 (`Bmatrix`, `{ }`)

#### 2. 데이터 입력 방식
- 직접 입력 : 쉼표(`,`)로 열을, 슬래시(`/`) 또는 세미콜론(`;`)으로 행을 구분합니다.
  - 예: `matrix > 1, 2 / 3, 4` -> $\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}$ 생성
- 크기 지정 (Template): 데이터 없이 크기만 지정하면 해당 크기의 빈 행렬을 만듭니다.
  - 예: `matrix > 3x3`
- 회전 변환 행렬: 특수 명령어 `transform`을 통해 회전 행렬을 즉시 생성합니다.
  - 예: `matrix > transform > \theta` -> $\begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}$ 생성

#### 3. 스마트 기능 및 옵션
- 스마트 점 (`/ fill_dots`): 행렬 중간에 빈칸이 있거나 패턴이 필요한 경우, `fill_dots` 옵션을 사용하면 `\dots`, `\vdots`, `\ddots`를 적절히 배치하여 수학적 생략 기호를 자동으로 채워줍니다.
  - 데이터 입력 중 빈 칸이 감지되면 자동으로 제안 팝업이 나타납니다.
- 행렬 분석 (`/ analyze`): 행렬을 생성함과 동시에 웹뷰 패널에 해당 행렬의 행렬식(det), 역행렬(inv), 기약 행사다리꼴(RREF) 분석 결과를 즉시 보여줍니다.
- 첨가 행렬 (`/ aug=n`): 특정 열 뒤에 수직선(`|`)을 추가하여 첨가 행렬(Augmented Matrix)을 만듭니다.
  - 예: `matrix > 1,0,5 / 0,1,2 / aug=2` (2열 뒤에 구분선 추가)

#### 4. 행렬 리사이저
작성된 행렬의 구조를 직관적으로 변경할 수 있습니다.
- 실행 방식: 행렬 코드 내부에 커서를 두고 `Alt + L M` (macOS: `Option + L M`)을 입력하거나, `Ctrl + .` (Quick Fix) 메뉴를 엽니다.
- 제공 기능:
  - `➕ 행 추가` / `➖ 행 삭제`
  - `➕ 열 추가` / `➖ 열 삭제`
- 지원 환경: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `cases`, `align`, `array`, `smallmatrix`, `subarray` 등.
- 특징: 중첩된 행렬을 정확히 감지하며, 분수(`\frac`) 등 복잡한 수식이 포함된 셀 내용도 안전하게 보존합니다.

### 그래프 시각화 (`plot >`)
수식의 그래프를 생성합니다.

*   2D 그래프 생성: 수식을 입력하면 LaTeX의 `PGFPlots` 패키지용 데이터와 코드를 자동으로 생성합니다. 별도의 데이터 파일 없이도 문서 내에서 정교한 2D 플롯을 구현할 수 있습니다.
*   3D 시각화 (X3DOM): 복잡한 3D 곡면이나 함수를 VS Code 내부 웹뷰 패널에서 마우스로 돌려보며 확인하고, 이를 PDF나 PNG 형태의 그림 파일로 즉시 내보낼 수 있습니다.
> 3D 시각화의 경우 완전히 최적화가 이루어지지 않아, 사용 상 불편함이 있을 수 있습니다. 버그를 찾으시면 깃허브의 Issues 기능을 사용해 주세요.

> 사용 예시
> *   2D: `\sin(x) \cdot e^{-0.1x}` 선택 → `plot > 2d / range=-10,10` 입력
>     *   결과: `\begin{tikzpicture} \begin{axis} ... \end{axis} \end{tikzpicture}` 형태의 코드가 삽입됩니다.
> *   3D: `x^2 - y^2` 선택 → `plot > 3d` 입력
>     *   결과: 웹뷰 패널에 말 안장 모양(Saddle point)의 3D 그래프가 나타나며 실시간으로 회전 및 확대가 가능합니다.
> *   복소함수: `z^3 - 1` 선택 → `plot > complex` 입력
>     *   결과: 영점(root)과 극점(pole)이 색상 변화로 뚜렷하게 구분되는 도메인 컬러링 맵이 생성됩니다.

### 수열 검색 (`oeis >`)
수열을 OEIS(Online Encyclopedia of Integer Sequences)를 통해 검색할 수 있습니다.

*   자동 완성 및 삽입: 검색된 수열의 이름, 수식, 그리고 처음 몇 개의 항을 문서에 바로 삽입할 수 있습니다.
*   수식 매칭: `1, 1, 2, 3, 5...`와 같이 숫자를 직접 입력하거나, 수열의 OEIS ID(예: `A000045`)를 통해 상세 정보를 불러옵니다.

> 사용 예시
> *   숫자로 검색: `oeis > 1, 2, 4, 8, 16` 입력
>     *   결과: `A000079: Powers of 2`라는 결과와 함께 관련 LaTeX 주석이나 수식이 제안됩니다.
> *   ID로 검색: `oeis > A000668` (메르센 소수)
>     *   결과: 해당 수열의 정의와 일반항이 팝업으로 표시되며 선택 시 문서에 삽입됩니다.

### 스마트 인용 (`cite >`)
논문 작성 시 참고문헌 관리와 `.bib` 파일 업데이트를 자동화합니다.

*   다양한 검색 식별자: DOI, arXiv ID, 또는 논문 제목만으로도 온라인 데이터베이스에서 정확한 서지 정보를 가져옵니다.
*   자동 .bib 업데이트: 검색된 논문 정보를 현재 프로젝트의 BibTeX 파일에 자동으로 추가하고, 문서에는 `\cite{...}` 명령어를 삽입합니다. 중복 확인 기능을 통해 동일한 논문이 여러 번 추가되는 것을 방지합니다.

> 사용 예시
> *   제목 검색: `cite > Attention is all you need` 입력
>     *   결과: 관련 논문 리스트가 나타나며, 선택 시 `Vaswani2017attention`과 같은 키가 생성되어 `\cite{Vaswani2017attention}`이 본문에 삽입되고 `.bib` 파일에 BibTeX 데이터가 추가됩니다.
> *   DOI 검색: `cite > 10.1145/3065386` 입력
>     *   결과: 해당 DOI의 논문 정보를 즉시 가져와 인용구를 생성합니다.

### 수식 선택 기능
수학적 계층 구조를 인식하여 선택 영역을 논리적으로 넓혀갑니다. 복잡한 수식의 특정 부분만 복사하거나 수정할 때 매우 유용합니다.

*   문자 → 괄호 내부 → 항(Term, `+`, `-`, `\cdot` 기준) → 변(Side, `=` 기준) → 수식 내용 전체 → 환경 전체 순으로 확장됩니다.
*   환경 보호: 확장 시 `\begin{...}` 태그나 불필요한 줄바꿈/들여쓰기를 지능적으로 제외하여 수식 내용에만 집중할 수 있습니다.

> 사용 예시
> *   단축키: `Shift + Alt + →` (확장) / `Shift + Alt + ←` (축소) (Windows)
> `Control + Shift + →` (확장) / `Control + Shift + ←` (축소)

### 수식 환경 변경
인라인 수식(`$`)을 `\[ \]` 환경, 또는 `\begin{equation}` 환경으로 한번에 변경하는 기능을 지원합니다. 커서를 수식 내에 두고, `Alt + L T` (Windows/macOS 공통, Option 키 유지 가능)를 눌러 순환 전환이 가능합니다. 전환 순서는 설정(`mathToggle.sequence`)에서 커스터마이징할 수 있습니다.

### 수식 자동 분할 (`split`)
긴 한 줄 수식을 여러 줄로 나누고 `=` 기호를 기준으로 정렬된 `align` 환경으로 자동 변환합니다.

*   지능형 분할: 수식 내의 괄호 깊이를 분석하여, 가장 바깥쪽에 있는 `=` 기호를 찾아 분할 지점으로 결정합니다.
*   환경 자동 전환: 인라인 수식(`$...$`)이나 단순 디스플레이 수식(`$$...$$`, `\[...\]`)을 자동으로 `\begin{align} ... \end{align}` 구조로 확장하며, 각 줄에 적절한 정렬 기호(`&`)와 줄바꿈(`\\`)을 삽입합니다.
*   너비 분석과 연계: `analyze > width` 기능을 통해 여백을 넘어가는 수식을 찾은 후, 이 기능을 사용하여 즉시 가독성 있게 정리할 수 있습니다.

> 사용 예시
> *   단축키: 수식 내부에서 `Ctrl+Shift+L` (macOS: `Cmd+Shift+L`) 입력
> *   직접 선택: 분할하려는 수식 영역을 드래그한 후 위 단축키를 입력합니다. (미선택 시 커서가 위치한 수식을 자동으로 감지합니다.)

### 라벨 시각화 및 종속성 관리 (`labels`)
문서 내의 `\label`과 `\ref` 관계를 분석하여 시각적 그래프로 보여줍니다.

*   대화형 그래프: 웹뷰 패널에서 라벨 간의 연결 구조(Section, Equation, Figure 등)를 그래프로 확인하고 마우스로 노드를 이동하거나 확대할 수 있습니다.
*   라벨 종속성 추가: 라벨 위에 마우스를 올리면(Hover) 나타나는 팝업을 통해 다른 라벨과의 논리적 선행 관계(Dependency)를 한 번의 클릭으로 추가할 수 있습니다 (`%(from:label)` 주석 사용).
*   미사용 라벨 감지: 어디에서도 참조되지 않는 라벨을 찾아내어 즉시 삭제할 수 있는 기능을 제공합니다.

### 수식 자동 계산 (Auto Calc)
수식 내부에서 `=..`을 입력하면 SymPy가 자동으로 수식을 계산하여 `=` 뒤에 결과를 삽입합니다.

- 동작 방식: `(x+1)^3=..` 까지 타이핑하면, SymPy가 `(x+1)^3`을 전개하여 `= x^3 + 3x^2 + 3x + 1`로 자동 완성합니다.
- 연산 자동 감지: 수식에 따라 적분(`\int`), 미분(`\frac{d}{dx}`), 극한(`\lim`), 전개(`expand`), 단순화(`simplify`) 등을 자동으로 선택합니다.
- 수식 환경: `$...$`, `$$...$$`, `\[...\]`, `\begin{equation}`, `\begin{align}`, `\begin{gather}` 등 모든 수식 환경에서 동작합니다.

> 사용 예시
> - `$ (x+1)^3 =.. $` → `$ (x+1)^3 = x^3 + 3x^2 + 3x + 1 $`
> - `$ \int x \sin(x) \, dx =.. $` → `$ \int x \sin(x) \, dx = \sin(x) - x\cos(x) $`

### 수식 고스트 텍스트 (Ghost Calc)
수식 내부에서 `=`을 입력하면 SymPy 계산 결과를 흐릿한 텍스트(Ghost Text/Inline Suggestion)로 제안하며, `Tab`을 누르면 결과가 삽입됩니다.

- 비동기 제안: Python 계산이 완료되는 즉시 Ghost Text가 나타납니다 (사용자가 기다리지 않음).
- 결과 캐싱: 동일한 수식을 다시 계산하지 않도록 최대 50개 결과를 10초간 캐싱합니다.
- 복잡한 계산 지원: `\int`, `\frac{d}{dx}`, `\lim` 등 모든 SymPy 연산을 지원합니다.
- 타임아웃: 기본 10초 (설정 가능). 타임아웃이 발생해도 사용자 흐름을 방해하지 않습니다.

> 사용 예시
> - `\int x \sin(x) \, dx =` 입력 → ` \sin(x) - x\cos(x)` Ghost Text → `Tab`으로 삽입
> - `(x+1)^3 =` 입력 → ` x^3 + 3x^2 + 3x + 1` Ghost Text → `Tab`으로 삽입

### 수식 계층별 이동 (Math Navigation)
복잡한 수식 내부에서 단순한 글자 단위가 아닌, 수학적 구조(분수 내부, 첨자 내부 등)를 기반으로 점프합니다.

*   구조적 이동: `Alt + 방향키`를 사용하여 분수의 분자/분모, 지수/밑, 괄호 내부 등 주요 "슬롯" 사이를 빠르게 오갈 수 있습니다.
*   내용 자동 선택: 슬롯 이동 시 해당 위치의 내용을 자동으로 블록 지정하여 즉시 수정이 가능합니다.
*   토글 방식: `Ctrl+Shift+' L` (macOS: `Cmd+Shift+' L`)로 기능을 켜고 끌 수 있습니다.

### 명령어 인자 간 전환 (Argument Navigation)
LaTeX 명령어의 괄호 인자(`{}` 또는 `[]`) 사이를 `Tab` / `Shift+Tab`을 눌러 이동합니다. 문서의 구조적 요소(저자, 제목, 패키지 등)를 순서대로 채울 때 유용합니다.

> 커서가 명령어 인자 밖에 있으면 VS Code의 기본 `Tab` 동작(들여쓰기 등)이 그대로 수행됩니다.

> 사용 예시
> *   `\author{홍길동}` 내부에서 `Tab` → `\title{[논문제목]}` 선택
> *   `\title{논문제목}` 내부에서 `Tab` → `\usepackage[utf8]{inputenc}`의 `{inputenc}` 선택 (`{}` 일관성)
> *   `\usepackage[utf8]` 내부에서 `Tab` → 다음 명령어의 `[]` 인자로 이동
> *   단축키: `Tab` (다음 인자) / `Shift+Tab` (이전 인자)

### 스마트 테이블 탭 (Smart Table Tab)
테이블 환경(`bmatrix`, `pmatrix`, `tabular`, `align`, `cases` 등) 내에서 `Tab` / `Shift+Tab`으로 셀 사이를 간단하게 이동합니다. `Tab`으로 다음 셀, `Shift+Tab`으로 이전 셀로 이동하며, 이동 시 셀 내용이 자동으로 선택됩니다. 

*   마지막 셀에서 `Tab`을 누르면 자동으로 `&`를 삽입하고 새 셀로 이동합니다.
*   행 간 이동: 행의 첫 셀에서 `Shift+Tab`을 누르면 이전 행의 마지막 셀로 이동합니다.
*   중첩 괄호 무시: `\frac{1}{2}` 내부의 `{` `}`는 셀 경계로 처리하지 않으며, 최상위 레벨의 `&`와 `\\`만 셀/행 구분자로 인식합니다.

> 우선순위는 테이블 셀 이동 > 명령어 인자 이동 > VS Code 기본 Tab 동작 순으로 처리됩니다.

> 사용 예시
> *   `\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}`에서 셀 `1`에 커서 → `Tab` → 셀 `2` 선택
> *   마지막 셀에서 `Tab` → `&` 자동 삽입 후 새 셀로 이동
> *   단축키: `Tab` (다음 셀) / `Shift+Tab` (이전 셀)

### 환경 시작 시 자동 들여쓰기 (Auto-indent on Enter)
`\begin{env}` 뒤에서 `Enter`를 누르면, 다음 줄에 자동으로 들여쓰기를 적용하고 커서를 배치합니다.
> 사용 예시
> *   `\begin{itemize}|` (커서 위치 `|`) → `Enter` → 들여쓰기된 빈 줄에 커서
> *   `\begin{document}` → `Enter` → `\begin{itemize}` → `Enter` → 두 단계 들여쓰기
> *   단축키: `Enter`

### 외부 데이터 붙여넣기
엑셀, 구글 시트, Numbers, CSV 파일 등 외부 프로그램에서 복사한 셀 데이터를 에디터에 붙여넣으면 자동으로 `&`와 `\\`가 적용된 LaTeX 행렬(`matrix`) 또는 표(`tabular`) 코드로 변환합니다.

#### 작동 방식
확장은 VS Code의 기본 붙여넣기 메뉴(`Ctrl+V`)에 "Paste as LaTeX Matrix/Table" 옵션을 주입합니다. 엑셀에서 복사한 데이터를 에디터에 붙여넣으면, VS Code의 네이티브 붙여넣기 메뉴에 "Paste as LaTeX Tabular" 또는 "Paste as LaTeX Matrix"가 추가됩니다.

> `Ctrl+Shift+V` (`Cmd+Shift+V`)를 사용하여 더 세세하게 조정한 후 데이터를 삽입할 수도 있습니다.;
*   수식 환경 내부 (`$...$`, `\[...\]`, `equation`, `align` 등) → 자동으로 `\begin{bmatrix}` (또는 설정한 행렬 환경) 삽입
*   일반 텍스트 영역 → 자동으로 `\begin{tabular}` (또는 Booktabs 스타일) 삽입
*   구분자 자동 감지: 탭(TSV), 쉼표(CSV), 세미콜론, 연속 공백을 자동으로 인식하여 열을 분리합니다.
*   구분자 모호 시 수동 선택: 구분자를 감지하지 못하면, 붙여넣기 전 QuickPick이 떠서 Tab / Comma / Semicolon / Space / Regex 중 선택하여 재파싱할 수 있습니다.

#### 지원하는 출력 형식
*   행렬 (Matrix): `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`, `matrix`
*   표 (Tabular):
    *   Array 스타일 (기본): `\hline`, `|` 테두리. 전통적인 `tabular` 형태.
    *   Booktabs 스타일: `\toprule`, `\midrule`, `\bottomrule`. 현대적이고 학술적인 표 형태로, 테두리 없이 깔끔하게 표현됩니다.
*   헤더 행 자동 인식: 첫 행이 텍스트이고 나머지 행이 숫자인 경우, 첫 행을 헤더로 간주하여 `\hline` 또는 `\midrule`로 자동 구분합니다.
*   열 정렬 자동 감지: 데이터 타입에 따라 `l` (텍스트), `r` (숫자), `c` (혼합)을 자동으로 배정합니다.

#### 데이터 정제 (Smart Escape & Formatting)
*   LaTeX 명령어 보존: `\alpha`, `\sum`, `\frac{1}{2}` 등은 자동으로 인식하여 Escape하지 않고 그대로 보존합니다.
*   특수 문자 Escape: `$`, `%`, `&`, `_`, `#`, `{`, `}` 등 LaTeX에서 문제가 되는 문자는 자동으로 Escape (`\$`, `\%`, `\&` 등).
*   천 단위 구분 쉼표: `1,234.56` → `1\,234.56` (수평 간격)으로 자동 변환.
*   지수 표기 변환: `1.23E+05` → `1.23 \times 10^{5}`으로 자동 변환.
*   불규칙한 행 패딩: 열 개수가 일치하지 않는 행은 빈 셀(`""`)로 자동 패딩하여 코드가 깨지지 않도록 합니다.
*   미리보기: 붙여넣기 전 QuickPick에 데이터의 첫 3행을 미리보여주고 "삽입 / 취소"를 선택할 수 있습니다.

#### 설정 (Settings)
`tex-machina.pasteExternalData.*` 네임스페이스에서 모든 동작을 세밀하게 제어할 수 있습니다:
*   `defaultMode`: `auto` (커서 위치 기반) / `matrix` / `tabular`
*   `matrixType`: `bmatrix` (기본), `pmatrix`, `vmatrix` 등
*   `tabularStyle`: `array` (기본) / `booktabs`
*   `alignmentMode`: `auto` (데이터 타입 감지) / `allCenter` / `allLeft` / `allRight`
*   `hasBorders`: Array 스타일에서 테두리 표시 여부
*   `hasHeader`: `auto` (자동 감지) / `true` / `false`
*   `escapeMode`: `smart` (명령어 보존) / `all` / `none`
*   `showPreview`: 미리보기 표시 여부
*   `recognizeCSV`, `recognizeTSV`, `recognizeSemicolon`, `recognizeSpace`, `recognizeHTMLTable`: 자동 인식할 데이터 형식별 On/Off
*   `customDelimiters`: 사용자 정의 구분자 목록 (정규식 지원, 예: `\\|`, `\s+`)

#### 단축키
| 기능 | Windows/Linux | macOS |
| :--- | :--- | :--- |
| 스마트 붙여넣기 | `Ctrl + Shift + V` | `Cmd + Shift + V` |
| 강제 행렬 붙여넣기 | `Ctrl + Alt + Shift + V` | `Cmd + Alt + Shift + V` |
| 강제 표 붙여넣기 | `Ctrl + Alt + V` | `Cmd + Alt + V` |

### 토글 모드 및 프로파일 (Toggle Mode)
특정 편집 보조 기능들을 한시적으로 활성화하거나, 작업 성격에 맞춰 기능 프로파일을 전환할 수 있습니다.

*   한시적 활성화: `Cmd + '` 입력 시 10초간(설정 가능) 지정된 기능들이 활성화되며, 상태 표시줄 색상이 변경되어 활성 상태를 알려줍니다.
*   프로파일 기반 설정: 작업 모드에 따라 Profile 1~9, 0에 서로 다른 기능 조합을 저장하고 `Cmd + ' [번호]` 단축키로 즉시 전환할 수 있습니다.
*   사용 가능한 토글 기능: 암시적 첨자, 스마트 괄호, 자동 \left/\right, 수식 모드 전환, 분수 변환, 마크다운 스타일, 스마트 따옴표, 수식 계층 점프 등.

### 컨텍스트 인지 매크로
현재 커서가 위치한 상황(수식 내부/외부 등)에 따라 다르게 동작하는 매크로를 지원합니다.

*   컨텍스트 인지: 동일한 매크로 `;diff`라도 수식 내부에서는 `calc > diff`를 실행하고, 텍스트 영역에서는 다른 동작을 하도록 설정할 수 있습니다 (`name:math`, `name:text`).
*   체이닝 지원: 여러 명령어를 `&&`로 묶어 하나의 매크로로 등록하고 `;이름` 만으로 즉시 실행할 수 있습니다.
*   CLI 기반 정의: `define:명령어체인>:매크로이름` 구문을 통해 명령줄에서 즉시 매크로를 생성합니다.

### 기타 기능
- 마크다운 문법 지원 : 다음과 같이 마크다운 문법을 latex에서 바로 사용할 수 있습니다.
  - `#제목#` + 스페이스 → \section{제목}
  - `##제목##` + 스페이스 → \subsection{제목}
  - `텍스트` + 스페이스 → \textbf{텍스트}
  - `*텍스트*` + 스페이스 → \textit{텍스트}
  - `~~텍스트~~` + 스페이스 → \sout{텍스트}
  - `> 내용` + 스페이스 → \begin{gather} 내용 \end{gather}
  - `- ...` + 스페이스 → \begin{itemize} \item ... \end{itemize}
- 수식 모드 자동 전환 (Auto Math Wrap): 일반 텍스트 모드에서 `\alpha`나 `\sum` 같은 수학 전용 매크로를 입력하고 스페이스를 누르면 자동으로 `$ $`를 씌워줍니다. (예: `\alpha` → `$\alpha$`)
- 수식 구조 통째로 삭제 (Smart Backspace): 커서가 비어 있는 `\frac{}{}` 등의 명령어 시작 부분(`\` 앞/뒤)에 있을 때 백스페이스를 누르면 구조 전체를 한 번에 삭제합니다.
- 암시적 첨자 변환 (Implicit Subscripts): `x1`과 같이 변수 뒤에 숫자를 입력하면 자동으로 `x_1`으로 변환합니다. `x_12`는 `x_{12}`로 자동 확장됩니다.
- 분수 자동 변환 (Fraction Shorthand): `1/2` 또는 `(a+b)/c` 입력 후 스페이스를 누르면 자동으로 `\frac{1}{2}` 또는 `\frac{a+b}{c}`로 변환됩니다.
- 선택 영역 자동 씌우기 (Wrap Selection with Scripts): 특정 텍스트를 블록 지정한 상태에서 `_`나 `^`를 누르면, 선택 영역이 자동으로 `_{...}` 또는 `^{...}`로 감싸집니다. 이미 작성된 수식을 첨자로 만들 때 유용합니다.
- 자동 중괄호 (Auto-bracing) : `_` 또는 `^` 입력 후 두 글자 이상을 치면 자동으로 `{ }`를 씌워줍니다. `-1`과 같이 자주 쓰이는 지수는 입력 후 커서가 자동으로 중괄호 밖으로 이동합니다.
- 환경 시작 시 자동 들여쓰기 (Auto-indent on Enter): `\begin{env}` 뒤에서 `Enter`를 누르면 자동 들여쓰기 적용 및 커서 배치. 자세한 내용은 [환경 시작 시 자동 들여쓰기](#환경-시작-시-자동-들여쓰기-auto-indent-on-enter) 섹션 참조.
- 스마트 줄바꿈 (Smart Newline): 수식 환경(`align`, `gather` 등) 내부에서 `Enter` 입력 시 `\\`와 `&` 정렬 기호를 상황에 맞게 자동으로 삽입합니다.
- 수식 전용 리가처 (Mathematical Ligatures): `!=`, `<=`, `->`, `&&` 등 익숙한 기호 조합을 입력하면 즉시 `\neq`, `\le`, `\to`, `\land` 등 LaTeX 명령어로 변환합니다.
- 환경 이름 동기화 수정 (Linked Editing): `\begin{...}`의 이름을 수정하면 쌍이 맞는 `\end{...}`의 이름도 실시간으로 함께 변경됩니다. (VS Code 'Linked Editing' 기능 활성화 필요)
- 환경 자동 삭제 (Env Auto-Delete): `\begin{env}`를 지우면 쌍이 맞는 `\end{env}`도 자동으로 찾아 함께 지워줍니다.
- 환경 자동 닫기 (Auto End Env): `\end`를 입력하면 가장 가까운 미완성 `\begin{env}`를 찾아 `\end{env}`로 자동 완성합니다. 중첩된 환경을 정확히 인식하며, `\end{`까지만 입력한 경우에도 완성해줍니다.
- 다이어크리틱 (Diacritics): 글자 입력 후 단축키를 눌러 즉시 hat, tilde, dot 등을 씌웁니다.
  - `Alt+^`: `\hat{ }`
  - `Alt+~ ` : `\tilde{ }`
  - `Alt+.`: `\dot{ }`
  (맥에서는 option이 alt에 대응됩니다.)
- 자동 \left \right : `(`나 `[` 입력 시 내부에 `\frac`과 같이 높은 요소가 있으면 자동으로 `\left( \right)`로 확장합니다.
- 단위 확장 (Unit Expander) : `10m/s` 뒤에서 스페이스를 누르면 `\SI{10}{m/s}`로 자동 변환됩니다.
- 스마트 따옴표: `"` 입력 시 문맥에 따라 ` `` ` 또는 ` '' `로 자동 변환됩니다.
- 말줄임표 자동 변환 (Ellipsis): `...` 입력 시 자동으로 `\dots` 또는 `\cdots`로 변환합니다. (설정에서 변환할 매크로 선택 가능)
- 스캔 방지 (Scan Prevention): 문서의 보안이나 비공개 유지를 위해 분석 엔진이 특정 영역을 건너뛰도록 하는 패턴을 삽입합니다 (`insertScanPrevention`).

### 확장 문자 입력 (Extended Input Mode)
LaTeX 명령어를 직접 입력하지 않고, 단축키 + 한 글자로 즉시 변환하는 입력 모드입니다. `Cmd+E` (macOS) / `Ctrl+E` (Windows/Linux)를 누른 후 매핑된 문자를 입력하면 해당 LaTeX 명령어로 자동 치환됩니다.

- 단일 입력 모드 (기본): `Cmd+E` → 문자 입력 → 변환 후 모드 자동 종료
- 토글 모드: 설정(`tex-machina.extendedInput.singleShot: false`)에서 변경 가능, 10초간 유지

#### 그리스 문자 및 특수 기호 매핑

| 입력 | 결과 | 입력 | 결과 | 입력 | 결과 |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `a` | `\alpha` | `b` | `\beta` | `g` | `\gamma` |
| `d` | `\delta` | `e` | `\epsilon` | `z` | `\zeta` |
| `h` | `\eta` | `q` | `\theta` | `i` | `\in` |
| `k` | `\kappa` | `l` | `\lambda` | `m` | `\mu` |
| `n` | `\nu` | `x` | `\xi` | `o` | `\omicron` |
| `p` | `\pi` | `r` | `\rho` | `s` | `\sigma` |
| `t` | `\tau` | `u` | `\upsilon` | `f` | `\phi` |
| `c` | `\chi` | `y` | `\psi` | `w` | `\omega` |
| `A` | `\Alpha` | `B` | `\Beta` | `G` | `\Gamma` |
| `D` | `\Delta` | `E` | `\exists` | `Z` | `\Zeta` |
| `H` | `\Eta` | `Q` | `\Theta` | `I` | `\infty` |
| `K` | `\Kappa` | `L` | `\Lambda` | `M` | `\Mu` |
| `N` | `\nabla` | `X` | `\Xi` | `O` | `\Omicron` |
| `P` | `\Pi` | `R` | `\Rho` | `S` | `\Sigma` |
| `T` | `\Tau` | `U` | `\Upsilon` | `F` | `\Phi` |
| `C` | `\Chi` | `Y` | `\Psi` | `W` | `\Omega` |
| `*` | `\times` | `.` | `\cdot` | `{` | `\subset` |
| `}` | `\supset` | `0` | `\emptyset` | `/` | `\setminus` |
| `+` | `\cup` | `-` | `\cap` | `(` | `\langle` |
| `)` | `\rangle` | `|` | `\vee` | `&` | `\wedge` |
| `^` | `\hat{}` | `~` | `\tilde{}` | | |

> `^`와 `~`는 빈 중괄호 `{}`를 삽입하고 커서를 그 안에 위치시킵니다.

### 단축 모드 (Shorthand Mode)
LaTeX 명령어를 직접 입력하지 않고, 약어(Abbreviation) + Space로 즉시 확장하는 입력 모드입니다. `Alt+G` (macOS/Windows/Linux 공통)를 누른 후 약어를 입력하고 Space를 누르면 자동으로 확장됩니다.

동작 방식:
1. `Alt+G`로 모드 진입 (상태 표시줄에 `[SH]` 표시)
2. 약어 및 subscript 입력 (예: `bc,idx`)
3. Space 입력 시 약어가 확장되고 모드가 자동 종료

약어와 subscript:
- `,` (쉼표)를 기준으로 앞부분은 약어, 뒷부분은 subscript로 처리됩니다.
- 약어는 단축어 매핑 테이블을 통해 LaTeX 명령어로 변환됩니다.
- subscript는 수식 환경 내에서 `idx` → `{i \in I}` 등으로 자동 확장됩니다.



사용 예시:
| 입력 | 결과 | 설명 |
|------|------|------|
| `G = ` + `Alt+G` + `bc,idx` + `Space` | `G = \bigcup_{i \in I}` | bigcup + 인덱스 |
| `Alt+G` + `bc` + `Space` | `\bigcup` | 기본 약어만 |
| `Alt+G` + `bc,i` + `Space` | `\bigcup_{i}` | 단순 subscript |
| `\` 입력 | 모드 자동 종료 | |

설정 (`tex-machina.shorthandMode.*`):
- `singleShot` (기본 `true`): 한 번 확장 후 자동 종료. `false`로 설정하면 연속 모드(10초간 유지).
- `mappings`: 사용자 정의 약어 매핑. 예: `{ "bi": "\\bigcap", "su": "\\sum" }`

## 스니펫 
- 인덱스 : 수식 환경 내에서 `idx`를 입력하면 `{i \in I}`로 자동 변환됩니다. `GHidx`와 같이 두 대문자 뒤에 `idx`를 입력하면 군론에서 사용하는 `[G:H]` (부분군 지수) 표기로 변환됩니다.


## Keybindings

| 기능 | Windows/Linux | macOS | 설명 |
| :--- | :--- | :--- | :--- |
| 최근 기호 팝업 | `Alt + Q` | `Alt + Q` | 자주 쓰는 기호 자동완성 띄움 |
| 선택 영역 확장 | `Shift + Alt + →` | `Shift + Alt + →` | 수학적 계층 단위로 선택 확장 |
| 선택 영역 축소 | `Shift + Alt + ←` | `Shift + Alt + ←` | 수학적 계층 단위로 선택 축소 |
| 행렬 리사이저 메뉴 | `Alt + L M` | `Option + L M` | 행/열 추가 삭제 메뉴 호출 |
| 수식 환경 전환 | `Alt + L T` | `Option + L T` | 인라인/디스플레이 등 모드 전환 |
| 스마트 줄바꿈 / 자동 들여쓰기 | `Enter` | `Enter` | (수식 내) `\\` 및 `&` 자동 삽입, `\begin{env}` 뒤 자동 들여쓰기 |
| CLI 열기 | `Ctrl + Shift + ;` | `Cmd + Shift + ;` | TeX-Machina 통합 명령줄 실행 |
| 수식 분할 | `Ctrl + Shift + L` | `Cmd + Shift + L` | 수식 자동 분할 (`align` 변환) |
| 토글 모드 (Profile 1) | `Ctrl + ' 1` | `Cmd + ' 1` | 1번 프로필 활성화 (1~9, 0 가능) |
| 토글 모드 (기본) | `Ctrl + '` | `Cmd + '` | 모든 토글 기능 무조건 활성화 |
| 수식 점프 모드 | `Ctrl + Shift + ' L` | `Cmd + Shift + ' L` | Math Navigation 모드 토글 |
| 수식 내 이동 | `Alt + ← / →` | `Alt + ← / →` | (모드 ON 시) 수학적 노드 간 점프 |
| 항목 이동 | `Alt + ↑ / ↓` | `Alt + ↑ / ↓` | (VS Code 기본) `\item` 등 줄 위치 교체 |
| 자동 괄호 이스케이프| `Escape` | `Escape` | 한시적으로 자동 괄호 적용 안 함 |
| 단위 변환 | `Ctrl + Shift + ' U` | `Cmd + Shift + ' U` | 수동 단위 변환 (`siunitx`) |
| Hat 삽입 | `Alt + Shift + 6` | `Alt + Shift + 6` | 커서 앞 글자에 `\hat{}` 씌움 |
| Tilde 삽입 | `Alt + Shift + ~` | `Alt + Shift + ~` | 커서 앞 글자에 `\tilde{}` 씌움 |
| Dot 삽입 | `Alt + .` | `Alt + .` | 커서 앞 글자에 `\dot{}` 씌움 |
| 선택 영역 첨자화 | `_` / `^` | `_` / `^` | 선택 영역을 `_{}` / `^{}`로 감쌈 |
| 확장 문자 입력 | `Ctrl + E` | `Cmd + E` | 그리스 문자/특수 기호 한 번에 입력 |
| Smart Backspace | `Backspace` | `Backspace` | 명령어 시작점(\)에서 빈 구조 삭제 |
| 인자 간 전환 (다음) | `Tab` | `Tab` | 명령어 괄호 인자 간 다음 이동 |
| 인자 간 전환 (이전) | `Shift+Tab` | `Shift+Tab` | 명령어 괄호 인자 간 이전 이동 |

## Installation & Setup 
### 요구 사항
- Python 3.x: 파이썬으로 구현된 기능을 실행하기 위해 필요합니다.
- 필수 패키지 설치:
  ```bash
  pip install sympy numpy scipy matplotlib requests
  ```

