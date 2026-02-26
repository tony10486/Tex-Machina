import * as vscode from 'vscode';

export class TeXMachinaWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'tex-machina.preview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml(webviewView.webview);
    }

    public updatePreview(latex: string, vars: string[]) {
        this._view?.webview.postMessage({ type: 'update', latex, vars });
    }

    private _getHtml(webview: vscode.Webview) {
        return `<html>
            <head>
                <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
            </head>
            <body>
                <div id="out">계산 대기 중...</div>
                <div id="sliders"></div>
                <script>
                    const vscode = acquireVsCodeApi();
                    window.addEventListener('message', e => {
                        if (e.data.type === 'update') {
                            document.getElementById('out').innerHTML = '\\\\[' + e.data.latex + '\\\\]';
                            MathJax.typesetPromise();
                        }
                    });
                </script>
            </body></html>`;
    }
}