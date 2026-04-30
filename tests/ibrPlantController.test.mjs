import assert from 'node:assert/strict';
import {
  IBR_PLANT_CONTROLLER_VERSION,
  buildIbrPlantControllerPackage,
  evaluateIbrPlantControllerScenario,
  normalizeGridCodeCurveRows,
  normalizeIbrPlantControllerCase,
  normalizeIbrResourceRows,
  normalizeIbrScenarioRows,
  renderIbrPlantControllerHTML,
} from '../analysis/ibrModeling.mjs';
import { generateProjectReport } from '../analysis/projectReport.mjs';
import { buildDesignCoachActions } from '../analysis/designCoach.mjs';
import { buildReportPackage } from '../reports/reportPackage.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const plantCase = {
  name: 'Plant <A>',
  pccTag: 'PCC <Main>',
  plantMode: 'gridFollowing',
  controlMode: 'voltVar',
  priorityMode: 'reactivePriority',
  shortCircuitRatio: 2.5,
  reportPreset: 'fullStudy',
  reviewNotes: 'Utility <review>',
};

const resources = [
  {
    id: 'pv-1',
    tag: 'PV <Array>',
    resourceType: 'pv',
    ratedKw: 5000,
    ratedKva: 5000,
    Pstc_kW: 5200,
    requestedKw: 5000,
    rampRateKwPerMin: 100,
    previousKw: 4000,
  },
  {
    id: 'bess-1',
    tag: 'BESS <A>',
    resourceType: 'bess',
    ratedKw: 2000,
    ratedKva: 2500,
    socPct: 70,
    requestedKw: 1800,
    requestedKvar: 400,
  },
];

const curves = [
  { id: 'vv', label: 'Volt <VAR>', curveType: 'voltVar', points: [[0.92, 0.44], [0.98, 0], [1.02, 0], [1.08, -0.44]] },
  { id: 'vw', label: 'Volt-Watt', curveType: 'voltWatt', points: [[1, 1], [1.08, 0.4]] },
  { id: 'vr', label: 'Voltage ride', curveType: 'voltageRideThrough', points: [[0.88, 0], [1, 2], [1.1, 0]] },
  { id: 'fr', label: 'Frequency ride', curveType: 'frequencyRideThrough', points: [[59, 0], [60, 2], [61, 0]] },
];

const scenarios = [
  { id: 'base', label: 'Base <case>', scenarioType: 'base', voltagePu: 1, frequencyHz: 60, shortCircuitRatio: 5 },
  { id: 'weak', label: 'Weak grid', scenarioType: 'weakGrid', voltagePu: 0.92, frequencyHz: 60.04, shortCircuitRatio: 2.5, durationMin: 1 },
];

describe('IBR plant-controller normalization', () => {
  it('normalizes plant-case defaults and rejects invalid modes', () => {
    const normalized = normalizeIbrPlantControllerCase(plantCase);
    assert.equal(normalized.name, 'Plant <A>');
    assert.equal(normalized.controlMode, 'voltVar');
    assert.equal(normalized.reportPreset, 'fullStudy');
    assert.equal(normalizeIbrPlantControllerCase({ controlMode: 'voltVar' }).priorityMode, 'activePowerPriority');
    assert.throws(() => normalizeIbrPlantControllerCase({ plantMode: 'bad' }), /plantMode/);
    assert.throws(() => normalizeIbrPlantControllerCase({ controlMode: 'bad' }), /controlMode/);
  });

  it('normalizes resource rows including missing-data and disabled rows', () => {
    const rows = normalizeIbrResourceRows([
      ...resources,
      { id: 'generic-1', tag: 'Generic', resourceType: 'genericInverter', enabled: false },
      { id: 'missing-1', tag: 'Missing', resourceType: 'ibr' },
    ]);
    assert.equal(rows[0].resourceType, 'pv');
    assert.equal(rows[2].status, 'disabled');
    assert.equal(rows[3].status, 'missingData');
    assert(rows[3].missingFields.includes('ratedKva'));
  });

  it('normalizes curve and scenario rows and rejects malformed curves', () => {
    assert.equal(normalizeGridCodeCurveRows(curves).length, 4);
    assert.equal(normalizeIbrScenarioRows(scenarios)[1].scenarioType, 'weakGrid');
    assert.throws(() => normalizeGridCodeCurveRows([{ curveType: 'voltVar', points: [[1, 0], [1, 1]] }]), /unique increasing/);
    assert.throws(() => normalizeIbrScenarioRows([{ voltagePu: 0 }]), /voltagePu/);
  });
});

describe('IBR plant-controller evaluation and package', () => {
  it('produces deterministic dispatch, capability, grid-code, and warning rows', () => {
    const evaluation = evaluateIbrPlantControllerScenario({ plantCase, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    assert.equal(evaluation.dispatchRows.length, 4);
    assert.equal(evaluation.capabilityRows.length, 2);
    assert(evaluation.capabilityRows.some(row => row.shortCircuitRatio === 2.5 && row.status === 'warn'));
    assert(evaluation.warningRows.some(row => row.code === 'rampLimit'));
    assert(evaluation.gridCodeRows.some(row => row.checkType === 'curveBasis'));
  });

  it('reactive and active priority modes produce different stable capability rows', () => {
    const reactive = buildIbrPlantControllerPackage({ plantCase: { ...plantCase, priorityMode: 'reactivePriority' }, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    const active = buildIbrPlantControllerPackage({ plantCase: { ...plantCase, priorityMode: 'activePowerPriority' }, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    assert.notDeepEqual(reactive.dispatchRows.map(row => row.qDispatchKvar), active.dispatchRows.map(row => row.qDispatchKvar));
    assert.equal(reactive.version, IBR_PLANT_CONTROLLER_VERSION);
  });

  it('package JSON and rendered HTML include expected sections and escape user text', () => {
    const pkg = buildIbrPlantControllerPackage({ projectName: 'DER <Project>', plantCase, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    assert.equal(pkg.projectName, 'DER <Project>');
    assert(pkg.resourceRows.length);
    assert(pkg.curveRows.length);
    assert(pkg.scenarioRows.length);
    assert(pkg.dispatchRows.length);
    assert(pkg.capabilityRows.length);
    assert(pkg.gridCodeRows.length);
    assert(pkg.rideThroughRows.length);
    assert(pkg.warningRows.length);
    const html = renderIbrPlantControllerHTML(pkg);
    assert(html.includes('DER / IBR Plant Controller'));
    assert(html.includes('Plant &lt;A&gt;'));
    assert(!html.includes('Plant <A>'));
  });
});

describe('IBR plant-controller integrations', () => {
  it('project report and report package include IBR plant-controller metadata and CSV rows', () => {
    const pkg = buildIbrPlantControllerPackage({ projectName: 'DER Project', plantCase, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    const report = generateProjectReport({ projectName: 'DER Project', studies: { ibrPlantController: pkg } });
    assert.equal(report.ibrPlantController.version, IBR_PLANT_CONTROLLER_VERSION);
    const reportPackage = buildReportPackage(report, { projectName: 'DER Project' });
    assert(reportPackage.manifest || reportPackage.files);
    const section = reportPackage.sections.find(row => row.id === 'ibrPlantController');
    assert(section);
    assert(section.rowCount > 0);
    const csv = reportPackage.files.find(file => file.path === 'data/ibr_plant_controller.csv');
    assert(csv && csv.content.includes('capability'));
  });

  it('Design Coach flags legacy IBR results and package warning rows', () => {
    const legacyActions = buildDesignCoachActions({ studies: { ibr: { pvResult: { pAC_kW: 100 } } }, report: {} });
    assert(legacyActions.some(action => action.source.type === 'ibrPlantController'));
    const pkg = buildIbrPlantControllerPackage({ projectName: 'DER Project', plantCase, resourceRows: resources, curveRows: curves, scenarioRows: scenarios });
    const actions = buildDesignCoachActions({ studies: { ibrPlantController: pkg }, report: { ibrPlantController: pkg } });
    assert(actions.some(action => action.source.type === 'ibrPlantController' && /warning|capability|grid-code/.test(action.source.key)));
  });
});
