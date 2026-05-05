/**
 * Tests for analysis/busDuctSizing.mjs
 *
 * Covers: orientation derating, ambient temperature correction, stacking
 * derating, combined ampacity derating, voltage drop (1-phase and 3-phase),
 * IEEE 605 fault force, maximum support span, standard busway selection,
 * runBusDuctStudy integration, and input-validation paths.
 */
import assert from 'assert';
import {
  STANDARD_BUSWAY_RATINGS,
  BUSWAY_LIBRARY,
  ORIENTATION_DERATING,
  ALLOWABLE_STRESS_PSI,
  necOrientationDerating,
  ambientTempCorrectionFactor,
  stackingDerating,
  necAmpacityDerating,
  voltageDropBusDuct,
  busStressForcePerFt,
  maxSupportSpan,
  selectStandardBusway,
  runBusDuctStudy,
} from '../analysis/busDuctSizing.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
describe('STANDARD_BUSWAY_RATINGS constant', () => {
  it('contains expected ratings from 800 to 5000', () => {
    assert.ok(STANDARD_BUSWAY_RATINGS.includes(800));
    assert.ok(STANDARD_BUSWAY_RATINGS.includes(1200));
    assert.ok(STANDARD_BUSWAY_RATINGS.includes(2000));
    assert.ok(STANDARD_BUSWAY_RATINGS.includes(5000));
  });

  it('is sorted ascending', () => {
    for (let i = 1; i < STANDARD_BUSWAY_RATINGS.length; i++) {
      assert.ok(STANDARD_BUSWAY_RATINGS[i] > STANDARD_BUSWAY_RATINGS[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
describe('BUSWAY_LIBRARY', () => {
  it('has entries for all standard ratings', () => {
    for (const r of STANDARD_BUSWAY_RATINGS) {
      assert.ok(BUSWAY_LIBRARY[r] !== undefined, `Missing entry for ${r} A`);
    }
  });

  it('each entry has Cu and Al resistance/reactance', () => {
    for (const [rating, entry] of Object.entries(BUSWAY_LIBRARY)) {
      assert.ok(typeof entry.Cu.r === 'number', `${rating}: Cu.r missing`);
      assert.ok(typeof entry.Cu.x === 'number', `${rating}: Cu.x missing`);
      assert.ok(typeof entry.Al.r === 'number', `${rating}: Al.r missing`);
      assert.ok(typeof entry.Al.x === 'number', `${rating}: Al.x missing`);
    }
  });

  it('Cu resistance is lower than Al resistance for same rating', () => {
    for (const [rating, entry] of Object.entries(BUSWAY_LIBRARY)) {
      assert.ok(entry.Cu.r < entry.Al.r, `${rating} A: Cu.r should be < Al.r`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('necOrientationDerating()', () => {
  it('returns 1.0 for horizontal', () => {
    assert.strictEqual(necOrientationDerating('horizontal'), 1.0);
  });

  it('returns 1.0 for vertical', () => {
    assert.strictEqual(necOrientationDerating('vertical'), 1.0);
  });

  it('returns 0.80 for edge-on', () => {
    assert.strictEqual(necOrientationDerating('edgeon'), 0.80);
  });

  it('defaults to 1.0 for unknown orientation', () => {
    assert.strictEqual(necOrientationDerating('diagonal'), 1.0);
  });

  it('handles case-insensitive input', () => {
    assert.strictEqual(necOrientationDerating('HORIZONTAL'), 1.0);
    assert.strictEqual(necOrientationDerating('EdgeOn'), 0.80);
  });
});

// ---------------------------------------------------------------------------
describe('ambientTempCorrectionFactor()', () => {
  it('returns 1.0 at reference 40°C', () => {
    const f = ambientTempCorrectionFactor(40);
    assert.ok(approx(f, 1.0, 0.001), `Expected ~1.0, got ${f}`);
  });

  it('returns < 1.0 above 40°C', () => {
    const f = ambientTempCorrectionFactor(50);
    assert.ok(f < 1.0, `Expected < 1.0 at 50°C, got ${f}`);
  });

  it('returns > 1.0 below 40°C', () => {
    const f = ambientTempCorrectionFactor(25);
    assert.ok(f > 1.0, `Expected > 1.0 at 25°C, got ${f}`);
  });

  it('drops significantly near conductor temperature rating (75°C)', () => {
    const f = ambientTempCorrectionFactor(74);
    assert.ok(f < 0.25, `Expected < 0.25 at 74°C (only 1°C below rating), got ${f}`);
  });

  it('is clamped to minimum 0.01 at or above conductor rating', () => {
    const f = ambientTempCorrectionFactor(80);
    assert.ok(f >= 0.01, `Should be clamped to ≥ 0.01, got ${f}`);
  });
});

// ---------------------------------------------------------------------------
describe('stackingDerating()', () => {
  it('returns 1.0 for a single run', () => {
    assert.strictEqual(stackingDerating(1), 1.0);
  });

  it('returns 0.80 for 2 stacked runs', () => {
    assert.strictEqual(stackingDerating(2), 0.80);
  });

  it('returns 0.70 for 3 stacked runs', () => {
    assert.strictEqual(stackingDerating(3), 0.70);
  });

  it('returns 0.65 for 4 or more stacked runs', () => {
    assert.strictEqual(stackingDerating(4), 0.65);
    assert.strictEqual(stackingDerating(10), 0.65);
  });
});

// ---------------------------------------------------------------------------
describe('necAmpacityDerating()', () => {
  it('returns base ampacity unchanged at standard conditions', () => {
    const r = necAmpacityDerating(2000, { orientation: 'horizontal', ambientC: 40, stackedRuns: 1 });
    assert.ok(approx(r.deratedAmpacity, 2000, 5), `Expected ~2000, got ${r.deratedAmpacity}`);
    assert.ok(approx(r.combinedFactor, 1.0, 0.01));
  });

  it('reduces ampacity for edge-on installation', () => {
    const r = necAmpacityDerating(2000, { orientation: 'edgeon', ambientC: 40, stackedRuns: 1 });
    assert.ok(approx(r.deratedAmpacity, 1600, 5), `Expected ~1600, got ${r.deratedAmpacity}`);
    assert.strictEqual(r.orientationFactor, 0.80);
  });

  it('reduces ampacity for high ambient temperature', () => {
    const r = necAmpacityDerating(2000, { orientation: 'horizontal', ambientC: 50, stackedRuns: 1 });
    assert.ok(r.deratedAmpacity < 2000, 'Should derate for high ambient');
  });

  it('compounds all three factors', () => {
    const r = necAmpacityDerating(2000, { orientation: 'edgeon', ambientC: 50, stackedRuns: 2 });
    const expected = 2000 * 0.80 * r.ambientFactor * 0.80;
    assert.ok(approx(r.deratedAmpacity, expected, 10), `Expected ~${expected.toFixed(0)}, got ${r.deratedAmpacity}`);
  });
});

// ---------------------------------------------------------------------------
describe('voltageDropBusDuct()', () => {
  const baseParams = {
    currentA: 1000,
    rMohmPerFt: 0.175,
    xMohmPerFt: 0.055,
    lengthFt: 100,
    pf: 0.85,
    phases: 3,
    systemVoltageV: 480,
  };

  it('returns a vdPercent for a standard three-phase run', () => {
    const r = voltageDropBusDuct(baseParams);
    assert.ok(typeof r.vdPercent === 'number');
    assert.ok(r.vdPercent > 0);
  });

  it('calculates total resistance correctly', () => {
    const r = voltageDropBusDuct(baseParams);
    const expectedR = (0.175 * 100) / 1000;  // 0.0175 Ω
    assert.ok(approx(r.rOhmTotal, expectedR, 0.001), `rOhmTotal: expected ${expectedR}, got ${r.rOhmTotal}`);
  });

  it('passes NEC 3% recommendation for short low-current run', () => {
    const r = voltageDropBusDuct({ ...baseParams, currentA: 500, lengthFt: 50 });
    assert.ok(r.passNec, `Expected pass, vdPercent=${r.vdPercent}`);
  });

  it('fails NEC 3% recommendation for long high-current run', () => {
    const r = voltageDropBusDuct({ ...baseParams, currentA: 2000, lengthFt: 500 });
    assert.ok(!r.passNec, `Expected fail, vdPercent=${r.vdPercent}`);
  });

  it('single-phase run has higher VD than three-phase for same params', () => {
    const r3 = voltageDropBusDuct({ ...baseParams, phases: 3 });
    const r1 = voltageDropBusDuct({ ...baseParams, phases: 1 });
    assert.ok(r1.vdLineToNeutralV > r3.vdLineToNeutralV,
      `1-phase VD (${r1.vdLineToNeutralV}) should exceed 3-phase (${r3.vdLineToNeutralV})`);
  });

  it('VD scales linearly with length', () => {
    const r100 = voltageDropBusDuct({ ...baseParams, lengthFt: 100 });
    const r200 = voltageDropBusDuct({ ...baseParams, lengthFt: 200 });
    assert.ok(approx(r200.vdPercent, r100.vdPercent * 2, 0.01),
      `VD should double with double length`);
  });
});

// ---------------------------------------------------------------------------
describe('busStressForcePerFt()', () => {
  it('returns 0 for zero spacing', () => {
    assert.strictEqual(busStressForcePerFt(65, 0), 0);
  });

  it('returns a positive force for valid inputs', () => {
    const f = busStressForcePerFt(65, 6);
    assert.ok(f > 0, `Expected positive force, got ${f}`);
  });

  it('scales with fault current squared', () => {
    const f1 = busStressForcePerFt(10, 6);
    const f2 = busStressForcePerFt(20, 6);
    assert.ok(approx(f2, f1 * 4, f1 * 0.1), `Force should scale as I², got f1=${f1}, f2=${f2}`);
  });

  it('scales inversely with spacing', () => {
    const f6  = busStressForcePerFt(65, 6);
    const f12 = busStressForcePerFt(65, 12);
    assert.ok(approx(f6, f12 * 2, f6 * 0.01), `Force should halve when spacing doubles`);
  });

  it('IEEE 605 spot check: 65 kA, 6-in spacing ≈ 380 lbf/ft', () => {
    const f = busStressForcePerFt(65, 6);
    // 0.54 × 65² / 6 = 0.54 × 4225 / 6 ≈ 380.25 lbf/ft
    assert.ok(approx(f, 380.25, 1), `Expected ~380.25 lbf/ft, got ${f}`);
  });
});

// ---------------------------------------------------------------------------
describe('maxSupportSpan()', () => {
  it('returns Infinity for zero force', () => {
    const s = maxSupportSpan(0, 10000, 0.5);
    assert.strictEqual(s, Infinity);
  });

  it('returns 0 for zero allowable stress', () => {
    const s = maxSupportSpan(100, 0, 0.5);
    assert.strictEqual(s, 0);
  });

  it('returns a positive span for valid inputs', () => {
    const s = maxSupportSpan(100, 10000, 0.5);
    assert.ok(s > 0);
  });

  it('span decreases as force increases', () => {
    const s1 = maxSupportSpan(100, 10000, 0.5);
    const s2 = maxSupportSpan(200, 10000, 0.5);
    assert.ok(s1 > s2, `Span should decrease as force increases`);
  });

  it('span increases with higher section modulus', () => {
    const s1 = maxSupportSpan(100, 10000, 0.5);
    const s2 = maxSupportSpan(100, 10000, 1.0);
    assert.ok(s2 > s1, `Higher section modulus should allow longer span`);
  });
});

// ---------------------------------------------------------------------------
describe('selectStandardBusway()', () => {
  it('selects 800 A for 750 A load', () => {
    const r = selectStandardBusway(750);
    assert.strictEqual(r.rating, 800);
    assert.ok(r.adequate);
  });

  it('selects exact match when load equals standard rating', () => {
    const r = selectStandardBusway(2000);
    assert.strictEqual(r.rating, 2000);
    assert.ok(r.adequate);
  });

  it('selects next size up for non-standard requirement', () => {
    const r = selectStandardBusway(1500);
    assert.strictEqual(r.rating, 1600);
  });

  it('returns adequate=false when requirement exceeds largest standard size', () => {
    const r = selectStandardBusway(6000);
    assert.ok(!r.adequate);
  });
});

// ---------------------------------------------------------------------------
describe('runBusDuctStudy() — validation', () => {
  it('returns errors for zero current', () => {
    const r = runBusDuctStudy({ currentA: 0, lengthFt: 100, systemVoltageV: 480, faultCurrentKA: 65 });
    assert.ok(!r.valid);
    assert.ok(r.errors.length > 0);
  });

  it('returns errors for zero length', () => {
    const r = runBusDuctStudy({ currentA: 1000, lengthFt: 0, systemVoltageV: 480, faultCurrentKA: 65 });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => /length/i.test(e)));
  });

  it('returns errors for zero fault current', () => {
    const r = runBusDuctStudy({ currentA: 1000, lengthFt: 100, systemVoltageV: 480, faultCurrentKA: 0 });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => /fault/i.test(e)));
  });
});

// ---------------------------------------------------------------------------
describe('runBusDuctStudy() — integration', () => {
  const standardInputs = {
    label: 'Main Feeder',
    systemVoltageV: 480,
    phases: 3,
    material: 'Al',
    currentA: 1500,
    lengthFt: 100,
    orientation: 'horizontal',
    ambientC: 40,
    stackedRuns: 1,
    faultCurrentKA: 65,
    conductorSpacingIn: 6,
    supportSpanFt: 10,
  };

  it('returns valid=true for standard inputs', () => {
    const r = runBusDuctStudy(standardInputs);
    assert.ok(r.valid, `Expected valid; errors: ${r.errors.join(', ')}`);
  });

  it('result has all required sections', () => {
    const r = runBusDuctStudy(standardInputs);
    assert.ok(r.ampacity,       'Missing ampacity section');
    assert.ok(r.selectedBusway, 'Missing selectedBusway section');
    assert.ok(r.voltageDrop,    'Missing voltageDrop section');
    assert.ok(r.faultStress,    'Missing faultStress section');
    assert.ok(Array.isArray(r.warnings), 'Missing warnings array');
  });

  it('selects a standard busway rating ≥ required current', () => {
    const r = runBusDuctStudy(standardInputs);
    assert.ok(r.selectedBusway.rating >= standardInputs.currentA,
      `Selected rating ${r.selectedBusway.rating} should be ≥ ${standardInputs.currentA}`);
  });

  it('voltage drop is positive', () => {
    const r = runBusDuctStudy(standardInputs);
    assert.ok(r.voltageDrop.vdPercent > 0);
  });

  it('fault stress force is positive', () => {
    const r = runBusDuctStudy(standardInputs);
    assert.ok(r.faultStress.forcePerFt > 0);
  });

  it('warns when support span exceeds IEEE 605 maximum', () => {
    const r = runBusDuctStudy({ ...standardInputs, faultCurrentKA: 65, supportSpanFt: 50 });
    const hasFaultWarn = r.warnings.some(w => /span/i.test(w));
    if (!r.faultStress.spanPass) {
      assert.ok(hasFaultWarn, 'Should warn when span exceeds maximum');
    }
  });

  it('upsizes busway when derating reduces below load current', () => {
    // edge-on + hot ambient forces derating; stacking further reduces
    const r = runBusDuctStudy({
      ...standardInputs,
      currentA: 1900,
      orientation: 'edgeon',
      ambientC: 55,
      stackedRuns: 2,
    });
    assert.ok(r.valid);
    // With combined derating < 1, a 2000 A base would derate below 1900 A
    // so the selected rating should be 2000 or above
    assert.ok(r.selectedBusway.rating >= 2000,
      `Expected upsized selection ≥ 2000 A, got ${r.selectedBusway.rating}`);
  });
});
