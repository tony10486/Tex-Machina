# TeX-Machina

**TeX-Machina**는 VS code용 LaTeX 확장 프로그램입니다. LaTeX 문서를 작성하면서 필요한 기능과, 반복 작업의 간편화를 위해 제작되었습니다. 
## Features

- **심볼릭 연산(Symbolic Calculation) `calc >`**: NumPy, SymPy, SciPy 패키지를 이용한 기호 기반 연산 기능입니다. 정말 많은 기능을 지원하지만, 그 중에서 대표적인 몇 가지 기능의 예시를 보여드리자면...
  1. 미분과 적분 : 원하는 수식의 미분과 적분을 수행합니다.
- **Matrix Tools (`matrix >`)**: Generate various matrix environments (pmatrix, bmatrix, etc.) with automatic "smart dots" and analysis (determinant, inverse, RREF).
- **Advanced Plotting (`plot >`)**: 
  - **2D**: Generate PGFPlots data and LaTeX code.
  - **3D**: Interactive 3D visualization using X3DOM and exportable PDF/PNG figures.
  - **Complex**: Domain coloring for complex analysis.
- **Sequence Search (`oeis >`)**: Search for number sequences in the OEIS database and insert them into your document.
- **Smart Citations (`cite >`)**: Search papers by DOI, arXiv ID, or title, and automatically update your `.bib` files and insert `\cite` commands.
- **Width Analysis**: Analyze LaTeX formula widths to ensure they fit within your document margins.

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
