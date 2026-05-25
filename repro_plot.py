import json
import os
from python_backend.plot_engine import handle_plot

def test_plot_3d():
    expr_latex = "x^2 + y^2"
    sub_cmds = ["3d"]
    parallels = ["samples=10"]
    config = {"datDensity": 100, "workspaceDir": os.getcwd()}
    workspace_dir = os.getcwd()
    
    result = handle_plot(expr_latex, sub_cmds, parallels, config, workspace_dir)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    test_plot_3d()
