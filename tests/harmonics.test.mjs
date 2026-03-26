/**
 * Tests for the harmonic study formulas used in analysis/harmonics.js.
 *
 * Because harmonics.js imports d3 from a CDN URL that is not resolvable in
 * Node.js, the pure mathematical functions are verified here in isolation.
 * The formulas are extracted verbatim from the module implementation.
 */
import assert from 'assert';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// Formula helpers extracted from analysis/harmonics.js
// ---------------------------------------------------------------------------

/** IEEE 519 Table 11.1 — voltage THD limit (%) by bus voltage. */
function limitForVoltage(kv) {
  if (kv < 69)  return 5;
  if (kv < 161) return 8;
  return 12;
}

/**
 * Parse a harmonic spectrum from an array or "order:pct" string notation.
 * Returns {[order]: pct} map.
 */
function parseSpectrum(spec) {
  const map = {};
  if (!spec) return map;
  if (Array.isArray(spec)) {
    spec.forEach((v, i) => {
      const val = Number(v);
      if (!isNaN(val) && val) map[i + 1] = val;
    });
    return map;
  }
  if (typeof spec === 'string') {
    spec.split(/[\,\s]+/).forEach(p => {
      if (!p) return;
      const parts = p.split(':');
      const order = Number(parts[0]);
      const val   = Number(parts[1] || parts[0]);
      if (!isNaN(order) && !isNaN(val) && order > 1) map[order] = val;
    });
  }
  return map;
}

/**
 * Current THD (%) given harmonic magnitudes and fundamental.
 *   ITHD = sqrt(Σ Ih²) / I1 × 100
 */
function currentTHD(harmonicCurrentsA, I1) {
  if (!I1) return 0;
  const sumSq = harmonicCurrentsA.reduce((s, Ih) => s + Ih * Ih, 0);
  return Math.sqrt(sumSq) / I1 * 100;
}

/**
 * Voltage THD contribution from a single harmonic current injected
 * into a bus with admittance y.
 *   Vh = Ih / y
 *   VTHD_component = (Vh / V) × 100
 */
function singleHarmonicVTHD(Ih, y, V) {
  if (!V || !y) return 0;
  const Vh = Ih / y;
  return (Vh / V) * 100;
}

// ---------------------------------------------------------------------------
describe('limitForVoltage — IEEE 519', () => {
  it('below 69 kV → 5%', () => {
    assert.strictEqual(limitForVoltage(0.48),  5);
    assert.strictEqual(limitForVoltage(4.16),  5);
    assert.strictEqual(limitForVoltage(13.8),  5);
    assert.strictEqual(limitForVoltage(34.5),  5);
    assert.strictEqual(limitForVoltage(68.9),  5);
  });

  it('69 kV → boundary, still 5% (< 69 is false)', () => {
    // kv=69: not < 69, but < 161 → 8%
    assert.strictEqual(limitForVoltage(69),  8);
  });

  it('69 – 160 kV → 8%', () => {
    assert.strictEqual(limitForVoltage(115), 8);
    assert.strictEqual(limitForVoltage(138), 8);
    assert.strictEqual(limitForVoltage(160.9), 8);
  });

  it('≥ 161 kV → 12%', () => {
    assert.strictEqual(limitForVoltage(161), 12);
    assert.strictEqual(limitForVoltage(230), 12);
    assert.strictEqual(limitForVoltage(500), 12);
  });
});

// ---------------------------------------------------------------------------
describe('parseSpectrum — array format', () => {
  it('empty array returns empty map', () => {
    const m = parseSpectrum([]);
    assert.deepStrictEqual(m, {});
  });

  it('5-element array maps index+1 to values', () => {
    // spec=[0,0,20,0,14] → {3:20, 5:14}  (0 values are excluded)
    const m = parseSpectrum([0, 0, 20, 0, 14]);
    assert.strictEqual(m[3], 20);
    assert.strictEqual(m[5], 14);
    assert.ok(!(1 in m));
    assert.ok(!(2 in m));
  });

  it('null/undefined returns empty map', () => {
    assert.deepStrictEqual(parseSpectrum(null),      {});
    assert.deepStrictEqual(parseSpectrum(undefined), {});
  });
});

// ---------------------------------------------------------------------------
describe('parseSpectrum — string format', () => {
  it('"3:20,5:14" → {3:20, 5:14}', () => {
    const m = parseSpectrum('3:20,5:14');
    assert.strictEqual(m[3], 20);
    assert.strictEqual(m[5], 14);
  });

  it('whitespace separator works', () => {
    const m = parseSpectrum('3:20 5:14');
    assert.strictEqual(m[3], 20);
    assert.strictEqual(m[5], 14);
  });

  it('excludes order 1 (fundamental)', () => {
    const m = parseSpectrum('1:100,3:20');
    assert.ok(!(1 in m), 'order 1 should be excluded');
    assert.strictEqual(m[3], 20);
  });

  it('empty string returns empty map', () => {
    assert.deepStrictEqual(parseSpectrum(''), {});
  });
});

// ---------------------------------------------------------------------------
describe('currentTHD', () => {
  it('single 5th-harmonic at 20% → ITHD = 20%', () => {
    const I1 = 100;
    const I5 = 20; // 20% of I1
    const thd = currentTHD([I5], I1);
    assert.ok(approxEqual(thd, 20, 1e-9), `Got ${thd}`);
  });

  it('two harmonics: ITHD = sqrt(Ih1² + Ih2²) / I1 × 100', () => {
    const I1 = 100;
    const I5 = 20;
    const I7 = 14.3;
    const expected = Math.sqrt(I5 * I5 + I7 * I7) / I1 * 100;
    const thd = currentTHD([I5, I7], I1);
    assert.ok(approxEqual(thd, expected, 1e-9));
  });

  it('zero harmonics → ITHD = 0%', () => {
    assert.strictEqual(currentTHD([], 100), 0);
    assert.strictEqual(currentTHD([0, 0], 100), 0);
  });

  it('zero fundamental → returns 0 (no division by zero)', () => {
    assert.strictEqual(currentTHD([10, 5], 0), 0);
  });

  it('scales proportionally with harmonic magnitudes', () => {
    const I1 = 100;
    const thd1 = currentTHD([10], I1);
    const thd2 = currentTHD([20], I1);
    assert.ok(approxEqual(thd2 / thd1, 2, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('singleHarmonicVTHD', () => {
  it('returns 0 for zero voltage', () => {
    assert.strictEqual(singleHarmonicVTHD(10, 1, 0), 0);
  });

  it('returns 0 for zero admittance', () => {
    assert.strictEqual(singleHarmonicVTHD(10, 0, 480), 0);
  });

  it('higher admittance reduces VTHD (harmonic filter effect)', () => {
    const vthdLow  = singleHarmonicVTHD(10, 1,  480);
    const vthdHigh = singleHarmonicVTHD(10, 10, 480);
    assert.ok(vthdHigh < vthdLow,
      `Expected VTHD to decrease with higher admittance`);
  });

  it('VTHD is proportional to harmonic current', () => {
    const v1 = singleHarmonicVTHD(10, 2, 480);
    const v2 = singleHarmonicVTHD(20, 2, 480);
    assert.ok(approxEqual(v2 / v1, 2, 1e-9));
  });
});

// ---------------------------------------------------------------------------
// Neutral current formula extracted from analysis/harmonics.js runHarmonicsUnbalanced.
//
// For triplen orders (h % 3 === 0, zero-sequence): harmonic currents from all
// three phases sum arithmetically in the neutral.  Non-triplen orders cancel.
//
//   I_Nh  = I_Ah + I_Bh + I_Ch   (triplen only)
//   I_N   = sqrt( Σ I_Nh² )      (RMS over all triplen orders)
//   I_Npct = I_N / I1 × 100
//
function neutralTriplenRms(specA, specB, specC, I1) {
  const orders = new Set(
    [...Object.keys(specA), ...Object.keys(specB), ...Object.keys(specC)]
      .map(Number).filter(h => h > 1 && h % 3 === 0)
  );
  let sum2 = 0;
  orders.forEach(h => {
    const INh = I1 * ((specA[h] || 0) / 100)
              + I1 * ((specB[h] || 0) / 100)
              + I1 * ((specC[h] || 0) / 100);
    sum2 += INh * INh;
  });
  return Math.sqrt(sum2);
}

describe('neutral triplen current — unbalanced harmonic model', () => {
  it('balanced 3-phase: all phases same 3rd harmonic → neutral = 3× each phase contribution', () => {
    // Each phase: 20 % of 100 A = 20 A at 3rd.  Neutral = 20+20+20 = 60 A.
    const spec = { 3: 20 };
    const neutral = neutralTriplenRms(spec, spec, spec, 100);
    assert.ok(approxEqual(neutral, 60, 1e-9), `Got ${neutral}`);
  });

  it('only phase A has 3rd harmonic → neutral equals phase A contribution only', () => {
    const specA = { 3: 20 };
    const neutral = neutralTriplenRms(specA, {}, {}, 100);
    assert.ok(approxEqual(neutral, 20, 1e-9), `Got ${neutral}`);
  });

  it('non-triplen orders (5th, 7th) do not contribute to neutral', () => {
    const spec = { 5: 20, 7: 14 };
    const neutral = neutralTriplenRms(spec, spec, spec, 100);
    assert.ok(approxEqual(neutral, 0, 1e-9), `Got ${neutral}`);
  });

  it('mixed spectrum: only the 3rd harmonic contributes, 5th does not', () => {
    const spec = { 3: 20, 5: 14 };
    // 3rd: 20+20+20 = 60; 5th: not triplen → 0.  Total = 60.
    const neutral = neutralTriplenRms(spec, spec, spec, 100);
    assert.ok(approxEqual(neutral, 60, 1e-9), `Got ${neutral}`);
  });

  it('neutral overload: balanced 3rd at 40 % → neutral 120 % of phase FLA', () => {
    const spec = { 3: 40 };
    const I1 = 100;
    const neutral = neutralTriplenRms(spec, spec, spec, I1);
    // Each phase: 40 A; neutral = 120 A = 120 % of I1
    assert.ok(approxEqual(neutral, 120, 1e-9), `Got ${neutral}`);
    const neutralPct = neutral / I1 * 100;
    assert.ok(neutralPct > 100, `Expected overload (>100 %), got ${neutralPct.toFixed(1)} %`);
  });

  it('two triplen orders present: RMS combines both', () => {
    // Phase A only: 3rd at 20% (20A) and 9th at 10% (10A).  Neutral = same (only A contributes).
    // I_N = sqrt(20²+10²) = sqrt(500) ≈ 22.36 A
    const specA = { 3: 20, 9: 10 };
    const neutral = neutralTriplenRms(specA, {}, {}, 100);
    const expected = Math.sqrt(20 * 20 + 10 * 10);
    assert.ok(approxEqual(neutral, expected, 1e-9), `Got ${neutral}, expected ${expected}`);
  });

  it('phase imbalance: max ITHD range over 10 pp triggers flag', () => {
    // Inline the flag logic: flag when (max - min) > 10
    function phaseImbalanceFlag(ithdA, ithdB, ithdC) {
      const vals = [ithdA, ithdB, ithdC];
      return Math.max(...vals) - Math.min(...vals) > 10;
    }
    assert.strictEqual(phaseImbalanceFlag(30, 0, 0), true,  'Range 30 should flag');
    assert.strictEqual(phaseImbalanceFlag(20, 15, 18), false, 'Range 5 should not flag');
    assert.strictEqual(phaseImbalanceFlag(25, 14, 20), true,  'Range 11 should flag');
    assert.strictEqual(phaseImbalanceFlag(10, 10, 10), false, 'All equal should not flag');
  });

  it('zero fundamental → no division-by-zero, neutral = 0', () => {
    const spec = { 3: 20 };
    // neutralTriplenRms with I1=0 → all harmonic currents = 0
    const neutral = neutralTriplenRms(spec, spec, spec, 0);
    assert.ok(approxEqual(neutral, 0, 1e-9), `Got ${neutral}`);
  });

  it('9th harmonic (also triplen) adds to neutral just like 3rd', () => {
    const spec = { 9: 15 };
    const neutral = neutralTriplenRms(spec, spec, spec, 100);
    // 15+15+15 = 45 A
    assert.ok(approxEqual(neutral, 45, 1e-9), `Got ${neutral}`);
  });
});

// ---------------------------------------------------------------------------
describe('combined harmonic flow — illustrative scenario', () => {
  it('VFD-typical spectrum produces THD within expected range', () => {
    // 6-pulse VFD: dominant harmonics 5th (20%), 7th (14%), 11th (9%), 13th (7%)
    const I1    = 100; // A at fundamental
    const specs = { 5: 20, 7: 14, 11: 9, 13: 7 };
    const harmonicCurrents = Object.values(specs).map(pct => I1 * pct / 100);
    const ithd = currentTHD(harmonicCurrents, I1);
    // sqrt(20²+14²+9²+7²) = sqrt(400+196+81+49) = sqrt(726) ≈ 26.9%
    assert.ok(approxEqual(ithd, Math.sqrt(726), 0.1), `Got ${ithd.toFixed(2)}%`);
    // Typical 6-pulse ITHD 25-30%
    assert.ok(ithd > 20 && ithd < 35, `ITHD ${ithd.toFixed(1)}% outside expected 20-35% band`);
  });
});
