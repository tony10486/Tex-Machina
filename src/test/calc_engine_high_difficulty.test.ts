import * as assert from 'assert';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

/**
 * Directly test calc_engine.py using a child process to bypass VS Code dependencies
 */
function runPythonCalc(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const pythonCommand = process.platform === 'darwin' ? 'python3' : 'python';
        const enginePath = path.join(__dirname, '../../python_backend/calc_engine.py');
        
        // Wrap payload in the expected format for execute_calc
        const inputStr = JSON.stringify(payload);
        const script = `
import sys
import json
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

suite('Calc Engine High Difficulty Tests', function() {
    this.timeout(10000);

    test('Generalized Tensor Expand (4D Minkowski-like)', async () => {
        const payload = {
            rawSelection: "A_\\mu B^\\mu",
            mainCommand: "calc",
            subCommands: ["tensor_expand"],
            parallelOptions: ["dim=4"]
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.includes('A_{4} B^{4}') || result.latex.includes('A_{{4}} B^{{4}}'), `Should contain index 4, got: ${result.latex}`);
    });

    test('Taylor Expansion at non-zero point', async () => {
        const payload = {
            rawSelection: "\\ln(x)",
            mainCommand: "taylor",
            subCommands: ["x", "3", "1"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        // ln(x) expanded at x=1: (x-1) - (x-1)^2/2 + ...
        assert.ok(result.latex.includes('x - 1'), `Should expand around x=1, got: ${result.latex}`);
    });

    test('Numerical ODE with custom span and precision', async () => {
        const payload = {
            rawSelection: "y' = -2 y t",
            mainCommand: "num_solve",
            subCommands: ["ic=y(0):1", "t_span=0,0.5", "points=200"],
            parallelOptions: []
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        // Gaussian decay y(t) = exp(-t^2). At t=0.5, y(0.5) approx 0.7788
        assert.ok(result.latex.includes('y(0.5)'), `Should include point 0.5, got: ${result.latex}`);
    });

    test('Complex Einstein Summation with different indices', async () => {
        const payload = {
            rawSelection: "R_{ik} g^{kj}",
            mainCommand: "calc",
            subCommands: ["tensor_expand"],
            parallelOptions: ["dim=2"]
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        assert.ok(result.latex.length > 0, `Got result: ${result.latex}`);
    });

    test('Taylor with explicit order parameter and symbolic point', async () => {
        const payload = {
            rawSelection: "\\sin(x)",
            mainCommand: "taylor",
            subCommands: ["x"],
            parallelOptions: ["order=4", "at=pi/2"]
        };
        const result = await runPythonCalc(payload);
        assert.strictEqual(result.status, 'success');
        // sin(x) at pi/2: 1 - (x-pi/2)^2/2 + ...
        assert.ok(result.latex.includes('1'), `Should start with 1, got: ${result.latex}`);
        assert.ok(result.latex.includes('\\pi'), `Should include pi in expansion point, got: ${result.latex}`);
    });
});
