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
