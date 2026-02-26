import sympy as sp
import re
from typing import Dict, Any, List, Tuple
from .sym_engine import _safe_latex_parse  # Vol 1에서 만든 안전한 LaTeX 파서 연동

# ---------------------------------------------------------------------------
# [1] 기저 벡터 매핑 행렬 생성기 (Basis Vector Mapping)
# ---------------------------------------------------------------------------
def generate_mapping_matrix(mapping_str: str) -> sp.Matrix:
    """
    입력예시: "(1, 0) to (2, 1), (0, 1) to (-1, 3)" 또는 "(1,0)->(2,1)"
    수학적 원리: A * V = W  =>  A = W * V^-1
    """
    # 정규식으로 (before) to (after) 패턴 추출
    pattern = r"\(([^)]+)\)\s*(?:->|to)\s*\(([^)]+)\)"
    matches = re.findall(pattern, mapping_str)
    
    if not matches:
        raise ValueError("매핑 형식이 잘못되었습니다. 예: (1,0) to (2,1)")
        
    V_cols = []
    W_cols =[]
    
    for before_str, after_str in matches:
        # 쉼표 단위로 쪼개서 SymPy 수식으로 파싱
        v_elements = [_safe_latex_parse(e.strip()) for e in before_str.split(',')]
        w_elements =[_safe_latex_parse(e.strip()) for e in after_str.split(',')]
        
        if len(v_elements) != len(w_elements):
            raise ValueError(f"입력/출력 차원이 다릅니다: {before_str} -> {after_str}")
            
        V_cols.append(v_elements)
        W_cols.append(w_elements)
        
    dimension = len(V_cols[0])
    if len(V_cols) != dimension:
        raise ValueError(f"{dimension}차원 공간의 변환을 위해서는 정확히 {dimension}개의 기저 벡터 매핑이 필요합니다. (현재 {len(V_cols)}개 입력됨)")
        
    # SymPy 행렬 객체 생성 (열 벡터들을 이어붙임)
    V_matrix = sp.Matrix(V_cols).T
    W_matrix = sp.Matrix(W_cols).T
    
    try:
        # A = W * V^-1 계산
        A_matrix = W_matrix * V_matrix.inv()
        return sp.simplify(A_matrix)
    except sp.NonInvertibleMatrixError:
        raise ValueError("입력한 입력(Before) 벡터들이 일차독립(Linearly Independent)이 아니어서 역행렬을 구할 수 없습니다.")

# ---------------------------------------------------------------------------
# [2] 회전 변환 행렬 생성기 (Rotation Matrices)
# ---------------------------------------------------------------------------
def generate_rotation_matrix(axis: str, angle_latex: str) -> sp.Matrix:
    """단일 축(x, y, z) 기준 2D/3D 회전 변환 행렬"""
    theta = _safe_latex_parse(angle_latex)
    
    if axis == '2d':
        return sp.Matrix([[sp.cos(theta), -sp.sin(theta)],[sp.sin(theta),  sp.cos(theta)]
        ])
    elif axis == 'x':
        return sp.Matrix([[1, 0, 0],[0, sp.cos(theta), -sp.sin(theta)],
            [0, sp.sin(theta),  sp.cos(theta)]
        ])
    elif axis == 'y':
        return sp.Matrix([[sp.cos(theta), 0, sp.sin(theta)],
            [0, 1, 0],[-sp.sin(theta), 0, sp.cos(theta)]
        ])
    elif axis == 'z':
        return sp.Matrix([[sp.cos(theta), -sp.sin(theta), 0],
            [sp.sin(theta),  sp.cos(theta), 0],[0, 0, 1]
        ])
    else:
        raise ValueError("알 수 없는 회전 축입니다. (x, y, z, 2d 중 선택)")

def generate_euler_rotation(angles_latex: str) -> sp.Matrix:
    """3D 오일러 각 회전 (X -> Y -> Z 순서 행렬 곱)"""
    parts =[p.strip() for p in angles_latex.split(',')]
    if len(parts) != 3:
        raise ValueError("3차원 회전을 위해 x, y, z 축에 대한 3개의 각도가 필요합니다. (예: pi/4, 0, theta)")
        
    rx = generate_rotation_matrix('x', parts[0])
    ry = generate_rotation_matrix('y', parts[1])
    rz = generate_rotation_matrix('z', parts[2])
    
    # 합성 회전 행렬 R = Rz * Ry * Rx
    combined = rz * ry * rx
    return sp.simplify(combined)

# ---------------------------------------------------------------------------
# [3] 메인 라우터 (Entry Point)
# ---------------------------------------------------------------------------
def handle_transform(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    명령어 예시:
    - matrix > transform > map > (1,0) to (2,1), (0,1) to (-1,3)
    - matrix > transform > rotx > \theta
    - matrix > transform > rotxyz > \alpha, \beta, \gamma
    """
    sub_commands = params.get("subCommands",[])
    if len(sub_commands) < 2:
        raise ValueError("변환 타입과 인자를 지정해주세요. (예: map > (1,0) to (0,1))")
        
    trans_type = sub_commands[0].strip().lower() # 'map', 'rotx', 'rotxyz' 등
    trans_args = sub_commands[1].strip()         # 매핑 문자열이나 각도 문자열
    
    matrix_style = "pmatrix" # 기본 행렬 스타일 (소괄호)
    result_matrix = None
    
    try:
        # 1. 분기 처리 및 행렬 도출
        if trans_type == 'map':
            result_matrix = generate_mapping_matrix(trans_args)
        elif trans_type in ['rotx', 'roty', 'rotz', 'rot2d']:
            axis = trans_type.replace('rot', '')
            result_matrix = generate_rotation_matrix(axis, trans_args)
        elif trans_type == 'rotxyz':
            result_matrix = generate_euler_rotation(trans_args)
        else:
            raise ValueError(f"지원하지 않는 변환 타입입니다: {trans_type}")
            
        # 2. LaTeX 렌더링 (예: \begin{pmatrix} ... \end{pmatrix})
        # sympy.latex(result_matrix, mat_str="pmatrix") 가 지원되지 않을 수 있으므로
        # 수동으로 행렬 환경을 감싸줌
        raw_latex = sp.latex(result_matrix)
        # 기본값인 \left[\begin{matrix} 를 \begin{pmatrix} 로 정제
        refined_latex = raw_latex.replace(r"\left[\begin{matrix}", f"\\begin{{{matrix_style}}}")
        refined_latex = refined_latex.replace(r"\end{matrix}\right]", f"\\end{{{matrix_style}}}")
        
        return {
            "latex": refined_latex,
            "html_preview": f"<div style='color: #4CAF50;'>✅ 변환 행렬 생성 완료</div><br/><pre>${refined_latex}$</pre>"
        }
        
    except Exception as e:
        return {
            "error": {
                "code": 400,
                "message": "Linear Transform Error",
                "details": str(e)
            }
        }