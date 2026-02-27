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

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'rerender') {
                vscode.commands.executeCommand('tex-machina.rerenderPlot', data.expr, data.samples, data.options);
            } else if (data.command === 'exportPdf') {
                vscode.commands.executeCommand('tex-machina.export3dPlot', data.expr, data.samples, data.color, data.options);
            }
        });

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
        const x3domJs = "https://www.x3dom.org/download/1.8.3/x3dom.js";
        const x3domCss = "https://www.x3dom.org/download/1.8.3/x3dom.css";
        const csp = `default-src 'none'; img-src ${webview.cspSource} data: blob:; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.x3dom.org; style-src 'unsafe-inline' ${webview.cspSource} https://www.x3dom.org; font-src https://www.x3dom.org; connect-src https://www.x3dom.org blob:; worker-src 'self' blob:;`;

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta http-equiv="Content-Security-Policy" content="${csp}">
            <link rel="stylesheet" href="${x3domCss}">
            <script src="${x3domJs}"></script>
            <script src="${mathjaxUri}"></script>
            <style>
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
                x3d { width: 100%; height: 400px; background: #1e1e1e; }
                .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8em; margin-top: 10px; border-top: 1px solid #444; padding-top: 10px; }
                .group { display: flex; flex-direction: column; }
                input, select { background: #333; color: #eee; border: 1px solid #555; }
                .full { grid-column: 1 / span 2; }
                .tabs { display: flex; gap: 4px; margin-bottom: 5px; }
                .tab { padding: 2px 6px; cursor: pointer; background: #444; }
                .tab.active { background: #666; }
            </style>
        </head>
        <body>
            <div id="out">TeX-Machina</div>
            <div id="container"></div>
            <div id="ui" class="controls" style="display:none">
                <div class="tabs full">
                    <div class="tab active" onclick="tab('s')">Style</div>
                    <div class="tab" onclick="tab('d')">Domain</div>
                    <div class="tab" onclick="tab('l')">Labels</div>
                </div>
                <div id="s" class="full controls" style="display:grid; border:none; margin:0; padding:0">
                    <div class="group"><label>Scheme</label><select id="sch"><option value="uniform">Uniform</option><option value="height">Height</option><option value="gradient">Gradient</option></select></div>
                    <div class="group"><label>Color</label><input type="color" id="col" value="#1a99cc"></div>
                    <div class="group"><label>AA</label><select id="aa"><option value="true">On</option><option value="false">Off</option></select></div>
                    <div class="group"><label>Font</label><select id="f"><option value="SANS">Sans</option><option value="SERIF">Serif</option></select></div>
                </div>
                <div id="d" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>X</label><input id="xr" value="-5,5"></div>
                    <div class="group"><label>Y</label><input id="yr" value="-5,5"></div>
                    <div class="group"><label>Z</label><input id="zr" value="-15,15"></div>
                    <div class="group"><label>Res</label><input type="number" id="res" value="50"></div>
                </div>
                <div id="l" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>X</label><input id="xl" value="x"></div>
                    <div class="group"><label>Y</label><input id="yl" value="y"></div>
                    <div class="group"><label>Z</label><input id="zl" value="z"></div>
                </div>
                <button class="full" onclick="apply()">Apply Changes</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let last = "";
                function tab(n){
                    ['s','d','l'].forEach(t => document.getElementById(t).style.display = t===n?'grid':'none');
                    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.innerText.toLowerCase().startsWith(n)));
                }
                function apply(){
                    vscode.postMessage({
                        command: 'rerender', expr: last, samples: document.getElementById('res').value,
                        options: {
                            x: document.getElementById('xr').value, y: document.getElementById('yr').value, z: document.getElementById('zr').value,
                            scheme: document.getElementById('sch').value, color: document.getElementById('col').value,
                            label: 'x:'+document.getElementById('xl').value+',y:'+document.getElementById('yl').value+',z:'+document.getElementById('zl').value
                        }
                    });
                }
                window.addEventListener('message', e => {
                    const { type, x3d_data, latex } = e.data;
                    if (type === 'update' && x3d_data) {
                        last = x3d_data.expr;
                        document.getElementById('ui').style.display = 'grid';
                        const idx = [];
                        const [c, r] = x3d_data.grid_size;
                        for(let i=0; i<r-1; i++) for(let j=0; j<c-1; j++) idx.push(i*c+j, i*c+j+1, (i+1)*c+j+1, (i+1)*c+j, -1);
                        const aa = document.getElementById('aa').value;
                        const f = document.getElementById('f').value;
                        document.getElementById('container').innerHTML = \`
                            <x3d id="x" antialiasing="\${aa}" style="width:100%; height:400px">
                                <scene>
                                    <viewpoint position="0 15 15" orientation="1 0 0 -0.785"></viewpoint>
                                    <background skyColor="0.1 0.1 0.1"></background>
                                    <transform translation="0 \${x3d_data.ranges.y[1]+1} 0"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"\${x3d_data.labels.y}"'><fontstyle family='"\${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                                    <transform translation="\${x3d_data.ranges.x[1]+1} 0 0" rotation="0 0 1 -1.57"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"\${x3d_data.labels.x}"'><fontstyle family='"\${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                                    <transform rotation="1 0 0 -1.57">
                                        <shape>
                                            <appearance><material></material></appearance>
                                            <IndexedFaceSet solid="false" colorPerVertex="true" coordIndex="\${idx.join(' ')}">
                                                <coordinate point="\${x3d_data.points.map(p=>p.join(' ')).join(' ')}"></coordinate>
                                                <color color="\${x3d_data.colors.map(c=>c.join(' ')).join(' ')}"></color>
                                            </IndexedFaceSet>
                                        </shape>
                                    </transform>
                                </scene>
                            </x3d>\`;
                        if(window.x3dom) window.x3dom.reload();
                    } else if (type === 'update' && latex) {
                        document.getElementById('out').innerHTML = latex;
                        if(window.MathJax) MathJax.typesetPromise();
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
