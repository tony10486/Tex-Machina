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

        assert.ok(capturedHtml.includes('id="details-m"'));
        assert.ok(capturedHtml.includes('id="macro-list"'));
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
});
