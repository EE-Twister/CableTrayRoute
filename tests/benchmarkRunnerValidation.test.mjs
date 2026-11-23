import assert from 'node:assert/strict';
import { runBenchmark } from '../analysis/benchmarkRunner.mjs';

const base = { id: 'TEST', label: 'validation', studyType: 'test', run: () => ({ value: 1 }), checks: [{ key: 'value', expectedVal: 1 }] };
assert.equal(runBenchmark(base).pass, true);
assert.equal(runBenchmark({ ...base, run: () => null }).pass, false);
assert.equal(runBenchmark({ ...base, run: () => ({}) }).pass, false);
assert.equal(runBenchmark({ ...base, run: () => ({ value: null }) }).pass, false);
assert.equal(runBenchmark({ ...base, checks: [{ key: 'value', expectedVal: 1, tolerance: Infinity }] }).pass, false);
assert.equal(runBenchmark({ ...base, checks: [{ key: 'value', expectedVal: 1, tolerance: '100' }] }).pass, false);
assert.equal(runBenchmark({ ...base, checks: [{ key: 'value', expectedVal: 1, type: 'text' }] }).pass, false);
assert.equal(runBenchmark({ ...base, checks: [] }).pass, false);
assert.equal(runBenchmark({ ...base, checks: [null] }).pass, false);
assert.equal(runBenchmark({ ...base, run: () => ({ ready: true }), checks: [{ key: 'ready', expectedVal: true, type: 'boolean' }] }).pass, true);
assert.equal(runBenchmark({ ...base, run: () => ({ ready: 1 }), checks: [{ key: 'ready', expectedVal: true, type: 'boolean' }] }).pass, false);
console.log('✓ benchmark runner rejects malformed results, checks, and coercions');
