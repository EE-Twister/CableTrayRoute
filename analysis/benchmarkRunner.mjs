/**
 * Trust Center — Benchmark Runner
 *
 * Executes benchmark definitions from benchmarkLibrary.mjs, evaluates each
 * check, and returns structured pass/fail results for display in the Trust
 * Center UI.
 */

import { BENCHMARKS } from './benchmarkLibrary.mjs';

/**
 * Run a single benchmark and return its result.
 *
 * @param {object} bm  A benchmark definition from BENCHMARKS.
 * @returns {{
 *   id: string,
 *   label: string,
 *   studyType: string,
 *   standardRef: string,
 *   description: string,
 *   pass: boolean,
 *   error: string|null,
 *   checks: Array<{
 *     key: string,
 *     description: string,
 *     expectedVal: *,
 *     actualVal: *,
 *     tolerance: number,
 *     deviation: number|null,
 *     pass: boolean
 *   }>
 * }}
 */
export function runBenchmark(bm) {
  let actual = {};
  let error = null;

  try {
    actual = bm.run();
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      throw new Error('Benchmark returned an invalid result object.');
    }
  } catch (err) {
    actual = {};
    error = err.message || String(err);
  }

  const checks = Array.isArray(bm.checks) ? bm.checks.map(check => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
      return { key: null, description: '', expectedVal: null, actualVal: undefined, tolerance: null, deviation: null, pass: false };
    }
    const {
      key,
      description,
      expectedVal,
      tolerance = 0,
      type = 'numeric',
      unit = null,
      toleranceBasis = null,
    } = check;
    const actualVal = actual[key];
    const invalidCheck = !['numeric', 'boolean'].includes(type)
      || typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0;

    let deviation = null;
    let pass = false;

    if (error !== null || invalidCheck) {
      pass = false;
      deviation = null;
    } else if (type === 'boolean') {
      pass = Object.prototype.hasOwnProperty.call(actual, key)
        && typeof actualVal === 'boolean'
        && typeof expectedVal === 'boolean'
        && actualVal === expectedVal;
      deviation = pass ? 0 : 1;
    } else {
      const a = actualVal;
      const e = expectedVal;
      if (!Object.prototype.hasOwnProperty.call(actual, key)
        || typeof a !== 'number' || typeof e !== 'number'
        || !Number.isFinite(a) || !Number.isFinite(e)) {
        pass = false;
        deviation = null;
      } else {
        deviation = a - e;
        pass = Math.abs(deviation) <= tolerance;
      }
    }

    return { key, description, expectedVal, actualVal, tolerance, deviation, pass, type, unit, toleranceBasis };
  }) : [];

  return {
    id: bm.id,
    label: bm.label,
    studyType: bm.studyType,
    standardRef: bm.standardRef,
    sourceUrl: bm.sourceUrl || null,
    fixtureId: bm.fixtureId || null,
    inputs: bm.inputs || null,
    inputUnits: bm.inputUnits || null,
    source: bm.source || null,
    inputSource: bm.inputSource || null,
    additionalSources: Array.isArray(bm.additionalSources) ? bm.additionalSources : [],
    assumptions: Array.isArray(bm.assumptions) ? bm.assumptions : [],
    limitations: Array.isArray(bm.limitations) ? bm.limitations : [],
    independentDerivation: bm.independentDerivation || bm.derivation || null,
    evidenceClass: bm.evidenceClass || null,
    knownIssue: bm.knownIssue === true,
    description: bm.description,
    pass: error === null && checks.length > 0 && checks.every(c => c.pass),
    error,
    checks,
  };
}

/**
 * Run all benchmarks defined in the library.
 *
 * @returns {Array} Array of benchmark results from runBenchmark().
 */
export function runAllBenchmarks() {
  return BENCHMARKS.map(runBenchmark);
}

/**
 * Aggregate summary over an array of benchmark results.
 *
 * @param {Array} results  Output of runAllBenchmarks().
 * @returns {{ total: number, passed: number, failed: number, allPass: boolean }}
 */
export function summarize(results) {
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  return {
    total,
    passed,
    failed: total - passed,
    allPass: passed === total,
  };
}

export { BENCHMARKS };
