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

        // 웹뷰에서 오는 메시지 처리 (재랜더링 요청 등)
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'rerender') {
                vscode.commands.executeCommand('tex-machina.rerenderPlot', data.expr, data.samples);
            } else if (data.command === 'exportPdf') {
                vscode.commands.executeCommand('tex-machina.export3dPlot', data.expr, data.samples, data.color);
            }
        });

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

    public updatePreview(latex: string, vars: string[], analysis?: any, x3d_data?: any, warning?: string, preview_img?: string) {
        this._lastLatex = latex;
        this._lastVars = vars;
        this._lastAnalysis = analysis;
        this._lastX3dData = x3d_data;
        
        if (!this._view) {
            vscode.commands.executeCommand('tex-machina.preview.focus');
        }
        
        this._view?.webview.postMessage({ type: 'update', latex, vars, analysis, x3d_data, warning, preview_img });
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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://www.x3dom.org; style-src 'unsafe-inline' ${webview.cspSource} https://www.x3dom.org; font-src https://www.x3dom.org; connect-src https://www.x3dom.org;">
            <link rel="stylesheet" href="${x3domCss}">
            <script src="${x3domJs}"></script>
            <script src="${mathjaxUri}"></script>
            <style>
                #img-container img, #preview-img img { max-width: 100%; height: auto; margin-top: 10px; border: 1px solid #ccc; }
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; line-height: 1.4; overflow-x: hidden; }
                #out { margin-bottom: 10px; font-size: 1.1em; }
                .warning-container { margin-top: 10px; padding: 10px; background-color: rgba(255, 165, 0, 0.1); border-left: 4px solid orange; color: #cc8400; font-size: 0.9em; }
                .preview-header { font-weight: bold; margin-top: 15px; font-size: 0.9em; opacity: 0.7; }
                
                /* X3D Styles */
                x3d { width: 100%; height: 450px; border: 1px solid #444; margin-top: 10px; background: #1e1e1e; display: block; }
                .x3dom-canvas { border: none; width: 100%; height: 100%; }
                .x3d-controls { 
                    background: var(--vscode-sideBar-background); 
                    padding: 12px; 
                    margin-top: 5px; 
                    border: 1px solid var(--vscode-panel-border);
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    font-size: 0.85em;
                }
                .control-group { display: flex; flex-direction: column; gap: 4px; }
                .control-group.full-width { grid-column: 1 / span 2; }
                .control-group label { font-weight: bold; opacity: 0.8; font-size: 0.8em; text-transform: uppercase; }
                input[type="range"], select { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 2px; }
                button.mode-btn { padding: 6px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; margin-top: 5px; }
                button.mode-btn:hover { background: var(--vscode-button-hoverBackground); }
                .divider { grid-column: 1 / span 2; border-top: 1px solid var(--vscode-panel-border); margin: 5px 0; }

                .analysis-container { margin-top: 20px; border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; }
            </style>
        </head>
        <body>
            <div id="warning" class="warning-container" style="display:none;"></div>
            <div id="out">계산 대기 중...</div>
            
            <div id="preview-container" style="display:none;">
                <div class="preview-header">Graph Preview:</div>
                <div id="preview-img"></div>
            </div>

            <div id="x3d-container" style="min-height: 450px;"></div>
            <div id="x3d-ui" class="x3d-controls" style="display:none;">
                <div class="control-group">
                    <label>Surface Color</label>
                    <input type="color" id="diffuseColor" value="#1a99cc">
                </div>
                <div class="control-group">
                    <label>Specular Color</label>
                    <input type="color" id="specularColor" value="#888888">
                </div>
                <div class="control-group">
                    <label>Transparency</label>
                    <input type="range" id="transparency" min="0" max="1" step="0.1" value="0">
                </div>
                <div class="control-group">
                    <label>Shininess</label>
                    <input type="range" id="shininess" min="0" max="1" step="0.1" value="0.5">
                </div>
                <div class="control-group">
                    <label>Ambient Intensity</label>
                    <input type="range" id="ambientIntensity" min="0" max="1" step="0.1" value="0.2">
                </div>
                <div class="control-group">
                    <label>Background</label>
                    <input type="color" id="bgColor" value="#1e1e1e">
                </div>
                
                <div class="divider"></div>
                
                <div class="control-group">
                    <label>Navigation Mode</label>
                    <select id="navMode">
                        <option value="examine">Examine</option>
                        <option value="walk">Walk</option>
                        <option value="fly">Fly</option>
                        <option value="lookAt">LookAt</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Display Mode</label>
                    <button class="mode-btn" id="toggleWireframe">Points/Wire/Solid</button>
                </div>

                <div class="divider"></div>
                
                <div class="control-group full-width">
                    <label>Grid Resolution (Samples)</label>
                    <div style="display:flex; gap: 5px;">
                        <input type="number" id="gridRes" value="50" min="10" max="200" style="width: 60px;">
                        <button class="mode-btn" id="applyRes" style="flex:1; margin-top:0;">Apply Resolution</button>
                    </div>
                </div>
                
                <div class="divider"></div>

                <div class="control-group full-width">
                    <button class="mode-btn" id="exportPdf" style="background: #28a745;">Export to PDF & Insert Figure</button>
                </div>
                
                <div class="control-group full-width">
                    <button class="mode-btn" id="resetView">Reset Viewport</button>
                </div>
            </div>

            <div id="img-container"></div>
            <div id="analysis" class="analysis-container" style="display:none;"></div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let lastExpr = "";
                let currentSamples = 50;

                function hexToRgb(hex) {
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    return r.toFixed(2) + " " + g.toFixed(2) + " " + b.toFixed(2);
                }

                function syncX3d() {
                    const mat = document.getElementById('mainMat');
                    const bg = document.querySelector('background');
                    const nav = document.querySelector('navigationInfo');
                    
                    if (mat) {
                        mat.setAttribute('diffuseColor', hexToRgb(document.getElementById('diffuseColor').value));
                        mat.setAttribute('specularColor', hexToRgb(document.getElementById('specularColor').value));
                        mat.setAttribute('transparency', document.getElementById('transparency').value);
                        mat.setAttribute('shininess', document.getElementById('shininess').value);
                        mat.setAttribute('ambientIntensity', document.getElementById('ambientIntensity').value);
                    }
                    if (bg) {
                        bg.setAttribute('skyColor', hexToRgb(document.getElementById('bgColor').value));
                    }
                    if (nav) {
                        nav.setAttribute('type', document.getElementById('navMode').value);
                    }
                }

                function initX3dHandlers() {
                    ['diffuseColor', 'specularColor', 'transparency', 'shininess', 'ambientIntensity', 'bgColor'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.oninput = syncX3d;
                    });
                    
                    const nav = document.getElementById('navMode');
                    if (nav) nav.onchange = syncX3d;

                    const wireBtn = document.getElementById('toggleWireframe');
                    if (wireBtn) wireBtn.onclick = () => {
                        const x3d = document.getElementById('x3d_el');
                        if (x3d && x3d.runtime) x3d.runtime.togglePoints(true);
                    };

                    const resetBtn = document.getElementById('resetView');
                    if (resetBtn) resetBtn.onclick = () => {
                        const x3d = document.getElementById('x3d_el');
                        if (x3d && x3d.runtime) x3d.runtime.showAll();
                    };

                    const applyBtn = document.getElementById('applyRes');
                    if (applyBtn) applyBtn.onclick = () => {
                        currentSamples = document.getElementById('gridRes').value;
                        vscode.postMessage({
                            command: 'rerender',
                            expr: lastExpr,
                            samples: currentSamples
                        });
                    };

                    const exportBtn = document.getElementById('exportPdf');
                    if (exportBtn) exportBtn.onclick = () => {
                        vscode.postMessage({
                            command: 'exportPdf',
                            expr: lastExpr,
                            samples: currentSamples,
                            color: document.getElementById('diffuseColor').value
                        });
                    };
                }

                window.addEventListener('message', e => {
                    const { type, latex, vars, analysis, x3d_data, warning, preview_img } = e.data;
                    if (type === 'update') {
                        const out = document.getElementById('out');
                        const imgContainer = document.getElementById('img-container');
                        const previewContainer = document.getElementById('preview-container');
                        const previewImgDiv = document.getElementById('preview-img');
                        const x3dContainer = document.getElementById('x3d-container');
                        const x3dUi = document.getElementById('x3d-ui');
                        const analysisDiv = document.getElementById('analysis');
                        const warningDiv = document.getElementById('warning');
                        
                        imgContainer.innerHTML = '';
                        x3dContainer.innerHTML = '';
                        analysisDiv.innerHTML = '';
                        analysisDiv.style.display = 'none';
                        warningDiv.innerHTML = '';
                        warningDiv.style.display = 'none';
                        previewContainer.style.display = 'none';
                        previewImgDiv.innerHTML = '';
                        x3dUi.style.display = 'none';

                        if (warning) {
                            warningDiv.innerHTML = '⚠️ ' + warning;
                            warningDiv.style.display = 'block';
                        }

                        if (preview_img) {
                            previewContainer.style.display = 'block';
                            previewImgDiv.innerHTML = '<img src="' + preview_img + '" />';
                        }

                        if (x3d_data) {
                            lastExpr = x3d_data.expr;
                            out.innerHTML = '3D Interactive: ' + x3d_data.expr;
                            x3dUi.style.display = 'grid';
                            document.getElementById('gridRes').value = currentSamples;
                            
                            const [cols, rows] = x3d_data.grid_size;
                            let indices = [];
                            for (let i = 0; i < rows - 1; i++) {
                                for (let j = 0; j < cols - 1; j++) {
                                    indices.push(i*cols+j, i*cols+(j+1), (i+1)*cols+(j+1), (i+1)*cols+j, -1);
                                }
                            }

                            x3dContainer.innerHTML = \`
                                <x3d id="x3d_el" style="width: 100%; height: 450px;">
                                    <scene>
                                        <viewpoint position="0 0 15" centerOfRotation="0 0 0"></viewpoint>
                                        <background skyColor="0.12 0.12 0.12"></background>
                                        <navigationInfo type="examine"></navigationInfo>
                                        <shape>
                                            <appearance>
                                                <material id="mainMat" diffuseColor="0.1 0.6 0.8" specularColor="0.5 0.5 0.5" shininess="0.5"></material>
                                            </appearance>
                                            <IndexedFaceSet solid="false" coordIndex="\${indices.join(' ')}">
                                                <coordinate point="\${x3d_data.points.map(p => p.join(' ')).join(' ')}"></coordinate>
                                            </IndexedFaceSet>
                                        </shape>
                                    </scene>
                                </x3d>
                            \`;

                            // Force re-init of x3dom if already loaded, or wait for it
                            if (window.x3dom) {
                                window.x3dom.reload();
                                setTimeout(() => {
                                    initX3dHandlers();
                                    syncX3d();
                                }, 100);
                            }
                            return;
                        }

                        if (latex.trim().startsWith('{')) {
            </script>
        </body></html>`;
    }
}