import assert from 'node:assert/strict';
import test from 'node:test';
import { runValidation } from '../../validation/rules.js';
import {
  captureStudyRunContext,
  assertStudyRunContextCurrent,
  getStudies,
  getStudyAssessment,
  getStudyAssessments,
  saveStudyResult,
  setItem,
  setProjectMeta,
  setStudies,
} from '../../dataStore.mjs';
import { persistDutyPlotResult } from '../../analysis/tcc/dutyLifecycle.mjs';
import { initializeProjectStorage } from '../../projectStorage.js';

const contextInputs = { componentId: 'C1', selectedDeviceIds: ['component:C1'] };
const contextOptions = { rangePreset: 'full', viewOptions: ['curves'] };

function saveShortCircuit(value) {
  const context = captureStudyRunContext('shortCircuit', { inputs: { source: 'duty-test' } });
  saveStudyResult('shortCircuit', { C1: { threePhaseKA: value } }, context);
}

function saveDuty() {
  const context = captureStudyRunContext('duty', {
    inputs: contextInputs,
    options: contextOptions,
  });
  return persistDutyPlotResult({
    contextId: 'C1',
    dutyContextId: 'C1',
    dutyRunContext: context,
    selectedDeviceIds: () => contextInputs.selectedDeviceIds,
    getDutyOptions: () => contextOptions,
    violations: [],
    saveStudyResult,
    assertStudyRunContextCurrent,
  });
}

test('TCC producer stores an eligible empty duty result through the real data store', { concurrency: false }, async () => {
  await initializeProjectStorage();
  setProjectMeta({ id: 'duty-lifecycle-test', name: 'Duty lifecycle test' });
  setStudies({});
  setItem('tccSettings', { devices: ['component:C1'], pickup: 100 });
  saveShortCircuit(20);

  assert.equal(saveDuty(), true);
  const assessment = getStudyAssessment('duty');
  assert.equal(assessment.freshness, 'current');
  assert.equal(assessment.validity.state, 'evaluated');
  assert.equal(assessment.eligible, true);
  assert.deepEqual(runValidation([], getStudies(), { assessments: getStudyAssessments() }), []);

  setItem('tccSettings', { devices: ['component:C1'], pickup: 100 });
  const context = captureStudyRunContext('duty', {
    inputs: contextInputs,
    options: contextOptions,
  });
  contextOptions.viewOptions = ['metrics'];
  assert.throws(() => persistDutyPlotResult({
    contextId: 'C1',
    dutyContextId: 'C1',
    dutyRunContext: context,
    selectedDeviceIds: () => contextInputs.selectedDeviceIds,
    getDutyOptions: () => contextOptions,
    violations: [],
    saveStudyResult,
    assertStudyRunContextCurrent,
  }), /study options changed/);
  contextOptions.viewOptions = ['curves'];
  setItem('tccSettings', { devices: ['component:C1'], pickup: 200 });
  assert.throws(() => persistDutyPlotResult({
    contextId: 'C1',
    dutyContextId: 'C1',
    dutyRunContext: context,
    selectedDeviceIds: () => contextInputs.selectedDeviceIds,
    getDutyOptions: () => contextOptions,
    violations: [],
    saveStudyResult,
    assertStudyRunContextCurrent,
  }), /changed while the study was running/);
  assert.deepEqual(getStudies().duty, { C1: [] });

  const issues = runValidation([], getStudies(), { assessments: getStudyAssessments() });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].status, 'historical');
  assert.match(issues[0].message, /stale/);
});
