import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeStudyAssessments } from '../src/components/studyLifecycle.js';
import { assessStudyValidity, getStudyDefinition } from '../analysis/studyLifecycle.mjs';

const assessment = (studyKey, state, validity = 'evaluated') => ({
  studyKey,
  assessment: { present: true, freshness: state, validity: { state: validity }, provenance: {} },
});

test('lifecycle separates current, stale, incomplete, and unknown states', () => {
  assert.equal(summarizeStudyAssessments([assessment('a', 'current')]).state, 'current');
  assert.equal(summarizeStudyAssessments([assessment('a', 'stale')]).state, 'stale');
  assert.equal(summarizeStudyAssessments([assessment('a', 'current', 'unevaluated')]).state, 'incomplete');
  assert.equal(summarizeStudyAssessments([assessment('a', 'unknown')]).state, 'unknown');
  assert.equal(summarizeStudyAssessments([assessment('a', 'current'), assessment('b', 'stale')]).state, 'stale');
  assert.equal(summarizeStudyAssessments([assessment('a', 'current')], { dirty: true }).state, 'stale');
});

test('unknown provenance remains non-current until the store can compare it', () => {
  const entries = [assessment('a', 'unknown'), assessment('b', 'current')];
  assert.equal(summarizeStudyAssessments(entries).state, 'unknown');
});

test('rerunning one result scope does not clear another scope dirty state', () => {
  const entries = [
    { ...assessment('harmonics', 'current'), dirty: true },
    { ...assessment('frequencyScan', 'current'), dirty: false },
  ];
  assert.equal(summarizeStudyAssessments(entries).state, 'stale');
  assert.equal(summarizeStudyAssessments([entries[1]]).state, 'current');
});

test('a current but ineligible dependency chain remains incomplete', () => {
  const blocked = assessment('batterySizing', 'current');
  blocked.assessment.eligible = false;
  blocked.assessment.reasons = ['dependency_unevaluated'];
  assert.equal(summarizeStudyAssessments([blocked]).state, 'incomplete');
});

test('aggregate tab outputs with an unevaluated sibling remain partial', () => {
  const aggregate = {
    pvResult: { pAC_kW: 10 },
    _tabLifecycle: {
      pv: { calculationStatus: 'evaluated' },
      bess: { calculationStatus: 'unevaluated', requiredInputs: ['Re-run BESS'] },
    },
  };
  assert.equal(assessStudyValidity(aggregate), 'partial');
});

test('actual wrapped and validation-error result shapes preserve lifecycle validity', () => {
  assert.equal(assessStudyValidity({
    _inputs: { area: 100 },
    _result: { totalKwh: 250, summary: { annualKwh: 250 } },
    _bom: [],
  }), 'evaluated');
  assert.equal(assessStudyValidity({ valid: false, errors: ['Room length is required'] }), 'unevaluated');
  assert.equal(assessStudyValidity({ valid: true, errors: [], illuminanceLux: 300 }), 'evaluated');
  assert.equal(assessStudyValidity({ valid: false, errors: ['Fault current is required'] }), 'unevaluated');
});

test('completed screening results may retain final-design required inputs', () => {
  assert.equal(assessStudyValidity({
    calculationStatus: 'screening-only',
    requiredInputs: ['Confirm manufacturer data before issue.'],
    selectedBankKwh: 120,
  }), 'evaluated');
});

test('One-Line fault studies capture both solver settings and protective-device sources', () => {
  for (const studyKey of ['shortCircuit', 'arcFlash']) {
    assert.deepEqual(getStudyDefinition(studyKey).settings, [
      'studySettings', 'tccSettings', 'trayHardwareCatalogCustomProducts',
    ]);
  }
  assert.deepEqual(getStudyDefinition('loadFlow').settings, ['studySettings']);
});
