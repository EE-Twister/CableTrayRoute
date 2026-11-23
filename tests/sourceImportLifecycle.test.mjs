import assert from 'node:assert/strict';
import {
  assertStudyRunContextCurrent,
  captureStudyRunContext,
  getStudyProvenance,
  saveStudyResult,
  setOneLine,
  setProjectMeta,
  setStudies,
} from '../dataStore.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { initializeProjectStorage } from '../projectStorage.js';

await initializeProjectStorage();
setProjectMeta({ id: 'source-import-lifecycle-test', name: 'Source import lifecycle test' });
setOneLine({
  activeSheet: 0,
  sheets: [{
    name: 'Main',
    components: [{ type: 'generator', subtype: 'synchronous', max_mw: 10, operating_mw: 5, inertia: 4 }],
    connections: [],
  }],
}, 'base', { captureRevision: false });
setStudies({});

const transientInputs = {
  H: 4,
  f: 60,
  Pm: 0.5,
  Pmax_pre: 1,
  Pmax_fault: 0.2,
  Pmax_post: 0.8,
  t_clear: 0.1,
  t_end: 2,
};
const transientContext = captureStudyRunContext('transientStability', {
  inputs: transientInputs,
  options: transientInputs,
  dependencies: [],
});
saveStudyResult('transientStability', {
  inputs: transientInputs,
  simulation: { stable: true, deltaMax_deg: 30 },
}, transientContext);
const transientProvenance = getStudyProvenance().transientStability;

// An unchanged imported run can be rechecked against its original sidecar.
// The page then captures the completed form separately for the new run.
assert.doesNotThrow(() => assertStudyRunContextCurrent(transientProvenance));

// Editing the project after import must reject a rerun instead of capturing a
// new context around the old restored form values.
setOneLine({
  activeSheet: 0,
  sheets: [{
    name: 'Main',
    components: [{ type: 'generator', subtype: 'synchronous', max_mw: 12, operating_mw: 5, inertia: 4 }],
    connections: [],
  }],
}, 'base', { captureRevision: false });
assert.throws(() => assertStudyRunContextCurrent(transientProvenance, {
  inputs: transientInputs,
  options: transientInputs,
}), /project inputs changed/);

// Reopening the saved result retains the same sidecar; it must not become
// current merely because the page rebuilt a context from the edited project.
const reopenedTransientProvenance = getStudyProvenance().transientStability;
assert.throws(() => assertStudyRunContextCurrent(reopenedTransientProvenance, {
  inputs: transientInputs,
  options: transientInputs,
}), /project inputs changed/);

// Frequency scan records the selected upstream source key and its hashes so a
// rerun detects a changed dependency as well as a changed One-Line snapshot.
setStudies({});
const shortCircuit = { status: 'pass', availableFaultKa: 10 };
const shortCircuitContext = captureStudyRunContext('shortCircuit', {
  inputs: { bus: 'B-1' },
  options: {},
  dependencies: [],
});
saveStudyResult('shortCircuit', shortCircuit, shortCircuitContext);
const shortCircuitProvenance = getStudyProvenance().shortCircuit;
const frequencyInputs = { baseFreqHz: 60, systemKv: 13.8, scMva: 239, harmonicRange: { min: 1, max: 25 } };
const frequencyContext = captureStudyRunContext('frequencyScan', {
  inputs: frequencyInputs,
  options: {},
  dependencies: {
    shortCircuit: {
      resultHash: fingerprintStudyValue(shortCircuit),
      provenanceHash: fingerprintStudyValue(shortCircuitProvenance),
    },
  },
});
saveStudyResult('frequencyScan', { points: [{ h: 1, zMagOhm: 1 }], status: 'pass' }, frequencyContext);
const frequencyProvenance = getStudyProvenance().frequencyScan;
assert.deepEqual(frequencyProvenance.dependencies.map(entry => entry.studyKey), ['shortCircuit']);
assert.doesNotThrow(() => assertStudyRunContextCurrent(frequencyProvenance));

saveStudyResult('shortCircuit', { ...shortCircuit, availableFaultKa: 11 }, shortCircuitContext);
assert.throws(() => assertStudyRunContextCurrent(frequencyProvenance, {
  inputs: frequencyInputs,
  options: {},
}), /study dependencies changed/);

console.log('✓ imported study sidecars preserve source freshness and dependency keys');
