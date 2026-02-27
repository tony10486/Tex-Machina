const { measureFormula } = require('./measure_math.js');

const formula = process.argv[2] || '\\sum_{n=1}^{10} n = 55';
const maxWidth = parseInt(process.argv[3]) || 50; 

const res = measureFormula(formula, { maxWidthPx: maxWidth });

console.log("\nFormula: " + res.formula);
console.log("Dimensions: " + res.widthEx + "ex x " + res.heightEx + "ex (Approx " + res.widthPx + "px x " + res.heightPx + "px)");

const w = Math.max(Math.min(Math.ceil(res.widthPx / 5), 100), 20);
const h = Math.max(Math.min(Math.ceil(res.heightPx / 10), 10), 3);

console.log('Bounding Box:');
console.log('┌' + '─'.repeat(w) + '┐');
for (let i = 0; i < h; i++) {
  if (i === Math.floor(h/2)) {
    const text = " LaTeX Content ";
    const leftPad = Math.max(Math.floor((w - text.length) / 2), 0);
    const rightPad = Math.max(w - text.length - leftPad, 0);
    if (w > text.length) {
        console.log('│' + ' '.repeat(leftPad) + text + ' '.repeat(rightPad) + '│');
    } else {
        console.log('│' + ' '.repeat(w) + '│');
    }
  } else {
    console.log('│' + ' '.repeat(w) + '│');
  }
}
console.log('└' + '─'.repeat(w) + '┘');

if (res.isTooLong) {
  console.log("\n⚠️  WARNING: Exceeds " + res.thresholdPx + "px threshold!");
  console.log("💡  Suggestion: " + res.suggestedFix);
} else {
  console.log("\n✅  Width is within limits.");
}
