function getJumpPoints(text) {
    const points = new Set();
    const regex = /\\\\|\\\{|\\\}|\\\[|\\\]|\\(?:[a-zA-Z]+)|[\{\}\[\]\(\)\^\_\&\=\+\-\*\/\<\>]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const m = match[0];
        const pos = match.index;
        if (m === '{' || m === '[' || m === '(') {
            points.add(pos + 1);
        } else if (m === '^' || m === '_') {
            let nextChar = pos + 1 < text.length ? text[pos + 1] : '';
            if (nextChar === '{' || nextChar === '[' || nextChar === '(') { }
            else {
                points.add(pos + 1);
                if (pos + 1 < text.length && !/\s/.test(nextChar)) { points.add(pos + 2); }
            }
        } else if (m === '&' || m === '\\\\' || m === '=' || m === '+' || m === '-') {
            points.add(pos);
            let endPos = pos + m.length;
            while (endPos < text.length && /\s/.test(text[endPos])) { endPos++; }
            points.add(endPos);
        } else if (m.startsWith('\\')) {
            const skipPrefix = ['\\frac', '\\sqrt', '\\int', '\\sum', '\\prod', '\\lim'];
            if (!skipPrefix.some(p => m.startsWith(p))) { points.add(pos); }
        }
    }
    points.add(0);
    points.add(text.length);
    return Array.from(points).filter(p => p >= 0 && p <= text.length).sort((a, b) => a - b);
}

const text = "\\frac{}{} \\int_{}^{} \\sum_{}^{} \\prod_{}^{}";
const points = getJumpPoints(text);

console.log("Text length:", text.length);
console.log("Points:", points);

points.forEach(p => {
    const left = text.substring(0, p);
    const right = text.substring(p);
    console.log(`Point ${p}: ${left}|${right}`);
});
