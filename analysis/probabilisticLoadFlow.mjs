/**
 * Probabilistic / Monte Carlo Load Flow (Gap #98)
 *
 * Wraps the existing Newton-Raphson load-flow solver in a Monte Carlo loop.
 * Each scenario samples a stochastic system load multiplier and a stochastic
 * generation (e.g. renewable capacity-factor) multiplier from user-defined
 * probability distributions, runs a single AC load flow, and records the
 * operating point. Aggregating many scenarios yields probability statistics
 * for system losses and bus voltages — percentiles, histograms, and the
 * probability of a voltage-limit violation.
 *
 * Method:
 *   For each of N scenarios (driven by a seeded RNG for reproducibility):
 *     1. loadScale  ~ loadDist     (e.g. Normal(1.0, 0.1))
 *     2. genScale   ~ genDist      (e.g. Beta(a,b) capacity factor on [0,1])
 *     3. Scale every bus Pd/Qd by loadScale and Pg/Qg by genScale
 *     4. Solve one AC load flow
 *     5. Record total loss, min/max bus voltage, per-bus voltage, violations
 *   Post-process: mean/std/percentile statistics, histograms, P(violation).
 *
 * Voltage limits (ANSI C84.1 Range A): 0.95–1.05 pu.
 *
 * References:
 *   IEEE Std 399-1997 (Brown Book) §14 — Load Flow.
 *   Borkowska, B. (1974), "Probabilistic Load Flow", IEEE Trans. PAS-93.
 *   Allan, Borkowska & Grigg (1974), "Probabilistic analysis of power flows".
 */

import { runLoadFlow } from './loadFlow.js';
import { buildLoadFlowModel } from './loadFlowModel.js';
import { getOneLine } from '../dataStore.mjs';

/** ANSI C84.1 Range A upper voltage limit (pu). */
export const VOLTAGE_HIGH_PU = 1.05;
/** ANSI C84.1 Range A lower voltage limit (pu). */
export const VOLTAGE_LOW_PU = 0.95;
/** Default number of Monte Carlo scenarios. */
export const DEFAULT_SAMPLES = 1000;
/** Default RNG seed for reproducible runs. */
export const DEFAULT_SEED = 12345;
/** Maximum scenarios allowed (guards against runaway browser loops). */
export const MAX_SAMPLES = 20000;

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic for a given integer seed
// ---------------------------------------------------------------------------

/**
 * Create a seeded pseudo-random generator returning floats in [0, 1).
 * Same seed → identical sequence (required for reproducible studies).
 * @param {number} seed
 * @returns {() => number}
 */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Distribution samplers
// ---------------------------------------------------------------------------

/** Standard normal via Box–Muller. */
function sampleStdNormal(rng) {
  let u1 = rng();
  const u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Normal(mean, sd). */
export function sampleNormal(rng, mean, sd) {
  return mean + sd * sampleStdNormal(rng);
}

/** Uniform(min, max). */
export function sampleUniform(rng, min, max) {
  return min + rng() * (max - min);
}

/** Triangular(min, mode, max) via inverse CDF. */
export function sampleTriangular(rng, min, mode, max) {
  const u = rng();
  const fc = max > min ? (mode - min) / (max - min) : 0;
  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/** Gamma(shape, 1) via Marsaglia–Tsang. */
function sampleGamma(rng, shape) {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(rng, shape + 1) * Math.pow(u <= 0 ? 1e-12 : u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Bounded loop: acceptance probability is high; cap iterations defensively.
  for (let i = 0; i < 1000; i++) {
    let x, v;
    do {
      x = sampleStdNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // fallback ≈ mean of the boosted gamma
}

/** Beta(alpha, beta) on [0, 1] via the ratio of two gamma variates. */
export function sampleBeta(rng, alpha, beta) {
  const ga = sampleGamma(rng, alpha);
  const gb = sampleGamma(rng, beta);
  const denom = ga + gb;
  return denom > 0 ? ga / denom : 0.5;
}

/** Empirical: bootstrap a value uniformly from the supplied sample array. */
export function sampleEmpirical(rng, values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values[Math.floor(rng() * values.length)];
}

/**
 * Sample one value from a distribution descriptor, applying optional
 * clampMin/clampMax bounds afterward.
 *
 * @param {() => number} rng
 * @param {Object} dist - { type, mean, sd, min, max, mode, alpha, beta, values, clampMin, clampMax }
 * @returns {number}
 */
export function sampleDistribution(rng, dist) {
  if (!dist || typeof dist !== 'object') return 1;
  let v;
  switch (dist.type) {
    case 'constant':    v = dist.value ?? dist.mean ?? 1; break;
    case 'normal':      v = sampleNormal(rng, dist.mean ?? 1, dist.sd ?? 0); break;
    case 'uniform':     v = sampleUniform(rng, dist.min ?? 0, dist.max ?? 1); break;
    case 'triangular':  v = sampleTriangular(rng, dist.min ?? 0, dist.mode ?? 0.5, dist.max ?? 1); break;
    case 'beta':        v = sampleBeta(rng, dist.alpha ?? 2, dist.beta ?? 2); break;
    case 'empirical':   v = sampleEmpirical(rng, dist.values); break;
    default:            v = dist.mean ?? 1;
  }
  if (Number.isFinite(dist.clampMin) && v < dist.clampMin) v = dist.clampMin;
  if (Number.isFinite(dist.clampMax) && v > dist.clampMax) v = dist.clampMax;
  return v;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

/**
 * Linear-interpolated percentile of a pre-sorted ascending array.
 * @param {number[]} sorted
 * @param {number} p - Fraction in [0, 1]
 * @returns {number}
 */
export function percentile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Summary statistics for a sample array.
 * @param {number[]} values
 * @returns {{count:number, mean:number, std:number, min:number, max:number, p05:number, p50:number, p95:number}}
 */
export function summarizeStats(values) {
  const count = values.length;
  if (count === 0) {
    return { count: 0, mean: NaN, std: NaN, min: NaN, max: NaN, p05: NaN, p50: NaN, p95: NaN };
  }
  const mean = values.reduce((s, v) => s + v, 0) / count;
  const variance = count > 1
    ? values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (count - 1)
    : 0;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count,
    mean,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[count - 1],
    p05: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
  };
}

/**
 * Build an equal-width histogram.
 * @param {number[]} values
 * @param {number} [bins=20]
 * @returns {Array<{x0:number, x1:number, count:number}>}
 */
export function histogram(values, bins = 20) {
  if (values.length === 0 || bins < 1) return [];
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return [{ x0: min, x1: max, count: values.length }];
  }
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Model scaling (mirrors the quasi-dynamic uniform-scaling approach)
// ---------------------------------------------------------------------------

function scaledLoad(load, s) {
  if (!load || typeof load !== 'object') return load;
  const out = { ...load };
  if (Number.isFinite(out.kw)) out.kw *= s;
  if (Number.isFinite(out.kvar)) out.kvar *= s;
  if (out.A) out.A = { ...out.A, kw: (out.A.kw ?? 0) * s, kvar: (out.A.kvar ?? 0) * s };
  if (out.B) out.B = { ...out.B, kw: (out.B.kw ?? 0) * s, kvar: (out.B.kvar ?? 0) * s };
  if (out.C) out.C = { ...out.C, kw: (out.C.kw ?? 0) * s, kvar: (out.C.kvar ?? 0) * s };
  return out;
}

function scaledGen(gen, s) {
  if (!gen || typeof gen !== 'object') return gen;
  const out = { ...gen };
  if (Number.isFinite(out.kw)) out.kw *= s;
  if (Number.isFinite(out.kvar)) out.kvar *= s;
  return out;
}

function applyScaling(baseModel, loadScale, genScale) {
  const buses = baseModel.buses.map(bus => ({
    ...bus,
    load: scaledLoad(bus.load, loadScale),
    generation: scaledGen(bus.generation, genScale),
  }));
  return { buses, branches: baseModel.branches };
}

// ---------------------------------------------------------------------------
// Default input distributions
// ---------------------------------------------------------------------------

/** Default load multiplier distribution: Normal(1.0, 0.10), clamped ≥ 0. */
export function defaultLoadDist() {
  return { type: 'normal', mean: 1.0, sd: 0.10, clampMin: 0 };
}

/** Default generation multiplier distribution: constant 1.0 (deterministic). */
export function defaultGenDist() {
  return { type: 'constant', value: 1.0 };
}

// ---------------------------------------------------------------------------
// Main Monte Carlo runner
// ---------------------------------------------------------------------------

/**
 * Run a Monte Carlo / probabilistic load flow.
 *
 * @param {Object|null} baseModel - {buses, branches}; null derives from dataStore one-line.
 * @param {Object} [config]
 * @param {number} [config.samples=DEFAULT_SAMPLES]
 * @param {number} [config.seed=DEFAULT_SEED]
 * @param {Object} [config.loadDist] - Load multiplier distribution.
 * @param {Object} [config.genDist]  - Generation multiplier distribution.
 * @param {number} [config.bins=20]  - Histogram bin count.
 * @param {Object} [opts] - Forwarded to runLoadFlow (baseMVA, balanced, maxIterations).
 * @returns {MonteCarloResult}
 */
export function runMonteCarloLoadFlow(baseModel, config = {}, opts = {}) {
  const samples = Math.max(1, Math.min(MAX_SAMPLES, Math.floor(config.samples ?? DEFAULT_SAMPLES)));
  const seed = Number.isFinite(config.seed) ? config.seed : DEFAULT_SEED;
  const loadDist = config.loadDist || defaultLoadDist();
  const genDist = config.genDist || defaultGenDist();
  const bins = Math.max(1, Math.floor(config.bins ?? 20));

  const model = baseModel || buildLoadFlowModel(getOneLine());
  if (!model || !Array.isArray(model.buses) || model.buses.length === 0) {
    throw new Error(
      'No load flow model available. Open a project with a one-line diagram first, ' +
      'or provide a baseModel directly.'
    );
  }

  const rng = makeRng(seed);

  // Per-scenario metric accumulators
  const lossValues = [];
  const minVmValues = [];
  const maxVmValues = [];
  const loadScaleValues = [];
  const genScaleValues = [];
  let convergedCount = 0;
  let violationScenarioCount = 0;

  // Per-bus voltage accumulators
  const busVm = {};   // id -> number[]
  const busLabel = {};

  for (let s = 0; s < samples; s++) {
    const loadScale = sampleDistribution(rng, loadDist);
    const genScale = sampleDistribution(rng, genDist);
    loadScaleValues.push(loadScale);
    genScaleValues.push(genScale);

    const m = applyScaling(model, loadScale, genScale);

    let lf;
    let converged = false;
    try {
      lf = runLoadFlow(m, opts);
      converged = lf.converged !== false;
    } catch (_) {
      converged = false;
    }
    if (!converged) continue;
    convergedCount++;

    const lfBuses = Array.isArray(lf.buses) ? lf.buses : [];
    const lossKw = lf.summary?.totalLossKW ?? 0;
    lossValues.push(lossKw);

    let minVm = Infinity, maxVm = -Infinity;
    let scenarioViolation = false;
    for (const b of lfBuses) {
      const vm = Number.isFinite(b.Vm) ? b.Vm : 1.0;
      const id = b.id;
      if (!busVm[id]) { busVm[id] = []; busLabel[id] = b.label || b.name || b.ref || id; }
      busVm[id].push(vm);
      if (vm < minVm) minVm = vm;
      if (vm > maxVm) maxVm = vm;
      if (vm < VOLTAGE_LOW_PU || vm > VOLTAGE_HIGH_PU) scenarioViolation = true;
    }
    if (Number.isFinite(minVm)) minVmValues.push(minVm);
    if (Number.isFinite(maxVm)) maxVmValues.push(maxVm);
    if (scenarioViolation) violationScenarioCount++;
  }

  // Per-bus statistics with violation probabilities
  const busStats = Object.keys(busVm).map(id => {
    const arr = busVm[id];
    const stats = summarizeStats(arr);
    const under = arr.filter(v => v < VOLTAGE_LOW_PU).length;
    const over = arr.filter(v => v > VOLTAGE_HIGH_PU).length;
    return {
      id,
      label: busLabel[id] || id,
      ...stats,
      pUnder: arr.length ? under / arr.length : 0,
      pOver: arr.length ? over / arr.length : 0,
    };
  });

  const probabilityOfViolation = convergedCount > 0 ? violationScenarioCount / convergedCount : 0;

  const warnings = [];
  const diverged = samples - convergedCount;
  if (diverged > 0) {
    warnings.push(`${diverged} of ${samples} scenarios did not converge and were excluded from the statistics.`);
  }
  if (convergedCount === 0) {
    warnings.push('No scenarios converged — check the base model, source, and impedance data.');
  }
  if (probabilityOfViolation > 0) {
    warnings.push(`P(any bus outside 0.95–1.05 pu) = ${(probabilityOfViolation * 100).toFixed(1)}% across converged scenarios.`);
  }
  const worstBus = busStats.reduce((w, b) => {
    const risk = Math.max(b.pUnder, b.pOver);
    return risk > w.risk ? { id: b.id, label: b.label, risk } : w;
  }, { risk: 0 });
  if (worstBus.risk > 0) {
    warnings.push(`Highest-risk bus: ${worstBus.label} with ${(worstBus.risk * 100).toFixed(1)}% probability of a voltage violation.`);
  }

  return {
    inputs: { samples, seed, loadDist, genDist, bins, opts },
    sampleCount: samples,
    convergedCount,
    lossStats: summarizeStats(lossValues),
    minVoltageStats: summarizeStats(minVmValues),
    maxVoltageStats: summarizeStats(maxVmValues),
    loadScaleStats: summarizeStats(loadScaleValues),
    genScaleStats: summarizeStats(genScaleValues),
    lossHistogram: histogram(lossValues, bins),
    minVoltageHistogram: histogram(minVmValues, bins),
    busStats,
    probabilityOfViolation,
    violationScenarioCount,
    warnings,
  };
}
