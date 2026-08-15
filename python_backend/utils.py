import ast
import sympy as sp
from sympy.parsing.sympy_parser import parse_expr

# 허용할 SymPy 함수 및 상수 화이트리스트
# 상용화 수준의 보안을 위해 꼭 필요한 수학 연산만 허용합니다.
# 주의: 'S' 싱글턴은 sympify()를 통해 내부 eval에 fresh globals(실제 __builtins__ 주입)를
# 사용하므로 임의 코드 실행 탈출 벡터가 된다. 절대 화이트리스트에 포함하지 않는다.
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
    'Inverse', 'inv', 'Transpose', 'transpose', 'rank', 'nullspace', 'rref', 'eigenvals', 'eigenvects',
    'jacobian', 'hessian',
    
    # 대수적 조작
    'simplify', 'expand', 'factor', 'collect', 'cancel', 'apart', 'together', 'trigsimp', 'expand_trig',
    
    # 방정식 풀이
    'solve', 'dsolve', 'pdsolve', 'linsolve', 'nonlinsolve', 'nsolve',
    
    # 상수
    'pi', 'E', 'I', 'oo', 'nan'
]

# AST 검증 단계에서 호출을 허용하는 함수 화이트리스트.
# ALLOWED_SYMPY_FUNCTIONS와 동일하되 'S'를 제외한 집합이다.
# 이 함수들은 전부 순수 SymPy 함수/생성자이며, 속성 접근은 별도로 전면 금지되어
# 결과 객체의 메서드로는 절대 도달할 수 없다.
CALLABLE_ALLOWLIST = {
    # 구조 생성자
    'Rational', 'Integer', 'Float', 'Number', 'Symbol', 'symbols',
    'Matrix', 'Tuple', 'Dict', 'Set', 'List', 'MatrixSymbol', 'Identity',
    # 방정식
    'Eq', 'Equality', 'Unequality', 'Equivalent',
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
    'Trace', 'tr', 'Determinant', 'det', 'Inverse', 'inv', 'Transpose',
    'rank', 'nullspace', 'rref', 'eigenvals', 'eigenvects', 'jacobian', 'hessian',
    # 대수적 조작
    'simplify', 'expand', 'factor', 'collect', 'cancel', 'apart', 'together', 'trigsimp', 'expand_trig',
    # 방정식 풀이
    'solve', 'dsolve', 'pdsolve', 'linsolve', 'nonlinsolve', 'nsolve',
}

# AST 검증에서 거부할 노드 타입 (추가 방어 계층)
_FORBIDDEN_AST_TYPES = (ast.Attribute, ast.JoinedStr, ast.Lambda, ast.NamedExpr, ast.Await, ast.Yield)

def get_safe_sympy_dict():
    safe_dict = {'__builtins__': {}}
    for name in ALLOWED_SYMPY_FUNCTIONS:
        if hasattr(sp, name):
            safe_dict[name] = getattr(sp, name)
    return safe_dict

SAFE_SYMPY_DICT = get_safe_sympy_dict()

def _validate_expression_ast(expr_s):
    """
    사용자 표현식을 AST로 파싱하고 위험 요소를 검증합니다.
    - 속성 접근(ast.Attribute) 전면 금지: () .__class__ / S(...) 계열 탈출 차단
    - 허용 목록에 없는 함수 호출 금지: S(...), open(...) 등 차단
    - 리터럴(tuple/list)이 아닌 대상의 인덱싱 금지: x.__mro__[1] 등 차단
    검증 실패 시 ValueError를 raise합니다 (fail-closed).
    """
    try:
        tree = ast.parse(expr_s, mode='eval')
    except SyntaxError as e:
        raise ValueError(f"Invalid expression syntax: {expr_s}: {e}")

    for node in ast.walk(tree):
        if isinstance(node, _FORBIDDEN_AST_TYPES):
            raise ValueError(f"Forbidden AST node '{type(node).__name__}' detected in expression: {expr_s}")
        if isinstance(node, ast.Call):
            func = node.func
            if not (isinstance(func, ast.Name) and func.id in CALLABLE_ALLOWLIST):
                raise ValueError(f"Function call is not allowed in expression: {expr_s}")
        if isinstance(node, ast.Subscript):
            # 리터럴 리스트/튜플 인덱싱만 허용 (예: Matrix([...]) 내부 인덱스)
            if not isinstance(node.value, (ast.Tuple, ast.List)):
                raise ValueError(f"Subscript on non-literal is forbidden in expression: {expr_s}")

def safe_parse_expr(expr_str, local_dict=None, evaluate=False):
    """
    사용자 입력을 안전하게 파싱합니다.
    __builtins__를 차단하고, AST 검증(속성 접근/미허용 호출/비리터럴 인덱싱 금지)을
    거친 뒤 화이트리스트에 정의된 SymPy 함수만 허용합니다.
    """
    if not expr_str:
        return None
    
    expr_s = str(expr_str)
    forbidden_keywords = ['__', 'import', 'exec', 'eval']
    for kw in forbidden_keywords:
        if kw in expr_s:
            raise ValueError(f"Forbidden keyword '{kw}' detected in expression: {expr_s}")

    # ★ 핵심: eval(parse_expr 내부) 실행 전에 AST를 검증하여
    # 런타임 조합(chr(95)+... 등)으로 우회하는 페이로드도 차단한다.
    _validate_expression_ast(expr_s)

    combined_locals = {}
    if local_dict:
        combined_locals.update(local_dict)
    
    try:
        # parse_expr는 내부적으로 eval을 사용하므로 global_dict를 엄격히 제한하는 것이 중요합니다.
        # global_dict에 '__builtins__' 키가 존재해야 CPython이 실제 builtins를 주입하지 않습니다.
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
