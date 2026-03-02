import * as vscode from 'vscode';

export interface ScanPreventionOptions {
    type: 'moire' | 'aliasing' | 'dots';
    size: number;
    rotation: number;
    density: number; // lines per cm
}

export function generateScanPreventionPattern(options: ScanPreventionOptions): string {
    const { type, size, rotation, density } = options;
    const step = 1 / density;
    const stepStr = step.toFixed(4);
    
    let latex = '\\begin{tikzpicture}\n';
    
    if (type === 'moire') {
        latex += `  % Base grid\n`;
        latex += `  \\foreach \\i in {0,${stepStr},...,${size}} {\n`;
        latex += `    \\draw[ultra thin, gray!40] (\\i,0) -- (\\i,${size});\n`;
        latex += `    \\draw[ultra thin, gray!40] (0,\\i) -- (${size},\\i);\n`;
        latex += `  }\n`;
        latex += `  % Rotated grid\n`;
        latex += `  \\begin{scope}[rotate=${rotation}]\n`;
        // Extend slightly to cover rotated area
        const margin = 1;
        const start = -margin;
        const end = size + margin;
        latex += `    \\foreach \\i in {${start},${(start + step).toFixed(4)},...,${end}} {\n`;
        latex += `      \\draw[ultra thin, black!80] (\\i,${start}) -- (\\i,${end});\n`;
        latex += `      \\draw[ultra thin, black!80] (${start},\\i) -- (${end},\\i);\n`;
        latex += `    }\n`;
        latex += `  \\end{scope}\n`;
    } else if (type === 'aliasing') {
        latex += `  % High frequency lines\n`;
        latex += `  \\foreach \\i in {0,${stepStr},...,${size}} {\n`;
        latex += `    \\draw[ultra thin] (\\i,0) -- (\\i,${size});\n`;
        latex += `  }\n`;
    } else if (type === 'dots') {
        latex += `  % Stochastic dot pattern\n`;
        latex += `  \\foreach \\x in {0,${stepStr},...,${size}} {\n`;
        latex += `    \\foreach \\y in {0,${stepStr},...,${size}} {\n`;
        latex += `       \\fill[black!90] (\\x, \\y) circle (0.01);\n`;
        latex += `    }\n`;
        latex += `  }\n`;
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
            density: parseFloat(densityInput)
        };

        const latex = generateScanPreventionPattern(options);
        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, latex);
        });
    });

    context.subscriptions.push(disposable);
}
