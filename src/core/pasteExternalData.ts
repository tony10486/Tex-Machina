import * as vscode from 'vscode';

/**
 * Configuration interface for the paste external data feature.
 */
export interface PasteExternalDataConfig {
    enabled: boolean;
    defaultMode: 'auto' | 'matrix' | 'tabular';
    alwaysAskMode: boolean;
    matrixType: string;
    tabularStyle: 'array' | 'booktabs';
    alignmentMode: 'auto' | 'allCenter' | 'allLeft' | 'allRight';
    hasBorders: boolean;
    hasHeader: 'auto' | 'true' | 'false';
    escapeMode: 'smart' | 'all' | 'none';
    showPreview: boolean;
    removeEmptyRows: boolean;
    recognizeCSV: boolean;
    recognizeTSV: boolean;
    recognizeHTMLTable: boolean;
    recognizeSemicolon: boolean;
    recognizeSpace: boolean;
    customDelimiters: string[];
}

/**
 * Load configuration from VS Code settings.
 */
export function loadPasteConfig(): PasteExternalDataConfig {
    const config = vscode.workspace.getConfiguration('tex-machina');
    return {
        enabled: config.get('pasteExternalData.enabled', true),
        defaultMode: config.get('pasteExternalData.defaultMode', 'auto'),
        alwaysAskMode: config.get('pasteExternalData.alwaysAskMode', false),
        matrixType: config.get('pasteExternalData.matrixType', 'bmatrix'),
        tabularStyle: config.get('pasteExternalData.tabularStyle', 'array'),
        alignmentMode: config.get('pasteExternalData.alignmentMode', 'auto'),
        hasBorders: config.get('pasteExternalData.hasBorders', true),
        hasHeader: config.get('pasteExternalData.hasHeader', 'auto'),
        escapeMode: config.get('pasteExternalData.escapeMode', 'smart'),
        showPreview: config.get('pasteExternalData.showPreview', true),
        removeEmptyRows: config.get('pasteExternalData.removeEmptyRows', true),
        recognizeCSV: config.get('pasteExternalData.recognizeCSV', true),
        recognizeTSV: config.get('pasteExternalData.recognizeTSV', true),
        recognizeHTMLTable: config.get('pasteExternalData.recognizeHTMLTable', true),
        recognizeSemicolon: config.get('pasteExternalData.recognizeSemicolon', true),
        recognizeSpace: config.get('pasteExternalData.recognizeSpace', false),
        customDelimiters: config.get('pasteExternalData.customDelimiters', []),
    };
}

/**
 * Parse raw clipboard text into a 2D array of strings.
 * Priority: Custom > TSV > CSV > Semicolon > Space (configurable via settings)
 * Handles CSV quoting (RFC 4180 style) for comma/semicolon delimiters.
 * If `preferredDelimiter` is provided, it overrides automatic detection.
 */
export function parseClipboardData(text: string, preferredDelimiter?: string): string[][] {
    // Remove BOM
    let raw = text.replace(/^\ufeff/, '');
    if (!raw.trim()) { return []; }

    const cfg = loadPasteConfig();

    // Determine delimiter
    let delimiter = '\t';
    if (preferredDelimiter) {
        delimiter = preferredDelimiter;
    } else {
        // Build a list of candidate delimiters based on settings and actual presence in text
        const candidates: { delim: string; count: number }[] = [];

        for (const custom of cfg.customDelimiters) {
            if (raw.includes(custom)) {
                candidates.push({ delim: custom, count: countOccurrences(raw, custom) });
            }
        }

        if (cfg.recognizeTSV && raw.includes('\t')) {
            candidates.push({ delim: '\t', count: countOccurrences(raw, '\t') });
        }

        if (cfg.recognizeCSV) {
            const commaCount = countUnquotedDelimiters(raw, ',');
            if (commaCount > 0) { candidates.push({ delim: ',', count: commaCount }); }
        }

        if (cfg.recognizeSemicolon) {
            const semiCount = countUnquotedDelimiters(raw, ';');
            if (semiCount > 0) { candidates.push({ delim: ';', count: semiCount }); }
        }

        if (cfg.recognizeSpace && /\s{2,}/.test(raw)) {
            // For space delimiter, count runs of 2+ spaces as a heuristic
            const spaceRuns = (raw.match(/\s{2,}/g) || []).length;
            candidates.push({ delim: '\\s+', count: spaceRuns });
        }

        if (candidates.length > 0) {
            // Pick the delimiter with the highest occurrence count
            candidates.sort((a, b) => b.count - a.count);
            delimiter = candidates[0].delim;
        }
    }

    const lines = raw.split(/\r?\n/);
    const rows: string[][] = [];
    let currentLineBuffer = '';

    for (let i = 0; i < lines.length; i++) {
        currentLineBuffer += lines[i];
        const quoteCount = (currentLineBuffer.match(/"/g) || []).length;
        // If we're in the middle of a quoted field (odd quotes), append next line with newline
        if (quoteCount % 2 !== 0 && i < lines.length - 1) {
            currentLineBuffer += '\n';
            continue;
        }

        const row = splitLine(currentLineBuffer, delimiter);
        rows.push(row);
        currentLineBuffer = '';
    }

    const filtered = cfg.removeEmptyRows
        ? rows.filter(r => !r.every(c => c.trim() === ''))
        : rows;

    if (filtered.length === 0) { return []; }

    // Pad all rows to the same column count
    const maxCols = filtered.map(r => r.length).reduce((max, cur) => Math.max(max, cur), 0);
    return filtered.map(r => {
        while (r.length < maxCols) { r.push(''); }
        return r;
    });
}

function countOccurrences(text: string, sub: string): number {
    if (sub.length === 0) { return 0; }
    let count = 0;
    let pos = text.indexOf(sub);
    while (pos !== -1) {
        count++;
        pos = text.indexOf(sub, pos + sub.length);
    }
    return count;
}

function countUnquotedDelimiters(text: string, delim: string): number {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
            count++;
        }
    }
    return count;
}

function splitLine(line: string, delimiter: string): string[] {
    // Regex delimiter (e.g. \s+ for multi-space)
    if (delimiter.startsWith('\\') && delimiter.length > 1) {
        try {
            const regex = new RegExp(delimiter);
            return line.split(regex).map(s => s.trim()).filter((s, idx, arr) => !(s === '' && idx === arr.length - 1));
        } catch {
            // fallback to literal split if invalid regex
        }
    }

    if (delimiter === '\t') {
        // Simple tab split; tabs inside quoted strings are not handled by Excel TSV anyway
        return line.split('\t').map(s => s.trim());
    }

    // CSV-style parsing for comma/semicolon (single-char delimiters)
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = line[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Smart escape a single cell for LaTeX.
 * - If escapeMode is 'none', return as-is.
 * - If escapeMode is 'smart', preserve strings starting with backslash-command (e.g. \alpha).
 * - Otherwise escape all special characters.
 */
export function smartEscapeCell(cell: string, mode: 'smart' | 'all' | 'none'): string {
    if (mode === 'none') { return cell; }

    // If it's an entire LaTeX command or sequence of commands, preserve it in smart mode
    if (mode === 'smart') {
        const trimmed = cell.trim();
        if (/^(\\[a-zA-Z]+\*?)+$/.test(trimmed)) {
            return cell;
        }
        // If the cell contains only LaTeX commands and whitespace, preserve commands but escape other parts
        // We process token by token
    }

    // Escape special LaTeX characters
    const escapeMap: Record<string, string> = {
        '\\': '\\textbackslash{}',
        '{': '\\{',
        '}': '\\}',
        '$': '\\$',
        '&': '\\&',
        '#': '\\#',
        '_': '\\_',
        '%': '\\%',
        '~': '\\textasciitilde{}',
        '^': '\\textasciicircum{}',
    };

    if (mode === 'smart') {
        // We need to preserve LaTeX commands like \alpha, \frac{1}{2}
        // Strategy: temporarily replace \commands with placeholders, escape rest, restore
        const commands: string[] = [];
        const cmdPlaceholder = '\u0000CMD';
        let result = cell;
        result = result.replace(/\\[a-zA-Z]+\*?(?:\{[^{}]*\}|\[[^\]]*\])*/g, (match) => {
            commands.push(match);
            return cmdPlaceholder + (commands.length - 1) + '\u0000';
        });

        // Protect replacement literals that contain braces (e.g. \textbackslash{})
        // so that the braces inside them are not double-escaped.
        const protectedReplacements: { from: string; to: string }[] = [];
        let protectedIdx = 0;
        const protectPlaceholder = '\u0000PROT';

        const safeEscapeMap: Record<string, string> = {};
        for (const [char, replacement] of Object.entries(escapeMap)) {
            if (replacement.includes('{') || replacement.includes('}')) {
                const safeKey = protectPlaceholder + (protectedIdx++) + '\u0000';
                protectedReplacements.push({ from: safeKey, to: replacement });
                safeEscapeMap[char] = safeKey;
            } else {
                safeEscapeMap[char] = replacement;
            }
        }

        // Now escape special chars in the remaining text
        for (const [char, replacement] of Object.entries(safeEscapeMap)) {
            if (char === '\\') {
                // Handle remaining backslashes that are NOT commands (shouldn't happen due to regex, but safety)
                result = result.replace(/\\(?!\u0000CMD)/g, replacement);
            } else {
                result = result.split(char).join(replacement);
            }
        }

        // Restore protected replacements
        for (const pr of protectedReplacements) {
            result = result.split(pr.from).join(pr.to);
        }

        // Restore commands
        for (let i = 0; i < commands.length; i++) {
            result = result.replace('\u0000CMD' + i + '\u0000', commands[i]);
        }

        // Apply number formatting AFTER escaping
        return formatNumber(result);
    } else {
        // 'all' mode: escape everything
        let result = cell;

        // Protect replacement literals that contain braces
        const protectedReplacements: { from: string; to: string }[] = [];
        let protectedIdx = 0;
        const protectPlaceholder = '\u0000PROT';
        const safeEscapeMap: Record<string, string> = {};
        for (const [char, replacement] of Object.entries(escapeMap)) {
            if (replacement.includes('{') || replacement.includes('}')) {
                const safeKey = protectPlaceholder + (protectedIdx++) + '\u0000';
                protectedReplacements.push({ from: safeKey, to: replacement });
                safeEscapeMap[char] = safeKey;
            } else {
                safeEscapeMap[char] = replacement;
            }
        }

        for (const [char, replacement] of Object.entries(safeEscapeMap)) {
            if (char === '\\') {
                result = result.replace(/\\/g, replacement);
            } else {
                result = result.split(char).join(replacement);
            }
        }

        for (const pr of protectedReplacements) {
            result = result.split(pr.from).join(pr.to);
        }

        // Apply number formatting AFTER escaping
        return formatNumber(result);
    }
}

/**
 * Format numbers within a string:
 * - Thousand separators: 1,234.56 → 1\,234.56
 * - Scientific notation: 1.23E+05 → 1.23 \times 10^{5}
 */
export function formatNumber(cell: string): string {
    // Scientific notation: e.g. 1.23E+05, 1.23e-5, 1e10
    return cell.replace(/([+-]?\d+(?:\.\d+)?)[eE]([+-]?(\d+))/g, (_match, base, exp) => {
        const cleanBase = base.replace(/,/g, '');
        const expNum = parseInt(exp, 10);
        return `${cleanBase} \\times 10^{${expNum}}`;
    }).replace(/(\d{1,3})(,(\d{3})+)(\.\d+)?/g, (match) => {
        // Check if it's truly a thousand separator pattern (not something like "1,2,3")
        if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(match)) {
            return match.replace(/,/g, '\\,');
        }
        return match;
    });
}

/**
 * Detect column alignments for tabular environments.
 * Returns an array like ['r', 'c', 'l'].
 */
export function detectColumnAlignment(rows: string[][]): string[] {
    if (rows.length === 0 || rows[0].length === 0) { return []; }
    const cols = rows[0].length;
    const alignments: string[] = [];

    for (let c = 0; c < cols; c++) {
        let allNumeric = true;
        let allText = true;
        let hasContent = false;

        for (let r = 0; r < rows.length; r++) {
            const cell = rows[r][c].trim();
            if (cell === '') { continue; }
            hasContent = true;
            if (!isNumericLike(cell)) { allNumeric = false; }
            if (!isTextLike(cell)) { allText = false; }
        }

        if (!hasContent) {
            alignments.push('c');
        } else if (allNumeric) {
            alignments.push('r');
        } else if (allText) {
            alignments.push('l');
        } else {
            alignments.push('c');
        }
    }

    return alignments;
}

function isNumericLike(s: string): boolean {
    // Allow digits, spaces, commas (thousand sep after formatNumber), dots, plus/minus,
    // and LaTeX constructs like \times 10^{5}, \, (thinspace)
    return /^[\d\s\+\-\.\\\,\{\}\^]+$/.test(s);
}

function isTextLike(s: string): boolean {
    // If it contains any letters (including Korean etc.), treat as text.
    // But numbers alone are also text-like in the sense of 'not mixed', so we require at least one letter
    return /\p{L}/u.test(s);
}

/**
 * Apply alignment mode setting to detected alignments.
 */
export function applyAlignmentMode(
    alignments: string[],
    mode: 'auto' | 'allCenter' | 'allLeft' | 'allRight'
): string[] {
    if (mode === 'allCenter') { return alignments.map(() => 'c'); }
    if (mode === 'allLeft') { return alignments.map(() => 'l'); }
    if (mode === 'allRight') { return alignments.map(() => 'r'); }
    return alignments;
}

/**
 * Detect if the first row is likely a header.
 * Heuristic: first row is all text and other rows are mostly numeric.
 */
export function detectHeader(rows: string[][]): boolean {
    if (rows.length < 2) { return false; }
    const firstRow = rows[0];

    const firstIsAllText = firstRow.every(cell => cell.trim() === '' || isTextLike(cell));
    if (!firstIsAllText) { return false; }

    // Check if rest rows contain at least some numeric cells and are not mostly text headers
    let numericCount = 0;
    let totalCount = 0;
    for (let r = 1; r < rows.length; r++) {
        for (const cell of rows[r]) {
            if (cell.trim() === '') { continue; }
            totalCount++;
            if (isNumericLike(cell)) { numericCount++; }
        }
    }

    // If more than 50% of non-empty cells in rest rows are numeric, treat first row as header
    return totalCount > 0 && (numericCount / totalCount) >= 0.5;
}

/**
 * Generate LaTeX matrix code.
 */
export function generateMatrixLatex(
    rows: string[][],
    envName: string,
    indent: string,
    escapeMode: 'smart' | 'all' | 'none'
): string {
    if (rows.length === 0) { return `\\begin{${envName}}\\end{${envName}}`; }

    const inner = rows.map(row => {
        return row.map(cell => smartEscapeCell(cell, escapeMode)).join(' & ');
    }).join(` \\\\\n${indent}`);

    return `\\begin{${envName}}\n${indent}${inner} \\\n\\end{${envName}}`;
}

/**
 * Generate LaTeX tabular/array code.
 */
export function generateTabularLatex(
    rows: string[][],
    alignments: string[],
    style: 'array' | 'booktabs',
    hasBorders: boolean,
    hasHeader: boolean,
    indent: string,
    escapeMode: 'smart' | 'all' | 'none'
): string {
    if (rows.length === 0) { return '\\begin{tabular}{}\n\\end{tabular}'; }

    const colSpec = alignments.join('');
    let borderSpec = colSpec;
    if (style === 'array' && hasBorders) {
        borderSpec = '|' + colSpec.split('').join('|') + '|';
    }

    let latex = `\\begin{tabular}{${borderSpec}}\n`;

    const dataRows = hasHeader && rows.length > 0 ? rows.slice(1) : rows;
    const headerRow = hasHeader && rows.length > 0 ? rows[0] : null;

    if (style === 'booktabs') {
        latex += `${indent}\\toprule\n`;
        if (headerRow) {
            latex += `${indent}${headerRow.map(c => smartEscapeCell(c, escapeMode)).join(' & ')} \\\\\n`;
            latex += `${indent}\\midrule\n`;
        }
        latex += dataRows.map((row, idx) => {
            const line = `${indent}${row.map(c => smartEscapeCell(c, escapeMode)).join(' & ')} \\\\\n`;
            if (hasHeader && idx === dataRows.length - 1) {
                // No midrule before bottomrule for the last line if there's no header separation needed
            }
            return line;
        }).join('');
        latex += `${indent}\\bottomrule\n`;
    } else {
        // array style
        if (hasBorders) {
            latex += `${indent}\\hline\n`;
        }
        if (headerRow) {
            latex += `${indent}${headerRow.map(c => smartEscapeCell(c, escapeMode)).join(' & ')} \\\\\n`;
            if (hasBorders) {
                latex += `${indent}\\hline\n`;
            }
        }
        latex += dataRows.map(row => {
            return `${indent}${row.map(c => smartEscapeCell(c, escapeMode)).join(' & ')} \\\\\n`;
        }).join('');
        if (hasBorders) {
            latex += `${indent}\\hline\n`;
        }
    }

    latex += `\\end{tabular}`;
    return latex;
}

/**
 * Build a short preview string (first 3 rows) for QuickPick.
 */
export function buildPreview(rows: string[][], maxRows: number = 3): string {
    const displayRows = rows.slice(0, maxRows);
    const lines = displayRows.map(r => r.map(c => c || ' ').join(' | '));
    let preview = lines.join('\n');
    if (rows.length > maxRows) {
        preview += `\n... (${rows.length - maxRows} more rows)`;
    }
    return preview;
}
