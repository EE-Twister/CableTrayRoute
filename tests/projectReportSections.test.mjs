import assert from 'assert';
import { buildReportPackage } from '../analysis/reportPackage.mjs';
import {
  buildDRCSection,
  buildHarmonicsSection,
  buildShortCircuitSection,
  renderPackageHTML,
} from '../analysis/projectReport.mjs';

const shortCircuit = buildShortCircuitSection({
  shortCircuit: {
    'bus-1': {
      equipmentTag: 'SWBD-101',
      threePhaseKA: 25.26,
      lineToGroundKA: 18.4,
      lineToLineKA: 21.9,
      doubleLineGroundKA: 20.1,
      prefaultKV: 0.48,
    },
  },
});

assert.deepStrictEqual(shortCircuit.rows[0], {
  id: 'SWBD-101',
  i3ph_kA: 25.26,
  iSlg_kA: 18.4,
  iLL_kA: 21.9,
  iDLG_kA: 20.1,
  voltage: 0.48,
});

const shortCircuitSummary = buildShortCircuitSection({
  shortCircuit: {
    status: 'Run',
    availableFaultKa: 22.4,
    updatedAt: '2026-05-01T12:05:00.000Z',
  },
});

assert.deepStrictEqual(shortCircuitSummary.rows, []);
assert.deepStrictEqual(shortCircuitSummary.summary, {
  status: 'Run',
  availableFaultKa: 22.4,
  updatedAt: '2026-05-01T12:05:00.000Z',
});

const harmonics = buildHarmonicsSection({
  harmonics: {
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
  },
});
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
assert.match(summaryHtml, /Available fault current/);
assert.match(summaryHtml, /22\.4 kA/);
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
