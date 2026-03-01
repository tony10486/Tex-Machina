# TeX-Machina

**TeX-Machina**는 VS code용 LaTeX 확장 프로그램입니다. LaTeX 문서를 작성하면서 필요한 기능과, 반복 작업의 간편화를 위해 제작되었습니다. 
## Features

- **심볼릭 연산(Symbolic Calculation) `calc >`**: NumPy, SymPy, SciPy 패키지를 이용한 기호 기반 연산 기능입니다. 정말 많은 기능을 지원하지만, 그 중에서 대표적인 몇 가지 기능의 예시를 보여드리자면...
  1. 미분과 적분 : 원하는 수식의 미분과 적분을 수행합니다.
    > `\frac{\sinh (x) \log (x) }{e^{x}}  = - e^{- x} \log{\left(x \right)} \sinh{\left(x \right)} + e^{- x} \log{\left(x \right)} \cosh{\left(x \right)} + \frac{e^{- x} \sinh{\left(x \right)}}{x} = \frac{\left(x e^{- x} \log{\left(x \right)} + \sinh{\left(x \right)}\right) e^{- x}}{x}`
<img width="910" height="61" alt="Screenshot 2026-03-01 at 2 09 59 AM" src="https://github.com/user-attachments/assets/00814eac-f38c-4820-90c3-33f412053b68" />


(최종 결과는 `calc > simplify` 명령어를 입력한 결과입니다.)
- **Matrix Tools (`matrix >`)**: Generate various matrix environments (pmatrix, bmatrix, etc.) with automatic "smart dots" and analysis (determinant, inverse, RREF).
- **Advanced Plotting (`plot >`)**: 
  - **2D**: Generate PGFPlots data and LaTeX code.
  - **3D**: Interactive 3D visualization using X3DOM and exportable PDF/PNG figures.
  - **Complex**: Domain coloring for complex analysis.
- **Sequence Search (`oeis >`)**: Search for number sequences in the OEIS database and insert them into your document.
- **Smart Citations (`cite >`)**: Search papers by DOI, arXiv ID, or title, and automatically update your `.bib` files and insert `\cite` commands.
- **Width Analysis**: Analyze LaTeX formula widths to ensure they fit within your document margins.
- **마크다운 문법 지원** : 다음과 같이 마크다운 문법을 latex에서 바로 사용할 수 있습니다.
  - `#제목#` + 스페이스 → \section{제목}
  - `##제목##` + 스페이스 → \subsection{제목}
  - `**텍스트**` + 스페이스 → \textbf{텍스트}
  - `*텍스트*` + 스페이스 → \textit{텍스트}
  - `~~텍스트~~` + 스페이스 → \sout{텍스트}
  - `> 내용` + 스페이스 → \begin{gather} 내용 \end{gather}
  - `- ...` + 스페이스 → \begin{itemize} \item ... \end{itemize}

## Macro
이 확장 프로그램에서 가장 강력한 기능입니다! 그래서 따로 항목으로 빼놨습니다. 사실 이 부분은 스타일에 따라 그리 중요하지 않을 수도 있어요. 굳이 다 읽어 보라고는 하지 않겠습니다. 그러나 매크로의 매력을 모르는 채로 살기에는 인생이 너무 깁니다. Vim 에디터는 매크로 기능 그 자체로 사용하는 사람도 있을 정도로, 매크로는 코드 작성을 똑똑하고, 간편하며, 소개팅에서 자랑할 만한 기능입니다. 사실 매크로가 그다지 빠르지 않더라도, 매크로를 쓰는 내 모습에 취해 사용한다죠. (개발자 피셜입니다.)

### 명령어의 지정 
명령어는 다음과 같이 지정할 수 있습니다.
> `define: 저장될 명령어 :명령어의 이름`
추후 호출은 `;명령어의 이름` 으로 불러올 수 있습니다.

예시로 현재 문서의 수식 너비가 문서의 여백을 넘지 않았는지 분석하는 기능을 정의해보겠습니다.
> `define:analyze > width>:s`
이후 `cmd + shift + ;`를 쳐 명령줄을 활성화시킨 후 `;s`를 입력하시면 저장된 기능이 작동합니다. 

참고로 지정된 명령어는 VS Code의 내부 DB(`globalState`)에 저장됩니다.

### 컨텍스트 인지 매크로
제 매크로의 기능은 다른 매크로와 다르게, LaTeX 환경과 찰떡궁합으로 작동하게 설계되었습니다. 그 중에서, 가장 혁명적인 특징은 바로 **컨텍스트 인지** 기능이죠. 이 기능이 무엇인지 알려드리겠습니다.
LaTeX는 문서 작성 환경이 크게 세 가지로 나뉩니다.
  1. 수식 입력 모드 
  2. 일반 텍스트 입력 모드 
  3. 특정 환경 내 입력 모드

수식 입력 모드의 경우 `\begin{equation}, \begin{gather}, \begin{align},` 그리고 `$ $` 가 있을 겁니다. 그리고 일반 텍스트 입력 모드는 말 그대로 1번과 3번이 아닌 다른 곳이겠죠. 특정 환경 내 입력 모드는 `itemize, figure` 등 기타 환경 내부에서의 모드입니다.
그 중, 전 1번과 2번의 차이점에 주목하였습니다. 우리는 국어 시간에 근의 공식을 말하지는 않듯이, 수식 입력 모드와 일반 텍스트 입력 모드에서 사용하는 양상이 현저히 다릅니다. 그리고, 만물의 영장인 우리가 하나하나 이를 구별해서 매크로를 지정해 주는 것은 우아하지 않죠. 따라서 동일한 명령어로 매크로를 지정하였어도 수식 내부에서 해당 명령어를 사용할 때와 수식 밖에서 해당 명령어를 사용할 때 작동 방시이 다르도록 만들었습니다.
하지만 굳이 이 기능이 왜 필요한지 의문이 들 수 있습니다. 그냥 매크로 명령어를 두개 지정하면 되지 꼭 그렇게 해야겠느냐고요. 그러나 한 글자를 입력할 떄와 두 글자를 입력할 때는 속도가 천지 차이로 다릅니다. 또한 갖가지 명령어를 기억하기도 귀찮구요.

### 컨텍스트 인지 기능을 적용한 명령어의 지정 방법
참고로, 명령어의 동작이 모드 상관 없이 일관적으로 동작하길 원한다면, 그저 컨텍스트 부분을 생략하시면 됩니다.

현재 버전 기준 해당 확장프로그램의 컨텍스트는 다음과 같이 구성되어 있습니다.
1. `math` : 위에서 언급한 수식 입력 모드입니다.
2. `text` : 위에서 언급한 일반 텍스트 입력 모드입니다.
3. `커스텀` : 설정 창에서 직접 컨텍스트가 작동할 환경을 정의하실 수 있습니다. 설정 창에 들어가 `확장 > Tex-Machina > Macros: Custom Contexts` 부분에서 `Tex-Machina` 섹션을 통해 직접 정의할 수 있습니다. 지정한 커스텀 컨텍스트는 VScode의 `settings.json`에 저장됩니다. 

컨텍스트의 우선순위는 `math` > 사용자 정의 컨텍스트 > `text` 순입니다. 

한번 구체적인 예시를 보여드리겠습니다.

먼저 다음 두 명령어를 정의해 보세요. 윈도우에서는 `ctrl + shift + ;`를 눌러서, 맥에서는 `cmd + shift + ;`를 눌러서 명령줄을 띄운 뒤 다음 두 명령어를 그대로 입력하시면 됩니다.
> `define:calc > simplify>:r:math`
> `define:cite > >:r:text`

(`define:cite > >:r:text` 해당 명령어의 구조를 짚고 넘어가야 할 듯 합니다. 만약 `define:cite > :r:text`라고 명령어를 정의한 경우, 추후 일반 텍스트 입력 모드에서 `;r`을 치셨을 경우 `연산 실패: Selection is empty after stripping delimiters` 라는 에러가 뜰 겁니다. 왜냐하면 `cite` 명령어는 선택된 텍스트, 또는 `cite > `이후에 오는 텍스트가 필요하기 때문이죠. 따라서 특정 텍스트를 지정하거나, `define:cite > 인용할 논문의 제목 :r:text` 로 정의해야 합니다. 그러나, 이러면 매크로를 쓰는 이유가 없죠. 고로 일반 텍스트 입력 모드에서 해당 명령어 `;r`을 입력한 경우 검색어를 입력할 수 있는 상태로 멈추게 정의한 겁니다. 저도 모든 매크로의 기능을 자유자재로 사용할 순 없을 정도로 로직이 방대합니다.)

그 다음 수식 내부에서 계산할 수식을 드래그 하고 `;r` 명령어를 친 결과와 수식 밖에서 `;r` 명령어를 친 결과를 비교해 보세요! 자주 사용하는 매크로를 쓰기 편한 위치에 지정해두면서도 명령어가 과도하게 불어나지 않도록 해 줍니다.


## Query
쿼리, 매크로의 기능 중 하나입니다. 이 확장프로그램의 쿼리 기능은 직관적이지만, 너무나 많은 기능으로 따로 자세히 설명해야 합니다. 
### Structure
쿼리문은 ?를 문두에 붙여야 합니다. 텍스트와 LaTeX의 구조는 큰따옴표를 통해 구분합니다. 
> ? [명령어]:[옵션] [대상/조건] [탐색기호] [대상/조건] [변이 연산자] [결과값] [흐름제어]

#### 명령어
해당 쿼리문을 통해 수행될 작업을 의미합니다. 명령어에는 다음이 있습니다.

1. find : 대상을 찾습니다. 기본 옵션은 파일 내 모든 내용에 대해 검색을 수행하는 옵션 :all 입니다. 기본적으로 현재 작업하는 파일 내에 대해 탐색을 수행합니다. 
> find 명령어는 암묵적으로 생략이 가능합니다. 즉, `?find '\includegraphics'`는 `? '\includegraphics'`로 쓸 수 있습니다.
2. exchange : 두 블록(여기서 블록이란 환경을 포함하는 용어로, 여러 개의 환경이 중첩된 경우나 텍스트도 아우릅니다.)의 위치를 서로 맞바꿉니다. 기본 옵션은, 여러 결과가 있을 경우 코드 번호 기준 작은 블록을 선택하는 옵션 :first 입니다. exchange 의 경우 변이 연산자 <=>와 동일합니다.
3. move : 대상을 특정 위치로 옮깁니다. 기존 위치에 있던 대상은 삭제됩니다. 
4. duplicate : 대상을 복사해 특정 위치로 옮깁니다. move와 다르게 기존 위치에 있던 대상 또한 보존됩니다.
5. delete : 대상을 삭제합니다. >> null과 동일합니다.
6. insert : 지정된 위치에 블록을 추가합니다.
7. extrack : 데이터를 외부 파일로 내보냅니다.

#### 기본적인 사용
명령어는 인자를 필요로 합니다. `find` 명령어를 살펴 봅시다. 
> `?find '"abc"'` : `find` 명령을 사용하기 위해서는 찾을 대상이 필요합니다. 찾을 대상은 작은따옴표로 구분하며, 텍스트를 찾기 위해 큰따옴표를 사용하였습니다. 큰따옴표를 쓴 이유는 아래에 설명되어 있습니다. 

이처럼 명령어의 

#### 흐름 제어 및 정렬
여러 개의 쿼리문을 동시에(비동기) 실행할지, 또는 순차적(동기)으로 실행할지 구분할 수 있습니다. `&`로 나열된 두 쿼리문은 동시에, 그리고 독립적으로 실행됩니다. `&&`은 앞 명령이 끝난 후 뒤 명령을 실행합니다. 
> 두 쿼리문의 관계를 잘 생각한 뒤 `&`와 `&&`를 적절히 실행하세요. 검색 후 수정이 필요한 경우 검색과 수정을 동시에 할 경우 예상치 못한 오류가 나타날 수 있습니다. 이와 같이 문제가 있는 쿼리문은 매크로가 자동으로 감지하여 경고를 할 수 있지만, 저도 사람인지라 모든 경우에 대해 경고를 줄 순 없습니다. 

또한 한 쿼리문이 채 작성되지 전, 중간에 또 다른 쿼리문을 실행해야 하는 경우가 있습니다. 이떄는 서브쿼리 블록 `^()^`을 사용하세요. 내부 쿼리를 먼저 실행하여 결과를 바깥으로 반환합니다. 이때 내부 쿼리를 서브쿼리라고 부릅니다.
> 서브쿼리가 여러 개인 경우를 조심하세요. **서브쿼리에는 되도록 코드에 수정을 가하지 않는 명령어**를 사용해 주세요. 불가피하게 수정이 필요하다면 동기 실행을 사용하는 것을 권장합니다. 여러 개의 서브쿼리가 들어있을 경우에는 메모리 기능을 사용해, 각 서브쿼리의 결과를 편리하게 관리하시는 것을 추천드립니다. 해당 서브쿼리 블록 기능은 암시적으로 메모리에 저장하나, 두 개 이상의 서브쿼리가 실행될 경우 미처 처리되지 못한 데이터가 덮어씌워지거나, 쿼리문에 영향을 줄 수 있습니다.

#### 옵션 
1. :all : 조건을 만족하는, 또는 메모리에 저장된 두 개 이상의 항목에 대한 수정을 일괄로 진행합니다.
2. :first : 조건을 만족하는, 또는 메모리에 저장된 두 개 이상의 항목에 대해 첫 번째 대상에 대해서만 진행합니다.
3. :part : 조건을 만족하는, 또는 메모리에 저장된 두 개 이상의 항목 중 일부에 대해서만 진행합니다. 별도로 지정된 범위(scope)가 없을 경우 all과 같이 진행됩니다. :part의 범위를 지정하기 위해선 범위 제한 연산자 : 를 사용해야 합니다. 범위 제한 연산자를 사용하는 경우 공백은 허용되지 않습니다. (예를 들어 :part:@float은 허용되지만, :part: @float은 허용되지 않습니다.) 범위 제한 연산자에 따르는 문자열이 @ 또는 #으로 시작하거나, 정수만이 허용됩니다. 정수가 뒤따를 경우, 즉 :part:3의 경우 :first 옵션이 적용된 채로, 첫번째부터 세번째까지 3개의 항목을 선택합니다. 그러나, 정렬 옵션 또한 적용이 가능합니다.
4. :ask : 조건을 만족하는, 또는 메모리에 저장된 두 개 이상의 항목이 존재할 경우, 각 항목에 대한 작업 수행 여부를 사용자에게 물어봅니다.

#### 태그
태그는 특정 카테고리의 대상을 불러오기 위해 사용됩니다.
1. #(의미론적 태그) : 특정 카테고리의 값을 특정합니다. LaTeX의 환경, 또는 명령어의 속성을 지정하는 파라미터와 관련된 문자열을 의미합니다. LaTeX의 파라미터는 쉼표로 구분되며, 각 파라미터의 값은 등호로 정의되기에, 이를 참고하였습니다.
> \includegraphic[width=0.5\linewidth, page=1, clip] 에 대해 #scale 값은 크기를 조정하는 width 속성에서 등호 뒤, 그리고 그 다음 쉼표 사이 값인 0.5\linewidth를 의미합니다. 만일, 0.5라는 숫자만 얻고 싶다면 #scale:@float을 사용하시면 됩니다. 참고로, 의미론적 태그를 clip에 대해 수행한 경우, 가져올 값이 없으므로 null이 됩니다.
  - #scale : 크기를 지정하는 인자를 통칭합니다. width, scale, height에 해당됩니다.
  - #geometry : 문서 내 요소 위치를 지정하는 인자를 통칭합니다. #geometry에 해당하는 하위 태그는 다음과 같으며, 하위 태그에 속하지 않는 #geometry의 인자는 이 있습니다.
    - #align : 정렬에 대한 인자입니다.
  - #color :

2. @(자료형 및 구조 태그) : 해당 부분에 대해 특정 자료형이나 구조를 만족하는 대상을 특정합니다.
  - 자료형 태그 : 
    1. @float : 부동소수점, 실수를 의미합니다. 0.5, 1, 100 등이 해당합니다.
    2. @int : 정수를 의미합니다. 1, 6, 294 등이 해당합니다.
    3. @string : 문자열을 의미합니다. 큰따옴표로 감싸지는 텍스트에 해당합니다.
  - 구조 태그
    1. `@dimen` : 단위가 포함된 값을 의미합니다. 해당 태그의 경우 width=7cm 과 같이 의미론적 태그와 병용하여 사용하면 좋습니다. 이는 텍스트에 해당하지만, 인자의 값을 명확히 분리하기 위해 지정되었습니다.
    2. @math : 수식을 의미합니다. \[ \] 또는 $ $, align, gather, equation 속에 있는 값을 의미합니다. 보통 해당 구조 태그는 환경을 포함합니다. (이를테면 gather 속 align이 존재하는 경우, gather에 대해 @math 값은 align 환경까지 포함합니다.)
    3. @brace : 중괄호로 감싸진 값을 의미합니다.
    4. @braket : 대괄호로 감싸진 값을 의미합니다.
  - 부분 태그 : 부분 태그는 특정 명령어의 n번쨰 중괄호를 의미하고, @arg[n]으로 씁니다.
    > 이를테면 \frac{1}{2}의 @arc[2]는 2 입니다.
    참고로, 부분 태그는 tabular, matrix 환경에 대해 별도로 @col[n], @row[n]이 존재합니다. 각각 n번쨰 열과 행을 의미합니다.

#### 연산자
1. 계층 및 탐색 연산자 : 이는 `find` 명령어와 매우 깊은 연관이 있으니, 이 부분만큼은 익혀 두시기 바랍니다.
  - `>` : 직계 자식을 의미합니다. 즉, 계층으로 나누어지는 어떤 환경이나 명령어에서 하위 계층을 `>`로 표시합니다. `figure` 속 `includegraphics`가 있는 구조에서 해당 `includegraphics`에 대해 쿼리를 수행하기 위해선 `figure > \includegraphics`로 명시해 주어야 합니다.
  - 공백 : 공백은 스페이스 바 하나를 뜻합니다. 깊이에 무관한 모든 자손을 뜻하기도 하며, 명령어 사이를 구분하는데에 사용하기도 합니다.
  - `~` : 동일한 관계의 요소를 의미합니다. 만약 `figure` 속 `includegraphics`와 `caption`이 있을 경우 이들 간에 쿼리를 수행하기 위해선 `\includegraphics ~ \caption`으로 명시해 주어야 합니다. 
  - `<` 또는 `<<` : 부모와 조상 요소를 의미합니다. `>`와 반대 역할을 합니다. 
  - `...` : 심층 탐색에 사용됩니다. 이는 중간 계층을 알 수는 없지만 두 요소 사이 계층 관계는 알 경우 사용됩니다. 예를 들어 `figure` > `minipage` > `\includegraphics` ~ `\caption` ~ `\centering`이 존재할 경우, 중간에 `minipage`가 있는지는 모르지만 `figure` 환경 속에 들어있는 `\caption`에 대해 쿼리를 수행하고 싶다면 `figure > ... > \caption`을 수행해 주시면 됩니다.
  - `?` : 선택적 존재입니다. 있을 수도 있고 없을 수도 있는 요소를 뜻합니다. 예를 들어 작업하는 파일 속에 `figure` > `minipage` > `\includegraphics`인 구조와 `figure` > `\includegraphics` 구조가 동시에 존재하지만, `figure` 속에 있는 `\includegraphics`에 대해 쿼리를 수행하고 싶다면 `figure > minipage? > \includegraphics`와 같이 쓸 수 있습니다. 그러나 `...` 명령어와는 다릅니다. 해당 예시에 더불어 `figure` > `center` > `\includegraphics` 인 구조가 있지만, 가운데 정렬 된 `\includegraphics`에 대해선 작업을 하지 않도록 하려면 `?` 연산자를 사용하면 됩니다. `?` 연산자를 사용한 경우`minipage`가 있든, 없든 상관 없지만, 중간 계층에 `minipage`가 아닌 다른 요소가 온다면 해당 요소에 대한 쿼리는 진행하지 않습니다. 
  - `!()` : 역방향으로 작업을 수행하는 연산자입니다. 괄호 속 계층 및 탐색 연산자를 사용한 구문이 들어갈 경우, 반대로 작업을 수행합니다. 예를 들어 `!(figure > ... > \caption{"임시"})` 쿼리를 사용할 경우, "임시" 캡션을 가진 `figure` 자체를 선택합니다. 그러나 잘못 사용할 경우 의도치 못한 결과를 초래할 수 있으므로, 정확히 구분을 작성했는지 확인해야 합니다.
  - `^` : 승격 연산자입니다. 선택한 요소를 부모 환경 밖으로 뺍니다.
  - `` : 강등 연산자입니다. 선택한 요소를 자식 환경 안으로 집어넣습니다.
  - `><>` : 블록 흡수 연산자입니다. 동일한 계층의 환경이 나란히 있을 경우, 인접한 형제 환경을 자신의 내부로 집어 넣습니다.
2. 변이 연산자 
  - `>>` (치환/덮어쓰기): 대상을 우항의 결과로 교체합니다. (※ 주의: 우항에 큰따옴표가 없으면 수식으로 평가합니다.) 암묵적으로 재귀적 참조를 수행합니다. 
  - `+>` (후위 삽입): 대상 바로 뒤에 덧붙입니다.
  - `<+` (전위 삽입): 대상 바로 앞에 덧붙입니다.
  - `><` (블록 감싸기): 대상을 특정 명령어나 환경으로 감쌉니다.
  - `<>` (블록 벗기기): 껍데기만 삭제하고 알맹이는 남깁니다.
  `**` (복제): 대상을 n번 복제하여 형제 노드로 삽입합니다.
  `>+<` (병합): 인접한 두 동일한 환경을 하나로 합칩니다. (예: 두 개의 itemize 병합)
  `</>` (분할): 지정한 텍스트/기호를 기준으로 블록을 두 개로 쪼갭니다.
  `<=>` (상태 토글): 좌우 상태를 서로 맞바꿉니다. (예: \textbf <=> \textit)

#### 필터 및 조건문
1. 인라인 조건절 : 쿼리문에서 조건절은 `[ ]` 속 연산을 수행합니다. (예 : `[@float <= 1]`)
2. 자연어 조건절 : 
  - `where` : 
  - `without` : 
  - `has` : 
  - `and`와 `or` : 

3. 범위 제한 연산자 `:` 
  - `:in(scope)` : 특정 환경 내로 범위를 제한합니다. (예 : `:in(figure)`)
  - `:-` : 구조적 부재를 뜻합니다. 자연어 조건절의 `without`에 해당합니다. 
  - `:+` : 구조적 포함을 뜻합니다. 자연어 조건절의 `has`에 해당합니다.
  - `:!` : 논리적 비교 평가를 뜻합니다. 예를 들어 `:!(<1)`는 1보다 작은지에 대해 비교 평가를 수행합니다.

#### 정렬 
정렬은 `order by [기준]:[방향] [인덱스]` 형식을 따르니다. 기준에는 다음이 있습니다.
  - `forward` : 기본값입니다, 위에서 아래를 향합니다.
  - `reverse` : 아래서 위를 향합니다.
  - `inner` : 계층 구조에서 깊은 곳부터(자식 노드에서 부모 노드로) 얕은 곳을 향합니다.
  - `outer` : 계층 구조에서 얕은 곳부터 깊은 곳으로 향합니다.
  - `shortest` : 
  - `longest` : 
  - `shuffle` : 랜덤으로 정렬합니다.
  > 참고로 정렬을 할 때 특성태그를 사용할 수 있습니다.

#### 커서
보통 후위 삽입 `+>` 등을 위해 커서를 사용합니다. 커서는 `|`를 사용하며, `.`는 블록의 안팎을 결정합니다. 예를 들어 `|figure`은 `\begin{figure}`의 윗줄을, `.|figure|`은 `\begin{figure}`의 아랫줄을, `figure.|`은 `\end{figure}`의 윗줄을 의미합니다.
> 확장프로그램 설정에서 더욱 자세한 설정이 가능합니다.(`cursor.inline_insertion`)
  - `false` (기본값): 블록 환경(`\begin...`)에 대한 바깥쪽 커서(`|figure`)는 이전 줄의 맨 끝을 의미합니다. 내용이 섞이지 않고 새 줄에 깔끔하게 들어갑니다.
  - `true`: `\begin{figure}`와 완벽히 같은 줄의 바로 앞 공간을 의미합니다.
  > 예를 들어 다음 쿼리문을 해석해 봅시다. `move ^(find \caption)^ >> figure.|` 그러면 매크로는 해당 캡션 위치에서 트리를 거꾸로 타고 올라가 가장 먼저 만나는 부모 환경인 `figure`를 목적지로 자동 인식합니다. 

### 빠른 쿼리 입력을 위한 약어 
LaTeX의 몇 가지 환경을 다음과 같이 맵핑해 두었습니다.
- `@img` : `\includegraphics`
- `@fig` : `figure` 환경
- `@tbl` : `tabular` 환경 
- `` : 

### 주의사항
#### 따옴표
`>>` 연산자 우항의 동작은 큰따옴표의 유무로 결정됩니다. 
- `>> "0.5"` : 순수한 텍스트 `"0.5"`를 덮어씁니다. 
- `>> #scale * 0.5` : 따옴표가 없으므로 0.5라는 수를 `#scale`의 값에 곱합니다.
  > `#scale`의 자료형을 체크하세요. 보통 숫자와의 사칙연산을 위해선 `#scale:@float`와 같이 수 형태의 자료형만을 추출하는 것을 권장합니다. 
- 환경(Environment) : LaTeX에서 \begin{} ... \end{}의 안쪽 부분으로 정의됩니다. 환경의 예시로는 figure, tabular, gather 등이 있습니다.
- 명령어 : LaTeX에서 \로 시작하는 명령어로 정의됩니다. 명령어의 예시로는 \includegraphics, \caption 등이 있습니다.
- 텍스트 : 위 두 유형을 제외한 LaTeX의 요소입니다. 이는 큰따옴표로 묶어야 합니다. 예를 들어 "Birds" 가 있습니다. 

### 사용 예시
`?find 'figure > \includegraphics[|]'` : 파일 내 모든 `\includegraphics` 명령어 중 대괄호가 있는 `\includegraphics` 명령어에 대해 대괄호 속 커서를 위치시킵니다. 
``` latex
\begin{figure}
  \caption{강아지 사진}
  \includegraphics[]{dog.png}
\end{figure}
```
만약 이 코드에서 `\caption{강아지 사진}`을 `\includegraphics[options]{name}` 아래로 움직이게 하기 위해선 어떻게 해야 할까요? 먼저 `\includegraphics`보다 상위 환경에 있는 `\caption`을 찾아야 합니다. 이는 `move`를 실행하기 전 `find`를 먼저 실행한 후 `&&`로 `move`를 실행할 수도, 또는 서브쿼리 구문을 사용할 수도 있겠죠. 이후 해당 `\caption`을 `\includegraphics` 바로 아래에, 또는 `figure`의 최하단에 위치시킬 수 있겠습니다. 저는 후자를 택할게요. 그러면 다음과 같이 코드를 만들 수 있습니다.
```
`?move ^(find \caption ~ \includegraphics < \caption)^ >> figure.| & find figure without \centering > \includegraphics <+ "\centering\n"`
```
해당 쿼리의 동작을 분석해 봅시다. 먼저 서브쿼리를 실행합니다. 서브쿼리는 `find \caption ~ \includegraphics < \caption`으로, `\includegraphics`와 `\caption`이 같이 있는 구조를 찾은 후, 한 계층 올라가서 존재하는 `\caption`을 선택합니다. 이후 선택한 `\caption`을 자신이 속한 `figure`의 맨 아랫부분으로 옮깁니다. 동시에 중앙 정렬이 되지 않은 `figure`를 찾아 내부 그림의 바로 앞(`<+`)에 `\centering` 명령어를 삽입합니다.  

```
?find \frac{@arg[2]:@int} where @int == 0 >> 1
```
이는 `\frac`의 분모 (`@arg[2]:@int`)를 찾고, 만약 그 분모의 값이 0인 경우 1이라는 값으로 치환하라는 쿼리문입니다.

## Prerequisites

This extension requires **Python 3.x** and several mathematical libraries to perform symbolic calculations and plotting.

1. Install Python 3.x from [python.org](https://www.python.org/).
2. Install the required Python packages:
   ```bash
   pip install -r python_backend/requirements.txt
   ```

## Installation

1. Install the extension from the VS Code Marketplace.
2. Open any `.tex` file.
3. Use the keyboard shortcut `Ctrl+Shift+;` (or `Cmd+Shift+;` on macOS) to open the TeX-Machina CLI.

## Extension Settings

* `tex-machina.laplace.sourceVariable`: Default source variable for Laplace transform (e.g., `t`).
* `tex-machina.laplace.targetVariable`: Default target variable for Laplace transform (e.g., `s`).
* `tex-machina.angleUnit`: Default unit for rotations (`deg` or `rad`).
* `tex-machina.plot.datDensity`: Density of points for 2D PGFPlots generation.
* `tex-machina.plot.lineColor`: Default line color for plots.

## Usage

1. **Open CLI**: Press `Ctrl+Shift+;`.
2. **Select Command**: Choose from `calc`, `matrix`, `plot`, `cite`, `oeis`, or `analyze`.
3. **Interactive UI**: Follow the prompts to input formulas or select options.
4. **Webview Preview**: Visualize 3D plots and complex calculations in the side panel.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
