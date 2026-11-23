/**
 * Pull-Box & Junction-Box Sizing — NEC 314.28
 *
 * Computes minimum pull-box / junction-box dimensions for conduit systems
 * per NEC 314.28(A). Two rules apply depending on whether the conduits run
 * straight through or change direction:
 *
 *   (A)(1) Straight pulls — the length of the box must be ≥ 8 × the trade
 *          size of the largest conduit entering.
 *
 *   (A)(2) Angle and U pulls — the distance from the conduit opening to the
 *          opposite wall must be ≥ 6 × the trade size of the largest conduit
 *          entering that wall + the sum of trade sizes of all other conduits
 *          entering the same wall on the same row.
 *
 * Standard box sizes below are representative steel pull-box catalogue sizes;
 * the function selects the smallest standard box that meets the minimum
 * calculated dimensions.
 */

// ---------------------------------------------------------------------------
// Standard box catalogue (length × width, inches)
// ---------------------------------------------------------------------------

/**
 * Common standard pull-box / junction-box face dimensions.
 * Array of [length, width] pairs, sorted ascending.
 *
 * @type {Array<[number, number]>}
 */
export const STANDARD_BOX_SIZES = Object.freeze([
  [4,   4],
  [6,   6],
  [8,   8],
  [10,  10],
  [12,  12],
  [14,  14],
  [16,  16],
  [18,  18],
  [20,  20],
  [24,  24],
  [30,  24],
  [36,  24],
  [36,  36],
  [48,  36],
  [48,  48],
]);

// ---------------------------------------------------------------------------
// Trade-size parsing
// ---------------------------------------------------------------------------

/**
 * Parse one trade size: decimal ("1.5"), fraction ("3/4"), or mixed number
 * ("1-1/2", "1 1/2"). Returns NaN when the text is not a positive size.
 * parseFloat('1-1/2') is 1, which would silently undersize the box.
 *
 * @param {string|number} value
 * @returns {number}
 */
export function parseTradeSize(value) {
  if (typeof value === 'number') return value > 0 && Number.isFinite(value) ? value : NaN;
  const text = String(value ?? '').trim().replace(/["”″]|in\.?$/gi, '').trim();
  if (!text) return NaN;
  const mixed = text.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) > 0 ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN;
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[2]) > 0 ? Number(fraction[1]) / Number(fraction[2]) : NaN;
  if (!/^\d*\.?\d+$/.test(text)) return NaN;
  const n = Number(text);
  return n > 0 ? n : NaN;
}

/**
 * Parse a list of trade sizes separated by commas or semicolons (whitespace also
 * separates plain numbers, but "2 1/2" is read as the mixed number 2-1/2).
 *
 * @param {string} text
 * @returns {{ sizes: number[], invalid: string[] }}
 */
export function parseTradeSizeList(text) {
  const sizes = [];
  const invalid = [];
  for (const rawToken of String(text ?? '').split(/[,;]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const whole = parseTradeSize(token);
    if (Number.isFinite(whole)) { sizes.push(whole); continue; }
    for (const part of token.split(/\s+/)) {
      const n = parseTradeSize(part);
      if (Number.isFinite(n)) sizes.push(n); else invalid.push(part);
    }
  }
  return { sizes, invalid };
}

// ---------------------------------------------------------------------------
// Straight-pull sizing — NEC 314.28(A)(1)
// ---------------------------------------------------------------------------

/**
 * Minimum box length for a straight pull.
 *
 * @param {number} largestTradeSize  Trade size (inches) of the largest conduit entering
 * @returns {{ minLength: number, formula: string }}
 */
export function straightPullMinLength(largestTradeSize) {
  const ts = parseTradeSize(largestTradeSize);
  if (!(ts > 0)) throw new Error('Enter the trade size of the largest conduit (greater than 0).');
  const minLength = round2(8 * ts);
  return {
    minLength,
    formula: `8 × ${ts}" = ${minLength}"  [NEC 314.28(A)(1)]`,
  };
}

// ---------------------------------------------------------------------------
// Angle / U-pull sizing — NEC 314.28(A)(2)
// ---------------------------------------------------------------------------

/**
 * Minimum box dimension for one conduit wall in an angle or U pull.
 *
 * For each wall with conduits: min dimension = 6 × largest_trade_size + Σ others.
 *
 * @param {number[]} tradeSizesOnWall  Trade sizes of all conduits entering this wall (inches)
 * @returns {{ minDimension: number, formula: string }}
 */
export function anglePullMinDimension(tradeSizesOnWall) {
  if (!Array.isArray(tradeSizesOnWall) || tradeSizesOnWall.length === 0) {
    return { minDimension: 0, formula: 'No conduits on this wall' };
  }
  const sizes   = tradeSizesOnWall.map(parseTradeSize);
  if (sizes.some(ts => !(ts > 0))) throw new Error('Conduit trade sizes must be positive numbers (e.g. 2, 1-1/2, 3/4).');
  const largest = Math.max(...sizes);
  const others  = sizes.filter((_, i) => {
    // Exclude the first occurrence of the largest value only
    const firstLargestIdx = sizes.indexOf(largest);
    return i !== firstLargestIdx;
  });
  const sumOthers  = others.reduce((s, v) => s + v, 0);
  const minDim     = round2(6 * largest + sumOthers);
  const partsStr   = others.length
    ? ` + ${others.map(v => `${v}"`).join(' + ')}`
    : '';
  return {
    minDimension: minDim,
    formula: `6 × ${largest}"${partsStr} = ${minDim}"  [NEC 314.28(A)(2)]`,
  };
}

// ---------------------------------------------------------------------------
// Standard-box selection
// ---------------------------------------------------------------------------

/**
 * Select the smallest standard pull-box size that satisfies the minimum
 * calculated dimensions.
 *
 * @param {number} minLength  Required minimum length (inches)
 * @param {number} [minWidth] Required minimum width (inches); if omitted, same as minLength
 * @returns {{ length: number, width: number, adequate: boolean }}
 */
export function selectStandardBox(minLength, minWidth) {
  const reqL = Math.max(0, Number(minLength) || 0);
  const parsedW = Number(minWidth);
  const reqW = minWidth === undefined || minWidth === null || !Number.isFinite(parsedW) ? reqL : Math.max(0, parsedW);

  // A box can be installed either way round, so 24 × 30 is satisfied by a 30 × 24 box.
  let best = null;
  for (const [l, w] of STANDARD_BOX_SIZES) {
    const fits = l >= reqL && w >= reqW;
    const fitsRotated = l >= reqW && w >= reqL;
    if (!fits && !fitsRotated) continue;
    if (!best || l * w < best.length * best.width) {
      best = fits ? { length: l, width: w, adequate: true } : { length: w, width: l, adequate: true };
    }
  }
  if (best) return best;

  // No standard size is sufficient; return the largest in the catalogue with a flag
  const [maxL, maxW] = STANDARD_BOX_SIZES[STANDARD_BOX_SIZES.length - 1];
  return { length: maxL, width: maxW, adequate: false };
}

// ---------------------------------------------------------------------------
// Convenience: size a pull box given a complete pull-point description
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PullPointInput
 * @property {string}   [label]
 * @property {'straight'|'angle'|'u'} pullType
 * @property {number[]} [wallA]  Trade sizes entering from wall A (angle/U pull)
 * @property {number[]} [wallB]  Trade sizes entering from wall B (angle/U pull)
 * @property {number}   [largestTradeSize]  Required for straight pull
 */

/**
 * @typedef {Object} PullPointResult
 * @property {string}  label
 * @property {string}  pullType
 * @property {number}  minLength
 * @property {number}  minWidth
 * @property {string}  formulaLength
 * @property {string}  formulaWidth
 * @property {{ length: number, width: number, adequate: boolean }} standardBox
 */

/**
 * Size a pull box for a given pull point.
 *
 * @param {PullPointInput} input
 * @returns {PullPointResult}
 */
export function sizePullBox(input) {
  const label    = input.label || 'Pull Box';
  const pullType = (input.pullType || 'straight').toLowerCase();

  if (pullType === 'straight') {
    const { minLength, formula } = straightPullMinLength(input.largestTradeSize);
    const box = selectStandardBox(minLength, minLength);
    return {
      label,
      pullType: 'straight',
      minLength,
      minWidth: minLength,
      formulaLength: formula,
      formulaWidth:  `Same as length (square box)`,
      standardBox:   box,
    };
  }

  // Angle or U pull — compute each wall independently
  const wallA = Array.isArray(input.wallA) ? input.wallA : [];
  const wallB = Array.isArray(input.wallB) ? input.wallB : [];

  if (Array.isArray(input.invalidSizes) && input.invalidSizes.length) {
    throw new Error(`Unrecognised conduit size(s): ${input.invalidSizes.join(', ')}. Use values like 2, 1-1/2 or 3/4.`);
  }
  if (wallA.length === 0 && wallB.length === 0) {
    throw new Error('Enter at least one conduit trade size for an angle or U pull.');
  }
  const resA = anglePullMinDimension(wallA);
  const resB = anglePullMinDimension(wallB);

  const minLength = resA.minDimension;
  const minWidth  = resB.minDimension;
  const box       = selectStandardBox(minLength, minWidth);

  return {
    label,
    pullType,
    minLength,
    minWidth,
    formulaLength: resA.formula,
    formulaWidth:  resB.formula,
    standardBox:   box,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}
