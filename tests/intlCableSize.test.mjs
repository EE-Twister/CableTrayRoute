/**
 * Tests for analysis/intlCableSize.mjs
 *
 * Verifies ampacity lookups, temperature correction, grouping derating,
 * cable sizing, and adequacy checks against hand-calculated reference values
 * from IEC 60364-5-52:2009 and BS 7671:2018 Appendix 4.
 */
import assert from 'assert';
import {
  STANDARDS,
  INSTALLATION_METHODS,
  CABLE_SIZES_MM2,
  lookupAmpacity,
  getTempCorrectionFactor,
  getGroupingFactor,
  sizeCable,
  checkCableAdequacy,
  TEMP_CORRECTION_IEC,
  TEMP_CORRECTION_ASNZS,
  GROUPING_ENCLOSED,
  GROUPING_OPEN,
} from '../analysis/intlCableSize.mjs';

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
// STANDARDS and INSTALLATION_METHODS metadata
// ---------------------------------------------------------------------------
describe('STANDARDS — metadata sanity', () => {
  it('defines IEC_60364, BS_7671, AS_NZS_3008', () => {
    assert.ok(STANDARDS.IEC_60364);
    assert.ok(STANDARDS.BS_7671);
    assert.ok(STANDARDS.AS_NZS_3008);
  });

  it('IEC_60364 reference ambient is 30 °C', () => {
    assert.strictEqual(STANDARDS.IEC_60364.refAmbient, 30);
  });

  it('AS_NZS_3008 reference ambient is 40 °C', () => {
    assert.strictEqual(STANDARDS.AS_NZS_3008.refAmbient, 40);
  });

  it('BS_7671 reference ambient is 30 °C', () => {
    assert.strictEqual(STANDARDS.BS_7671.refAmbient, 30);
  });
});

describe('INSTALLATION_METHODS — metadata sanity', () => {
  it('defines methods B2, C, E, F', () => {
    ['B2', 'C', 'E', 'F'].forEach(m => assert.ok(INSTALLATION_METHODS[m], `Missing method ${m}`));
  });
});

describe('CABLE_SIZES_MM2 — sanity', () => {
  it('starts at 1.5 mm² and ends at 300 mm²', () => {
    assert.strictEqual(CABLE_SIZES_MM2[0], 1.5);
    assert.strictEqual(CABLE_SIZES_MM2.at(-1), 300);
  });

  it('includes 16 standard sizes', () => {
    assert.strictEqual(CABLE_SIZES_MM2.length, 16);
  });

  it('is sorted ascending', () => {
    for (let i = 1; i < CABLE_SIZES_MM2.length; i++) {
      assert.ok(CABLE_SIZES_MM2[i] > CABLE_SIZES_MM2[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// lookupAmpacity — IEC 60364 reference values
// All values taken from IEC 60364-5-52:2009 Annex B / BS 7671:2018 App 4.
// ---------------------------------------------------------------------------
describe('lookupAmpacity — IEC_60364 spot checks', () => {
  // BS 7671 Table 4E2A, method C, 3-phase, Cu, XLPE: 95 mm² → 238 A
  it('method C, 3-phase, Cu, XLPE, 95 mm² = 238 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 95), 238);
  });

  // BS 7671 Table 4E2A, method C, 3-phase, Cu, XLPE: 35 mm² → 126 A
  it('method C, 3-phase, Cu, XLPE, 35 mm² = 126 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 35), 126);
  });

  // BS 7671 Table 4D2A, method C, 3-phase, Cu, PVC: 25 mm² → 84 A
  it('method C, 3-phase, Cu, PVC, 25 mm² = 84 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'PVC', 25), 84);
  });

  // BS 7671 Table 4E2A, method E, 3-phase, Cu, XLPE: 70 mm² → 232 A
  it('method E, 3-phase, Cu, XLPE, 70 mm² = 232 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'E', 3, 'Cu', 'XLPE', 70), 232);
  });

  // BS 7671 Table 4E2A, method B2, 3-phase, Cu, XLPE: 50 mm² → 147 A
  it('method B2, 3-phase, Cu, XLPE, 50 mm² = 147 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'B2', 3, 'Cu', 'XLPE', 50), 147);
  });

  // BS 7671 Table 4D2A, method B2, 3-phase, Cu, PVC: 10 mm² → 42 A
  it('method B2, 3-phase, Cu, PVC, 10 mm² = 42 A', () => {
    assert.strictEqual(lookupAmpacity('IEC_60364', 'B2', 3, 'Cu', 'PVC', 10), 42);
  });

  // Single-phase (2-conductor) is higher than three-phase for same size
  it('2-phase ampacity exceeds 3-phase ampacity for same cable', () => {
    const a2 = lookupAmpacity('IEC_60364', 'C', 2, 'Cu', 'XLPE', 50);
    const a3 = lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 50);
    assert.ok(a2 > a3, `Expected 2-phase (${a2}) > 3-phase (${a3})`);
  });

  // Al ampacity is less than Cu for the same conditions
  it('Al ampacity is less than Cu for same size/method', () => {
    const cu = lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 95);
    const al = lookupAmpacity('IEC_60364', 'C', 3, 'Al', 'XLPE', 95);
    assert.ok(al < cu, `Expected Al (${al}) < Cu (${cu})`);
  });

  // XLPE ampacity is greater than PVC for same conditions
  it('XLPE ampacity exceeds PVC for same size/method', () => {
    const xlpe = lookupAmpacity('IEC_60364', 'E', 3, 'Cu', 'XLPE', 70);
    const pvc  = lookupAmpacity('IEC_60364', 'E', 3, 'Cu', 'PVC',  70);
    assert.ok(xlpe > pvc, `Expected XLPE (${xlpe}) > PVC (${pvc})`);
  });
});

describe('lookupAmpacity — BS_7671 (same tables as IEC)', () => {
  it('BS_7671 method C, 3-phase, Cu, XLPE, 95 mm² equals IEC value', () => {
    const iec = lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 95);
    const bs  = lookupAmpacity('BS_7671',   'C', 3, 'Cu', 'XLPE', 95);
    assert.strictEqual(iec, bs);
  });
});

describe('lookupAmpacity — AS_NZS_3008 (different tables)', () => {
  it('AS/NZS method C, 3-phase, Cu, XLPE, 95 mm² is less than IEC (40 °C vs 30 °C reference)', () => {
    const iec   = lookupAmpacity('IEC_60364',   'C', 3, 'Cu', 'XLPE', 95);
    const asnzs = lookupAmpacity('AS_NZS_3008', 'C', 3, 'Cu', 'XLPE', 95);
    assert.ok(asnzs < iec,
      `AS/NZS (${asnzs} A) should be less than IEC (${iec} A) at 40 °C reference`);
  });

  it('AS/NZS values are positive for all tabulated sizes, method C, Cu, XLPE, 3-phase', () => {
    CABLE_SIZES_MM2.forEach(sz => {
      const amps = lookupAmpacity('AS_NZS_3008', 'C', 3, 'Cu', 'XLPE', sz);
      assert.ok(amps > 0, `Expected positive ampacity for ${sz} mm², got ${amps}`);
    });
  });
});

describe('lookupAmpacity — error handling', () => {
  it('throws for unknown standard', () => {
    assert.throws(() => lookupAmpacity('NFPA_70', 'C', 3, 'Cu', 'XLPE', 25), /standard/i);
  });

  it('throws for unknown method', () => {
    assert.throws(() => lookupAmpacity('IEC_60364', 'X', 3, 'Cu', 'XLPE', 25), /method/i);
  });

  it('throws for phases not 2 or 3', () => {
    assert.throws(() => lookupAmpacity('IEC_60364', 'C', 1, 'Cu', 'XLPE', 25), /phases/i);
  });

  it('throws for unknown material', () => {
    assert.throws(() => lookupAmpacity('IEC_60364', 'C', 3, 'Fe', 'XLPE', 25), /material/i);
  });

  it('throws for unknown insulation', () => {
    assert.throws(() => lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'EPR', 25), /insulation/i);
  });

  it('throws for non-standard size', () => {
    assert.throws(() => lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', 55), /standard size/i);
  });

  it('throws for Al below 16 mm²', () => {
    assert.throws(
      () => lookupAmpacity('IEC_60364', 'C', 3, 'Al', 'XLPE', 10),
      /aluminium.*16|16.*aluminium/i
    );
  });
});

// ---------------------------------------------------------------------------
// getTempCorrectionFactor — IEC reference values from Table B.52.14
// ---------------------------------------------------------------------------
describe('getTempCorrectionFactor — IEC/BS exact table values', () => {
  it('PVC at 30 °C (reference) = 1.00', () => {
    assert.strictEqual(getTempCorrectionFactor('IEC_60364', 'PVC', 30), 1.00);
  });

  it('PVC at 40 °C = 0.87', () => {
    assert.strictEqual(getTempCorrectionFactor('IEC_60364', 'PVC', 40), 0.87);
  });

  it('XLPE at 30 °C (reference) = 1.00', () => {
    assert.strictEqual(getTempCorrectionFactor('IEC_60364', 'XLPE', 30), 1.00);
  });

  it('XLPE at 40 °C = 0.91', () => {
    assert.strictEqual(getTempCorrectionFactor('IEC_60364', 'XLPE', 40), 0.91);
  });

  it('XLPE at 20 °C = 1.08 (above reference, factor > 1)', () => {
    assert.strictEqual(getTempCorrectionFactor('IEC_60364', 'XLPE', 20), 1.08);
  });

  it('BS_7671 returns same factors as IEC_60364', () => {
    const iec = getTempCorrectionFactor('IEC_60364', 'XLPE', 45);
    const bs  = getTempCorrectionFactor('BS_7671',   'XLPE', 45);
    assert.strictEqual(iec, bs);
  });
});

describe('getTempCorrectionFactor — interpolation', () => {
  // Between 30 °C (1.00) and 35 °C (0.96) for XLPE, at 32.5 °C → 0.98
  it('XLPE at 32.5 °C interpolates between 30 and 35 °C values', () => {
    const factor = getTempCorrectionFactor('IEC_60364', 'XLPE', 32.5);
    const expected = (1.00 + 0.96) / 2; // linear midpoint = 0.98
    assert.ok(Math.abs(factor - expected) < 0.001,
      `Expected ~${expected}, got ${factor}`);
  });
});

describe('getTempCorrectionFactor — AS/NZS (40 °C reference)', () => {
  it('XLPE at 40 °C (reference) = 1.00', () => {
    assert.strictEqual(getTempCorrectionFactor('AS_NZS_3008', 'XLPE', 40), 1.00);
  });

  it('XLPE at 50 °C < 1.00 (warmer than reference)', () => {
    const f = getTempCorrectionFactor('AS_NZS_3008', 'XLPE', 50);
    assert.ok(f < 1.0, `Expected factor < 1 above 40 °C reference, got ${f}`);
  });

  it('XLPE at 30 °C > 1.00 (cooler than reference)', () => {
    const f = getTempCorrectionFactor('AS_NZS_3008', 'XLPE', 30);
    assert.ok(f > 1.0, `Expected factor > 1 below 40 °C reference, got ${f}`);
  });
});

describe('getTempCorrectionFactor — error handling', () => {
  it('throws for non-finite temperature', () => {
    assert.throws(() => getTempCorrectionFactor('IEC_60364', 'XLPE', NaN), /finite/i);
  });

  it('throws for temperature above maximum tabulated value', () => {
    assert.throws(() => getTempCorrectionFactor('IEC_60364', 'PVC', 70), /range/i);
  });

  it('throws for temperature below minimum tabulated value', () => {
    assert.throws(() => getTempCorrectionFactor('IEC_60364', 'XLPE', 5), /range/i);
  });
});

// ---------------------------------------------------------------------------
// getGroupingFactor — from IEC 60364-5-52 Table B.52.17
// ---------------------------------------------------------------------------
describe('getGroupingFactor — enclosed (Method B2)', () => {
  it('1 circuit = 1.00', () => {
    assert.strictEqual(getGroupingFactor('B2', 1), 1.00);
  });

  it('2 circuits = 0.80', () => {
    assert.strictEqual(getGroupingFactor('B2', 2), 0.80);
  });

  it('3 circuits = 0.70', () => {
    assert.strictEqual(getGroupingFactor('B2', 3), 0.70);
  });

  it('6 circuits = 0.57', () => {
    assert.strictEqual(getGroupingFactor('B2', 6), 0.57);
  });
});

describe('getGroupingFactor — open (Methods C, E, F)', () => {
  it('1 circuit = 1.00', () => {
    assert.strictEqual(getGroupingFactor('C', 1), 1.00);
  });

  it('2 circuits = 0.88 on open tray', () => {
    assert.strictEqual(getGroupingFactor('E', 2), 0.88);
  });

  it('3 circuits = 0.82 on open tray', () => {
    assert.strictEqual(getGroupingFactor('C', 3), 0.82);
  });

  it('5 circuits = 0.75 on open tray', () => {
    assert.strictEqual(getGroupingFactor('F', 5), 0.75);
  });
});

describe('getGroupingFactor — between-table interpolation', () => {
  // Between 9 (0.72) and 12 (0.69) for open, at 10 → interpolated
  it('10 circuits on open tray interpolates between 9 and 12', () => {
    const f10 = getGroupingFactor('C', 10);
    // Linear between 9→0.72 and 12→0.69: at 10, f = 0.72 + (10-9)/(12-9) * (0.69-0.72) = 0.72 - 0.01 = 0.71
    assert.ok(f10 > GROUPING_OPEN[12] && f10 < GROUPING_OPEN[9],
      `Expected between 0.69 and 0.72, got ${f10}`);
  });
});

describe('getGroupingFactor — error handling', () => {
  it('throws for numGroups < 1', () => {
    assert.throws(() => getGroupingFactor('C', 0), /positive/i);
  });

  it('throws for non-finite numGroups', () => {
    assert.throws(() => getGroupingFactor('C', NaN), /positive/i);
  });
});

// ---------------------------------------------------------------------------
// sizeCable — hand-calculated reference cases
// ---------------------------------------------------------------------------
describe('sizeCable — IEC_60364 basic sizing (no derating)', () => {
  // Design current 100 A, method C, 3-phase, Cu, XLPE, 30 °C, 1 group
  // From table: 16 mm² → 80 A (< 100), 25 mm² → 101 A (≥ 100) → minimum adequate size
  it('sizes 100 A load to 25 mm² Cu XLPE method C, 3-phase at 30 °C', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 100,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.strictEqual(r.size, 25);
  });

  // 80 A → 35 mm² (126 A ≥ 80 A); 25 mm² only gives 101 A ≥ 80 A → should be 25 mm²
  it('sizes 80 A load to 25 mm² Cu XLPE method C, 3-phase at 30 °C', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 80,
    });
    assert.strictEqual(r.status, 'PASS');
    // 25 mm² → 101 A ≥ 80 A; 16 mm² → 80 A ≥ 80 A → 16 mm² is minimum
    assert.strictEqual(r.size, 16);
  });

  it('returns the correct base ampacity for the selected size', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 50,
    });
    assert.strictEqual(r.status, 'PASS');
    const expectedBase = lookupAmpacity('IEC_60364', 'C', 3, 'Cu', 'XLPE', r.size);
    assert.strictEqual(r.baseAmpacity, expectedBase);
  });

  it('corrected ampacity equals base ampacity when no derating applies', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 50,
      ambientTemp: 30, numGroups: 1,
    });
    assert.strictEqual(r.totalFactor, 1.0);
    assert.strictEqual(r.correctedAmpacity, r.baseAmpacity);
  });
});

describe('sizeCable — temperature derating', () => {
  // At 40 °C, XLPE factor = 0.91. Design current 200 A, method E, 3-phase, Cu, XLPE.
  // Table values: 70 mm² → 232 A; 95 mm² → 282 A.
  // Derated: 70 mm² → 232 × 0.91 = 211.12 A ≥ 200 A → 70 mm² should be selected
  it('applies 40 °C XLPE temperature factor of 0.91 and selects 70 mm²', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'E', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 200,
      ambientTemp: 40,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.strictEqual(r.tempFactor, 0.91);
    assert.strictEqual(r.size, 70);
    // Derated ampacity = 232 × 0.91 = 211.12
    assert.ok(Math.abs(r.correctedAmpacity - 211.12) < 0.01,
      `Expected ≈211.12 A, got ${r.correctedAmpacity}`);
  });

  it('selects a larger size at elevated temperature vs reference temperature', () => {
    const hot  = sizeCable({ standard: 'IEC_60364', method: 'C', phases: 3, material: 'Cu', insulation: 'XLPE', loadAmps: 140, ambientTemp: 50 });
    const cool = sizeCable({ standard: 'IEC_60364', method: 'C', phases: 3, material: 'Cu', insulation: 'XLPE', loadAmps: 140, ambientTemp: 30 });
    assert.ok(hot.size >= cool.size,
      `Hot sizing (${hot.size} mm²) should be ≥ cool sizing (${cool.size} mm²)`);
  });
});

describe('sizeCable — grouping derating', () => {
  // 3 cables in conduit (B2) → grouping factor = 0.70
  // Design current 50 A, method B2, Cu, XLPE, 3-phase, 30 °C
  // Derated: 57 mm² (10 mm²) → 57 × 0.70 = 39.9 A < 50; 76 A (16 mm²) × 0.70 = 53.2 A ≥ 50
  it('applies B2 grouping factor 0.70 for 3 circuits; selects 16 mm²', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'B2', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 50,
      numGroups: 3,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.strictEqual(r.groupFactor, 0.70);
    assert.strictEqual(r.size, 16);
  });
});

describe('sizeCable — aluminium conductors', () => {
  it('Al sizing starts at 16 mm² minimum', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Al', insulation: 'XLPE', loadAmps: 10,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.ok(r.size >= 16, `Al minimum size should be 16 mm², got ${r.size} mm²`);
  });

  it('Al sizing returns larger size than Cu for same load', () => {
    const cu = sizeCable({ standard: 'IEC_60364', method: 'C', phases: 3, material: 'Cu', insulation: 'XLPE', loadAmps: 100 });
    const al = sizeCable({ standard: 'IEC_60364', method: 'C', phases: 3, material: 'Al', insulation: 'XLPE', loadAmps: 100 });
    assert.ok(al.size >= cu.size,
      `Al size (${al.size} mm²) should be ≥ Cu size (${cu.size} mm²) for same load`);
  });
});

describe('sizeCable — AS/NZS_3008', () => {
  it('AS/NZS sizing selects a size ≥ IEC for same load (due to higher reference ambient)', () => {
    const iec   = sizeCable({ standard: 'IEC_60364',   method: 'C', phases: 3, material: 'Cu', insulation: 'XLPE', loadAmps: 120, ambientTemp: 40 });
    const asnzs = sizeCable({ standard: 'AS_NZS_3008', method: 'C', phases: 3, material: 'Cu', insulation: 'XLPE', loadAmps: 120 });
    assert.ok(asnzs.size >= iec.size,
      `AS/NZS size (${asnzs.size} mm²) should be ≥ IEC size (${iec.size} mm²) at comparable ambient`);
  });
});

describe('sizeCable — error handling', () => {
  it('throws for non-positive loadAmps', () => {
    assert.throws(() => sizeCable({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 0,
    }), /loadAmps/i);
  });

  it('returns NO_SIZE_AVAILABLE when load exceeds largest cable rating', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'B2', phases: 3,
      material: 'Cu', insulation: 'PVC', loadAmps: 9999,
    });
    assert.strictEqual(r.status, 'NO_SIZE_AVAILABLE');
    assert.strictEqual(r.size, null);
  });
});

// ---------------------------------------------------------------------------
// checkCableAdequacy — verification mode
// ---------------------------------------------------------------------------
describe('checkCableAdequacy — passing cases', () => {
  // 95 mm² Cu XLPE method C, 3-phase at 30 °C → 238 A ≥ 200 A → PASS
  it('95 mm² Cu XLPE method C, 3-phase at 30 °C passes for 200 A load', () => {
    const r = checkCableAdequacy({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE',
      loadAmps: 200, size: 95,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.strictEqual(r.baseAmpacity, 238);
    assert.strictEqual(r.correctedAmpacity, 238); // no derating at 30 °C, 1 group
  });
});

describe('checkCableAdequacy — failing cases', () => {
  // 25 mm² Cu XLPE method B2, 3-phase at 30 °C → 99 A < 120 A → UNDERSIZED
  it('25 mm² Cu XLPE method B2, 3-phase at 30 °C fails for 120 A load', () => {
    const r = checkCableAdequacy({
      standard: 'IEC_60364', method: 'B2', phases: 3,
      material: 'Cu', insulation: 'XLPE',
      loadAmps: 120, size: 25,
    });
    assert.strictEqual(r.status, 'UNDERSIZED');
    assert.ok(r.correctedAmpacity < 120,
      `Expected correctedAmpacity < 120, got ${r.correctedAmpacity}`);
  });
});

describe('checkCableAdequacy — with derating', () => {
  // 95 mm² Cu XLPE method C, 3-phase at 40 °C: 238 × 0.91 = 216.58 A
  // For 220 A load → UNDERSIZED; for 200 A load → PASS
  it('95 mm² Cu XLPE passes 200 A at 40 °C but fails 220 A', () => {
    const pass = checkCableAdequacy({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE',
      loadAmps: 200, size: 95, ambientTemp: 40,
    });
    const fail = checkCableAdequacy({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE',
      loadAmps: 220, size: 95, ambientTemp: 40,
    });
    assert.strictEqual(pass.status, 'PASS');
    assert.strictEqual(fail.status, 'UNDERSIZED');
    // Both should have tempFactor = 0.91
    assert.strictEqual(pass.tempFactor, 0.91);
    assert.strictEqual(fail.tempFactor, 0.91);
  });
});

describe('checkCableAdequacy — error handling', () => {
  it('throws for non-standard size', () => {
    assert.throws(() => checkCableAdequacy({
      standard: 'IEC_60364', method: 'C', phases: 3,
      material: 'Cu', insulation: 'XLPE', loadAmps: 100, size: 55,
    }), /standard size/i);
  });
});

// ---------------------------------------------------------------------------
// Combined derating: temperature + grouping
// ---------------------------------------------------------------------------
describe('Combined temperature and grouping derating — hand calculation', () => {
  // Method E, 3-phase, Cu, XLPE, 40 °C, 4 grouped circuits
  // tempFactor = 0.91; groupFactor (open, 4 groups) = 0.77; total = 0.91 × 0.77 = 0.7007
  // loadAmps = 100 A
  // 50 mm² base = 180 A; derated = 180 × 0.7007 = 126.13 A ≥ 100 A → should be selected
  it('selects correct size under combined temperature + grouping derating', () => {
    const r = sizeCable({
      standard: 'IEC_60364', method: 'E', phases: 3,
      material: 'Cu', insulation: 'XLPE',
      loadAmps: 100, ambientTemp: 40, numGroups: 4,
    });
    assert.strictEqual(r.status, 'PASS');
    assert.strictEqual(r.tempFactor, 0.91);
    assert.strictEqual(r.groupFactor, 0.77);
    // total factor
    const expectedTotal = Math.round(0.91 * 0.77 * 10000) / 10000;
    assert.strictEqual(r.totalFactor, expectedTotal);
    // Derated ampacity must be ≥ 100 A
    assert.ok(r.correctedAmpacity >= 100,
      `Derated ampacity ${r.correctedAmpacity} A must be ≥ 100 A`);
  });
});
