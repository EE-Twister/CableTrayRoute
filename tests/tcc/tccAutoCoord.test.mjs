/**
 * Unit tests for tccAutoCoord.mjs
 * Run with: node tests/tcc/tccAutoCoord.test.mjs
 */

import assert from 'assert';
import { readFile } from 'fs/promises';
import { scaleCurve } from '../../analysis/tccUtils.js';
import {
  interpolateTime,
  checkCoordination,
  findCoordinatingTimeDial,
  greedyCoordinate,
  generateFaultCurrents
} from '../../analysis/tccAutoCoord.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

const rawDevices = JSON.parse(await readFile('data/protectiveDevices.json', 'utf8'));
const abb = rawDevices.find(d => d.id === 'abb_tmax_160');
const ge = rawDevices.find(d => d.id === 'ge_multilin_750');

assert(abb, 'abb_tmax_160 device must exist in protectiveDevices.json');
assert(ge, 'ge_multilin_750 device must exist in protectiveDevices.json');

// ──────────────────────────────────────────────────────────────────────────────
describe('interpolateTime', () => {
  const curve = [
    { current: 100, time: 10 },
    { current: 1000, time: 1 }
  ];

  it('returns MIN_TIME for empty curve', () => {
    assert.strictEqual(interpolateTime([], 500), 1e-4);
  });

  it('returns MIN_TIME for null/undefined input', () => {
    assert.strictEqual(interpolateTime(null, 500), 1e-4);
    assert.strictEqual(interpolateTime(undefined, 500), 1e-4);
  });

  it('returns MIN_TIME for non-positive current', () => {
    assert.strictEqual(interpolateTime(curve, 0), 1e-4);
    assert.strictEqual(interpolateTime(curve, -10), 1e-4);
    assert.strictEqual(interpolateTime(curve, NaN), 1e-4);
  });

  it('returns first point time for current <= first current', () => {
    assert.strictEqual(interpolateTime(curve, 100), 10);
    assert.strictEqual(interpolateTime(curve, 50), 10);
  });

  it('returns last point time for current > last current', () => {
    assert.strictEqual(interpolateTime(curve, 2000), 1);
    assert.strictEqual(interpolateTime(curve, 1000), 1);
  });

  it('interpolates in log-log space at geometric midpoint', () => {
    // Geometric midpoint of [100, 1000] is sqrt(100*1000) = 316.23
    // Log-log interpolated time = exp((log(10) + log(1)) / 2) = sqrt(10) ≈ 3.162
    const mid = Math.sqrt(100 * 1000);
    const t = interpolateTime(curve, mid);
    const expected = Math.sqrt(10);
    assert(Math.abs(t - expected) < 0.001, `Expected ~${expected.toFixed(3)}, got ${t.toFixed(3)}`);
  });

  it('handles single-point curve', () => {
    const single = [{ current: 500, time: 5 }];
    assert.strictEqual(interpolateTime(single, 100), 5);
    assert.strictEqual(interpolateTime(single, 500), 5);
    assert.strictEqual(interpolateTime(single, 1000), 5);
  });

  it('result is always finite and positive', () => {
    for (const I of [1, 10, 100, 300, 1000, 5000]) {
      const t = interpolateTime(curve, I);
      assert(Number.isFinite(t) && t > 0, `Expected positive finite at I=${I}, got ${t}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('generateFaultCurrents', () => {
  it('returns the requested number of points', () => {
    const pts = generateFaultCurrents(100, 10000, 20);
    assert.strictEqual(pts.length, 20);
  });

  it('first point is approximately minCurrentA', () => {
    const pts = generateFaultCurrents(100, 10000, 20);
    assert(Math.abs(pts[0] - 100) < 1e-6, `Expected ~100, got ${pts[0]}`);
  });

  it('last point is approximately maxCurrentA', () => {
    const pts = generateFaultCurrents(100, 10000, 20);
    assert(Math.abs(pts[pts.length - 1] - 10000) < 1e-6, `Expected ~10000, got ${pts[pts.length - 1]}`);
  });

  it('points are monotonically increasing', () => {
    const pts = generateFaultCurrents(1, 100000, 50);
    for (let i = 1; i < pts.length; i += 1) {
      assert(pts[i] > pts[i - 1], `Not monotonically increasing at index ${i}`);
    }
  });

  it('returns 2 points as minimum', () => {
    const pts = generateFaultCurrents(100, 10000, 1);
    assert(pts.length >= 2);
  });

  it('all points are positive and finite', () => {
    const pts = generateFaultCurrents(50, 50000, 30);
    pts.forEach(p => assert(Number.isFinite(p) && p > 0));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('checkCoordination', () => {
  const faultCurrents = generateFaultCurrents(100, 1000, 20); // below instantaneous threshold

  // Disable instantaneous so both devices operate on long-time inverse curves only.
  // This avoids the expected engineering constraint that two devices with instantaneous
  // at the same pickup threshold cannot be selectively coordinated above that current.
  const downstream = scaleCurve(abb, { pickup: 160, time: 0.1, instantaneous: 0 });
  const upstreamOk = scaleCurve(abb, { pickup: 160, time: 3.0, instantaneous: 0 });
  // Same settings as downstream — no coordination margin possible
  const upstreamBad = scaleCurve(abb, { pickup: 160, time: 0.1, instantaneous: 0 });

  it('reports coordinated=true when upstream is significantly slower', () => {
    const result = checkCoordination(upstreamOk, downstream, faultCurrents, 0.3);
    assert.strictEqual(result.coordinated, true, 'Expected coordinated with 20× time ratio');
  });

  it('reports coordinated=false when upstream and downstream have same settings', () => {
    const result = checkCoordination(upstreamBad, downstream, faultCurrents, 0.3);
    assert.strictEqual(result.coordinated, false, 'Identical curves should not be coordinated');
  });

  it('violations have required fields', () => {
    const result = checkCoordination(upstreamBad, downstream, faultCurrents, 0.3);
    assert(result.violations.length > 0, 'Expected violations');
    const v = result.violations[0];
    assert('current' in v, 'Missing field: current');
    assert('upstreamMinTime' in v, 'Missing field: upstreamMinTime');
    assert('downstreamMaxTime' in v, 'Missing field: downstreamMaxTime');
    assert('gap' in v, 'Missing field: gap');
  });

  it('gap is less than margin when violation occurs', () => {
    const margin = 0.3;
    const result = checkCoordination(upstreamBad, downstream, faultCurrents, margin);
    result.violations.forEach(v => {
      assert(v.gap < margin, `Expected gap < ${margin}, got ${v.gap}`);
    });
  });

  it('returns empty violations when coordinated', () => {
    const result = checkCoordination(upstreamOk, downstream, faultCurrents, 0.3);
    assert.strictEqual(result.violations.length, 0);
  });

  it('handles margin=0 (all positive gaps pass)', () => {
    const result = checkCoordination(upstreamOk, downstream, faultCurrents, 0);
    assert.strictEqual(result.coordinated, true);
  });

  it('handles very large margin (forces violations)', () => {
    const result = checkCoordination(upstreamOk, downstream, faultCurrents, 1000);
    assert.strictEqual(result.coordinated, false);
  });

  it('handles invalid/missing inputs gracefully', () => {
    const result = checkCoordination(null, null, faultCurrents, 0.3);
    assert.strictEqual(typeof result.coordinated, 'boolean');
    assert(Array.isArray(result.violations));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('findCoordinatingTimeDial', () => {
  // Disable instantaneous to test long-time inverse curve coordination only
  const downstream = scaleCurve(abb, { pickup: 160, time: 0.2, instantaneous: 0 });
  const faultCurrents = generateFaultCurrents(100, 700, 50); // stay below inst threshold (800A)

  it('finds a valid time dial for a coordinatable pair', () => {
    const r = findCoordinatingTimeDial(abb, { pickup: 160 }, downstream, faultCurrents, 0.3);
    assert.strictEqual(r.found, true, 'Should find a coordinating dial');
    assert(r.timeDial >= 0.05, `timeDial ${r.timeDial} below minimum`);
    assert(r.timeDial <= 10.0, `timeDial ${r.timeDial} above maximum`);
  });

  it('applying the returned dial achieves coordination', () => {
    const r = findCoordinatingTimeDial(abb, { pickup: 160 }, downstream, faultCurrents, 0.3);
    if (!r.found) return; // skip if not found (upstream check)
    const reScaled = scaleCurve(abb, { pickup: 160, time: r.timeDial });
    const reCheck = checkCoordination(reScaled, downstream, faultCurrents, 0.3);
    assert.strictEqual(reCheck.coordinated, true, 'Re-check must confirm coordination');
  });

  it('scaledResult has settings.time equal to timeDial', () => {
    const r = findCoordinatingTimeDial(abb, { pickup: 160 }, downstream, faultCurrents, 0.3);
    assert(r.scaledResult, 'scaledResult must be set');
    assert(
      Math.abs((r.scaledResult.settings?.time ?? 0) - r.timeDial) < 1e-6 ||
      r.scaledResult.settings?.longTimeDelay !== undefined,
      'scaledResult.settings.time should reflect the dial used'
    );
  });

  it('smaller margin produces a smaller or equal time dial', () => {
    const r1 = findCoordinatingTimeDial(abb, { pickup: 160 }, downstream, faultCurrents, 0.1);
    const r2 = findCoordinatingTimeDial(abb, { pickup: 160 }, downstream, faultCurrents, 0.5);
    if (r1.found && r2.found) {
      assert(r1.timeDial <= r2.timeDial + 1e-6, `Smaller margin should give smaller or equal dial: ${r1.timeDial} vs ${r2.timeDial}`);
    }
  });

  it('preserves pickup override in scaledResult', () => {
    const r = findCoordinatingTimeDial(abb, { pickup: 200 }, downstream, faultCurrents, 0.3);
    if (!r.found) return;
    // The curve should be scaled by pickup 200 not 160
    assert(r.scaledResult.settings?.pickup === 200 ||
           r.scaledResult.settings?.longTimePickup === 200, 'Pickup should be preserved');
  });

  it('always returns an object with required fields', () => {
    const r = findCoordinatingTimeDial(abb, { pickup: 160, instantaneous: 0 }, downstream, faultCurrents, 0.3);
    assert('found' in r, 'found field must be present');
    assert('timeDial' in r, 'timeDial field must be present');
    assert('scaledResult' in r, 'scaledResult field must be present');
    assert('violations' in r, 'violations field must be present');
    assert(typeof r.found === 'boolean', 'found must be boolean');
    assert(typeof r.timeDial === 'number', 'timeDial must be number');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('greedyCoordinate', () => {
  // Use instantaneous:0 so devices operate on long-time inverse curves only
  const entries = [
    { id: 'load-breaker',   device: abb, overrides: { pickup: 160, time: 0.1, instantaneous: 0 } },
    { id: 'feeder-breaker', device: abb, overrides: { pickup: 160, time: 0.5, instantaneous: 0 } },
    { id: 'main-relay',     device: ge,  overrides: { pickup: 600, time: 1.0 } }
  ];

  it('returns one result per device entry', () => {
    const { results } = greedyCoordinate(entries, 50000, { margin: 0.3 });
    assert.strictEqual(results.length, entries.length);
  });

  it('first result has found=true (fixed reference device)', () => {
    const { results } = greedyCoordinate(entries, 50000, { margin: 0.3 });
    assert.strictEqual(results[0].found, true);
  });

  it('each result has required fields', () => {
    const { results } = greedyCoordinate(entries, 50000, { margin: 0.3 });
    results.forEach((r, i) => {
      assert('id' in r, `Result ${i} missing id`);
      assert('found' in r, `Result ${i} missing found`);
      assert('timeDial' in r, `Result ${i} missing timeDial`);
      assert('scaledResult' in r, `Result ${i} missing scaledResult`);
      assert('violations' in r, `Result ${i} missing violations`);
    });
  });

  it('returns allCoordinated as boolean', () => {
    const twoEntries = [
      { id: 'downstream', device: abb, overrides: { pickup: 160, time: 0.1, instantaneous: 0 } },
      { id: 'upstream',   device: abb, overrides: { pickup: 160, time: 5.0, instantaneous: 0 } }
    ];
    const { allCoordinated } = greedyCoordinate(twoEntries, 1000, { margin: 0.3 });
    assert(typeof allCoordinated === 'boolean');
  });

  it('works with exactly 2 devices', () => {
    const twoEntries = [
      { id: 'load',   device: abb, overrides: { pickup: 160, time: 0.1, instantaneous: 0 } },
      { id: 'source', device: abb, overrides: { pickup: 160, time: 0.5, instantaneous: 0 } }
    ];
    const { results } = greedyCoordinate(twoEntries, 1000, { margin: 0.3 });
    assert.strictEqual(results.length, 2);
  });

  it('returns 1 result for a single device (trivial)', () => {
    const single = [{ id: 'solo', device: abb, overrides: { pickup: 160, time: 0.5, instantaneous: 0 } }];
    const { results, allCoordinated } = greedyCoordinate(single, 1000, { margin: 0.3 });
    assert.strictEqual(results.length, 1);
    assert(typeof allCoordinated === 'boolean');
  });

  it('returns empty results for empty input', () => {
    const { results } = greedyCoordinate([], 20000, { margin: 0.3 });
    assert.strictEqual(results.length, 0);
  });

  it('applied time dials pass re-check for each successive pair', () => {
    const twoEntries = [
      { id: 'downstream', device: abb, overrides: { pickup: 160, time: 0.1, instantaneous: 0 } },
      { id: 'upstream',   device: abb, overrides: { pickup: 160, time: 0.2, instantaneous: 0 } }
    ];
    const { results } = greedyCoordinate(twoEntries, 1000, { margin: 0.3 });
    const faultCurrents = generateFaultCurrents(100, 700, 50);
    for (let i = 1; i < results.length; i += 1) {
      if (!results[i].found) continue;
      const upScaled = results[i].scaledResult;
      const dnScaled = results[i - 1].scaledResult;
      const check = checkCoordination(upScaled, dnScaled, faultCurrents, 0.3);
      assert.strictEqual(check.coordinated, true,
        `Pair (${results[i - 1].id}, ${results[i].id}) must be coordinated after greedy pass`);
    }
  });
});

console.log('\nAll tccAutoCoord tests completed.');
