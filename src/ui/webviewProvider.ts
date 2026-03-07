import * as vscode from 'vscode';
import * as path from 'path';

export class TeXMachinaWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'tex-machina.preview';
    private _view?: vscode.WebviewView;
    private _isLabelDiscoveryExpanded: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public isLabelDiscoveryExpanded(): boolean {
        return this._isLabelDiscoveryExpanded;
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { 
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = await this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'rerender') {
                vscode.commands.executeCommand('tex-machina.rerenderPlot', data.expr, data.samples, data.options);
            } else if (data.command === 'exportPdf') {
                vscode.commands.executeCommand('tex-machina.export3dPlot', data.expr, data.samples, data.color, data.options);
            } else if (data.command === 'saveImage') {
                const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                vscode.commands.executeCommand('tex-machina.internalSaveWebviewImage', buffer, data.format, data.expr);
            } else if (data.command === 'insertTable') {
                vscode.commands.executeCommand('tex-machina.insertTable', data.options);
            } else if (data.command === 'defineMacro') {
                vscode.commands.executeCommand('tex-machina.defineMacro', data.name, data.chain);
            } else if (data.command === 'deleteMacro') {
                vscode.commands.executeCommand('tex-machina.deleteMacro', data.name);
            } else if (data.command === 'applyMacro') {
                vscode.commands.executeCommand('tex-machina.applyMacro', data.name);
            } else if (data.command === 'discoverLabels') {
                vscode.commands.executeCommand('tex-machina.discoverLabels');
            } else if (data.command === 'toggleLabelDiscovery') {
                this._isLabelDiscoveryExpanded = data.expanded;
                if (this._isLabelDiscoveryExpanded) {
                    vscode.commands.executeCommand('tex-machina.discoverLabels');
                }
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                if (this._lastLatex) {
                    this.updatePreview(this._lastLatex, this._lastVars, this._lastAnalysis, this._lastX3dData, this._lastWarning, this._lastPreviewImg, this._lastExprLatex);
                }
                if (this._lastMacros) {
                    this.updateMacros(this._lastMacros);
                }
                if (this._lastNodes.length > 0) {
                    this.updateLabels(this._lastNodes, this._lastEdges);
                }
            }
        });
    }

    private _lastLatex: string = "";
    private _lastExprLatex: string = "";
    private _lastVars: string[] = [];
    private _lastAnalysis: any = null;
    private _lastX3dData: any = null;
    private _lastWarning: string = "";
    private _lastPreviewImg: string = "";
    private _lastMacros: Record<string, string> = {};
    private _lastNodes: any[] = [];
    private _lastEdges: any[] = [];

    public updatePreview(latex: string, vars: string[], analysis?: any, x3d_data?: any, warning?: string, preview_img?: string, expr_latex?: string) {
        this._lastLatex = latex;
        this._lastExprLatex = expr_latex || "";
        this._lastVars = vars;
        this._lastAnalysis = analysis;
        this._lastX3dData = x3d_data;
        this._lastWarning = warning || "";
        this._lastPreviewImg = preview_img || "";
        
        if (!this._view) {
            vscode.commands.executeCommand('tex-machina.preview.focus');
        }
        
        this._view?.webview.postMessage({ type: 'update', latex, vars, analysis, x3d_data, warning, preview_img, expr_latex });
        if (this._view) {
            this._view.show?.(true);
        }
    }

    public updateMacros(macros: Record<string, string>) {
        this._lastMacros = macros;
        this._view?.webview.postMessage({ type: 'updateMacros', macros });
    }

    public updateLabels(nodes: any[], edges: any[]) {
        this._lastNodes = nodes;
        this._lastEdges = edges;
        const settings = this._getLabelSettings();
        this._view?.webview.postMessage({ type: 'labels', nodes, edges, settings });
    }

    private _getLabelSettings() {
        const config = vscode.workspace.getConfiguration('tex-machina.labelVisualization');
        const phys = config.get<any>('physics');
        const node = config.get<any>('node');
        
        return {
            enabled: phys?.enabled !== false,
            solver: phys?.solver || 'forceAtlas2Based',
            gravitationalConstant: phys?.gravitationalConstant ?? -80,
            springLength: node?.spacing ?? 80, 
            springConstant: phys?.springConstant ?? 0.04,
            avoidOverlap: phys?.avoidOverlap ?? 1,
            stabilizationIterations: phys?.stabilizationIterations ?? 150,
            baseSize: node?.baseSize ?? 12,
            stabilizationFinish: phys?.stabilizationFinish ?? 'none'
        };
    }

    private async _getHtml(webview: vscode.Webview): Promise<string> {
        const mathjaxUri = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
        const x3domJs = "https://www.x3dom.org/download/1.8.3/x3dom.js";
        const x3domCss = "https://www.x3dom.org/download/1.8.3/x3dom.css";
        const visNetworkJs = "https://unpkg.com/vis-network/standalone/umd/vis-network.min.js";
        
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));

        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'index.html');
        const htmlBuffer = await vscode.workspace.fs.readFile(htmlPath);
        let html = Buffer.from(htmlBuffer).toString('utf8');

        // CSP 설정 (원래 코드에서 가져옴)
        const csp = `default-src 'none'; img-src ${webview.cspSource} data: blob:; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.x3dom.org https://unpkg.com ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource} https://cdn.jsdelivr.net https://www.x3dom.org; font-src https://cdn.jsdelivr.net https://www.x3dom.org; connect-src https://www.x3dom.org blob:; worker-src 'self' blob:;`;
        
        html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
        html = html.replace('{{webviewJs}}', scriptUri.toString());
        html = html.replace('{{webviewCss}}', styleUri.toString());
        html = html.replace('{{x3domJs}}', x3domJs);
        html = html.replace('{{x3domCss}}', x3domCss);
        html = html.replace('{{visNetworkJs}}', visNetworkJs);
        html = html.replace('{{mathjaxUri}}', mathjaxUri);

        return html;
    }
}
