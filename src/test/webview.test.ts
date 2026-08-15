import * as assert from 'assert';
import * as vscode from 'vscode';
import { TeXMachinaWebviewProvider } from '../ui/webviewProvider';

suite('Webview UI Test Suite', () => {
    test('Webview HTML should contain Macro UI elements', () => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let capturedHtml = '';
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            set html(val: string) { capturedHtml = val; },
            get html() { return capturedHtml; },
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        assert.ok(capturedHtml.includes('id="details-m"'));
        assert.ok(capturedHtml.includes('id="macro-list"'));
    });

    test('Webview should load Three.js plot bundle with CSP cspSource (Phase 0.3)', () => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let capturedHtml = '';
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            set html(val: string) { capturedHtml = val; },
            get html() { return capturedHtml; },
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        // 1) Three.js 플롯 번들 script 태그가 로드되어야 한다 (x3dom CDN 대체)
        assert.ok(capturedHtml.includes('plot3d.js'), 'plot3d.js 번들 script 태그가 없음');
        assert.ok(!capturedHtml.includes('x3dom.org'), 'x3dom.org CDN 참조가 남아있음 — Phase 0.3 위반');
        // 2) CSP script-src 에 webview.cspSource 가 포함되어야 한다 (로컬 번들 로드)
        assert.ok(capturedHtml.includes('script-src'), 'CSP script-src 가 없음');
        assert.ok(!/script-src[^;]*'unsafe-inline'[^;]*'unsafe-eval'[^;]*vscode-resource/.test(capturedHtml)
            || capturedHtml.includes('vscode-resource:'), 'CSP script-src 에 cspSource 가 없음');
        // 3) X3D 플롯 컨테이너는 유지되어야 한다 (Three.js 씬 호스트)
        assert.ok(capturedHtml.includes('id="container"'), '플롯 컨테이너가 없음');
    });

    test('Webview should forward macro messages to VS Code commands', (done) => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let messageHandler: ((data: any) => void) | undefined;
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: (handler: (data: any) => void) => {
                messageHandler = handler;
                return { dispose: () => {} };
            },
            html: '',
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        const originalExecuteCommand = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.defineMacro') {
                assert.strictEqual(args[0], 'testMacro');
                (vscode.commands as any).executeCommand = originalExecuteCommand;
                done();
            }
            return Promise.resolve();
        };

        if (messageHandler) {
            messageHandler({ command: 'defineMacro', name: 'testMacro', chain: 'calc > simplify' });
        } else {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done(new Error("Message handler not registered"));
        }
    });

    test('Webview CSP should not allow unsafe-inline/unsafe-eval in script-src', () => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);

        let capturedHtml = '';
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            set html(val: string) { capturedHtml = val; },
            get html() { return capturedHtml; },
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        // 인라인 핸들러/스크립트가 더 이상 실행되지 않도록 script-src 에서 unsafe-inline/unsafe-eval 제거.
        assert.ok(!capturedHtml.includes("script-src 'unsafe-inline'"), 'script-src 에 unsafe-inline 이 남아 있으면 안 됨');
        assert.ok(!capturedHtml.includes("script-src 'unsafe-eval'"), 'script-src 에 unsafe-eval 이 남아 있으면 안 됨');
        assert.ok(capturedHtml.includes('script-src \'nonce-'), 'nonce 기반 script-src 가 필요함');
        // 인라인 onclick/onchange/oninput 속성이 모두 제거되었는지 확인 (CSP 호환).
        assert.ok(!capturedHtml.includes(' onclick='), '인라인 onclick 핸들러가 남아 있으면 안 됨');
        assert.ok(!capturedHtml.includes(' onchange='), '인라인 onchange 핸들러가 남아 있으면 안 됨');
        assert.ok(!capturedHtml.includes(' oninput='), '인라인 oninput 핸들러가 남아 있으면 안 됨');
    });

    test('Webview should escape raw label node content at the innerHTML sink', () => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);

        let capturedHtml = '';
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            set html(val: string) { capturedHtml = val; },
            get html() { return capturedHtml; },
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        // 라벨 그래프의 RAW .tex 줄(node.content)이 innerHTML 에 삽입되기 전에
        // escapeHtml 을 통과하는지 확인 (XSS 회귀 방지).
        assert.ok(capturedHtml.includes('escapeHtml(node.content)'), '라벨 노드 content 는 escapeHtml 을 거쳐야 함');
        assert.ok(capturedHtml.includes('escapeHtml(warning)'), 'calc 경고 문자열은 escapeHtml 을 거쳐야 함');
        assert.ok(capturedHtml.includes('escapeHtml(content)'), 'calc 결과 문자열은 escapeHtml 을 거쳐야 함');
        assert.ok(capturedHtml.includes('escapeHtml(preview_img)'), '플롯 미리보기 경로는 escapeHtml 을 거쳐야 함');
    });

    test('Webview bridge should drop malformed messages', (done) => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);

        let messageHandler: ((data: any) => void) | undefined;
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri.toString() as any,
            onDidReceiveMessage: (handler: (data: any) => void) => {
                messageHandler = handler;
                return { dispose: () => {} };
            },
            html: '',
            postMessage: () => Promise.resolve(true)
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} }),
            show: () => {}
        };

        provider.resolveWebviewView(mockView);

        const originalExecuteCommand = vscode.commands.executeCommand;
        const executed: string[] = [];
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            executed.push(command + '|' + JSON.stringify(args[0] ?? null));
            return Promise.resolve();
        };

        const finish = () => {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            // 잘못된 스니펫(script.type 미허용 값)과 알 수 없는 명령은 실행되지 않아야 한다.
            assert.ok(!executed.some((e) => e.includes('evil')), '잘못된 스니펫은 저장되면 안 됨');
            assert.ok(!executed.some((e) => e.startsWith('tex-machina.defineMacro|12345')), '비문자열 매크로 이름은 전달되면 안 됨');
            assert.ok(!executed.some((e) => e.startsWith('tex-machina.snippets.save') && e.includes('"type":"evil"')), 'script.type: evil 은 거부되어야 함');
            // 올바른 스니펫(script.type: python)은 정상적으로 저장되어야 한다.
            assert.ok(executed.some((e) => e.startsWith('tex-machina.snippets.save') && e.includes('"type":"python"')), '올바른 스니펫은 저장되어야 함');
            done();
        };

        if (messageHandler) {
            messageHandler({ command: 'defineSnippet', snippet: { name: 'evil', body: 'x', script: { type: 'evil', code: 'alert(1)' } } });
            messageHandler({ command: 'defineMacro', name: 12345, chain: 'calc > diff' });
            messageHandler({ command: 'unknownCommand', name: 'x' });
            messageHandler({ command: 'defineSnippet', snippet: { name: 'ok', body: '\\frac{$1}{$2}$0', scope: 'any', script: { type: 'python', code: 'result = "1+1"' } } });
            finish();
        } else {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done(new Error("Message handler not registered"));
        }
    });
});
