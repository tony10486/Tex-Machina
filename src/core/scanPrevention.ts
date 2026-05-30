import * as vscode from 'vscode';

export interface ScanPreventionOptions {
    type: 'moire' | 'aliasing' | 'dots';
    size: number;
    rotation: number;
    density: number; // lines per cm
    hiddenText?: string; // Text to reveal on scan
}

export function generateScanPreventionPattern(options: ScanPreventionOptions): string {
    const { type, size, rotation, density, hiddenText } = options;
    const step = 1 / density;
    const stepStr = step.toFixed(4);
    
    let prefix = '';
    if (type === 'dots' && hiddenText) {
        prefix = `% Note: Requires \\usetikzlibrary{fadings} in preamble\n` +
                 `\\begin{tikzfadingfrompicture}[name=textfading]\n` +
                 `  \\node [text=white, font=\\sffamily\\Huge\\bfseries, scale=${(size / 3).toFixed(2)}, rotate=45] at (${size / 2},${size / 2}) {${hiddenText}};\n` +
                 `\\end{tikzfadingfrompicture}\n\n`;
    }

    let latex = prefix + '\\begin{tikzpicture}\n';
    
    // Hidden text node generation (for moire/aliasing)
    const textNode = (hiddenText && type !== 'dots')
        ? `  % Hidden text (Pantograph effect)\n  \\node[font=\\sffamily\\Huge\\bfseries, text=gray!20, scale=${(size / 3).toFixed(2)}, rotate=45, align=center] at (${size / 2},${size / 2}) {${hiddenText}};\n`
        : '';
    
    if (type === 'moire') {
        latex += `  % Base grid\n`;
        latex += `  \\foreach \\i in {0,${stepStr},...,${size}} {\n`;
        latex += `    \\draw[ultra thin, gray!40] (\\i,0) -- (\\i,${size});\n`;
        latex += `    \\draw[ultra thin, gray!40] (0,\\i) -- (${size},\\i);\n`;
        latex += `  }\n`;
        
        latex += textNode; // Insert text between layers to camouflage it
        
        latex += `  % Rotated grid\n`;
        latex += `  \\begin{scope}[rotate=${rotation}]\n`;
        const margin = 1;
        const start = -margin;
        const end = size + margin;
        latex += `    \\foreach \\i in {${start},${(start + step).toFixed(4)},...,${end}} {\n`;
        latex += `      \\draw[ultra thin, black!80] (\\i,${start}) -- (\\i,${end});\n`;
        latex += `      \\draw[ultra thin, black!80] (${start},\\i) -- (${end},\\i);\n`;
        latex += `    }\n`;
        latex += `  \\end{scope}\n`;
        
    } else if (type === 'aliasing') {
        latex += textNode;
        latex += `  % High frequency lines\n`;
        latex += `  \\foreach \\i in {0,${stepStr},...,${size}} {\n`;
        latex += `    \\draw[ultra thin, black!80] (\\i,0) -- (\\i,${size});\n`;
        latex += `  }\n`;
        
    } else if (type === 'dots') {
        if (hiddenText) {
            latex += `  % Stochastic dot pattern background\n`;
            latex += `  \\foreach \\x in {0,${stepStr},...,${size}} {\n`;
            latex += `    \\foreach \\y in {0,${stepStr},...,${size}} {\n`;
            latex += `       \\fill[black!60] (\\x, \\y) circle (0.005);\n`;
            latex += `    }\n`;
            latex += `  }\n`;

            latex += `  % Hidden text using larger dots (Pantograph effect)\n`;
            latex += `  \\begin{scope}[path fading=textfading, fit fading=false]\n`;
            latex += `    \\foreach \\x in {0,${stepStr},...,${size}} {\n`;
            latex += `      \\foreach \\y in {0,${stepStr},...,${size}} {\n`;
            latex += `        \\fill[black!90] (\\x, \\y) circle (0.015);\n`;
            latex += `      }\n`;
            latex += `    }\n`;
            latex += `  \\end{scope}\n`;
        } else {
            latex += `  % Simple stochastic dot pattern\n`;
            latex += `  \\foreach \\x in {0,${stepStr},...,${size}} {\n`;
            latex += `    \\foreach \\y in {0,${stepStr},...,${size}} {\n`;
            latex += `       \\fill[black!80] (\\x, \\y) circle (0.01);\n`;
            latex += `    }\n`;
            latex += `  }\n`;
        }
    }
    
    latex += '\\end{tikzpicture}';
    return latex;
}

export function registerScanPrevention(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('tex-machina.insertScanPrevention', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const typePick = await vscode.window.showQuickPick(['moire', 'aliasing', 'dots'], {
            placeHolder: 'Select pattern type'
        });
        if (!typePick) { return; }

        const textInput = await vscode.window.showInputBox({
            prompt: 'Enter hidden text to reveal on scan (e.g., COPY, VOID) [Leave empty for none]',
            value: 'COPY'
        });
        // Undefined means user cancelled, empty string means no text
        if (textInput === undefined) { return; }

        const sizeInput = await vscode.window.showInputBox({
            prompt: 'Enter size (cm)',
            value: '5'
        });
        if (!sizeInput) { return; }

        const rotationInput = await vscode.window.showInputBox({
            prompt: 'Enter rotation angle (degrees)',
            value: '0.5'
        });
        if (!rotationInput) { return; }

        const densityInput = await vscode.window.showInputBox({
            prompt: 'Enter density (lines/cm)',
            value: '20'
        });
        if (!densityInput) { return; }

        const options: ScanPreventionOptions = {
            type: typePick as any,
            size: parseFloat(sizeInput),
            rotation: parseFloat(rotationInput),
            density: parseFloat(densityInput),
            hiddenText: textInput.trim() !== '' ? textInput : undefined
        };

        const latex = generateScanPreventionPattern(options);
        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, latex);
        });
    });

    context.subscriptions.push(disposable);
}
