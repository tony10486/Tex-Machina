export interface TableOptions {
    rows: number;
    cols: number;
    hasBorders: boolean;
    hasHeader: boolean;
    alignment: 'l' | 'c' | 'r';
}

export function generateLatexTable(options: TableOptions): string {
    const { rows, cols, hasBorders, hasHeader, alignment } = options;
    
    let colSpec = '';
    if (hasBorders) {
        colSpec = '|' + (alignment + '|').repeat(cols);
    } else {
        colSpec = alignment.repeat(cols);
    }

    let latex = '\\begin{tabular}{' + colSpec + '}\n';
    
    if (hasBorders) {
        latex += '  \\hline\n';
    }

    for (let i = 0; i < rows; i++) {
        let row = '  ';
        for (let j = 0; j < cols; j++) {
            row += (i === 0 && hasHeader) ? `Header ${j + 1}` : `Data ${i + 1},${j + 1}`;
            if (j < cols - 1) {
                row += ' & ';
            }
        }
        row += ' \\\\';
        latex += row + '\n';
        
        if (hasBorders || (i === 0 && hasHeader)) {
            latex += '  \\hline\n';
        }
    }

    latex += '\\end{tabular}';
    return latex;
}
