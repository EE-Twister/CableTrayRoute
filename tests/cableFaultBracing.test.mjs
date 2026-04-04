/**
 * Tests for analysis/cableFaultBracing.mjs
 *
 * Verifies the IEC 60909-0 peak factor, peak current, electromagnetic force,
 * cleat load, and full integration calculations against hand-calculated values.
 *
 * Hand-calculation reference (three-phase, trefoil):
 *   I_sc = 25 kA,  X/R = 10
 *   κ = 1.02 + 0.98 × e^(−3/10) = 1.02 + 0.98 × 0.74082 = 1.7460
 *   i_peak = 1.7460 × √2 × 25 000 = 61 731 A ≈ 61.731 kA
 *   F = √3×10⁻⁷ × (61 731)² / 0.050  (spacing = 50 mm = 0.050 m)
 *     = 1.73205×10⁻⁷ × 3 810 715 961 / 0.050
 *     = 1.73205×10⁻⁷ × 76 214 319 220
 *     ≈ 13 200 N/m
 *   T = 13 200 × 0.900  (cleat spacing = 900 mm)  = 11 880 N = 11.880 kN
 *   T_req = 11.880 × 2.5 = 29.70 kN
 */

import assert from 'assert';
import {
  calcPeakFactor,
  calcPeakCurrent,
  calcEmfForcePerMeter,
  calcCleatLoad,
  nmToLbfFt,
  calcCableFaultBracing,
} from '../analysis/cableFaultBracing.mjs';

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

// ---------------------------------------------------------------------------
// calcPeakFactor
// ---------------------------------------------------------------------------
describe('calcPeakFactor — IEC 60909-0 §4.3.1.1', () => {
  it('returns 1.02 for X/R = 0 (purely resistive)', () => {
    assert.strictEqual(calcPeakFactor(0), 1.02);
  });

  it('approaches 2.0 for very high X/R (purely inductive)', () => {
    const kappa = calcPeakFactor(1000);
    assert.ok(kappa > 1.99 && kappa <= 2.0,
      `Expected κ ≈ 2.0 for X/R=1000, got ${kappa}`);
  });

  it('X/R = 10 → κ ≈ 1.7460', () => {
    const kappa = calcPeakFactor(10);
    const expected = 1.02 + 0.98 * Math.exp(-3 / 10);
    assert.ok(Math.abs(kappa - expected) < 1e-9,
      `Expected ${expected.toFixed(6)}, got ${kappa}`);
  });

  it('X/R = 5 → κ < X/R = 10 result (lower offset at lower X/R)', () => {
    assert.ok(calcPeakFactor(5) < calcPeakFactor(10),
      'Higher X/R should give higher κ');
  });

  it('throws for negative X/R', () => {
    assert.throws(() => calcPeakFactor(-1), /X\/R/);
  });

  it('throws for NaN', () => {
    assert.throws(() => calcPeakFactor(NaN), /X\/R/);
  });
});

// ---------------------------------------------------------------------------
// calcPeakCurrent
// ---------------------------------------------------------------------------
describe('calcPeakCurrent', () => {
  it('i_peak = κ × √2 × I_sc', () => {
    const kappa  = calcPeakFactor(10);
    const iPeak  = calcPeakCurrent(25000, kappa);
    const expected = kappa * Math.SQRT2 * 25000;
    assert.ok(Math.abs(iPeak - expected) < 0.01,
      `Expected ${expected.toFixed(2)}, got ${iPeak}`);
  });

  it('κ = 1.02 (min) gives i_peak = 1.02 × √2 × I_sc', () => {
    const iPeak = calcPeakCurrent(10000, 1.02);
    assert.ok(Math.abs(iPeak - 1.02 * Math.SQRT2 * 10000) < 0.01);
  });

  it('throws for zero fault current', () => {
    assert.throws(() => calcPeakCurrent(0, 1.5), /current/);
  });

  it('throws for negative fault current', () => {
    assert.throws(() => calcPeakCurrent(-1000, 1.5), /current/);
  });

  it('throws for κ < 1.02', () => {
    assert.throws(() => calcPeakCurrent(10000, 1.0), /κ|factor/i);
  });
});

// ---------------------------------------------------------------------------
// calcEmfForcePerMeter
// ---------------------------------------------------------------------------
describe('calcEmfForcePerMeter — force law coefficients', () => {
  it('single-phase uses 2×10⁻⁷ coefficient', () => {
    // F = 2e-7 × I² / d
    const iPeak = 10000;
    const d     = 0.05;
    const F     = calcEmfForcePerMeter(iPeak, d, 'single-phase');
    const expected = 2e-7 * (iPeak ** 2) / d;
    assert.ok(Math.abs(F - expected) < 1e-6,
      `Expected ${expected.toFixed(4)}, got ${F}`);
  });

  it('three-phase uses √3×10⁻⁷ coefficient', () => {
    const iPeak = 10000;
    const d     = 0.05;
    const F     = calcEmfForcePerMeter(iPeak, d, 'three-phase');
    const expected = Math.sqrt(3) * 1e-7 * (iPeak ** 2) / d;
    assert.ok(Math.abs(F - expected) < 1e-6,
      `Expected ${expected.toFixed(4)}, got ${F}`);
  });

  it('three-phase produces lower force than single-phase at same current and spacing (√3 < 2)', () => {
    const F3 = calcEmfForcePerMeter(50000, 0.04, 'three-phase');
    const F1 = calcEmfForcePerMeter(50000, 0.04, 'single-phase');
    // √3×10⁻⁷ ≈ 1.732×10⁻⁷ < 2×10⁻⁷ (single-phase).  The 3-phase maximum arises
    // from a combination of currents in the balanced fault, not from one conductor
    // seeing the full peak of another — hence the lower coefficient.
    assert.ok(F3 < F1, 'three-phase (√3×10⁻⁷ ≈ 1.732×10⁻⁷) < single-phase (2×10⁻⁷)');
  });

  it('force increases with current squared (doubling I → 4× force)', () => {
    const F1 = calcEmfForcePerMeter(10000, 0.05, 'three-phase');
    const F2 = calcEmfForcePerMeter(20000, 0.05, 'three-phase');
    assert.ok(Math.abs(F2 / F1 - 4.0) < 1e-9,
      `Expected ratio 4.0, got ${F2 / F1}`);
  });

  it('force decreases with spacing (halving d → 2× force)', () => {
    const F1 = calcEmfForcePerMeter(10000, 0.10, 'three-phase');
    const F2 = calcEmfForcePerMeter(10000, 0.05, 'three-phase');
    assert.ok(Math.abs(F2 / F1 - 2.0) < 1e-9,
      `Expected ratio 2.0, got ${F2 / F1}`);
  });

  it('throws for zero spacing', () => {
    assert.throws(() => calcEmfForcePerMeter(10000, 0, 'three-phase'), /spacing/);
  });

  it('throws for negative current', () => {
    assert.throws(() => calcEmfForcePerMeter(-100, 0.05, 'three-phase'), /current/);
  });
});

// ---------------------------------------------------------------------------
// calcCleatLoad
// ---------------------------------------------------------------------------
describe('calcCleatLoad', () => {
  it('T = F × L', () => {
    assert.ok(Math.abs(calcCleatLoad(500, 0.9) - 450) < 1e-9);
  });

  it('longer span gives proportionally higher load', () => {
    const T1 = calcCleatLoad(100, 0.5);
    const T2 = calcCleatLoad(100, 1.0);
    assert.ok(Math.abs(T2 / T1 - 2.0) < 1e-9);
  });

  it('throws for zero cleat spacing', () => {
    assert.throws(() => calcCleatLoad(100, 0), /spacing/);
  });

  it('throws for negative force', () => {
    assert.throws(() => calcCleatLoad(-10, 0.9), /force|non-negative/i);
  });
});

// ---------------------------------------------------------------------------
// nmToLbfFt
// ---------------------------------------------------------------------------
describe('nmToLbfFt', () => {
  it('1 N/m ≈ 0.06852 lbf/ft', () => {
    const result = nmToLbfFt(1);
    assert.ok(Math.abs(result - 0.0685218) < 1e-6,
      `Expected ≈0.0685218, got ${result}`);
  });

  it('100 N/m → ≈ 6.852 lbf/ft', () => {
    const result = nmToLbfFt(100);
    assert.ok(Math.abs(result - 6.85218) < 1e-4);
  });
});

// ---------------------------------------------------------------------------
// calcCableFaultBracing — integration (hand-calculated reference)
// ---------------------------------------------------------------------------
describe('calcCableFaultBracing — three-phase trefoil, hand-calculated reference', () => {
  // I_sc=25 kA, X/R=10, spacing=50 mm, cleat=900 mm, SF=2.5
  const params = {
    faultCurrent_kA: 25,
    xrRatio:         10,
    systemType:      'three-phase',
    arrangement:     'trefoil',
    spacing_mm:      50,
    cleatSpacing_mm: 900,
    safetyFactor:    2.5,
  };

  it('peakFactor ≈ 1.7460 (IEC 60909 X/R=10)', () => {
    const r = calcCableFaultBracing(params);
    const expected = 1.02 + 0.98 * Math.exp(-0.3);
    assert.ok(Math.abs(r.peakFactor - expected) < 1e-3,
      `Expected ≈${expected.toFixed(4)}, got ${r.peakFactor}`);
  });

  it('iPeak_kA is κ × √2 × 25 kA', () => {
    const r   = calcCableFaultBracing(params);
    const ref = calcPeakFactor(10) * Math.SQRT2 * 25;
    assert.ok(Math.abs(r.iPeak_kA - ref) < 0.01,
      `Expected ≈${ref.toFixed(3)} kA, got ${r.iPeak_kA}`);
  });

  it('forcePerMeter_Nm matches √3×10⁻⁷ × i_peak² / d', () => {
    const r      = calcCableFaultBracing(params);
    const iPeak  = calcPeakFactor(10) * Math.SQRT2 * 25000;
    const fRef   = Math.sqrt(3) * 1e-7 * (iPeak ** 2) / 0.05;
    assert.ok(Math.abs(r.forcePerMeter_Nm - Math.round(fRef * 10) / 10) < 1,
      `Expected ≈${fRef.toFixed(0)} N/m, got ${r.forcePerMeter_Nm}`);
  });

  it('cleatLoad_kN = forcePerMeter × 0.9 m', () => {
    const r = calcCableFaultBracing(params);
    const expected = r.forcePerMeter_Nm * 0.9 / 1000;
    assert.ok(Math.abs(r.cleatLoad_kN - Math.round(expected * 100) / 100) < 0.01,
      `Expected ≈${expected.toFixed(3)} kN, got ${r.cleatLoad_kN}`);
  });

  it('requiredStrength_kN = cleatLoad_kN × 2.5', () => {
    const r = calcCableFaultBracing(params);
    const expected = r.cleatLoad_kN * 2.5;
    assert.ok(Math.abs(r.requiredStrength_kN - Math.round(expected * 100) / 100) < 0.02,
      `Expected ≈${expected.toFixed(2)} kN, got ${r.requiredStrength_kN}`);
  });

  it('safetyFactor is returned in the result', () => {
    const r = calcCableFaultBracing(params);
    assert.strictEqual(r.safetyFactor, 2.5);
  });

  it('recommendation string is non-empty and mentions fault current', () => {
    const r = calcCableFaultBracing(params);
    assert.ok(typeof r.recommendation === 'string' && r.recommendation.length > 0);
    assert.ok(r.recommendation.includes('25.0 kA'),
      `Expected recommendation to mention fault current, got: ${r.recommendation}`);
  });
});

describe('calcCableFaultBracing — single-phase', () => {
  const params = {
    faultCurrent_kA: 10,
    xrRatio:         5,
    systemType:      'single-phase',
    spacing_mm:      40,
    cleatSpacing_mm: 600,
    safetyFactor:    2.5,
  };

  it('uses 2×10⁻⁷ coefficient for single-phase', () => {
    const r     = calcCableFaultBracing(params);
    const iPeak = calcPeakFactor(5) * Math.SQRT2 * 10000;
    const fRef  = 2e-7 * (iPeak ** 2) / 0.04;
    assert.ok(Math.abs(r.forcePerMeter_Nm - Math.round(fRef * 10) / 10) < 1,
      `Expected ≈${fRef.toFixed(0)} N/m, got ${r.forcePerMeter_Nm}`);
  });

  it('single-phase force > three-phase force at identical parameters (2×10⁻⁷ > √3×10⁻⁷)', () => {
    const r1 = calcCableFaultBracing({ ...params, systemType: 'single-phase' });
    const r3 = calcCableFaultBracing({ ...params, systemType: 'three-phase' });
    assert.ok(r1.forcePerMeter_Nm > r3.forcePerMeter_Nm,
      'Single-phase (2×10⁻⁷) should produce higher force than three-phase (√3×10⁻⁷)');
  });
});

describe('calcCableFaultBracing — sensitivity checks', () => {
  const base = {
    faultCurrent_kA: 20,
    xrRatio:         10,
    systemType:      'three-phase',
    arrangement:     'flat',
    spacing_mm:      45,
    cleatSpacing_mm: 750,
    safetyFactor:    2.5,
  };

  it('doubling fault current → 4× required strength (quadratic relationship)', () => {
    const r1 = calcCableFaultBracing(base);
    const r2 = calcCableFaultBracing({ ...base, faultCurrent_kA: 40 });
    const ratio = r2.requiredStrength_kN / r1.requiredStrength_kN;
    assert.ok(Math.abs(ratio - 4.0) < 0.05,
      `Expected ratio ≈4.0, got ${ratio.toFixed(4)}`);
  });

  it('doubling cleat spacing → 2× cleat load (linear relationship)', () => {
    const r1 = calcCableFaultBracing(base);
    const r2 = calcCableFaultBracing({ ...base, cleatSpacing_mm: 1500 });
    const ratio = r2.cleatLoad_kN / r1.cleatLoad_kN;
    assert.ok(Math.abs(ratio - 2.0) < 0.01,
      `Expected ratio ≈2.0, got ${ratio.toFixed(4)}`);
  });

  it('higher X/R increases required strength', () => {
    const r1 = calcCableFaultBracing({ ...base, xrRatio: 5 });
    const r2 = calcCableFaultBracing({ ...base, xrRatio: 20 });
    assert.ok(r2.requiredStrength_kN > r1.requiredStrength_kN,
      'Higher X/R should give higher required strength');
  });

  it('larger safety factor proportionally increases required strength', () => {
    const r1 = calcCableFaultBracing({ ...base, safetyFactor: 2.0 });
    const r2 = calcCableFaultBracing({ ...base, safetyFactor: 4.0 });
    const ratio = r2.requiredStrength_kN / r1.requiredStrength_kN;
    assert.ok(Math.abs(ratio - 2.0) < 0.01,
      `Expected ratio 2.0, got ${ratio.toFixed(4)}`);
  });
});

// ---------------------------------------------------------------------------
// calcCableFaultBracing — error handling
// ---------------------------------------------------------------------------
describe('calcCableFaultBracing — error handling', () => {
  const good = {
    faultCurrent_kA: 10, xrRatio: 10, systemType: 'three-phase',
    spacing_mm: 50, cleatSpacing_mm: 600, safetyFactor: 2.5,
  };

  it('throws for zero fault current', () => {
    assert.throws(() => calcCableFaultBracing({ ...good, faultCurrent_kA: 0 }), /fault/i);
  });

  it('throws for negative X/R', () => {
    assert.throws(() => calcCableFaultBracing({ ...good, xrRatio: -1 }), /X\/R/);
  });

  it('throws for invalid systemType', () => {
    assert.throws(
      () => calcCableFaultBracing({ ...good, systemType: 'dc' }),
      /systemType/
    );
  });

  it('throws for zero spacing', () => {
    assert.throws(() => calcCableFaultBracing({ ...good, spacing_mm: 0 }), /spacing/);
  });

  it('throws for zero cleat spacing', () => {
    assert.throws(
      () => calcCableFaultBracing({ ...good, cleatSpacing_mm: 0 }),
      /spacing/
    );
  });

  it('throws for safety factor < 1', () => {
    assert.throws(() => calcCableFaultBracing({ ...good, safetyFactor: 0.5 }), /safety/i);
  });
});
