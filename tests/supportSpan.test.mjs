/**
 * Tests for analysis/supportSpan.mjs
 *
 * Verifies the NEMA VE 1 span calculation against hand-calculated reference
 * values and boundary conditions.
 */
import assert from 'assert';
import {
  NEMA_LOAD_CLASSES,
  CABLE_WEIGHT_LB_FT,
  calcMaxSpan,
  sumCableWeights,
  evaluateTrays,
} from '../analysis/supportSpan.mjs';

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
// NEMA_LOAD_CLASSES data integrity
// ---------------------------------------------------------------------------
describe('NEMA_LOAD_CLASSES', () => {
  it('defines the traditional span/load class combinations', () => {
    const expected = ['8A', '8B', '8C', '12A', '12B', '12C', '16A', '16B', '16C', '20A', '20B', '20C'];
    expected.forEach(cls => {
      assert.ok(NEMA_LOAD_CLASSES[cls], `Class ${cls} should exist`);
    });
  });

  it('has positive ratedLoad and ratedSpan for every class', () => {
    Object.entries(NEMA_LOAD_CLASSES).forEach(([cls, def]) => {
      assert.ok(def.ratedLoad > 0, `${cls}: ratedLoad must be > 0`);
      assert.ok(def.ratedSpan > 0, `${cls}: ratedSpan must be > 0`);
    });
  });

  it('maps numeric prefixes to spans and letters to 50/75/100 lb/ft', () => {
    Object.entries(NEMA_LOAD_CLASSES).forEach(([cls, def]) => {
      assert.strictEqual(def.ratedSpan, parseInt(cls, 10), `${cls}: numeric prefix should be the span`);
      assert.strictEqual(def.ratedLoad, { A: 50, B: 75, C: 100 }[cls.at(-1)]);
    });
  });
});

// ---------------------------------------------------------------------------
// calcMaxSpan — at-rated-load returns the rated span
// ---------------------------------------------------------------------------
describe('calcMaxSpan — rated-load identity', () => {
  Object.entries(NEMA_LOAD_CLASSES).forEach(([cls, def]) => {
    it(`class ${cls}: span at rated load equals ratedSpan`, () => {
      const result = calcMaxSpan(def.ratedLoad, cls);
      assert.strictEqual(result.maxSpan, def.ratedSpan,
        `Expected maxSpan=${def.ratedSpan}, got ${result.maxSpan}`);
    });
  });
});

// ---------------------------------------------------------------------------
// calcMaxSpan — reference values (hand-calculated)
// Per NEMA VE 1: max_span = L_rated × (w_rated / w_actual)^(1/3)
// Class 16A: ratedLoad=50, ratedSpan=16
//   @ 25 lbs/ft  → 16 × (50/25)^(1/3)
//   @ 100 lbs/ft → 16 × (50/100)^(1/3)
// ---------------------------------------------------------------------------
describe('calcMaxSpan — hand-calculated reference values (Class 16A)', () => {
  it('half load → span increases by cbrt(2)', () => {
    const result = calcMaxSpan(25, '16A');
    const expected = 16 * Math.cbrt(50 / 25);
    assert.ok(
      Math.abs(result.maxSpan - Math.round(expected * 100) / 100) < 0.01,
      `Expected ≈${expected.toFixed(2)}, got ${result.maxSpan}`,
    );
  });

  it('double load → span decreases by cbrt(2)', () => {
    const result = calcMaxSpan(100, '16A');
    const expected = 16 * Math.cbrt(50 / 100);
    assert.ok(
      Math.abs(result.maxSpan - Math.round(expected * 100) / 100) < 0.01,
      `Expected ≈${expected.toFixed(2)}, got ${result.maxSpan}`,
    );
  });

  it('load > rated → status is OVERLOADED', () => {
    const result = calcMaxSpan(60, '16A');
    assert.strictEqual(result.status, 'OVERLOADED');
  });

  it('load ≤ rated → status is OK', () => {
    const result = calcMaxSpan(50, '16A');
    assert.strictEqual(result.status, 'OK');
  });

  it('load < rated → status is OK', () => {
    const result = calcMaxSpan(40, '16A');
    assert.strictEqual(result.status, 'OK');
  });
});

// ---------------------------------------------------------------------------
// calcMaxSpan — utilization ratio
// ---------------------------------------------------------------------------
describe('calcMaxSpan — utilizationRatio', () => {
  it('equals 1.0 exactly at rated load', () => {
    const { utilizationRatio } = calcMaxSpan(50, '16A');
    assert.strictEqual(utilizationRatio, 1.0);
  });

  it('equals 0.5 at half rated load', () => {
    const { utilizationRatio } = calcMaxSpan(25, '16A');
    assert.strictEqual(utilizationRatio, 0.5);
  });

  it('equals 2.0 at double rated load', () => {
    const { utilizationRatio } = calcMaxSpan(100, '16A');
    assert.strictEqual(utilizationRatio, 2.0);
  });
});

// ---------------------------------------------------------------------------
// calcMaxSpan — error handling
// ---------------------------------------------------------------------------
describe('calcMaxSpan — error handling', () => {
  it('throws for unknown load class', () => {
    assert.throws(() => calcMaxSpan(10, 'UNKNOWN'), /Unknown NEMA load class/);
  });

  it('throws for zero load', () => {
    assert.throws(() => calcMaxSpan(0, '16A'), /positive/);
  });

  it('throws for negative load', () => {
    assert.throws(() => calcMaxSpan(-5, '16A'), /positive/);
  });

  it('throws for NaN load', () => {
    assert.throws(() => calcMaxSpan(NaN, '16A'), /positive/);
  });
});

// ---------------------------------------------------------------------------
// calcMaxSpan — return shape
// ---------------------------------------------------------------------------
describe('calcMaxSpan — return shape', () => {
  it('returns all expected fields', () => {
    const result = calcMaxSpan(10, '16A');
    assert.ok('maxSpan' in result, 'missing maxSpan');
    assert.ok('ratedSpan' in result, 'missing ratedSpan');
    assert.ok('ratedLoad' in result, 'missing ratedLoad');
    assert.ok('utilizationRatio' in result, 'missing utilizationRatio');
    assert.ok('status' in result, 'missing status');
    assert.ok('recommendation' in result, 'missing recommendation');
  });

  it('maxSpan is a non-negative finite number', () => {
    const result = calcMaxSpan(10, '16A');
    assert.ok(Number.isFinite(result.maxSpan) && result.maxSpan > 0);
  });
});

// ---------------------------------------------------------------------------
// CABLE_WEIGHT_LB_FT — basic sanity
// ---------------------------------------------------------------------------
describe('CABLE_WEIGHT_LB_FT', () => {
  it('has entries for common cable types', () => {
    const required = ['3C-#4 AWG', '3C-4/0 AWG', '1C-500 kcmil'];
    required.forEach(k => {
      assert.ok(CABLE_WEIGHT_LB_FT[k] > 0, `Missing or zero weight for ${k}`);
    });
  });

  it('larger conductors are heavier (3C power cables)', () => {
    assert.ok(CABLE_WEIGHT_LB_FT['3C-4/0 AWG'] > CABLE_WEIGHT_LB_FT['3C-#4 AWG'],
      '3C-4/0 should outweigh 3C-#4');
    assert.ok(CABLE_WEIGHT_LB_FT['3C-500 kcmil'] > CABLE_WEIGHT_LB_FT['3C-4/0 AWG'],
      '3C-500kcmil should outweigh 3C-4/0');
  });
});

// ---------------------------------------------------------------------------
// sumCableWeights
// ---------------------------------------------------------------------------
describe('sumCableWeights', () => {
  it('returns 0 for an empty array', () => {
    assert.strictEqual(sumCableWeights([]), 0);
  });

  it('uses explicit weight_lb_ft when provided', () => {
    const cables = [{ weight_lb_ft: 1.5, quantity: 2 }];
    assert.strictEqual(sumCableWeights(cables), 3.0);
  });

  it('looks up weight by conductors+size', () => {
    const w = CABLE_WEIGHT_LB_FT['3C-#4 AWG'];
    assert.ok(w > 0, 'precondition: 3C-#4 AWG must be in table');
    const cables = [{ conductors: 3, size: '#4 AWG', quantity: 1 }];
    assert.strictEqual(sumCableWeights(cables), w);
  });

  it('multiplies by quantity', () => {
    const w = CABLE_WEIGHT_LB_FT['3C-#4 AWG'];
    const cables = [{ conductors: 3, size: '#4 AWG', quantity: 4 }];
    assert.strictEqual(sumCableWeights(cables), w * 4);
  });

  it('sums multiple cable types', () => {
    const w1 = CABLE_WEIGHT_LB_FT['3C-#4 AWG'];
    const w2 = CABLE_WEIGHT_LB_FT['1C-500 kcmil'];
    const cables = [
      { conductors: 3, size: '#4 AWG', quantity: 2 },
      { conductors: 1, size: '500 kcmil', quantity: 3 },
    ];
    const expected = w1 * 2 + w2 * 3;
    assert.ok(Math.abs(sumCableWeights(cables) - expected) < 1e-9,
      `Expected ${expected}, got ${sumCableWeights(cables)}`);
  });

  it('returns 0 weight for unknown cable (graceful degradation)', () => {
    const cables = [{ conductors: 99, size: 'UNKNOWN', quantity: 1 }];
    assert.strictEqual(sumCableWeights(cables), 0);
  });

  it('defaults quantity to 1 when omitted', () => {
    const w = CABLE_WEIGHT_LB_FT['3C-#4 AWG'];
    const cables = [{ conductors: 3, size: '#4 AWG' }];
    assert.strictEqual(sumCableWeights(cables), w);
  });

  it('defaults missing conductors to 3 when conductor_size is present', () => {
    const w = CABLE_WEIGHT_LB_FT['3C-500 kcmil'];
    const cables = [{ conductor_size: '500 kcmil', quantity: 2 }];
    assert.strictEqual(sumCableWeights(cables), w * 2);
  });

  it('throws for negative explicit weight_lb_ft', () => {
    const cables = [{ weight_lb_ft: -2, quantity: 1 }];
    assert.throws(() => sumCableWeights(cables), /positive finite/);
  });

  it('throws for non-finite explicit weight_lb_ft', () => {
    const cables = [{ weight_lb_ft: 'NaN', quantity: 1 }];
    assert.throws(() => sumCableWeights(cables), /positive finite/);
  });

  it('throws for negative quantity', () => {
    const cables = [{ conductors: 3, size: '#4 AWG', quantity: -1 }];
    assert.throws(() => sumCableWeights(cables), /quantity/);
  });
});

// ---------------------------------------------------------------------------
// evaluateTrays
// ---------------------------------------------------------------------------
describe('evaluateTrays', () => {

  it('flags trays with invalid cable data', () => {
    const trays = [{ tray_id: 'T1', cables: [{ weight_lb_ft: -5, quantity: 1 }] }];
    const [r] = evaluateTrays(trays, '16A');
    assert.strictEqual(r.result.status, 'INVALID');
  });

  it('returns one result per tray', () => {
    const trays = [
      { tray_id: 'T1', inside_width: 12, cables: [] },
      { tray_id: 'T2', inside_width: 24, cables: [] },
    ];
    const results = evaluateTrays(trays, '16A');
    assert.strictEqual(results.length, 2);
  });

  it('returns OK status with rated span for a tray with no cables', () => {
    const trays = [{ tray_id: 'T1', inside_width: 12, cables: [] }];
    const [r] = evaluateTrays(trays, '16A');
    assert.strictEqual(r.result.status, 'OK');
    assert.strictEqual(r.result.maxSpan, 16); // rated span
    assert.strictEqual(r.loadPerFt, 0);
  });

  it('calculates span for a tray with cables', () => {
    const w = CABLE_WEIGHT_LB_FT['3C-#4 AWG'];
    const trays = [{
      tray_id: 'T1',
      inside_width: 12,
      cables: [{ conductors: 3, size: '#4 AWG', quantity: 10 }],
    }];
    const [r] = evaluateTrays(trays, '16A');
    const expectedLoad = w * 10;
    assert.ok(Math.abs(r.loadPerFt - expectedLoad) < 1e-9);
    const expected = calcMaxSpan(expectedLoad, '16A');
    assert.strictEqual(r.result.maxSpan, expected.maxSpan);
  });

  it('flags OVERLOADED when cables exceed load class', () => {
    // 100 × 3C-4/0 cables should easily exceed Class 8A (50 lbs/ft)
    const trays = [{
      tray_id: 'T1',
      inside_width: 24,
      cables: [{ conductors: 3, size: '4/0 AWG', quantity: 100 }],
    }];
    const [r] = evaluateTrays(trays, '8A');
    assert.strictEqual(r.result.status, 'OVERLOADED');
  });
});
