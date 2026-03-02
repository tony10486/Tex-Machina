import * as assert from 'assert';
import * as vscode from 'vscode';
import { TeXMachinaWebviewProvider } from '../ui/webviewProvider';

suite('Webview UI Test Suite', () => {
    test('Webview HTML should contain Table and Macro UI elements', () => {
        // Mock extension context
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let capturedHtml = '';
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri,
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

        // Macro UI 항목 존재 여부 검증
        assert.ok(capturedHtml.includes('id="details-m"'), "Macro section (details) should be present");
        assert.ok(capturedHtml.includes('id="new-macro-name"'), "New macro name input should be present");
        assert.ok(capturedHtml.includes('id="new-macro-chain"'), "New macro chain input should be present");
        assert.ok(capturedHtml.includes('id="macro-list"'), "Macro list container should be present");
        assert.ok(capturedHtml.includes('addMacro()'), "Add Macro function call should be present");

        // Table UI 항목 존재 여부 검증
        assert.ok(capturedHtml.includes('id="details-t"'), "Table section (details) should be present");
        assert.ok(capturedHtml.includes('id="table-grid-container"'), "Table grid container should be present");
        assert.ok(capturedHtml.includes('id="tbl-rows"'), "Rows input should be present");
        assert.ok(capturedHtml.includes('id="tbl-cols"'), "Columns input should be present");
        assert.ok(capturedHtml.includes('id="tbl-align"'), "Alignment select should be present");
        assert.ok(capturedHtml.includes('insertTable()'), "Insert Table function call should be present");
        
        // 초기화 로직 확인
        assert.ok(capturedHtml.includes('initGrid()'), "Grid initialization script should be present");
    });

    test('Webview should forward macro messages to VS Code commands', (done) => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let messageHandler: ((data: any) => void) | undefined;
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri,
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
        let callCount = 0;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.defineMacro') {
                try {
                    assert.strictEqual(args[0], 'testMacro');
                    assert.strictEqual(args[1], 'calc > simplify');
                    callCount++;
                    if (callCount === 3) {
                        (vscode.commands as any).executeCommand = originalExecuteCommand;
                        done();
                    }
                } catch (e) {
                    (vscode.commands as any).executeCommand = originalExecuteCommand;
                    done(e);
                }
            } else if (command === 'tex-machina.deleteMacro') {
                try {
                    assert.strictEqual(args[0], 'testMacro');
                    callCount++;
                    if (callCount === 3) {
                        (vscode.commands as any).executeCommand = originalExecuteCommand;
                        done();
                    }
                } catch (e) {
                    (vscode.commands as any).executeCommand = originalExecuteCommand;
                    done(e);
                }
            } else if (command === 'tex-machina.applyMacro') {
                try {
                    assert.strictEqual(args[0], 'testMacro');
                    callCount++;
                    if (callCount === 3) {
                        (vscode.commands as any).executeCommand = originalExecuteCommand;
                        done();
                    }
                } catch (e) {
                    (vscode.commands as any).executeCommand = originalExecuteCommand;
                    done(e);
                }
            }
            return Promise.resolve();
        };

        if (messageHandler) {
            messageHandler({ command: 'defineMacro', name: 'testMacro', chain: 'calc > simplify' });
            messageHandler({ command: 'deleteMacro', name: 'testMacro' });
            messageHandler({ command: 'applyMacro', name: 'testMacro' });
        } else {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done(new Error("Message handler not registered"));
        }
    });

    test('Webview should forward insertTable message to VS Code command', (done) => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let messageHandler: ((data: any) => void) | undefined;
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri,
            onDidReceiveMessage: (handler: (data: any) => void) => {
                messageHandler = handler;
                return { dispose: () => {} };
            },
            html: ''
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} })
        };

        provider.resolveWebviewView(mockView);

        // VS Code 커맨드 실행 감시를 위해 임시로 executeCommand를 가로챕니다.
        const originalExecuteCommand = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.insertTable') {
                try {
                    assert.strictEqual(args[0].rows, 5);
                    assert.strictEqual(args[0].cols, 4);
                    // 성공 시 복원 및 종료
                    (vscode.commands as any).executeCommand = originalExecuteCommand;
                    done();
                } catch (e) {
                    (vscode.commands as any).executeCommand = originalExecuteCommand;
                    done(e);
                }
            }
            return Promise.resolve();
        };

        // 메시지 시뮬레이션
        if (messageHandler) {
            messageHandler({
                command: 'insertTable',
                options: { rows: 5, cols: 4, alignment: 'c', hasBorders: true, hasHeader: true }
            });
        } else {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done(new Error("Message handler not registered"));
        }
    });

    test('Webview should handle toggleLabelDiscovery message and update state', (done) => {
        const extensionUri = vscode.Uri.file('.');
        const provider = new TeXMachinaWebviewProvider(extensionUri);
        
        let messageHandler: ((data: any) => void) | undefined;
        const mockWebview: any = {
            options: {},
            cspSource: 'vscode-resource:',
            asWebviewUri: (uri: vscode.Uri) => uri,
            onDidReceiveMessage: (handler: (data: any) => void) => {
                messageHandler = handler;
                return { dispose: () => {} };
            },
            html: ''
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} })
        };

        provider.resolveWebviewView(mockView);

        assert.strictEqual(provider.isLabelDiscoveryExpanded(), false, "Initially should be collapsed");

        const originalExecuteCommand = vscode.commands.executeCommand;
        let commandCalled = false;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.discoverLabels') {
                commandCalled = true;
            }
            return Promise.resolve();
        };

        if (messageHandler) {
            // Expand
            messageHandler({ command: 'toggleLabelDiscovery', expanded: true });
            assert.strictEqual(provider.isLabelDiscoveryExpanded(), true, "Should be expanded after message");
            assert.strictEqual(commandCalled, true, "Should trigger discoverLabels when expanded");

            commandCalled = false;
            // Collapse
            messageHandler({ command: 'toggleLabelDiscovery', expanded: false });
            assert.strictEqual(provider.isLabelDiscoveryExpanded(), false, "Should be collapsed after message");
            assert.strictEqual(commandCalled, false, "Should NOT trigger discoverLabels when collapsed");

            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done();
        } else {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            done(new Error("Message handler not registered"));
        }
    });
});
