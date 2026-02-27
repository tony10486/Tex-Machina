const fs = require('fs');
const { measureFormula } = require('./measure_math.js');

const FORMULA_FILE = 'math_formulas.json';
const MAX_WIDTH_PX = 400; // Customizable threshold

async function checkAllFormulas() {
  if (!fs.existsSync(FORMULA_FILE)) {
    console.error(`Error: ${FORMULA_FILE} not found.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(FORMULA_FILE, 'utf-8'));
  const formulas = data.formulas || [];

  console.log(`Checking ${formulas.length} formulas against ${MAX_WIDTH_PX}px threshold...
`);
  
  const results = [];
  let longCount = 0;

  for (const item of formulas) {
    try {
      const result = measureFormula(item.latex, { maxWidthPx: MAX_WIDTH_PX });
      if (result.isTooLong) {
        longCount++;
        results.push({
          id: item.id,
          name: item.name,
          latex: item.latex,
          widthPx: result.widthPx,
          widthEx: result.widthEx
        });
      }
    } catch (err) {
      console.warn(`[WARN] Skipping formula ${item.id}: ${err.message}`);
    }
  }

  if (longCount > 0) {
    console.log(`⚠️ Found ${longCount} formulas that are too long:`);
    console.table(results);
  } else {
    console.log(`✅ All formulas fit within ${MAX_WIDTH_PX}px.`);
  }

  // Save detailed report to tmp
  fs.writeFileSync('tmp/length_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    threshold: MAX_WIDTH_PX,
    totalChecked: formulas.length,
    tooLongCount: longCount,
    details: results
  }, null, 2));
  console.log(`
Report saved to tmp/length_report.json`);
}

checkAllFormulas();
