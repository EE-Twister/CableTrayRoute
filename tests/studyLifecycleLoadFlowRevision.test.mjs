import assert from 'node:assert/strict';
import test from 'node:test';
import { assessStudyResult, buildStudyProvenance, captureStudyRunContext, getStudyDefinition } from '../analysis/studyLifecycle.mjs';

const source = { projectMeta: { projectId: 'lifecycle-load-flow' }, oneLine: { buses: [{ id: 'S' }, { id: 'L' }] } };
const identity = { projectId: 'lifecycle-load-flow', projectName: 'Lifecycle load flow' };

test('load-flow calculation revision invalidates old results while fresh results remain eligible', () => {
  assert.equal(getStudyDefinition('loadFlow').calculationRevision, 'load-flow-calculation-v4');
  const result = { status: 'pass', converged: true, buses: [{ id: 'S', Vm: 1 }, { id: 'L', Vm: 0.99 }] };
  const oldContext = captureStudyRunContext('loadFlow', {
    capturedAt: '2026-09-18T12:00:00.000Z', projectSnapshot: source, projectIdentity: identity, scenario: 'default',
    inputs: { baseMVA: 1, balanced: true }, options: { baseMVA: 1, balanced: true },
    calculationRevision: 'load-flow-calculation-v3',
  });
  const currentContext = captureStudyRunContext('loadFlow', {
    projectSnapshot: source, projectIdentity: identity, scenario: 'default',
    inputs: { baseMVA: 1, balanced: true }, options: { baseMVA: 1, balanced: true },
  });
  const oldAssessment = assessStudyResult('loadFlow', result, buildStudyProvenance('loadFlow', result, oldContext), currentContext);
  assert.equal(oldAssessment.freshness, 'stale');
  assert.equal(oldAssessment.reasons.includes('calculation_revision_changed'), true);
  const freshContext = currentContext;
  const freshAssessment = assessStudyResult('loadFlow', result, buildStudyProvenance('loadFlow', result, freshContext), freshContext);
  assert.equal(freshAssessment.freshness, 'current');
  assert.equal(freshAssessment.eligible, true);
});

for (const studyKey of ['contingency', 'probabilisticLoadFlow', 'quasiDynamic']) {
  test(`${studyKey} rejects results from the previous shared load-flow calculation`, () => {
    assert.equal(getStudyDefinition(studyKey).calculationRevision, `${studyKey}-calculation-v4`);
    const context = { projectSnapshot: source, projectIdentity: identity, scenario: 'default', inputs: {}, options: {} };
    const previous = captureStudyRunContext(studyKey, { ...context, calculationRevision: `${studyKey}-calculation-v3` });
    const current = captureStudyRunContext(studyKey, context);
    const result = { status: 'pass', converged: true };
    const assessment = assessStudyResult(studyKey, result, buildStudyProvenance(studyKey, result, previous), current);
    assert.equal(assessment.freshness, 'stale');
    assert.ok(assessment.reasons.includes('calculation_revision_changed'));
  });
}

test('transformer tap optimization invalidates results from before the shared load-flow solver correction', () => {
  const studyKey = 'transformerTapOptimization';
  assert.equal(getStudyDefinition(studyKey).calculationRevision, 'transformer-tap-calculation-v3');
  const context = { projectSnapshot: source, projectIdentity: identity, scenario: 'default', inputs: { oneLine: source.oneLine }, options: { balanced: true } };
  const oldContext = captureStudyRunContext(studyKey, { ...context, calculationRevision: 'transformer-tap-calculation-v2' });
  const currentContext = captureStudyRunContext(studyKey, context);
  const result = { status: 'review', transformers: [{ transformerId: 'T1', eligible: true }] };
  const oldAssessment = assessStudyResult(studyKey, result, buildStudyProvenance(studyKey, result, oldContext), currentContext);
  assert.equal(oldAssessment.freshness, 'stale');
  assert.ok(oldAssessment.reasons.includes('calculation_revision_changed'));

  const freshAssessment = assessStudyResult(studyKey, result, buildStudyProvenance(studyKey, result, currentContext), currentContext);
  assert.equal(freshAssessment.freshness, 'current');
  assert.equal(freshAssessment.eligible, true);
});
