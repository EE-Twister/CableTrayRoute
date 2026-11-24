import assert from 'assert';
import { buildReportPackage } from '../analysis/reportPackage.mjs';
import { buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { calculateMotorStartCase } from '../analysis/motorStartCalc.mjs';
import { assessHeatTraceCase, buildHeatTraceCaseProvenance } from '../src/components/heatTraceLifecycle.mjs';
import {
  buildArcFlashSection,
  buildLoadFlowSection,
  buildMotorStartSection,
  formatReportNumber,
  generateProjectReport,
  renderPackageHTML,
} from '../analysis/projectReport.mjs';
import { sectionToAOA } from '../analysis/reportPackage.mjs';

// Report sections must read the shapes the study pages actually save, not
// hand-written fixtures, so these tests feed real engine output through them.

function lifecycleOptions(studyKey, result) {
  const context = captureStudyRunContext(studyKey, {
    projectSnapshot: { project: 'report-study-test' },
    inputs: { studyKey, revision: 1 },
    options: { mode: 'test' },
    scenario: 'Base',
    projectIdentity: { projectId: 'report-study-test', projectName: 'Report Study Test' },
  });
  return {
    studyProvenance: { [studyKey]: buildStudyProvenance(studyKey, result, context, { validity: 'evaluated' }) },
    currentStudyContext: context,
  };
}

(function testLoadFlowSectionReadsSolverOutput() {
  const components = [
    { id: 'SRC', type: 'bus', busType: 'slack', baseKV: 0.48 },
    { id: 'MCC', type: 'bus', busType: 'PQ', baseKV: 0.48, load: { kw: 75, kvar: 15 } },
    { id: 'C1', type: 'cable', label: 'C1', connections: [{ target: 'SRC' }, { target: 'MCC' }], cable: { impedance: { r: 0.01, x: 0.005 } } },
  ];
  const model = buildLoadFlowModel({ sheets: [{ name: 'Sheet 1', components }] });
  // studies/loadFlow.js persists a JSON round trip of runLoadFlow() output.
  const stored = JSON.parse(JSON.stringify(runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 30 })));
  assert.ok(stored.converged, 'fixture load flow converges');

  const section = buildLoadFlowSection({ loadFlow: stored }, {}, lifecycleOptions('loadFlow', stored));
  const mcc = section.busRows.find(row => row.id === 'MCC');
  assert.ok(mcc, 'MCC bus row is present');
  assert.strictEqual(mcc.resultEligibility, 'eligible');
  assert.ok(Math.abs(mcc.voltagePu - 0.9964) < 0.001, `MCC voltage ${mcc.voltagePu} pu`);
  assert.ok(Math.abs(mcc.voltageKv - 0.4783) < 0.001, `MCC voltage ${mcc.voltageKv} kV`);
  assert.strictEqual(mcc.loadKW, 75);
  assert.strictEqual(mcc.loadKVAR, 15);
  assert.ok(Number.isFinite(mcc.angleDeg));

  assert.strictEqual(section.branchRows.length, 1, 'branch flows come from the solver `lines` array');
  const branch = section.branchRows[0];
  assert.strictEqual(branch.fromBus, 'SRC');
  assert.strictEqual(branch.toBus, 'MCC');
  assert.ok(branch.flowKW > 75 && branch.flowKW < 76, `branch flow ${branch.flowKW} kW`);

  const html = renderPackageHTML(buildReportPackage({ sections: ['loadFlow'] }, { loadFlow: section }), {});
  assert.match(html, /Branch Flows/);
  assert.doesNotMatch(html, /<td>MCC<\/td><td>—<\/td>/, 'bus cells are populated');
  console.log('✓ load flow section reads runLoadFlow output');
})();

(function testLoadFlowSectionLabelsUnbalancedPhases() {
  const stored = {
    converged: true,
    buses: [
      { id: 'b1', displayLabel: 'SWBD-1', Vm: 0.99, Va: -1, voltageKV: 0.475, Pd: 10, Qd: 2, phase: 'A' },
      { id: 'b1', displayLabel: 'SWBD-1', Vm: 0.98, Va: -121, voltageKV: 0.470, Pd: 12, Qd: 3, phase: 'B' },
    ],
    lines: [],
  };
  const section = buildLoadFlowSection({ loadFlow: stored }, {}, lifecycleOptions('loadFlow', stored));
  assert.deepStrictEqual(section.busRows.map(row => row.id), ['SWBD-1 (A)', 'SWBD-1 (B)']);
  console.log('✓ load flow section labels unbalanced phases');
})();

(function testMotorStartSectionReadsPageResults() {
  const criteria = { maxVoltageSagPct: 15, maxAccelerationTimeSec: 10 };
  const cases = [{
    id: 'M-101', label: 'M-101', hp: 200, volts: 480, powerFactor: 0.88, efficiency: 0.94,
    inrushMultiple: 6, theveninR: 0.002, theveninX: 0.01, inertia: 5, speedRpm: 1800, type: 'dol',
  }];
  const results = cases.map(input => calculateMotorStartCase(input, criteria));
  // Shape saved by analysis/motorStart.js (Motor Starting page).
  const stored = { runAt: '2026-11-20T00:00:00.000Z', method: 'Thevenin screening', criteria, cases, results, startingKva: 1, startingKw: 1 };

  const section = buildMotorStartSection({ motorStart: stored }, {}, lifecycleOptions('motorStart', stored));
  assert.deepStrictEqual(section.rows.map(row => row.id), ['M-101'], 'rows are motors, not the saved object keys');
  assert.strictEqual(section.rows[0].inrushKA, results[0].inrushKA);
  assert.strictEqual(section.rows[0].voltageSagPct, results[0].voltageSagPct);
  assert.strictEqual(section.rows[0].method, 'dol');
  assert.strictEqual(section.rows[0].status, results[0].status);

  // One-Line study button saves a map of motor id -> result.
  const mapShaped = { 'motor-1': { label: 'M-201', inrushKA: 2.1, voltageSagPct: 6.5, accelTime: 3.2, starterType: 'dol' } };
  const mapSection = buildMotorStartSection({ motorStart: mapShaped }, {}, lifecycleOptions('motorStart', mapShaped));
  assert.deepStrictEqual(mapSection.rows.map(row => row.id), ['M-201']);
  console.log('✓ motor starting section reads saved results');
})();

(function testHeatTraceSectionWithholdsStaleBranches() {
  const result = { totalCircuitWatts: 1200, installedTotalWatts: 1400, lineLengthFt: 100, recommendedCableRatingWPerFt: 8, installedWPerFt: 8 };
  const context = inputs => captureStudyRunContext('heatTraceSizing', {
    inputs,
    options: { unitSystem: 'imperial' },
    projectSnapshot: { source: 'heat-trace-report-test' },
    projectIdentity: { projectId: 'ht', projectName: 'HT' },
    scenario: 'base',
  });
  const savedCase = (id, savedInputs, currentInputs) => ({
    id, name: id, unitSystem: 'imperial', inputs: currentInputs, result,
    _provenance: buildHeatTraceCaseProvenance({ id, inputs: savedInputs, result }, context(savedInputs)),
  });
  const fresh = savedCase('HT-FRESH', { lineLengthFt: 100, voltageV: 240 }, { lineLengthFt: 100, voltageV: 240 });
  const stale = savedCase('HT-STALE', { lineLengthFt: 90, voltageV: 240 }, { lineLengthFt: 100, voltageV: 240 });
  const assess = caseItem => assessHeatTraceCase(caseItem, context(caseItem.inputs));

  const report = generateProjectReport({ studies: { heatTraceSizingCircuits: [fresh, stale] }, assessHeatTraceCase: assess });
  const { rows, summary } = report.heatTrace.branchSchedule;
  assert.strictEqual(rows.find(row => row.name === 'HT-STALE').status, 'invalid', 'stale branch is withheld');
  assert.notStrictEqual(rows.find(row => row.name === 'HT-FRESH').status, 'invalid', 'current branch is reported');
  assert.strictEqual(summary.eligibleBranchCount, 1, 'only the current branch is counted');
  assert.strictEqual(summary.totalRequiredKw, 1.2);

  // Without an assessor the report cannot prove freshness, so nothing is totalled.
  const unassessed = generateProjectReport({ studies: { heatTraceSizingCircuits: [fresh, stale] } });
  assert.strictEqual(unassessed.heatTrace.branchSchedule.summary.eligibleBranchCount, 0);
  assert.strictEqual(unassessed.heatTrace.branchSchedule.summary.totalRequiredKw, 0);
  console.log('✓ heat trace section withholds stale branches');
})();

(function testArcFlashSectionWithholdsImplausibleBoundary() {
  const results = {
    'comp-swbd': { equipmentTag: 'SWBD-101', incidentEnergy: 3.8, boundary: 42, workingDistance: 457.2, clearingTime: 0.1, nominalVoltage: 480 },
    'comp-lp': { equipmentTag: 'LP-101', incidentEnergy: 0.7, boundary: 300, workingDistance: 457.2, clearingTime: 0.05, nominalVoltage: 208 },
  };
  const section = buildArcFlashSection({ arcFlash: results }, {}, { ...lifecycleOptions('arcFlash', results), withholdIneligible: false });
  const swbd = section.rows.find(row => row.id === 'SWBD-101');
  assert.ok(swbd, 'rows are labelled by equipment tag');
  assert.strictEqual(swbd.boundary, '—', '42 mm with 3.8 cal/cm² at 457 mm is withheld');
  assert.strictEqual(swbd.incidentEnergy, '—');
  assert.ok(swbd.warnings.some(warning => /check boundary units/.test(warning)));
  const lp = section.rows.find(row => row.id === 'LP-101');
  assert.strictEqual(lp.boundary, 300, 'a plausible boundary below 1.2 cal/cm² is reported');
  console.log('✓ arc flash section withholds an implausible boundary');
})();

(function testReportNumberFormattingKeepsConclusions() {
  assert.strictEqual(formatReportNumber(0.9496), '0.9496', 'not rounded up into a 0.95 pu band');
  assert.strictEqual(formatReportNumber(0.0004), '0.0004');
  assert.strictEqual(formatReportNumber(9e-5), '9.00e-5', 'small probabilities are not printed as 0');
  assert.strictEqual(formatReportNumber(99.99991), '99.9999', 'availability is not rounded to 100');
  assert.strictEqual(formatReportNumber(1757), (1757).toLocaleString());
  assert.strictEqual(formatReportNumber(0), '0');
  assert.strictEqual(formatReportNumber(Number.NaN), '—');
  console.log('✓ report number formatting keeps conclusions');
})();

(function testCableSectionUsesTagsVoltagesAndRouteResults() {
  const cables = [
    { id: 'cbl-a', tag: 'CBL-A', from: 'SWBD', to: 'MCC', conductor_size: '#2 AWG', insulation_type: 'THHN', cable_rating: 600, voltage: '480', length: 100, raceway_ids: ['TR-1'] },
    { id: 'cbl-b', tag: 'CBL-B', from: 'SWBD', to: 'LP', conductor_size: '#4 AWG', insulation_type: 'THHN', cable_rating: 600, operating_voltage: 208, length: 50, raceway_ids: ['TR-1'] },
    { id: 'cbl-c', tag: 'CBL-C', from: 'MCC', to: 'PMP', conductor_size: '#6 AWG', insulation_type: 'THHN', cable_rating: 600, length: 40 },
  ];
  const routeResults = { batchResults: [
    { cable: 'CBL-A', status: 'Routed', total_length: 130, route_segments: [{ raceway_id: 'TR-1' }] },
    { cable: 'CBL-B', status: 'Routed', total_length: 52, route_segments: [{ raceway_id: 'TR-1' }] },
  ] };
  const { cables: section } = generateProjectReport({ cables, routeResults });
  const byTag = Object.fromEntries(section.rows.map(row => [row.id, row]));
  assert.deepStrictEqual(Object.keys(byTag), ['CBL-A', 'CBL-B', 'CBL-C'], 'rows use cable tags, not internal ids');
  assert.strictEqual(byTag['CBL-A'].ratedVoltage, 600);
  assert.strictEqual(byTag['CBL-A'].operatingVoltage, 480, 'legacy voltage field is the operating voltage');
  assert.strictEqual(byTag['CBL-B'].operatingVoltage, 208);
  assert.strictEqual(byTag['CBL-A'].routeStatus, 'Routed');
  assert.strictEqual(byTag['CBL-A'].routedLengthFt, 130);
  assert.strictEqual(byTag['CBL-A'].lengthMismatch, true, '130 ft routed vs 100 ft scheduled is flagged');
  assert.strictEqual(byTag['CBL-B'].lengthMismatch, false, '2 ft difference is within tolerance');
  assert.strictEqual(byTag['CBL-C'].routeStatus, 'Not routed');
  assert.strictEqual(section.summary.routed, 2);
  assert.strictEqual(section.summary.unrouted, 1);
  assert.strictEqual(section.summary.lengthMismatches, 1);

  // Without saved route results, assignment is not reported as routing.
  const { cables: assignedOnly } = generateProjectReport({ cables });
  assert.strictEqual(assignedOnly.summary.routed, null);
  assert.strictEqual(assignedOnly.summary.assigned, 2);
  assert.strictEqual(assignedOnly.rows[0].routeStatus, 'Assigned');
  console.log('✓ cable section uses tags, separate voltages, and route results');
})();

(function testWorkbookHeadersUseKeysAndLabels() {
  const aoa = sectionToAOA({
    key: 'cyberCompliance',
    headers: [{ key: 'asset', label: 'Asset' }, { key: 'status', label: 'Status' }],
    rows: [{ asset: 'RTU-1', status: 'gap' }],
  });
  assert.deepStrictEqual(aoa, [['Asset', 'Status'], ['RTU-1', 'gap']], 'header objects map to labels and values');
  const exported = sectionToAOA({
    key: 'routing',
    headers: [{ key: 'cable', label: 'Cable' }],
    exportHeaders: [{ key: 'cable', label: 'Cable' }, { key: 'routeSignature', label: 'Route signature' }, { key: 'meta', label: 'Meta' }],
    rows: [{ cable: 'CBL-A', routeSignature: 'abc123', meta: { a: 1 } }],
  });
  assert.deepStrictEqual(exported, [['Cable', 'Route signature', 'Meta'], ['CBL-A', 'abc123', '{"a":1}']]);
  console.log('✓ workbook headers use keys and labels');
})();

console.log('project report study section tests passed');
