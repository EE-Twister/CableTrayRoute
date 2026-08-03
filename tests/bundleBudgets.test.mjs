import assert from 'node:assert/strict';

import { BUNDLE_BUDGETS, evaluateBundleSizes } from '../scripts/checkBundleBudgets.mjs';

const passing = Object.fromEntries(Object.entries(BUNDLE_BUDGETS).map(([file, budget]) => [file, budget]));
assert.deepEqual(evaluateBundleSizes(passing), []);

const oversized = { ...passing, 'shortCircuit.js': BUNDLE_BUDGETS['shortCircuit.js'] + 1 };
assert.match(evaluateBundleSizes(oversized)[0], /shortCircuit\.js is .*budget/);

const missing = { ...passing };
delete missing['workflowdashboard.js'];
assert.equal(evaluateBundleSizes(missing)[0], 'workflowdashboard.js is missing');

console.log('bundle budget tests passed');
