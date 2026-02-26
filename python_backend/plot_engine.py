import os
import json
import warnings
import sympy as sp
import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any, List, Tuple
try:
    from latex2sympy2 import latex2sympy
except ImportError:
    from sympy.parsing.latex import parse_latex as latex2sympy

# ---------------------------------------------------------------------------
# [1] 코어 유틸리티 및 수학적 분석 모듈
# ---------------------------------------------------------------------------

def _safe_latex_parse(raw_latex: str) -> sp.Expr:
    """LaTeX 문자열을 SymPy 객체로 안전하게 변환합니다."""
    try:
        # latex2sympy가 가끔 Eq를 반환하거나 단순 Expr을 반환함
        expr = latex2sympy(raw_latex)
        if isinstance(expr, sp.Eq):
            return expr.lhs - expr.rhs
        return expr
    except Exception as e:
        raise ValueError(f"LaTeX 파싱 실패: {raw_latex}. 상세: {str(e)}")

def sympy_to_pgfplots_str(expr: sp.Expr) -> str:
    """SymPy 수식을 PGFPlots가 이해할 수 있는 대수적 문자열로 변환합니다."""
    expr_str = str(expr)
    expr_str = expr_str.replace('**', '^')
    expr_str = expr_str.replace('E', 'e')
    return expr_str

def detect_singularities(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float]) -> List[float]:
    """구간 내의 특이점(Singularities)을 탐색합니다."""
    try:
        sings = sp.calculus.singularities(expr, var)
        real_sings = []
        for s in sings:
            if s.is_real and domain[0] <= s <= domain[1]:
                real_sings.append(float(s.evalf()))
        return sorted(real_sings)
    except Exception:
        numer, denom = expr.as_numer_denom()
        if denom != 1:
            try:
                fallback_sings = sp.solve(denom, var)
                return sorted([
                    float(s.evalf()) for s in fallback_sings 
                    if s.is_real and domain[0] < s < domain[1]
                ])
            except: return []
        return []

# ---------------------------------------------------------------------------
# [2] 2D PGFPlots 엔진 (도메인 분할 & Data Off-loading)
# ---------------------------------------------------------------------------

def is_pgfplots_compatible(expr: sp.Expr) -> bool:
    """PGFPlots 네이티브 엔진이 지원하는 함수인지 검사합니다."""
    unsupported_funcs = (sp.gamma, sp.zeta, sp.erf, sp.besselj, sp.bessely, sp.LambertW)
    return not expr.has(*unsupported_funcs)

def generate_numerical_data(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float], workspace_dir: str, filename: str = "plot_data.dat") -> str:
    """수치적 좌표를 계산하여 .dat 파일로 저장합니다."""
    data_dir = os.path.join(workspace_dir, 'images')
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, filename)
    
    f = sp.lambdify(var, expr, modules=['numpy', 'scipy'])
    x_vals = np.linspace(domain[0], domain[1], 200) 
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        y_vals = f(x_vals)
    
    with open(filepath, 'w', encoding='utf-8') as file:
        file.write("x\ty\n")
        for x, y in zip(x_vals, y_vals):
            if np.isfinite(y) and np.isreal(y):
                file.write(f"{x:.6f}\t{y.real:.6f}\n")
            else:
                file.write(f"{x:.6f}\tinf\n")
                
    return f"images/{filename}"

def generate_2d_pgfplots(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float], parallels: List[str], workspace_dir: str) -> str:
    """2D PGFPlots 코드를 생성합니다. 100개 이상의 샘플링이 필요하거나 특수함수일 경우 .dat를 사용합니다."""
    
    # 병렬 옵션에서 샘플 수 확인 (예: samples=200)
    samples = 100
    for p in parallels:
        if p.startswith("samples="):
            try: samples = int(p.split("=")[1])
            except: pass

    # 100개 이상의 샘플링이 필요하다고 판단되는 경우 또는 비호환 함수인 경우
    needs_dat = not is_pgfplots_compatible(expr) or samples > 100 or any(p == "use_dat" for p in parallels)
    
    if needs_dat:
        # 데이터 포인트가 많으면 .dat 파일 생성 (Maximalist 요구사항: 100개 이상 시 자동 오프로드)
        dat_path = generate_numerical_data(expr, var, domain, workspace_dir)
        return f"    \\addplot table {{{dat_path}}};\n"

    sings = detect_singularities(expr, var, domain)
    expr_str = sympy_to_pgfplots_str(expr)
    
    if not sings:
        return f"    \\addplot[domain={domain[0]}:{domain[1]}, samples={samples}] {{{expr_str}}};\n"
    else:
        latex_code = ""
        current_min = domain[0]
        epsilon = 0.05
        for s in sings:
            if current_min < s - epsilon:
                latex_code += f"    \\addplot[domain={current_min}:{s-epsilon}, samples=50] {{{expr_str}}};\n"
            current_min = s + epsilon
        if current_min < domain[1]:
            latex_code += f"    \\addplot[domain={current_min}:{domain[1]}, samples=50] {{{expr_str}}};\n"
        return latex_code

# ---------------------------------------------------------------------------
# [3] 3D 및 복소 그래프 엔진 (x3dom & Domain Coloring)
# ---------------------------------------------------------------------------

def handle_plot_3d(expr: sp.Expr, var_list: List[sp.Symbol], params: Dict[str, Any]) -> Dict[str, Any]:
    """3D 그래프 데이터를 생성합니다 (x3dom용 메시 데이터)."""
    workspace_dir = params.get("workspaceDir", os.getcwd())
    
    # 도메인 설정 (기본값)
    x_range = (-5.0, 5.0)
    y_range = (-5.0, 5.0)
    
    # 변수 인식
    if len(var_list) >= 2:
        v1, v2 = var_list[0], var_list[1]
    elif len(var_list) == 1:
        v1 = var_list[0]
        v2 = sp.Symbol('y')
    else:
        v1, v2 = sp.Symbol('x'), sp.Symbol('y')

    # 메시 생성
    f = sp.lambdify((v1, v2), expr, modules=['numpy', 'scipy'])
    x = np.linspace(x_range[0], x_range[1], 30)
    y = np.linspace(y_range[0], y_range[1], 30)
    X, Y = np.meshgrid(x, y)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        Z = f(X, Y)
        if np.isscalar(Z):
            Z = np.full(X.shape, Z)

    # NaN/Inf 처리
    Z = np.nan_to_num(Z, nan=0.0, posinf=10.0, neginf=-10.0)

    # x3dom 데이터 형식 (IndexedFaceSet용)
    points = []
    for i in range(len(y)):
        for j in range(len(x)):
            points.append([float(X[i,j]), float(Y[i,j]), float(Z[i,j])])
            
    # 벡터 그래픽 저장 (사용자가 'export' 옵션을 주었을 때)
    if "export" in params.get("parallelOptions", []):
        fig = plt.figure()
        ax = fig.add_subplot(111, projection='3d')
        ax.plot_surface(X, Y, Z, cmap='viridis')
        img_path = os.path.join(workspace_dir, 'images', 'plot_3d.pdf')
        os.makedirs(os.path.dirname(img_path), exist_ok=True)
        plt.savefig(img_path)
        plt.close()
        latex_out = f"\\begin{{figure}}[ht]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{{images/plot_3d.pdf}}\n\\caption{{3D Plot of ${sp.latex(expr)}$}}\n\\end{{figure}}"
    else:
        latex_out = f"% 3D Previewing: ${sp.latex(expr)}$"

    return {
        "latex": latex_out,
        "x3d_data": {
            "points": points,
            "grid_size": [len(x), len(y)],
            "expr": sp.latex(expr)
        },
        "status": "success"
    }

def handle_plot_complex(expr: sp.Expr, var: sp.Symbol, params: Dict[str, Any]) -> Dict[str, Any]:
    """복소 평면 Domain Coloring 데이터를 생성합니다."""
    workspace_dir = params.get("workspaceDir", os.getcwd())
    
    res = 100
    x = np.linspace(-2, 2, res)
    y = np.linspace(-2, 2, res)
    X, Y = np.meshgrid(x, y)
    Z = X + 1j * Y
    
    f = sp.lambdify(var, expr, modules=['numpy', 'scipy'])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        W = f(Z)
    
    # Domain Coloring (Hue = Phase, Saturation = 1, Value = Mag)
    phase = np.angle(W) / (2 * np.pi) % 1.0
    mag = np.abs(W)
    v = mag / (1 + mag) # Normalize magnitude to [0, 1]
    
    # 간단한 색상 맵핑 (HSV -> RGB)
    from matplotlib.colors import hsv_to_rgb
    hsv = np.zeros((res, res, 3))
    hsv[..., 0] = phase
    hsv[..., 1] = 0.8
    hsv[..., 2] = v
    rgb = hsv_to_rgb(hsv)
    
    img_dir = os.path.join(workspace_dir, 'images')
    os.makedirs(img_dir, exist_ok=True)
    img_path = os.path.join(img_dir, 'complex_plot.png')
    plt.imsave(img_path, rgb)
    
    return {
        "latex": f"\\begin{{figure}}[ht]\n\\centering\n\\includegraphics[width=0.5\\textwidth]{{images/complex_plot.png}}\n\\caption{{Domain Coloring of ${sp.latex(expr)}$}}\n\\end{{figure}}",
        "status": "success"
    }

# ---------------------------------------------------------------------------
# [4] 메인 라우터
# ---------------------------------------------------------------------------

def handle_plot(expr_latex: str, sub_cmds: List[str], parallels: List[str], config: Dict[str, Any], workspace_dir: str) -> Dict[str, Any]:
    """Plot 명령어 통합 핸들러."""
    expr = _safe_latex_parse(expr_latex)
    free_symbols = sorted(list(expr.free_symbols), key=lambda s: s.name)
    
    # 서브 커맨드 결정 (2d, 3d, complex)
    mode = "2d"
    if sub_cmds:
        if sub_cmds[0] in ["3d", "complex", "c"]:
            mode = sub_cmds.pop(0)
    
    params = {
        "parallelOptions": parallels,
        "workspaceDir": workspace_dir,
        "config": config
    }

    if mode == "3d":
        return handle_plot_3d(expr, free_symbols, params)
    elif mode in ["complex", "c"]:
        var = free_symbols[0] if free_symbols else sp.Symbol('z')
        return handle_plot_complex(expr, var, params)
    else:
        # 2D Default
        domain = (-10.0, 10.0)
        if sub_cmds and "," in sub_cmds[0]:
            try:
                bounds = sub_cmds[0].split(',')
                domain = (float(sp.sympify(bounds[0]).evalf()), float(sp.sympify(bounds[1]).evalf()))
            except: pass
            
        var = free_symbols[0] if free_symbols else sp.Symbol('x')
        pgf_code = generate_2d_pgfplots(expr, var, domain, parallels, workspace_dir)
        
        final_latex = (
            "\\begin{tikzpicture}\n"
            f"\\begin{{axis}}[\n"
            f"    axis lines=middle,\n"
            f"    xlabel=${sp.latex(var)}$,\n"
            f"    ylabel=$f({sp.latex(var)})$,\n"
            f"    trig format plots=rad,\n"
            f"    restrict y to domain=-15:15\n"
            f"]\n"
            f"{pgf_code}"
            "\\end{axis}\n"
            "\\end{tikzpicture}"
        )
        return {
            "status": "success",
            "latex": final_latex,
            "vars": [str(s) for s in free_symbols]
        }
