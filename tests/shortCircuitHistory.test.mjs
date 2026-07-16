import assert from 'node:assert/strict';
import {
  buildShortCircuitComparison,
  getShortCircuitFreshness,
} from '../studies/shortCircuit.js';

const currentResults = {
  busA: { equipmentTag: 'BUS-A', threePhaseKA: 12.5 },
  busB: { equipmentTag: 'BUS-B', threePhaseKA: 7.25 },
  _meta: {
    inputFingerprint: 'current-inputs',
    history: [{
      updatedAt: '2026-07-14T12:00:00.000Z',
      method: 'ANSI',
      buses: [
        { id: 'busA', equipmentTag: 'BUS-A', threePhaseKA: 11.75 },
        { id: 'busC', equipmentTag: 'BUS-C', threePhaseKA: 3.5 },
      ],
    }],
  },
};

assert.deepEqual(
  getShortCircuitFreshness(currentResults, 'current-inputs'),
  {
    status: 'current',
    stale: false,
    savedFingerprint: 'current-inputs',
    currentFingerprint: 'current-inputs',
    label: 'Results match current inputs',
  },
);

assert.equal(getShortCircuitFreshness(currentResults, 'changed-inputs').status, 'stale');
assert.equal(getShortCircuitFreshness({}, 'changed-inputs').status, 'unknown');

const comparison = buildShortCircuitComparison(currentResults);
assert.equal(comparison.previous.method, 'ANSI');
assert.deepEqual(comparison.rows, [
  { tag: 'BUS-A', currentKa: 12.5, previousKa: 11.75, deltaKa: 0.75 },
  { tag: 'BUS-B', currentKa: 7.25, previousKa: null, deltaKa: null },
  { tag: 'BUS-C', currentKa: null, previousKa: 3.5, deltaKa: null },
]);

console.log('shortCircuitHistory tests passed');
