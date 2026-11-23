import assert from 'node:assert/strict';
import { buildReportPackage, snapshotPackage } from '../analysis/reportPackage.mjs';
import { buildShortCircuitSection, renderPackageHTML } from '../analysis/projectReport.mjs';
import { buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';
import { formatKA } from '../studies/shortCircuit.js';

assert.equal(formatKA(null), 'Unevaluated');
assert.equal(formatKA(''), 'Unevaluated');
assert.equal(formatKA(undefined), 'Unevaluated');
assert.equal(formatKA(0), '0.00');

const shortCircuit = {
  _meta: { inputFingerprint: 'sc-fingerprint', updatedAt: '2026-09-16T12:00:00.000Z', method: 'ANSI' },
  'BUS-INCOMPLETE': {
    method: 'ANSI', validity: 'unevaluated', calculationStatus: 'incomplete',
    threePhaseKA: null, lineToGroundKA: null, lineToLineKA: null, doubleLineGroundKA: null,
    prefaultKV: 0.48, requiredInputs: ['Provide sequence impedances.'],
    warnings: ['Currents withheld.'], provenance: { standard: 'ANSI/IEEE C37' },
    modelLimits: { doubleLineGround: 'screening' }, studyOptions: { method: 'ANSI' }
  }
};
const iec60909 = {
  'BUS-IEC': {
    method: 'IEC', validity: 'evaluated', calculationStatus: 'screening-only',
    threePhaseKA: 34.76, lineToGroundKA: 34.76, lineToLineKA: 30.1, doubleLineGroundKA: 34.76,
    doubleLineGroundPhaseBKA: 34.76, doubleLineGroundPhaseCKA: 34.76, doubleLineGroundEarthKA: 34.76,
    prefaultKV: 11, inputFingerprint: 'current-project|iec60909:{"method":"IEC"}', calculatedAt: '2026-09-16T12:01:00.000Z',
    provenance: { standard: 'IEC 60909-0:2016' }, modelLimits: { thermalEquivalent: 'screening' },
    studyOptions: { method: 'IEC', cMode: 'max' }, warnings: []
  }
};

const studyProvenance = {};
const currentStudyContexts = {};
for (const [studyKey, result] of Object.entries({ shortCircuit, iec60909 })) {
  const context = captureStudyRunContext(studyKey, {
    projectSnapshot: { project: 'short-circuit-report-test' },
    inputs: { studyKey, revision: 1 },
    options: { mode: 'test' },
    scenario: 'Base',
    projectIdentity: { projectId: 'short-circuit-report-test', projectName: 'Short Circuit Report Test' },
  });
  currentStudyContexts[studyKey] = context;
  studyProvenance[studyKey] = buildStudyProvenance(studyKey, result, context, {
    validity: studyKey === 'shortCircuit' ? 'unevaluated' : 'evaluated',
  });
}

const section = buildShortCircuitSection(
  { shortCircuit, iec60909 },
  {},
  { currentInputFingerprint: 'current-project', studyProvenance, currentStudyContexts },
);
assert.equal(section.rows.length, 2, 'both short-circuit study namespaces should be retained');
const incomplete = section.rows.find(row => row.id === 'BUS-INCOMPLETE');
const iec = section.rows.find(row => row.id === 'BUS-IEC');
assert.equal(incomplete.method, 'ANSI');
assert.equal(incomplete.i3ph_kA, '—');
assert.equal(incomplete.historicalValues.i3ph_kA, null);
assert.equal(incomplete.validity, 'unevaluated');
assert.equal(incomplete.calculationStatus, 'incomplete');
assert.equal(incomplete.inputFingerprint, 'sc-fingerprint');
assert.equal(incomplete.currentInputFingerprint, 'current-project');
assert.equal(incomplete.freshness, 'stale');
assert.equal(iec.method, 'IEC');
assert.equal(iec.iDLGPhaseB_kA, 34.76);
assert.equal(iec.iDLGEarth_kA, 34.76);
assert.equal(iec.inputFingerprint, 'current-project|iec60909:{"method":"IEC"}');
assert.equal(iec.currentInputFingerprint, 'current-project');
assert.equal(iec.freshness, 'current');

const unknown = buildShortCircuitSection({ shortCircuit: { 'BUS-UNKNOWN': { threePhaseKA: null } } }, {}, { currentInputFingerprint: 'current-project' });
assert.equal(unknown.rows[0].freshness, 'unknown');

const pkg = buildReportPackage({ sections: ['shortCircuit'] }, { shortCircuit: section });
const html = renderPackageHTML(pkg, {});
assert.match(html, /BUS-INCOMPLETE/);
assert.match(html, /BUS-IEC/);
assert.match(html, /Unevaluated|incomplete/);
assert.match(html, /report-detail/);
assert.match(html, /IEC 60909-0:2016/);
assert.match(html, /Current input fingerprint/);
assert.match(html, /Freshness/);
assert.doesNotMatch(html, /<th>Required inputs<\/th>/);
const snapshot = snapshotPackage(pkg);
assert.equal(snapshot.sections.shortCircuit.rows.find(row => row.id === 'BUS-IEC').freshness, 'current');
assert.equal(snapshot.sections.shortCircuit.rows.find(row => row.id === 'BUS-INCOMPLETE').freshness, 'stale');
console.log('short-circuit report contract checks passed');
