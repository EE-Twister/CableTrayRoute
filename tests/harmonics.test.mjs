/**
 * Tests for the harmonic study formulas used in analysis/harmonics.js.
 *
 * Because harmonics.js imports d3 from a CDN URL that is not resolvable in
 * Node.js, the pure mathematical functions are verified here in isolation.
 * The formulas are extracted verbatim from the module implementation.
 */
import assert from 'assert';
import { parseHarmonicSpectrum } from '../analysis/harmonicStudyCase.mjs';

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

describe('harmonic study-case spectrum parser compatibility', () => {
  it('accepts legacy text spectra for packaged study cases', () => {
    assert.deepStrictEqual(parseHarmonicSpectrum('5:35,7:25'), { 5: 35, 7: 25 });
  });

  it('accepts JSON spectra for source-row imports', () => {
    assert.deepStrictEqual(parseHarmonicSpectrum('{"5":35,"7":25}'), { 5: 35, 7: 25 });
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
// frequencyScan helpers extracted from analysis/harmonics.js
// (analysis/harmonics.js imports d3 from a CDN URL not resolvable in Node,
//  so the pure calculation logic is duplicated here for unit-testing.)
// ---------------------------------------------------------------------------

function frequencyScan({
  busVoltageKv = 13.8,
  scMVA = 100,
  capacitorBanks = [],
  hMax = 25,
  qSystem = 20,
  step = 0.1
} = {}) {
  const kv   = Number(busVoltageKv) || 1;
  const sc   = Number(scMVA)        || 1;
  const Qsys = Number(qSystem)      || 20;
  const ySrc1 = sc / (kv * kv);

  const banks = (capacitorBanks || []).map(b => {
    const bKv = Number(b.kv) || kv;
    return {
      b1: Number(b.mvar) / (bKv * bKv),
      ht: Number(b.tuneOrder) || 0,
      q:  Number(b.qFactor)  || 30
    };
  }).filter(b => b.b1 > 0);

  function admittance(h) {
    const gSrc = ySrc1 / (h * Qsys);
    const bSrc = ySrc1 / h;
    let gCap = 0, bCap = 0;
    banks.forEach(({ b1, ht, q }) => {
      if (ht > 0) {
        const xC1  = 1 / b1;
        const xL_h = h * xC1 / (ht * ht);
        const xC_h = xC1 / h;
        const R    = xC1 / (q * ht);
        const xNet = xL_h - xC_h;
        const dSq  = R * R + xNet * xNet;
        gCap += R    / dSq;
        bCap += -xNet / dSq;
      } else {
        bCap += b1 * h;
      }
    });
    return { g: gSrc + gCap, b: -bSrc + bCap };
  }

  const sweep = [];
  const hEnd = Math.round(hMax * 10);
  for (let hi = 10; hi <= hEnd; hi++) {
    const h = hi / 10;
    const { g, b } = admittance(h);
    const yMag = Math.sqrt(g * g + b * b);
    const zPu  = yMag > 0 ? Math.round((ySrc1 / yMag) * 10000) / 10000 : 1e6;
    sweep.push({ h, zPu });
  }

  const resonances = [];
  for (let i = 1; i < sweep.length - 1; i++) {
    const prev = sweep[i - 1].zPu;
    const curr = sweep[i].zPu;
    const next = sweep[i + 1].zPu;
    const h    = sweep[i].h;
    if (banks.length > 0 && curr > prev && curr > next && curr > 1.0) {
      const nearestHarmonic = Math.round(h);
      const dist = Math.abs(h - nearestHarmonic);
      const risk = dist <= 0.3 ? 'danger' : 'caution';
      let rec = null;
      if (risk === 'danger') {
        rec = `Parallel resonance at h\u2248${h.toFixed(1)} coincides with the ${nearestHarmonic}th harmonic. Add a detuning reactor to shift the resonant frequency away from this order.`;
      } else {
        rec = `Resonance at h\u2248${h.toFixed(1)} is near the ${nearestHarmonic}th harmonic. Monitor harmonic injection levels; consider detuning if injection is significant.`;
      }
      resonances.push({ hOrder: h, zPu: curr, type: 'parallel', risk, nearestHarmonic, detuneRecommendation: rec });
    }
    if (curr < prev && curr < next && banks.some(b => b.ht > 0)) {
      resonances.push({ hOrder: h, zPu: curr, type: 'series', risk: 'safe', nearestHarmonic: Math.round(h), detuneRecommendation: null });
    }
  }
  return { sweep, resonances };
}

// HS-01: No capacitors — purely inductive source, no resonances
describe('HS-01 frequencyScan — no capacitors', () => {
  const { sweep, resonances } = frequencyScan({ busVoltageKv: 13.8, scMVA: 100, capacitorBanks: [] });

  it('sweep spans h=1.0 to h=25.0', () => {
    assert.strictEqual(sweep[0].h, 1.0);
    assert.strictEqual(sweep[sweep.length - 1].h, 25.0);
  });

  it('impedance is monotonically increasing (source is inductive)', () => {
    for (let i = 1; i < sweep.length; i++) {
      assert.ok(sweep[i].zPu >= sweep[i - 1].zPu,
        `Z decreased at h=${sweep[i].h}: ${sweep[i].zPu} < ${sweep[i - 1].zPu}`);
    }
  });

  it('no resonances detected', () => {
    assert.strictEqual(resonances.length, 0);
  });
});

// HS-02: Single untuned capacitor — resonance near h≈4.47
// h_res = sqrt(scMVA / capMVAR) = sqrt(100/5) = sqrt(20) ≈ 4.47
// nearestHarmonic = round(4.47) = 4, dist = 0.47 → caution
describe('HS-02 frequencyScan — untuned capacitor, resonance near h≈4.47', () => {
  const { sweep, resonances } = frequencyScan({
    busVoltageKv: 13.8, scMVA: 100,
    capacitorBanks: [{ mvar: 5, kv: 13.8 }]
  });

  it('exactly one parallel resonance detected', () => {
    const parallel = resonances.filter(r => r.type === 'parallel');
    assert.strictEqual(parallel.length, 1);
  });

  it('resonance is near h≈4.47 (within ±0.3 tolerance)', () => {
    const expected = Math.sqrt(100 / 5);  // ≈ 4.47
    const r = resonances.find(r => r.type === 'parallel');
    assert.ok(r, 'No parallel resonance found');
    assert.ok(Math.abs(r.hOrder - expected) <= 0.3,
      `Resonance at h=${r.hOrder}, expected ≈${expected.toFixed(2)}`);
  });

  it('risk is caution (sweep peak at h=4.5, dist=0.5 from h=5)', () => {
    // h_res ≈ 4.47; closest sweep step (0.1) is h=4.5; Math.round(4.5)=5 in JS
    const r = resonances.find(r => r.type === 'parallel');
    assert.strictEqual(r.risk, 'caution');
    assert.strictEqual(r.nearestHarmonic, 5);
  });

  it('impedance peak is higher than source-only impedance at same order', () => {
    const noCap = frequencyScan({ busVoltageKv: 13.8, scMVA: 100, capacitorBanks: [] });
    const r = resonances.find(r => r.type === 'parallel');
    const zNoCap = noCap.sweep.find(p => p.h === r.hOrder)?.zPu ?? 0;
    assert.ok(r.zPu > zNoCap, `Peak Z=${r.zPu} should exceed no-cap Z=${zNoCap}`);
  });
});

// HS-03: Tuned filter at h_t=4.7, Q=30 — series resonance null near h=4.7
describe('HS-03 frequencyScan — tuned filter at h=4.7', () => {
  const { resonances } = frequencyScan({
    busVoltageKv: 13.8, scMVA: 100,
    capacitorBanks: [{ mvar: 5, kv: 13.8, tuneOrder: 4.7, qFactor: 30 }]
  });

  it('series resonance detected near filter tuning order h=4.7', () => {
    const series = resonances.filter(r => r.type === 'series');
    assert.ok(series.length >= 1, 'Expected at least one series resonance');
    const nearFilter = series.find(r => Math.abs(r.hOrder - 4.7) <= 0.3);
    assert.ok(nearFilter, `No series resonance near h=4.7; found: ${series.map(r => r.hOrder).join(',')}`);
  });

  it('series resonance is classified as safe', () => {
    const series = resonances.filter(r => r.type === 'series');
    series.forEach(r => assert.strictEqual(r.risk, 'safe'));
  });
});

// HS-04: Resonance exactly at h=5 — should be classified as danger
// h_res = 5 exactly → capMVAR = scMVA/25 = 100/25 = 4
describe('HS-04 frequencyScan — resonance at integer h=5 → danger', () => {
  const { resonances } = frequencyScan({
    busVoltageKv: 13.8, scMVA: 100,
    capacitorBanks: [{ mvar: 4, kv: 13.8 }]   // h_res = sqrt(100/4) = 5.0
  });

  it('parallel resonance detected near h=5', () => {
    const r = resonances.find(r => r.type === 'parallel' && Math.abs(r.hOrder - 5) <= 0.3);
    assert.ok(r, `No resonance near h=5; found at: ${resonances.map(r => r.hOrder).join(',')}`);
  });

  it('risk is danger', () => {
    const r = resonances.find(r => r.type === 'parallel' && Math.abs(r.hOrder - 5) <= 0.3);
    assert.strictEqual(r.risk, 'danger');
  });

  it('detuneRecommendation mentions the 5th harmonic', () => {
    const r = resonances.find(r => r.type === 'parallel' && Math.abs(r.hOrder - 5) <= 0.3);
    assert.ok(r.detuneRecommendation?.includes('5'), `Recommendation should mention "5": ${r.detuneRecommendation}`);
  });
});

// HS-05: Resonance at h≈4.6 (nearestHarmonic=5, dist=0.4) → caution
// h_res = 4.6 → capMVAR = scMVA/4.6² ≈ 4.73 MVAR
describe('HS-05 frequencyScan — resonance at h≈4.6 → caution', () => {
  const capMvar = 100 / (4.6 * 4.6);  // ≈ 4.73
  const { resonances } = frequencyScan({
    busVoltageKv: 13.8, scMVA: 100,
    capacitorBanks: [{ mvar: capMvar, kv: 13.8 }]
  });

  it('parallel resonance detected near h=4.6', () => {
    const r = resonances.find(r => r.type === 'parallel' && Math.abs(r.hOrder - 4.6) <= 0.3);
    assert.ok(r, `No resonance near h=4.6; found at: ${resonances.map(r => r.hOrder).join(',')}`);
  });

  it('risk is caution (dist≈0.4 from nearest integer h=5)', () => {
    const r = resonances.find(r => r.type === 'parallel' && Math.abs(r.hOrder - 4.6) <= 0.3);
    assert.strictEqual(r.risk, 'caution');
    assert.strictEqual(r.nearestHarmonic, 5);
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
