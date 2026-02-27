import os
import json
import warnings
import sympy as sp
import numpy as np
import matplotlib.pyplot as plt
import base64
import sys
import re
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
        # i를 I로, j를 I로 전처리 (허수 단위 대응)
        processed_latex = raw_latex
        
        # 1. 기본적인 LaTeX 명령어 보정
        # \Gamma{\left(z \right)} -> \Gamma(z) 형태로 변환 (parse_latex가 Mul로 오인하는 것 방지)
        # 모든 그리스 문자나 함수 이름 뒤의 {\left( ... \right)} 패턴을 찾아 (...)로 치환
        processed_latex = re.sub(r'\\([a-zA-Z]+)\s*\{\\left\((.*?)\\right\)\}', r'\\\1(\2)', processed_latex)
        # \left( ... \right) 만 있는 경우도 보정
        processed_latex = processed_latex.replace(r'\left(', '(').replace(r'\right)', ')')
        # \text{gamma} -> gamma 변환
        processed_latex = re.sub(r'\\text\{([a-zA-Z]+)\}', r'\1', processed_latex)
        
        expr = latex2sympy(processed_latex)
        if isinstance(expr, sp.Eq):
            return expr.lhs - expr.rhs
        return expr
    except Exception as e:
        # Fallback: parse_latex가 실패하면 sympify 시도 (간단한 수식용)
        try:
            return sp.sympify(raw_latex.replace('\\', ''))
        except:
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

    # 4. tan(x) 특이점 (pi/2 + n*pi)
    if expr.has(sp.tan):
        start = int(np.floor(domain[0] / np.pi - 0.5))
        end = int(np.ceil(domain[1] / np.pi - 0.5))
        for n in range(start, end + 1):
            s = (n + 0.5) * np.pi
            if domain[0] <= s <= domain[1]:
                sings_found.add(float(s))

    # 5. 수치적 스캔 (급격한 변화 탐지)
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
    # 이미 호환되면 그대로 반환
    if is_pgfplots_compatible(expr):
        return expr

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
    # 특이점 근처에서 약간의 여유(epsilon)를 두어 발산하는 값이 plot에 직접 포함되지 않게 함
    # 하지만 도메인 전체 범위는 유지하도록 노력
    epsilon = 0.01 
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
        # addplot table 시 점(marks)이 표시되지 않도록 [no marks] 추가, 그리고 domain 반영
        return f"    \\addplot[no marks, domain={domain[0]}:{domain[1]}] table {{data/plot_data.dat}};\n", warning_msg, dat_content, preview_img

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
    
    # 해상도 설정
    grid_res = 50
    x_range = [-5.0, 5.0]
    y_range = [-5.0, 5.0]
    z_range = [-15.0, 15.0]
    color_scheme = "uniform"
    custom_color = "#1a99cc"
    labels = {"x": "x", "y": "y", "z": "z", "font": "SANS"}
    bg_color = "#ffffff"
    
    # 복소수 맵핑 옵션
    complex_mode = "abs_phase" # height_color mapping
    # i(I)가 수식에 포함되었거나 변수 z가 포함되어 있으면 복소 그래프 모드로 동작 제안
    is_complex = expr.has(sp.I) or any(s.name == 'z' for s in expr.free_symbols) or expr.has(sp.Symbol('i'))
    
    # [i 허수 단위 기호 보정]
    # 'i'가 수식에 포함되어 있고, 이것이 독립 변수가 아니라면 허수 단위로 취급
    if sp.Symbol('i') in expr.free_symbols:
        if not any(s.name == 'i' for s in var_list):
            expr = expr.subs(sp.Symbol('i'), sp.I)
            # 수식에서 i가 제거되었을 수 있으므로 is_complex 재설정
            is_complex = expr.has(sp.I) or any(s.name == 'z' for s in expr.free_symbols)
    
    # 그라디언트 스탑 ([(pos, color), ...])
    color_stops = []
    preset_name = None

    # First pass to get basic parameters
    for p in parallels:
        p = p.strip()
        if p.startswith("samples="):
            try: grid_res = int(p.split("=")[1])
            except: pass
        elif p.startswith("x="):
            try: x_range = [float(x) for x in p.split("=")[1].split(",")]
            except: pass
        elif p.startswith("y="):
            try: y_range = [float(y) for y in p.split("=")[1].split(",")]
            except: pass
        elif p.startswith("z="):
            try: z_range = [float(z) for z in p.split("=")[1].split(",")]
            except: pass
        elif p.startswith("color="):
            custom_color = p.split("=")[1]
        elif p.startswith("scheme="):
            color_scheme = p.split("=")[1]
        elif p.startswith("bg="):
            bg_color = p.split("=")[1]
        elif p.startswith("complex="):
            complex_mode = p.split("=")[1]
            is_complex = True
        elif p.startswith("stops="):
            try:
                stop_parts = p.split("=")[1].split(",")
                for sp_part in stop_parts:
                    pos, col = sp_part.split(":")
                    color_stops.append((float(pos), col))
                color_stops.sort()
            except: pass
        elif p.startswith("preset="):
            preset_name = p.split("=")[1]
        elif p.startswith("label="):
            label_parts = p.split("=")[1].split(",")
            for lp in label_parts:
                if ":" in lp:
                    k, v = lp.split(":", 1)
                    labels[k.strip().lower()] = v.strip()

    # Finalize color scheme based on available data
    if color_stops:
        # stops가 있으면 gradient나 height/custom 모드로 동작
        if color_scheme not in ["gradient", "height"]:
            color_scheme = "custom"
    elif preset_name:
        color_scheme = "preset"
    elif color_scheme == "preset": # preset= 옵션 없이 scheme=preset만 온 경우 (기본값 설정)
        preset_name = "viridis"
    
    # [복소수 시각화 변수 확장 개선]
    # 사용자가 'complex=' 옵션을 주었거나 수식에 허수 단위 i가 포함된 경우 처리
    is_complex_by_opt = any(p.startswith("complex=") for p in parallels) or is_complex
    is_single_complex_input = False
    
    if is_complex_by_opt:
        if len(var_list) == 1:
            # 단일 변수 (z 등) -> x + iy로 확장
            # [Fix] 수식에 있는 실제 심볼을 찾아 치환 (이름 불일치 방지)
            v_orig = list(expr.free_symbols)[0] if expr.free_symbols else var_list[0]
            v1 = sp.Symbol('x', real=True)
            v2 = sp.Symbol('y', real=True)
            
            # SciPy ufunc 대응: 단일 복소수 심볼로 lambdify
            v_comp = sp.Symbol('v_comp', complex=True)
            expr = expr.subs(v_orig, v_comp)
            f = sp.lambdify(v_comp, expr, modules=['numpy', 'scipy'])
            is_single_complex_input = True
            
            # 가시화용 변수 이름 (라벨용)
            var_list = [v1, v2]
        elif len(var_list) >= 2:
            # 이미 x, y가 있는 경우
            v1 = next((s for s in var_list if s.name == 'x'), var_list[0])
            v2 = next((s for s in var_list if s.name == 'y'), var_list[1])
            f = sp.lambdify((v1, v2), expr, modules=['numpy', 'scipy'])
            is_single_complex_input = False
        else:
            v1, v2 = sp.Symbol('x'), sp.Symbol('y')
            f = sp.lambdify((v1, v2), expr, modules=['numpy', 'scipy'])
            is_single_complex_input = False
    else:
        # 일반 실수 그래프
        is_single_complex_input = False
        if len(var_list) >= 2:
            v1, v2 = var_list[0], var_list[1]
        elif len(var_list) == 1:
            v1 = var_list[0]
            v2 = sp.Symbol('y')
        else:
            v1, v2 = sp.Symbol('x'), sp.Symbol('y')
        f = sp.lambdify((v1, v2), expr, modules=['numpy', 'scipy'])

    x = np.linspace(x_range[0], x_range[1], grid_res)
    y = np.linspace(y_range[0], y_range[1], grid_res)
    X, Y = np.meshgrid(x, y)
    
    # Ensure X, Y are float arrays for numerical stability
    X = np.asarray(X, dtype=float)
    Y = np.asarray(Y, dtype=float)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if is_single_complex_input:
            W = f(X + 1j * Y)
        else:
            W = f(X, Y)
            
        if np.isscalar(W):
            W = np.full(X.shape, W)

    # 복소수 처리
    if np.iscomplexobj(W) or is_complex:
        # Ensure W is a numerical complex array for angle/abs calculation
        try:
            # Try direct conversion (fastest)
            W_num = np.asarray(W, dtype=np.complex128)
        except Exception:
            # Fallback: manually convert each element to complex (handles SymPy objects)
            def _to_complex(val):
                try:
                    if hasattr(val, 'evalf'):
                        c = val.evalf()
                        return complex(c)
                    return complex(val)
                except:
                    return np.nan + 1j*np.nan
            
            W_num = np.vectorize(_to_complex)(W)

        # Ensure we have a numerical array for calculations
        W_num = np.asarray(W_num, dtype=np.complex128)
        
        if complex_mode == "abs_phase":
            Z = np.abs(W_num)
            C_val = np.angle(W_num) / (2 * np.pi) % 1.0 # Phase for color
        elif complex_mode == "real_imag":
            Z = np.real(W_num)
            C_val = np.imag(W_num)
        elif complex_mode == "imag_real":
            Z = np.imag(W_num)
            C_val = np.real(W_num)
        else:
            Z = np.abs(W_num)
            C_val = Z
    else:
        # For real arrays, ensure conversion to float
        try:
            W_num = np.asarray(W, dtype=float)
        except Exception:
            W_num = np.vectorize(lambda x: float(x.evalf() if hasattr(x, 'evalf') else x))(W)
        Z = W_num
        C_val = Z

    # NaN/Inf 처리 및 Clipping (Visualization stability)
    # z_range를 넘어서는 너무 큰 값은 x3dom 렌더링 시 문제를 일으킬 수 있으므로 적절히 클리핑
    z_limit_up = z_range[1] + (z_range[1] - z_range[0]) * 0.5
    z_limit_down = z_range[0] - (z_range[1] - z_range[0]) * 0.5
    
    Z = np.nan_to_num(Z, nan=0.0, posinf=z_limit_up, neginf=z_limit_down)
    Z = np.clip(Z, z_limit_down, z_limit_up)
    
    # x3dom 데이터 형식
    points = []
    colors = []
    axis_style = "cross" # 기본값
    
    def get_rgb(hex_color):
        hex_color = hex_color.lstrip('#')
        if len(hex_color) == 3:
            hex_color = ''.join([c*2 for c in hex_color])
        return [int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4)]

    # 축 스타일 파싱
    for p in parallels:
        if p.startswith("axis="):
            axis_style = p.split("=")[1].lower()

    # [컬러 스키마 계산 최적화]
    # 실제 데이터의 유효 범위를 먼저 계산하고, 필요시 가시 범위로 클리핑하여 대비를 높임
    finite_c_full = C_val[np.isfinite(C_val)]
    if len(finite_c_full) > 0:
        actual_min, actual_max = np.min(finite_c_full), np.max(finite_c_full)
    else:
        actual_min, actual_max = z_range[0], z_range[1]

    if not (is_complex and complex_mode == "abs_phase"):
        c_min = max(actual_min, z_range[0])
        c_max = min(actual_max, z_range[1])
        if c_min >= c_max:
            if actual_min < actual_max:
                c_min, c_max = actual_min, actual_max
            else:
                c_min, c_max = z_range[0], z_range[1]
    else:
        c_min, c_max = actual_min, actual_max

    c_span = c_max - c_min if c_max > c_min else 1e-9

    # Default stops if none provided for schemes that need them
    if not color_stops and color_scheme in ["height", "gradient", "custom"]:
        # Blue to Red default gradient
        color_stops = [(0.0, "#0000ff"), (1.0, "#ff0000")]

    mag = None
    if color_scheme == "gradient":
        W_real = np.real(W)
        finite_w = W_real[np.isfinite(W_real)]
        if len(finite_w) > 0:
            W_safe = np.clip(W_real, z_range[0]*2, z_range[1]*2)
        else:
            W_safe = Z
        dz_dy, dz_dx = np.gradient(W_safe, y[1]-y[0], x[1]-x[0])
        mag = np.sqrt(dz_dx**2 + dz_dy**2)
        finite_mag = mag[np.isfinite(mag)]
        if len(finite_mag) > 0:
            m_min, m_max = np.min(finite_mag), np.max(finite_mag)
        else:
            m_min, m_max = 0.0, 1.0
        m_span = m_max - m_min if m_max > m_min else 1e-9

    def interpolate_color(val):
        if not color_stops: return get_rgb(custom_color)
        val = float(val)
        if np.isnan(val): val = 0.5
        val = max(0.0, min(1.0, val))
        if val <= color_stops[0][0]: return get_rgb(color_stops[0][1])
        if val >= color_stops[-1][0]: return get_rgb(color_stops[-1][1])
        for i in range(len(color_stops)-1):
            s1, s2 = color_stops[i], color_stops[i+1]
            if s1[0] <= val <= s2[0]:
                t = (val - s1[0]) / (s2[0] - s1[0]) if s2[0] != s1[0] else 0.0
                c1, c2 = get_rgb(s1[1]), get_rgb(s2[1])
                return [c1[j]*(1-t) + c2[j]*t for j in range(3)]
        return get_rgb(custom_color)

    cmap = None
    if (color_scheme == "preset" or preset_name) and preset_name:
        if preset_name == "mathematica":
            from matplotlib.colors import LinearSegmentedColormap
            math_colors = ["#0000cd", "#00ffff", "#00ff00", "#ffff00", "#ff0000"]
            cmap = LinearSegmentedColormap.from_list("mathematica", math_colors)
        else:
            try:
                from matplotlib import colormaps
                cmap = colormaps.get_cmap(preset_name)
            except:
                try:
                    import matplotlib.cm as cm
                    cmap = cm.get_cmap(preset_name)
                except:
                    pass

    for i in range(len(y)):
        for j in range(len(x)):
            points.append([float(X[i,j]), float(Y[i,j]), float(Z[i,j])])
            if color_scheme == "uniform":
                colors.append(get_rgb(custom_color))
            elif color_scheme == "gradient":
                val = mag[i,j]
                if np.isnan(val): norm = 0.5
                elif np.isposinf(val): norm = 1.0
                elif np.isneginf(val): norm = 0.0
                else: norm = (val - m_min) / m_span
                norm = max(0.0, min(1.0, norm))
                if color_stops:
                    colors.append(interpolate_color(norm))
                elif cmap:
                    colors.append([float(c) for c in cmap(norm)[:3]])
                else:
                    colors.append([float(0.1 + 0.9*norm), float(0.8 - 0.4*norm), float(0.3 + 0.2*norm)])
            else:
                val = C_val[i,j]
                if np.isnan(val): norm = 0.5
                elif np.isposinf(val): norm = 1.0
                elif np.isneginf(val): norm = 0.0
                else: norm = (val - c_min) / c_span
                norm = max(0.0, min(1.0, norm))
                if cmap:
                    colors.append([float(c) for c in cmap(norm)[:3]])
                elif color_scheme == "custom" or color_scheme == "height":
                    colors.append(interpolate_color(norm))
                else:
                    colors.append([float(norm), float(0.5 + 0.5*np.sin(norm*np.pi)), float(1.0 - norm)])

    export_content = None
    export_format = "pdf"
    for p in parallels:
        if p.startswith("export="):
            export_format = p.split("=")[1].lower()
    
    if "export" in parallels or any(p.startswith("export=") for p in parallels):
        fig = plt.figure(figsize=(8, 6))
        ax = fig.add_subplot(111, projection='3d')
        ax.set_zlim(z_range)
        if color_scheme == "uniform":
            ax.plot_surface(X, Y, Z, color=custom_color, alpha=0.8, edgecolor='none')
        elif cmap:
            ax.plot_surface(X, Y, Z, cmap=cmap, alpha=0.8, edgecolor='none')
        elif color_scheme == "gradient" or color_scheme == "custom" or color_scheme == "height":
            if color_stops:
                from matplotlib.colors import LinearSegmentedColormap
                sorted_stops = sorted(color_stops)
                c_list = [get_rgb(s[1]) for s in sorted_stops]
                temp_cmap = LinearSegmentedColormap.from_list("custom", c_list)
                ax.plot_surface(X, Y, Z, cmap=temp_cmap, alpha=0.8, edgecolor='none')
            else:
                ax.plot_surface(X, Y, Z, cmap='coolwarm', alpha=0.8, edgecolor='none')
        else:
            ax.plot_surface(X, Y, Z, cmap='coolwarm', alpha=0.8, edgecolor='none')

        ax.set_xlabel(labels['x'])
        ax.set_ylabel(labels['y'])
        ax.set_zlabel(labels['z'])
        ax.view_init(elev=30, azim=45)
        buf = BytesIO()
        plt.savefig(buf, format=export_format, bbox_inches='tight')
        plt.close()
        export_content = base64.b64encode(buf.getvalue()).decode('utf-8')

    return {
        "latex": f"${sp.latex(expr)}$",
        "x3d_data": {
            "points": points,
            "colors": colors,
            "grid_size": [len(x), len(y)],
            "expr": sp.latex(expr),
            "labels": labels,
            "ranges": {"x": x_range, "y": y_range, "z": z_range},
            "bg_color": bg_color,
            "axis_style": axis_style,
            "complex_mode": complex_mode,
            "color_scheme": color_scheme,
            "preset_name": preset_name
        },
        "export_content": export_content,
        "export_format": export_format,
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
        line_color = config.get('lineColor', 'blue')
        
        # 데이터 파일 이름 생성 (중복 방지를 위해 타임스탬프 추가)
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dat_filename = f"plot_data_{timestamp}.dat"
        
        pgf_code, warning_msg, dat_content, preview_img = generate_2d_pgfplots(expr, var, domain, parallels, dat_samples, y_limit)
        
        # PGFPlots 코드 내의 파일 경로 및 색상 수정
        pgf_code = pgf_code.replace("data/plot_data.dat", f"data/{dat_filename}")
        if line_color != "blue":
            pgf_code = pgf_code.replace("\\addplot[", f"\\addplot[{line_color}, ")

        final_latex = (
            "\\begin{tikzpicture}\n"
            f"\\begin{{axis}}[\n"
            f"    axis lines=middle,\n"
            f"    xlabel=${sp.latex(var)}$,\n"
            f"    ylabel=$f({sp.latex(var)})$,\n"
            f"    trig format plots=rad,\n"
            f"    restrict x to domain={domain[0]}:{domain[1]},\n"
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
