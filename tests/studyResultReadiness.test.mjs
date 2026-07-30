import assert from 'node:assert/strict';
import {
  createStudyRunMetadata,
  evaluateConvergenceCoverage,
  fingerprintStudySource,
  isStudyResultStale,
  validatePowerFlowStudyModel
} from '../analysis/studyResultReadiness.mjs';

const validModel = {
  buses: [
    { id: 'S', type: 'slack', baseKV: 13.8 },
    { id: 'L', type: 'PQ', baseKV: 13.8, load: { kw: 1000 } }
  ],
  branches: [{ id: 'F', from: 'S', to: 'L' }]
};

const readiness = validatePowerFlowStudyModel(validModel);
assert.equal(readiness.ready, true);
assert.equal(readiness.counts.buses, 2);
assert.equal(readiness.totals.loadKw, 1000);

const invalid = validatePowerFlowStudyModel({ buses: [{ id: 'B', type: 'PQ', baseKV: 0 }], branches: [] });
assert.equal(invalid.ready, false);
assert.ok(invalid.errors.some(error => error.includes('slack')));
assert.ok(invalid.errors.some(error => error.includes('branch')));

const complete = evaluateConvergenceCoverage(24, 24, { minimumRatio: 1 });
assert.equal(complete.valid, true);
assert.equal(complete.status, 'valid');

const partial = evaluateConvergenceCoverage(94, 100, { minimumRatio: 0.95 });
assert.equal(partial.valid, false);
assert.equal(partial.status, 'insufficient');

const acceptablePartial = evaluateConvergenceCoverage(98, 100, { minimumRatio: 0.95 });
assert.equal(acceptablePartial.valid, true);
assert.equal(acceptablePartial.status, 'review');

const firstFingerprint = fingerprintStudySource(validModel);
const sameFingerprint = fingerprintStudySource({
  branches: [{ to: 'L', from: 'S', id: 'F' }],
  buses: [
    { baseKV: 13.8, type: 'slack', id: 'S' },
    { load: { kw: 1000 }, baseKV: 13.8, type: 'PQ', id: 'L' }
  ]
});
assert.equal(firstFingerprint, sameFingerprint);

const metadata = createStudyRunMetadata('quasiDynamic', readiness, complete);
assert.equal(metadata.valid, true);
assert.equal(isStudyResultStale({ runMetadata: metadata }, readiness.sourceFingerprint), false);
assert.equal(isStudyResultStale({ runMetadata: metadata }, 'fnv1a-changed'), true);

console.log('advanced study readiness tests passed');
