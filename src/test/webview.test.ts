import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TeXMachinaWebviewProvider } from '../ui/webviewProvider';

suite('Webview UI Test Suite', () => {
    test('Webview HTML should contain Table and Macro UI elements', async () => {
        // Mock extension context
        const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
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

        await provider.resolveWebviewView(mockView);

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
        
        // Note: initGrid() is now in webview.js, so it won't be in the raw HTML string
        // but the webview.js script tag should be there.
        assert.ok(capturedHtml.includes('webview.js'), "Webview script tag should be present");
    });

    test('Webview should forward macro messages to VS Code commands', async () => {
        const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
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

        await provider.resolveWebviewView(mockView);

        const originalExecuteCommand = vscode.commands.executeCommand;
        const calls: { command: string, args: any[] }[] = [];
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command.startsWith('tex-machina.')) {
                calls.push({ command, args });
            }
            return Promise.resolve();
        };

        try {
            if (messageHandler) {
                messageHandler({ command: 'defineMacro', name: 'testMacro', chain: 'calc > simplify' });
                messageHandler({ command: 'deleteMacro', name: 'testMacro' });
                messageHandler({ command: 'applyMacro', name: 'testMacro' });

                assert.strictEqual(calls.length, 3);
                assert.strictEqual(calls[0].command, 'tex-machina.defineMacro');
                assert.strictEqual(calls[0].args[0], 'testMacro');
                assert.strictEqual(calls[1].command, 'tex-machina.deleteMacro');
                assert.strictEqual(calls[1].args[0], 'testMacro');
                assert.strictEqual(calls[2].command, 'tex-machina.applyMacro');
                assert.strictEqual(calls[2].args[0], 'testMacro');
            } else {
                throw new Error("Message handler not registered");
            }
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
        }
    });

    test('Webview should forward insertTable message to VS Code command', async () => {
        const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
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

        await provider.resolveWebviewView(mockView);

        const originalExecuteCommand = vscode.commands.executeCommand;
        let capturedArgs: any = null;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.insertTable') {
                capturedArgs = args[0];
            }
            return Promise.resolve();
        };

        try {
            if (messageHandler) {
                messageHandler({
                    command: 'insertTable',
                    options: { rows: 5, cols: 4, alignment: 'c', hasBorders: true, hasHeader: true }
                });
                assert.ok(capturedArgs);
                assert.strictEqual(capturedArgs.rows, 5);
                assert.strictEqual(capturedArgs.cols, 4);
            } else {
                throw new Error("Message handler not registered");
            }
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
        }
    });

    test('Webview should handle toggleLabelDiscovery message and update state', async () => {
        const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
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

        await provider.resolveWebviewView(mockView);

        assert.strictEqual(provider.isLabelDiscoveryExpanded(), false, "Initially should be collapsed");

        const originalExecuteCommand = vscode.commands.executeCommand;
        let commandCalled = false;
        (vscode.commands as any).executeCommand = (command: string, ...args: any[]) => {
            if (command === 'tex-machina.discoverLabels') {
                commandCalled = true;
            }
            return Promise.resolve();
        };

        try {
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
            } else {
                throw new Error("Message handler not registered");
            }
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
        }
    });
});
