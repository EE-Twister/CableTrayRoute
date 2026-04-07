/**
 * Unit tests for analysis/iecRelayCurves.mjs
 *
 * Verifies IEC 60255-151 formula accuracy, monotonicity, TMS linearity,
 * edge-case handling, and integration with tccUtils.js scaleCurve().
 *
 * Run with:  node tests/tcc/iecRelayCurves.test.mjs
 */

import assert from 'assert';
import {
  IEC_CURVE_FAMILIES,
  MIN_OPERATE_TIME_S,
  computeIecTime,
  computeIecCurvePoints,
  iecFamilyDisplayName
} from '../../analysis/iecRelayCurves.mjs';
import { scaleCurve } from '../../analysis/tccUtils.js';

function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

// ─── IEC_CURVE_FAMILIES constant ─────────────────────────────────────────────
describe('IEC_CURVE_FAMILIES', () => {
  it('exports all four standard families', () => {
    assert.ok(IEC_CURVE_FAMILIES.NI,  'NI missing');
    assert.ok(IEC_CURVE_FAMILIES.VI,  'VI missing');
    assert.ok(IEC_CURVE_FAMILIES.EI,  'EI missing');
    assert.ok(IEC_CURVE_FAMILIES.LTI, 'LTI missing');
  });

  it('NI has correct constants (k=0.14, α=0.02)', () => {
    assert.strictEqual(IEC_CURVE_FAMILIES.NI.k,     0.14);
    assert.strictEqual(IEC_CURVE_FAMILIES.NI.alpha,  0.02);
  });

  it('VI has correct constants (k=13.5, α=1.0)', () => {
    assert.strictEqual(IEC_CURVE_FAMILIES.VI.k,     13.5);
    assert.strictEqual(IEC_CURVE_FAMILIES.VI.alpha,  1.0);
  });

  it('EI has correct constants (k=80.0, α=2.0)', () => {
    assert.strictEqual(IEC_CURVE_FAMILIES.EI.k,     80.0);
    assert.strictEqual(IEC_CURVE_FAMILIES.EI.alpha,  2.0);
  });

  it('LTI has correct constants (k=120.0, α=1.0)', () => {
    assert.strictEqual(IEC_CURVE_FAMILIES.LTI.k,     120.0);
    assert.strictEqual(IEC_CURVE_FAMILIES.LTI.alpha,  1.0);
  });
});

// ─── computeIecTime ───────────────────────────────────────────────────────────
describe('computeIecTime', () => {
  it('returns Infinity for multiple <= 1 (relay does not operate at or below pickup)', () => {
    const { k, alpha } = IEC_CURVE_FAMILIES.NI;
    assert.strictEqual(computeIecTime(k, alpha, 1.0, 1.0),  Infinity);
    assert.strictEqual(computeIecTime(k, alpha, 1.0, 0.5),  Infinity);
    assert.strictEqual(computeIecTime(k, alpha, 1.0, -1),   Infinity);
    assert.strictEqual(computeIecTime(k, alpha, 1.0, NaN),  Infinity);
  });

  it('NI: TMS=1, 5× pickup → ≈4.34 s (hand-calculated)', () => {
    // t = 1.0 × 0.14 / [(5)^0.02 − 1]
    // (5)^0.02 = e^(0.02 × ln5) = e^(0.02 × 1.60944) = e^0.032189 ≈ 1.032717
    // denominator ≈ 0.032717
    // t ≈ 0.14 / 0.032717 ≈ 4.279
    const { k, alpha } = IEC_CURVE_FAMILIES.NI;
    const t = computeIecTime(k, alpha, 1.0, 5);
    assert.ok(Number.isFinite(t), 'result must be finite');
    assert.ok(t > 4.0 && t < 4.7, `expected ~4.28 s, got ${t.toFixed(4)} s`);
  });

  it('VI: TMS=1, 10× pickup → ≈1.5 s (hand-calculated)', () => {
    // t = 1.0 × 13.5 / [(10)^1.0 − 1] = 13.5 / 9 = 1.5
    const { k, alpha } = IEC_CURVE_FAMILIES.VI;
    const t = computeIecTime(k, alpha, 1.0, 10);
    assert.ok(Number.isFinite(t), 'result must be finite');
    assert.ok(Math.abs(t - 1.5) < 0.001, `expected 1.5 s, got ${t.toFixed(6)} s`);
  });

  it('EI: TMS=1, 10× pickup → ≈0.808 s (hand-calculated)', () => {
    // t = 1.0 × 80.0 / [(10)^2.0 − 1] = 80 / 99 ≈ 0.8081
    const { k, alpha } = IEC_CURVE_FAMILIES.EI;
    const t = computeIecTime(k, alpha, 1.0, 10);
    assert.ok(Number.isFinite(t), 'result must be finite');
    assert.ok(Math.abs(t - 80.0 / 99.0) < 0.001, `expected ~0.8081 s, got ${t.toFixed(6)} s`);
  });

  it('LTI: TMS=1, 10× pickup → correct value (hand-calculated)', () => {
    // t = 1.0 × 120.0 / [(10)^1.0 − 1] = 120 / 9 ≈ 13.333
    const { k, alpha } = IEC_CURVE_FAMILIES.LTI;
    const t = computeIecTime(k, alpha, 1.0, 10);
    assert.ok(Number.isFinite(t), 'result must be finite');
    assert.ok(Math.abs(t - 120.0 / 9.0) < 0.001, `expected ~13.333 s, got ${t.toFixed(6)} s`);
  });

  it('TMS linearity: doubling TMS doubles operating time', () => {
    const { k, alpha } = IEC_CURVE_FAMILIES.VI;
    const t1 = computeIecTime(k, alpha, 0.5, 5);
    const t2 = computeIecTime(k, alpha, 1.0, 5);
    assert.ok(Math.abs(t2 / t1 - 2.0) < 1e-9, `ratio should be 2.0, got ${t2 / t1}`);
  });

  it('clamps to MIN_OPERATE_TIME_S floor at very high multiples', () => {
    const { k, alpha } = IEC_CURVE_FAMILIES.NI;
    const t = computeIecTime(k, alpha, 0.05, 1000);
    assert.ok(t >= MIN_OPERATE_TIME_S, `time ${t} below hardware floor ${MIN_OPERATE_TIME_S}`);
  });
});

// ─── computeIecCurvePoints ────────────────────────────────────────────────────
describe('computeIecCurvePoints', () => {
  it('returns empty array for unknown family key', () => {
    const pts = computeIecCurvePoints('XX', 0.5, 100);
    assert.deepStrictEqual(pts, []);
  });

  it('returns empty array for non-finite TMS', () => {
    assert.deepStrictEqual(computeIecCurvePoints('NI', NaN,      100), []);
    assert.deepStrictEqual(computeIecCurvePoints('NI', Infinity, 100), []);
    assert.deepStrictEqual(computeIecCurvePoints('NI', 0,        100), []);
  });

  it('returns empty array for non-positive pickup', () => {
    assert.deepStrictEqual(computeIecCurvePoints('NI', 0.5, 0),   []);
    assert.deepStrictEqual(computeIecCurvePoints('NI', 0.5, -50), []);
    assert.deepStrictEqual(computeIecCurvePoints('NI', 0.5, NaN), []);
  });

  it('returns ≥ 2 points for valid inputs (all four families)', () => {
    for (const key of ['NI', 'VI', 'EI', 'LTI']) {
      const pts = computeIecCurvePoints(key, 0.5, 100);
      assert.ok(pts.length >= 2, `${key}: expected >= 2 points, got ${pts.length}`);
    }
  });

  it('all points have current > pickup (I > Is)', () => {
    const IS = 200;
    const pts = computeIecCurvePoints('VI', 1.0, IS);
    for (const p of pts) {
      assert.ok(p.current > IS, `point current ${p.current} <= pickup ${IS}`);
    }
  });

  it('curve is monotonically decreasing (time decreases as current increases)', () => {
    for (const key of ['NI', 'VI', 'EI', 'LTI']) {
      const pts = computeIecCurvePoints(key, 0.5, 100);
      for (let i = 1; i < pts.length; i++) {
        // Allow equality only when both points hit the hardware floor
        assert.ok(
          pts[i].time <= pts[i - 1].time + 1e-9,
          `${key}: non-monotonic at index ${i}: t[${i-1}]=${pts[i-1].time}, t[${i}]=${pts[i].time}`
        );
      }
    }
  });

  it('curve is sorted ascending by current', () => {
    const pts = computeIecCurvePoints('EI', 0.7, 400);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i].current > pts[i - 1].current,
        `not sorted at index ${i}`);
    }
  });

  it('no time below MIN_OPERATE_TIME_S', () => {
    for (const key of ['NI', 'VI', 'EI', 'LTI']) {
      const pts = computeIecCurvePoints(key, 1.5, 100);
      for (const p of pts) {
        assert.ok(p.time >= MIN_OPERATE_TIME_S,
          `${key}: time ${p.time} below floor ${MIN_OPERATE_TIME_S}`);
      }
    }
  });

  it('TMS=0.5 produces times half of TMS=1.0 (except where floored)', () => {
    const pts1 = computeIecCurvePoints('VI', 1.0, 100);
    const pts05 = computeIecCurvePoints('VI', 0.5, 100);
    // Same number of points (same current grid)
    assert.strictEqual(pts1.length, pts05.length);
    for (let i = 0; i < pts1.length; i++) {
      const t1 = pts1[i].time;
      const t05 = pts05[i].time;
      if (t1 > MIN_OPERATE_TIME_S * 2) {
        assert.ok(Math.abs(t05 / t1 - 0.5) < 1e-9,
          `ratio at index ${i} should be 0.5, got ${t05 / t1}`);
      }
    }
  });

  it('changing pickup scales all current values proportionally', () => {
    const pts100 = computeIecCurvePoints('EI', 0.5, 100);
    const pts200 = computeIecCurvePoints('EI', 0.5, 200);
    assert.strictEqual(pts100.length, pts200.length);
    for (let i = 0; i < pts100.length; i++) {
      assert.ok(
        Math.abs(pts200[i].current / pts100[i].current - 2.0) < 1e-9,
        `current ratio at index ${i} should be 2.0`
      );
      // Times should be identical (same I/Is ratio)
      assert.ok(
        Math.abs(pts200[i].time - pts100[i].time) < 1e-9,
        `time at index ${i} should be identical for same I/Is ratio`
      );
    }
  });
});

// ─── iecFamilyDisplayName ─────────────────────────────────────────────────────
describe('iecFamilyDisplayName', () => {
  it('returns correct names for all four families', () => {
    assert.strictEqual(iecFamilyDisplayName('NI'),  'Normal Inverse');
    assert.strictEqual(iecFamilyDisplayName('VI'),  'Very Inverse');
    assert.strictEqual(iecFamilyDisplayName('EI'),  'Extremely Inverse');
    assert.strictEqual(iecFamilyDisplayName('LTI'), 'Long-Time Inverse');
  });

  it('returns key itself for unknown family', () => {
    assert.strictEqual(iecFamilyDisplayName('XX'), 'XX');
  });
});

// ─── Integration: scaleCurve with IEC relay device ───────────────────────────
describe('scaleCurve integration with IEC relay devices', () => {
  const iecNiDevice = {
    id: 'iec_ni_relay',
    type: 'relay',
    vendor: 'IEC 60255-151',
    name: 'IEC Normal Inverse (NI) Relay',
    iec60255: true,
    curveFamily: 'NI',
    settings: { tms: 0.5, pickup: 100 },
    settingOptions: {
      tms: [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5],
      pickup: [50, 100, 200, 400, 800, 1600]
    },
    interruptRating: 50,
    curve: []
  };

  it('scaleCurve returns ≥ 2 curve points', () => {
    const result = scaleCurve(iecNiDevice, {});
    assert.ok(result.curve.length >= 2, `expected >= 2 points, got ${result.curve.length}`);
  });

  it('returns ±5% tolerance bands (Class E1)', () => {
    const result = scaleCurve(iecNiDevice, {});
    assert.ok(result.tolerance, 'tolerance missing');
    assert.strictEqual(result.tolerance.timeLower, 0.95, 'timeLower should be 0.95');
    assert.strictEqual(result.tolerance.timeUpper, 1.05, 'timeUpper should be 1.05');
    // minCurve = 95% of main curve
    for (let i = 0; i < result.curve.length; i++) {
      const ratio = result.minCurve[i].time / result.curve[i].time;
      assert.ok(Math.abs(ratio - 0.95) < 1e-9,
        `minCurve ratio at index ${i} should be 0.95, got ${ratio}`);
    }
  });

  it('envelope is consistent with min/max curves', () => {
    const result = scaleCurve(iecNiDevice, {});
    assert.ok(result.envelope.length >= 2, 'envelope should have >= 2 points');
    for (const env of result.envelope) {
      assert.ok(env.minTime <= env.maxTime,
        `envelope minTime ${env.minTime} > maxTime ${env.maxTime}`);
    }
  });

  it('overriding tms=1.0 doubles times vs tms=0.5', () => {
    const r05 = scaleCurve(iecNiDevice, { tms: 0.5 });
    const r10 = scaleCurve(iecNiDevice, { tms: 1.0 });
    assert.strictEqual(r05.curve.length, r10.curve.length, 'point count must match');
    for (let i = 0; i < r05.curve.length; i++) {
      if (r05.curve[i].time > MIN_OPERATE_TIME_S * 2) {
        const ratio = r10.curve[i].time / r05.curve[i].time;
        assert.ok(Math.abs(ratio - 2.0) < 1e-9,
          `time ratio at index ${i} should be 2.0, got ${ratio}`);
      }
    }
  });

  it('overriding pickup=200 doubles all currents vs pickup=100', () => {
    const r100 = scaleCurve(iecNiDevice, { pickup: 100 });
    const r200 = scaleCurve(iecNiDevice, { pickup: 200 });
    assert.strictEqual(r100.curve.length, r200.curve.length);
    for (let i = 0; i < r100.curve.length; i++) {
      const ratio = r200.curve[i].current / r100.curve[i].current;
      assert.ok(Math.abs(ratio - 2.0) < 1e-9,
        `current ratio at index ${i} should be 2.0, got ${ratio}`);
    }
  });

  it('settings are preserved correctly in returned object', () => {
    const result = scaleCurve(iecNiDevice, { tms: 0.7, pickup: 200 });
    assert.strictEqual(result.settings.tms,    0.7);
    assert.strictEqual(result.settings.pickup, 200);
  });

  it('non-IEC device (breaker) is unaffected by IEC branch', () => {
    const breaker = {
      id: 'test_breaker',
      type: 'breaker',
      settings: { pickup: 160, time: 0.2 },
      curve: [
        { current: 160, time: 100 },
        { current: 800, time: 0.2 },
        { current: 1600, time: 0.05 }
      ]
    };
    const result = scaleCurve(breaker, {});
    // Should not use IEC branch — curve comes from point array
    assert.ok(result.curve.length >= 1, 'breaker should still have curve points');
    // Spot check: tolerance should be default (±20%), not IEC ±5%
    assert.ok(
      result.tolerance.timeLower < 0.9,
      `breaker tolerance should not use IEC ±5%: timeLower=${result.tolerance.timeLower}`
    );
  });
});

// ─── curveFamily override (IEC Parametric Relay) ──────────────────────────────
describe('scaleCurve curveFamily override', () => {
  const parametricDevice = {
    id: 'iec_parametric_relay',
    type: 'relay',
    vendor: 'IEC 60255-151',
    name: 'IEC Parametric Relay',
    iec60255: true,
    curveFamily: 'NI',
    settings: { curveFamily: 'NI', tms: 0.5, pickup: 100 },
    settingOptions: {
      curveFamily: ['NI', 'VI', 'EI', 'LTI'],
      tms: [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0],
      pickup: [50, 100, 200, 400, 800, 1600]
    },
    interruptRating: 50,
    curve: []
  };

  it('uses overrides.curveFamily when provided, changing the curve shape', () => {
    const ni = scaleCurve(parametricDevice, {});
    const vi = scaleCurve(parametricDevice, { curveFamily: 'VI' });
    // At high multiples (≥10× pickup = 1000 A), NI is much slower than VI.
    // NI (α=0.02) barely drops with current; VI (α=1.0) drops sharply — so NI > VI at high current.
    const niHighTime = ni.curve.find(p => p.current >= 1000)?.time;
    const viHighTime = vi.curve.find(p => p.current >= 1000)?.time;
    assert.ok(Number.isFinite(niHighTime), 'NI should produce finite time at 10× pickup');
    assert.ok(Number.isFinite(viHighTime), 'VI should produce finite time at 10× pickup');
    assert.ok(niHighTime > viHighTime * 2,
      `NI time (${niHighTime?.toFixed(3)}) should be >2× VI time (${viHighTime?.toFixed(3)}) at 10× pickup — NI is much slower at high fault currents`);
  });

  it('reports effectiveFamily in returned settings when overridden', () => {
    const result = scaleCurve(parametricDevice, { curveFamily: 'EI' });
    assert.strictEqual(result.settings.curveFamily, 'EI',
      `settings.curveFamily should reflect override; got '${result.settings.curveFamily}'`);
  });

  it('reports base curveFamily when no override is given', () => {
    const result = scaleCurve(parametricDevice, {});
    assert.strictEqual(result.settings.curveFamily, 'NI',
      `settings.curveFamily should be base 'NI'; got '${result.settings.curveFamily}'`);
  });

  it('all four families produce valid curves via override', () => {
    for (const family of ['NI', 'VI', 'EI', 'LTI']) {
      const result = scaleCurve(parametricDevice, { curveFamily: family });
      assert.ok(result.curve.length >= 2,
        `${family}: expected >= 2 curve points, got ${result.curve.length}`);
      assert.strictEqual(result.settings.curveFamily, family,
        `${family}: settings.curveFamily mismatch`);
    }
  });

  it('EI and LTI overrides produce curves distinct from NI', () => {
    const ni  = scaleCurve(parametricDevice, { curveFamily: 'NI' });
    const ei  = scaleCurve(parametricDevice, { curveFamily: 'EI' });
    const lti = scaleCurve(parametricDevice, { curveFamily: 'LTI' });
    const idx = Math.floor(ni.curve.length / 2);
    assert.ok(Math.abs(ei.curve[idx].time - ni.curve[idx].time) > 0.001,
      'EI and NI curves should differ at mid-range');
    assert.ok(Math.abs(lti.curve[idx].time - ni.curve[idx].time) > 0.001,
      'LTI and NI curves should differ at mid-range');
  });

  it('tms and pickup overrides still work alongside curveFamily override', () => {
    const r = scaleCurve(parametricDevice, { curveFamily: 'VI', tms: 1.0, pickup: 200 });
    assert.strictEqual(r.settings.curveFamily, 'VI');
    assert.strictEqual(r.settings.tms, 1.0);
    assert.strictEqual(r.settings.pickup, 200);
    // All currents should be >= 200 (pickup)
    for (const p of r.curve) {
      assert.ok(p.current > 200, `current ${p.current} should exceed pickup 200`);
    }
  });
});
