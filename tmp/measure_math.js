const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

// Initialize MathJax components
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'none' });
const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

/**
 * Calculates the dimensions of a LaTeX formula.
 * @param {string} formula - The LaTeX string to measure.
 * @param {object} options - Options for measurement.
 * @returns {object} - { widthEx, heightEx, widthPx, heightPx, isTooLong }
 */
function measureFormula(formula, options = {}) {
  const { 
    fontSize = 16, 
    maxWidthPx = 500,
    exToPxFactor = 0.5 * 1.5 // 1ex ≈ 0.5em, 1em = fontSize, but MathJax's 'ex' in SVG can vary. 
                             // Rough estimate for 16px: 1ex ≈ 8px-12px.
  } = options;

  const node = html.convert(formula, { display: true });
  const svgTag = adaptor.firstChild(node);
  
  const widthStr = adaptor.getAttribute(svgTag, 'width');
  const heightStr = adaptor.getAttribute(svgTag, 'height');
  
  const widthEx = parseFloat(widthStr.replace('ex', ''));
  const heightEx = parseFloat(heightStr.replace('ex', ''));
  
  // Convert ex to approximate pixels
  // In many fonts, 1ex is around 0.45em to 0.55em.
  const widthPx = Math.round(widthEx * (fontSize * 0.5));
  const heightPx = Math.round(heightEx * (fontSize * 0.5));
  
  // Complexity metrics
  const symbolCount = (formula.match(/\\[a-zA-Z]+/g) || []).length;
  const charCount = formula.length;

  // Suggest fix if too long
  let suggestedFix = null;
  if (widthPx > maxWidthPx) {
    if (!formula.includes('\\\\') && !formula.includes('begin{align}') && !formula.includes('begin{split}')) {
      suggestedFix = "Consider breaking this formula into multiple lines using '\\begin{split}' or '\\begin{align}'.";
    } else {
      suggestedFix = "Consider reducing font size or using a more compact notation.";
    }
  }

  return {
    formula,
    widthEx: widthEx.toFixed(3),
    heightEx: heightEx.toFixed(3),
    widthPx,
    heightPx,
    symbolCount,
    charCount,
    isTooLong: widthPx > maxWidthPx,
    thresholdPx: maxWidthPx,
    suggestedFix
  };
}

// CLI usage
if (require.main === module) {
  const formula = process.argv[2] || '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}';
  const maxWidth = parseInt(process.argv[3]) || 500;
  
  try {
    const result = measureFormula(formula, { maxWidthPx: maxWidth });
    console.log(JSON.stringify(result, null, 2));
    
    if (result.isTooLong) {
      console.log(`\n⚠️ Warning: Formula exceeds the max width of ${maxWidth}px!`);
    } else {
      console.log(`\n✅ Formula fits within ${maxWidth}px.`);
    }
  } catch (err) {
    console.error('Error measuring formula:', err.message);
    process.exit(1);
  }
}

module.exports = { measureFormula };
