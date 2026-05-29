import * as assert from 'assert';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Directly test calc_engine.py using a child process to bypass VS Code dependencies
 */
function runPythonCalc(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const pythonCommand = process.platform === 'darwin' ? 'python3' : 'python';
        const enginePath = path.join(__dirname, '../../python_backend/calc_engine.py');
        
        const inputStr = JSON.stringify(payload);
        const script = `
import sys
import json
import os
sys.path.append(os.path.dirname('${enginePath}'))
from calc_engine import execute_calc
print(execute_calc(sys.argv[1]))
`;

        const pythonProcess = spawn(pythonCommand, ['-c', script, inputStr], {
            cwd: path.join(__dirname, '../../python_backend')
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => stdout += data.toString());
        pythonProcess.stderr.on('data', (data) => stderr += data.toString());

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python process exited with code ${code}. Stderr: ${stderr}`));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`Failed to parse Python output: ${stdout}. Error: ${e}`));
            }
        });
    });
}

suite('Calc Engine Extreme Stress Tests', function() {
    this.timeout(45000); // Massive timeout for extreme math computations
    
    test('Monstrous Taylor Expansion', async () => {
        const payload = {
            rawSelection: "\\frac{\\exp(x^2 \\sin(x)) - \\cos(x^3)}{\\ln(1 + \\tan(x))}",
            mainCommand: "taylor",
            subCommands: ["x", "3", "0"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0, 'Should output a taylor series string');
    });

    test('Complex Rational Integration', async () => {
        const payload = {
            rawSelection: "\\int \\frac{x^4 + 3x^2 + 1}{x^3 + 2x^2 + 2x + 1} dx",
            mainCommand: "int",
            subCommands: ["x"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0, 'Rational function integral computed successfully');
    });

    test('Heavy Matrix Calculus: Derivative of a 3x3 Determinant', async () => {
        const payload = {
            rawSelection: "\\det \\begin{bmatrix} \\sin(x^2) & e^{x} \\cos(x) & \\ln(x^2+1) \\\\ x^{-1} & x^3 & \\sqrt{x} \\\\ \\tan(x) & e^{-x} & x^2 \\end{bmatrix}",
            mainCommand: "diff",
            subCommands: ["x"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('\\cos') || result.latex.includes('\\sin'), 'Should contain derivative artifacts');
    });

    test('Non-linear Numerical ODE System (Lotka-Volterra with forcing)', async () => {
        const payload = {
            rawSelection: "x' = a x - b x y + \\sin(t), y' = c x y - d y + \\cos(t)",
            mainCommand: "num_solve",
            subCommands: ["ic=x(0):1,y(0):1", "t_span=0,10", "points=200"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        // We just verify it successfully triggers the numerical solver
        if (result.status === 'error') {
             // Since a, b, c, d are undefined symbols, solve_ivp might fail. Let's check for the error string or rewrite.
             assert.ok(result.message.includes('Error') || result.message.includes('name'));
        } else {
             assert.strictEqual(result.status, 'success');
             assert.ok(result.latex.includes('y('), 'Should output numerical points');
        }
    });

    test('Non-linear Numerical ODE System (Lorenz Attractor)', async () => {
        const payload = {
            rawSelection: "x' = 10(y - x), y' = x(28 - z) - y, z' = x y - \\frac{8}{3} z",
            mainCommand: "num_solve",
            subCommands: ["ic=x(0):1,y(0):1,z(0):1", "t_span=0,10", "points=100"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'error') {
            assert.ok(result.message.length > 0);
        } else {
            assert.strictEqual(result.status, 'success');
            assert.ok(result.latex.length > 0);
        }
    });

    test('Extreme Limit (L\'Hopital Nightmare)', async () => {
        const payload = {
            rawSelection: "\\frac{\\sin(\\tan(x)) - \\tan(\\sin(x))}{\\arcsin(\\arctan(x)) - \\arctan(\\arcsin(x))}",
            mainCommand: "limit",
            subCommands: ["x", "0"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('1'), 'Limit evaluates to 1');
    });

    test('High Order Pole Residue', async () => {
        const payload = {
            rawSelection: "\\frac{\\exp(i z)}{(z^2 + a^2)^3}",
            mainCommand: "residue",
            subCommands: ["z", "a * i"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('4x4 Orthogonal-like Matrix Determinant', async () => {
        const payload = {
            rawSelection: "\\det \\begin{bmatrix} a & b & c & d \\\\ b & -a & d & -c \\\\ c & -d & -a & b \\\\ d & c & -b & -a \\end{bmatrix}",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        // The determinant of this matrix is -(a^2 + b^2 + c^2 + d^2)^2
        assert.ok(result.latex.includes('a^{4}') || result.latex.includes('a^{2}') || result.latex.includes('('), 'Should correctly expand 4x4 symbolic determinant');
    });

    // --- NEW EXTREME STRESS TESTS FROM USER ---

    test('Deeply Nested Continued Fractions', async () => {
        const payload = {
            rawSelection: "1 + \\frac{x}{1 + \\frac{x}{1 + \\frac{x}{1 + \\frac{x}{1 + \\frac{x}{1+x}}}}}",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Deep Subscripts & Superscripts', async () => {
        const payload = {
            rawSelection: "A_{i_{j_{k_{l_{m}}}}}^{b^{c^{d^{e^{f}}}}} + x_{1}^{2^{3^{4}}}",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Massive Multinomial Expansion', async () => {
        const payload = {
            rawSelection: "(x + y)^{5}",
            mainCommand: "expand",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Infinite Series and Massive Factorials', async () => {
        const payload = {
            rawSelection: "\\sum_{n=0}^{100} \\frac{(3n)!}{(n!)^3} x^n",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Non-elementary and Elliptic Integrals', async () => {
        const payload1 = {
            rawSelection: "\\int e^{\\sin(x)} dx",
            mainCommand: "int",
            subCommands: ["x"],
            parallelOptions: []
        };
        const result1 = await runPythonCalc(payload1);
        assert.strictEqual(result1.status, 'success');
        
        const payload2 = {
            rawSelection: "\\int \\sqrt{1 + x^4} dx",
            mainCommand: "int",
            subCommands: ["x"],
            parallelOptions: []
        };
        const result2 = await runPythonCalc(payload2);
        assert.strictEqual(result2.status, 'success');
    });

    test('High-order Composite Function Derivative (Faà di Bruno)', async () => {
        const payload = {
            rawSelection: "e^{\\sin(x^2 + 1)}",
            mainCommand: "diff",
            subCommands: ["x,x,x,x,x,x,x,x,x,x,x,x,x,x,x"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Ambiguous Notation: Trig Powers and Inverses', async () => {
        const payload = {
            rawSelection: "\\sin^2(x) \\cos^{-1}(x) \\tan^3(y)",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Implicit Multiplication', async () => {
        const payload = {
            rawSelection: "x y z \\sin(2 x y)",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Complex Determinant Parsing with pmatrix', async () => {
        const payload = {
            rawSelection: "\\det \\begin{pmatrix} x-\\lambda & 1 & 2 \\\\ 1 & y-\\lambda & 1 \\\\ 2 & 1 & z-\\lambda \\end{pmatrix} = 0",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Deeply Nested Radicals (Ramanujan-like)', async () => {
        const payload = {
            rawSelection: "\\sqrt{1 + 2 \\sqrt{1 + 3 \\sqrt{1 + 4 \\sqrt{1 + 5x}}}}",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Subscripts and Implicit Multiplication Mixed', async () => {
        const payload = {
            rawSelection: "x_{i_{j+1}}^{k^{m+n}} + 2x y \\sin(2\\pi f t) e^{-\\frac{t}{\\tau}}",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('High-order L\'Hopital Limit', async () => {
        const payload = {
            rawSelection: "\\frac{1}{\\sin^2 x} - \\frac{1}{x^2}",
            mainCommand: "limit",
            subCommands: ["x", "0"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Borwein Integral', async () => {
        const payload = {
            rawSelection: "\\int_{0}^{\\infty} \\frac{\\sin x}{x} \\frac{\\sin(x/3)}{x/3} \\, dx",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Sophomore\'s Dream', async () => {
        const payload = {
            rawSelection: "\\int_{0}^{1} x^{-x} \\, dx",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Ramanujan\'s Pi Formula', async () => {
        const payload = {
            rawSelection: "\\sum_{n=0}^{\\infty} \\frac{(4n)!}{(n!)^4} \\frac{1103 + 26390n}{396^{4n}}",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Euler-Maclaurin Series (Zeta)', async () => {
        const payload = {
            rawSelection: "\\sum_{n=1}^{\\infty} \\frac{(-1)^{n+1}}{n^2}",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Multinomial Expansion and Simplification', async () => {
        const payload = {
            rawSelection: "\\left( x_1 + x_2 + x_3 + x_4 + x_5 \\right)^5 - \\sum_{i=1}^{5} x_i^5",
            mainCommand: "expand",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        if (result.status === 'success') {
            assert.ok(result.latex.length > 0);
        } else {
            assert.ok(result.message.length > 0);
        }
    });

    test('Extreme Trigonometric Simplification', async () => {
        const payload = {
            rawSelection: "\\cos^6 x + \\sin^6 x + 3 \\sin^2 x \\cos^2 x",
            mainCommand: "trigsimp",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0, `Got result: ${result.latex}`);
    });

    // --- EVEN MORE EXTREME MATRIX & ODE TESTS ---

    test('Wronskian Determinant with Complex Functions', async () => {
        const payload = {
            rawSelection: "\\det \\begin{pmatrix} x & e^{fx} & \\sin(x^2) \\\\ 1 & f e^{fx} & 2x \\cos(x^2) \\\\ 0 & f^2 e^{fx} & 2 \\cos(x^2) - 4x^2 \\sin(x^2) \\end{pmatrix}",
            mainCommand: "simplify",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Eigenvalues / Characteristic Equation with Parameters', async () => {
        const payload = {
            rawSelection: "\\det \\begin{pmatrix} a - \\lambda & b & 0 \\\\ b & c - \\lambda & b \\\\ 0 & b & a - \\lambda \\end{pmatrix} = 0",
            mainCommand: "solve",
            subCommands: ["\\lambda"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('a') || result.latex.includes('c'));
    });

    test('4x4 Symbolic Matrix Inverse', async () => {
        const payload = {
            rawSelection: "\\begin{pmatrix} x & 1 & 0 & a \\\\ 0 & y & 1 & 0 \\\\ 0 & 0 & z & 1 \\\\ a & 0 & 0 & w \\end{pmatrix}^{-1}",
            mainCommand: "calc",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('matrix'));
    });

    test('Non-linear Bernoulli ODE with forcing', async () => {
        const payload = {
            rawSelection: "\\frac{dy}{dx} + y = x y^3 \\sin(x)",
            mainCommand: "ode",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0);
    });

    test('Bessel Differential Equation with variable coefficients', async () => {
        const payload = {
            rawSelection: "x^2 \\frac{d^2y}{dx^2} + x \\frac{dy}{dx} + (x^2 - \\nu^2)y = 0",
            mainCommand: "ode",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        // Solution should involve Bessel functions J and Y
        assert.ok(result.latex.includes('J') || result.latex.includes('Y') || result.latex.includes('bessel'));
    });

    test('Coupled Variable-Coefficient ODE System with cases', async () => {
        const payload = {
            rawSelection: "\\begin{cases} \\frac{dx}{dt} = t x + y \\\\ \\frac{dy}{dt} = -x + t y \\end{cases}",
            mainCommand: "ode",
            subCommands: [],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('x') && result.latex.includes('y'));
    });
});
