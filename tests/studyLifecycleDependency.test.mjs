import assert from 'node:assert/strict';
import {
  captureStudyRunContext,
  getStudyAssessment,
  getStudyProvenance,
  saveStudyResult,
  setProjectMeta,
  setStudies,
} from '../dataStore.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { initializeProjectStorage } from '../projectStorage.js';

await initializeProjectStorage();
setProjectMeta({ id: 'dependency-lifecycle-test', name: 'Dependency lifecycle test' });
setStudies({});

const loadFlow = { converged: true, buses: [{ id: 'B-1', voltage: 1 }] };
const loadFlowContext = captureStudyRunContext('loadFlow', {
  inputs: { oneLine: { buses: ['B-1'] } }, options: { balanced: true },
});
saveStudyResult('loadFlow', loadFlow, loadFlowContext);
const loadFlowProvenance = getStudyProvenance().loadFlow;
const dependency = {
  loadFlow: {
    resultHash: fingerprintStudyValue(loadFlow),
    provenanceHash: fingerprintStudyValue(loadFlowProvenance),
  },
};
const motorContext = captureStudyRunContext('motorStart', {
  inputs: { motor: 'M-1' }, options: { duration: 5 }, dependencies: dependency,
});
saveStudyResult('motorStart', { status: 'pass', inrushKA: 2 }, motorContext);
assert.equal(getStudyAssessment('motorStart').eligible, true);

// A changed but still valid upstream result must invalidate its dependent.
saveStudyResult('loadFlow', { ...loadFlow, buses: [{ id: 'B-1', voltage: 0.98 }] }, loadFlowContext);
const changedDependencyAssessment = getStudyAssessment('motorStart');
assert.equal(changedDependencyAssessment.freshness, 'stale');
assert.equal(changedDependencyAssessment.eligible, false);
assert.ok(changedDependencyAssessment.reasons.some(reason => ['dependencies_changed', 'dependency_stale'].includes(reason)));

// A producer may select an optional IEC result explicitly. Assessment follows
// the recorded key rather than inventing the registry's default dependency.
setStudies({});
const iec = { status: 'pass', ikssKA: 12 };
const iecContext = captureStudyRunContext('iec60909', { inputs: { voltageKV: 13.8 }, options: {} });
saveStudyResult('iec60909', iec, iecContext);
const iecProvenance = getStudyProvenance().iec60909;
const frequencyContext = captureStudyRunContext('frequencyScan', {
  inputs: { scan: 'base' }, options: {}, dependencies: {
    iec60909: {
      resultHash: fingerprintStudyValue(iec),
      provenanceHash: fingerprintStudyValue(iecProvenance),
    },
  },
});
saveStudyResult('frequencyScan', { status: 'pass', resonanceHz: 60 }, frequencyContext);
assert.equal(getStudyAssessment('frequencyScan').eligible, true);

console.log('✓ lifecycle dependency hashes refresh and recorded optional dependencies recurse');
