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
    private _lastX3dData: any = null;

    public updatePreview(latex: string, vars: string[], analysis?: any, x3d_data?: any) {
        this._lastLatex = latex;
        this._lastVars = vars;
        this._lastAnalysis = analysis;
        this._lastX3dData = x3d_data;
        
        if (!this._view) {
            vscode.commands.executeCommand('tex-machina.preview.focus');
        }
        
        this._view?.webview.postMessage({ type: 'update', latex, vars, analysis, x3d_data });
        if (this._view) {
            this._view.show?.(true);
        }
    }

    private _getHtml(webview: vscode.Webview) {
        const mathjaxUri = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        const x3domJs = "https://www.x3dom.org/download/dev/x3dom.js";
        const x3domCss = "https://www.x3dom.org/download/dev/x3dom.css";
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://www.x3dom.org; style-src 'unsafe-inline' ${webview.cspSource} https://www.x3dom.org;">
            <link rel="stylesheet" href="${x3domCss}">
            <script src="${x3domJs}"></script>
            <script src="${mathjaxUri}"></script>
            <style>
                #img-container img { max-width: 100%; height: auto; margin-top: 10px; border: 1px solid #ccc; }
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
                #out { margin-bottom: 10px; font-size: 1.1em; }
                .analysis-container { margin-top: 20px; border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; }
                .analysis-item { margin-bottom: 8px; }
                .analysis-key { font-weight: bold; font-size: 0.9em; opacity: 0.8; text-transform: uppercase; }
                x3d { width: 100%; height: 300px; border: 1px solid #444; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div id="out">계산 대기 중...</div>
            <div id="img-container"></div>
            <div id="x3d-container"></div>
            <div id="analysis" class="analysis-container" style="display:none;"></div>
            <script>
                const vscode = acquireVsCodeApi();
                window.addEventListener('message', e => {
                    const { type, latex, vars, analysis, x3d_data } = e.data;
                    if (type === 'update') {
                        const out = document.getElementById('out');
                        const imgContainer = document.getElementById('img-container');
                        const x3dContainer = document.getElementById('x3d-container');
                        const analysisDiv = document.getElementById('analysis');
                        
                        imgContainer.innerHTML = '';
                        x3dContainer.innerHTML = '';
                        analysisDiv.innerHTML = '';
                        analysisDiv.style.display = 'none';

                        if (x3d_data) {
                            out.innerHTML = '3D Interactive Preview: ' + x3d_data.expr;
                            const x3d = document.createElement('x3d');
                            const scene = document.createElement('scene');
                            const shape = document.createElement('shape');
                            const appearance = document.createElement('appearance');
                            const material = document.createElement('material');
                            material.setAttribute('diffuseColor', '0.1 0.6 0.8');
                            appearance.appendChild(material);
                            
                            const ifs = document.createElement('IndexedFaceSet');
                            const coord = document.createElement('Coordinate');
                            
                            // points format: [[x,y,z], ...]
                            const ptsStr = x3d_data.points.map(p => p.join(' ')).join(' ');
                            coord.setAttribute('point', ptsStr);
                            
                            // indices
                            const [cols, rows] = x3d_data.grid_size;
                            let indices = [];
                            for (let i = 0; i < rows - 1; i++) {
                                for (let j = 0; j < cols - 1; j++) {
                                    const p1 = i * cols + j;
                                    const p2 = i * cols + (j + 1);
                                    const p3 = (i + 1) * cols + (j + 1);
                                    const p4 = (i + 1) * cols + j;
                                    indices.push(p1, p2, p3, p4, -1);
                                }
                            }
                            ifs.setAttribute('coordIndex', indices.join(' '));
                            ifs.appendChild(coord);
                            
                            shape.appendChild(appearance);
                            shape.appendChild(ifs);
                            scene.appendChild(shape);
                            x3d.appendChild(scene);
                            x3dContainer.appendChild(x3d);
                            
                            // Re-initialize X3DOM if needed
                            if (window.x3dom && window.x3dom.reload) {
                                window.x3dom.reload();
                            }
                            return;
                        }

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
                            analysisDiv.innerHTML = '<b>Analysis:</b>';
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