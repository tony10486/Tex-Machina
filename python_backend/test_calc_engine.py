import unittest
import json
import sympy as sp
import os
import sys
import re

# Add the current directory to sys.path to import calc_engine
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from calc_engine import execute_calc

class TestCalcEngine(unittest.TestCase):

    def test_basic_calc(self):
        req = {
            "mainCommand": "calc",
            "subCommands": ["factor"],
            "rawSelection": r"x^2 + 2x + 1"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        # Sympy uses \left( and \right)
        self.assertIn(r"x + 1", res["latex"])
        self.assertIn(r"^{2}", res["latex"])

    def test_solve_quadratic(self):
        req = {
            "mainCommand": "solve",
            "subCommands": ["x"],
            "rawSelection": r"x^2 - 5x + 6 = 0"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertIn("2", res["latex"])
        self.assertIn("3", res["latex"])

    def test_diff_multivariable(self):
        req = {
            "mainCommand": "diff",
            "subCommands": ["x, y"],
            "rawSelection": r"x^2 * y^3"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["latex"], r"6 x y^{2}")

    def test_ode_first_order(self):
        req = {
            "mainCommand": "ode",
            "subCommands": ["ic=y(0):1"],
            "rawSelection": r"y' = y"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertIn("e^{x}", res["latex"])

    def test_ode_system(self):
        req = {
            "mainCommand": "ode",
            "subCommands": [],
            "rawSelection": r"x' = y, y' = -x"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertIn("C_{1}", res["latex"])
        self.assertIn("C_{2}", res["latex"])

    def test_taylor_series(self):
        req = {
            "mainCommand": "taylor",
            "subCommands": ["x", "5"],
            "rawSelection": r"\sin(x)"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        latex = res["latex"].replace(" ", "")
        expected = r"x-\frac{x^{3}}{6}".replace(" ", "")
        self.assertIn(expected, latex)

    def test_matrix_det(self):
        req = {
            "mainCommand": "det",
            "subCommands": [],
            "rawSelection": r"\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["latex"], "-2")

    def test_complex_residue(self):
        req = {
            "mainCommand": "residue",
            "subCommands": ["z", "0"],
            "rawSelection": r"\frac{1}{z}"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["latex"], "1")

    def test_error_propagation(self):
        req = {
            "mainCommand": "error_prop",
            "subCommands": [],
            "parallelOptions": ["err=x:0.1,y:0.2"],
            "rawSelection": r"x*y"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        self.assertIn("0.01 y^{2}", res["latex"])
        self.assertIn("0.04 x^{2}", res["latex"])

    def test_tensor_expand(self):
        req = {
            "mainCommand": "tensor_expand",
            "subCommands": [],
            "rawSelection": r"A_i B^i"
        }
        res = json.loads(execute_calc(json.dumps(req)))
        self.assertEqual(res["status"], "success")
        # Sympy simplifies B**1 to B.
        self.assertIn("A_{1} B", res["latex"])
        self.assertIn("A_{2} B^{2}", res["latex"])
        self.assertIn("A_{3} B^{3}", res["latex"])

if __name__ == '__main__':
    unittest.main()
