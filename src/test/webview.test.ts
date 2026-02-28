import * as assert from 'assert';
import * as vscode from 'vscode';
import { TeXMachinaWebviewProvider } from '../ui/webviewProvider';

suite('Webview UI Test Suite', () => {
    test('Webview HTML should contain Table UI elements', () => {
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
            get html() { return capturedHtml; }
        };

        const mockView: any = {
            webview: mockWebview,
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            onDidDispose: () => ({ dispose: () => {} })
        };

        provider.resolveWebviewView(mockView);

        // UI 항목 존재 여부 검증 (사용자가 요청한 "무슨 항목이 있는지" 확인)
        assert.ok(capturedHtml.includes("tab('t')"), "Table tab should be present");
        assert.ok(capturedHtml.includes('id="table-grid-container"'), "Table grid container should be present");
        assert.ok(capturedHtml.includes('id="tbl-rows"'), "Rows input should be present");
        assert.ok(capturedHtml.includes('id="tbl-cols"'), "Columns input should be present");
        assert.ok(capturedHtml.includes('id="tbl-align"'), "Alignment select should be present");
        assert.ok(capturedHtml.includes('insertTable()'), "Insert Table function call should be present");
        
        // 초기화 로직 확인
        assert.ok(capturedHtml.includes('initGrid()'), "Grid initialization script should be present");
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
});
