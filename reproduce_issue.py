import sympy as sp
import numpy as np
import warnings
from python_backend.plot_engine import detect_singularities, generate_2d_pgfplots, is_pgfplots_compatible

def test_singularity(expr_str, domain=(-5, 5)):
    x = sp.Symbol('x')
    expr = sp.sympify(expr_str)
    print(f"\n--- Testing: {expr_str} over {domain} ---")
    
    print(f"Is compatible? {is_pgfplots_compatible(expr)}")
    
    try:
        sings = detect_singularities(expr, x, domain)
        print(f"Detected singularities: {sings}")
    except Exception as e:
        print(f"Error in detect_singularities: {e}")
        return

    # generate_2d_pgfplots call
    parallels = []
    config = {'datDensity': 100}
    
    try:
        latex_code, warning, dat_content, _ = generate_2d_pgfplots(expr, x, domain, parallels, dat_samples=100)
        print(f"Warning: {warning}")
        print("Generated LaTeX code fragments:")
        for line in latex_code.split('\n'):
            if '\\addplot' in line:
                print(f"  {line.strip()}")
    except Exception as e:
        print(f"Error in generate_2d_pgfplots: {e}")

if __name__ == "__main__":
    # Test cases
    test_singularity("1/x")
    test_singularity("tan(x)", domain=(-2, 2)) # Smaller domain to avoid timeout if it's slow
    test_singularity("1/(x**2 - 1)")
    test_singularity("cot(x)", domain=(-5, 5))
