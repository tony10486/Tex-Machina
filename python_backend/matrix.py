import json
import sympy as sp
import re

def handle_matrix(sub_cmds, parallels, config=None):
    """
    제안서의 행렬 입력 기능(matrix)을 처리하는 함수입니다.
    """
    try:
        if config is None: config = {}
        global_unit = config.get('angleUnit', 'deg')

        bracket_map = {
            'p': 'pmatrix', 'b': 'bmatrix', 'v': 'vmatrix', 
            'V': 'Vmatrix', 'B': 'Bmatrix'
        }
        b_type = 'b'
        rows, cols = 3, 3
        
        cmds = sub_cmds.copy()
        if cmds and cmds[0] in bracket_map:
            b_type = cmds.pop(0)
            
        size_specified = False
        if cmds and re.match(r'^\d+x\d+$', cmds[0]):
            r_str, c_str = cmds.pop(0).split('x')
            rows, cols = int(r_str), int(c_str)
            size_specified = True
            
        actual_data_parts = []
        while cmds:
            actual_data_parts.append(cmds.pop(0))

        aug_col = None
        analyze_mode = False
        fill_dots = False
        
        for p in parallels:
            p_strip = p.strip()
            if p_strip.startswith('aug='):
                aug_col = int(p_strip.split('=')[1])
            elif p_strip == 'analyze':
                analyze_mode = True
            elif p_strip == 'fill_dots':
                fill_dots = True
            else:
                actual_data_parts.append(p_strip)
        
        full_content = "/".join(actual_data_parts)
        matrix_data = []

        is_special = any(p.startswith('rot') or p.startswith('transform') for p in actual_data_parts)
        
        if is_special:
            try:
                def parse_expr(expr_str):
                    if not expr_str: return sp.Symbol('theta')
                    
                    orig_str = expr_str
                    unit_override = None
                    clean_str = expr_str.strip().lower()
                    if clean_str.endswith('deg'):
                        unit_override = 'deg'
                        expr_str = expr_str[:-3].strip()
                    elif clean_str.endswith('rad'):
                        unit_override = 'rad'
                        expr_str = expr_str[:-3].strip()

                    # 그리스 문자 전처리
                    s_expr_str = expr_str.replace(r'\pi', 'pi')
                    s_expr_str = s_expr_str.replace(r'\theta', 'theta').replace(r'\phi', 'phi')
                    s_expr_str = s_expr_str.replace(r'\alpha', 'alpha').replace(r'\beta', 'beta').replace(r'\gamma', 'gamma')
                    s_expr_str = s_expr_str.replace('\\', '').replace('{', '').replace('}', '').strip()
                    
                    # 핵심: SymPy 내장 함수(beta, gamma 등)와 충돌을 피하기 위해 locals 강제 지정
                    custom_locals = {
                        'alpha': sp.Symbol('alpha'),
                        'beta': sp.Symbol('beta'),
                        'gamma': sp.Symbol('gamma'),
                        'theta': sp.Symbol('theta'),
                        'phi': sp.Symbol('phi'),
                        'pi': sp.pi
                    }
                    
                    from sympy.parsing.latex import parse_latex
                    try:
                        if re.match(r'^[a-zA-Z0-9\s\+\-\*\/\(\)\.]+$', s_expr_str):
                            expr = sp.sympify(s_expr_str, locals=custom_locals)
                        else:
                            expr = parse_latex(expr_str)
                    except:
                        try:
                            expr = parse_latex(expr_str)
                        except:
                            expr = sp.Symbol(s_expr_str)

                    # 각도 단위 변환 (순수 숫자인 경우에만)
                    if hasattr(expr, 'is_number') and expr.is_number:
                        if any(s in orig_str for s in ['pi', r'\pi']) and unit_override != 'deg':
                            return expr
                        
                        current_unit = unit_override if unit_override else global_unit
                        if current_unit == 'deg':
                            try:
                                return expr * sp.pi / 180
                            except:
                                return expr
                            
                    return expr

                sp_mat = None
                
                # 1) Mapping Matrix
                if len(actual_data_parts) >= 3 and actual_data_parts[1] == 'map':
                    mapping_str = actual_data_parts[2]
                    pattern = r"\(([^)]+)\)\s*(?:->|to)\s*\(([^)]+)\)"
                    matches = re.findall(pattern, mapping_str)
                    if not matches:
                        raise ValueError("매핑 형식이 잘못되었습니다.")
                    V_cols, W_cols = [], []
                    for before_str, after_str in matches:
                        v_elements = [parse_expr(e.strip()) for e in before_str.split(',')]
                        w_elements = [parse_expr(e.strip()) for e in after_str.split(',')]
                        V_cols.append(v_elements)
                        W_cols.append(w_elements)
                    V_matrix = sp.Matrix(V_cols).T
                    W_matrix = sp.Matrix(W_cols).T
                    sp_mat = W_matrix * V_matrix.inv()
                
                # 2) Single Axis Rotation
                elif len(actual_data_parts) >= 3 and actual_data_parts[1] in ['rotx', 'roty', 'rotz', 'rot2d']:
                    axis = actual_data_parts[1].replace('rot', '')
                    angle = parse_expr(actual_data_parts[2])
                    if axis == '2d':
                        sp_mat = sp.Matrix([[sp.cos(angle), -sp.sin(angle)], [sp.sin(angle), sp.cos(angle)]])
                    elif axis == 'x':
                        sp_mat = sp.Matrix([[1, 0, 0], [0, sp.cos(angle), -sp.sin(angle)], [0, sp.sin(angle), sp.cos(angle)]])
                    elif axis == 'y':
                        sp_mat = sp.Matrix([[sp.cos(angle), 0, sp.sin(angle)], [0, 1, 0], [-sp.sin(angle), 0, sp.cos(angle)]])
                    elif axis == 'z':
                        sp_mat = sp.Matrix([[sp.cos(angle), -sp.sin(angle), 0], [sp.sin(angle), sp.cos(angle), 0], [0, 0, 1]])

                # 3) Euler Rotation
                elif len(actual_data_parts) >= 3 and actual_data_parts[1] == 'rotxyz':
                    angle_parts = [p.strip() for p in actual_data_parts[2].split(',')]
                    if len(angle_parts) != 3:
                        raise ValueError("3개의 각도가 필요합니다.")
                    ax, ay, az = [parse_expr(a) for a in angle_parts]
                    rx = sp.Matrix([[1, 0, 0], [0, sp.cos(ax), -sp.sin(ax)], [0, sp.sin(ax), sp.cos(ax)]])
                    ry = sp.Matrix([[sp.cos(ay), 0, sp.sin(ay)], [0, 1, 0], [-sp.sin(ay), 0, sp.cos(ay)]])
                    rz = sp.Matrix([[sp.cos(az), -sp.sin(az), 0], [sp.sin(az), sp.cos(az), 0], [0, 0, 1]])
                    # 행렬 곱셈 수행
                    sp_mat = rz * ry * rx

                # 4) Older rot3 format
                elif any(p.startswith('rot3') for p in actual_data_parts):
                    target_part = next(p for p in actual_data_parts if p.startswith('rot3'))
                    params_str = target_part.replace('rot3', '').strip(' >/')
                    if not params_str and len(actual_data_parts) > actual_data_parts.index(target_part) + 1:
                        params_str = actual_data_parts[actual_data_parts.index(target_part) + 1]
                    params = params_str.split(',')
                    axis = params[0].strip() if params and params[0].strip() else 'z'
                    angle_str = params[1].strip() if len(params) > 1 else 'theta'
                    angle = parse_expr(angle_str)
                    if axis == 'x':
                        sp_mat = sp.Matrix([[1, 0, 0], [0, sp.cos(angle), -sp.sin(angle)], [0, sp.sin(angle), sp.cos(angle)]])
                    elif axis == 'y':
                        sp_mat = sp.Matrix([[sp.cos(angle), 0, sp.sin(angle)], [0, 1, 0], [-sp.sin(angle), 0, sp.cos(angle)]])
                    else: # z
                        sp_mat = sp.Matrix([[sp.cos(angle), -sp.sin(angle), 0], [sp.sin(angle), sp.cos(angle), 0], [0, 0, 1]])

                # 5) Default fallback
                else:
                    angle_str = ""
                    for p in actual_data_parts:
                        if p in ['transform', 'rot']: continue
                        if p.startswith('transform'): 
                            angle_str = p.replace('transform', '').strip(' >/')
                            if angle_str: break
                        if p.startswith('rot'):
                            angle_str = p.replace('rot', '').strip(' >/')
                            if angle_str: break
                        angle_str = p
                        break
                    angle = parse_expr(angle_str)
                    sp_mat = sp.Matrix([[sp.cos(angle), -sp.sin(angle)], [sp.sin(angle), sp.cos(angle)]])

                if sp_mat is not None:
                    # 심볼릭 계산 결과에 대해 과도한 simplify를 피해 안정성 확보
                    rows, cols = sp_mat.shape
                    for i in range(rows):
                        row_data = []
                        for j in range(cols):
                            val = sp_mat[i, j]
                            # 수치값(sin(pi/2) 등)만 정리하고 심볼릭은 최대한 유지
                            if not val.free_symbols:
                                try: val = sp.simplify(val)
                                except: pass
                            row_data.append(sp.latex(val))
                        matrix_data.append(row_data)
                else:
                    raise ValueError("변환 행렬 생성 실패")

            except Exception as e:
                return json.dumps({"status": "error", "message": f"Transformation error: {str(e)}"})
        
        # 2.6 일반 행렬 데이터 파싱
        elif full_content == 'id':
            for i in range(rows):
                matrix_data.append(["1" if i == j else "0" for j in range(cols)])
        elif full_content:
            row_sep = ';' if ';' in full_content else '/'
            raw_rows = full_content.split(row_sep)
            
            parsed_data = []
            for r in raw_rows:
                col_sep = ',' if ',' in r else None
                if col_sep:
                    parsed_data.append([c.strip() for c in r.split(col_sep)])
                else:
                    parsed_data.append(r.split())

            if not size_specified:
                rows = len(parsed_data)
                cols = max(len(r) for r in parsed_data) if parsed_data else 1

            for i in range(rows):
                row_data = []
                if i < len(parsed_data):
                    current_row = parsed_data[i]
                    for j in range(cols):
                        val = current_row[j] if j < len(current_row) else ""
                        row_data.append(val)
                else:
                    row_data = [""] * cols
                matrix_data.append(row_data)
        else:
            if fill_dots and rows >= 2 and cols >= 2:
                matrix_data = [[""] * cols for _ in range(rows)]
                matrix_data[0][0] = "a_{11}"
                matrix_data[0][cols-1] = f"a_{{1{cols}}}"
                matrix_data[rows-1][0] = f"a_{{{rows}1}}"
                matrix_data[rows-1][cols-1] = f"a_{{{rows}{cols}}}"
            else:
                matrix_data = [[""] * cols for _ in range(rows)]

        # 4. 스마트 생략 기호 및 빈 공간 처리
        if not is_special:
            def is_real_val(v):
                dots = [r'.', r'..', r'...', r'\vdots', r'\cdots', r'\ddots']
                return v.strip() and v not in dots

            for i in range(rows):
                for j in range(cols):
                    val = matrix_data[i][j]
                    if val in ['.', '..', '...', '']:
                        if val == '' and not fill_dots:
                            matrix_data[i][j] = "0"
                            continue
                        
                        # [Bug Fix] 사용자 요청: 맨 위/아래 줄은 \cdots, 양 옆 줄은 \vdots 우선 적용
                        if fill_dots:
                            if i == 0 or i == rows - 1:
                                matrix_data[i][j] = r"\cdots"
                                continue
                            if j == 0 or j == cols - 1:
                                matrix_data[i][j] = r"\vdots"
                                continue

                        has_up = any(is_real_val(matrix_data[k][j]) for k in range(i))
                        has_down = any(is_real_val(matrix_data[k][j]) for k in range(i+1, rows))
                        has_left = any(is_real_val(matrix_data[i][k]) for k in range(j))
                        has_right = any(is_real_val(matrix_data[i][k]) for k in range(j+1, cols))
                        
                        if has_up and has_down:
                            matrix_data[i][j] = r"\vdots"
                        elif has_left and has_right:
                            matrix_data[i][j] = r"\cdots"
                        elif (has_up or has_left) and (has_down or has_right):
                            matrix_data[i][j] = r"\ddots"
                        else:
                            matrix_data[i][j] = r"\ddots" if fill_dots and (0 < i < rows-1 or 0 < j < cols-1) else "0"

        # 5. LaTeX 코드 조립
        env = bracket_map.get(b_type, 'bmatrix')
        
        if aug_col is not None and 0 < aug_col < cols:
            col_format = "c" * aug_col + "|" + "c" * (cols - aug_col)
            left_b = {'pmatrix': '(', 'bmatrix': '[', 'vmatrix': '|', 'Vmatrix': '\\|', 'Bmatrix': '\\{'}.get(env, '[')
            right_b = {'pmatrix': ')', 'bmatrix': ']', 'vmatrix': '|', 'Vmatrix': '\\|', 'Bmatrix': '\\}'}.get(env, ']')
            
            latex_str = f"\\left{left_b} \\begin{{array}}{{{col_format}}}\n"
            for r in matrix_data:
                latex_str += " & ".join(r) + " \\\\\n"
            latex_str += f"\\end{{array}} \\right{right_b}"
        else:
            latex_str = f"\\begin{{{env}}}\n"
            for r in matrix_data:
                latex_str += " & ".join(r) + " \\\\\n"
            latex_str += f"\\end{{{env}}}"

        # 6. 행렬 분석
        analysis_data = None
        if analyze_mode:
            try:
                sp_mat_anal = sp.Matrix(matrix_data)
                analysis_data = {}
                if sp_mat_anal.is_square:
                    analysis_data['det'] = sp.latex(sp_mat_anal.det())
                    try: analysis_data['inv'] = sp.latex(sp_mat_anal.inv())
                    except: analysis_data['inv'] = "\\text{Not invertible}"
                analysis_data['rref'] = sp.latex(sp_mat_anal.rref()[0])
            except:
                analysis_data = {"error": "분석 실패"}

        return json.dumps({
            "status": "success",
            "latex": latex_str,
            "analysis": analysis_data
        })

    except Exception as e:
        return json.dumps({"status": "error", "message": f"Matrix parsing error: {str(e)}"})
