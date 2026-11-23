import assert from 'node:assert/strict';
import {
  assessStudyResult,
  buildStudyProvenance,
  captureStudyRunContext,
} from '../analysis/studyLifecycle.mjs';
import { studyExportMetadata } from '../analysis/studyExportMetadata.mjs';

const projectSnapshot = {
  projectMeta: { projectId: 'ephemeral-test' },
  loads: [{ tag: 'L1', kw: 10 }],
};
const identity = { projectId: 'ephemeral-test', projectName: 'Ephemeral test' };

function makeRun(studyKey, inputs, options) {
  const context = captureStudyRunContext(studyKey, {
    capturedAt: '2026-09-17T12:00:00.000Z',
    projectSnapshot,
    projectIdentity: identity,
    scenario: 'default',
    inputs,
    options,
    inputSources: { page: `${studyKey}.html`, governingStandard: 'published calculation basis' },
  });
  return { context, provenance: buildStudyProvenance(studyKey, { rows: [{ value: 1 }] }, context) };
}

const demand = makeRun('demandSchedule', [{ tag: 'L1', kw: 10 }], { mode: 'nec', profile: 'commercial' });
const demandResult = { rows: [{ value: 1 }] };
const demandCurrentContext = captureStudyRunContext('demandSchedule', {
  projectSnapshot,
  projectIdentity: identity,
  scenario: 'default',
  inputs: [{ tag: 'L1', kw: 10 }],
  options: { mode: 'nec', profile: 'commercial' },
});
const demandAssessment = assessStudyResult(
  'demandSchedule', demandResult,
  buildStudyProvenance('demandSchedule', demandResult, demand.context),
  demandCurrentContext,
);
assert.equal(demandAssessment.freshness, 'current');
assert.equal(demandAssessment.eligible, true);
assert.equal(demandAssessment.provenance.inputSourcesSnapshot.page, 'demandSchedule.html');

const demandChangedOptions = captureStudyRunContext('demandSchedule', {
  projectSnapshot,
  projectIdentity: identity,
  scenario: 'default',
  inputs: [{ tag: 'L1', kw: 10 }],
  options: { mode: 'iec', profile: 'commercial' },
});
const demandStaleAssessment = assessStudyResult(
  'demandSchedule', demandResult,
  buildStudyProvenance('demandSchedule', demandResult, demand.context),
  demandChangedOptions,
);
assert.equal(demandStaleAssessment.freshness, 'stale');
assert.equal(demandStaleAssessment.eligible, false);
assert.equal(studyExportMetadata(demandResult, { assessment: demandStaleAssessment }).resultEligibility, 'withheld');

const ground = makeRun('groundGrid', {
  mode: 'rectangular',
  fields: { 'grid-current': '5000', 'grid-lx': '30' },
}, { analysisMode: 'rectangular', units: 'imperial' });
const groundResult = { Em: 100, Es: 80, Rg: 0.5, touchSafe: true, stepSafe: true };
const groundCurrentContext = captureStudyRunContext('groundGrid', {
  projectSnapshot,
  projectIdentity: identity,
  scenario: 'default',
  inputs: {
    mode: 'rectangular',
    fields: { 'grid-current': '5000', 'grid-lx': '30' },
  },
  options: { analysisMode: 'rectangular', units: 'imperial' },
});
const groundProvenance = buildStudyProvenance('groundGrid', groundResult, ground.context);
const groundAssessment = assessStudyResult('groundGrid', groundResult, groundProvenance, groundCurrentContext);
assert.equal(groundAssessment.freshness, 'current');
assert.equal(groundAssessment.eligible, true);
assert.equal(groundAssessment.provenance.calculationRevision, 'calculation-v1');
assert.equal(groundAssessment.provenance.modelRevision, 'study-model-v1');
assert.equal(groundAssessment.provenance.capturedAt, '2026-09-17T12:00:00.000Z');

const groundChangedInputs = captureStudyRunContext('groundGrid', {
  projectSnapshot: { ...projectSnapshot, loads: [{ tag: 'L1', kw: 11 }] },
  projectIdentity: identity,
  scenario: 'default',
  inputs: {
    mode: 'rectangular',
    fields: { 'grid-current': '5000', 'grid-lx': '30' },
  },
  options: { analysisMode: 'rectangular', units: 'imperial' },
});
const groundStaleAssessment = assessStudyResult('groundGrid', groundResult, groundProvenance, groundChangedInputs);
assert.equal(groundStaleAssessment.freshness, 'stale');
assert.equal(groundStaleAssessment.reasons.includes('project_inputs_changed'), true);

console.log('ephemeral study lifecycle tests passed');
