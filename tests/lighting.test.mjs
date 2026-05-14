/**
 * Tests for analysis/lighting.mjs
 *
 * Covers: IES LM-63 parser, roomCavityRatio, coefficientOfUtilization,
 * averageIlluminance, interpolateCandela, pointIlluminanceGrid,
 * egressComplianceCheck, runLightingStudy integration, and input validation.
 */
import assert from 'assert';
import {
  GENERIC_CU_TABLE,
  NFPA_EGRESS_AVG_FC,
  NFPA_EGRESS_MIN_FC,
  parseIES,
  roomCavityRatio,
  cuReflectanceColumn,
  coefficientOfUtilization,
  averageIlluminance,
  generateDefaultFixtureLayout,
  interpolateCandela,
  pointIlluminanceGrid,
  egressComplianceCheck,
  runLightingStudy,
} from '../analysis/lighting.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const approxPct = (a, b, pct = 1) => Math.abs(a - b) <= Math.abs(b) * pct / 100;

// ---------------------------------------------------------------------------
// Minimal valid IES LM-63 fixture string for parser tests
// ---------------------------------------------------------------------------
const MINIMAL_IES = `IESNA:LM-63-2002
[TEST] GENERIC-LED-TEST
[MANUFAC] Generic
[LUMCAT] GEN-LED-3000
[LUMINAIRE] Generic LED Panel 3000 lm
[LAMPCAT] LED
[LAMP] Integral LED
[BALLASTCAT] N/A
[BALLAST] N/A
[MAINTCAT] 1
[OTHER] Representative photometric test data
[ENDLIST]
TILT=NONE
1 3000.0 1.0 10 1 1 1 0.0 0.0 0.0
1.0 1.0 50.0
0.0 10.0 20.0 30.0 40.0 50.0 60.0 70.0 80.0 90.0
0.0
2520 2500 2450 2380 2280 2100 1800 1400 900 200
`;

// ---------------------------------------------------------------------------
describe('GENERIC_CU_TABLE constants', () => {
  it('has 11 rows (RCR 0–10)', () => {
    assert.strictEqual(GENERIC_CU_TABLE.length, 11);
  });
  it('each row has 3 columns (High/Med/Low reflectance)', () => {
    for (const row of GENERIC_CU_TABLE) assert.strictEqual(row.length, 3);
  });
  it('CU decreases monotonically with RCR for each column', () => {
    for (let col = 0; col < 3; col++) {
      for (let r = 1; r < GENERIC_CU_TABLE.length; r++) {
        assert.ok(
          GENERIC_CU_TABLE[r][col] < GENERIC_CU_TABLE[r - 1][col],
          `CU[${r}][${col}] should be < CU[${r-1}][${col}]`,
        );
      }
    }
  });
  it('High reflectance CU > Low reflectance CU at every RCR', () => {
    for (const row of GENERIC_CU_TABLE) {
      assert.ok(row[0] > row[2], 'High CU must exceed Low CU');
    }
  });
  it('NFPA egress thresholds are correct', () => {
    assert.strictEqual(NFPA_EGRESS_AVG_FC, 1.0);
    assert.strictEqual(NFPA_EGRESS_MIN_FC, 0.1);
  });
});

// ---------------------------------------------------------------------------
describe('parseIES', () => {
  it('parses lumens correctly — 1 lamp × 3000 lm × BF 1.0 = 3000 lm total', () => {
    const result = parseIES(MINIMAL_IES);
    assert.strictEqual(result.totalLumens, 3000);
    assert.strictEqual(result.numLamps, 1);
    assert.strictEqual(result.lumensPerLamp, 3000);
    assert.strictEqual(result.ballastFactor, 1.0);
    assert.strictEqual(result.inputWatts, 50);
  });
  it('extracts correct number of vertical and horizontal angles', () => {
    const result = parseIES(MINIMAL_IES);
    assert.strictEqual(result.vertAngles.length, 10);
    assert.strictEqual(result.horizAngles.length, 1);
  });
  it('first vertical angle is 0°, last is 90°', () => {
    const { vertAngles } = parseIES(MINIMAL_IES);
    assert.strictEqual(vertAngles[0], 0);
    assert.strictEqual(vertAngles[9], 90);
  });
  it('nadir candela (0°) is 2520 cd', () => {
    const { candelaSets } = parseIES(MINIMAL_IES);
    assert.strictEqual(candelaSets[0][0], 2520);
  });
  it('90° candela is 200 cd', () => {
    const { candelaSets } = parseIES(MINIMAL_IES);
    assert.strictEqual(candelaSets[0][9], 200);
  });
  it('throws on missing TILT= line', () => {
    assert.throws(() => parseIES('IESNA:LM-63-2002\n[TEST] broken\n'), /TILT=/);
  });
  it('throws on unsupported TILT value', () => {
    const ies = MINIMAL_IES.replace('TILT=NONE', 'TILT=90');
    assert.throws(() => parseIES(ies), /TILT=90/);
  });
  it('photType is 1 (type C)', () => {
    assert.strictEqual(parseIES(MINIMAL_IES).photType, 1);
  });
});

// ---------------------------------------------------------------------------
describe('roomCavityRatio', () => {
  it('20×30 ft room, 7 ft cavity (mounting=9.5, workplane=2.5) → RCR ≈ 2.917', () => {
    const rcr = roomCavityRatio(20, 30, 9.5, 2.5); // 9.5 - 2.5 = 7 ft cavity
    assert.ok(approx(rcr, 2.917, 0.005), `RCR=${rcr} expected ≈ 2.917`);
  });
  it('square room — RCR formula reduces to 10H/L for square plan', () => {
    // 10×10 room, 5 ft cavity: RCR = 5×5×20/100 = 5
    const rcr = roomCavityRatio(10, 10, 7.5, 2.5);
    assert.ok(approx(rcr, 5, 0.001), `RCR=${rcr} expected 5`);
  });
  it('RCR = 0 when mounting height equals workplane height → throws', () => {
    assert.throws(() => roomCavityRatio(20, 20, 2.5, 2.5), /mounting height/i);
  });
  it('throws on non-positive room dimensions', () => {
    assert.throws(() => roomCavityRatio(0, 20, 8, 2.5), /length/i);
    assert.throws(() => roomCavityRatio(20, 0, 8, 2.5), /width/i);
  });
});

// ---------------------------------------------------------------------------
describe('cuReflectanceColumn', () => {
  it('80/70 → column 0 (High)', () => assert.strictEqual(cuReflectanceColumn(80, 70), 0));
  it('70/50 → column 1 (Medium)', () => assert.strictEqual(cuReflectanceColumn(70, 50), 1));
  it('50/30 → column 2 (Low)', () => assert.strictEqual(cuReflectanceColumn(50, 30), 2));
  it('75/60 maps to High (boundary)', () => assert.strictEqual(cuReflectanceColumn(75, 60), 0));
  it('60/40 maps to Medium (boundary)', () => assert.strictEqual(cuReflectanceColumn(60, 40), 1));
  it('40/20 maps to Low', () => assert.strictEqual(cuReflectanceColumn(40, 20), 2));
});

// ---------------------------------------------------------------------------
describe('coefficientOfUtilization', () => {
  it('RCR=0, 80/70 reflectance → CU = 1.19 (table row 0)', () => {
    assert.ok(approx(coefficientOfUtilization(0, 80, 70), 1.19));
  });
  it('RCR=5, 80/70 → CU = 0.59', () => {
    assert.ok(approx(coefficientOfUtilization(5, 80, 70), 0.59));
  });
  it('RCR=10, 50/30 → CU = 0.30', () => {
    assert.ok(approx(coefficientOfUtilization(10, 50, 30), 0.30));
  });
  it('fractional RCR 2.5 interpolates between rows 2 and 3 (80/70)', () => {
    const cu = coefficientOfUtilization(2.5, 80, 70);
    // should be midpoint of 0.87 and 0.76 = 0.815
    assert.ok(approx(cu, 0.815, 0.005));
  });
  it('RCR > 10 clamps to row 10', () => {
    const cu1 = coefficientOfUtilization(10, 80, 70);
    const cu2 = coefficientOfUtilization(15, 80, 70);
    assert.strictEqual(cu1, cu2);
  });
});

// ---------------------------------------------------------------------------
describe('averageIlluminance', () => {
  it('100 fixtures × 3000 lm, CU=0.70, LLF=0.80, 600 ft² → 280 fc', () => {
    const fc = averageIlluminance(100, 3000, 0.70, 0.80, 600);
    assert.ok(approx(fc, 280, 0.1), `E=${fc} expected 280 fc`);
  });
  it('doubles with 2× fixtures', () => {
    const fc1 = averageIlluminance(50, 3000, 0.70, 0.80, 600);
    const fc2 = averageIlluminance(100, 3000, 0.70, 0.80, 600);
    assert.ok(approx(fc2, fc1 * 2, 0.01));
  });
  it('throws on zero fixtures', () => {
    assert.throws(() => averageIlluminance(0, 3000, 0.70, 0.80, 600), /fixtures/i);
  });
  it('throws on zero lumens', () => {
    assert.throws(() => averageIlluminance(10, 0, 0.70, 0.80, 600), /lumens/i);
  });
  it('throws on LLF > 1', () => {
    assert.throws(() => averageIlluminance(10, 3000, 0.70, 1.1, 600), /LLF/i);
  });
});

// ---------------------------------------------------------------------------
describe('generateDefaultFixtureLayout', () => {
  it('60x10 ft corridor with 6 fixtures uses one centered row', () => {
    const layout = generateDefaultFixtureLayout(60, 10, 6);
    assert.strictEqual(layout.rows, 1);
    assert.strictEqual(layout.cols, 6);
    assert.strictEqual(layout.positions.length, 6);
    assert.ok(approx(layout.positions[0].x, 8.571, 0.001));
    assert.ok(approx(layout.positions[0].y, 5, 0.001));
    assert.ok(approx(layout.positions[5].x, 51.429, 0.001));
  });
  it('20x30 ft room with 6 fixtures balances into multiple rows', () => {
    const layout = generateDefaultFixtureLayout(20, 30, 6);
    assert.strictEqual(layout.rows, 3);
    assert.strictEqual(layout.cols, 2);
    assert.strictEqual(layout.positions.length, 6);
    assert.ok(layout.positions.every(p => p.x > 0 && p.x < 20 && p.y > 0 && p.y < 30));
  });
  it('keeps every fixture inside the room for uneven counts', () => {
    const layout = generateDefaultFixtureLayout(42, 18, 5);
    assert.strictEqual(layout.positions.length, 5);
    assert.ok(layout.positions.every(p => p.x > 0 && p.x < 42 && p.y > 0 && p.y < 18));
  });
  it('throws on invalid dimensions or fixture count', () => {
    assert.throws(() => generateDefaultFixtureLayout(0, 10, 2), /length/i);
    assert.throws(() => generateDefaultFixtureLayout(10, 0, 2), /width/i);
    assert.throws(() => generateDefaultFixtureLayout(10, 10, 0), /fixtures/i);
  });
});

// ---------------------------------------------------------------------------
describe('interpolateCandela', () => {
  const angles   = [0, 30, 60, 90];
  const candelas = [1000, 800, 500, 100];

  it('exact match at 0° returns 1000', () => {
    assert.strictEqual(interpolateCandela(angles, candelas, 0), 1000);
  });
  it('exact match at 90° returns 100', () => {
    assert.strictEqual(interpolateCandela(angles, candelas, 90), 100);
  });
  it('midpoint 15° interpolates between 1000 and 800 → 900', () => {
    assert.ok(approx(interpolateCandela(angles, candelas, 15), 900));
  });
  it('midpoint 45° interpolates between 800 and 500 → 650', () => {
    assert.ok(approx(interpolateCandela(angles, candelas, 45), 650));
  });
  it('out-of-range angle clamps to boundary', () => {
    assert.strictEqual(interpolateCandela(angles, candelas, -10), 1000);
    assert.strictEqual(interpolateCandela(angles, candelas, 180), 100);
  });
});

// ---------------------------------------------------------------------------
describe('pointIlluminanceGrid', () => {
  // Isotropic fixture (I = 1000 cd at all angles) centered in 10×10 ft room
  const vertAngles = [0, 30, 60, 90];
  const candelas   = [1000, 1000, 1000, 1000];
  const fixtures   = [{ x: 5, y: 5 }];

  it('returns correct grid dimensions', () => {
    const result = pointIlluminanceGrid(fixtures, 8, vertAngles, candelas, 10, 10);
    assert.strictEqual(result.rows, 10);
    assert.strictEqual(result.cols, 10);
    assert.strictEqual(result.grid.length, 100);
  });
  it('center cell illuminance is greater than corner cell (symmetric fixture)', () => {
    const result = pointIlluminanceGrid(fixtures, 8, vertAngles, candelas, 10, 10);
    // Center cell row 4, col 4 (point at 4.5, 4.5)
    const eCentre = result.grid[4 * 10 + 4];
    // Corner cell row 0, col 0 (point at 0.5, 0.5)
    const eCorner = result.grid[0];
    assert.ok(eCentre > eCorner, `Center ${eCentre.toFixed(3)} should exceed corner ${eCorner.toFixed(3)}`);
  });
  it('maxFc ≥ avgFc ≥ minFc', () => {
    const r = pointIlluminanceGrid(fixtures, 8, vertAngles, candelas, 10, 10);
    assert.ok(r.maxFc >= r.avgFc && r.avgFc >= r.minFc);
  });
  it('minFc > 0 (all points receive some light from the single fixture)', () => {
    const r = pointIlluminanceGrid(fixtures, 8, vertAngles, candelas, 10, 10);
    assert.ok(r.minFc > 0, `minFc=${r.minFc} should be > 0`);
  });
  it('doubling fixture count approximately doubles illuminance', () => {
    const r1 = pointIlluminanceGrid([{ x: 5, y: 5 }], 8, vertAngles, candelas, 10, 10);
    const r2 = pointIlluminanceGrid([{ x: 5, y: 5 }, { x: 5, y: 5 }], 8, vertAngles, candelas, 10, 10);
    assert.ok(approxPct(r2.avgFc, r1.avgFc * 2, 0.1), `Expected ~2× avgFc, got ${r2.avgFc} vs ${r1.avgFc * 2}`);
  });
  it('throws when no fixtures provided', () => {
    assert.throws(() => pointIlluminanceGrid([], 8, vertAngles, candelas, 10, 10), /fixture/i);
  });
});

// ---------------------------------------------------------------------------
describe('egressComplianceCheck', () => {
  it('avgFc=0.8 → fail (below 1.0 fc threshold)', () => {
    const r = egressComplianceCheck({ avgFc: 0.8 });
    assert.strictEqual(r.pass, false);
    assert.ok(r.violations.length > 0);
  });
  it('avgFc=1.2, minFc=0.12 → pass', () => {
    const r = egressComplianceCheck({ avgFc: 1.2, minFc: 0.12 });
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.violations.length, 0);
  });
  it('avgFc=1.5, minFc=0.05 → fail (min below 0.1 fc)', () => {
    const r = egressComplianceCheck({ avgFc: 1.5, minFc: 0.05 });
    assert.strictEqual(r.pass, false);
    assert.ok(r.violations.some(v => /minimum/i.test(v)));
  });
  it('avgFc=1.0 exactly → pass (boundary meets threshold)', () => {
    assert.strictEqual(egressComplianceCheck({ avgFc: 1.0 }).pass, true);
  });
  it('minFc null → skip minimum check', () => {
    // avgFc passes but minFc omitted → should pass
    assert.strictEqual(egressComplianceCheck({ avgFc: 1.2 }).pass, true);
  });
  it('both avg and min fail → two violations', () => {
    const r = egressComplianceCheck({ avgFc: 0.5, minFc: 0.02 });
    assert.strictEqual(r.violations.length, 2);
  });
  it('result includes avgThresholdFc and minThresholdFc', () => {
    const r = egressComplianceCheck({ avgFc: 1.5, minFc: 0.2 });
    assert.strictEqual(r.avgThresholdFc, 1.0);
    assert.strictEqual(r.minThresholdFc, 0.1);
  });
});

// ---------------------------------------------------------------------------
describe('runLightingStudy integration', () => {
  const BASE_INPUT = {
    roomLengthFt:     20,
    roomWidthFt:      30,
    mountingHeightFt:  9,
    workplaneHeightFt: 2.5,
    numFixtures:      50,
    lumensPerFixture: 3200,
    llf:              0.80,
    ceilingReflPct:   80,
    wallReflPct:      70,
  };

  it('returns valid: true for valid input', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.errors.length, 0);
  });
  it('result contains lumenMethod, pointGrid (null), egressCheck', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.ok(r.lumenMethod, 'lumenMethod missing');
    assert.strictEqual(r.pointGrid, null); // no IES data provided
    assert.ok(r.egressCheck, 'egressCheck missing');
  });
  it('egressCheck has a pass property', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.ok('pass' in r.egressCheck);
  });
  it('lumenMethod avgFc is a positive number', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.ok(r.lumenMethod.avgFc > 0);
  });
  it('lumenMethod.rcr is positive', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.ok(r.lumenMethod.rcr > 0);
  });
  it('point grid computed when fixturePositions and candelas provided', () => {
    const r = runLightingStudy({
      ...BASE_INPUT,
      fixturePositions: [{ x: 5, y: 7 }, { x: 15, y: 7 }],
      vertAngles:  [0, 45, 90],
      candelas:    [2000, 1000, 100],
    });
    assert.ok(r.pointGrid !== null, 'pointGrid should be computed');
    assert.ok(r.pointGrid.avgFc > 0);
  });
  it('single fixture → very low illuminance → egress fails', () => {
    const r = runLightingStudy({ ...BASE_INPUT, numFixtures: 1, lumensPerFixture: 100 });
    assert.strictEqual(r.egressCheck.pass, false);
  });
  it('returns valid: false for invalid input — zero fixtures', () => {
    const r = runLightingStudy({ ...BASE_INPUT, numFixtures: 0 });
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.length > 0);
  });
  it('returns valid: false when mounting height ≤ workplane height', () => {
    const r = runLightingStudy({ ...BASE_INPUT, mountingHeightFt: 2.5, workplaneHeightFt: 2.5 });
    assert.strictEqual(r.valid, false);
  });
  it('returns valid: false when room length is negative', () => {
    const r = runLightingStudy({ ...BASE_INPUT, roomLengthFt: -5 });
    assert.strictEqual(r.valid, false);
  });
  it('includes warnings when IES data missing', () => {
    const r = runLightingStudy(BASE_INPUT);
    assert.ok(r.warnings.length > 0);
  });
  it('low LLF triggers a warning', () => {
    const r = runLightingStudy({ ...BASE_INPUT, llf: 0.50 });
    assert.ok(r.warnings.some(w => /LLF|loss factor/i.test(w)));
  });
});
