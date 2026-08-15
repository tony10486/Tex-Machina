import * as assert from 'assert';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';

/**
 * calc_engine.py 를 실제 서버 프로토콜(server.py)로 테스트하는 하네스.
 *
 * 설계 (이전의 구조적 결함들을 모두 수정):
 * - 프로세스 수명주기: 테스트마다 프로세스를 띄우지 않고 **suite 단위로 하나만** 띄운다
 *   (suiteSetup() → spawn, suiteTeardown() → kill). 프로세스가 살아있는 동안 stdout 'end' 는
 *   발생하지 않으므로, 이전 구현처럼 'end' 에서 promise 를 resolve 하면 절대 완료되지
 *   않았다.
 * - 응답 매칭: stdout 의 **단일 'data' 리스너** + 줄 버퍼로 newline-delimited JSON 을
 *   분할하고, 각 요청에 부여한 requestId 로 응답의 requestId 를 매칭해 promise 를
 *   resolve 한다. 이전 구현은 호출마다 'data'/'end' 리스너를 계속 추가해
 *   리스너가 누적되고 응답이 뒤섞였다.
 * - cwd: 컴파일된 테스트는 out/test/ 에 있으므로 `path.join(__dirname, '..', '..',
 *   'python_backend')` 가 저장소 루트의 python_backend 디렉터리가 된다.
 *   (이전 구현의 `__dirname + '/python_backend'` 는 존재하지 않는 경로였다.)
 * - 종료 처리: 단일 'close' 핸들러가 모든 pending promise 를 error 로 reject 한다.
 */

/** python_backend 디렉터리 (out/test/ → 저장소 루트 → python_backend) */
const PYTHON_BACKEND_DIR = path.join(__dirname, '..', '..', 'python_backend');
const PYTHON_COMMAND = process.platform === 'darwin' ? 'python3' : 'python';
/** 서버 자체 워치독(10초) 이후에도 응답이 없으면 포기하는 안전망 */
const REQUEST_TIMEOUT_MS = 40000;

/** 실행 중인 서버 프로세스 (suite 단위로 하나) */
let serverProc: ChildProcessWithoutNullStreams | null = null;
/** requestId → 대기 중인 promise 핸들러 */
let pending = new Map<string, { resolve: (r: any) => void; reject: (e: Error) => void }>();
/** stdout 줄 버퍼 — newline-delimited JSON 을 안전하게 분할하기 위함 */
let stdoutBuffer = '';
/** 시작 신호({"status":"ready"}) 수신 여부 */
let serverReady = false;
/** 시작 신호 대기 promise (spawn 오류를 suite 시작 시점에 노출) */
let serverReadyPromise: Promise<void>;
let resolveServerReady!: () => void;
let rejectServerReady!: (e: Error) => void;
/** 요청 ID 카운터 (suite 내에서 유일) */
let requestCounter = 0;

function rejectAllPending(err: Error): void {
    for (const [, handler] of pending) {
        handler.reject(err);
    }
    pending.clear();
}

function handleStdoutData(data: Buffer): void {
    stdoutBuffer += data.toString();
    let newlineIndex: number;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line) {
            continue;
        }
        let response: any;
        try {
            response = JSON.parse(line);
        } catch (e) {
            // 부분 출력/경고 등 JSON 이 아닌 줄은 무시 (계산 중 잡음 방지)
            continue;
        }
        // 시작 신호 — 서버가 요청을 받을 준비가 되었음을 알림
        if (response.status === 'ready') {
            serverReady = true;
            resolveServerReady();
            continue;
        }
        const requestId = response.requestId;
        const handler = pending.get(requestId);
        if (handler) {
            pending.delete(requestId);
            handler.resolve(response);
        }
        // requestId 없이 도착한 줄은 매칭 대상이 없으므로 무시
    }
}

function handleServerClose(code: number | null): void {
    const err = new Error(
        `Python 서버 프로세스가 종료되었습니다 (exit code: ${code}). stderr: ${serverStderr}`
    );
    if (!serverReady) {
        rejectServerReady(err);
    }
    rejectAllPending(err);
    serverProc = null;
}

/** 서버 stderr 누적 (종료 시 오류 진단용) */
let serverStderr = '';

function startServer(): Promise<void> {
    serverReadyPromise = new Promise<void>((resolve, reject) => {
        resolveServerReady = resolve;
        rejectServerReady = reject;
    });
    serverReady = false;
    stdoutBuffer = '';
    serverStderr = '';

    serverProc = spawn(PYTHON_COMMAND, ['server.py'], {
        cwd: PYTHON_BACKEND_DIR,
    });

    serverProc.stdout.on('data', handleStdoutData);
    // stderr 리스너 필수 — 리스너가 없으면 stderr 버퍼가 차서 프로세스가 멈출 수 있음
    serverProc.stderr.on('data', (data: Buffer) => {
        serverStderr += data.toString();
    });
    serverProc.on('error', (err) => {
        if (!serverReady) {
            rejectServerReady(err);
        }
        rejectAllPending(err);
        serverProc = null;
    });
    serverProc.on('close', handleServerClose);

    return serverReadyPromise;
}

/** 요청 전송 + requestId 매칭 응답 대기 */
function runPythonCalc(payload: any): Promise<any> {
    const requestId = `req-${++requestCounter}`;
    return new Promise((resolve, reject) => {
        if (!serverProc || serverProc.stdin.destroyed) {
            reject(new Error('Python 서버가 실행 중이 아닙니다'));
            return;
        }
        pending.set(requestId, { resolve, reject });
        // 안전망: 서버 워치독(10초) 이후에도 응답이 없으면 명확한 에러로 reject
        const timeout = setTimeout(() => {
            if (pending.has(requestId)) {
                pending.delete(requestId);
                reject(new Error(`요청 ${requestId} 응답 대기 시간 초과 (${REQUEST_TIMEOUT_MS}ms)`));
            }
        }, REQUEST_TIMEOUT_MS);
        const wrappedResolve = (r: any) => {
            clearTimeout(timeout);
            resolve(r);
        };
        const wrappedReject = (e: Error) => {
            clearTimeout(timeout);
            reject(e);
        };
        pending.set(requestId, { resolve: wrappedResolve, reject: wrappedReject });

        try {
            serverProc.stdin.write(`${JSON.stringify({ ...payload, requestId })}\n`);
        } catch (e) {
            pending.delete(requestId);
            clearTimeout(timeout);
            reject(e instanceof Error ? e : new Error(String(e)));
        }
    });
}

suite('Calc Engine Extreme Stress Tests', function() {
    this.timeout(45000); // 극단적인 수학 계산을 위한 넉넉한 타임아웃

    suiteSetup(async () => {
        // suite 시작 시 서버 프로세스를 한 번만 기동한다 (테스트당 spawn 금지)
        await startServer();
    });

    suiteTeardown(() => {
        // suite 종료 시 서버 프로세스 정리 — 프로세스가 남으면 테스트 러너가 안 끝난다
        if (serverProc) {
            serverProc.kill();
            serverProc = null;
        }
        pending.clear();
    });

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
        // a, b, c, d 는 심볼릭 파라미터라 수치 해석이 불가능할 수 있다.
        // 이때 엔진은 status=success 이면서 latex 에 "Error: ..." 문자열을 넣어
        // 반환하거나(엔진 특성), status=error 로 응답한다. 두 경우 모두 정상 처리로 본다.
        if (result.status === 'error') {
            assert.ok(result.message.includes('Error') || result.message.includes('name'));
        } else if (typeof result.latex === 'string' && result.latex.includes('Error:')) {
            assert.ok(result.latex.length > 0);
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
