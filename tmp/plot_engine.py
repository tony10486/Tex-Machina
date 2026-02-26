import os
import json
import warnings
import sympy as sp
import numpy as np
from typing import Dict, Any, List, Tuple

# latex2sympy2 파서 (Vol 1. 5.1장 규격)
from latex2sympy2 import latex2sympy

# ---------------------------------------------------------------------------
# [1] 코어 유틸리티 및 수학적 분석 모듈
# ---------------------------------------------------------------------------

def _safe_latex_parse(raw_latex: str) -> sp.Expr:
    """LaTeX 문자열을 SymPy 객체로 안전하게 변환합니다."""
    try:
        return latex2sympy(raw_latex)
    except Exception as e:
        raise ValueError(f"LaTeX 파싱 실패: {raw_latex}. 상세: {str(e)}")

def sympy_to_pgfplots_str(expr: sp.Expr) -> str:
    """
    SymPy 수식을 PGFPlots가 이해할 수 있는 대수적 문자열로 변환합니다.
    (예: x**2 -> x^2, sp.E -> e)
    """
    # 기본 문자열 변환
    expr_str = str(expr)
    # PGFPlots 문법에 맞게 연산자 치환
    expr_str = expr_str.replace('**', '^')
    expr_str = expr_str.replace('E', 'e')
    # 추가적인 정규식 치환이 필요할 수 있으나 MVP 수준에서는 이 정도로 호환됨
    return expr_str

def detect_singularities(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float]) -> List[float]:
    """
    구간 내의 특이점(Singularities)을 엄밀하게 탐색합니다.
    """
    try:
        sings = sp.calculus.singularities(expr, var)
        real_sings =[]
        for s in sings:
            if s.is_real and domain[0] <= s <= domain[1]:
                real_sings.append(float(s.evalf()))
        return sorted(real_sings)
    except Exception:
        # Fallback: 분모가 0이 되는 지점 탐색
        numer, denom = expr.as_numer_denom()
        if denom != 1:
            fallback_sings = sp.solve(denom, var)
            return sorted([
                float(s.evalf()) for s in fallback_sings 
                if s.is_real and domain[0] < s < domain[1]
            ])
        return []

# ---------------------------------------------------------------------------
# [2] 근사 및 수치 해석 데이터 생성 모듈 (Maximalist 기능)
# ---------------------------------------------------------------------------

def is_pgfplots_compatible(expr: sp.Expr) -> bool:
    """PGFPlots 네이티브 엔진이 지원하는 함수인지 검사합니다."""
    # PGFPlots가 기본적으로 처리하기 힘든 특수 함수 화이트리스트 검사
    unsupported_funcs = (sp.gamma, sp.zeta, sp.erf, sp.besselj, sp.bessely)
    return not expr.has(*unsupported_funcs)

def apply_approximation(expr: sp.Expr, var: sp.Symbol, method: str) -> sp.Expr:
    """특수함수를 PGFPlots가 그릴 수 있는 다항식/기본함수로 근사합니다."""
    center = 0
    if method == 'taylor':
        return expr.series(var, center, 6).removeO()
    elif method == 'asymp':
        return expr.series(var, sp.oo, 4).removeO()
    elif method == 'stirling':
        # 스털링 근사: 감마 함수 전용
        stirling_form = sp.sqrt(2 * sp.pi / var) * (var / sp.E)**var
        return expr.replace(sp.gamma, lambda arg: stirling_form.subs(var, arg))
    elif method == 'pade':
        # 파데 근사 (SymPy의 제약으로 MVP에서는 6차 테일러 급수를 유리식으로 매핑)
        taylor_series = expr.series(var, center, 6).removeO()
        return sp.cancel(taylor_series)
    
    return expr

def generate_numerical_data(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float], workspace_dir: str) -> str:
    """
    PGFPlots로 그릴 수 없는 복잡한 함수에 대해, 
    Numpy로 좌표를 계산하여 .dat 파일로 저장합니다. (Vol 2. 9.1장 준수)
    """
    # 데이터 폴더 생성
    data_dir = os.path.join(workspace_dir, '.tex-machina', 'data')
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, 'plot_1.dat')
    
    # SymPy 수식을 고속 Numpy 함수로 변환 (Lambdify)
    f = sp.lambdify(var, expr, modules=['numpy', 'scipy'])
    x_vals = np.linspace(domain[0], domain[1], 150) # 150개의 샘플링 포인트
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        y_vals = f(x_vals)
    
    # TSV 포맷으로 파일 저장
    with open(filepath, 'w', encoding='utf-8') as file:
        file.write("x\ty\n")
        for x, y in zip(x_vals, y_vals):
            if np.isfinite(y) and not np.iscomplex(y):
                file.write(f"{x:.6f}\t{y:.6f}\n")
            else:
                # 발산/복소수 영역은 빈 값으로 처리하여 PGFPlots가 선을 끊게 함
                file.write(f"{x:.6f}\tinf\n")
                
    # LaTeX 코드에는 상대 경로 삽입을 위해 정제된 경로 반환
    return ".tex-machina/data/plot_1.dat"

# ---------------------------------------------------------------------------
# [3] 2D 그래프 생성 파이프라인 (도메인 분할)
# ---------------------------------------------------------------------------

def generate_2d_pgfplots(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float], parallels: List[str], workspace_dir: str) -> str:
    """PGFPlots 축(axis) 내부의 실제 \addplot 코드를 생성합니다."""
    
    # 1. 병치 옵션 파싱 (근사법 확인)
    approx_method = next((p.split('=')[1] for p in parallels if p.startswith('approx=')), None)
    
    # 2. 호환성 검사 및 데이터 오프로딩(Off-loading)
    if not is_pgfplots_compatible(expr):
        if approx_method:
            expr = apply_approximation(expr, var, approx_method)
        else:
            # 근사 옵션이 없으면 수치적 데이터 파일(.dat) 생성 알고리즘으로 분기
            dat_path = generate_numerical_data(expr, var, domain, workspace_dir)
            return f"    \\addplot table {{{dat_path}}};\n"

    # 3. 특이점 기반 도메인 지능형 분할
    sings = detect_singularities(expr, var, domain)
    latex_code = ""
    expr_str = sympy_to_pgfplots_str(expr)
    
    if not sings:
        # 특이점이 없으면 단일 도메인으로 출력
        latex_code += f"    \\addplot[domain={domain[0]}:{domain[1]}, samples=100] {{{expr_str}}};\n"
    else:
        # 특이점을 우회하는 다중 도메인 생성
        current_min = domain[0]
        epsilon = 0.05 # 수직 점근선을 피하기 위한 버퍼
        
        for s in sings:
            if current_min < s - epsilon:
                latex_code += f"    \\addplot[domain={current_min}:{s-epsilon}, samples=50] {{{expr_str}}};\n"
            current_min = s + epsilon
            
        if current_min < domain[1]:
            latex_code += f"    \\addplot[domain={current_min}:{domain[1]}, samples=50] {{{expr_str}}};\n"
            
    return latex_code

# ---------------------------------------------------------------------------
# [4] 3D 및 복소 그래프 플레이스홀더 (Manim/Plotly 브릿지)
# ---------------------------------------------------------------------------

def handle_plot_3d(expr: sp.Expr, params: Dict[str, Any]) -> Dict[str, Any]:
    """Plotly 기반 3D 그래프 생성 (명세서 9.2장 - 향후 구현될 웹뷰 연동용)"""
    return {
        "latex": "% 3D Plotly Engine Triggered\n% \\includegraphics{images/plot_3d.pdf}",
        "html_preview": "<div>Plotly 3D Preview (To be implemented)</div>"
    }

def handle_plot_complex(expr: sp.Expr, params: Dict[str, Any]) -> Dict[str, Any]:
    """Manim 기반 복소 Domain Coloring (명세서 9.2장 - 향후 구현될 렌더링용)"""
    return {
        "latex": "% Complex Manim Engine Triggered\n% \\href{run:images/complex_anim.mp4}{[Play Complex Animation]}"
    }

# ---------------------------------------------------------------------------
# [5] 메인 라우터 (main.py에서 호출되는 진입점)
# ---------------------------------------------------------------------------

def handle_plot(sub_cmd: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    plot 명령어의 최상위 라우터.
    IPC 서버(main.py)로부터 넘겨받은 파라미터를 분석하여 적절한 엔진으로 라우팅합니다.
    """
    raw_selection = params.get("rawSelection", "").strip()
    if not raw_selection:
        raise ValueError("선택된 수식이 없습니다. (rawSelection is empty)")

    parallels = params.get("parallelOptions",[])
    sub_commands = params.get("subCommands",[])
    workspace_dir = params.get("workspaceDir", os.getcwd()) # 확장 프로그램 작업 공간 경로
    
    # 1. 수식 파싱
    expr = _safe_latex_parse(raw_selection)
    
    # 2. 엔진 라우팅 분기
    if sub_cmd == "3d":
        return handle_plot_3d(expr, params)
    elif sub_cmd in ("c", "complex"):
        return handle_plot_complex(expr, params)
    else: # 기본값은 2d
        # 3. 도메인 추출 (예: plot > 2d > -5, 5)
        domain = (-10.0, 10.0) # Default
        if sub_commands:
            bounds = sub_commands[0].split(',')
            if len(bounds) == 2:
                # 수식이 섞여 있을 수 있으므로 sympy로 파싱 후 float 캐스팅 (예: "-pi, pi")
                lower = float(_safe_latex_parse(bounds[0]).evalf())
                upper = float(_safe_latex_parse(bounds[1]).evalf())
                domain = (lower, upper)
        
        # 4. 변수 추출
        free_symbols = list(expr.free_symbols)
        var = sp.Symbol('x') if sp.Symbol('x') in free_symbols else (free_symbols[0] if free_symbols else sp.Symbol('x'))
        
        # 5. 2D 그래프 PGFPlots 코드 생성
        pgf_code = generate_2d_pgfplots(expr, var, domain, parallels, workspace_dir)
        
        # PGFPlots 옵션 최적화 (trig format plots=rad 추가하여 라디안 호환성 보장)
        final_latex = (
            "\\begin{tikzpicture}\n"
            f"\\begin{{axis}}[\n"
            f"    axis lines=middle,\n"
            f"    xlabel=${var}$,\n"
            f"    ylabel=$f({var})$,\n"
            f"    trig format plots=rad, % 삼각함수 라디안 처리\n"
            f"    restrict y to domain=-15:15 % Y축 발산 제한\n"
            f"]\n"
            f"{pgf_code}"
            "\\end{axis}\n"
            "\\end{tikzpicture}"
        )
        
        # IPC 규격(IpcResultData)에 맞게 딕셔너리로 반환
        return {
            "latex": final_latex,
            # 추후 프론트엔드 웹뷰에 띄울 KaTeX/MathJax용 텍스트 추가 가능
            "html_preview": f"<div class='preview'>Preview ready for {sp.printing.latex(expr)}</div>" 
        }