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
  generateProjectReport,
  renderPackageHTML,
} from '../analysis/projectReport.mjs';

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

console.log('project report study section tests passed');
