import * as vscode from 'vscode';

export function registerUnitExpander(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('tex-machina.formatUnit', async (input?: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const selection = editor.selection;
        let text = input || editor.document.getText(selection);

        if (!text) {
            // If no selection or input, try to get the word at cursor
            const range = editor.document.getWordRangeAtPosition(selection.active, /\\SI\{[^{}]*\}\{[^{}]*\}|\\SI\{[^{}]*\}|[a-zA-Z0-9./^+-]+/);
            if (range) {
                text = editor.document.getText(range);
            }
        }

        if (!text) { return; }

        const expanded = expandSiunitx(text);
        if (expanded !== text) {
            await editor.edit(editBuilder => {
                let range: vscode.Range | undefined;
                if (input) {
                    // If input was provided explicitly, replace selection or insert at cursor
                    range = selection;
                } else {
                    // Otherwise, if selection is empty, find the word range
                    range = editor.selection.isEmpty ? 
                        editor.document.getWordRangeAtPosition(selection.active, /\\SI\{[^{}]*\}\{[^{}]*\}|\\SI\{[^{}]*\}|[a-zA-Z0-9./^+-]+/) :
                        selection;
                }
                
                if (range) {
                    editBuilder.replace(range, expanded);
                }
            });
        }
    });

    context.subscriptions.push(disposable);
}

const UNIT_MAP: { [key: string]: string } = {
    'kg': '\\kilo\\gram',
    'g': '\\gram',
    'mg': '\\milli\\gram',
    'ug': '\\micro\\gram',
    'm': '\\meter',
    'cm': '\\centi\\meter',
    'mm': '\\milli\\meter',
    'um': '\\micro\\meter',
    'nm': '\\nano\\meter',
    'km': '\\kilo\\meter',
    's': '\\second',
    'ms': '\\milli\\second',
    'us': '\\micro\\second',
    'ns': '\\nano\\second',
    'A': '\\ampere',
    'mA': '\\milli\\ampere',
    'uA': '\\micro\\ampere',
    'K': '\\kelvin',
    'mol': '\\mole',
    'cd': '\\candela',
    'Hz': '\\hertz',
    'kHz': '\\kilo\\hertz',
    'MHz': '\\mega\\hertz',
    'GHz': '\\giga\\hertz',
    'N': '\\newton',
    'kN': '\\kilo\\newton',
    'Pa': '\\pascal',
    'kPa': '\\kilo\\pascal',
    'MPa': '\\mega\\pascal',
    'J': '\\joule',
    'kJ': '\\kilo\\joule',
    'W': '\\watt',
    'kW': '\\kilo\\watt',
    'MW': '\\mega\\watt',
    'C': '\\coulomb',
    'V': '\\volt',
    'kV': '\\kilo\\volt',
    'F': '\\farad',
    'uF': '\\micro\\farad',
    'nF': '\\nano\\farad',
    'pF': '\\pico\\farad',
    'Ohm': '\\ohm',
    'S': '\\siemens',
    'Wb': '\\weber',
    'T': '\\tesla',
    'H': '\\henry',
    'degC': '\\degreeCelsius',
    'rad': '\\radian',
    'sr': '\\steradian',
    'lm': '\\lumen',
    'lx': '\\lux',
    'Bq': '\\becquerel',
    'Gy': '\\gray',
    'Sv': '\\sievert',
    'kat': '\\katal',
    'min': '\\minute',
    'h': '\\hour',
    'd': '\\day',
    'L': '\\liter',
    'l': '\\liter',
    'mL': '\\milli\\liter',
    'uL': '\\micro\\liter',
    'bar': '\\bar',
    'eV': '\\electronvolt',
    'keV': '\\kilo\\electronvolt',
    'MeV': '\\mega\\electronvolt',
    'GeV': '\\giga\\electronvolt',
    'TeV': '\\tera\\electronvolt',
};

const PREFIX_MAP: { [key: string]: string } = {
    'Y': '\\yotta', 'Z': '\\zetta', 'E': '\\exa', 'P': '\\peta', 'T': '\\tera', 'G': '\\giga', 'M': '\\mega', 'k': '\\kilo', 'h': '\\hecto', 'da': '\\deca',
    'd': '\\deci', 'c': '\\centi', 'm': '\\milli', 'u': '\\micro', 'n': '\\nano', 'p': '\\pico', 'f': '\\femto', 'a': '\\atto', 'z': '\\zepto', 'y': '\\yocto'
};

export function expandSiunitx(input: string): string {
    // 1. Check if it's already in \SI{val}{unit} format
    let value = "";
    let unitStr = "";

    const siMatch = input.match(/^\\SI\{([^}]*)\}\{([^}]*)\}$/);
    const siShortMatch = input.match(/^\\SI\{([^}]*)\}$/);

    if (siMatch) {
        value = siMatch[1];
        unitStr = siMatch[2];
    } else if (siShortMatch) {
        // Try to split number and unit inside \SI{10kg}
        const inner = siShortMatch[1];
        const splitMatch = inner.match(/^([0-9.,+-]+)(.*)$/);
        if (splitMatch) {
            value = splitMatch[1];
            unitStr = splitMatch[2].trim();
        } else {
            unitStr = inner;
        }
    } else {
        // Try to split number and unit from raw string like "10kg"
        const splitMatch = input.match(/^([0-9.,+-]+)(.*)$/);
        if (splitMatch) {
            value = splitMatch[1];
            unitStr = splitMatch[2].trim();
        } else {
            unitStr = input;
        }
    }

    if (!unitStr && value) {
        return `\\num{${value}}`;
    }

    const expandedUnit = parseUnitString(unitStr);
    
    if (value) {
        return `\\SI{${value}}{${expandedUnit}}`;
    } else {
        return `\\si{${expandedUnit}}`;
    }
}

function parseUnitString(unitStr: string): string {
    if (!unitStr) { return ""; }

    // Split by / to handle \per
    const parts = unitStr.split('/');
    let result = parseUnitSequence(parts[0]);

    for (let i = 1; i < parts.length; i++) {
        result += '\\per' + parseUnitSequence(parts[i]);
    }

    return result;
}

function parseUnitSequence(seq: string): string {
    if (!seq) { return ""; }
    
    let result = "";
    let remaining = seq.trim();

    while (remaining.length > 0) {
        // Handle powers like ^2
        const powerMatch = remaining.match(/^\^([0-9]+)/);
        if (powerMatch) {
            const power = powerMatch[1];
            if (power === '2') { result += '\\squared'; }
            else if (power === '3') { result += '\\cubed'; }
            else { result += `\\tothe{${power}}`; }
            remaining = remaining.substring(powerMatch[0].length).trim();
            continue;
        }

        // Try to match units from UNIT_MAP greedily
        let matched = false;
        
        // Sort keys by length descending to match longest possible unit first (e.g., kHz before k)
        const unitKeys = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length);
        
        for (const key of unitKeys) {
            if (remaining.startsWith(key)) {
                result += UNIT_MAP[key];
                remaining = remaining.substring(key.length).trim();
                matched = true;
                break;
            }
        }

        if (matched) { continue; }

        // If no unit matched, try to match prefix + base unit
        const prefixKeys = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);
        for (const p of prefixKeys) {
            if (remaining.startsWith(p)) {
                const afterPrefix = remaining.substring(p.length);
                for (const key of unitKeys) {
                    if (afterPrefix.startsWith(key)) {
                        result += PREFIX_MAP[p] + UNIT_MAP[key];
                        remaining = afterPrefix.substring(key.length).trim();
                        matched = true;
                        break;
                    }
                }
                if (matched) { break; }
            }
        }

        if (!matched) {
            result += remaining[0];
            remaining = remaining.substring(1).trim();
        }
    }

    return result;
}
