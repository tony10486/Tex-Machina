import * as vscode from 'vscode';

export class TeXMachinaWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'tex-machina.preview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { 
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);

        // 뷰가 보이지 않을 때 상태 변화 감지
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this._lastLatex) {
                this.updatePreview(this._lastLatex, this._lastVars);
            }
        });
    }

    private _lastLatex: string = "";
    private _lastVars: string[] = [];
    private _lastAnalysis: any = null;

    public updatePreview(latex: string, vars: string[], analysis?: any) {
        this._lastLatex = latex;
        this._lastVars = vars;
        this._lastAnalysis = analysis;
        
        if (!this._view) {
            // 뷰가 아직 로드되지 않았으면 명령어로 강제 노출 시도 가능
            vscode.commands.executeCommand('tex-machina.preview.focus');
        }
        
        this._view?.webview.postMessage({ type: 'update', latex, vars, analysis });
        if (this._view) {
            this._view.show?.(true); // 뷰 강제 표시
        }
    }

    private _getHtml(webview: vscode.Webview) {
        const scriptUri = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' ${webview.cspSource};">
            <script src="${scriptUri}"></script>
            <style>
                #img-container img { max-width: 100%; height: auto; margin-top: 10px; border: 1px solid #ccc; }
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
                #out { margin-bottom: 10px; font-size: 1.1em; }
                .analysis-container { margin-top: 20px; border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; }
                .analysis-item { margin-bottom: 8px; }
                .analysis-key { font-weight: bold; font-size: 0.9em; opacity: 0.8; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div id="out">계산 대기 중...</div>
            <div id="img-container"></div>
            <div id="sliders"></div>
            <div id="analysis" class="analysis-container" style="display:none;"></div>
            <script>
                const vscode = acquireVsCodeApi();
                window.addEventListener('message', e => {
                    const { type, latex, vars, analysis } = e.data;
                    if (type === 'update') {
                        const out = document.getElementById('out');
                        const imgContainer = document.getElementById('img-container');
                        const analysisDiv = document.getElementById('analysis');
                        
                        imgContainer.innerHTML = '';
                        analysisDiv.innerHTML = '';
                        analysisDiv.style.display = 'none';

                        if (latex.trim().startsWith('{')) {
                            try {
                                const jsonData = JSON.parse(latex);
                                if (jsonData.type === 'plot') {
                                    out.innerHTML = '수치적 해 그래프 (Numerical Plot):';
                                    imgContainer.innerHTML = '<img src="' + jsonData.data + '" />';
                                    return;
                                }
                            } catch (err) {}
                        }

                        out.innerHTML = '\\\\[' + latex + '\\\\]';

                        if (analysis) {
                            analysisDiv.style.display = 'block';
                            analysisDiv.innerHTML = '<b>Matrix Analysis:</b>';
                            for (const [key, value] of Object.entries(analysis)) {
                                const item = document.createElement('div');
                                item.className = 'analysis-item';
                                item.innerHTML = '<span class="analysis-key">' + key + ':</span> \\\\[ ' + value + ' \\\\]';
                                analysisDiv.appendChild(item);
                            }
                        }

                        if (window.MathJax && window.MathJax.typesetPromise) {
                            window.MathJax.typesetPromise();
                        }
                    }
                });
            </script>
        </body></html>`;
    }
}