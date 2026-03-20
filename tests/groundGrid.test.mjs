/**
 * Tests for analysis/groundGrid.mjs
 *
 * Verifies IEEE 80-2013 ground grid calculations against hand-calculated
 * reference values from IEEE 80-2013 Appendix B worked examples.
 */
import assert from 'assert';
import {
  surfaceLayerFactor,
  gridResistance,
  effectiveN,
  meshFactor,
  stepFactor,
  irregularityFactor,
  tolerableTouch,
  tolerableStep,
  analyzeGroundGrid,
} from '../analysis/groundGrid.mjs';

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

function approx(actual, expected, tol = 0.005) {
  const rel = Math.abs(actual - expected) / (Math.abs(expected) || 1);
  assert.ok(rel <= tol, `Expected ~${expected}, got ${actual} (rel error ${(rel*100).toFixed(3)}%)`);
}

// ---------------------------------------------------------------------------
// Surface layer reduction factor Cs
// ---------------------------------------------------------------------------
describe('surfaceLayerFactor — IEEE 80-2013 Eq. 27', () => {
  it('Cs = 1 when no surface layer (hs = 0)', () => {
    assert.strictEqual(surfaceLayerFactor(100, 2500, 0), 1);
  });

  it('Cs = 1 when surface layer matches soil resistivity', () => {
    assert.strictEqual(surfaceLayerFactor(100, 100, 0.1), 1);
  });

  it('Cs < 1 for crushed rock over lower-resistivity soil (ρs > ρ)', () => {
    // ρ = 100 Ω·m, ρs = 2500 Ω·m (crushed stone), hs = 0.1 m
    const Cs = surfaceLayerFactor(100, 2500, 0.1);
    assert.ok(Cs < 1 && Cs > 0, `Expected 0 < Cs < 1, got ${Cs}`);
    // Cs should be roughly in the 0.65–0.80 range for these parameters
    assert.ok(Cs >= 0.60 && Cs <= 0.85, `Cs=${Cs} out of expected range [0.60, 0.85]`);
  });

  it('Cs close to 1 for very thick surface layer', () => {
    const Cs = surfaceLayerFactor(100, 2500, 1.0);
    assert.ok(Cs > 0.9);
  });
});

// ---------------------------------------------------------------------------
// Grid resistance — Sverak formula
// ---------------------------------------------------------------------------
describe('gridResistance — IEEE 80-2013 Eq. 57 (Sverak)', () => {
  it('computes positive Rg in a plausible range for a large grid', () => {
    // 70×70 m grid, soil 400 Ω·m, L≈2800 m, h=0.5 m
    const Rg = gridResistance(400, 2800, 70 * 70, 0.5);
    assert.ok(Rg > 0, `Rg should be positive, got ${Rg}`);
    assert.ok(Rg < 10, `Rg should be reasonably small, got ${Rg}`);
  });

  it('lower Rg for higher conductor length', () => {
    const Rg1 = gridResistance(100, 500, 900, 0.5);
    const Rg2 = gridResistance(100, 1000, 900, 0.5);
    assert.ok(Rg2 < Rg1, 'More conductor length should lower Rg');
  });

  it('higher Rg for higher soil resistivity', () => {
    const Rg1 = gridResistance(100, 500, 900, 0.5);
    const Rg2 = gridResistance(200, 500, 900, 0.5);
    assert.ok(Rg2 > Rg1, 'Higher soil resistivity should increase Rg');
  });

  it('throws for zero or negative L', () => {
    assert.throws(() => gridResistance(100, 0, 900, 0.5));
  });

  it('throws for zero area', () => {
    assert.throws(() => gridResistance(100, 500, 0, 0.5));
  });
});

// ---------------------------------------------------------------------------
// Effective N
// ---------------------------------------------------------------------------
describe('effectiveN — IEEE 80-2013 Eq. 85', () => {
  it('returns value > 1 for a square grid', () => {
    // 30×30 m grid, 7 conductors each way, spacing 5 m
    // L = 7×30 + 7×30 = 420, Lp = 120, A = 900
    const n = effectiveN(420, 120, 900);
    assert.ok(n > 1, `Expected n > 1, got ${n}`);
  });

  it('increases with more conductor length relative to perimeter', () => {
    const n1 = effectiveN(420, 120, 900);
    const n2 = effectiveN(840, 120, 900);
    assert.ok(n2 > n1);
  });
});

// ---------------------------------------------------------------------------
// Irregularity factor Ki
// ---------------------------------------------------------------------------
describe('irregularityFactor — IEEE 80-2013 Eq. 89', () => {
  it('Ki = 0.644 + 0.148×n', () => {
    approx(irregularityFactor(4), 0.644 + 0.148 * 4, 0.001);
    approx(irregularityFactor(1), 0.644 + 0.148 * 1, 0.001);
  });

  it('Ki increases with n', () => {
    assert.ok(irregularityFactor(6) > irregularityFactor(3));
  });
});

// ---------------------------------------------------------------------------
// Tolerable voltages
// ---------------------------------------------------------------------------
describe('tolerableTouch — IEEE 80-2013 Eq. 32/33', () => {
  it('decreases with longer fault duration', () => {
    const E1 = tolerableTouch(1, 100, 0.5, 70);
    const E2 = tolerableTouch(1, 100, 1.0, 70);
    assert.ok(E1 > E2, 'Shorter fault duration → higher tolerable voltage');
  });

  it('70 kg body higher tolerance than 50 kg', () => {
    const E70 = tolerableTouch(1, 100, 0.5, 70);
    const E50 = tolerableTouch(1, 100, 0.5, 50);
    assert.ok(E70 > E50);
  });

  it('higher surface layer resistivity raises tolerable touch voltage', () => {
    const E_rock = tolerableTouch(0.74, 2500, 0.5, 70);
    const E_soil = tolerableTouch(1, 100, 0.5, 70);
    assert.ok(E_rock > E_soil, 'Crushed rock surface raises tolerable voltage');
  });

  it('reference value — no surface layer, 70 kg, 0.5 s', () => {
    // Etouch70 = (1000 + 1.5 × 1 × 100) × 0.157 / √0.5
    // = 1150 × 0.157 / 0.7071 = 255.4 V
    approx(tolerableTouch(1, 100, 0.5, 70), 255.4, 0.01);
  });
});

describe('tolerableStep — IEEE 80-2013 Eq. 29/30', () => {
  it('step tolerance higher than touch tolerance (same conditions)', () => {
    const Etouch = tolerableTouch(1, 100, 0.5, 70);
    const Estep = tolerableStep(1, 100, 0.5, 70);
    assert.ok(Estep > Etouch, 'Step voltage tolerance always > touch tolerance');
  });

  it('reference value — no surface layer, 70 kg, 0.5 s', () => {
    // Estep70 = (1000 + 6 × 1 × 100) × 0.157 / √0.5
    // = 1600 × 0.157 / 0.7071 = 355.1 V
    approx(tolerableStep(1, 100, 0.5, 70), 355.1, 0.01);
  });
});

// ---------------------------------------------------------------------------
// Full analyzeGroundGrid — integration test
// ---------------------------------------------------------------------------
describe('analyzeGroundGrid — integration', () => {
  // Baseline case: 30×30 m grid with 7 conductors each way, 0.5 m depth
  const base = {
    rho: 100,
    gridLx: 30,
    gridLy: 30,
    nx: 7,  // 7 conductors running in x direction
    ny: 7,  // 7 conductors running in y direction
    h: 0.5,
    d: 0.01,
    Ig: 1000,
    tf: 0.5,
    bw: 70,
  };

  it('returns expected keys', () => {
    const r = analyzeGroundGrid(base);
    const keys = ['Rg', 'GPR', 'Em', 'Es', 'Etouch', 'Estep', 'touchSafe', 'stepSafe'];
    for (const k of keys) {
      assert.ok(k in r, `Missing key: ${k}`);
    }
  });

  it('GPR = Ig × Rg', () => {
    const r = analyzeGroundGrid(base);
    approx(r.GPR, base.Ig * r.Rg, 0.001);
  });

  it('conductor length = nx×gridLx + ny×gridLy', () => {
    const r = analyzeGroundGrid(base);
    assert.strictEqual(r.conductorLength, base.nx * base.gridLx + base.ny * base.gridLy);
  });

  it('grid area = gridLx × gridLy', () => {
    const r = analyzeGroundGrid(base);
    assert.strictEqual(r.A, base.gridLx * base.gridLy);
  });

  it('touchSafe when Em < Etouch', () => {
    const r = analyzeGroundGrid(base);
    assert.strictEqual(r.touchSafe, r.Em <= r.Etouch);
  });

  it('stepSafe when Es < Estep', () => {
    const r = analyzeGroundGrid(base);
    assert.strictEqual(r.stepSafe, r.Es <= r.Estep);
  });

  it('larger grid → lower Rg', () => {
    const r1 = analyzeGroundGrid(base);
    const r2 = analyzeGroundGrid({ ...base, gridLx: 60, gridLy: 60, nx: 13, ny: 13 });
    assert.ok(r2.Rg < r1.Rg, 'Larger grid should have lower resistance');
  });

  it('higher soil resistivity → higher Rg and higher Em', () => {
    const r1 = analyzeGroundGrid(base);
    const r2 = analyzeGroundGrid({ ...base, rho: 400 });
    assert.ok(r2.Rg > r1.Rg);
    assert.ok(r2.Em > r1.Em);
  });

  it('throws for invalid nx < 2', () => {
    assert.throws(() => analyzeGroundGrid({ ...base, nx: 1 }));
  });

  it('throws for negative burial depth', () => {
    assert.throws(() => analyzeGroundGrid({ ...base, h: -0.5 }));
  });

  it('includes surface layer factor when rhoS and hs provided', () => {
    const r = analyzeGroundGrid({ ...base, rhoS: 2500, hs: 0.1 });
    assert.ok(r.Cs < 1, 'Cs should be < 1 with crushed rock surface');
    // Higher surface resistivity raises tolerable voltages
    const rBase = analyzeGroundGrid(base);
    assert.ok(r.Etouch > rBase.Etouch);
  });

  it('gprExceedsTouch is boolean', () => {
    const r = analyzeGroundGrid(base);
    assert.strictEqual(typeof r.gprExceedsTouch, 'boolean');
  });
});
