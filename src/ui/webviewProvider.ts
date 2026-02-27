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
            } else if (data.command === 'saveImage') {
                const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                vscode.commands.executeCommand('tex-machina.internalSaveWebviewImage', buffer, data.format, data.expr);
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
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; font-size: 13px; }
                x3d { width: 100%; height: 400px; border: 1px solid #444; background: #000; }
                .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; border-top: 1px solid #444; padding-top: 10px; }
                .group { display: flex; flex-direction: column; }
                label { font-weight: bold; margin-bottom: 2px; font-size: 0.9em; }
                input, select { background: #333; color: #eee; border: 1px solid #555; padding: 2px; }
                .full { grid-column: 1 / span 2; }
                .tabs { display: flex; gap: 4px; margin-bottom: 5px; }
                .tab { padding: 4px 8px; cursor: pointer; background: #333; border: 1px solid #444; border-bottom: none; }
                .tab.active { background: #555; font-weight: bold; }
                .btn-row { display: flex; gap: 4px; margin-top: 5px; }
                button { background: #007acc; color: white; border: none; padding: 6px; cursor: pointer; flex: 1; }
                button:hover { background: #0062a3; }
                button.secondary { background: #555; }
                input[type="range"] { width: 100%; margin: 4px 0; }
            </style>
        </head>
        <body>
            <div id="out">TeX-Machina</div>
            <div id="container"></div>
            <div id="ui" class="controls" style="display:none">
                <div class="tabs full">
                    <div class="tab active" onclick="tab('s')">Style</div>
                    <div class="tab" onclick="tab('v')">View</div>
                    <div class="tab" onclick="tab('d')">Domain</div>
                    <div class="tab" onclick="tab('l')">Axes</div>
                    <div class="tab" onclick="tab('light-tab')">Light</div>
                    <div class="tab" onclick="tab('c')">Complex</div>
                </div>
                <div id="s" class="full controls" style="display:grid; border:none; margin:0; padding:0">
                    <div class="group"><label>Scheme</label><select id="sch" onchange="toggleScheme()">
                        <option value="uniform">Uniform</option>
                        <option value="height">Height</option>
                        <option value="gradient">Gradient</option>
                        <option value="preset">Preset</option>
                        <option value="custom">Custom stops</option>
                    </select></div>
                    <div class="group" id="col-grp"><label>Color</label><input type="color" id="col" value="#1a99cc"></div>
                    <div class="group" id="grad-grp" style="display:none">
                        <label>Start</label><input type="color" id="col-s" value="#0000ff">
                        <label>End</label><input type="color" id="col-e" value="#ff0000">
                    </div>
                    <div class="group" id="preset-grp" style="display:none"><label>Preset</label><select id="preset">
                        <option value="viridis">Viridis</option><option value="magma">Magma</option><option value="plasma">Plasma</option><option value="inferno">Inferno</option><option value="jet">Jet</option><option value="coolwarm">CoolWarm</option><option value="mathematica">Mathematica (Z-Blend)</option><option value="Spectral">Spectral</option><option value="cool">Cool</option><option value="hot">Hot</option><option value="terrain">Terrain</option>
                    </select></div>
                    <div class="group" id="stops-grp" style="display:none"><label>Stops (pos:hex,...)</label><input id="stops" value="0:#0000ff,0.5:#00ff00,1:#ff0000"></div>
                    <div class="group"><label>Background</label><input type="color" id="bg" value="#ffffff"></div>
                    <div class="group"><label>Antialiasing</label><select id="aa"><option value="true">On</option><option value="false">Off</option></select></div>
                </div>
                <div id="v" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>Projection</label><select id="proj" onchange="updateViewpoint()">
                        <option value="perspective">Perspective</option>
                        <option value="ortho">Orthographic</option>
                    </select></div>
                    <div class="group"><label>Standard Views</label>
                        <div class="btn-row">
                            <button class="secondary" onclick="setView('iso')">Iso</button>
                            <button class="secondary" onclick="setView('top')">Top</button>
                            <button class="secondary" onclick="setView('front')">Front</button>
                            <button class="secondary" onclick="setView('side')">Side</button>
                        </div>
                    </div>
                    <div class="group full" style="border: 1px solid #444; padding: 5px; margin-top: 5px;">
                        <label>Rotation & Zoom</label>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top:5px">
                            <label style="width: 40px;">Elev</label>
                            <input type="range" id="rot-elev" min="-90" max="90" value="30" oninput="updateFromSliders()">
                            <span id="val-elev" style="width: 30px;">30</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="width: 40px;">Azim</label>
                            <input type="range" id="rot-azim" min="-180" max="180" value="45" oninput="updateFromSliders()">
                            <span id="val-azim" style="width: 30px;">45</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label style="width: 40px;">Zoom</label>
                            <input type="range" id="zoom" min="5" max="150" value="30" oninput="updateFromSliders()">
                            <span id="val-zoom" style="width: 30px;">30</span>
                        </div>
                        <div class="btn-row" style="margin-top:5px">
                            <button class="secondary" onclick="alignZ()">Align Z Axis</button>
                        </div>
                    </div>
                    <div class="group full"><label><input type="checkbox" id="textbook-mode" onchange="toggleTextbook()"> Textbook Mode (Clean White + Ortho + Iso)</label></div>
                </div>
                <div id="light-tab" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>Ambient Intensity</label><input type="range" id="amb-int" min="0" max="1" step="0.05" value="0.3" oninput="updateLights()"></div>
                    <div class="group"><label>Direct Intensity</label><input type="range" id="dir-int" min="0" max="2" step="0.1" value="1.0" oninput="updateLights()"></div>
                    <div class="group"><label>Shadow Intensity</label><input type="range" id="shd-int" min="0" max="1" step="0.1" value="0.0" oninput="updateLights()"></div>
                    <div class="group"><label>Light Position</label><select id="light-pos" onchange="updateLights()">
                        <option value="top">Top Right</option>
                        <option value="front">Front</option>
                        <option value="left">Left High</option>
                    </select></div>
                    <div class="group full"><label><input type="checkbox" id="headlight" checked onchange="updateLights()"> Headlight (Camera follow)</label></div>
                </div>
                <div id="d" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>X Range</label><input id="xr" value="-5,5"></div>
                    <div class="group"><label>Y Range</label><input id="yr" value="-5,5"></div>
                    <div class="group"><label>Z Range</label><input id="zr" value="-15,15"></div>
                    <div class="group"><label>Res</label><input type="number" id="res" value="50"></div>
                </div>
                <div id="l" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group"><label>X Label</label><input id="xl" value="x"></div>
                    <div class="group"><label>Y Label</label><input id="yl" value="y"></div>
                    <div class="group"><label>Z Label</label><input id="zl" value="z"></div>
                    <div class="group"><label>Axis Style</label><select id="ax-style">
                        <option value="cross">Cross (Origin)</option>
                        <option value="box">Box (Bounds)</option>
                        <option value="arrows">Arrows</option>
                        <option value="none">None</option>
                    </select></div>
                    <div class="group"><label>Font</label><select id="f"><option value="SANS">Sans</option><option value="SERIF">Serif</option><option value="TYPEWRITER">Typewriter</option></select></div>
                    <div class="group full"><label><input type="checkbox" id="show-axes" checked> Show Axes Lines</label></div>
                </div>
                <div id="c" class="full controls" style="display:none; border:none; margin:0; padding:0">
                    <div class="group full"><label>Complex Mapping (Height | Color)</label><select id="cm">
                        <option value="abs_phase">Abs | Phase</option>
                        <option value="real_imag">Real | Imag</option>
                        <option value="imag_real">Imag | Real</option>
                        <option value="abs_abs">Abs | Abs</option>
                    </select></div>
                </div>
                <div class="btn-row full">
                    <button class="secondary" onclick="fitView()">Fit View (Center Graph)</button>
                    <button onclick="apply()">Apply Changes</button>
                </div>
                <div class="controls full" style="grid-template-columns: 1fr 1fr 1fr; border: 1px solid #444; padding: 5px; margin-top: 5px;">
                    <div class="group"><label>Preset</label><select id="exp-preset" onchange="setExportPreset()">
                        <option value="custom">Custom</option>
                        <option value="square">Square (1000)</option>
                        <option value="hd">HD (1280x720)</option>
                        <option value="fhd">FHD (1920x1080)</option>
                        <option value="a4">A4 (2480x1754)</option>
                    </select></div>
                    <div class="group"><label>Width</label><input type="number" id="exp-w" value="800"></div>
                    <div class="group"><label>Height</label><input type="number" id="exp-h" value="600"></div>
                    <div class="group full"><label><input type="checkbox" id="exp-smart" checked> Smart Crop (Remove empty space)</label></div>
                </div>
                <div class="btn-row full">
                    <button class="secondary" onclick="exportPlot()">Capture Image</button>
                    <select id="exp-fmt" style="width:70px; flex:none"><option value="png">PNG</option><option value="jpg">JPG</option></select>
                </div>
                <div class="btn-row full">
                    <button class="secondary" onclick="hqExport()">HQ Export (Matplotlib PDF)</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let last = "";
                
                function hqExport(){
                    vscode.postMessage({
                        command: 'exportPdf', expr: last, samples: document.getElementById('res').value,
                        color: document.getElementById('col').value,
                        options: { ...getOptions(), export: 'pdf' }
                    });
                }
                function tab(n){
                    ['s','v','d','l','c','light-tab'].forEach(t => document.getElementById(t).style.display = t===n?'grid':'none');
                    document.querySelectorAll('.tab').forEach(t => {
                        const onclick = t.getAttribute('onclick');
                        t.classList.toggle('active', onclick && onclick.includes("'"+n+"'"));
                    });
                }

                function alignZ() {
                    // Set elevation to 0 if it was negative, or maintain if positive
                    // Azimuth is kept. This makes the Z axis (scene Y) look "up"
                    updateFromSliders();
                }

                function updateFromSliders() {
                    const elev = parseFloat(document.getElementById('rot-elev').value);
                    const azim = parseFloat(document.getElementById('rot-azim').value);
                    const zoom = parseFloat(document.getElementById('zoom').value);
                    
                    document.getElementById('val-elev').innerText = elev;
                    document.getElementById('val-azim').innerText = azim;
                    document.getElementById('val-zoom').innerText = zoom;
                    
                    const e = elev * Math.PI / 180;
                    const a = azim * Math.PI / 180;
                    
                    // Calculate position on a sphere centered at (0,0,0)
                    const x = zoom * Math.cos(e) * Math.sin(a);
                    const y = zoom * Math.sin(e);
                    const z = zoom * Math.cos(e) * Math.cos(a);
                    
                    const vp = document.getElementById('vp');
                    if (!vp) return;
                    
                    vp.setAttribute('position', \`\${x} \${y} \${z}\`);
                    
                    // Calculate orientation (axis-angle) to look at origin with Y-up
                    // We rotate by Azim around Y, then by Elev around LOCAL X.
                    const s_a = Math.sin(a/2), c_a = Math.cos(a/2);
                    const s_e = Math.sin(-e/2), c_e = Math.cos(-e/2);
                    
                    // Quaternion multiplication for Y-rotation then X-rotation
                    const qx = c_a * s_e;
                    const qy = s_a * c_e;
                    const qz = -s_a * s_e;
                    const qw = c_a * c_e;
                    
                    const angle = 2 * Math.acos(qw);
                    const s = Math.sqrt(1 - qw * qw);
                    let axisX, axisY, axisZ;
                    if (s < 0.001) {
                        axisX = 1; axisY = 0; axisZ = 0;
                    } else {
                        axisX = qx / s; axisY = qy / s; axisZ = qz / s;
                    }
                    
                    vp.setAttribute('orientation', \`\${axisX} \${axisY} \${axisZ} \${angle}\`);
                    
                    // Handle Zoom for OrthoViewpoint via fieldOfView
                    if (vp.tagName.toLowerCase() === 'orthoviewpoint') {
                        const aspect = 1.0; 
                        const size = zoom * 0.4; // Scale zoom for ortho view
                        vp.setAttribute('fieldOfView', \`\${-size} \${-size} \${size} \${size}\`);
                    }
                    vp.setAttribute('set_bind', 'true');
                }

                function setView(type) {
                    if (type === 'iso') {
                        document.getElementById('rot-elev').value = 30;
                        document.getElementById('rot-azim').value = 45;
                        document.getElementById('zoom').value = 28;
                    } else if (type === 'top') {
                        document.getElementById('rot-elev').value = 89; // Avoid gimbal lock at 90
                        document.getElementById('rot-azim').value = 0;
                        document.getElementById('zoom').value = 28;
                    } else if (type === 'front') {
                        document.getElementById('rot-elev').value = 0;
                        document.getElementById('rot-azim').value = 0;
                        document.getElementById('zoom').value = 28;
                    } else if (type === 'side') {
                        document.getElementById('rot-elev').value = 0;
                        document.getElementById('rot-azim').value = 90;
                        document.getElementById('zoom').value = 28;
                    }
                    updateFromSliders();
                }

                function updateLights() {
                    const amb = document.getElementById('amb-int').value;
                    const dir = document.getElementById('dir-int').value;
                    const shd = document.getElementById('shd-int').value;
                    const pos = document.getElementById('light-pos').value;
                    const head = document.getElementById('headlight').checked;

                    const dl = document.getElementById('dir-light');
                    const al = document.getElementById('amb-light');
                    const ni = document.getElementById('nav-info');

                    if (dl) {
                        dl.setAttribute('intensity', dir);
                        dl.setAttribute('shadowIntensity', shd);
                        if (pos === 'top') dl.setAttribute('direction', '-1 -1 -1');
                        else if (pos === 'front') dl.setAttribute('direction', '0 0 -1');
                        else if (pos === 'left') dl.setAttribute('direction', '1 -1 -0.5');
                    }
                    if (al) al.setAttribute('intensity', amb);
                    if (ni) ni.setAttribute('headlight', head ? 'true' : 'false');
                }

                function updateViewpoint() {
                    const isOrtho = document.getElementById('proj').value === 'ortho';
                    const x3d = document.getElementById('x');
                    if (!x3d) return;
                    
                    const scene = x3d.querySelector('scene');
                    let vp = document.getElementById('vp');
                    if (vp) vp.parentNode.removeChild(vp);
                    
                    const newVp = document.createElement(isOrtho ? 'OrthoViewpoint' : 'Viewpoint');
                    newVp.setAttribute('id', 'vp');
                    scene.insertBefore(newVp, scene.firstChild);
                    
                    if (window.x3dom) {
                        window.x3dom.reload();
                        setTimeout(updateFromSliders, 200);
                    }
                }

                function toggleTextbook() {
                    const active = document.getElementById('textbook-mode').checked;
                    if (active) {
                        document.getElementById('bg').value = "#ffffff";
                        document.getElementById('proj').value = "ortho";
                        document.getElementById('aa').value = "true";
                        document.getElementById('ax-style').value = "box";
                        document.getElementById('f').value = "SERIF";
                        // Optimized light for white background
                        document.getElementById('amb-int').value = "0.6";
                        document.getElementById('dir-int').value = "0.8";
                        document.getElementById('shd-int').value = "0.15";
                        document.getElementById('headlight').checked = true;
                        updateViewpoint();
                        updateLights();
                        setView('iso');
                    }
                }
                function toggleScheme(){
                    const s = document.getElementById('sch').value;
                    document.getElementById('col-grp').style.display = (s==='uniform')?'flex':'none';
                    document.getElementById('grad-grp').style.display = (s==='height' || s==='gradient')?'flex':'none';
                    document.getElementById('preset-grp').style.display = (s==='preset')?'flex':'none';
                    document.getElementById('stops-grp').style.display = (s==='custom')?'flex':'none';
                }
                function getOptions(){
                    const s = document.getElementById('sch').value;
                    let stops = document.getElementById('stops').value;
                    if(s === 'height' || s === 'gradient') {
                        stops = '0:' + document.getElementById('col-s').value + ',1:' + document.getElementById('col-e').value;
                    }
                    return {
                        x: document.getElementById('xr').value, y: document.getElementById('yr').value, z: document.getElementById('zr').value,
                        scheme: s, color: document.getElementById('col').value,
                        bg: document.getElementById('bg').value, preset: document.getElementById('preset').value,
                        stops: stops, complex: document.getElementById('cm').value,
                        axis: document.getElementById('ax-style').value,
                        label: 'x:'+document.getElementById('xl').value+',y:'+document.getElementById('yl').value+',z:'+document.getElementById('zl').value+',font:'+document.getElementById('f').value
                    };
                }
                function apply(){
                    vscode.postMessage({
                        command: 'rerender', expr: last, samples: document.getElementById('res').value,
                        options: getOptions()
                    });
                }
                function fitView(){
                    const x3d = document.getElementById('x');
                    if (x3d && x3d.runtime) x3d.runtime.showAll();
                }
                function autoCrop(imgData, bgColor, format, callback) {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;
                        const r_bg = parseInt(bgColor.slice(1, 3), 16);
                        const g_bg = parseInt(bgColor.slice(3, 5), 16);
                        const b_bg = parseInt(bgColor.slice(5, 7), 16);
                        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
                        let found = false;
                        for (let y = 0; y < canvas.height; y++) {
                            for (let x = 0; x < canvas.width; x++) {
                                const i = (y * canvas.width + x) * 4;
                                const diff = Math.abs(data[i] - r_bg) + Math.abs(data[i+1] - g_bg) + Math.abs(data[i+2] - b_bg);
                                if (diff > 15) {
                                    if (x < minX) minX = x;
                                    if (x > maxX) maxX = x;
                                    if (y < minY) minY = y;
                                    if (y > maxY) maxY = y;
                                    found = true;
                                }
                            }
                        }
                        if (!found) { callback(imgData); return; }
                        const pad = 10;
                        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
                        maxX = Math.min(canvas.width, maxX + pad); maxY = Math.min(canvas.height, maxY + pad);
                        const cropW = maxX - minX; const cropH = maxY - minY;
                        const croppedCanvas = document.createElement('canvas');
                        croppedCanvas.width = cropW; croppedCanvas.height = cropH;
                        croppedCanvas.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
                        callback(croppedCanvas.toDataURL('image/' + format));
                    };
                    img.src = imgData;
                }
                function setExportPreset(){
                    const p = document.getElementById('exp-preset').value;
                    const w = document.getElementById('exp-w');
                    const h = document.getElementById('exp-h');
                    if(p === 'square') { w.value = 1000; h.value = 1000; }
                    else if(p === 'hd') { w.value = 1280; h.value = 720; }
                    else if(p === 'fhd') { w.value = 1920; h.value = 1080; }
                    else if(p === 'a4') { w.value = 2480; h.value = 1754; }
                }
                function exportPlot(){
                    const x3d = document.getElementById('x');
                    if (!x3d || !x3d.runtime) return;
                    
                    const isTextbook = document.getElementById('textbook-mode').checked;
                    const w = parseInt(document.getElementById('exp-w').value) || 800;
                    const h = parseInt(document.getElementById('exp-h').value) || 600;
                    const fmt = document.getElementById('exp-fmt').value;
                    const isSmart = document.getElementById('exp-smart').checked;
                    const bgColor = isTextbook ? "#ffffff" : document.getElementById('bg').value;
                    
                    const originalWidth = x3d.style.width;
                    const originalHeight = x3d.style.height;
                    const originalAA = x3d.getAttribute('antialiasing');
                    
                    x3d.style.width = w + 'px';
                    x3d.style.height = h + 'px';
                    x3d.setAttribute('antialiasing', 'true');
                    
                    if (isTextbook) {
                        document.getElementById('bg').value = "#ffffff";
                        document.getElementById('proj').value = "ortho";
                        updateViewpoint();
                        setView('iso');
                    }

                    setTimeout(() => {
                        const rawData = x3d.runtime.getScreenshot();
                        x3d.style.width = originalWidth;
                        x3d.style.height = originalHeight;
                        x3d.setAttribute('antialiasing', originalAA);
                        
                        if (isSmart) {
                            autoCrop(rawData, bgColor, fmt, (croppedData) => {
                                vscode.postMessage({ command: 'saveImage', imageData: croppedData, format: fmt, expr: last });
                            });
                        } else {
                            vscode.postMessage({ command: 'saveImage', imageData: rawData, format: fmt, expr: last });
                        }
                    }, 500);
                }
                function hexToRgb(hex) {
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    return r + " " + g + " " + b;
                }
                window.addEventListener('message', e => {
                    const { type, x3d_data, latex } = e.data;
                    if (type === 'update' && x3d_data) {
                        last = x3d_data.expr;
                        document.getElementById('ui').style.display = 'grid';
                        const [c, r] = x3d_data.grid_size;
                        const rx = x3d_data.ranges.x, ry = x3d_data.ranges.y, rz = x3d_data.ranges.z;
                        
                        document.getElementById('res').value = c;
                        document.getElementById('xr').value = rx.join(',');
                        document.getElementById('yr').value = ry.join(',');
                        document.getElementById('zr').value = rz.join(',');
                        
                        if (x3d_data.bg_color) document.getElementById('bg').value = x3d_data.bg_color;
                        if (x3d_data.axis_style) document.getElementById('ax-style').value = x3d_data.axis_style;
                        
                        if (x3d_data.color_scheme) {
                            document.getElementById('sch').value = x3d_data.color_scheme;
                            toggleScheme();
                        }
                        if (x3d_data.preset_name) document.getElementById('preset').value = x3d_data.preset_name;
                        if (x3d_data.complex_mode) document.getElementById('cm').value = x3d_data.complex_mode;

                        if (x3d_data.labels) {
                            if (x3d_data.labels.x) document.getElementById('xl').value = x3d_data.labels.x;
                            if (x3d_data.labels.y) document.getElementById('yl').value = x3d_data.labels.y;
                            if (x3d_data.labels.z) document.getElementById('zl').value = x3d_data.labels.z;
                        }

                        const idx = [];
                        for(let i=0; i<r-1; i++) for(let j=0; j<c-1; j++) idx.push(i*c+j, i*c+j+1, (i+1)*c+j+1, (i+1)*c+j, -1);
                        
                        const aa = document.getElementById('aa').value;
                        const f = x3d_data.labels.font || "SANS";
                        const showAxes = document.getElementById('show-axes').checked;
                        const axStyle = x3d_data.axis_style || "cross";
                        const skyCol = hexToRgb(x3d_data.bg_color || "#ffffff");
                        
                        const ambInt = document.getElementById('amb-int').value;
                        const dirInt = document.getElementById('dir-int').value;
                        const shdInt = document.getElementById('shd-int').value;
                        const head = document.getElementById('headlight').checked ? 'true' : 'false';

                        let axesXml = "";
                        if(showAxes && axStyle !== 'none'){
                            if(axStyle === 'cross' || axStyle === 'arrows'){
                                axesXml = \`
                                    <transform>
                                        <shape>
                                            <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="1 0 0"></material></appearance>
                                            <indexedlineset coordIndex="0 1 -1"><coordinate point="\${rx[0]} 0 0 \${rx[1]} 0 0"></coordinate></indexedlineset>
                                        </shape>
                                        <shape>
                                            <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="0 1 0"></material></appearance>
                                            <indexedlineset coordIndex="0 1 -1"><coordinate point="0 \${ry[0]} 0 0 \${ry[1]} 0"></coordinate></indexedlineset>
                                        </shape>
                                        <shape>
                                            <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="0 0 1"></material></appearance>
                                            <indexedlineset coordIndex="0 1 -1"><coordinate point="0 0 \${rz[0]} 0 0 \${rz[1]}"></coordinate></indexedlineset>
                                        </shape>
                                    </transform>\`;
                                if(axStyle === 'arrows'){
                                    axesXml += \`
                                        <transform translation="\${rx[1]} 0 0" rotation="0 0 1 -1.57"><shape><appearance><material diffuseColor="1 0 0"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>
                                        <transform translation="0 \${ry[1]} 0"><shape><appearance><material diffuseColor="0 1 0"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>
                                        <transform translation="0 0 \${rz[1]}" rotation="1 0 0 1.57"><shape><appearance><material diffuseColor="0 0 1"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>\`;
                                }
                            } else if(axStyle === 'box'){
                                axesXml = \`
                                    <transform>
                                        <shape>
                                            <appearance><lineproperties linewidth="1"></lineproperties><material emissiveColor="0.6 0.6 0.6"></material></appearance>
                                            <indexedlineset coordIndex="0 1 2 3 0 -1 4 5 6 7 4 -1 0 4 -1 1 5 -1 2 6 -1 3 7 -1">
                                                <coordinate point="\${rx[0]} \${ry[0]} \${rz[0]} \${rx[1]} \${ry[0]} \${rz[0]} \${rx[1]} \${ry[1]} \${rz[0]} \${rx[0]} \${ry[1]} \${rz[0]} \${rx[0]} \${ry[0]} \${rz[1]} \${rx[1]} \${ry[0]} \${rz[1]} \${rx[1]} \${ry[1]} \${rz[1]} \${rx[0]} \${ry[1]} \${rz[1]}"></coordinate>
                                            </indexedlineset>
                                        </shape>
                                    </transform>\`;
                            }
                        }

                        document.getElementById('container').innerHTML = \`
                            <x3d id="x" antialiasing="\${aa}" style="width:100%; height:400px">
                                <scene>
                                    <navigationInfo id="nav-info" headlight="\${head}"></navigationInfo>
                                    <directionalLight id="dir-light" direction="-1 -1 -1" intensity="\${dirInt}" shadowIntensity="\${shdInt}" shadowMapSize="1024"></directionalLight>
                                    <ambientLight id="amb-light" intensity="\${ambInt}"></ambientLight>
                                    <\${(document.getElementById('proj').value === 'ortho' ? 'OrthoViewpoint' : 'Viewpoint')} id="vp" position="0 15 15" orientation="1 0 0 -0.785" \${(document.getElementById('proj').value === 'ortho' ? 'fieldOfView="-5 -5 5 5"' : '')}></\${(document.getElementById('proj').value === 'ortho' ? 'OrthoViewpoint' : 'Viewpoint')}>
                                    <background skyColor="\${skyCol}"></background>
                                    \${axesXml}
                                    <transform translation="0 \${ry[1]+1} 0"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"\${x3d_data.labels.y}"'><fontstyle family='"\${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                                    <transform translation="\${rx[1]+1} 0 0" rotation="0 0 1 -1.57"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"\${x3d_data.labels.x}"'><fontstyle family='"\${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                                    <transform translation="0 \${rz[1]+1}" rotation="0 1 0 1.57"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"\${x3d_data.labels.z}"'><fontstyle family='"\${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                                    <transform rotation="1 0 0 -1.57">
                                        <ClipPlane plane="0 0 -1 \${rz[1]}" enabled="true"></ClipPlane>
                                        <ClipPlane plane="0 0 1 \${-rz[0]}" enabled="true"></ClipPlane>
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
                        if(window.x3dom) {
                            window.x3dom.reload();
                            setTimeout(updateFromSliders, 200);
                        }
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
