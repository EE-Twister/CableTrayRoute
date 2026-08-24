import assert from 'node:assert/strict';
import { evaluateTimeCurrentCurve, normalizeTimeCurrentCurve } from '../analysis/timeCurrentCurve.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (error) { console.error('  \u2717', name, error); process.exitCode = 1; }
}

describe('time-current curve evaluation', () => {
  it('does not mutate the supplied curve while normalizing source points', () => {
    const curve = [{ current: 1000, time: 1 }, { current: 100, time: 10 }];
    const snapshot = structuredClone(curve);
    assert.deepEqual(normalizeTimeCurrentCurve(curve).map(({ current, time }) => ({ current, time })), [
      { current: 100, time: 10 },
      { current: 1000, time: 1 },
    ]);
    assert.deepEqual(curve, snapshot);
  });

  it('uses log-log interpolation between valid source coordinates', () => {
    const result = evaluateTimeCurrentCurve([
      { current: 100, time: 100 },
      { current: 1000, time: 1 },
    ], Math.sqrt(100 * 1000));
    assert.equal(result.status, 'interpolated');
    assert.ok(Math.abs(result.time - 10) < 1e-10);
  });

  it('rejects extrapolation by default and reports the source domain', () => {
    const result = evaluateTimeCurrentCurve([
      { current: 100, time: 10 },
      { current: 1000, time: 1 },
    ], 2000);
    assert.equal(result.status, 'above-domain');
    assert.equal(result.time, null);
    assert.deepEqual(result.domain, { minimumCurrent: 100, maximumCurrent: 1000 });
  });

  it('selects explicit lower or upper time at a duplicate-current boundary', () => {
    const vertical = [
      { current: 100, time: 600 },
      { current: 100, time: 40 },
      { current: 200, time: 10 },
    ];
    const lower = evaluateTimeCurrentCurve(vertical, 100, { boundary: 'lower' });
    const upper = evaluateTimeCurrentCurve(vertical, 100, { boundary: 'upper' });
    assert.equal(lower.status, 'duplicate-current-boundary');
    assert.equal(lower.time, 40);
    assert.equal(upper.time, 600);
  });

  it('enters the top and leaves the bottom of a vertical segment', () => {
    const curve = [
      { current: 100, time: 100 },
      { current: 200, time: 10 },
      { current: 200, time: 0.01 },
      { current: 1000, time: 0.01 },
    ];
    const beforePickup = evaluateTimeCurrentCurve(curve, 190, { boundary: 'lower' });
    const afterPickup = evaluateTimeCurrentCurve(curve, 210, { boundary: 'upper' });
    assert.ok(beforePickup.time > 10, `Expected long-time branch, got ${beforePickup.time}`);
    assert.ok(Math.abs(afterPickup.time - 0.01) < 1e-12);
  });

  it('retains a near-vertical segment instead of collapsing distinct currents', () => {
    const curve = [
      { current: 49.4486, time: 602.961 },
      { current: 49.6468, time: 39.7197 },
      { current: 60, time: 10 },
    ];
    const result = evaluateTimeCurrentCurve(curve, 49.55, { boundary: 'upper' });
    assert.equal(result.status, 'interpolated');
    assert.ok(result.time > 39.7197 && result.time < 602.961);
  });
});
