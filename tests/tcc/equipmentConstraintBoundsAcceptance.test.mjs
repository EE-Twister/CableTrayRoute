import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDamageLimitConstraint, evaluateRideThroughConstraint } from '../../analysis/tcc/equipmentConstraintModel.mjs';

const curve = (time, from = 100, to = 1000) => [{ current: from, time }, { current: to, time }];
const entry = (minimum = curve(0.2), upperProtectiveCurve = curve(0.5)) => ({
  selection: { uid: 'component:CB-1', kind: 'component', componentId: 'CB-1', baseDevice: { type: 'breaker' } },
  scaled: { curve: minimum, minCurve: minimum, maxCurve: upperProtectiveCurve },
});
const close = (a, b, tolerance = 1e-10) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} versus ${b}`);
const unknown = result => {
  assert.ok(result);
  assert.equal(result.status, 'review');
  assert.equal(result.screeningStatus, 'unknown');
  assert.equal(result.tripTime, null);
  assert.equal(result.margin, null);
};

test('currents outside a documented curve domain cannot inherit its endpoint time as a protection pass', () => {
  for (const current of [50, 1500]) {
    unknown(evaluateRideThroughConstraint({ kind: 'motorStart', lockedRotor: current, startTime: 0.1 }, entry()));
    unknown(evaluateDamageLimitConstraint({ kind: 'cable', curve: curve(1, current, current * 1.1) }, entry()));
  }
});

test('damage uses the upper protective curve value at a vertical boundary', () => {
  const upperProtectiveCurve = [{ current: 100, time: 2 }, { current: 500, time: 1 }, { current: 500, time: 0.2 }, { current: 1000, time: 0.1 }];
  const result = evaluateDamageLimitConstraint({ kind: 'cable', curve: curve(0.4, 500, 1000) }, entry(curve(0.1), upperProtectiveCurve));
  assert.equal(result.status, 'warning');
  close(result.tripTime, 1);
  close(result.margin, -0.6);
  close(result.point.current, 500);
});

test('ride-through uses earliest trip at pickup but does not move that instantaneous value below pickup', () => {
  const minimum = [{ current: 100, time: 10 }, { current: 500, time: 4 }, { current: 500, time: 0.25 }, { current: 1000, time: 0.1 }];
  const at = evaluateRideThroughConstraint({ kind: 'motorStart', lockedRotor: 500, startTime: 0.5 }, entry(minimum));
  assert.equal(at.status, 'warning');
  close(at.tripTime, 0.25);
  close(at.margin, -0.25);
  const below = evaluateRideThroughConstraint({ kind: 'motorStart', lockedRotor: 499, startTime: 0.5 }, entry(minimum));
  assert.equal(below.status, 'ok');
  assert.ok(below.tripTime > 4);
});

test('a protective curve knot inside a damage interval cannot be skipped', () => {
  const maximum = [{ current: 100, time: 0.2 }, { current: 300, time: 2 }, { current: 1000, time: 0.2 }];
  const result = evaluateDamageLimitConstraint({ kind: 'cable', curve: curve(1) }, entry(curve(0.1), maximum));
  assert.equal(result.status, 'warning');
  close(result.point.current, 300);
  close(result.point.time, 1);
  close(result.tripTime, 2);
  close(result.margin, -1);
});

test('the limiting difference of two log-log power segments is independently derived, including an interior stationary point', () => {
  // x = I/100. Damage = 4/x², protective upper curve = 4/x. Their difference has
  // derivative -8/x³ + 4/x² = 0 at x = 2, giving -1 s at I = 200 A.
  const upperProtectiveCurve = [{ current: 100, time: 4 }, { current: 1000, time: 0.4 }];
  const damage = [{ current: 100, time: 4 }, { current: 1000, time: 0.04 }];
  const result = evaluateDamageLimitConstraint({ kind: 'cable', curve: damage }, entry(curve(0.1), upperProtectiveCurve));
  assert.equal(result.status, 'warning');
  close(result.point.current, 200, 1e-8);
  close(result.point.time, 1, 1e-8);
  close(result.tripTime, 2, 1e-8);
  close(result.margin, -1, 1e-8);
});

test('invalid interior data cannot silently disappear to create a passing interpolation segment', () => {
  for (const invalid of [null, { current: 400, time: Number.NaN }, { current: 400, time: 0 }, { current: -1, time: 1 }]) {
    unknown(evaluateDamageLimitConstraint({ kind: 'cable', curve: [...curve(1), invalid] }, entry()));
    const invalidCurve = [...curve(0.1), invalid];
    unknown(evaluateRideThroughConstraint({ kind: 'motorStart', lockedRotor: 500, startTime: 0.01 }, entry(invalidCurve)));
  }
});

test('complete damage-domain coverage is required; a passing overlap is insufficient', () => {
  unknown(evaluateDamageLimitConstraint({ kind: 'motorThermal', curve: curve(10, 50, 2000) }, entry()));
  const result = evaluateDamageLimitConstraint({ kind: 'motorThermal', curve: curve(10, 150, 900) }, entry());
  assert.equal(result.status, 'ok');
  assert.equal(result.coverage.status, 'complete');
  close(result.margin, 9.5);
});

test('continuous minima agree with independently normalized power-law derivatives across varied slopes and scales', () => {
  for (const p of [-3, -2, -1, 0, 1, 2, 3]) {
    for (const q of [-3, -2, -1, 0, 1, 2, 3]) {
      for (const [a, b] of [[0.3, 2], [4, 4], [10, 0.2]]) {
        const candidates = [1, 10];
        const ratio = b * q / (a * p);
        if (p !== q && Number.isFinite(ratio) && ratio > 0) {
          const critical = ratio ** (1 / (p - q));
          if (critical > 1 && critical < 10) candidates.push(critical);
        }
        const expected = Math.min(...candidates.map(x => a * x ** p - b * x ** q));
        const damage = [{ current: 100, time: a }, { current: 1000, time: a * 10 ** p }];
        const upperProtectiveCurve = [{ current: 100, time: b }, { current: 1000, time: b * 10 ** q }];
        const actual = evaluateDamageLimitConstraint({ kind: 'cable', curve: damage }, entry(curve(0.1), upperProtectiveCurve));
        assert.equal(actual.screeningStatus, 'evaluated', JSON.stringify({ p, q, a, b, actual }));
        close(actual.margin, expected, 1e-9);
        assert.equal(actual.status, expected >= 0 ? 'ok' : 'warning');
      }
    }
  }
});
