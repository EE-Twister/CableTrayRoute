import assert from 'node:assert/strict';
import {
  assessStudyResult,
  buildStudyContextIndex,
} from '../analysis/studyResultContext.mjs';
import {
  buildStudyProvenance,
  captureStudyRunContext,
} from '../analysis/studyLifecycle.mjs';
import { buildReportPackage, snapshotPackage } from '../analysis/reportPackage.mjs';
import { buildVoltageDropSection } from '../analysis/projectReport.mjs';

const projectSnapshot = {
  cables: [{ id: 'C-1', lengthFt: 100 }],
  loads: [{ id: 'L-1', kw: 10 }],
};
const inputs = { cableId: 'C-1', dropPct: 1.2 };
const options = { conductor: 'Cu', voltage: 480 };
const context = captureStudyRunContext('voltageDropStudy', {
  projectSnapshot,
  inputs,
  options,
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
  assumptions: ['Screening load current'],
  warnings: ['Confirm field route'],
});
const result = { result: 1.2, status: 'fail' };
const provenance = buildStudyProvenance('voltageDropStudy', result, context, { validity: 'evaluated' });
const currentContext = captureStudyRunContext('voltageDropStudy', {
  projectSnapshot,
  inputs,
  options,
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
});

const current = assessStudyResult('voltageDropStudy', result, provenance, { currentStudyContext: currentContext });
assert.equal(current.validity, 'evaluated');
assert.equal(current.freshness, 'current');
assert.equal(current.eligible, true, 'an evaluated failing check remains eligible');
assert.equal(current.evaluation.state, 'fail');

const changedContext = captureStudyRunContext('voltageDropStudy', {
  projectSnapshot: { ...projectSnapshot, loads: [{ id: 'L-1', kw: 20 }] },
  inputs,
  options,
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
});
const stale = assessStudyResult('voltageDropStudy', result, provenance, { currentStudyContext: changedContext });
assert.equal(stale.freshness, 'stale');
assert.equal(stale.eligible, false);

const missingVersion = assessStudyResult(
  'voltageDropStudy',
  result,
  { ...provenance, modelRevision: null },
  { currentStudyContext: currentContext },
);
assert.equal(missingVersion.freshness, 'unknown', 'missing calculation model version cannot be promoted to current');
assert.equal(missingVersion.eligible, false);

const index = buildStudyContextIndex(
  { voltageDropStudy: result, unmappedStudy: { value: 3 } },
  { voltageDropStudy: provenance },
  { currentStudyContext: currentContext },
);
assert.deepEqual(Object.keys(index), ['unmappedStudy', 'voltageDropStudy']);
assert.equal(index.unmappedStudy.freshness, 'unknown');

const iecInputs = { voltage: 13.8, faultCurrent: 12.4 };
const iecContext = captureStudyRunContext('iec60909', {
  projectSnapshot,
  inputs: iecInputs,
  options: { method: 'IEC' },
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
});
const iecResult = { buses: [{ id: 'MCC-1', threePhaseKA: 12.4 }] };
const iecProvenance = buildStudyProvenance('iec60909', iecResult, iecContext, { validity: 'evaluated' });
const frequencyContext = captureStudyRunContext('frequencyScan', {
  projectSnapshot,
  inputs: { scan: [1, 3, 5] },
  options: { method: 'IEC' },
  dependencies: { iec60909: { resultHash: iecProvenance.resultHash, status: 'evaluated' } },
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
});
const frequencyResult = { scan: [{ order: 1, frequencyHz: 60 }] };
const frequencyProvenance = buildStudyProvenance('frequencyScan', frequencyResult, frequencyContext, { validity: 'evaluated' });
const selectedIndex = buildStudyContextIndex(
  { frequencyScan: frequencyResult, iec60909: iecResult },
  { frequencyScan: frequencyProvenance, iec60909: iecProvenance },
  { currentStudyContexts: { frequencyScan: frequencyContext, iec60909: iecContext } },
);
assert.equal(selectedIndex.iec60909.freshness, 'current', 'recorded IEC dependency must be assessed directly');
assert.equal(selectedIndex.frequencyScan.freshness, 'current');
const changedIecContext = captureStudyRunContext('iec60909', {
  projectSnapshot: { ...projectSnapshot, loads: [{ id: 'L-1', kw: 99 }] },
  inputs: iecInputs,
  options: { method: 'IEC' },
  scenario: 'Base',
  projectIdentity: { projectId: 'P-1', projectName: 'Test project' },
});
const staleIndex = buildStudyContextIndex(
  { frequencyScan: frequencyResult, iec60909: iecResult },
  { frequencyScan: frequencyProvenance, iec60909: iecProvenance },
  { currentStudyContexts: { frequencyScan: frequencyContext, iec60909: changedIecContext } },
);
assert.equal(staleIndex.iec60909.freshness, 'stale');
assert.equal(staleIndex.frequencyScan.eligible, false, 'dependent study must not remain eligible when recorded IEC input is stale');

const legacy = buildVoltageDropSection({
  voltageDropStudy: { results: [{ tag: 'C-1', dropPct: 1, status: 'PASS' }] },
}, {}, { currentInputFingerprint: 'current' });
assert.equal(legacy.rows[0].dropPct, '—');
assert.equal(legacy.rows[0].resultValidity, 'unknown');
assert.equal(legacy.rows[0].freshness, 'unknown');
assert.equal(legacy.rows[0].historicalValues.dropPct, 1);
assert.equal(legacy.summary['Result summary'], 'Freshness unknown');

const packageSnapshot = snapshotPackage(buildReportPackage(
  { sections: ['cover'], studyContextIndex: index, currentInputFingerprint: 'current' },
  {},
));
assert.equal(packageSnapshot.studyContextIndex.unmappedStudy.freshness, 'unknown');
assert.equal(packageSnapshot.config.currentInputFingerprint, 'current');

console.log('✓ study result lifecycle context is preserved and enforced by report consumers');
