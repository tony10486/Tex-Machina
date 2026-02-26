import os
import json
import warnings
import sympy as sp
import numpy as np
import matplotlib.pyplot as plt
import base64
from io import BytesIO
from typing import Dict, Any, List, Tuple
try:
    from latex2sympy2 import latex2sympy
except ImportError:
    from sympy.parsing.latex import parse_latex as latex2sympy

# ---------------------------------------------------------------------------
# [1] 코어 유틸리티 및 수학적 분석 모듈
# ---------------------------------------------------------------------------

PGF_SUPPORTED_FUNCS = (
    sp.sin, sp.cos, sp.tan, sp.asin, sp.acos, sp.atan, sp.atan2,
    sp.exp, sp.log, sp.Abs, sp.floor, sp.ceiling,
)

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
    # SymPy의 log(x)는 PGFPlots에서 ln(x)로 변환
    expr_str = expr_str.replace('log(', 'ln(')
    return expr_str

def detect_singularities(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float]) -> List[float]:
    """구간 내의 특이점(Singularities)을 탐색합니다."""
    sings_found = set()
    
    # 1. SymPy 내장 탐색
    try:
        sings = sp.calculus.singularities(expr, var)
        if hasattr(sings, '__iter__'):
            for s in sings:
                if s.is_real and domain[0] <= s <= domain[1]:
                    sings_found.add(float(s.evalf()))
    except: pass
    
    # 2. 분모가 0인 점 (Fallback)
    numer, denom = expr.as_numer_denom()
    if denom != 1:
        try:
            sol = sp.solve(denom, var)
            for s in sol:
                if s.is_real and domain[0] <= s <= domain[1]:
                    sings_found.add(float(s.evalf()))
        except: pass

    # 3. Gamma/Zeta 등 특수 함수의 폴(Pole) 수동 탐색
    if expr.has(sp.gamma):
        # Gamma(x)는 0, -1, -2, ... 에서 폴을 가짐
        start = int(np.floor(domain[0]))
        end = int(np.ceil(domain[1]))
        for n in range(start, end + 1):
            if n <= 0 and domain[0] <= n <= domain[1]:
                sings_found.add(float(n))

    # 4. 수치적 스캔 (급격한 변화 탐지)
    f = sp.lambdify(var, expr, modules=['numpy', 'scipy'])
    x_scan = np.linspace(domain[0], domain[1], 1000)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            y_scan = f(x_scan)
            for i in range(1, len(y_scan)):
                if not np.isfinite(y_scan[i]):
                    sings_found.add(float(x_scan[i]))
                elif np.abs(y_scan[i]) > 1e6 and np.sign(y_scan[i]) != np.sign(y_scan[i-1]):
                    # 부호가 바뀌며 값이 매우 크면 중간에 폴이 있을 가능성 농후
                    sings_found.add(float(x_scan[i]))
        except: pass
        
    return sorted(list(sings_found))

# ---------------------------------------------------------------------------
# [2] 2D PGFPlots 엔진 (도메인 분할 & Data Off-loading)
# ---------------------------------------------------------------------------

def is_pgfplots_compatible(expr: sp.Expr) -> bool:
    """PGFPlots 네이티브 엔진이 지원하는 함수인지 검사합니다."""
    funcs = expr.atoms(sp.Function)
    for f in funcs:
        if not isinstance(f, PGF_SUPPORTED_FUNCS):
            return False
    return True

def try_rewrite_for_pgfplots(expr: sp.Expr) -> sp.Expr:
    """비호환 함수를 exp나 기본 삼각함수로 재작성 시도합니다 (예: sinh -> exp)."""
    # 쌍곡선 함수는 exp로 변환 가능
    rewritten = expr.rewrite(sp.exp)
    if is_pgfplots_compatible(rewritten):
        return rewritten
    
    # sec, csc, cot 등은 sin, cos, tan으로 변환 가능
    rewritten = expr.rewrite(sp.sin).rewrite(sp.cos).rewrite(sp.tan)
    if is_pgfplots_compatible(rewritten):
        return rewritten
        
    return expr

def try_taylor_approximation(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float]) -> sp.Expr:
    """테일러 전개를 통해 PGFPlots 호환 수식으로 근사를 시도합니다."""
    try:
        # 도메인 중앙에서 전개
        x0 = (domain[0] + domain[1]) / 2
        if not expr.subs(var, x0).is_finite:
            x0 = domain[0] + 0.1
            
        # 6차 테일러 다항식 생성 및 수치화
        poly = expr.series(var, x0, 6).removeO().evalf()
        if is_pgfplots_compatible(poly):
            return poly
    except:
        pass
    return None

def generate_numerical_data(expr: sp.Expr, var: sp.Symbol, intervals: List[Tuple[float, float]], samples_per_interval: int = 100, y_limit: float = 50.0) -> Tuple[str, str]:
    """수치적 좌표 데이터를 생성하고 미리보기 이미지를 반환합니다. 다중 구간(특이점 분리)을 지원합니다."""
    f = sp.lambdify(var, expr, modules=['numpy', 'scipy', {'gamma': sp.gamma, 'zeta': sp.zeta}])
    
    dat_content = "x\ty\n"
    plt.figure(figsize=(5, 4))
    
    for start, end in intervals:
        if start >= end:
            continue
            
        x_vals = np.linspace(start, end, samples_per_interval)
        
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                y_vals = f(x_vals)
                # 스칼라 결과가 나올 경우 배열로 확장
                if np.isscalar(y_vals):
                    y_vals = np.full(x_vals.shape, y_vals)
            except:
                y_vals = np.full(x_vals.shape, np.nan)
        
        # .dat 파일 세그먼트 생성
        for x, y in zip(x_vals, y_vals):
            if np.isfinite(y) and np.isreal(y):
                y_val = float(y.real)
                if abs(y_val) > y_limit:
                    dat_content += f"{x:.6f}\t{np.sign(y_val) * y_limit:.6f}\n"
                else:
                    dat_content += f"{x:.6f}\t{y_val:.6f}\n"
            else:
                dat_content += f"{x:.6f}\tinf\n"
        
        # 구간 사이에 빈 줄 추가 (PGFPlots에서 선 연결 방지)
        dat_content += "\n"
        
        # 미리보기 이미지 (Matplotlib은 NaN이 있으면 자동으로 선을 끊음)
        plt.plot(x_vals, y_vals, 'b-')
    
    plt.ylim(-15, 15)
    plt.grid(True)
    plt.title(f"Preview: ${sp.latex(expr)}$")
    
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close()
    img_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                
    return dat_content, f"data:image/png;base64,{img_base64}"

def generate_2d_pgfplots(expr: sp.Expr, var: sp.Symbol, domain: Tuple[float, float], parallels: List[str], dat_samples: int = 500, y_limit: float = 50.0) -> Tuple[str, str, str, str]:
    """2D PGFPlots 코드를 생성합니다. 특이점 분할 및 균등한 포인트 분배를 지원합니다."""
    
    warning_msg = None
    dat_content = None
    preview_img = None
    
    # parallels에서 samples 옵션 우선 확인 (dat_samples와 연동)
    for p in parallels:
        if p.startswith("samples="):
            try: dat_samples = int(p.split("=")[1])
            except: pass

    # 1. 특이점 탐색 및 구간 분할
    sings = detect_singularities(expr, var, domain)
    intervals = []
    current_min = domain[0]
    epsilon = 0.05
    for s in sings:
        if current_min < s - epsilon:
            intervals.append((current_min, s - epsilon))
        current_min = s + epsilon
    if current_min < domain[1]:
        intervals.append((current_min, domain[1]))
        
    if not intervals: # 특이점이 도메인 전체를 덮거나 비정상적인 경우
        intervals = [domain]

    # 구간당 샘플 수 계산 (동일 분배)
    samples_per_interval = max(10, dat_samples // len(intervals))

    # 2. 재작성 시도 (sinh -> exp 등)
    target_expr = try_rewrite_for_pgfplots(expr)
    
    # 3. PGFPlots 호환성 검사 및 데이터 파일 사용 여부 결정
    needs_dat = False
    if not is_pgfplots_compatible(target_expr):
        # 테일러 전개 시도
        taylor_expr = try_taylor_approximation(target_expr, var, domain)
        if taylor_expr:
            target_expr = taylor_expr
            warning_msg = f"PGFPlots 비호환 함수가 테일러 급수로 근사되었습니다: {sp.latex(taylor_expr)}"
        else:
            needs_dat = True
            warning_msg = "PGFPlots 비호환 함수입니다. 외부 데이터(.dat)를 사용합니다."

    # 샘플 수가 많거나 명시적으로 데이터 파일 사용 요청 시
    if dat_samples > 150 or any(p == "use_dat" for p in parallels):
        needs_dat = True

    if needs_dat:
        dat_content, preview_img = generate_numerical_data(expr, var, intervals, samples_per_interval, y_limit)
        # addplot table 시 점(marks)이 표시되지 않도록 [no marks] 추가
        return "    \\addplot[no marks] table {data/plot_data.dat};\n", warning_msg, dat_content, preview_img

    # Native PGFPlots: 구간별로 addplot 생성 (separate)
    expr_str = sympy_to_pgfplots_str(target_expr)
    _, preview_img = generate_numerical_data(target_expr, var, intervals, samples_per_interval, y_limit)
    
    latex_code = ""
    for start, end in intervals:
        latex_code += f"    \\addplot[no marks, domain={start}:{end}, samples={samples_per_interval}] {{{expr_str}}};\n"
        
    return latex_code, warning_msg, None, preview_img

# ---------------------------------------------------------------------------
# [3] 3D 및 복소 그래프 엔진 (x3dom & Domain Coloring)
# ---------------------------------------------------------------------------

def handle_plot_3d(expr: sp.Expr, var_list: List[sp.Symbol], params: Dict[str, Any]) -> Dict[str, Any]:
    """3D 그래프 데이터를 생성합니다 (x3dom용 메시 데이터)."""
    workspace_dir = params.get("workspaceDir", os.getcwd())
    parallels = params.get("parallelOptions", [])
    
    # 해상도 설정 (기본값 50으로 상향)
    grid_res = 50
    for p in parallels:
        if p.startswith("samples="):
            try: grid_res = int(p.split("=")[1])
            except: pass

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
    x = np.linspace(x_range[0], x_range[1], grid_res)
    y = np.linspace(y_range[0], y_range[1], grid_res)
    X, Y = np.meshgrid(x, y)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        Z = f(X, Y)
        if np.isscalar(Z):
            Z = np.full(X.shape, Z)

    # NaN/Inf 처리 (Z값을 적절한 범위로 제한)
    Z = np.nan_to_num(Z, nan=0.0, posinf=15.0, neginf=-15.0)
    Z = np.clip(Z, -15.0, 15.0)

    # x3dom 데이터 형식 (IndexedFaceSet용)
    points = []
    for i in range(len(y)):
        for j in range(len(x)):
            points.append([float(X[i,j]), float(Y[i,j]), float(Z[i,j])])
            
    # 벡터 그래픽 생성 (사용자가 'export' 옵션을 주었을 때)
    pdf_base64 = None
    if "export" in parallels:
        # X3D와 유사한 색상 적용 (옵션이 있을 경우)
        color = "#1a99cc"
        for p in parallels:
            if p.startswith("color="):
                color = p.split("=")[1]

        fig = plt.figure(figsize=(8, 6))
        ax = fig.add_subplot(111, projection='3d')
        # 색상 값이 hex일 경우 matplotlib에서 인식 가능
        ax.plot_surface(X, Y, Z, color=color, alpha=0.8, edgecolor='none')
        
        # 뷰 각도 설정 (약간의 입체감)
        ax.view_init(elev=30, azim=45)
        
        buf = BytesIO()
        plt.savefig(buf, format='pdf', bbox_inches='tight')
        plt.close()
        pdf_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    return {
        "latex": f"% 3D Interactive Preview of ${sp.latex(expr)}$",
        "x3d_data": {
            "points": points,
            "grid_size": [len(x), len(y)],
            "expr": sp.latex(expr)
        },
        "pdf_content": pdf_base64,
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
        elif sub_cmds[0] == "2d":
            sub_cmds.pop(0) # '2d' 문자열 제거하여 범위 파싱 방해 안하게 함
    
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
        # sub_cmds에서 쉼표가 포함된 문자열(범위) 찾기
        for cmd in sub_cmds:
            if "," in cmd:
                try:
                    bounds = cmd.split(',')
                    domain = (float(sp.sympify(bounds[0]).evalf()), float(sp.sympify(bounds[1]).evalf()))
                    break
                except: pass
            
        var = free_symbols[0] if free_symbols else sp.Symbol('x')
        dat_samples = config.get('datDensity', 500)
        
        # y축 범위 옵션 파싱 (기본값 -15:15)
        ymin, ymax = -15, 15
        y_multiplier = config.get('yMultiplier', 5.0)
        for p in parallels:
            if p.startswith("ymin="):
                try: ymin = float(p.split("=")[1])
                except: pass
            elif p.startswith("ymax="):
                try: ymax = float(p.split("=")[1])
                except: pass
            elif p.startswith("yMultiplier="):
                try: y_multiplier = float(p.split("=")[1])
                except: pass
        
        # 데이터 파일 계산 범위 (y_limit) 동적 설정
        y_limit = max(abs(ymin), abs(ymax)) * y_multiplier
        
        # 데이터 파일 이름 생성 (중복 방지를 위해 타임스탬프 추가)
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dat_filename = f"plot_data_{timestamp}.dat"
        
        pgf_code, warning_msg, dat_content, preview_img = generate_2d_pgfplots(expr, var, domain, parallels, dat_samples, y_limit)
        
        # PGFPlots 코드 내의 파일 경로 수정
        pgf_code = pgf_code.replace("data/plot_data.dat", f"data/{dat_filename}")
        
        final_latex = (
            "\\begin{tikzpicture}\n"
            f"\\begin{{axis}}[\n"
            f"    axis lines=middle,\n"
            f"    xlabel=${sp.latex(var)}$,\n"
            f"    ylabel=$f({sp.latex(var)})$,\n"
            f"    trig format plots=rad,\n"
            f"    restrict y to domain={ymin}:{ymax},\n"
            f"    xmin={domain[0]}, xmax={domain[1]},\n"
            f"    ymin={ymin}, ymax={ymax}\n"
            f"]\n"
            f"{pgf_code}"
            "\\end{axis}\n"
            "\\end{tikzpicture}"
        )
        return {
            "status": "success",
            "latex": final_latex,
            "vars": [str(s) for s in free_symbols],
            "warning": warning_msg,
            "dat_content": dat_content,
            "dat_filename": dat_filename,
            "preview_img": preview_img
        }
