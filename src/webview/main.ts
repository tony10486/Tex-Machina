import './style.css';

declare const acquireVsCodeApi: any;
declare const MathJax: any;
declare const x3dom: any;
declare const vis: any;

const vscode = acquireVsCodeApi();
let last = "";
let labelNetwork: any;
let visNodes = new vis.DataSet([]);
let visEdges = new vis.DataSet([]);

// --- Table Wizard Logic ---
const gridContainer = document.getElementById('table-grid-container');
const sizeInfo = document.getElementById('table-size-info');
const rowsInput = document.getElementById('tbl-rows') as HTMLInputElement;
const colsInput = document.getElementById('tbl-cols') as HTMLInputElement;

function updateGridSelection(maxR: number, maxC: number) {
    if (sizeInfo) {sizeInfo.innerText = `Size: ${maxR} x ${maxC}`;}
    const cells = gridContainer?.querySelectorAll('div');
    cells?.forEach(cell => {
        const r = parseInt((cell as HTMLElement).dataset.r || "0");
        const c = parseInt((cell as HTMLElement).dataset.c || "0");
        if (r <= maxR && c <= maxC) {
            (cell as HTMLElement).style.backgroundColor = '#007acc';
        } else {
            (cell as HTMLElement).style.backgroundColor = 'transparent';
        }
    });
}

function initGrid() {
    if (!gridContainer) {return;}
    for (let r = 1; r <= 10; r++) {
        for (let c = 1; c <= 10; c++) {
            const cell = document.createElement('div');
            cell.style.width = '20px';
            cell.style.height = '20px';
            cell.style.border = '1px solid #555';
            cell.style.cursor = 'pointer';
            cell.dataset.r = r.toString();
            cell.dataset.c = c.toString();
            
            cell.onmouseover = () => updateGridSelection(r, c);
            cell.onclick = () => {
                if (rowsInput) {rowsInput.value = r.toString();}
                if (colsInput) {colsInput.value = c.toString();}
            };
            gridContainer.appendChild(cell);
        }
    }
    updateGridSelection(0, 0);

    gridContainer.onmouseleave = () => {
        const r = parseInt(rowsInput?.value || "0") || 0;
        const c = parseInt(colsInput?.value || "0") || 0;
        updateGridSelection(r, c);
    };
}

initGrid();

// --- Export Functions ---
(window as any).discoverLabels = function() {
    vscode.postMessage({ command: 'discoverLabels' });
};

(window as any).hqExport = function() {
    const resInput = document.getElementById('res') as HTMLInputElement;
    const colInput = document.getElementById('col') as HTMLInputElement;
    vscode.postMessage({
        command: 'exportPdf', 
        expr: last, 
        samples: resInput?.value,
        color: colInput?.value,
        options: { ...getOptions(), export: 'pdf' }
    });
};

(window as any).insertTable = function() {
    const alignmentSelect = document.getElementById('tbl-align') as HTMLSelectElement;
    const borderCheck = document.getElementById('tbl-border') as HTMLInputElement;
    const headerCheck = document.getElementById('tbl-header') as HTMLInputElement;

    vscode.postMessage({
        command: 'insertTable',
        options: { 
            rows: parseInt(rowsInput?.value || "3"), 
            cols: parseInt(colsInput?.value || "3"), 
            alignment: alignmentSelect?.value, 
            hasBorders: borderCheck?.checked, 
            hasHeader: headerCheck?.checked 
        }
    });
};

// --- Macro Logic ---
(window as any).addMacro = function() {
    const nameInput = document.getElementById('new-macro-name') as HTMLInputElement;
    const chainInput = document.getElementById('new-macro-chain') as HTMLInputElement;
    const name = nameInput?.value;
    const chain = chainInput?.value;
    if (name && chain) {
        vscode.postMessage({ command: 'defineMacro', name, chain });
        if (nameInput) {nameInput.value = '';}
        if (chainInput) {chainInput.value = '';}
    }
};

(window as any).deleteMacro = function(name: string) {
    vscode.postMessage({ command: 'deleteMacro', name });
};

(window as any).applyMacro = function(name: string) {
    vscode.postMessage({ command: 'applyMacro', name });
};

(window as any).editMacro = function(name: string, chain: string) {
    const nameInput = document.getElementById('new-macro-name') as HTMLInputElement;
    const chainInput = document.getElementById('new-macro-chain') as HTMLInputElement;
    if (nameInput) {nameInput.value = name;}
    if (chainInput) {chainInput.value = chain;}
};

// --- Plot View Logic ---
(window as any).alignZ = function() {
    updateFromSliders();
};

function updateFromSliders() {
    const rotElevInput = document.getElementById('rot-elev') as HTMLInputElement;
    const rotAzimInput = document.getElementById('rot-azim') as HTMLInputElement;
    const zoomInput = document.getElementById('zoom') as HTMLInputElement;
    
    const elev = parseFloat(rotElevInput?.value || "30");
    const azim = parseFloat(rotAzimInput?.value || "45");
    const zoom = parseFloat(zoomInput?.value || "30");
    
    const valElev = document.getElementById('val-elev');
    const valAzim = document.getElementById('val-azim');
    const valZoom = document.getElementById('val-zoom');
    
    if (valElev) {valElev.innerText = elev.toString();}
    if (valAzim) {valAzim.innerText = azim.toString();}
    if (valZoom) {valZoom.innerText = zoom.toString();}
    
    const e = elev * Math.PI / 180;
    const a = azim * Math.PI / 180;
    
    const x = zoom * Math.cos(e) * Math.sin(a);
    const y = zoom * Math.sin(e);
    const z = zoom * Math.cos(e) * Math.cos(a);
    
    const vp = document.getElementById('vp');
    if (!vp) {return;}
    
    vp.setAttribute('position', `${x} ${y} ${z}`);
    
    const s_a = Math.sin(a/2), c_a = Math.cos(a/2);
    const s_e = Math.sin(-e/2), c_e = Math.cos(-e/2);
    
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
    
    vp.setAttribute('orientation', `${axisX} ${axisY} ${axisZ} ${angle}`);
    
    if (vp.tagName.toLowerCase() === 'orthoviewpoint') {
        const size = zoom * 0.4;
        vp.setAttribute('fieldOfView', `${-size} ${-size} ${size} ${size}`);
    }
    vp.setAttribute('set_bind', 'true');
}

(window as any).updateFromSliders = updateFromSliders;

(window as any).setView = function(type: string) {
    const rotElev = document.getElementById('rot-elev') as HTMLInputElement;
    const rotAzim = document.getElementById('rot-azim') as HTMLInputElement;
    const zoom = document.getElementById('zoom') as HTMLInputElement;

    if (type === 'iso') {
        if (rotElev) {rotElev.value = "30";}
        if (rotAzim) {rotAzim.value = "45";}
        if (zoom) {zoom.value = "28";}
    } else if (type === 'top') {
        if (rotElev) {rotElev.value = "89";}
        if (rotAzim) {rotAzim.value = "0";}
        if (zoom) {zoom.value = "28";}
    } else if (type === 'front') {
        if (rotElev) {rotElev.value = "0";}
        if (rotAzim) {rotAzim.value = "0";}
        if (zoom) {zoom.value = "28";}
    } else if (type === 'side') {
        if (rotElev) {rotElev.value = "0";}
        if (rotAzim) {rotAzim.value = "90";}
        if (zoom) {zoom.value = "28";}
    }
    updateFromSliders();
};

(window as any).updateLights = function() {
    const ambInput = document.getElementById('amb-int') as HTMLInputElement;
    const dirInput = document.getElementById('dir-int') as HTMLInputElement;
    const shdInput = document.getElementById('shd-int') as HTMLInputElement;
    const posSelect = document.getElementById('light-pos') as HTMLSelectElement;
    const headCheck = document.getElementById('headlight') as HTMLInputElement;

    const amb = ambInput?.value;
    const dir = dirInput?.value;
    const shd = shdInput?.value;
    const pos = posSelect?.value;
    const head = headCheck?.checked;

    const dl = document.getElementById('dir-light');
    const al = document.getElementById('amb-light');
    const ni = document.getElementById('nav-info');

    if (dl) {
        dl.setAttribute('intensity', dir);
        dl.setAttribute('shadowIntensity', shd);
        if (pos === 'top') {dl.setAttribute('direction', '-1 -1 -1');}
        else if (pos === 'front') {dl.setAttribute('direction', '0 0 -1');}
        else if (pos === 'left') {dl.setAttribute('direction', '1 -1 -0.5');}
    }
    if (al) {al.setAttribute('intensity', amb);}
    if (ni) {ni.setAttribute('headlight', head ? 'true' : 'false');}
};

(window as any).updateViewpoint = function() {
    const projSelect = document.getElementById('proj') as HTMLSelectElement;
    const isOrtho = projSelect?.value === 'ortho';
    const x3d = document.getElementById('x');
    if (!x3d) {return;}
    
    const scene = x3d.querySelector('scene');
    let vp = document.getElementById('vp');
    if (vp) {vp.parentNode?.removeChild(vp);}
    
    const newVp = document.createElement(isOrtho ? 'OrthoViewpoint' : 'Viewpoint');
    newVp.setAttribute('id', 'vp');
    scene?.insertBefore(newVp, scene.firstChild);
    
    if ((window as any).x3dom) {
        (window as any).x3dom.reload();
        setTimeout(updateFromSliders, 200);
    }
};

(window as any).toggleTextbook = function() {
    const textbookCheck = document.getElementById('textbook-mode') as HTMLInputElement;
    const active = textbookCheck?.checked;
    if (active) {
        (document.getElementById('bg') as HTMLInputElement).value = "#ffffff";
        (document.getElementById('proj') as HTMLSelectElement).value = "ortho";
        (document.getElementById('aa') as HTMLSelectElement).value = "true";
        (document.getElementById('ax-style') as HTMLSelectElement).value = "box";
        (document.getElementById('f') as HTMLSelectElement).value = "SERIF";
        (document.getElementById('amb-int') as HTMLInputElement).value = "0.6";
        (document.getElementById('dir-int') as HTMLInputElement).value = "0.8";
        (document.getElementById('shd-int') as HTMLInputElement).value = "0.15";
        (document.getElementById('headlight') as HTMLInputElement).checked = true;
        (window as any).updateViewpoint();
        (window as any).updateLights();
        (window as any).setView('iso');
    }
};

function toggleScheme() {
    const schSelect = document.getElementById('sch') as HTMLSelectElement;
    const s = schSelect?.value;
    const colGrp = document.getElementById('col-grp');
    const gradGrp = document.getElementById('grad-grp');
    const presetGrp = document.getElementById('preset-grp');
    const stopsGrp = document.getElementById('stops-grp');

    if (colGrp) {colGrp.style.display = (s === 'uniform') ? 'flex' : 'none';}
    if (gradGrp) {gradGrp.style.display = (s === 'height' || s === 'gradient') ? 'flex' : 'none';}
    if (presetGrp) {presetGrp.style.display = (s === 'preset') ? 'flex' : 'none';}
    if (stopsGrp) {stopsGrp.style.display = (s === 'custom') ? 'flex' : 'none';}
}

(window as any).toggleScheme = toggleScheme;

function getOptions() {
    const schSelect = document.getElementById('sch') as HTMLSelectElement;
    const s = schSelect?.value;
    let stops = (document.getElementById('stops') as HTMLInputElement)?.value;
    if (s === 'height' || s === 'gradient') {
        stops = '0:' + (document.getElementById('col-s') as HTMLInputElement).value + ',1:' + (document.getElementById('col-e') as HTMLInputElement).value;
    }
    return {
        x: (document.getElementById('xr') as HTMLInputElement).value, 
        y: (document.getElementById('yr') as HTMLInputElement).value, 
        z: (document.getElementById('zr') as HTMLInputElement).value,
        scheme: s, 
        color: (document.getElementById('col') as HTMLInputElement).value,
        bg: (document.getElementById('bg') as HTMLInputElement).value, 
        preset: (document.getElementById('preset') as HTMLSelectElement).value,
        stops: stops, 
        complex: (document.getElementById('cm') as HTMLSelectElement).value,
        axis: (document.getElementById('ax-style') as HTMLSelectElement).value,
        label: 'x:' + (document.getElementById('xl') as HTMLInputElement).value + 
               ',y:' + (document.getElementById('yl') as HTMLInputElement).value + 
               ',z:' + (document.getElementById('zl') as HTMLInputElement).value + 
               ',font:' + (document.getElementById('f') as HTMLSelectElement).value
    };
}

(window as any).apply = function() {
    const resInput = document.getElementById('res') as HTMLInputElement;
    vscode.postMessage({
        command: 'rerender', 
        expr: last, 
        samples: resInput?.value,
        options: getOptions()
    });
};

(window as any).fitView = function() {
    const x3d = document.getElementById('x') as any;
    if (x3d && x3d.runtime) {x3d.runtime.showAll();}
};

function autoCrop(imgData: string, bgColor: string, format: string, callback: (data: string) => void) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {return;}
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
                    if (x < minX) {minX = x;}
                    if (x > maxX) {maxX = x;}
                    if (y < minY) {minY = y;}
                    if (y > maxY) {maxY = y;}
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
        const croppedCtx = croppedCanvas.getContext('2d');
        croppedCtx?.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        callback(croppedCanvas.toDataURL('image/' + format));
    };
    img.src = imgData;
}

(window as any).setExportPreset = function() {
    const pSelect = document.getElementById('exp-preset') as HTMLSelectElement;
    const p = pSelect?.value;
    const w = document.getElementById('exp-w') as HTMLInputElement;
    const h = document.getElementById('exp-h') as HTMLInputElement;
    if(p === 'square') { w.value = "1000"; h.value = "1000"; }
    else if(p === 'hd') { w.value = "1280"; h.value = "720"; }
    else if(p === 'fhd') { w.value = "1920"; h.value = "1080"; }
    else if(p === 'a4') { w.value = "2480"; h.value = "1754"; }
};

(window as any).exportPlot = function() {
    const x3d = document.getElementById('x') as any;
    if (!x3d || !x3d.runtime) {return;}
    
    const isTextbook = (document.getElementById('textbook-mode') as HTMLInputElement).checked;
    const wValue = (document.getElementById('exp-w') as HTMLInputElement).value;
    const hValue = (document.getElementById('exp-h') as HTMLInputElement).value;
    const w = parseInt(wValue) || 800;
    const h = parseInt(hValue) || 600;
    const fmt = (document.getElementById('exp-fmt') as HTMLSelectElement).value;
    const isSmart = (document.getElementById('exp-smart') as HTMLInputElement).checked;
    const bgInput = document.getElementById('bg') as HTMLInputElement;
    const bgColor = isTextbook ? "#ffffff" : bgInput.value;
    
    const originalWidth = x3d.style.width;
    const originalHeight = x3d.style.height;
    const originalAA = x3d.getAttribute('antialiasing');
    
    x3d.style.width = w + 'px';
    x3d.style.height = h + 'px';
    x3d.setAttribute('antialiasing', 'true');
    
    if (isTextbook) {
        if (bgInput) {bgInput.value = "#ffffff";}
        const projSelect = document.getElementById('proj') as HTMLSelectElement;
        if (projSelect) {projSelect.value = "ortho";}
        (window as any).updateViewpoint();
        (window as any).setView('iso');
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
};

function hexToRgb(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return r + " " + g + " " + b;
}

function initLabelGraph(data: any) {
    const nodes = data.nodes;
    const edges = data.edges;
    const settings = data.settings || {};
    
    const colors: Record<string, string> = { section: '#ffadad', equation: '#a2d2ff', figure: '#caffbf' };
    const state = vscode.getState() || {};
    const savedPositions = state.labelPositions || {};

    const baseSize = settings.baseSize || 12;

    const newNodes = nodes.map((n: any) => {
        const color = colors[n.type] || '#ffd6a5';
        const refCount = n.refCount || 0;
        const size = baseSize + (Math.log(refCount + 1) * 4);
        const pos = savedPositions[n.id] || {};
        return {
            id: n.id,
            label: n.label.length > 12 ? n.label.substring(0, 10) + '...' : n.label,
            shape: 'dot',
            size: size,
            color: { 
                background: color, 
                border: 'rgba(255,255,255,0.8)', 
                highlight: { background: color, border: '#1a1a1a' }
            },
            font: { color: 'var(--vscode-foreground)', size: 9, vadjust: size + 4 },
            metadata: n,
            x: pos.x,
            y: pos.y
        };
    });

    const newEdges = edges.map((e: any) => ({
        ...e,
        arrows: { to: { enabled: true, scaleFactor: 0.45 } },
        color: { 
            color: 'rgba(203, 213, 225, 0.45)', 
            highlight: '#4f46e5',
            hover: 'rgba(79, 70, 229, 0.8)'
        },
        width: 1.2,
        smooth: false
    }));

    // Incremental Update
    const currentIds = visNodes.getIds();
    const nextIds = newNodes.map((n: any) => n.id);
    const toRemove = currentIds.filter((id: any) => !nextIds.includes(id));
    
    visNodes.remove(toRemove);
    visNodes.update(newNodes);

    const currentEdgeIds = visEdges.getIds();
    const nextEdgeIds = newEdges.map((e: any) => e.id);
    const edgesToRemove = currentEdgeIds.filter((id: any) => !nextEdgeIds.includes(id));

    visEdges.remove(edgesToRemove);
    visEdges.update(newEdges);

    const solver = settings.solver || 'forceAtlas2Based';
    const springLength = settings.springLength || 100;

    const physicsOptions: any = {
        enabled: settings.enabled !== false,
        solver: solver,
        timestep: 0.4,
        stabilization: { 
            enabled: true,
            iterations: settings.stabilizationIterations || 200,
            updateInterval: 10,
            onlyDynamicEdges: false,
            fit: true
        },
        adaptiveTimestep: true
    };
    
    if (solver === 'forceAtlas2Based') {
        physicsOptions.forceAtlas2Based = {
            gravitationalConstant: settings.gravitationalConstant || -100,
            springLength: springLength,
            springConstant: settings.springConstant || 0.04,
            avoidOverlap: settings.avoidOverlap || 1,
            damping: 0.4
        };
    } else if (solver === 'barnesHut') {
        physicsOptions.barnesHut = {
            gravitationalConstant: (settings.gravitationalConstant * 25) || -2500,
            centralGravity: 0.3,
            springLength: springLength,
            springConstant: settings.springConstant || 0.04,
            avoidOverlap: settings.avoidOverlap || 1,
            damping: 0.3
        };
    }

    if (!labelNetwork) {
        const container = document.getElementById('viz');
        if (!container) {return;}
        const options = {
            physics: physicsOptions,
            interaction: { 
                hover: true,
                tooltipDelay: 200,
                hideEdgesOnDrag: false
            }
        };
        labelNetwork = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);

        let lastFitTime = 0;
        labelNetwork.on("render", () => {
            const now = Date.now();
            if (now - lastFitTime < 1500) {return;} 

            const nodeIds = visNodes.getIds();
            if (nodeIds.length === 0) {return;}

            const positions = labelNetwork.getPositions();
            const canvas = container.querySelector('canvas');
            if (!canvas) {return;}
            
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;

            let needsFit = false;
            for (const id of nodeIds) {
                const pos = positions[id];
                if (!pos) {continue;}
                const domPos = labelNetwork.canvasToDOM(pos);
                if (domPos.x < 20 || domPos.x > width - 20 || domPos.y < 20 || domPos.y > height - 20) {
                    needsFit = true;
                    break;
                }
            }

            if (needsFit) {
                lastFitTime = now;
                labelNetwork.fit({ animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
            }
        });

        labelNetwork.on("stabilizationIterationsDone", () => {
            const positions = labelNetwork.getPositions();
            const currentState = vscode.getState() || {};
            vscode.setState({ ...currentState, labelPositions: positions });
            
            if (settings.stabilizationFinish === 'fit') {
                labelNetwork.fit({ animation: { duration: 1200, easingFunction: 'easeInOutQuad' } });
            } else if (settings.stabilizationFinish === 'disablePhysics') {
                labelNetwork.setOptions({ physics: { enabled: false } });
            }
        });

        labelNetwork.on("dragEnd", () => {
            const positions = labelNetwork.getPositions();
            const currentState = vscode.getState() || {};
            vscode.setState({ ...currentState, labelPositions: positions });
        });

        labelNetwork.on("click", (p: any) => {
            const ins = document.getElementById('inspector');
            if (p.nodes.length > 0) {
                const node = visNodes.get(p.nodes[0]).metadata;
                const insLabel = document.getElementById('ins-label');
                const insMeta = document.getElementById('ins-meta');
                if (insLabel) {insLabel.innerText = node.label;}
                if (insMeta) {insMeta.innerText = `LINE ${node.line} | ${node.refCount || 0} REFS`;}
                const target = document.getElementById('ins-math-target');
                if (target) {
                    target.innerHTML = `\\[ ${node.content} \\]`;
                    if (ins) {ins.classList.add('active');}
                    if ((window as any).MathJax) {(window as any).MathJax.typesetPromise([target]);}
                }
            } else {
                if (ins) {ins.classList.remove('active');}
            }
        });
    } else {
        labelNetwork.setOptions({ physics: physicsOptions });
    }
}

window.addEventListener('message', e => {
    const { type, x3d_data, latex, preview_img, warning, expr_latex, macros, nodes, edges, settings } = e.data;
    if (type === 'labels') {
        initLabelGraph({ nodes, edges, settings });
    } else if (type === 'update') {
        let content = expr_latex || latex || "TeX-Machina";
        if (!expr_latex && latex && latex !== "TeX-Machina" && !latex.includes('$') && !latex.includes('\\(') && !latex.includes('\\[') && !latex.includes('tikzpicture')) {
            content = '$$' + latex + '$$';
        }

        if (!expr_latex && content.includes('tikzpicture')) {
            content = "Plot Preview";
        }
        const out = document.getElementById('out');
        if (out) {
            if (warning) {
                out.innerHTML = '<div style="color: #ffa500; margin-bottom: 5px;">⚠️ ' + warning + '</div>' + content;
            } else {
                out.innerHTML = content;
            }
        }

        const container = document.getElementById('container');
        if (x3d_data) {
            last = x3d_data.expr;
            document.querySelectorAll('.plot-ui').forEach(el => (el as HTMLElement).style.display = 'block');
            document.querySelectorAll('.plot-btn-row').forEach(el => (el as HTMLElement).style.display = 'flex');
            
            const [c, r] = x3d_data.grid_size;
            const rx = x3d_data.ranges.x, ry = x3d_data.ranges.y, rz = x3d_data.ranges.z;
            
            const resInput = document.getElementById('res') as HTMLInputElement;
            const xrInput = document.getElementById('xr') as HTMLInputElement;
            const yrInput = document.getElementById('yr') as HTMLInputElement;
            const zrInput = document.getElementById('zr') as HTMLInputElement;
            const bgInput = document.getElementById('bg') as HTMLInputElement;
            const axStyleSelect = document.getElementById('ax-style') as HTMLSelectElement;
            const schSelect = document.getElementById('sch') as HTMLSelectElement;
            const presetSelect = document.getElementById('preset') as HTMLSelectElement;
            const cmSelect = document.getElementById('cm') as HTMLSelectElement;
            const xlInput = document.getElementById('xl') as HTMLInputElement;
            const ylInput = document.getElementById('yl') as HTMLInputElement;
            const zlInput = document.getElementById('zl') as HTMLInputElement;

            if (resInput) {resInput.value = c;}
            if (xrInput) {xrInput.value = rx.join(',');}
            if (yrInput) {yrInput.value = ry.join(',');}
            if (zrInput) {zrInput.value = rz.join(',');}
            
            if (x3d_data.bg_color && bgInput) {bgInput.value = x3d_data.bg_color;}
            if (x3d_data.axis_style && axStyleSelect) {axStyleSelect.value = x3d_data.axis_style;}
            
            if (x3d_data.color_scheme) {
                if (schSelect) {schSelect.value = x3d_data.color_scheme;}
                toggleScheme();
            }
            if (x3d_data.preset_name && presetSelect) {presetSelect.value = x3d_data.preset_name;}
            if (x3d_data.complex_mode && cmSelect) {cmSelect.value = x3d_data.complex_mode;}

            if (x3d_data.labels) {
                if (x3d_data.labels.x && xlInput) {xlInput.value = x3d_data.labels.x;}
                if (x3d_data.labels.y && ylInput) {ylInput.value = x3d_data.labels.y;}
                if (x3d_data.labels.z && zlInput) {zlInput.value = x3d_data.labels.z;}
            }

            const idx = [];
            for(let i=0; i<r-1; i++) {for(let j=0; j<c-1; j++) {idx.push(i*c+j, i*c+j+1, (i+1)*c+j+1, (i+1)*c+j, -1);}}
            
            const aa = (document.getElementById('aa') as HTMLSelectElement)?.value;
            const f = x3d_data.labels.font || "SANS";
            const showAxes = (document.getElementById('show-axes') as HTMLInputElement)?.checked;
            const axStyle = x3d_data.axis_style || "cross";
            const skyCol = hexToRgb(x3d_data.bg_color || "#ffffff");
            
            const ambInt = (document.getElementById('amb-int') as HTMLInputElement)?.value;
            const dirInt = (document.getElementById('dir-int') as HTMLInputElement)?.value;
            const shdInt = (document.getElementById('shd-int') as HTMLInputElement)?.value;
            const head = (document.getElementById('headlight') as HTMLInputElement)?.checked ? 'true' : 'false';

            let axesXml = "";
            if(showAxes && axStyle !== 'none'){
                if(axStyle === 'cross' || axStyle === 'arrows'){
                    axesXml = `
                        <transform>
                            <shape>
                                <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="1 0 0"></material></appearance>
                                <indexedlineset coordIndex="0 1 -1"><coordinate point="${rx[0]} 0 0 ${rx[1]} 0 0"></coordinate></indexedlineset>
                            </shape>
                            <shape>
                                <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="0 1 0"></material></appearance>
                                <indexedlineset coordIndex="0 1 -1"><coordinate point="0 ${ry[0]} 0 0 ${ry[1]} 0"></coordinate></indexedlineset>
                            </shape>
                            <shape>
                                <appearance><lineproperties linewidth="2"></lineproperties><material emissiveColor="0 0 1"></material></appearance>
                                <indexedlineset coordIndex="0 1 -1"><coordinate point="0 0 ${rz[0]} 0 0 ${rz[1]}"></coordinate></indexedlineset>
                            </shape>
                        </transform>`;
                    if(axStyle === 'arrows'){
                        axesXml += `
                            <transform translation="${rx[1]} 0 0" rotation="0 0 1 -1.57"><shape><appearance><material diffuseColor="1 0 0"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>
                            <transform translation="0 ${ry[1]} 0"><shape><appearance><material diffuseColor="0 1 0"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>
                            <transform translation="0 0 ${rz[1]}" rotation="1 0 0 1.57"><shape><appearance><material diffuseColor="0 0 1"></material></appearance><cone bottomRadius="0.2" height="0.5"></cone></shape></transform>`;
                    }
                } else if(axStyle === 'box'){
                    axesXml = `
                        <transform>
                            <shape>
                                <appearance><lineproperties linewidth="1"></lineproperties><material emissiveColor="0.6 0.6 0.6"></material></appearance>
                                <indexedlineset coordIndex="0 1 2 3 0 -1 4 5 6 7 4 -1 0 4 -1 1 5 -1 2 6 -1 3 7 -1">
                                    <coordinate point="${rx[0]} ${ry[0]} ${rz[0]} ${rx[1]} ${ry[0]} ${rz[0]} ${rx[1]} ${ry[1]} ${rz[0]} ${rx[0]} ${ry[1]} ${rz[0]} ${rx[0]} ${ry[0]} ${rz[1]} ${rx[1]} ${ry[0]} ${rz[1]} ${rx[1]} ${ry[1]} ${rz[1]} ${rx[0]} ${ry[1]} ${rz[1]}"></coordinate>
                                </indexedlineset>
                            </shape>
                        </transform>`;
                }
            }

            if (container) {
                container.innerHTML = `
                    <x3d id="x" antialiasing="${aa}" style="width:100%; height:400px">
                        <scene>
                            <navigationInfo id="nav-info" headlight="${head}"></navigationInfo>
                            <directionalLight id="dir-light" direction="-1 -1 -1" intensity="${dirInt}" shadowIntensity="${shdInt}" shadowMapSize="1024"></directionalLight>
                            <ambientLight id="amb-light" intensity="${ambInt}"></ambientLight>
                            <${((document.getElementById('proj') as HTMLSelectElement)?.value === 'ortho' ? 'OrthoViewpoint' : 'Viewpoint')} id="vp" position="0 15 15" orientation="1 0 0 -0.785" ${((document.getElementById('proj') as HTMLSelectElement)?.value === 'ortho' ? 'fieldOfView="-5 -5 5 5"' : '')}></${((document.getElementById('proj') as HTMLSelectElement)?.value === 'ortho' ? 'OrthoViewpoint' : 'Viewpoint')}>
                            <background skyColor="${skyCol}"></background>
                            ${axesXml}
                            <transform translation="0 ${ry[1]+1} 0"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"${x3d_data.labels.y}"'><fontstyle family='"${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                            <transform translation="${rx[1]+1} 0 0" rotation="0 0 1 -1.57"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"${x3d_data.labels.x}"'><fontstyle family='"${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                            <transform translation="0 0 ${rz[1]+1}" rotation="0 1 0 1.57"><shape><appearance><material diffuseColor="1 1 1"></material></appearance><text string='"${x3d_data.labels.z}"'><fontstyle family='"${f}"' size="1" justify='"MIDDLE"'></fontstyle></text></shape></transform>
                            <transform rotation="1 0 0 -1.57">
                                <ClipPlane plane="0 0 -1 ${rz[1]}" enabled="true"></ClipPlane>
                                <ClipPlane plane="0 0 1 ${-rz[0]}" enabled="true"></ClipPlane>
                                <shape>
                                    <appearance><material></material></appearance>
                                    <IndexedFaceSet solid="false" colorPerVertex="true" coordIndex="${idx.join(' ')}">
                                        <coordinate point="${x3d_data.points.map((p: any)=>p.join(' ')).join(' ')}"></coordinate>
                                        <color color="${x3d_data.colors.map((c: any)=>c.join(' ')).join(' ')}"></color>
                                    </IndexedFaceSet>
                                </shape>
                            </transform>
                        </scene>
                    </x3d>`;
            }
            if((window as any).x3dom) {
                (window as any).x3dom.reload();
                setTimeout(updateFromSliders, 200);
            }
        } else if (preview_img) {
            document.querySelectorAll('.plot-ui').forEach(el => (el as HTMLElement).style.display = 'none');
            document.querySelectorAll('.plot-btn-row').forEach(el => (el as HTMLElement).style.display = 'none');
            const detailsT = document.getElementById('details-t') as any;
            if (detailsT) {detailsT.open = true;}
            if (container) {container.innerHTML = `<div style="text-align:center; margin-top:10px;"><img src="${preview_img}" style="max-width:100%; border:1px solid #444;"></div>`;}
        } else {
            document.querySelectorAll('.plot-ui').forEach(el => (el as HTMLElement).style.display = 'none');
            document.querySelectorAll('.plot-btn-row').forEach(el => (el as HTMLElement).style.display = 'none');
            const detailsT = document.getElementById('details-t') as any;
            if (detailsT) {detailsT.open = true;}
            if (container) {container.innerHTML = '';}
        }
        
        if((window as any).MathJax) {(window as any).MathJax.typesetPromise();}
    } else if (type === 'updateMacros') {
        const list = document.getElementById('macro-list');
        if (list) {
            list.innerHTML = '';
            for (const [name, chain] of Object.entries(macros)) {
                const item = document.createElement('div');
                item.className = 'macro-item';
                item.innerHTML = `
                    <div class="macro-header">
                        <span class="macro-name" onclick="applyMacro('${name}')" title="Apply this macro to selection">;${name}</span>
                        <div class="macro-actions">
                            <button class="secondary" onclick="editMacro('${name}', '${(chain as string).replace(/'/g, "\\'")}')">Edit</button>
                            <button class="secondary" style="background: #a30000;" onclick="deleteMacro('${name}')">Del</button>
                        </div>
                    </div>
                    <div class="macro-chain">${chain}</div>
                `;
                list.appendChild(item);
            }
        }
    }
});
