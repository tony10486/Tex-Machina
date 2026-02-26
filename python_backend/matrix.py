import json
import sympy as sp

def handle_matrix(sub_cmds, parallels):
    """
    제안서의 행렬 입력 기능(matrix)을 처리하는 함수입니다.
    예시 커맨드: matrix > b > 3x4 > 1,2,3,4/5,6,7,8/9,10,11,12 / aug=3
    """
    try:
        # 1. 기본값 설정 및 옵션 파싱
        bracket_map = {
            'p': 'pmatrix', 'b': 'bmatrix', 'v': 'vmatrix', 
            'V': 'Vmatrix', 'B': 'Bmatrix'
        }
        b_type = 'b'  # 기본 괄호: bmatrix 
        rows, cols = 3, 3 # 기본 크기: 3x3 
        content_str = ""

        # 파라미터 큐(Queue) 처리
        cmds = sub_cmds.copy()
        
        # 첫 번째 인자가 괄호 타입인지 확인
        if cmds and cmds[0] in bracket_map:
            b_type = cmds.pop(0)
            
        # 두 번째 인자가 차원(NxM)인지 확인
        size_specified = False
        if cmds and 'x' in cmds[0] and not (',' in cmds[0] or '/' in cmds[0]):
            r_str, c_str = cmds.pop(0).split('x')
            rows, cols = int(r_str), int(c_str)
            size_specified = True
            
        # 세 번째 인자는 내용 (id, diag 또는 데이터) 
        if cmds:
            content_str = cmds.pop(0)

        # 2. 파서에 의해 분리된 행 데이터 재조합 및 옵션 파싱
        actual_data_parts = []
        if content_str:
            actual_data_parts.append(content_str)
            
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
            elif p_strip.startswith('step='):
                pass
            else:
                actual_data_parts.append(p_strip)
        
        full_content = "/".join(actual_data_parts)

        # 3. 행렬 데이터 구조화
        matrix_data = []
        if full_content == 'id':
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
            # 데이터가 없고 fill_dots가 활성화된 경우 템플릿 생성
            if fill_dots and rows >= 2 and cols >= 2:
                matrix_data = [[""] * cols for _ in range(rows)]
                matrix_data[0][0] = "a_{11}"
                matrix_data[0][cols-1] = f"a_{{1{cols}}}"
                matrix_data[rows-1][0] = f"a_{{{rows}1}}"
                matrix_data[rows-1][cols-1] = f"a_{{{rows}{cols}}}"
            else:
                matrix_data = [[""] * cols for _ in range(rows)]

        # 4. 스마트 생략 기호 인식 (...) 
        def is_real_val(v):
            # 생략 기호나 빈 칸이 아닌 것을 실제 값으로 간주
            dots = [r'.', r'..', r'...', r'\vdots', r'\cdots', r'\ddots']
            return v.strip() and v not in dots

        for i in range(rows):
            for j in range(cols):
                val = matrix_data[i][j]
                if val in ['.', '..', '...', '']:
                    # 빈 공간인데 fill_dots가 꺼져있으면 0으로 채우고 스킵
                    if val == '' and not fill_dots:
                        matrix_data[i][j] = "0"
                        continue
                    
                    # 주변에 실제 원소가 있는지 확인 (상하좌우 방향 탐색)
                    has_up = any(is_real_val(matrix_data[k][j]) for k in range(i))
                    has_down = any(is_real_val(matrix_data[k][j]) for k in range(i+1, rows))
                    has_left = any(is_real_val(matrix_data[i][k]) for k in range(j))
                    has_right = any(is_real_val(matrix_data[i][k]) for k in range(j+1, cols))
                    
                    if has_up and has_down:
                        matrix_data[i][j] = r"\vdots"
                    elif has_left and has_right:
                        matrix_data[i][j] = r"\cdots"
                    elif (has_up or has_left) and (has_down or has_right):
                        # 대각선 흐름 (위 또는 왼쪽이 있고, 아래 또는 오른쪽이 있는 경우)
                        matrix_data[i][j] = r"\ddots"
                    else:
                        # 끝 부분 처리 (주변에 하나만 있거나 아예 없는 경우)
                        if fill_dots:
                            # 5x5 등에서 구석만 채워진 경우 가운데를 채우기 위한 기본값
                            if (i > 0 and i < rows - 1) and (j > 0 and j < cols - 1):
                                matrix_data[i][j] = r"\ddots"
                            else:
                                matrix_data[i][j] = "0"
                        else:
                            matrix_data[i][j] = "0"

        # 5. LaTeX 코드 조립
        env = bracket_map.get(b_type, 'bmatrix')
        
        # 첨가 행렬의 경우 amsmath의 특성상 array 환경을 괄호로 감싸서 구현 
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

        # 6. 행렬 분석 (옵션) [cite: 68, 71]
        analysis_data = None
        if analyze_mode:
            try:
                # 심볼릭 처리를 위해 SymPy Matrix로 변환 시도
                sp_mat = sp.Matrix(matrix_data)
                analysis_data = {}
                if sp_mat.is_square:
                    analysis_data['det'] = sp.latex(sp_mat.det())
                    try: analysis_data['inv'] = sp.latex(sp_mat.inv())
                    except: analysis_data['inv'] = "\\text{Not invertible}"
                analysis_data['rref'] = sp.latex(sp_mat.rref()[0])
            except Exception:
                analysis_data = {"error": "생략 기호나 변수가 포함되어 분석할 수 없습니다."}

        return json.dumps({
            "status": "success",
            "latex": latex_str,
            "analysis": analysis_data
        })

    except Exception as e:
        return json.dumps({"status": "error", "message": f"Matrix parsing error: {str(e)}"})