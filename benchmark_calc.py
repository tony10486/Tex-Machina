import sys
import os
import json
import time
import statistics

# Ensure we can import the backend engine
sys.path.insert(0, os.path.abspath('python_backend'))
from calc_engine import execute_calc

def run_benchmark(name, payload, iterations=10):
    payload_str = json.dumps(payload)
    times = []
    
    # Warmup
    try:
        execute_calc(payload_str)
    except Exception as e:
        return f"{name:35} | ERROR: {str(e)}"
        
    for _ in range(iterations):
        start = time.perf_counter()
        execute_calc(payload_str)
        end = time.perf_counter()
        times.append((end - start) * 1000)  # Convert to milliseconds
        
    avg_time = statistics.mean(times)
    median_time = statistics.median(times)
    min_time = min(times)
    max_time = max(times)
    
    return f"{name:35} | Avg: {avg_time:6.2f} ms | Median: {median_time:6.2f} ms | Min: {min_time:6.2f} ms | Max: {max_time:6.2f} ms"

benchmark_cases = [
    {
        "name": "Simple Eval (1+1)",
        "payload": {"mainCommand": "eval", "rawSelection": "1+1", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Polynomial Expansion",
        "payload": {"mainCommand": "expand", "rawSelection": "(x+y+z+w)^4", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Polynomial Factorization",
        "payload": {"mainCommand": "factor", "rawSelection": "x^8 - 256", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Trigonometric Simplification",
        "payload": {"mainCommand": "trigsimp", "rawSelection": "\\frac{\\sin(3x)}{\\sin(x)} - \\frac{\\cos(3x)}{\\cos(x)}", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Calculus: Differentiation",
        "payload": {"mainCommand": "diff", "rawSelection": "e^{\\sin(x^2)} \\ln(x^2 + 1)", "subCommands": ["x"], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Calculus: Integration",
        "payload": {"mainCommand": "int", "rawSelection": "x^3 * e^{2x} * \\sin(x)", "subCommands": ["x"], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Calculus: Limit (L'Hopital)",
        "payload": {"mainCommand": "limit", "rawSelection": "\\frac{\\sin(x) - x + x^3/6}{x^5}", "subCommands": ["x, 0"], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Calculus: Taylor Series",
        "payload": {"mainCommand": "taylor", "rawSelection": "\\tan(x)", "subCommands": ["x, 0, 7"], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Linear Algebra: 4x4 Determinant",
        "payload": {"mainCommand": "det", "rawSelection": "\\begin{pmatrix} 1 & 2 & 3 & 4 \\\\ 2 & 3 & 4 & 1 \\\\ 3 & 4 & 1 & 2 \\\\ 4 & 1 & 2 & 3 \\end{pmatrix}", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Linear Algebra: 3x3 Inverse",
        "payload": {"mainCommand": "inv", "rawSelection": "\\begin{pmatrix} 2 & 1 & 1 \\\\ 1 & 3 & 2 \\\\ 1 & 0 & 0 \\end{pmatrix}", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "ODE Solving (Euler-Cauchy)",
        "payload": {"mainCommand": "ode", "rawSelection": "x^2 y'' - 3x y' + 4y = x^2 \\ln(x)", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Laplace Transform",
        "payload": {"mainCommand": "laplace", "rawSelection": "t^3 e^{-2t} \\sin(3t)", "subCommands": [], "parallelOptions": [], "config": {}}
    },
    {
        "name": "Inverse Laplace Transform",
        "payload": {"mainCommand": "ilaplace", "rawSelection": "\\frac{s+2}{(s^2+4s+13)^2}", "subCommands": [], "parallelOptions": [], "config": {}}
    }
]

print("="*95)
print(f"{'Operation Name':35} | {'Performance Metrics (10 Iterations)'}")
print("="*95)

for case in benchmark_cases:
    result = run_benchmark(case["name"], case["payload"], iterations=10)
    print(result)

print("="*95)
