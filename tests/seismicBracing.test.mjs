/**
 * Tests for analysis/seismicBracing.mjs
 *
 * Verifies the ASCE 7-22 §13.3.1 component seismic force calculations,
 * SDC determination, and brace force outputs against hand-calculated values.
 */
import assert from 'assert';
import {
  sdcFromSds,
  sdcFromSd1,
  calcSeismicDesignCategory,
  maxBraceSpacing,
  calcComponentForceFactor,
  calcBraceForces,
  evaluateTraysBracing,
} from '../analysis/seismicBracing.mjs';

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
// SDC determination from SDS
// ---------------------------------------------------------------------------
describe('sdcFromSds — ASCE 7-22 Table 11.6-1', () => {
  it('SDC A for low SDS (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSds(0.1, 'II'), 'A');
  });

  it('SDC B for SDS in [0.167, 0.33) (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSds(0.20, 'II'), 'B');
  });

  it('SDC C for SDS in [0.33, 0.50) (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSds(0.40, 'II'), 'C');
  });

  it('SDC D for SDS >= 0.50 (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSds(0.75, 'II'), 'D');
  });

  it('Risk Cat IV jumps directly to C at SDS >= 0.167', () => {
    assert.strictEqual(sdcFromSds(0.20, 'IV'), 'C');
  });
});

// ---------------------------------------------------------------------------
// SDC determination from SD1
// ---------------------------------------------------------------------------
describe('sdcFromSd1 — ASCE 7-22 Table 11.6-2', () => {
  it('SDC A for SD1 < 0.067 (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSd1(0.05, 'II'), 'A');
  });

  it('SDC B for SD1 in [0.067, 0.133) (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSd1(0.10, 'II'), 'B');
  });

  it('SDC E for SD1 in [0.30, 0.50) (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSd1(0.40, 'II'), 'E');
  });

  it('SDC F for SD1 >= 0.50 (Risk Cat II)', () => {
    assert.strictEqual(sdcFromSd1(0.60, 'II'), 'F');
  });
});

// ---------------------------------------------------------------------------
// calcSeismicDesignCategory — takes the more severe of SDS/SD1 tables
// ---------------------------------------------------------------------------
describe('calcSeismicDesignCategory', () => {
  it('returns D when SDS gives D and SD1 gives C', () => {
    // SDS=0.6 → D; SD1=0.15 → C
    assert.strictEqual(calcSeismicDesignCategory(0.6, 0.15, 'II'), 'D');
  });

  it('returns E when SD1 gives E and SDS gives D', () => {
    // SDS=0.6 → D; SD1=0.40 → E
    assert.strictEqual(calcSeismicDesignCategory(0.6, 0.40, 'II'), 'E');
  });

  it('returns A for very low seismicity', () => {
    assert.strictEqual(calcSeismicDesignCategory(0.05, 0.02, 'II'), 'A');
  });

  it('same SDC regardless of which value is higher when both give same result', () => {
    // Both tables give C
    assert.strictEqual(calcSeismicDesignCategory(0.40, 0.15, 'II'), 'C');
  });
});

// ---------------------------------------------------------------------------
// maxBraceSpacing
// ---------------------------------------------------------------------------
describe('maxBraceSpacing', () => {
  it('SDC A — bracing not required', () => {
    const { required, lateral, longitudinal } = maxBraceSpacing('A');
    assert.strictEqual(required, false);
    assert.strictEqual(lateral, null);
    assert.strictEqual(longitudinal, null);
  });

  it('SDC B — bracing not required', () => {
    assert.strictEqual(maxBraceSpacing('B').required, false);
  });

  it('SDC C — 12 ft lateral, 40 ft longitudinal', () => {
    const { required, lateral, longitudinal } = maxBraceSpacing('C');
    assert.strictEqual(required, true);
    assert.strictEqual(lateral, 12);
    assert.strictEqual(longitudinal, 40);
  });

  it('SDC D — 12 ft lateral, 40 ft longitudinal', () => {
    const { required, lateral, longitudinal } = maxBraceSpacing('D');
    assert.strictEqual(required, true);
    assert.strictEqual(lateral, 12);
    assert.strictEqual(longitudinal, 40);
  });

  it('SDC F — 12 ft lateral, 40 ft longitudinal', () => {
    const { required, lateral, longitudinal } = maxBraceSpacing('F');
    assert.strictEqual(required, true);
    assert.strictEqual(lateral, 12);
    assert.strictEqual(longitudinal, 40);
  });
});

// ---------------------------------------------------------------------------
// calcComponentForceFactor — ASCE 7-22 §13.3.1
// Hand calculations:
//   ap=1.0, Rp=2.5, Ip=1.0, SDS=0.5, z=10, h=20
//   heightFactor = 1 + 2*(10/20) = 2.0
//   fp = (0.4 * 1.0 * 0.5) / (2.5/1.0) * 2.0 = (0.2/2.5) * 2.0 = 0.16
//   fpMin = 0.3 * 0.5 * 1.0 = 0.15
//   fpMax = 1.6 * 0.5 * 1.0 = 0.80
//   fp clamped = 0.16 (within [0.15, 0.80])
// ---------------------------------------------------------------------------
describe('calcComponentForceFactor — hand-calculated reference', () => {
  const params = { sds: 0.5, z: 10, h: 20, ap: 1.0, rp: 2.5, ip: 1.0 };

  it('height factor = 2.0 at z=h/2', () => {
    const { heightFactor } = calcComponentForceFactor(params);
    assert.strictEqual(heightFactor, 2.0);
  });

  it('fp = 0.16 for reference case', () => {
    const { fp } = calcComponentForceFactor(params);
    assert.ok(Math.abs(fp - 0.16) < 1e-9, `Expected 0.16, got ${fp}`);
  });

  it('fpMin = 0.15 for reference case', () => {
    const { fpMin } = calcComponentForceFactor(params);
    assert.ok(Math.abs(fpMin - 0.15) < 1e-9, `Expected 0.15, got ${fpMin}`);
  });

  it('fpMax = 0.80 for reference case', () => {
    const { fpMax } = calcComponentForceFactor(params);
    assert.ok(Math.abs(fpMax - 0.80) < 1e-9, `Expected 0.80, got ${fpMax}`);
  });

  it('fp is clamped to fpMin when force would be below minimum', () => {
    // Very low SDS and z/h → fp below fpMin
    const low = calcComponentForceFactor({ sds: 0.2, z: 0, h: 100, ap: 1.0, rp: 2.5, ip: 1.0 });
    // fp = 0.4*1*0.2/2.5 * 1 = 0.032; fpMin = 0.3*0.2*1 = 0.06
    assert.ok(low.fp >= low.fpMin, 'fp should be clamped to at least fpMin');
  });

  it('fp is clamped to fpMax when force would exceed maximum', () => {
    // Very high z/h ratio → fp above fpMax
    const high = calcComponentForceFactor({ sds: 2.0, z: 100, h: 100, ap: 1.0, rp: 2.5, ip: 1.5 });
    assert.ok(high.fp <= high.fpMax, 'fp should be clamped to at most fpMax');
  });

  it('height factor = 1.0 at base (z=0)', () => {
    const { heightFactor } = calcComponentForceFactor({ ...params, z: 0 });
    assert.strictEqual(heightFactor, 1.0);
  });

  it('height factor = 3.0 at roof (z=h)', () => {
    const { heightFactor } = calcComponentForceFactor({ ...params, z: 20, h: 20 });
    assert.strictEqual(heightFactor, 3.0);
  });
});

// ---------------------------------------------------------------------------
// calcComponentForceFactor — error handling
// ---------------------------------------------------------------------------
describe('calcComponentForceFactor — error handling', () => {
  it('throws for negative SDS', () => {
    assert.throws(
      () => calcComponentForceFactor({ sds: -0.1, z: 10, h: 20 }),
      /sds/
    );
  });

  it('throws for negative z', () => {
    assert.throws(
      () => calcComponentForceFactor({ sds: 0.5, z: -1, h: 20 }),
      /z/
    );
  });

  it('throws when z > h', () => {
    assert.throws(
      () => calcComponentForceFactor({ sds: 0.5, z: 25, h: 20 }),
      /z.*h|attachment.*roof/i
    );
  });

  it('throws for zero building height', () => {
    assert.throws(
      () => calcComponentForceFactor({ sds: 0.5, z: 0, h: 0 }),
      /h/
    );
  });
});

// ---------------------------------------------------------------------------
// calcBraceForces — integration
// ---------------------------------------------------------------------------
describe('calcBraceForces — SDC A/B (no bracing required)', () => {
  const params = {
    sds: 0.10, sd1: 0.04, riskCategory: 'II',
    wp: 15, z: 10, h: 30,
  };

  it('bracingRequired = false', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.bracingRequired, false);
  });

  it('lateral and longitudinal forces are 0', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.lateralForce, 0);
    assert.strictEqual(r.longitudinalForce, 0);
  });

  it('vertical force is still computed (±0.2 × SDS × Wp)', () => {
    const r = calcBraceForces(params);
    const expected = Math.round(0.2 * 0.10 * 15 * 100) / 100;
    assert.strictEqual(r.verticalForce, expected);
  });
});

describe('calcBraceForces — SDC D (bracing required)', () => {
  // SDS=0.8, SD1=0.4 → SDC D/E (SD1=0.4 → E for Risk Cat II)
  const params = {
    sds: 0.8, sd1: 0.40, riskCategory: 'II',
    wp: 20, z: 15, h: 30, ip: 1.0,
  };

  it('bracingRequired = true', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.bracingRequired, true);
  });

  it('sdc is E (SD1=0.40 governs over D from SDS)', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.sdc, 'E');
  });

  it('lateral force is positive', () => {
    const r = calcBraceForces(params);
    assert.ok(r.lateralForce > 0, `lateralForce=${r.lateralForce} should be > 0`);
  });

  it('longitudinal force is approximately 40% of lateral force', () => {
    const r = calcBraceForces(params);
    const ratio = r.longitudinalForce / r.lateralForce;
    // Values are independently rounded to 2 dp; allow 0.5% tolerance
    assert.ok(Math.abs(ratio - 0.4) < 0.005, `Expected ratio ≈0.4, got ${ratio}`);
  });

  it('maxLateralSpacing = 12 ft', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.maxLateralSpacing, 12);
  });

  it('maxLongSpacing = 40 ft', () => {
    const r = calcBraceForces(params);
    assert.strictEqual(r.maxLongSpacing, 40);
  });

  it('recommendation string contains SDC', () => {
    const r = calcBraceForces(params);
    assert.ok(r.recommendation.includes(r.sdc), 'recommendation should mention SDC');
  });
});

describe('calcBraceForces — Ip=1.5 increases forces', () => {
  const base = {
    sds: 0.6, sd1: 0.25, riskCategory: 'II', wp: 10, z: 10, h: 30,
  };

  it('Ip=1.5 yields higher lateral force than Ip=1.0', () => {
    const r10 = calcBraceForces({ ...base, ip: 1.0 });
    const r15 = calcBraceForces({ ...base, ip: 1.5 });
    assert.ok(r15.lateralForce > r10.lateralForce,
      `Ip=1.5 (${r15.lateralForce}) should exceed Ip=1.0 (${r10.lateralForce})`);
  });
});

// ---------------------------------------------------------------------------
// evaluateTraysBracing
// ---------------------------------------------------------------------------
describe('evaluateTraysBracing', () => {
  const siteParams = {
    sds: 0.6, sd1: 0.25, riskCategory: 'II', z: 10, h: 30, ip: 1.0,
  };

  it('returns one result per tray', () => {
    const trays = [
      { tray_id: 'TR-01', wp_per_ft: 10 },
      { tray_id: 'TR-02', wp_per_ft: 20 },
    ];
    const results = evaluateTraysBracing(trays, siteParams);
    assert.strictEqual(results.length, 2);
  });

  it('preserves tray IDs', () => {
    const trays = [{ tray_id: 'MY-TRAY', wp_per_ft: 5 }];
    const [r] = evaluateTraysBracing(trays, siteParams);
    assert.strictEqual(r.tray_id, 'MY-TRAY');
  });

  it('heavier tray has higher lateral force', () => {
    const trays = [
      { tray_id: 'light', wp_per_ft: 5 },
      { tray_id: 'heavy', wp_per_ft: 50 },
    ];
    const [light, heavy] = evaluateTraysBracing(trays, siteParams);
    assert.ok(heavy.result.lateralForce > light.result.lateralForce,
      'Heavier tray should have higher lateral force');
  });
});
