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

제 매크로의 기능은 다른 매크로와 다르게, LaTeX 환경과 찰떡궁합으로 작동하게 설계되었습니다. 그 중에서, 가장 혁명적인 특징은 바로 **컨텍스트 인지** 기능이죠. 이 기능이 무엇인지 알려드리겠습니다.
LaTeX는 문서 작성 환경이 크게 세 가지로 나뉩니다.
  1. 수식 입력 모드 
  2. 일반 텍스트 입력 모드 
  3. 특정 환경 내 입력 모드

수식 입력 모드의 경우 \begin{equation}, \begin{gather}, \begin{align}, 그리고 $ $ 가 있을 겁니다. 그리고 일반 텍스트 입력 모드는 말 그대로 1번과 3번이 아닌 다른 곳이겠죠. 특정 환경 내 입력 모드는 itemize, figure 등 기타 환경 내부에서의 모드입니다.
그 중, 전 1번과 2번의 차이점에 주목하였습니다. 우리는 국어 시간에 근의 공식을 말하지는 않듯이, 수식 입력 모드와 일반 텍스트 입력 모드에서 사용하는 양상이 현저히 다릅니다. 그리고, 만물의 영장인 우리가 하나하나 이를 구별해서 매크로를 지정해 주는 것은 우아하지 않죠. 따라서 동일한 명령어로 매크로를 지정하였어도 수식 내부에서 해당 명령어를 사용할 때와 수식 밖에서 해당 명령어를 사용할 때 작동 방시이 다르도록 만들었습니다.
하지만 굳이 이 기능이 왜 필요한지 의문이 들 수 있습니다. 그냥 매크로 명령어를 두개 지정하면 되지 꼭 그렇게 해야겠느냐고요. 그러나 한 글자를 입력할 떄와 두 글자를 입력할 때는 속도가 천지 차이로 다릅니다. 또한 갖가지 명령어를 기억하기도 귀찮구요. 한번 구체적인 예시를 보여드리겠습니다.

먼저 다음 두 명령어를 정의해 보세요. 윈도우에서는 `ctrl + shift + ;`를 눌러서, 맥에서는 `cmd + shift + ;`를 눌러서 명령줄을 띄운 뒤 다음 두 명령어를 그대로 복붙하시면 됩니다.
> `define:calc > simplify>:r:math`
> `define:cite > >:r:text`

(`define:cite > >:r:text` 해당 명령어의 구조를 짚고 넘어가야 할 듯 합니다. 만약 `define:cite > :r:text`라고 명령어를 정의한 경우, 추후 일반 텍스트 입력 모드에서 `;r`을 치셨을 경우 `연산 실패: Selection is empty after stripping delimiters` 라는 에러가 뜰 겁니다. 왜냐하면 `cite` 명령어는 선택된 텍스트, 또는 `cite > `이후에 오는 텍스트가 필요하기 때문이죠. 따라서 특정 텍스트를 지정하거나, `define:cite > 인용할 논문의 제목 :r:text` 로 정의해야 합니다. 그러나, 이러면 매크로를 쓰는 이유가 없죠. 고로 일반 텍스트 입력 모드에서 해당 명령어 `;r`을 입력한 경우 검색어를 입력할 수 있는 상태로 멈추게 정의한 겁니다. 저도 모든 매크로의 기능을 자유자재로 사용할 순 없을 정도로 로직이 방대합니다.)

그 다음 수식 내부에서 계산할 수식을 드래그 하고 `;r` 명령어를 친 결과와 수식 밖에서 `;r` 명령어를 친 결과를 비교해 보세요! 자주 사용하는 매크로를 쓰기 편한 위치에 지정해두면서도 명령어가 과도하게 불어나지 않도록 해 줍니다.
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
