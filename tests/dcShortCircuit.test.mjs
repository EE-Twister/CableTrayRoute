/**
 * Tests for analysis/dcShortCircuit.mjs
 *
 * Reference calculations:
 *
 * Golden path — 48 V lead-acid battery room:
 *   V_oc = 48 V, R_bat = 0.010 Ω, R_cable = 0.005 Ω, R_bus = 0.001 Ω
 *   R_total = 0.016 Ω
 *   I_bf = 48 / 0.016 = 3000 A
 *
 *   Arc flash (gap = 25 mm, D = 455 mm, t = 50 ms, open_air):
 *   I_arc iteratively from Stokes–Oppenlander:
 *     V_arc ≈ 20 + 0.534 × 25 × 3000^0.12 ≈ 20 + 13.35 × 2.64 ≈ 55.2 V
 *     I_arc ≈ (48 − 55.2) / 0.016 → clamped to ~0 (arc barely sustained at 48 V, 25 mm)
 *
 *   Higher-voltage golden path — 125 V DC station battery:
 *   V_oc = 125 V, R_total = 0.025 Ω → I_bf = 5000 A
 *   Arc: gap = 25 mm, D = 455 mm, t = 50 ms open_air
 *     V_arc ≈ 20 + 0.534×25×5000^0.12 ≈ 20 + 13.35×2.78 ≈ 57.1 V
 *     I_arc ≈ (125 − 57.1) / 0.025 ≈ 2716 A
 *     P_arc ≈ 2716 × 57.1 ≈ 155,083 W
 *     E = (4.184 × 1.0 × 155083 × 0.05) / (2π × 45.5²) ≈ 32,450 / 13,021 ≈ 2.49 cal/cm²
 */

import assert from 'assert';
import {
  calcDcFaultCurrent,
  calcDcArcFlash,
  calcDcArcingCurrent,
  selectDcProtection,
  runDcShortCircuitStudy,
  totalCircuitResistance,
  openCircuitVoltage,
  ppeCategoryForEnergy,
  CELL_VOLTAGE,
  PPE_CATEGORIES,
  STANDARD_DC_VOLTAGES,
} from '../analysis/dcShortCircuit.mjs';

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

function approx(actual, expected, tol = 0.05, msg = '') {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.5,
    `${msg}Expected ~${expected}, got ${actual} (rel error ${(rel * 100).toFixed(2)}%)`
  );
}

// ---------------------------------------------------------------------------
// totalCircuitResistance
// ---------------------------------------------------------------------------
describe('totalCircuitResistance', () => {
  it('sums battery, cable, and bus resistances', () => {
    const R = totalCircuitResistance({
      batteryInternalResistanceOhm: 0.010,
      cableResistanceOhm: 0.005,
      busbarResistanceOhm: 0.001,
    });
    approx(R, 0.016, 0.001);
  });

  it('uses zero for omitted cable/bus resistance', () => {
    const R = totalCircuitResistance({ batteryInternalResistanceOhm: 0.020 });
    approx(R, 0.020, 0.001);
  });

  it('throws for non-positive battery resistance', () => {
    assert.throws(() => totalCircuitResistance({ batteryInternalResistanceOhm: 0 }));
  });

  it('throws for negative cable resistance', () => {
    assert.throws(() => totalCircuitResistance({
      batteryInternalResistanceOhm: 0.01,
      cableResistanceOhm: -0.001,
    }));
  });
});

// ---------------------------------------------------------------------------
// openCircuitVoltage
// ---------------------------------------------------------------------------
describe('openCircuitVoltage', () => {
  it('calculates from cell count and chemistry', () => {
    const V = openCircuitVoltage({ batteryCells: 24, chemistry: 'lead-acid' });
    assert.strictEqual(V, 48); // 24 × 2.0 V
  });

  it('accepts direct batteryVoltage override', () => {
    const V = openCircuitVoltage({ batteryVoltage: 125 });
    assert.strictEqual(V, 125);
  });

  it('throws for unknown chemistry', () => {
    assert.throws(() => openCircuitVoltage({ batteryCells: 10, chemistry: 'magic-cells' }));
  });

  it('throws for fractional cell count', () => {
    assert.throws(() => openCircuitVoltage({ batteryCells: 5.5, chemistry: 'lead-acid' }));
  });

  it('supports lithium-ion chemistry', () => {
    const V = openCircuitVoltage({ batteryCells: 10, chemistry: 'lithium-ion' });
    approx(V, 36, 0.001); // 10 × 3.6 V
  });
});

// ---------------------------------------------------------------------------
// ppeCategoryForEnergy
// ---------------------------------------------------------------------------
describe('ppeCategoryForEnergy', () => {
  it('returns category 0 below 1.2 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(0.5).category, 0);
    assert.strictEqual(ppeCategoryForEnergy(1.2).category, 0);
  });

  it('returns category 1 between 1.2 and 4 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(2.0).category, 1);
    assert.strictEqual(ppeCategoryForEnergy(4.0).category, 1);
  });

  it('returns category 2 between 4 and 8 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(6.0).category, 2);
  });

  it('returns category 3 between 8 and 25 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(15.0).category, 3);
  });

  it('returns category 4 between 25 and 40 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(30.0).category, 4);
  });

  it('returns category 5 above 40 cal/cm²', () => {
    assert.strictEqual(ppeCategoryForEnergy(45.0).category, 5);
  });

  it('handles zero energy gracefully', () => {
    assert.strictEqual(ppeCategoryForEnergy(0).category, 0);
  });
});

// ---------------------------------------------------------------------------
// calcDcFaultCurrent
// ---------------------------------------------------------------------------
describe('calcDcFaultCurrent', () => {
  it('computes bolted fault current for 48 V system', () => {
    const r = calcDcFaultCurrent({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.010,
      cableResistanceOhm: 0.005,
      busbarResistanceOhm: 0.001,
    });
    approx(r.boltedFaultCurrentA, 3000, 0.01);
    assert.strictEqual(r.openCircuitVoltageV, 48);
    approx(r.totalResistanceOhm, 0.016, 0.001);
  });

  it('computes bolted fault current for 125 V station battery', () => {
    const r = calcDcFaultCurrent({
      batteryVoltageV: 125,
      batteryInternalResistanceOhm: 0.020,
      cableResistanceOhm: 0.005,
    });
    approx(r.boltedFaultCurrentA, 5000, 0.02);
  });

  it('computes time constant when inductance is provided', () => {
    const r = calcDcFaultCurrent({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.010,
      inductanceMH: 1.0,
    });
    // τ = L/R = 1e-3 / 0.010 = 100 ms
    approx(r.timeConstantMs, 100, 0.01);
  });

  it('returns zero time constant when no inductance', () => {
    const r = calcDcFaultCurrent({
      batteryVoltageV: 24,
      batteryInternalResistanceOhm: 0.005,
    });
    assert.strictEqual(r.timeConstantMs, 0);
  });

  it('throws for non-positive voltage', () => {
    assert.throws(() => calcDcFaultCurrent({
      batteryVoltageV: 0,
      batteryInternalResistanceOhm: 0.01,
    }));
  });

  it('throws for negative inductance', () => {
    assert.throws(() => calcDcFaultCurrent({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.01,
      inductanceMH: -1,
    }));
  });
});

// ---------------------------------------------------------------------------
// calcDcArcingCurrent
// ---------------------------------------------------------------------------
describe('calcDcArcingCurrent', () => {
  it('returns arcing current less than bolted fault current', () => {
    const I_bf = 5000;
    const R_total = 0.025;
    const V_oc = 125;
    const { arcCurrentA } = calcDcArcingCurrent(V_oc, R_total, I_bf, 25);
    assert.ok(arcCurrentA > 0, 'Arc current should be positive');
    assert.ok(arcCurrentA <= I_bf, 'Arc current should not exceed bolted fault current');
  });

  it('higher voltage produces higher arcing current', () => {
    const gap = 25;
    const R = 0.025;
    const { arcCurrentA: lowV } = calcDcArcingCurrent(125, R, 125 / R, gap);
    const { arcCurrentA: highV } = calcDcArcingCurrent(600, R, 600 / R, gap);
    assert.ok(highV > lowV, 'Higher system voltage → higher arc current');
  });

  it('larger gap reduces arcing current', () => {
    const V = 600;
    const R = 0.05;
    const I_bf = V / R;
    const { arcCurrentA: small } = calcDcArcingCurrent(V, R, I_bf, 13);
    const { arcCurrentA: large } = calcDcArcingCurrent(V, R, I_bf, 50);
    assert.ok(small >= large, 'Larger gap should not increase arc current');
  });

  it('arc voltage satisfies Stokes–Oppenlander formula', () => {
    const V_oc = 250;
    const R_total = 0.05;
    const I_bf = 5000;
    const gap = 25;
    const { arcCurrentA, arcVoltageV } = calcDcArcingCurrent(V_oc, R_total, I_bf, gap);
    if (arcCurrentA > 0) {
      const V_arc_expected = 20 + 0.534 * gap * Math.pow(arcCurrentA, 0.12);
      approx(arcVoltageV, V_arc_expected, 0.01);
    }
  });
});

// ---------------------------------------------------------------------------
// calcDcArcFlash
// ---------------------------------------------------------------------------
describe('calcDcArcFlash', () => {
  const baseParams = {
    batteryVoltageV: 125,
    batteryInternalResistanceOhm: 0.020,
    cableResistanceOhm: 0.005,
    gapMm: 25,
    workingDistanceMm: 455,
    arcDurationMs: 50,
    enclosureType: 'open_air',
  };

  it('returns valid incident energy for 125 V system', () => {
    const r = calcDcArcFlash(baseParams);
    assert.ok(Number.isFinite(r.incidentEnergyCalCm2), 'incidentEnergyCalCm2 must be finite');
    assert.ok(r.incidentEnergyCalCm2 >= 0, 'incident energy must be non-negative');
    assert.ok(r.arcFlashBoundaryMm >= 0, 'arc flash boundary must be non-negative');
    assert.ok(typeof r.ppeCategory === 'number', 'ppeCategory must be a number');
  });

  it('longer arc duration increases incident energy', () => {
    const short = calcDcArcFlash({ ...baseParams, arcDurationMs: 50 });
    const long = calcDcArcFlash({ ...baseParams, arcDurationMs: 200 });
    assert.ok(long.incidentEnergyCalCm2 > short.incidentEnergyCalCm2);
  });

  it('shorter working distance increases incident energy', () => {
    const far = calcDcArcFlash({ ...baseParams, workingDistanceMm: 900 });
    const near = calcDcArcFlash({ ...baseParams, workingDistanceMm: 300 });
    assert.ok(near.incidentEnergyCalCm2 > far.incidentEnergyCalCm2);
  });

  it('enclosed box increases incident energy vs open air', () => {
    const open = calcDcArcFlash({ ...baseParams, enclosureType: 'open_air' });
    const enclosed = calcDcArcFlash({ ...baseParams, enclosureType: 'enclosed_box' });
    assert.ok(enclosed.incidentEnergyCalCm2 > open.incidentEnergyCalCm2);
    assert.strictEqual(enclosed.enclosureCorrectionFactor, 2.0);
    assert.strictEqual(open.enclosureCorrectionFactor, 1.0);
  });

  it('higher voltage produces higher incident energy', () => {
    const low = calcDcArcFlash({ ...baseParams, batteryVoltageV: 48, batteryInternalResistanceOhm: 0.02 });
    const high = calcDcArcFlash({ ...baseParams, batteryVoltageV: 600, batteryInternalResistanceOhm: 0.02 });
    assert.ok(high.incidentEnergyCalCm2 >= low.incidentEnergyCalCm2);
  });

  it('throws for missing arcDurationMs', () => {
    assert.throws(() => calcDcArcFlash({
      batteryVoltageV: 125,
      batteryInternalResistanceOhm: 0.02,
      arcDurationMs: 0,
    }));
  });

  it('returns PPE category consistent with energy level', () => {
    const r = calcDcArcFlash({
      ...baseParams,
      batteryVoltageV: 600,
      batteryInternalResistanceOhm: 0.005,
      arcDurationMs: 500,
      enclosureType: 'enclosed_box',
    });
    const expectedPpe = ppeCategoryForEnergy(r.incidentEnergyCalCm2).category;
    assert.strictEqual(r.ppeCategory, expectedPpe);
  });

  it('adds warning note when incident energy exceeds 40 cal/cm²', () => {
    const r = calcDcArcFlash({
      batteryVoltageV: 600,
      batteryInternalResistanceOhm: 0.003,
      arcDurationMs: 2000,
      enclosureType: 'enclosed_box',
      gapMm: 13,
    });
    if (r.incidentEnergyCalCm2 > 40) {
      assert.ok(r.notes.some(n => n.includes('40 cal/cm²')));
    }
  });
});

// ---------------------------------------------------------------------------
// selectDcProtection
// ---------------------------------------------------------------------------
describe('selectDcProtection', () => {
  it('passes device with interrupt rating above fault current', () => {
    const results = selectDcProtection({
      availableFaultCurrentA: 3000,
      devices: [{ tag: 'F1', type: 'fuse', ratedCurrentA: 100, interruptRatingA: 10000, clearingTimeMs: 10 }],
    });
    assert.strictEqual(results[0].pass, true);
    assert.ok(results[0].marginA > 0);
  });

  it('fails device with interrupt rating below fault current', () => {
    const results = selectDcProtection({
      availableFaultCurrentA: 8000,
      devices: [{ tag: 'CB1', type: 'breaker', ratedCurrentA: 200, interruptRatingA: 5000 }],
    });
    assert.strictEqual(results[0].pass, false);
    assert.ok(results[0].note.includes('insufficient'));
  });

  it('handles multiple devices', () => {
    const results = selectDcProtection({
      availableFaultCurrentA: 4000,
      devices: [
        { tag: 'F1', type: 'fuse', ratedCurrentA: 60, interruptRatingA: 10000 },
        { tag: 'CB1', type: 'breaker', ratedCurrentA: 100, interruptRatingA: 3000 },
      ],
    });
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].pass, true);
    assert.strictEqual(results[1].pass, false);
  });

  it('returns null pass for device without interrupt rating', () => {
    const results = selectDcProtection({
      availableFaultCurrentA: 2000,
      devices: [{ tag: 'F2', type: 'fuse', ratedCurrentA: 60 }],
    });
    assert.strictEqual(results[0].pass, null);
  });

  it('warns when clearing time exceeds 100 ms', () => {
    const results = selectDcProtection({
      availableFaultCurrentA: 1000,
      devices: [{ tag: 'CB2', type: 'breaker', interruptRatingA: 5000, clearingTimeMs: 200 }],
    });
    assert.ok(results[0].note.includes('long'));
  });

  it('throws for non-positive fault current', () => {
    assert.throws(() => selectDcProtection({ availableFaultCurrentA: -1, devices: [] }));
  });

  it('throws when devices is not an array', () => {
    assert.throws(() => selectDcProtection({ availableFaultCurrentA: 1000, devices: null }));
  });
});

// ---------------------------------------------------------------------------
// runDcShortCircuitStudy (integration)
// ---------------------------------------------------------------------------
describe('runDcShortCircuitStudy', () => {
  it('returns fault current results for minimal inputs', () => {
    const r = runDcShortCircuitStudy({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.016,
    });
    assert.ok(r.faultCurrent);
    approx(r.faultCurrent.boltedFaultCurrentA, 3000, 0.02);
    assert.strictEqual(r.arcFlash, undefined);
    assert.strictEqual(r.protectionCheck, undefined);
  });

  it('includes arc flash results when runArcFlash is true', () => {
    const r = runDcShortCircuitStudy({
      batteryVoltageV: 125,
      batteryInternalResistanceOhm: 0.025,
      runArcFlash: true,
      arcDurationMs: 50,
    });
    assert.ok(r.arcFlash);
    assert.ok(Number.isFinite(r.arcFlash.incidentEnergyCalCm2));
  });

  it('includes protection results when devices are provided', () => {
    const r = runDcShortCircuitStudy({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.016,
      devices: [{ tag: 'F1', ratedCurrentA: 100, interruptRatingA: 10000 }],
    });
    assert.ok(Array.isArray(r.protectionCheck));
    assert.strictEqual(r.protectionCheck.length, 1);
  });

  it('throws when runArcFlash is true but arcDurationMs is missing', () => {
    assert.throws(() => runDcShortCircuitStudy({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.016,
      runArcFlash: true,
    }));
  });

  it('includes study metadata', () => {
    const r = runDcShortCircuitStudy({
      batteryVoltageV: 48,
      batteryInternalResistanceOhm: 0.01,
      studyLabel: 'Battery Room A',
    });
    assert.strictEqual(r.studyLabel, 'Battery Room A');
    assert.ok(r.studyDate);
  });

  it('exports module constants with correct values', () => {
    assert.strictEqual(CELL_VOLTAGE['lead-acid'], 2.0);
    assert.strictEqual(CELL_VOLTAGE['lithium-ion'], 3.6);
    assert.strictEqual(CELL_VOLTAGE['nickel-cadmium'], 1.2);
    assert.ok(Array.isArray(PPE_CATEGORIES));
    assert.strictEqual(PPE_CATEGORIES.length, 6);
    assert.ok(Array.isArray(STANDARD_DC_VOLTAGES));
    assert.ok(STANDARD_DC_VOLTAGES.includes(48));
  });
});

console.log('\nAll DC short-circuit tests complete.');
