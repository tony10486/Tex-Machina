import sys
import os
import json

# Add python_backend to path
sys.path.append(os.path.join(os.getcwd(), 'python_backend'))

from plot_engine import handle_plot

def run_test(name, latex_expr, sub_cmds):
    config = {
        "datDensity": 500,
        "yMultiplier": 5.0,
        "lineColor": "blue",
        "workspaceDir": os.getcwd()
    }
    print(f"\n>>> Testing {name}: {latex_expr}")
    try:
        result = handle_plot(latex_expr, sub_cmds, [], config, os.getcwd())
        if result["status"] == "success":
            addplot_count = result["latex"].count("\\addplot")
            has_dat = "table" in result["latex"]
            print(f"  Status: Success")
            print(f"  Method: {'External .dat' if has_dat else 'Native PGFPlots'}")
            print(f"  Addplot segments: {addplot_count}")
            if result.get("warning"):
                print(f"  Warning: {result['warning']}")
        else:
            print(f"  Status: Failed! Error: {result.get('message')}")
    except Exception as e:
        print(f"  Status: Exception! {str(e)}")

if __name__ == "__main__":
    # 1. Gamma (Multiple poles in negative domain)
    run_test("Gamma Function", r"\Gamma(x)", ["2d", "-4.5,2.5"])
    
    # 2. Rational Function (Multiple distinct poles)
    run_test("Rational Function", r"\frac{1}{x^2 - 1}", ["2d", "-3,3"])
    
    # 3. Tangent (Periodic singularities)
    run_test("Tangent Function", r"\tan(x)", ["2d", "-5,5"])
    
    # 4. Sinc (Removable singularity at 0)
    run_test("Sinc Function", r"\frac{\sin(x)}{x}", ["2d", "-10,10"])
    
    # 5. Zeta Function (Pole at 1)
    run_test("Zeta Function", r"\zeta(x)", ["2d", "-5,5"])
    
    # 6. Combined tricky function
    run_test("Mixed Tricky", r"\exp(x) \cdot \Gamma(x) / \sin(x)", ["2d", "-3,3"])
