/**
 * Tests for analysis/emf.mjs
 *
 * Verifies magnetic field calculations against hand-computed values
 * using the Biot-Savart law for infinite straight conductors.
 */
import assert from 'assert';
import {
  fieldFromSingleConductor,
  fieldFromConductorArray,
  buildThreePhaseConductors,
  fieldProfile,
  checkCompliance,
  ICNIRP_LIMITS,
} from '../analysis/emf.mjs';

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
describe('ICNIRP_LIMITS', () => {
  it('occupational 50 Hz is 1000 µT', () => {
    assert.strictEqual(ICNIRP_LIMITS.occupational_50hz, 1000);
  });

  it('general public 50 Hz is 200 µT', () => {
    assert.strictEqual(ICNIRP_LIMITS.general_public_50hz, 200);
  });

  it('occupational 60 Hz is 1000 µT', () => {
    assert.strictEqual(ICNIRP_LIMITS.occupational_60hz, 1000);
  });

  it('general public 60 Hz is 200 µT', () => {
    assert.strictEqual(ICNIRP_LIMITS.general_public_60hz, 200);
  });
});

// ---------------------------------------------------------------------------
describe('fieldFromSingleConductor', () => {
  // B = (µ₀/2π) × (I/d)
  // At d=1m, I=1A: B = 2e-7 T = 0.2 µT
  it('1 A at 1 m gives ~0.2 µT', () => {
    const b = fieldFromSingleConductor(1, 1);
    assert.ok(approxEqual(b, 0.2, 1e-6), `Got ${b}`);
  });

  it('100 A at 1 m gives ~20 µT', () => {
    const b = fieldFromSingleConductor(100, 1);
    assert.ok(approxEqual(b, 20, 1e-3), `Got ${b}`);
  });

  it('field doubles when current doubles', () => {
    const b1 = fieldFromSingleConductor(100, 1);
    const b2 = fieldFromSingleConductor(200, 1);
    assert.ok(approxEqual(b2 / b1, 2, 1e-9), `Ratio ${b2 / b1}`);
  });

  it('field halves when distance doubles', () => {
    const b1 = fieldFromSingleConductor(100, 1);
    const b2 = fieldFromSingleConductor(100, 2);
    assert.ok(approxEqual(b2 / b1, 0.5, 1e-9), `Ratio ${b2 / b1}`);
  });

  it('throws for zero distance', () => {
    assert.throws(() => fieldFromSingleConductor(100, 0), /positive/i);
  });

  it('treats negative current as magnitude', () => {
    const bPos = fieldFromSingleConductor(100, 1);
    const bNeg = fieldFromSingleConductor(-100, 1);
    assert.ok(approxEqual(bPos, bNeg, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('buildThreePhaseConductors', () => {
  it('returns 3 conductors for 1 cable set', () => {
    const c = buildThreePhaseConductors(100, 1, 0.3, 0.025);
    assert.strictEqual(c.length, 3);
  });

  it('returns 6 conductors for 2 cable sets', () => {
    const c = buildThreePhaseConductors(100, 2, 0.3, 0.025);
    assert.strictEqual(c.length, 6);
  });

  it('phase angles are 0, 120, 240 for first set', () => {
    const c = buildThreePhaseConductors(100, 1, 0.3, 0.025);
    assert.strictEqual(c[0].phaseAngleDeg, 0);
    assert.strictEqual(c[1].phaseAngleDeg, 120);
    assert.strictEqual(c[2].phaseAngleDeg, 240);
  });

  it('all conductors have the specified current', () => {
    const c = buildThreePhaseConductors(200, 2, 0.3, 0.025);
    assert.ok(c.every(x => x.currentA === 200));
  });
});

// ---------------------------------------------------------------------------
describe('fieldFromConductorArray', () => {
  it('returns object with bPeak_uT and bRms_uT', () => {
    const conductors = [{ x: 0, y: 0, currentA: 100, phaseAngleDeg: 0 }];
    const result = fieldFromConductorArray(conductors, { x: 1, y: 0 });
    assert.ok('bPeak_uT' in result);
    assert.ok('bRms_uT' in result);
  });

  it('field is non-negative', () => {
    const conductors = buildThreePhaseConductors(100, 1, 0.3, 0.025);
    const result = fieldFromConductorArray(conductors, { x: 1, y: 0.5 });
    assert.ok(result.bPeak_uT >= 0);
    assert.ok(result.bRms_uT >= 0);
  });

  it('3-phase balanced cable has lower field than single conductor at same distance', () => {
    // Balanced 3-phase cancels: RMS field should be less than 3 × single conductor
    const conductors3ph = buildThreePhaseConductors(100, 1, 0.05, 0.025);
    const result3ph = fieldFromConductorArray(conductors3ph, { x: 1, y: 0 });
    const bSingle = fieldFromSingleConductor(100, 1);
    assert.ok(result3ph.bRms_uT < bSingle * 3, `3ph: ${result3ph.bRms_uT}, single*3: ${bSingle * 3}`);
  });

  it('3-phase tray layout produces consistent peak and RMS fields', () => {
    const conductors = buildThreePhaseConductors(100, 1, 0.3048, 0.0254);
    const result = fieldFromConductorArray(conductors, { x: 1.0668, y: 0.6096 });
    assert.ok(result.bRms_uT > 0, `RMS: ${result.bRms_uT}`);
    assert.ok(result.bPeak_uT >= result.bRms_uT, `Peak: ${result.bPeak_uT}, RMS: ${result.bRms_uT}`);
  });
});

// ---------------------------------------------------------------------------
describe('fieldProfile', () => {
  it('returns correct number of points', () => {
    const conductors = buildThreePhaseConductors(100, 1, 0.3, 0.025);
    const distances = [0.3, 0.5, 1.0, 2.0];
    const profile = fieldProfile(conductors, 0.15, distances);
    assert.strictEqual(profile.length, distances.length);
  });

  it('field decreases with distance', () => {
    const conductors = buildThreePhaseConductors(100, 1, 0.3, 0.025);
    const distances = [0.1, 0.5, 1.0, 2.0, 5.0];
    const profile = fieldProfile(conductors, 0.15, distances);
    const bValues = profile.map(p => p.bRms_uT);
    for (let i = 1; i < bValues.length; i++) {
      assert.ok(bValues[i] <= bValues[i - 1] + 0.001,
        `Field not decreasing at index ${i}: ${bValues[i - 1]} → ${bValues[i]}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('checkCompliance', () => {
  it('passes for very low field', () => {
    const c = checkCompliance(1, 60);
    assert.ok(c.occupational.pass);
    assert.ok(c.generalPublic.pass);
  });

  it('fails general public but passes occupational at 500 µT (60 Hz)', () => {
    const c = checkCompliance(500, 60);
    assert.ok(c.occupational.pass);
    assert.ok(!c.generalPublic.pass);
  });

  it('fails both at 1500 µT', () => {
    const c = checkCompliance(1500, 60);
    assert.ok(!c.occupational.pass);
    assert.ok(!c.generalPublic.pass);
  });

  it('ratio is correct for occupational limit', () => {
    const c = checkCompliance(500, 60);
    assert.ok(approxEqual(c.occupational.ratio, 0.5, 1e-9));
  });

  it('uses correct 50 Hz limits', () => {
    const c50 = checkCompliance(500, 50);
    assert.ok(c50.occupational.pass);
    assert.ok(!c50.generalPublic.pass);
  });
});

// ---------------------------------------------------------------------------
// Review regressions: compact cable sets, input validation, independent phasor check
// ---------------------------------------------------------------------------
function phasorRms(conductors, p) {
  // Analytical time-average: B_rms² = 0.5 (|Bx|² + |By|²) for peak phasors Bx, By
  let bxRe = 0, bxIm = 0, byRe = 0, byIm = 0;
  for (const c of conductors) {
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
    const peak = (4e-7 * Math.PI / (2 * Math.PI)) * c.currentA * Math.SQRT2 / d * 1e6;
    const th = c.phaseAngleDeg * Math.PI / 180;
    bxRe += peak * (dy / d) * Math.cos(th); bxIm += peak * (dy / d) * Math.sin(th);
    byRe += peak * (-dx / d) * Math.cos(th); byIm += peak * (-dx / d) * Math.sin(th);
  }
  return Math.sqrt(0.5 * (bxRe * bxRe + bxIm * bxIm + byRe * byRe + byIm * byIm));
}

describe('compact cable-set layout', () => {
  it('phases of one set sit one cable diameter apart, centred in the tray', () => {
    const c = buildThreePhaseConductors(100, 1, 0.3048, 0.0254);
    assert.ok(Math.abs(c[1].x - 0) < 1e-12, 'middle phase on the tray centreline');
    assert.ok(Math.abs(c[1].x - c[0].x - 0.0254) < 1e-12 && Math.abs(c[2].x - c[1].x - 0.0254) < 1e-12);
  });

  it('sets are spread evenly and phase spacing shrinks when the tray is full', () => {
    const c = buildThreePhaseConductors(100, 10, 0.3048, 0.0254);
    assert.strictEqual(c.length, 30);
    const xs = c.map(v => v.x);
    assert.ok(Math.max(...xs) < 0.3048 / 2 && Math.min(...xs) > -0.3048 / 2, 'all conductors inside the tray');
    assert.ok(Math.abs(c[1].x - c[0].x) <= 0.0254 + 1e-12);
  });

  it('RMS field matches an independent analytical phasor sum', () => {
    const c = buildThreePhaseConductors(300, 3, 0.4572, 0.0381);
    const p = { x: 0.4572 / 2 + 0.9144, y: 0.6096 };
    const sampled = fieldFromConductorArray(c, p).bRms_uT;
    assert.ok(Math.abs(sampled - phasorRms(c, p)) / sampled < 1e-3, `${sampled} vs ${phasorRms(c, p)}`);
  });

  it('a compact set gives a much smaller far field than phases spread across the tray', () => {
    // Trefoil-like far field scales with phase spacing: 1 in vs 3 in (old spread) is ~3x
    const compact = buildThreePhaseConductors(100, 1, 0.3048, 0.0254);
    const p = { x: 0.3048 / 2 + 0.9144, y: 0.6096 };
    const spread = [-0.0762, 0, 0.0762].map((x, i) => ({ x, y: 0.0127, currentA: 100, phaseAngleDeg: i * 120 }));
    const ratio = fieldFromConductorArray(spread, p).bRms_uT / fieldFromConductorArray(compact, p).bRms_uT;
    assert.ok(ratio > 2.5 && ratio < 3.5, `ratio ${ratio}`);
  });
});

describe('invalid inputs are rejected rather than reported as 0 uT', () => {
  it('non-finite current throws', () => {
    assert.throws(() => buildThreePhaseConductors(NaN, 1, 0.3, 0.025), /Current/);
    assert.throws(() => fieldFromSingleConductor(NaN, 1), /finite/);
  });
  it('zero tray width or cable diameter throws', () => {
    assert.throws(() => buildThreePhaseConductors(100, 1, 0, 0.025), /Tray width/);
    assert.throws(() => buildThreePhaseConductors(100, 1, 0.3, 0), /diameter/);
  });
  it('fieldProfile propagates errors instead of returning zeros', () => {
    assert.throws(() => fieldProfile([{ x: 0, y: 0, currentA: NaN, phaseAngleDeg: 0 }], 0.3, [1]), /finite/);
  });
});
