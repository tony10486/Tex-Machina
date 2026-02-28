# TeX-Machina

**TeX-Machina** is an interactive LaTeX assistant for VS Code that brings powerful symbolic computation, 3D plotting, and automated bibliography management directly into your TeX editing workflow.

## Features

- **Symbolic Calculation (`calc >`)**: Perform differentiation, integration, simplification, and equation solving. See step-by-step solutions within your editor.
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
