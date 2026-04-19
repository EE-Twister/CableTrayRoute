import { strict as assert } from 'assert';
import {
  correctSecondaryWinding,
  differentialCurrents,
  evaluateCharacteristic,
  evaluateHarmonicRestraint,
  buildCharacteristicCurve,
  runDifferentialProtectionAnalysis,
  WINDING_CONNECTIONS,
  ELEMENT_TYPES,
} from '../analysis/differentialProtection.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function approxEqual(a, b, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// correctSecondaryWinding
// ---------------------------------------------------------------------------
console.log('\ncorrectSecondaryWinding');

test('Yy0 — no correction factor applied', () => {
  const r = correctSecondaryWinding({
    iSecondaryA: 500,
    ctr2: 100,    // CT secondary = 500/100 = 5 A
    iRatedSecondaryA: 500,
    windingConnection: 'Yy0',
  });
  // iRatedCtSecondary = 500/100 = 5A; iCtSecondary = 500/100 = 5A
  // correctionFactor = 1; iCorrected = 5; i2Pu = 5/5 = 1.0
  assert(approxEqual(r.i2Pu, 1.0), `expected i2Pu≈1.0, got ${r.i2Pu}`);
  assert(approxEqual(r.correctionFactor, 1.0), `expected factor 1.0, got ${r.correctionFactor}`);
});

test('Yd1 — correctionFactor is √3 (informational), i2Pu normalised to rated', () => {
  const r = correctSecondaryWinding({
    iSecondaryA: 418.37,   // ≈ rated secondary for 10 MVA @ 13.8 kV
    ctr2: 100,
    iRatedSecondaryA: 418.37,
    windingConnection: 'Yd1',
  });
  // correctionFactor is informational (the physical magnitude factor for delta CTs)
  assert(approxEqual(r.correctionFactor, Math.sqrt(3), 0.001),
    `expected correctionFactor=√3, got ${r.correctionFactor}`);
  // i2Pu is normalised by rated: at rated load i2Pu = 1.0 (numerical relay model)
  assert(approxEqual(r.i2Pu, 1.0, 0.01), `expected i2Pu≈1.0 at rated load, got ${r.i2Pu}`);
});

test('throws on zero CTR2', () => {
  assert.throws(
    () => correctSecondaryWinding({ iSecondaryA: 100, ctr2: 0, iRatedSecondaryA: 100, windingConnection: 'Yy0' }),
    /CTR2/
  );
});

test('unknown winding connection defaults to Yy0', () => {
  const r = correctSecondaryWinding({
    iSecondaryA: 200,
    ctr2: 50,
    iRatedSecondaryA: 200,
    windingConnection: 'Zz0',  // not in table
  });
  assert(approxEqual(r.correctionFactor, 1.0), `expected factor 1.0 (Yy0 default), got ${r.correctionFactor}`);
});

// ---------------------------------------------------------------------------
// differentialCurrents
// ---------------------------------------------------------------------------
console.log('\ndifferentialCurrents');

test('balanced through-fault: Iop ≈ 0, Ires = 1 pu', () => {
  // Primary side: I1 = rated current (1 pu), Secondary side: I2 = 1 pu
  const r = differentialCurrents({
    i1PrimaryA: 50.2,   // rated primary for 10 MVA @ 115 kV: 50.2 A
    ctr1: 10,
    iRatedPrimaryA: 50.2,
    i2Pu: 1.0,           // secondary current already normalised to 1 pu
  });
  // i1Pu = (50.2/10) / (50.2/10) = 1.0
  // iOpPu = |1.0 - 1.0| = 0.0
  // iResPu = (1.0 + 1.0) / 2 = 1.0
  assert(approxEqual(r.i1Pu, 1.0), `expected i1Pu=1.0, got ${r.i1Pu}`);
  assert(approxEqual(r.iOpPu, 0.0, 0.001), `expected iOpPu≈0, got ${r.iOpPu}`);
  assert(approxEqual(r.iResPu, 1.0), `expected iResPu=1.0, got ${r.iResPu}`);
});

test('internal fault: Iop ≈ i1Pu when I2 = 0', () => {
  const iRatedPrimaryA = 50.2;
  const ctr1 = 10;
  const i1PrimaryA = 150.6; // 3× rated
  const r = differentialCurrents({ i1PrimaryA, ctr1, iRatedPrimaryA, i2Pu: 0 });
  assert(approxEqual(r.i1Pu, 3.0, 0.01), `expected i1Pu=3.0, got ${r.i1Pu}`);
  assert(approxEqual(r.iOpPu, 3.0, 0.01), `expected iOpPu=3.0, got ${r.iOpPu}`);
  assert(approxEqual(r.iResPu, 1.5, 0.01), `expected iResPu=1.5, got ${r.iResPu}`);
});

test('throws on zero CTR1', () => {
  assert.throws(
    () => differentialCurrents({ i1PrimaryA: 100, ctr1: 0, iRatedPrimaryA: 100, i2Pu: 1 }),
    /CTR1/
  );
});

// ---------------------------------------------------------------------------
// evaluateCharacteristic
// ---------------------------------------------------------------------------
console.log('\nevaluateCharacteristic');

test('point below minimum pickup: RESTRAINED', () => {
  const r = evaluateCharacteristic({ iOpPu: 0.05, iResPu: 0.1, iMinPu: 0.20, slope1: 0.25, slope2: 0.50, iResBreakPu: 2.0 });
  assert(!r.wouldOperate, 'should be RESTRAINED');
  assert.equal(r.zone, 1);
});

test('point above slope-1 threshold: OPERATE', () => {
  // threshold at Ires=1.0: 0.20 + 0.25*1.0 = 0.45
  const r = evaluateCharacteristic({ iOpPu: 0.5, iResPu: 1.0, iMinPu: 0.20, slope1: 0.25, slope2: 0.50, iResBreakPu: 2.0 });
  assert(r.wouldOperate, 'should OPERATE');
  assert(approxEqual(r.tripThresholdPu, 0.45, 0.001));
  assert.equal(r.zone, 1);
});

test('zone 2 — above slope-2 threshold: OPERATE', () => {
  // Ires=3.0 > break=2.0; threshold = 0.20 + 0.50*3.0 = 1.70
  const r = evaluateCharacteristic({ iOpPu: 1.8, iResPu: 3.0, iMinPu: 0.20, slope1: 0.25, slope2: 0.50, iResBreakPu: 2.0 });
  assert(r.wouldOperate, 'should OPERATE in zone 2');
  assert.equal(r.zone, 2);
  assert(approxEqual(r.tripThresholdPu, 1.70, 0.001));
});

test('zone 2 — below slope-2 threshold: RESTRAINED', () => {
  // Ires=3.0; threshold=1.70; Iop=1.5 < 1.70 → RESTRAINED
  const r = evaluateCharacteristic({ iOpPu: 1.5, iResPu: 3.0, iMinPu: 0.20, slope1: 0.25, slope2: 0.50, iResBreakPu: 2.0 });
  assert(!r.wouldOperate, 'should be RESTRAINED in zone 2');
  assert.equal(r.zone, 2);
});

// ---------------------------------------------------------------------------
// evaluateHarmonicRestraint
// ---------------------------------------------------------------------------
console.log('\nevaluateHarmonicRestraint');

test('no harmonics: not blocked', () => {
  const r = evaluateHarmonicRestraint({ iDiff1stA: 100, iDiff2ndA: 0, iDiff5thA: 0 });
  assert(!r.inrushBlocked);
  assert(!r.overexcitationBlocked);
  assert(approxEqual(r.har2Ratio, 0));
  assert(approxEqual(r.har5Ratio, 0));
});

test('2nd harmonic inrush blocking — 20% > 15% threshold', () => {
  const r = evaluateHarmonicRestraint({
    iDiff1stA: 100,
    iDiff2ndA: 20,  // 20% 2nd harmonic
    iDiff5thA: 0,
    ihr2Threshold: 0.15,
    ihr5Threshold: 0.20,
  });
  assert(r.inrushBlocked, 'should block on inrush');
  assert(!r.overexcitationBlocked);
  assert(approxEqual(r.har2Ratio, 0.20));
});

test('2nd harmonic below threshold: not blocked', () => {
  const r = evaluateHarmonicRestraint({
    iDiff1stA: 100,
    iDiff2ndA: 10,  // 10% < 15% threshold
    iDiff5thA: 0,
    ihr2Threshold: 0.15,
  });
  assert(!r.inrushBlocked);
});

test('5th harmonic overexcitation blocking', () => {
  const r = evaluateHarmonicRestraint({
    iDiff1stA: 100,
    iDiff2ndA: 5,
    iDiff5thA: 25,  // 25% > 20% threshold
    ihr2Threshold: 0.15,
    ihr5Threshold: 0.20,
  });
  assert(!r.inrushBlocked);
  assert(r.overexcitationBlocked, 'should block on overexcitation');
});

test('zero fundamental: ratios default to zero', () => {
  const r = evaluateHarmonicRestraint({ iDiff1stA: 0, iDiff2ndA: 5, iDiff5thA: 3 });
  assert(approxEqual(r.har2Ratio, 0));
  assert(approxEqual(r.har5Ratio, 0));
});

// ---------------------------------------------------------------------------
// buildCharacteristicCurve
// ---------------------------------------------------------------------------
console.log('\nbuildCharacteristicCurve');

test('zone1 starts at (0, iMinPu)', () => {
  const c = buildCharacteristicCurve({ iMinPu: 0.2, slope1: 0.25, slope2: 0.5, iResBreakPu: 2.0 });
  assert.equal(c.zone1[0].x, 0);
  assert(approxEqual(c.zone1[0].y, 0.2));
});

test('zone1 ends near breakpoint', () => {
  const c = buildCharacteristicCurve({ iMinPu: 0.2, slope1: 0.25, slope2: 0.5, iResBreakPu: 2.0 });
  const lastPt = c.zone1[c.zone1.length - 1];
  assert(lastPt.x <= 2.05, `breakpoint should be ≤2.05, got ${lastPt.x}`);
});

test('zone2 starts at breakpoint', () => {
  const c = buildCharacteristicCurve({ iMinPu: 0.2, slope1: 0.25, slope2: 0.5, iResBreakPu: 2.0 });
  assert(approxEqual(c.zone2[0].x, 2.0));
});

test('zone1 slope is correct', () => {
  const c = buildCharacteristicCurve({ iMinPu: 0.2, slope1: 0.25, slope2: 0.5, iResBreakPu: 2.0 });
  const p1 = c.zone1.find(p => approxEqual(p.x, 1.0));
  // y = 0.2 + 0.25 * 1.0 = 0.45
  assert(p1 && approxEqual(p1.y, 0.45, 0.005), `expected y≈0.45 at x=1.0, got ${p1?.y}`);
});

// ---------------------------------------------------------------------------
// runDifferentialProtectionAnalysis — integration tests
// ---------------------------------------------------------------------------
console.log('\nrunDifferentialProtectionAnalysis');

const BASE_INPUTS = {
  elementLabel: 'T1 — 10 MVA 115/13.8 kV Yd1',
  elementType: 'transformer',
  ratingMva: 10,
  voltageHvKv: 115,
  voltageLvKv: 13.8,
  windingConnection: 'Yd1',
  ctr1: 10,
  ctr2: 100,
  iMinPu: 0.20,
  slope1: 0.25,
  slope2: 0.50,
  iResBreakPu: 2.0,
  ihr2Threshold: 0.15,
  ihr5Threshold: 0.20,
  phases: [
    { label: 'A', i1A: 50.2, i2A: 418.4, i2ndA: 0, i5thA: 0 },
    { label: 'B', i1A: 50.2, i2A: 418.4, i2ndA: 0, i5thA: 0 },
    { label: 'C', i1A: 50.2, i2A: 418.4, i2ndA: 0, i5thA: 0 },
  ],
};

test('balanced load condition: all phases RESTRAINED', () => {
  const r = runDifferentialProtectionAnalysis(BASE_INPUTS);
  assert.equal(r.overallStatus, 'RESTRAINED');
  r.phaseResults.forEach(ph => {
    assert.equal(ph.status, 'RESTRAINED', `Phase ${ph.label} should be RESTRAINED`);
  });
});

test('result contains rated currents', () => {
  const r = runDifferentialProtectionAnalysis(BASE_INPUTS);
  // iRatedPrimaryA = 10000 / (√3 * 115) ≈ 50.2 A
  assert(approxEqual(r.iRatedPrimaryA, 50.2, 1.0), `got ${r.iRatedPrimaryA}`);
  // iRatedSecondaryA = 10000 / (√3 * 13.8) ≈ 418.4 A
  assert(approxEqual(r.iRatedSecondaryA, 418.4, 1.0), `got ${r.iRatedSecondaryA}`);
});

test('internal fault on phase A: OPERATE', () => {
  const inputs = {
    ...BASE_INPUTS,
    phases: [
      { label: 'A', i1A: 200.8, i2A: 0, i2ndA: 0, i5thA: 0 },  // 4× rated, no secondary current
      { label: 'B', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
      { label: 'C', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
    ],
  };
  const r = runDifferentialProtectionAnalysis(inputs);
  assert.equal(r.phaseResults[0].status, 'OPERATE', 'Phase A should OPERATE');
  assert.equal(r.overallStatus, 'OPERATE');
  assert(r.warnings.some(w => w.includes('Phase A') && w.includes('OPERATE')));
});

test('inrush on phase A: HARMONIC_BLOCKED_INRUSH', () => {
  // Create a fault scenario but with high 2nd harmonic → should block
  const inputs = {
    ...BASE_INPUTS,
    phases: [
      { label: 'A', i1A: 200.8, i2A: 0, i2ndA: 50, i5thA: 0 },  // 25% 2nd harmonic
      { label: 'B', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
      { label: 'C', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
    ],
  };
  const r = runDifferentialProtectionAnalysis(inputs);
  assert.equal(r.phaseResults[0].status, 'HARMONIC_BLOCKED_INRUSH');
  assert.equal(r.overallStatus, 'HARMONIC_BLOCKED');
  assert(r.warnings.some(w => w.includes('2nd harmonic')));
});

test('overexcitation blocking: HARMONIC_BLOCKED_OVEREXC', () => {
  const inputs = {
    ...BASE_INPUTS,
    phases: [
      { label: 'A', i1A: 200.8, i2A: 0, i2ndA: 5, i5thA: 50 },  // 25% 5th harmonic
      { label: 'B', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
      { label: 'C', i1A: 50.2,  i2A: 418.4, i2ndA: 0, i5thA: 0 },
    ],
  };
  const r = runDifferentialProtectionAnalysis(inputs);
  assert.equal(r.phaseResults[0].status, 'HARMONIC_BLOCKED_OVEREXC');
  assert(r.warnings.some(w => w.includes('5th harmonic')));
});

test('result has curve data for plotting', () => {
  const r = runDifferentialProtectionAnalysis(BASE_INPUTS);
  assert(Array.isArray(r.curve.zone1) && r.curve.zone1.length > 0);
  assert(Array.isArray(r.curve.zone2) && r.curve.zone2.length > 0);
});

test('result has timestamp', () => {
  const r = runDifferentialProtectionAnalysis(BASE_INPUTS);
  assert(typeof r.timestamp === 'string' && r.timestamp.length > 0);
});

test('throws on invalid MVA', () => {
  assert.throws(
    () => runDifferentialProtectionAnalysis({ ...BASE_INPUTS, ratingMva: 0 }),
    /MVA/
  );
});

test('throws on slope2 < slope1', () => {
  assert.throws(
    () => runDifferentialProtectionAnalysis({ ...BASE_INPUTS, slope1: 0.5, slope2: 0.25 }),
    /Slope 2/
  );
});

test('bus protection (87B) uses Yy0 correction', () => {
  const inputs = {
    ...BASE_INPUTS,
    elementType: 'bus',
    windingConnection: 'Yd1',  // should be ignored for bus
    voltageHvKv: 13.8,
    voltageLvKv: 13.8,
    ctr1: 100,
    ctr2: 100,
    phases: [
      { label: 'A', i1A: 418.4, i2A: 418.4, i2ndA: 0, i5thA: 0 },
      { label: 'B', i1A: 418.4, i2A: 418.4, i2ndA: 0, i5thA: 0 },
      { label: 'C', i1A: 418.4, i2A: 418.4, i2ndA: 0, i5thA: 0 },
    ],
  };
  const r = runDifferentialProtectionAnalysis(inputs);
  // Bus uses Yy0 — no winding correction, balanced currents → RESTRAINED
  assert.equal(r.overallStatus, 'RESTRAINED');
});

test('iMinOperateA is present in result', () => {
  const r = runDifferentialProtectionAnalysis(BASE_INPUTS);
  assert(typeof r.iMinOperateA === 'number' && r.iMinOperateA > 0, `iMinOperateA = ${r.iMinOperateA}`);
});

test('ELEMENT_TYPES constants are defined', () => {
  assert.equal(ELEMENT_TYPES.TRANSFORMER, '87T');
  assert.equal(ELEMENT_TYPES.BUS, '87B');
  assert.equal(ELEMENT_TYPES.GENERATOR, '87G');
});

test('WINDING_CONNECTIONS has expected entries', () => {
  assert(WINDING_CONNECTIONS['Yd1'], 'missing Yd1');
  assert(WINDING_CONNECTIONS['Yy0'], 'missing Yy0');
  assert(approxEqual(WINDING_CONNECTIONS['Yd1'].correction, Math.sqrt(3), 0.001));
  assert(approxEqual(WINDING_CONNECTIONS['Yy0'].correction, 1.0));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
