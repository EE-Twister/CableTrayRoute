import assert from 'node:assert/strict';
import {
  buildReliabilitySection,
  buildVoltageDropSection,
  renderPackageHTML,
} from '../analysis/projectReport.mjs';
import {
  buildReportPackage,
  getAvailableSections,
  PRESET_CONFIGS,
} from '../analysis/reportPackage.mjs';

const runMetadata = {
  valid: true,
  source: 'project-data',
  runAt: '2026-07-30T12:00:00.000Z',
};

const studies = {
  voltageDropStudy: {
    runMetadata,
    summary: {
      total: 1,
      evaluated: 1,
      fail: 0,
      combinedFail: 1,
      maxDropPct: 2.5,
      maxCombinedDropPct: 5.4,
      recommendations: 1,
    },
    results: [{
      tag: 'CBL-101',
      from: 'BUS-A',
      to: 'LOAD-1',
      inputSource: { current: 'Load Flow' },
      pathTags: ['FDR-1', 'CBL-101'],
      dropPct: 2.5,
      limitPct: 3,
      status: 'pass',
      pathEvaluated: true,
      combinedDropPct: 5.4,
      combinedLimitPct: 5,
      combinedStatus: 'fail',
      recommendation: { conductorSize: '2 AWG' },
    }],
    warnings: ['Review the combined path.'],
  },
  reliability: {
    runMetadata,
    systemAvailability: 0.999,
    serviceAvailability: 0.998,
    totalServedKw: 100,
    eensKwh: 1752,
    criticalLoadEensKwh: 1752,
    serviceInterruptionHours: 17.52,
    sourceCoveragePct: 100,
    servicePoints: [{
      id: 'L-1',
      label: 'Critical Pump',
      kw: 100,
      critical: true,
      availability: 0.998,
      expectedOutageHours: 17.52,
      interruptionFrequencyPerYear: 0.2,
      eensKwh: 1752,
    }],
    n1Impacts: [{
      failed: ['CB-1'],
      impacted: ['L-1'],
      impactedServicePoints: [{ id: 'L-1', label: 'Critical Pump' }],
      impactedKw: 100,
      criticalKw: 100,
      probability: 0.002,
    }],
    n2Impacts: [],
    warnings: [],
  },
};

const voltageDrop = buildVoltageDropSection(studies, {});
assert.equal(voltageDrop.rows[0].inputSource, 'Load Flow');
assert.equal(voltageDrop.rows[0].combinedStatus, 'fail');
assert.equal(voltageDrop.rows[0].recommendation, '2 AWG');

const reliability = buildReliabilitySection(studies, {});
assert.equal(reliability.rows[0].id, 'Critical Pump');
assert.equal(reliability.cutSets[0].failed, 'CB-1');
assert.equal(reliability.summary['Reliability source coverage (%)'], 100);

const pkg = buildReportPackage(
  { sections: ['voltageDrop', 'reliability'] },
  { voltageDrop, reliability },
);
const html = renderPackageHTML(pkg, {});
assert.match(html, /FDR-1 → CBL-101/);
assert.match(html, /Recommended Size/);
assert.match(html, /Critical Pump/);
assert.match(html, /Minimal Cut-Set Screening/);

const available = getAvailableSections({ studies });
assert.equal(available.has('voltageDrop'), true);
assert.equal(available.has('reliability'), true);
assert.ok(PRESET_CONFIGS.electrical.sections.includes('voltageDrop'));
assert.ok(PRESET_CONFIGS.electrical.sections.includes('reliability'));

console.log('scenario, voltage drop, and reliability report tests passed');
