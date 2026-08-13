import sympy as sp
from sympy.parsing.sympy_parser import parse_expr

# 허용할 SymPy 함수 및 상수 화이트리스트
# 상용화 수준의 보안을 위해 꼭 필요한 수학 연산만 허용합니다.
ALLOWED_SYMPY_FUNCTIONS = [
    # 기본 산술 및 구조
    'Add', 'Mul', 'Pow', 'Equality', 'Eq', 'Unequality', 'Equivalent',
    'Symbol', 'symbols', 'Matrix', 'Rational', 'Integer', 'Float', 'Number',
    'Tuple', 'Dict', 'Set', 'List',
    
    # 기초 수학 함수
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'asin', 'acos', 'atan', 'acot', 'asec', 'acsc', 'atan2',
    'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
    'asinh', 'acosh', 'atanh', 'acoth', 'asech', 'acsch',
    'exp', 'log', 'ln', 'sqrt', 'root', 'abs', 're', 'im', 'sign',
    'factorial', 'gamma', 'beta', 'zeta', 'loggamma',
    
    # 미적분 및 해석학
    'diff', 'Derivative', 'integrate', 'Integral', 'limit', 'Limit', 
    'residue', 'series', 'Order', 'O', 'fourier_transform', 'inverse_fourier_transform',
    'laplace_transform', 'inverse_laplace_transform', 'Sum', 'Product',
    
    # 선형대수
    'MatrixSymbol', 'Identity', 'Trace', 'tr', 'Determinant', 'det', 
    'Inverse', 'inv', 'Transpose', 'rank', 'nullspace', 'rref', 'eigenvals', 'eigenvects',
    'jacobian', 'hessian',
    
    # 대수적 조작
    'simplify', 'expand', 'factor', 'collect', 'cancel', 'apart', 'together', 'trigsimp', 'expand_trig',
    
    # 방정식 풀이
    'solve', 'dsolve', 'pdsolve', 'linsolve', 'nonlinsolve', 'nsolve',
    
    # 상수
    'pi', 'E', 'I', 'oo', 'nan', 'S'
]

def get_safe_sympy_dict():
    safe_dict = {'__builtins__': {}}
    for name in ALLOWED_SYMPY_FUNCTIONS:
        if hasattr(sp, name):
            safe_dict[name] = getattr(sp, name)
    return safe_dict

SAFE_SYMPY_DICT = get_safe_sympy_dict()

def safe_parse_expr(expr_str, local_dict=None, evaluate=False):
    """
    사용자 입력을 안전하게 파싱합니다.
    __builtins__를 차단하고 화이트리스트에 정의된 SymPy 함수만 허용합니다.
    """
    if not expr_str:
        return None
    
    expr_s = str(expr_str)
    forbidden_keywords = ['__', 'import', 'exec', 'eval']
    for kw in forbidden_keywords:
        if kw in expr_s:
            raise ValueError(f"Forbidden keyword '{kw}' detected in expression: {expr_s}")

    combined_locals = {}
    if local_dict:
        combined_locals.update(local_dict)
    
    try:
        # parse_expr는 내부적으로 eval을 사용하므로 global_dict를 엄격히 제한하는 것이 중요합니다.
        return parse_expr(
            expr_s, 
            global_dict=SAFE_SYMPY_DICT, 
            local_dict=combined_locals, 
            evaluate=evaluate
        )
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Safe parsing failed for expression '{expr_str}': {str(e)}")

def strip_latex_delimiters(text):
    r"""$...$, $$...$$, \[...\], \(...\) 등의 LaTeX 구분자를 제거합니다."""
    if not text:
        return ""
    text = text.strip()
    # $$...$$ or \[...\]
    if (text.startswith('$$') and text.endswith('$$')) or (text.startswith(r'\[') and text.endswith(r'\]')):
        return text[2:-2].strip()
    # $...$ or \(...\)
    if (text.startswith('$') and text.endswith('$')) or (text.startswith(r'\(') and text.endswith(r'\)')):
        return text[1:-1].strip()
    return text
