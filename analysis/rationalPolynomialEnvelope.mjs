// Exact arithmetic certifies extrema of the supplied Float64 coefficient model.
// It does not turn approximate network coefficients into physical error bounds.
const METHOD = 'exact-dyadic-sturm-unit-interval-v1';
const MAX_BITS = 32768;
const MAX_BISECTIONS = 1024;
const MAX_DEPTH = 128;
const INITIAL_DEPTH = 40;
const view = new DataView(new ArrayBuffer(8));
const abs = n => n < 0n ? -n : n;
const trim = p => {
  while (p.length > 1 && p.at(-1) === 0n) p.pop();
  return p;
};
const zero = p => p.length === 1 && p[0] === 0n;
const bits = n => abs(n).toString(2).length;
function guard(p) {
  if (p.some(n => bits(n) > MAX_BITS)) throw new Error('POLYNOMIAL_COEFFICIENT_LIMIT');
  return p;
}
function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function primitive(p) {
  trim(p);
  const common = p.reduce((a, b) => gcd(a, b), 0n);
  return guard(common > 1n ? p.map(n => n / common) : p);
}
function dyadic(value) {
  if (!Number.isFinite(value)) throw new Error('NONFINITE_COEFFICIENT');
  if (value === 0) return { n: 0n, e: 0 };
  view.setFloat64(0, value, false);
  const word = view.getBigUint64(0, false);
  const exponent = Number((word >> 52n) & 2047n);
  const fraction = word & ((1n << 52n) - 1n);
  const n = exponent === 0 ? fraction : fraction + (1n << 52n);
  return { n: word >> 63n ? -n : n, e: exponent === 0 ? -1074 : exponent - 1075 };
}
function integers(values) {
  const parts = values.map(dyadic);
  const exponents = parts.filter(part => part.n !== 0n).map(part => part.e);
  const e = exponents.length ? Math.min(...exponents) : 0;
  return { values: guard(parts.map(part => part.n === 0n ? 0n : part.n << BigInt(part.e - e))), e };
}
function commonRatio(q, p, qe, pe) {
  const exponent = qe - pe;
  if (exponent > 0) q = q.map(n => n << BigInt(exponent));
  else if (exponent < 0) p = p.map(n => n << BigInt(-exponent));
  return { q: guard(trim(q)), p: guard(trim(p)) };
}
function derivative(p) { return trim(p.slice(1).map((n, i) => n * BigInt(i + 1)).concat(p.length === 1 ? [0n] : [])); }
function stationary(q, p) {
  const result = Array(q.length + p.length - 2 || 1).fill(0n);
  for (let i = 0; i < q.length; i += 1) for (let j = 0; j < p.length; j += 1) {
    if (i !== j) result[i + j - 1] += BigInt(i - j) * q[i] * p[j];
  }
  return primitive(result);
}
// Multiplication by |leading divisor| keeps every pseudo-remainder's scale
// positive. Dividing by a positive gcd also preserves Sturm variations.
function remainder(a, b) {
  let r = a.slice();
  while (!zero(r) && r.length >= b.length) {
    const shift = r.length - b.length;
    const leading = r.at(-1), divisor = b.at(-1);
    const sign = divisor < 0n ? -1n : 1n;
    r = r.map(n => n * abs(divisor));
    for (let i = 0; i < b.length; i += 1) r[i + shift] -= leading * sign * b[i];
    r = primitive(r);
  }
  return r;
}
function sturm(p) {
  const chain = [primitive(p.slice()), primitive(derivative(p))];
  if (zero(chain[1])) return chain.slice(0, 1);
  while (!zero(chain.at(-1))) {
    const next = remainder(chain.at(-2), chain.at(-1)).map(n => -n);
    if (zero(next)) break;
    chain.push(primitive(next));
    if (chain.length > 8) throw new Error('STURM_SEQUENCE_LIMIT');
  }
  return chain;
}
function polynomialGcd(a, b) {
  a = primitive(a.slice()); b = primitive(b.slice());
  while (!zero(b)) [a, b] = [b, remainder(a, b)];
  return primitive(a);
}
function at(p, n, d = 1n) {
  let result = p.at(-1), power = d;
  for (let i = p.length - 2; i >= 0; i -= 1) {
    result = result * n + p[i] * power;
    power *= d;
  }
  return result;
}
function variations(chain, n, d = 1n) {
  let prior = 0, count = 0;
  for (const p of chain) {
    const value = at(p, n, d);
    const sign = value > 0n ? 1 : value < 0n ? -1 : 0;
    if (sign !== 0) {
      if (prior && prior !== sign) count += 1;
      prior = sign;
    }
  }
  return count;
}
function removeEndpointRoots(p) {
  p = p.slice();
  while (p.length > 1 && p[0] === 0n) p.shift();
  while (p.length > 1 && at(p, 1n) === 0n) {
    const quotient = Array(p.length - 1).fill(0n);
    quotient[quotient.length - 1] = p.at(-1);
    for (let i = quotient.length - 2; i >= 0; i -= 1) quotient[i] = p[i + 1] + quotient[i + 1];
    p = quotient;
  }
  return primitive(p);
}
function split(interval, chain, work) {
  if (++work.bisections > MAX_BISECTIONS || interval.depth >= MAX_DEPTH) throw new Error('ROOT_ISOLATION_LIMIT');
  const depth = interval.depth + 1;
  const mid = interval.lo + interval.hi;
  const vm = variations(chain, mid, 1n << BigInt(depth));
  return [
    { lo: interval.lo * 2n, hi: mid, depth, vl: interval.vl, vh: vm },
    { lo: mid, hi: interval.hi * 2n, depth, vl: vm, vh: interval.vh },
  ];
}
function isolate(p, work) {
  const clean = removeEndpointRoots(p);
  if (clean.length === 1) return { roots: [], chain: sturm(clean), count: 0 };
  const chain = sturm(clean);
  const initial = { lo: 0n, hi: 1n, depth: 0, vl: variations(chain, 0n), vh: variations(chain, 1n) };
  const count = initial.vl - initial.vh;
  const queue = [initial], roots = [];
  while (queue.length) {
    const interval = queue.pop(), rootCount = interval.vl - interval.vh;
    if (rootCount < 0 || rootCount > clean.length - 1) throw new Error('ROOT_COUNT_INCONSISTENT');
    if (rootCount === 0) continue;
    if (rootCount === 1) {
      if (at(clean, interval.hi, 1n << BigInt(interval.depth)) === 0n) {
        roots.push({ ...interval, lo: interval.hi });
        continue;
      }
      const mid = interval.lo + interval.hi;
      if (at(clean, mid, 1n << BigInt(interval.depth + 1)) === 0n) {
        roots.push({ ...interval, lo: mid, hi: mid, depth: interval.depth + 1 });
        continue;
      }
      if (interval.depth >= INITIAL_DEPTH) { roots.push(interval); continue; }
    }
    queue.push(...split(interval, chain, work));
  }
  if (roots.length !== count) throw new Error('ROOT_COUNT_INCOMPLETE');
  return { roots, chain, count };
}
function polynomialBounds(p, interval) {
  const d = 1n << BigInt(interval.depth);
  let lo = p.at(-1), hi = lo, denominator = 1n;
  for (let i = p.length - 2; i >= 0; i -= 1) {
    const products = [lo * interval.lo, lo * interval.hi, hi * interval.lo, hi * interval.hi];
    denominator *= d;
    lo = products.reduce((a, b) => a < b ? a : b) + p[i] * denominator;
    hi = products.reduce((a, b) => a > b ? a : b) + p[i] * denominator;
  }
  return { lo, hi, denominator };
}
function bounds(q, p, interval) {
  const a = polynomialBounds(q, interval), b = polynomialBounds(p, interval);
  if (b.lo <= 0n) return null;
  return {
    lower: { n: a.lo * b.denominator, d: a.denominator * (a.lo < 0n ? b.lo : b.hi) },
    upper: { n: a.hi * b.denominator, d: a.denominator * (a.hi < 0n ? b.hi : b.lo) },
  };
}
const compare = (a, b) => a.n * b.d - b.n * a.d;
function toNumber(n, d) {
  if (n === 0n) return 0;
  const ns = Math.max(0, bits(n) - 53), ds = Math.max(0, bits(d) - 53);
  const result = Number(n >> BigInt(ns)) / Number(d >> BigInt(ds)) * 2 ** (ns - ds);
  if (!Number.isFinite(result) || (n !== 0n && result === 0)) throw new Error('ENVELOPE_NUMERIC_RANGE');
  return result;
}
function outward(value, up) {
  for (let i = 0; i < 4; i += 1) {
    if (value === 0) value = up ? Number.MIN_VALUE : -Number.MIN_VALUE;
    else {
      view.setFloat64(0, value, false);
      const word = view.getBigUint64(0, false);
      view.setBigUint64(0, (value > 0) === up ? word + 1n : word - 1n, false);
      value = view.getFloat64(0, false);
    }
    if (!Number.isFinite(value)) throw new Error('ENVELOPE_NUMERIC_RANGE');
  }
  return value;
}
function expose(candidate) {
  const { interval, enclosure } = candidate;
  const d = 1n << BigInt(interval.depth);
  const endpointPoint = interval.lo === interval.hi && (interval.lo === 0n || interval.lo === d);
  return {
    position: toNumber(interval.lo + interval.hi, 2n * d),
    positionInterval: endpointPoint ? [Number(interval.lo === d), Number(interval.lo === d)]
      : [interval.lo === 0n ? 0 : Math.max(0, outward(toNumber(interval.lo, d), false)), interval.hi === d ? 1 : Math.min(1, outward(toNumber(interval.hi, d), true))],
    positionIntervalDyadic: { lowerNumerator: String(interval.lo), upperNumerator: String(interval.hi), denominatorPowerOfTwo: interval.depth },
    exposureLower: enclosure.lower.n === 0n ? 0 : outward(toNumber(enclosure.lower.n, enclosure.lower.d), false),
    exposureUpper: enclosure.upper.n === 0n ? 0 : outward(toNumber(enclosure.upper.n, enclosure.upper.d), true),
  };
}
function solve(q, p, maximum) {
  guard(q); guard(p);
  if (q.length > 5 || p.length > 5 || !(maximum > 0) || !Number.isFinite(maximum)) throw new Error('ENVELOPE_INPUT_LIMIT');
  const work = { bisections: 0 };
  if (at(p, 0n) <= 0n || at(p, 1n) <= 0n) throw new Error('DENOMINATOR_NOT_POSITIVE');
  const denominatorChain = sturm(p);
  if (variations(denominatorChain, 0n) - variations(denominatorChain, 1n) !== 0) throw new Error('DENOMINATOR_ROOT');
  const slope = stationary(q, p);
  if (slope.length > 7) throw new Error('STATIONARY_DEGREE_LIMIT');
  const isolated = isolate(slope, work);
  const limitPart = dyadic(maximum);
  const limit = limitPart.e >= 0 ? { n: limitPart.n << BigInt(limitPart.e), d: 1n } : { n: limitPart.n, d: 1n << BigInt(-limitPart.e) };
  const intervals = zero(slope) ? [{ lo: 0n, hi: 0n, depth: 0 }]
    : [{ lo: 0n, hi: 0n, depth: 0 }, ...isolated.roots, { lo: 1n, hi: 1n, depth: 0 }];
  const candidates = [];
  let levelRootChain;
  for (let interval of intervals) {
    let enclosure;
    while (true) {
      enclosure = bounds(q, p, interval);
      if (enclosure && (compare(enclosure.upper, limit) <= 0n || compare(enclosure.lower, limit) > 0n)) break;
      if (interval.lo === interval.hi) throw new Error('ENVELOPE_UNRESOLVED_COMPARISON');
      // An irrational stationary point can have an exactly rational extremum.
      // Prove equality through a common root instead of refining indefinitely.
      if (!levelRootChain) {
        const level = Array(Math.max(q.length, p.length)).fill(0n).map((_, i) => (q[i] || 0n) * limit.d - (p[i] || 0n) * limit.n);
        levelRootChain = sturm(polynomialGcd(slope, primitive(level)));
      }
      const d = 1n << BigInt(interval.depth);
      if (variations(levelRootChain, interval.lo, d) - variations(levelRootChain, interval.hi, d) === 1) {
        enclosure = { lower: limit, upper: limit };
        break;
      }
      const children = split(interval, isolated.chain, work);
      interval = children.find(child => child.vl - child.vh === 1);
      if (!interval) throw new Error('ROOT_COUNT_INCONSISTENT');
    }
    candidates.push({ interval, enclosure });
  }
  const largestLower = candidates.reduce((a, b) => compare(a.enclosure.lower, b.enclosure.lower) >= 0n ? a : b).enclosure.lower;
  const possibleMaxima = candidates.filter(candidate => compare(candidate.enclosure.upper, largestLower) >= 0n);
  const worst = possibleMaxima.reduce((a, b) => compare(a.enclosure.upper, b.enclosure.upper) >= 0n ? a : b);
  return {
    status: 'evaluated', method: METHOD, modelBasis: 'exact-rational-analysis-of-supplied-float64-coefficients',
    comparison: candidates.some(candidate => compare(candidate.enclosure.lower, limit) > 0n) ? 'fail' : 'pass',
    maximum: expose(worst), possibleMaxima: possibleMaxima.map(expose),
    maximumIdentity: zero(slope) ? 'constant-over-full-interval' : possibleMaxima.length === 1 ? 'single-enclosed-candidate' : 'overlapping-candidate-enclosures',
    stationaryPolynomialDegree: slope.length - 1, stationaryRootCount: isolated.count, denominatorRootCount: 0,
    bisections: work.bisections, issues: [],
  };
}
function blocked(error) {
  return { status: 'blocked', method: METHOD, comparison: 'not-evaluated', maximum: null, issues: [{ code: error.message || 'ENVELOPE_INVALID', message: 'Continuous extrema could not be completely established within the exact polynomial work bounds.' }] };
}

/** Maximize Q/P for Float64 coefficients, ascending powers, over closed [0,1]. */
export function maximizeRationalPolynomialOnUnitInterval({ numerator, denominator, maximum } = {}) {
  try {
    if (!Array.isArray(numerator) || !Array.isArray(denominator) || !numerator.length || !denominator.length || numerator.length > 5 || denominator.length > 5) throw new Error('ENVELOPE_INPUT_LIMIT');
    const q = integers(numerator), p = integers(denominator);
    const aligned = commonRatio(q.values, p.values, q.e, p.e);
    return solve(aligned.q, aligned.p, maximum);
  } catch (error) { return blocked(error); }
}

function product(a, b) {
  const p = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) p[i + j] += a[i] * b[j];
  return p;
}
/** Integrate |N(alpha,t)/D(alpha)|² exactly over linear phasor knots, then maximize. */
export function evaluateRationalPhasorEnvelope({ denominator, knots, currentBaseA, maximumExposureA2S } = {}) {
  try {
    const isPhasor = row => row && typeof row === 'object' && Number.isFinite(row.re) && Number.isFinite(row.im);
    if (!Array.isArray(denominator) || !denominator.length || denominator.length > 3 || !denominator.every(isPhasor)
      || !Array.isArray(knots) || knots.length < 2 || knots.length > 64 || knots[0]?.timeS !== 0
      || !knots.every((row, i) => Number.isFinite(row?.timeS) && (i === 0 || row.timeS > knots[i - 1].timeS)
        && Array.isArray(row.coefficients) && row.coefficients.length >= 1 && row.coefficients.length <= 3 && row.coefficients.every(isPhasor))
      || !(currentBaseA > 0) || !Number.isFinite(currentBaseA)) throw new Error('ENVELOPE_INPUT_LIMIT');
    const dParts = integers(denominator.flatMap(row => [row.re, row.im]));
    const dReal = denominator.map((_, i) => dParts.values[2 * i]), dImag = denominator.map((_, i) => dParts.values[2 * i + 1]);
    const pReal = product(dReal, dReal), pImag = product(dImag, dImag);
    const p = pReal.map((n, i) => n + pImag[i]);
    const nParts = integers(knots.flatMap(row => row.coefficients.flatMap(value => [value.re, value.im])));
    let offset = 0;
    const numeratorRows = knots.map(row => {
      const real = [], imaginary = [];
      for (let i = 0; i < row.coefficients.length; i += 1) { real.push(nParts.values[offset++]); imaginary.push(nParts.values[offset++]); }
      return { real, imaginary };
    });
    const times = integers(knots.map(row => row.timeS));
    const dtParts = { values: times.values.slice(1).map((n, i) => n - times.values[i]), e: times.e };
    const q = Array(5).fill(0n);
    for (let i = 1; i < knots.length; i += 1) {
      const left = numeratorRows[i - 1], right = numeratorRows[i];
      for (const component of ['real', 'imaginary']) {
        for (const term of [product(left[component], left[component]), product(left[component], right[component]), product(right[component], right[component])]) {
          term.forEach((n, power) => { q[power] += n * dtParts.values[i - 1]; });
        }
      }
    }
    const base = dyadic(currentBaseA);
    const aligned = commonRatio(q.map(n => n * base.n * base.n), p.map(n => n * 3n), 2 * nParts.e + dtParts.e + 2 * base.e, 2 * dParts.e);
    return solve(aligned.q, aligned.p, maximumExposureA2S);
  } catch (error) { return blocked(error); }
}
