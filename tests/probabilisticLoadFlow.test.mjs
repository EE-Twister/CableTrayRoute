import assert from 'node:assert/strict';
import {
  VOLTAGE_HIGH_PU,
  VOLTAGE_LOW_PU,
  DEFAULT_SAMPLES,
  DEFAULT_SEED,
  MAX_SAMPLES,
  makeRng,
  sampleNormal,
  sampleUniform,
  sampleTriangular,
  sampleBeta,
  sampleEmpirical,
  sampleDistribution,
  percentile,
  summarizeStats,
  histogram,
  defaultLoadDist,
  defaultGenDist,
  runMonteCarloLoadFlow,
} from '../analysis/probabilisticLoadFlow.mjs';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);
const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
const stdev = arr => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
};

// 3-bus fixture reused across solver tests.
function fixtureModel() {
  return {
    buses: [
      { id: 'S', label: 'Slack', busType: 'slack', Vm: 1.0, Va: 0, baseKV: 13.8, load: { kw: 0, kvar: 0 }, generation: { kw: 999, kvar: 0 } },
      { id: 'A', label: 'BusA', busType: 'PQ', Vm: 1.0, Va: 0, baseKV: 13.8, load: { kw: 500, kvar: 100 }, generation: null,
        connections: [{ target: 'S', impedance: { r: 0.01, x: 0.05 } }] },
      { id: 'B', label: 'BusB', busType: 'PQ', Vm: 1.0, Va: 0, baseKV: 13.8, load: { kw: 300, kvar: 60 }, generation: null,
        connections: [{ target: 'A', impedance: { r: 0.01, x: 0.05 } }] },
    ],
    branches: [],
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.equal(VOLTAGE_HIGH_PU, 1.05);
  assert.equal(VOLTAGE_LOW_PU, 0.95);
  assert.ok(DEFAULT_SAMPLES > 0);
  assert.ok(DEFAULT_SEED > 0);
  assert.ok(MAX_SAMPLES >= DEFAULT_SAMPLES);
})();

// ---------------------------------------------------------------------------
// Seeded RNG reproducibility
// ---------------------------------------------------------------------------
(function testRng() {
  const r1 = makeRng(42);
  const r2 = makeRng(42);
  const r3 = makeRng(43);
  const a = Array.from({ length: 5 }, () => r1());
  const b = Array.from({ length: 5 }, () => r2());
  const c = Array.from({ length: 5 }, () => r3());
  assert.deepEqual(a, b, 'same seed → identical sequence');
  assert.notDeepEqual(a, c, 'different seed → different sequence');
  assert.ok(a.every(v => v >= 0 && v < 1), 'values in [0,1)');
})();

// ---------------------------------------------------------------------------
// Sampler correctness (mean/variance over a large sample)
// ---------------------------------------------------------------------------
(function testSamplers() {
  const N = 40000;
  const rng = makeRng(7);

  const normals = Array.from({ length: N }, () => sampleNormal(rng, 1.0, 0.1));
  approx(mean(normals), 1.0, 0.005, 'normal mean ≈ 1.0');
  approx(stdev(normals), 0.1, 0.005, 'normal sd ≈ 0.1');

  const unis = Array.from({ length: N }, () => sampleUniform(rng, 0.5, 1.5));
  approx(mean(unis), 1.0, 0.01, 'uniform mean ≈ midpoint');
  assert.ok(Math.min(...unis) >= 0.5 && Math.max(...unis) <= 1.5, 'uniform within bounds');

  const tris = Array.from({ length: N }, () => sampleTriangular(rng, 0, 0.5, 2));
  approx(mean(tris), (0 + 0.5 + 2) / 3, 0.02, 'triangular mean = (min+mode+max)/3');
  assert.ok(Math.min(...tris) >= 0 && Math.max(...tris) <= 2, 'triangular within bounds');

  // Beta(2,5) → mean a/(a+b) = 2/7 ≈ 0.2857, all values in [0,1]
  const betas = Array.from({ length: N }, () => sampleBeta(rng, 2, 5));
  approx(mean(betas), 2 / 7, 0.01, 'beta mean = a/(a+b)');
  assert.ok(betas.every(v => v >= 0 && v <= 1), 'beta values in [0,1]');

  // Empirical bootstrap stays within the provided set
  const pool = [0.2, 0.4, 0.6];
  const emp = Array.from({ length: 1000 }, () => sampleEmpirical(rng, pool));
  assert.ok(emp.every(v => pool.includes(v)), 'empirical only draws from the pool');
})();

// ---------------------------------------------------------------------------
// sampleDistribution dispatch + clamping
// ---------------------------------------------------------------------------
(function testSampleDistribution() {
  const rng = makeRng(99);
  assert.equal(sampleDistribution(rng, { type: 'constant', value: 1.0 }), 1.0, 'constant returns value');
  // Clamp a wide normal so it never goes negative
  const clamped = Array.from({ length: 5000 }, () =>
    sampleDistribution(rng, { type: 'normal', mean: 0.1, sd: 1.0, clampMin: 0 }));
  assert.ok(Math.min(...clamped) >= 0, 'clampMin enforced');
  const capped = Array.from({ length: 5000 }, () =>
    sampleDistribution(rng, { type: 'uniform', min: 0, max: 10, clampMax: 5 }));
  assert.ok(Math.max(...capped) <= 5, 'clampMax enforced');
})();

// ---------------------------------------------------------------------------
// percentile accuracy
// ---------------------------------------------------------------------------
(function testPercentile() {
  const sorted = Array.from({ length: 101 }, (_, i) => i); // 0..100
  approx(percentile(sorted, 0.0), 0, 1e-9, 'p0 = min');
  approx(percentile(sorted, 1.0), 100, 1e-9, 'p100 = max');
  approx(percentile(sorted, 0.5), 50, 1e-9, 'p50 = median');
  approx(percentile(sorted, 0.95), 95, 1e-9, 'p95 interpolation');
  // Interpolation between elements
  approx(percentile([10, 20], 0.5), 15, 1e-9, 'p50 of two-element array interpolates');
  assert.ok(Number.isNaN(percentile([], 0.5)), 'empty array → NaN');
})();

// ---------------------------------------------------------------------------
// summarizeStats + histogram
// ---------------------------------------------------------------------------
(function testStats() {
  const vals = [1, 2, 3, 4, 5];
  const s = summarizeStats(vals);
  assert.equal(s.count, 5);
  approx(s.mean, 3, 1e-9, 'mean');
  approx(s.min, 1, 1e-9, 'min');
  approx(s.max, 5, 1e-9, 'max');
  approx(s.p50, 3, 1e-9, 'median');

  const h = histogram(vals, 4);
  assert.equal(h.length, 4, 'four bins');
  assert.equal(h.reduce((sum, b) => sum + b.count, 0), 5, 'histogram counts sum to N');
  // Degenerate (all equal) → single bin
  const hSame = histogram([2, 2, 2], 10);
  assert.equal(hSame.length, 1, 'all-equal values → single bin');
  assert.equal(hSame[0].count, 3);
})();

// ---------------------------------------------------------------------------
// Default distributions
// ---------------------------------------------------------------------------
(function testDefaults() {
  const ld = defaultLoadDist();
  assert.equal(ld.type, 'normal');
  approx(ld.mean, 1.0, 1e-9, 'default load mean 1.0');
  assert.equal(ld.clampMin, 0, 'default load clamped ≥ 0');
  assert.equal(defaultGenDist().type, 'constant', 'default gen is deterministic');
})();

// ---------------------------------------------------------------------------
// End-to-end Monte Carlo on the 3-bus fixture
// ---------------------------------------------------------------------------
(function testRunMonteCarlo() {
  const r = runMonteCarloLoadFlow(fixtureModel(), { samples: 300, seed: 2024 }, { baseMVA: 100, balanced: true });
  assert.equal(r.sampleCount, 300, 'requested sample count');
  assert.ok(r.convergedCount > 0, 'scenarios converged');
  assert.ok(r.lossStats.mean >= 0, 'loss mean is non-negative');
  assert.ok(r.lossStats.p05 <= r.lossStats.p50 && r.lossStats.p50 <= r.lossStats.p95, 'loss percentiles ordered');
  assert.ok(r.minVoltageStats.mean > 0 && r.minVoltageStats.mean <= 1.0001, 'min-voltage mean in (0,1]');
  assert.ok(Array.isArray(r.busStats) && r.busStats.length >= 2, 'per-bus stats present');
  assert.ok(r.busStats.every(b => b.pUnder >= 0 && b.pUnder <= 1 && b.pOver >= 0 && b.pOver <= 1),
    'violation probabilities are valid fractions');
  assert.ok(r.probabilityOfViolation >= 0 && r.probabilityOfViolation <= 1, 'P(violation) is a fraction');
  assert.ok(r.lossHistogram.reduce((s, b) => s + b.count, 0) === r.convergedCount, 'loss histogram covers converged scenarios');

  // Load multiplier statistics track the input distribution (Normal(1,0.1))
  approx(r.loadScaleStats.mean, 1.0, 0.03, 'sampled load multiplier mean ≈ 1.0');
})();

// ---------------------------------------------------------------------------
// Reproducibility of the full run + sensitivity to seed
// ---------------------------------------------------------------------------
(function testRunReproducibility() {
  const cfg = { samples: 200, seed: 555 };
  const opts = { baseMVA: 100, balanced: true };
  const a = runMonteCarloLoadFlow(fixtureModel(), cfg, opts);
  const b = runMonteCarloLoadFlow(fixtureModel(), cfg, opts);
  approx(a.lossStats.mean, b.lossStats.mean, 1e-9, 'same seed → identical loss mean');
  approx(a.minVoltageStats.p05, b.minVoltageStats.p05, 1e-9, 'same seed → identical P5 voltage');
  assert.equal(a.convergedCount, b.convergedCount, 'same seed → identical convergence');

  const c = runMonteCarloLoadFlow(fixtureModel(), { samples: 200, seed: 9999 }, opts);
  // Different seed almost surely yields a different loss mean.
  assert.notEqual(a.lossStats.mean, c.lossStats.mean, 'different seed → different result');
})();

// ---------------------------------------------------------------------------
// High load variability raises violation probability
// ---------------------------------------------------------------------------
(function testViolationProbability() {
  // A wide, high-load distribution should drive undervoltage violations.
  const r = runMonteCarloLoadFlow(
    fixtureModel(),
    { samples: 500, seed: 314, loadDist: { type: 'normal', mean: 3.0, sd: 0.5, clampMin: 0 } },
    { baseMVA: 1, balanced: true }
  );
  assert.ok(r.probabilityOfViolation > 0, 'heavy loading produces voltage violations');
  assert.ok(r.warnings.some(w => /violation/i.test(w)), 'a violation warning is surfaced');
})();

// ---------------------------------------------------------------------------
// Empty model rejected
// ---------------------------------------------------------------------------
(function testEmptyModel() {
  assert.throws(
    () => runMonteCarloLoadFlow({ buses: [], branches: [] }, { samples: 10 }),
    /No load flow model available/,
    'empty model throws'
  );
})();

console.log('probabilisticLoadFlow.test.mjs — all assertions passed');
