import * as vscode from 'vscode';
import { findMathAtPos } from './latexParser';

/**
 * [Smart Selection Expansion]
 * Provides logical selection ranges for LaTeX documents.
 * Allows users to expand selection from character -> word -> command -> environment.
 */

export function registerSelectionExpansion(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerSelectionRangeProvider(
        'latex',
        {
            provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]) {
                return positions.map(position => {
                    const ranges = getSelectionRangesAt(document, position);
                    
                    let lastSelectionRange: vscode.SelectionRange | undefined;
                    for (let i = ranges.length - 1; i >= 0; i--) {
                        lastSelectionRange = new vscode.SelectionRange(ranges[i], lastSelectionRange);
                    }
                    
                    return lastSelectionRange!;
                });
            }
        }
    );

    context.subscriptions.push(provider);
}

export function getSelectionRangesAt(document: vscode.TextDocument, position: vscode.Position): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    const offset = document.offsetAt(position);
    const text = document.getText();

    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
        ranges.push(wordRange);
    }

    const structuralRanges: vscode.Range[] = [];

    // Math Block
    const mathBlock = findMathAtPos(document, position);
    if (mathBlock) {
        const mathStart = document.offsetAt(mathBlock.range.start);
        const mathEnd = document.offsetAt(mathBlock.range.end);
        
        let innerStartOffset = 1;
        let innerEndOffset = 1;

        if (mathBlock.text.startsWith('$$') || mathBlock.text.startsWith('\\[')) {
            innerStartOffset = 2; innerEndOffset = 2;
        } else if (mathBlock.text.startsWith('\\begin{')) {
            const firstBraceEnd = mathBlock.text.indexOf('}') + 1;
            const lastEndTag = mathBlock.text.lastIndexOf('\\end{');
            innerStartOffset = firstBraceEnd;
            innerEndOffset = mathBlock.text.length - lastEndTag;
        }
        
        const innerRange = new vscode.Range(
            document.positionAt(mathStart + innerStartOffset),
            document.positionAt(mathEnd - innerEndOffset)
        );

        if (innerRange.contains(position)) {
            // Add trimmed version of innerRange for precision
            const innerText = document.getText(innerRange);
            const trimmedStartOffset = innerText.length - innerText.trimStart().length;
            const trimmedEndOffset = innerText.length - innerText.trimEnd().length;
            
            const trimmedInnerRange = new vscode.Range(
                document.positionAt(mathStart + innerStartOffset + trimmedStartOffset),
                document.positionAt(mathEnd - innerEndOffset - trimmedEndOffset)
            );

            if (trimmedInnerRange.contains(position)) {
                structuralRanges.push(trimmedInnerRange);
            }

            // Granular Term/Side Analysis inside Math Block
            const mathInnerContent = mathBlock.text.substring(innerStartOffset, mathBlock.text.length - innerEndOffset);
            const innerRelativeOffset = (offset - mathStart) - innerStartOffset;
            
            const granularRanges = getGranularMathRanges(
                mathInnerContent, 
                innerRelativeOffset, 
                document, 
                document.positionAt(mathStart + innerStartOffset)
            );
            structuralRanges.push(...granularRanges);
        }
        structuralRanges.push(mathBlock.range);
    }

    // Environments \begin{env} ... \end{env}
    const lookDistance = 5000;
    const startSearch = Math.max(0, offset - lookDistance);
    const subText = text.substring(startSearch, Math.min(text.length, offset + lookDistance));
    const envRegex = /\\begin\{([a-zA-Z]+\*?)\}[\s\S]*?\\end\{\1\}/g;
    let match;
    while ((match = envRegex.exec(subText)) !== null) {
        const start = startSearch + match.index;
        const end = start + match[0].length;
        if (offset >= start && offset <= end) {
            const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
            const firstLineEnd = text.indexOf('\n', start);
            const lastLineStart = text.lastIndexOf('\n', end);
            if (firstLineEnd !== -1 && lastLineStart !== -1 && firstLineEnd < lastLineStart) {
                const innerRange = new vscode.Range(document.positionAt(firstLineEnd + 1), document.positionAt(lastLineStart));
                if (innerRange.contains(position)) { structuralRanges.push(innerRange); }
            }
            structuralRanges.push(range);
        }
    }

    // Brackets {...}, [...], (...)
    const bracketPairs = [['{', '}'], ['[', ']'], ['(', ')']];
    for (const [open, close] of bracketPairs) {
        let currentOffset = offset;
        while (currentOffset >= 0) {
            const openIdx = text.lastIndexOf(open, currentOffset);
            if (openIdx === -1) { break; }
            const closeIdx = findMatchingBracket(text, openIdx, open, close);
            if (closeIdx !== -1 && closeIdx >= offset) {
                const innerRange = new vscode.Range(document.positionAt(openIdx + 1), document.positionAt(closeIdx));
                const outerRange = new vscode.Range(document.positionAt(openIdx), document.positionAt(closeIdx + 1));
                if (innerRange.contains(position)) { 
                    structuralRanges.push(innerRange); 
                    
                    const bracketInner = text.substring(openIdx + 1, closeIdx);
                    const bracketRelativeOffset = offset - (openIdx + 1);
                    const granularInside = getGranularMathRanges(
                        bracketInner,
                        bracketRelativeOffset,
                        document,
                        document.positionAt(openIdx + 1)
                    );
                    structuralRanges.push(...granularInside);
                }
                structuralRanges.push(outerRange);
                currentOffset = openIdx - 1;
            } else { currentOffset = openIdx - 1; }
        }
    }

    // Sort, Unique, Filter
    const finalRanges: vscode.Range[] = [];
    const sorted = structuralRanges
        .filter(r => r.contains(position))
        .sort((a, b) => {
            const sizeA = document.offsetAt(a.end) - document.offsetAt(a.start);
            const sizeB = document.offsetAt(b.end) - document.offsetAt(b.start);
            return sizeA - sizeB;
        });

    for (const r of sorted) {
        if (!finalRanges.some(existing => existing.isEqual(r))) {
            finalRanges.push(r);
        }
    }

    if (wordRange && (!finalRanges.length || document.offsetAt(wordRange.end) - document.offsetAt(wordRange.start) < document.offsetAt(finalRanges[0].end) - document.offsetAt(finalRanges[0].start))) {
        finalRanges.unshift(wordRange);
    }

    return finalRanges;
}

/**
 * Finds granular ranges (terms, sides) within a string at a specific nesting level.
 */
function getGranularMathRanges(text: string, relativeOffset: number, document: vscode.TextDocument, startPos: vscode.Position): vscode.Range[] {
    const granular: vscode.Range[] = [];
    
    // Level 0 separators (Highest hierarchy within a block/bracket)
    const majorSeps = ['=', '<', '>', '\\\\le', '\\\\ge', '\\\\approx', '\\\\sim', '\\\\equiv', '&', '\\\\\\\\'];
    // Level 1 separators (Terms)
    const minorSeps = ['+', '-', '\\\\cdot'];

    const getSegments = (input: string, separators: string[]) => {
        const sepIndices: number[] = [-1];
        let depth = 0;
        const openBrackets = ['{', '[', '('];
        const closeBrackets = ['}', ']', ')'];

        const escapedSeps = separators.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const pattern = new RegExp(`\\\\\\\\|${escapedSeps}|[{}[\\]()]`, 'g');
        let match;
        while ((match = pattern.exec(input)) !== null) {
            const m = match[0];
            const idx = match.index;

            if (openBrackets.includes(m)) { depth++; }
            else if (closeBrackets.includes(m)) { depth--; }
            else if (depth === 0) {
                const actualSep = separators.find(s => {
                    const cleanS = s.replace(/\\\\/g, '\\');
                    return m === cleanS;
                });
                if (actualSep) { sepIndices.push(idx); }
            }
        }
        sepIndices.push(input.length);

        const results: { start: number, end: number, text: string }[] = [];
        for (let i = 0; i < sepIndices.length - 1; i++) {
            const s = sepIndices[i] + 1;
            const e = sepIndices[i+1];
            results.push({ start: s, end: e, text: input.substring(s, e) });
        }
        return results;
    };

    // 1. Find Major Segments (Sides)
    const majorSegments = getSegments(text, majorSeps);
    const activeMajor = majorSegments.find(s => relativeOffset >= s.start && relativeOffset <= s.end);

    if (activeMajor) {
        const addTrimmed = (s: number, e: number) => {
            const raw = text.substring(s, e);
            const trimmedStart = s + (raw.length - raw.trimStart().length);
            const trimmedEnd = s + raw.trimEnd().length;
            if (trimmedEnd > trimmedStart) {
                const range = new vscode.Range(
                    document.positionAt(document.offsetAt(startPos) + trimmedStart),
                    document.positionAt(document.offsetAt(startPos) + trimmedEnd)
                );
                if (!granular.some(existing => existing.isEqual(range))) {
                    granular.push(range);
                }
            }
        };

        addTrimmed(activeMajor.start, activeMajor.end);

        // 2. Find Minor Segments (Terms) INSIDE the active major segment
        const subText = activeMajor.text;
        const subRelativeOffset = relativeOffset - activeMajor.start;
        const minorSegments = getSegments(subText, minorSeps);
        const activeMinor = minorSegments.find(s => subRelativeOffset >= s.start && subRelativeOffset <= s.end);

        if (activeMinor && activeMinor.text.trim() !== activeMajor.text.trim()) {
            addTrimmed(activeMajor.start + activeMinor.start, activeMajor.start + activeMinor.end);
        }
    }
    
    return granular;
}

function findMatchingBracket(text: string, startIdx: number, open: string, close: string): number {
    let depth = 1;
    for (let i = startIdx + 1; i < text.length; i++) {
        if (text[i] === open) {
            depth++;
        } else if (text[i] === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
