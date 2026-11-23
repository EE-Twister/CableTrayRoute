import assert from 'assert';
import { buildReportPackage } from '../analysis/reportPackage.mjs';
import { buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';
import {
  buildDRCSection,
  buildHarmonicsSection,
  buildShortCircuitSection,
  renderPackageHTML,
} from '../analysis/projectReport.mjs';

function lifecycleOptions(studyKey, result) {
  const context = captureStudyRunContext(studyKey, {
    projectSnapshot: { project: 'report-test' },
    inputs: { studyKey, revision: 1 },
    options: { mode: 'test' },
    scenario: 'Base',
    projectIdentity: { projectId: 'report-test', projectName: 'Report Test' },
  });
  return {
    studyProvenance: { [studyKey]: buildStudyProvenance(studyKey, result, context, { validity: 'evaluated' }) },
    currentStudyContext: context,
  };
}

const shortCircuitData = {
  'bus-1': {
    equipmentTag: 'SWBD-101',
    threePhaseKA: 25.26,
    lineToGroundKA: 18.4,
    lineToLineKA: 21.9,
    doubleLineGroundKA: 20.1,
    prefaultKV: 0.48,
  },
};
const shortCircuit = buildShortCircuitSection(
  { shortCircuit: shortCircuitData },
  {},
  lifecycleOptions('shortCircuit', shortCircuitData),
);

assert.equal(shortCircuit.rows[0].id, 'SWBD-101');
assert.equal(shortCircuit.rows[0].i3ph_kA, 25.26);
assert.equal(shortCircuit.rows[0].resultValidity, 'evaluated');
assert.equal(shortCircuit.rows[0].freshness, 'current');
assert.equal(shortCircuit.rows[0].resultEligibility, 'eligible');

const shortCircuitSummary = buildShortCircuitSection({
  shortCircuit: {
    status: 'Run',
    availableFaultKa: 22.4,
    updatedAt: '2026-05-01T12:05:00.000Z',
  },
});

assert.deepStrictEqual(shortCircuitSummary.rows, []);
assert.equal(shortCircuitSummary.summary.status, 'Freshness unknown');
assert.equal(shortCircuitSummary.summary.availableFaultKa, undefined);
assert.equal(shortCircuitSummary.summary.updatedAt, '2026-05-01T12:05:00.000Z');

const harmonicsData = {
    'BUS-H1': {
      ithd: 12.4,
      vthd: 6.2,
      limit: 5,
      warning: true,
      calculationStatus: 'screening-only',
    },
    'BUS-H2': {
      ithd: 9.1,
      vthd: null,
      limit: 5,
      warning: null,
      calculationStatus: 'screening-only',
    },
};
const harmonics = buildHarmonicsSection(
  { harmonics: harmonicsData },
  {},
  lifecycleOptions('harmonics', harmonicsData),
);
assert.equal(harmonics.rows[0].warning, 'Above screening threshold — PCC study required');
assert.equal(harmonics.rows[1].warning, 'Not evaluated');
assert.ok(harmonics.rows.every(row => row.calculationStatus === 'screening-only'));
assert.equal(shortCircuitSummary.empty, false);

const drc = buildDRCSection([{
  ruleId: 'DRC-04',
  severity: 'error',
  location: 'CBL-SWBD-XFMR-101',
  message: 'Equipment grounding conductor is undersized.',
  remediation: 'Increase the grounding conductor size.'
}]);
assert.equal(drc.rows[0].component, 'CBL-SWBD-XFMR-101');

const drcPkg = buildReportPackage({ sections: ['drc'] }, { drc });
const drcHtml = renderPackageHTML(drcPkg, {});
assert.match(drcHtml, /report-finding-list/);
assert.match(drcHtml, /CBL-SWBD-XFMR-101/);
assert.doesNotMatch(drcHtml, /<th>Remediation<\/th>/);

const summaryPkg = buildReportPackage({ sections: ['shortCircuit'] }, { shortCircuit: shortCircuitSummary });
const summaryHtml = renderPackageHTML(summaryPkg, {});
assert.match(summaryHtml, /Freshness unknown/);
assert.doesNotMatch(summaryHtml, /22\.4 kA/);
assert.doesNotMatch(summaryHtml, />status<\/td>/i);

const pkg = buildReportPackage({
  sections: ['toc', 'cables', 'shortCircuit', 'lighting'],
}, { shortCircuit });
const html = renderPackageHTML(pkg, {});

assert.match(html, /SWBD-101/);
assert.match(html, /25\.26/);
for (const entry of pkg.sections.toc.entries) {
  assert.match(html, new RegExp(`id="rpt-${entry.key}"`), `missing rendered anchor for ${entry.key}`);
}

console.log('project report section tests passed');
