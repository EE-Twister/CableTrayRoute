import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRationalPhasorEnvelope, maximizeRationalPolynomialOnUnitInterval as maximize } from '../analysis/rationalPolynomialEnvelope.mjs';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} versus ${b}`);
function evaluated(input) {
  const copy = structuredClone(input);
  const result = maximize(input);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  assert.deepEqual(input, copy);
  return result;
}

test('monotone, zero and constant rational envelopes include both closed endpoints', () => {
  const increasing = evaluated({ numerator: [1, 2], denominator: [1], maximum: 4 });
  assert.equal(increasing.comparison, 'pass');
  assert.equal(increasing.maximum.position, 1);
  close(increasing.maximum.exposureLower, 3);
  close(increasing.maximum.exposureUpper, 3);
  assert.equal(increasing.stationaryRootCount, 0);
  for (const [numerator, denominator, expected] of [[[0], [1], 0], [[2, 4, 2], [1, 2, 1], 2]]) {
    const result = evaluated({ numerator, denominator, maximum: 3 });
    assert.equal(result.maximumIdentity, 'constant-over-full-interval');
    close(result.maximum.exposureLower, expected);
    close(result.maximum.exposureUpper, expected);
  }
});

test('the generic rational API encloses signed values with the correct rounding direction', () => {
  const result = evaluated({ numerator: [-2, 1], denominator: [1], maximum: 1 });
  assert.equal(result.comparison, 'pass');
  assert.equal(result.maximum.position, 1);
  assert.ok(result.maximum.exposureLower <= -1);
  assert.ok(result.maximum.exposureUpper >= -1);
});

test('a repeated interior stationary root is isolated once and exact endpoint roots are excluded from its count', () => {
  // 10 - (x - 1/2)^4 has a triple stationary root at 1/2.
  const repeated = evaluated({ numerator: [9.9375, 0.5, -1.5, 2, -1], denominator: [1], maximum: 10 });
  assert.equal(repeated.stationaryRootCount, 1);
  assert.equal(repeated.maximum.position, 0.5);
  close(repeated.maximum.exposureUpper, 10);
  // x^2 (1-x)^2 has stationary roots at 0, 1/2, 1.
  const endpoints = evaluated({ numerator: [0, 0, 1, -2, 1], denominator: [1], maximum: 0.0625 });
  assert.equal(endpoints.stationaryRootCount, 1);
  assert.equal(endpoints.maximum.position, 0.5);
  assert.equal(endpoints.comparison, 'pass');
});

test('equal distinct maxima remain explicit possible maxima rather than an invented unique position', () => {
  // 1 - [(x-1/4)(x-3/4)]^2 has equal maxima at 1/4 and 3/4.
  const result = evaluated({ numerator: [0.96484375, 0.375, -1.375, 2, -1], denominator: [1], maximum: 1 });
  assert.equal(result.stationaryRootCount, 3);
  assert.equal(result.maximumIdentity, 'overlapping-candidate-enclosures');
  assert.deepEqual(result.possibleMaxima.map(row => row.position).sort(), [0.25, 0.75]);
});

test('an irrational stationary location can be proven exactly equal to the supplied limit', () => {
  // 1 - (x^2 - 1/2)^2 reaches exactly one at sqrt(1/2).
  const result = evaluated({ numerator: [0.75, 0, 1, 0, -1], denominator: [1], maximum: 1 });
  assert.equal(result.comparison, 'pass');
  assert.equal(result.stationaryRootCount, 1);
  close(result.maximum.position, Math.sqrt(0.5), 1e-12);
  assert.ok(result.maximum.exposureLower <= 1 && result.maximum.exposureUpper >= 1);
  const failed = evaluated({ numerator: [0.75, 0, 1, 0, -1], denominator: [1], maximum: 1 - Number.EPSILON });
  assert.equal(failed.comparison, 'fail');
});

test('interior or endpoint denominator zeros block even when numerator cancellation would hide the pole', () => {
  for (const denominator of [[0.25, -1, 1], [0, 1], [1, -1], [0]]) {
    const result = maximize({ numerator: denominator, denominator, maximum: 2 });
    assert.equal(result.status, 'blocked');
    assert.equal(result.maximum, null);
    assert.equal(result.comparison, 'not-evaluated');
  }
});

test('a degree-six stationary polynomial retains all three distinct interior roots', () => {
  // Independent SymPy exact-integer Sturm oracle, 60-digit evaluation. The
  // rational model has roots near .248044, .506056 and .737747.
  const result = evaluated({ numerator: [247, 96, -352, 512, -256], denominator: [256, 1, -2, 1, 1], maximum: 1000 });
  assert.equal(result.stationaryPolynomialDegree, 6);
  assert.equal(result.stationaryRootCount, 3);
  close(result.maximum.position, 0.24804408373426326, 1e-12);
  close(result.maximum.exposureLower, 0.999436701055331844527490227375373847764044866098919979972981, 1e-10);
  close(result.maximum.exposureUpper, 0.999436701055331844527490227375373847764044866098919979972981, 1e-10);
});

test('closely spaced stationary roots exhaust the fixed isolation bound visibly', () => {
  const gap = 2 ** -140;
  const result = maximize({ numerator: [1, 0, -(gap ** 2), 2 * gap, -1], denominator: [1], maximum: 2 });
  assert.equal(result.status, 'blocked');
  assert.equal(result.issues[0].code, 'ROOT_ISOLATION_LIMIT');
  assert.equal(result.maximum, null);
});

test('piecewise-linear complex phasors combine before squaring and retain cancellation', () => {
  const result = evaluateRationalPhasorEnvelope({ denominator: [{ re: 1, im: 0 }], currentBaseA: 1000,
    knots: [{ timeS: 0, coefficients: [{ re: 2, im: 1 }] }, { timeS: 0.1, coefficients: [{ re: -2, im: -1 }] }, { timeS: 0.2, coefficients: [{ re: 0, im: 0 }] }], maximumExposureA2S: 400000 });
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  // Each interval integrates to .1*(5-5+5)/3 or .1*5/3 kA^2 s.
  close(result.maximum.exposureLower, 1e6 / 3);
  close(result.maximum.exposureUpper, 1e6 / 3);
  assert.equal(result.maximumIdentity, 'constant-over-full-interval');
});

test('the independent cross-cable counterexample fails at an interior location that endpoint and midpoint samples miss', () => {
  const c = (re, im = 0) => ({ re, im });
  const add = (a, b) => c(a.re + b.re, a.im + b.im);
  const sub = (a, b) => c(a.re - b.re, a.im - b.im);
  const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const e1 = c(265.5811238272279), e2 = c(-234.2272552616048, -148.11344602234817);
  const zs1 = c(0.0006817787428137423, 0.07606868291111757), zs2 = c(0.03544186792469067, 0.07035065044223082);
  const zb = c(0.0051, 0.00051), za = c(1.2105329770517606, 0.07771322815640931);
  const coefficients = [mul(e1, zs2), mul(za, sub(e1, e2))];
  const denominator = [mul(add(zs1, zb), zs2), mul(za, add(add(zs1, zb), zs2))];
  const allowable = (26240 * 0.0719) ** 2;
  const result = evaluateRationalPhasorEnvelope({ denominator, currentBaseA: 1, maximumExposureA2S: allowable,
    knots: [{ timeS: 0, coefficients }, { timeS: 0.25, coefficients }] });
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  assert.equal(result.comparison, 'fail');
  assert.equal(result.stationaryRootCount, 1);
  close(result.maximum.position, 0.031388224894248624, 1e-12);
  close(result.maximum.exposureLower, 3853249.467679375, 1e-10);
  close(result.maximum.exposureUpper, 3853249.467679375, 1e-10);
  assert.ok(result.maximum.exposureLower > allowable);
  for (const a of [0, 0.5, 1]) {
    const n = add(coefficients[0], c(coefficients[1].re * a, coefficients[1].im * a));
    const d = add(denominator[0], c(denominator[1].re * a, denominator[1].im * a));
    assert.ok((n.re ** 2 + n.im ** 2) / (d.re ** 2 + d.im ** 2) * 0.25 < allowable);
  }
});

test('invalid, nonfinite and oversized polynomial/history input cannot produce a numeric maximum', () => {
  for (const input of [
    { numerator: [], denominator: [1], maximum: 1 },
    { numerator: [1, 0, 0, 0, 0, 1], denominator: [1], maximum: 1 },
    { numerator: [Infinity], denominator: [1], maximum: 1 },
    { numerator: [1], denominator: [-1], maximum: 1 },
    { numerator: [1], denominator: [1], maximum: 0 },
  ]) assert.equal(maximize(input).status, 'blocked');
  const invalid = evaluateRationalPhasorEnvelope({ denominator: [{ re: 1, im: 0 }], currentBaseA: 1,
    knots: [{ timeS: 0, coefficients: [{ re: 1, im: 0 }] }, { timeS: 0, coefficients: [{ re: 1, im: 0 }] }], maximumExposureA2S: 1 });
  assert.equal(invalid.status, 'blocked');
});
