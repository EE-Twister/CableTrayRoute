/**
 * Tests for analysis/windLoad.mjs
 *
 * Verifies ASCE 7-22 velocity pressure coefficients, wind force calculations,
 * and NEMA capacity checks against hand-calculated reference values.
 */
import assert from 'assert';
import {
  calcKz,
  calcVelocityPressure,
  trayForceCf,
  calcWindForce,
  checkNemaCapacity,
  NEMA_LOAD_CLASSES,
} from '../analysis/windLoad.mjs';

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
describe('calcKz — velocity pressure exposure coefficient', () => {
  it('Exposure C at 33 ft returns ~1.0 (ASCE 7-22 Table 26.10-1)', () => {
    const kz = calcKz(33, 'C');
    // ASCE 7-22: K_z at 33 ft, Exposure C = 2.01 × (33/900)^(2/9.5) ≈ 1.00
    assert.ok(kz > 0.95 && kz < 1.10, `Expected ~1.00, got ${kz.toFixed(4)}`);
  });

  it('Exposure D produces higher K_z than C at same height', () => {
    assert.ok(calcKz(40, 'D') > calcKz(40, 'C'));
  });

  it('Exposure B produces lower K_z than C at same height', () => {
    assert.ok(calcKz(40, 'B') < calcKz(40, 'C'));
  });

  it('Height below 15 ft is clamped to 15 ft minimum', () => {
    assert.strictEqual(calcKz(5, 'C'), calcKz(15, 'C'));
  });

  it('K_z increases with height', () => {
    assert.ok(calcKz(100, 'C') > calcKz(30, 'C'));
  });
});

// ---------------------------------------------------------------------------
describe('calcVelocityPressure — q_z', () => {
  it('returns positive value for valid inputs', () => {
    const q = calcVelocityPressure({ V: 115, z_ft: 33, exposure: 'C' });
    assert.ok(q > 0);
  });

  it('V=115 mph, z=33 ft, Exposure C gives ~25–30 lbs/ft²', () => {
    const q = calcVelocityPressure({ V: 115, z_ft: 33, exposure: 'C' });
    assert.ok(q > 20 && q < 40, `Expected ~25-30, got ${q.toFixed(2)}`);
  });

  it('higher wind speed → higher q_z', () => {
    const q1 = calcVelocityPressure({ V: 100, z_ft: 30, exposure: 'C' });
    const q2 = calcVelocityPressure({ V: 150, z_ft: 30, exposure: 'C' });
    assert.ok(q2 > q1);
  });

  it('q_z scales as V² (doubling speed quadruples pressure)', () => {
    const q1 = calcVelocityPressure({ V: 100, z_ft: 30, exposure: 'C' });
    const q2 = calcVelocityPressure({ V: 200, z_ft: 30, exposure: 'C' });
    assert.ok(Math.abs(q2 / q1 - 4.0) < 0.01, `Expected ratio ~4, got ${(q2/q1).toFixed(4)}`);
  });

  it('throws for invalid exposure', () => {
    assert.throws(
      () => calcVelocityPressure({ V: 115, z_ft: 30, exposure: 'A' }),
      /Exposure/
    );
  });

  it('throws for V <= 0', () => {
    assert.throws(
      () => calcVelocityPressure({ V: 0, z_ft: 30, exposure: 'C' }),
      /wind speed/i
    );
  });
});

// ---------------------------------------------------------------------------
describe('trayForceCf', () => {
  it('empty = 1.3', () => assert.strictEqual(trayForceCf('empty'), 1.3));
  it('partial = 1.6', () => assert.strictEqual(trayForceCf('partial'), 1.6));
  it('full = 2.0', () => assert.strictEqual(trayForceCf('full'), 2.0));
  it('unknown defaults to 1.6', () => assert.strictEqual(trayForceCf('bogus'), 1.6));
});

// ---------------------------------------------------------------------------
describe('calcWindForce', () => {
  const base = {
    V: 115, z_ft: 20, exposure: 'C',
    trayWidth_in: 12, spanLength_ft: 12, fillLevel: 'partial',
  };

  it('returns all required fields', () => {
    const r = calcWindForce(base);
    assert.ok('Kz' in r);
    assert.ok('q_z_psf' in r);
    assert.ok('windForce_lbs' in r);
    assert.ok('windForce_per_ft' in r);
    assert.ok('windPressure_psf' in r);
  });

  it('force per ft = total force / span', () => {
    const r = calcWindForce(base);
    assert.ok(
      Math.abs(r.windForce_per_ft - r.windForce_lbs / base.spanLength_ft) < 0.2,
    );
  });

  it('wider tray → higher force', () => {
    const narrow = calcWindForce({ ...base, trayWidth_in: 12 });
    const wide   = calcWindForce({ ...base, trayWidth_in: 24 });
    assert.ok(wide.windForce_lbs > narrow.windForce_lbs);
  });

  it('full fill → higher force than empty', () => {
    const empty = calcWindForce({ ...base, fillLevel: 'empty' });
    const full  = calcWindForce({ ...base, fillLevel: 'full'  });
    assert.ok(full.windForce_lbs > empty.windForce_lbs);
  });

  it('throws for zero tray width', () => {
    assert.throws(() => calcWindForce({ ...base, trayWidth_in: 0 }), /width/i);
  });

  it('throws for zero span', () => {
    assert.throws(() => calcWindForce({ ...base, spanLength_ft: 0 }), /span/i);
  });
});

// ---------------------------------------------------------------------------
describe('checkNemaCapacity', () => {
  it('returns OK when cable load < capacity', () => {
    const r = checkNemaCapacity({
      cableWeight_lbs_ft: 30,
      windForce_per_ft: 10,
      nemaClass: '12B',
      spanLength_ft: 12,
    });
    assert.strictEqual(r.overCapacity, false);
    assert.ok(r.verticalUtilization < 1.0);
  });

  it('returns overCapacity when load > capacity', () => {
    const r = checkNemaCapacity({
      cableWeight_lbs_ft: 200,
      windForce_per_ft: 10,
      nemaClass: '12A',
      spanLength_ft: 12,
    });
    assert.strictEqual(r.overCapacity, true);
    assert.ok(r.verticalUtilization > 1.0);
  });

  it('capacity scales inversely with span', () => {
    const r12 = checkNemaCapacity({ cableWeight_lbs_ft: 30, windForce_per_ft: 5, nemaClass: '12B', spanLength_ft: 12 });
    const r20 = checkNemaCapacity({ cableWeight_lbs_ft: 30, windForce_per_ft: 5, nemaClass: '12B', spanLength_ft: 20 });
    assert.ok(r12.verticalCapacity_lbs_ft > r20.verticalCapacity_lbs_ft);
  });

  it('unknown nema class returns null capacity with note', () => {
    const r = checkNemaCapacity({ cableWeight_lbs_ft: 20, windForce_per_ft: 5, nemaClass: 'XX', spanLength_ft: 12 });
    assert.strictEqual(r.verticalCapacity_lbs_ft, null);
    assert.ok(r.note.includes('Unknown'));
  });
});

// ---------------------------------------------------------------------------
describe('NEMA_LOAD_CLASSES', () => {
  it('12B has 75 lbs/ft at 12 ft', () => {
    assert.strictEqual(NEMA_LOAD_CLASSES['12B'].designLoad_lbs_ft, 75);
    assert.strictEqual(NEMA_LOAD_CLASSES['12B'].referenceSpan_ft, 12);
  });

  it('all expected classes present', () => {
    ['8A','12A','12B','12C','20A','20B','20C'].forEach(cls => {
      assert.ok(cls in NEMA_LOAD_CLASSES, `Missing class ${cls}`);
    });
  });
});
