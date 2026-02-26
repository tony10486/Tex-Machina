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
                <style>
                    #img-container img { max-width: 100%; height: auto; margin-top: 10px; border: 1px solid #ccc; }
                    body { font-family: sans-serif; padding: 10px; }
                </style>
            </head>
            <body>
                <div id="out">계산 대기 중...</div>
                <div id="img-container"></div>
                <div id="sliders"></div>
                <script>
                    const vscode = acquireVsCodeApi();
                    window.addEventListener('message', e => {
                        if (e.data.type === 'update') {
                            const out = document.getElementById('out');
                            const imgContainer = document.getElementById('img-container');
                            
                            // 기본값 초기화
                            imgContainer.innerHTML = '';

                            if (e.data.latex.trim().startsWith('{')) {
                                try {
                                    const jsonData = JSON.parse(e.data.latex);
                                    if (jsonData.type === 'plot') {
                                        out.innerHTML = '수치적 해 그래프 (Numerical Plot):';
                                        imgContainer.innerHTML = '<img src="' + jsonData.data + '" />';
                                        return;
                                    }
                                } catch (err) {
                                    // JSON 파싱 실패 시 일반 텍스트로 처리
                                }
                            }

                            out.innerHTML = '\\\\[' + e.data.latex + '\\\\]';
                            MathJax.typesetPromise();
                        }
                    });
                </script>
            </body></html>`;
    }
}