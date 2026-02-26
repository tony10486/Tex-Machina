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

        # 2. 첨가 행렬(Augmented Matrix) 옵션 파싱 [cite: 65]
        aug_col = None
        analyze_mode = False
        for p in parallels:
            if p.startswith('aug='):
                aug_col = int(p.split('=')[1])
            if p == 'analyze':
                analyze_mode = True # 행렬 분석 옵션 켜기 [cite: 68, 71]

        # 3. 행렬 데이터 구조화
        matrix_data = []
        if content_str == 'id':
            # 단위 행렬 자동 생성 
            for i in range(rows):
                matrix_data.append(["1" if i == j else "0" for j in range(cols)])
        elif content_str:
            # 데이터 파싱 로직 개선 (행 구분: / 또는 ;  열 구분: , 또는 공백)
            row_sep = ';' if ';' in content_str else '/'
            raw_rows = content_str.split(row_sep)
            
            parsed_data = []
            for r in raw_rows:
                col_sep = ',' if ',' in r else None # 공백 분할은 split()으로 처리
                if col_sep:
                    parsed_data.append([c.strip() for c in r.split(col_sep)])
                else:
                    parsed_data.append(r.split())

            # 크기가 명시되지 않았다면 데이터로부터 추론
            if not size_specified:
                rows = len(parsed_data)
                cols = max(len(r) for r in parsed_data) if parsed_data else 1
                if rows == 1 and len(parsed_data[0]) == 1 and not (row_sep in content_str or ',' in content_str or ' ' in content_str.strip()):
                    # 만약 구분자 없이 숫자 하나만 왔다면 (예: matrix > 5)
                    # 사용자 의도에 따라 1x1로 볼지 3x3의 첫 원소로 볼지 결정. 
                    # 여기서는 1x1로 추론함.
                    pass 

            for i in range(rows):
                row_data = []
                if i < len(parsed_data):
                    current_row = parsed_data[i]
                    for j in range(cols):
                        val = current_row[j] if j < len(current_row) else "0"
                        row_data.append(val)
                else:
                    row_data = ["0"] * cols
                matrix_data.append(row_data)
        else:
            # 데이터가 없는 경우 기본 크기로 0 채움
            matrix_data = [["0"] * cols for _ in range(rows)]

        # 4. 스마트 생략 기호 인식 (...) 
        # 주변 패턴과 인덱스를 파악하여 \cdots, \vdots, \ddots로 자동 치환합니다.
        for i in range(rows):
            for j in range(cols):
                val = matrix_data[i][j]
                if val in ['.', '..', '...']:
                    if i == j: 
                        # 주대각선 상에 있으면 ddots
                        matrix_data[i][j] = r"\ddots"
                    elif i == rows - 1 or (i > 0 and matrix_data[i-1][j] in [r"\vdots", r"\ddots"]): 
                        # 마지막 행이거나, 위쪽이 수직/대각 생략이면 vdots
                        matrix_data[i][j] = r"\vdots"
                    else:
                        # 기본적으로 행 방향은 cdots
                        matrix_data[i][j] = r"\cdots"

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