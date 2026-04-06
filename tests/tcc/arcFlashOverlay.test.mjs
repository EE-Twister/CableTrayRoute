/**
 * Unit tests for incidentEnergyLimitCurve() exported from analysis/arcFlash.mjs
 * Run with: node tests/tcc/arcFlashOverlay.test.mjs
 */

import assert from 'assert';
import { incidentEnergyLimitCurve } from '../../analysis/arcFlash.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

// Standard 480 V box-enclosed switchgear parameters (typical MCC)
const stdParams = {
  Cf: 1.5,
  sizeFactor: 1,
  gap: 32,
  dist: 455,
  V: 0.48,
  cfg: 'VCB',
  enclosure: 'box'
};

// Log-spaced current range: 1 kA to 20 kA, 50 points
const currentRangeKA = Array.from({ length: 50 }, (_, i) =>
  Math.pow(10, Math.log10(1) + (Math.log10(20) - Math.log10(1)) * i / 49));

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – return type and shape', () => {
  it('returns an array', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    assert.ok(Array.isArray(result), 'should return an array');
  });

  it('returns at least one point for standard parameters at 8 cal/cm²', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    assert.ok(result.length > 0, `expected >0 points, got ${result.length}`);
  });

  it('each point has numeric current and time fields', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    result.forEach(p => {
      assert.ok(typeof p.current === 'number' && Number.isFinite(p.current),
        `current must be finite, got ${p.current}`);
      assert.ok(typeof p.time === 'number' && Number.isFinite(p.time),
        `time must be finite, got ${p.time}`);
    });
  });

  it('current values are in Amps (> 100 A for 1+ kA range)', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    result.forEach(p => assert.ok(p.current >= 100,
      `expected current ≥ 100 A, got ${p.current}`));
  });

  it('time values are positive and ≤ 100 s', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    result.forEach(p => {
      assert.ok(p.time > 0, `time must be > 0, got ${p.time}`);
      assert.ok(p.time <= 100, `time must be ≤ 100 s, got ${p.time}`);
    });
  });

  it('points are sorted by ascending current', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i].current >= result[i - 1].current,
        `points not sorted at index ${i}: ${result[i - 1].current} → ${result[i].current}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – monotonicity', () => {
  it('clearing time decreases as fault current increases (higher I → less time allowed)', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    assert.ok(result.length >= 2, 'need at least 2 points for comparison');
    // Compare first quarter vs last quarter averages
    const q = Math.floor(result.length / 4);
    const lowAvg = result.slice(0, q).reduce((s, p) => s + p.time, 0) / q;
    const highAvg = result.slice(-q).reduce((s, p) => s + p.time, 0) / q;
    assert.ok(lowAvg > highAvg,
      `expected time at low currents (${lowAvg.toFixed(3)} s) > time at high currents (${highAvg.toFixed(3)} s)`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – threshold scaling', () => {
  it('40 cal/cm² threshold allows longer clearing times than 8 cal/cm²', () => {
    const curve8 = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    const curve40 = incidentEnergyLimitCurve(stdParams, 40, currentRangeKA);
    assert.ok(curve8.length > 0 && curve40.length > 0, 'both curves should have points');
    const mid8 = curve8[Math.floor(curve8.length / 2)].time;
    const mid40 = curve40[Math.floor(curve40.length / 2)].time;
    assert.ok(mid40 > mid8,
      `40 cal/cm² time (${mid40.toFixed(4)} s) should exceed 8 cal/cm² time (${mid8.toFixed(4)} s) at same current`);
  });

  it('25 cal/cm² is between 8 and 40 cal/cm²', () => {
    const curve8 = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    const curve25 = incidentEnergyLimitCurve(stdParams, 25, currentRangeKA);
    const curve40 = incidentEnergyLimitCurve(stdParams, 40, currentRangeKA);
    assert.ok(curve8.length > 0 && curve25.length > 0 && curve40.length > 0);
    const mid8 = curve8[Math.floor(curve8.length / 2)].time;
    const mid25 = curve25[Math.floor(curve25.length / 2)].time;
    const mid40 = curve40[Math.floor(curve40.length / 2)].time;
    assert.ok(mid25 > mid8 && mid25 < mid40,
      `25 cal/cm² time (${mid25.toFixed(4)} s) should be between 8 (${mid8.toFixed(4)} s) and 40 (${mid40.toFixed(4)} s)`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – enclosure effect', () => {
  it('open-air (Cf=1) allows longer clearing times than enclosed (Cf=1.5) for same threshold', () => {
    const openParams = { ...stdParams, Cf: 1, enclosure: 'open' };
    const curveOpen = incidentEnergyLimitCurve(openParams, 8, currentRangeKA);
    const curveBox = incidentEnergyLimitCurve(stdParams, 8, currentRangeKA);
    assert.ok(curveOpen.length > 0 && curveBox.length > 0);
    const midOpen = curveOpen[Math.floor(curveOpen.length / 2)].time;
    const midBox = curveBox[Math.floor(curveBox.length / 2)].time;
    assert.ok(midOpen > midBox,
      `open-air time (${midOpen.toFixed(4)} s) should exceed enclosed time (${midBox.toFixed(4)} s)`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – edge cases', () => {
  it('returns empty array for zero threshold', () => {
    const result = incidentEnergyLimitCurve(stdParams, 0, currentRangeKA);
    assert.strictEqual(result.length, 0, 'zero threshold should return empty array');
  });

  it('returns empty array for negative threshold', () => {
    const result = incidentEnergyLimitCurve(stdParams, -5, currentRangeKA);
    assert.strictEqual(result.length, 0, 'negative threshold should return empty array');
  });

  it('returns empty array for empty current range', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, []);
    assert.strictEqual(result.length, 0, 'empty current range should return empty array');
  });

  it('returns empty array when current range is non-array', () => {
    const result = incidentEnergyLimitCurve(stdParams, 8, null);
    assert.strictEqual(result.length, 0);
  });

  it('skips zero and negative current values silently', () => {
    const mixedRange = [-1, 0, 1, 5, 10];
    const result = incidentEnergyLimitCurve(stdParams, 8, mixedRange);
    result.forEach(p => assert.ok(p.current > 0, `current must be > 0, got ${p.current}`));
  });

  it('handles very small working distance without throwing', () => {
    const smallDistParams = { ...stdParams, dist: 10 };
    assert.doesNotThrow(() => incidentEnergyLimitCurve(smallDistParams, 8, currentRangeKA));
  });

  it('handles undefined params object using defaults', () => {
    assert.doesNotThrow(() => {
      const result = incidentEnergyLimitCurve(undefined, 8, [1, 5, 10]);
      assert.ok(Array.isArray(result));
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('incidentEnergyLimitCurve – IEEE 1584 spot-check', () => {
  it('at 5 kA bolted fault, 8 cal/cm² limit gives clearing time < 0.5 s for typical MCC', () => {
    // At 5 kA, incident energy accumulates rapidly — clearing must be fast
    const result = incidentEnergyLimitCurve(stdParams, 8, [5]);
    assert.ok(result.length === 1, 'should produce one point');
    assert.ok(result[0].time < 0.5,
      `expected clearing time < 0.5 s at 5 kA for 8 cal/cm², got ${result[0].time.toFixed(4)} s`);
  });

  it('at 1 kA bolted fault, 40 cal/cm² limit gives clearing time > 0.1 s', () => {
    // Low fault current → slower arcing → more time available before hazard threshold
    const result = incidentEnergyLimitCurve(stdParams, 40, [1]);
    assert.ok(result.length === 1, 'should produce one point');
    assert.ok(result[0].time > 0.1,
      `expected clearing time > 0.1 s at 1 kA for 40 cal/cm², got ${result[0].time.toFixed(4)} s`);
  });
});
