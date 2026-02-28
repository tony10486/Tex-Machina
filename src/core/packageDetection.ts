import * as vscode from 'vscode';

// Mapping of popular packages to their "signature" commands/environments.
// If any of these patterns match, the package is considered "used".
const packageSignatures: { [key: string]: RegExp[] } = {
    'amsmath': [/\\begin\{(?:equation|align|gather|multline|split|cases|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|smallmatrix)\}/, /\\text\{/, /\\DeclareMathOperator/, /\\eqref/],
    'amssymb': [/\\mathbb/, /\\mathcal/, /\\mathfrak/, /\\checkmark/],
    'graphicx': [/\\includegraphics/, /\\DeclareGraphicsExtensions/, /\\graphicspath/],
    'siunitx': [/\\SI/, /\\num/, /\\unit/, /\\qty/, /\\ang/, /\\tablenum/],
    'hyperref': [/\\href/, /\\url/, /\\hypersetup/, /\\autoref/],
    'cleveref': [/\\cref/, /\\Cref/, /\\crefrange/],
    'tikz': [/\\begin\{tikzpicture\}/, /\\tikz/, /\\usetikzlibrary/],
    'pgfplots': [/\\begin\{axis\}/, /\\addplot/],
    'xcolor': [/\\color(?:box|line|text)?/, /\\definecolor/, /\\pagecolor/],
    'listings': [/\\begin\{lstlisting\}/, /\\lstinline/, /\\lstset/, /\\lstinputlisting/],
    'enumitem': [/\\begin\{(?:itemize|enumerate|description)\}\s*\[/, /\\setlist/],
    'booktabs': [/\\toprule/, /\\midrule/, /\\bottomrule/, /\\cmidrule/],
    'algorithm2e': [/\\begin\{algorithm\}/, /\\SetAlgoVlined/, /\\KwData/, /\\KwResult/],
    'subcaption': [/\\begin\{subcaption\}/, /\\begin\{subfigure\}/, /\\subcaption/],
    'geometry': [/\\geometry/], // Often used just in preamble, but we can look for it.
    'biblatex': [/\\addbibresource/, /\\printbibliography/, /\\cite/, /\\autocite/],
    'csquotes': [/\\enquote/],
    'babel': [/\\selectlanguage/],
};

// Packages that should NEVER be commented out because they have global side effects
const persistentPackages = new Set([
    'fontenc', 'inputenc', 'geometry', 'babel', 'microtype', 'lmodern'
]);

export async function checkPackageUsage(document: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration('tex-machina');
    if (!config.get('packageAutoCleanup.enabled', true)) {
        return;
    }

    const text = document.getText();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    // Capture indentation, the possible [unused] prefix, optional arguments, and the package name.
    const packageRegex = /^(\s*)(%?\s*\[unused\]\s*)?\\usepackage(\[[^\]]*\])?\{([^}]+)\}/gm;
    let match;
    const edits: { range: vscode.Range, newText: string }[] = [];

    while ((match = packageRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const indentation = match[1];
        const isAlreadyCommented = !!match[2];
        const optionalArgs = match[3] || "";
        const packageNameRaw = match[4];

        // Handle multiple packages in one \usepackage{pkg1,pkg2}
        const packageNames = packageNameRaw.split(',').map(p => p.trim());
        if (packageNames.length > 1) {
            // Complex case: for now, we only auto-cleanup single package lines for safety.
            continue;
        }

        const pkg = packageNames[0];
        if (persistentPackages.has(pkg)) {
            continue;
        }

        const signatures = packageSignatures[pkg];
        if (!signatures) {
            // Unknown package: don't touch it.
            continue;
        }

        const isUsed = signatures.some(regex => regex.test(text));
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + fullMatch.length);
        const range = new vscode.Range(startPos, endPos);

        if (!isUsed && !isAlreadyCommented) {
            // Comment it out
            const newText = `${indentation}% [unused] \\usepackage${optionalArgs}{${pkg}}`;
            edits.push({ range, newText });
        } else if (isUsed && isAlreadyCommented) {
            // Uncomment it
            const newText = `${indentation}\\usepackage${optionalArgs}{${pkg}}`;
            edits.push({ range, newText });
        }
    }

    if (edits.length > 0) {
        await editor.edit(editBuilder => {
            for (const edit of edits) {
                editBuilder.replace(edit.range, edit.newText);
            }
        }, { undoStopBefore: false, undoStopAfter: false });
    }
}

let packageUpdateTimeout: NodeJS.Timeout | undefined;

export function registerPackageDetection(context: vscode.ExtensionContext) {
    function triggerUpdate(document: vscode.TextDocument) {
        if (packageUpdateTimeout) {
            clearTimeout(packageUpdateTimeout);
        }
        packageUpdateTimeout = setTimeout(() => {
            checkPackageUsage(document);
        }, 1500); // 1.5s delay
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'latex') {
                triggerUpdate(event.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'latex') {
                triggerUpdate(editor.document);
            }
        })
    );

    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'latex') {
        triggerUpdate(vscode.window.activeTextEditor.document);
    }
}
