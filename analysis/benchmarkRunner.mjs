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
  } catch (err) {
    error = err.message || String(err);
  }

  const checks = bm.checks.map(check => {
    const { key, description, expectedVal, tolerance = 0, type = 'numeric' } = check;
    const actualVal = actual[key];

    let deviation = null;
    let pass = false;

    if (error !== null) {
      pass = false;
      deviation = null;
    } else if (type === 'boolean') {
      pass = Boolean(actualVal) === Boolean(expectedVal);
      deviation = pass ? 0 : 1;
    } else {
      const a = Number(actualVal);
      const e = Number(expectedVal);
      if (!Number.isFinite(a) || !Number.isFinite(e)) {
        pass = false;
        deviation = null;
      } else {
        deviation = a - e;
        pass = Math.abs(deviation) <= tolerance;
      }
    }

    return { key, description, expectedVal, actualVal, tolerance, deviation, pass };
  });

  return {
    id: bm.id,
    label: bm.label,
    studyType: bm.studyType,
    standardRef: bm.standardRef,
    description: bm.description,
    pass: error === null && checks.every(c => c.pass),
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
