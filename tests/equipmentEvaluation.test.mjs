import assert from 'node:assert/strict';
import {
  buildEquipmentEvaluationInventory,
  buildEquipmentEvaluationPackage,
  evaluateEquipmentDuty,
  normalizeEquipmentRatingRow,
  renderEquipmentEvaluationHTML,
  summarizeEquipmentEvaluation,
} from '../analysis/equipmentEvaluation.mjs';

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

const oneLine = {
  activeSheet: 0,
  sheets: [
    {
      name: 'Main',
      components: [
        { id: 'swbd-1', type: 'switchboard', label: 'SWBD-1', tccId: 'br-65' },
        { id: 'mcc-1', type: 'mcc', label: 'MCC-1' },
      ],
    },
  ],
};

const protectiveDevices = [
  { id: 'br-65', name: '65 kA breaker', interruptRating: 65 },
];

const studyResults = {
  shortCircuit: {
    'swbd-1': { threePhaseKA: 42 },
    'mcc-1': { availableFaultCurrentKa: 18 },
  },
  arcFlash: {
    rows: [{ id: 'swbd-1', incidentEnergy: 4.2 }],
  },
  tcc: {
    devices: [{ id: 'br-65' }],
  },
  cableFaultBracing: {
    summary: { pass: true },
  },
};

describe('equipment evaluation', () => {
  it('normalizes legacy equipment rows with blank rating fields', () => {
    const row = normalizeEquipmentRatingRow({ tag: 'MCC-1', description: 'Legacy MCC' });
    assert.equal(row.tag, 'MCC-1');
    assert.equal(row.catalogNumber, '');
    assert.equal(row.standard, '');
    assert.equal(row.interruptRatingKa, '');
    assert.equal(row.ratings.interruptRatingKa, null);
  });

  it('compares interrupting, SCCR, bus bracing, and withstand ratings deterministically', () => {
    const inventory = buildEquipmentEvaluationInventory({
      equipment: [{
        tag: 'SWBD-1',
        oneLineRef: 'swbd-1',
        interruptRatingKa: 65,
        sccrKa: 40,
        busBracingKa: 50,
        withstandRatingKa: 42,
        protectiveDeviceId: 'br-65',
      }],
      oneLine,
      protectiveDevices,
      studyResults,
      cables: [{ id: 'C-1', from: 'SWBD-1', to: 'MCC-1' }],
    });
    const rows = evaluateEquipmentDuty(inventory);
    assert.equal(rows.find(row => row.ratingType === 'Interrupting Rating').status, 'pass');
    assert.equal(rows.find(row => row.ratingType === 'SCCR').status, 'fail');
    assert.equal(rows.find(row => row.ratingType === 'Bus Bracing').status, 'pass');
    assert.equal(rows.find(row => row.ratingType === 'Withstand Rating').status, 'warn');
    assert.equal(rows.find(row => row.ratingType === 'Selected Protective Device AIC').status, 'pass');
  });

  it('marks missing short-circuit, arc-flash, TCC, cable-duty, and rating data as missingData', () => {
    const pkg = buildEquipmentEvaluationPackage({
      equipment: [{ tag: 'MCC-1', oneLineRef: 'mcc-1' }],
      oneLine,
      protectiveDevices,
      studyResults: {},
      cables: [],
    });
    assert(pkg.rows.some(row => row.status === 'missingData' && row.missingFields.includes('shortCircuit')));
    assert(pkg.rows.some(row => row.source === 'arcFlash'));
    assert(pkg.rows.some(row => row.source === 'tcc'));
    assert(pkg.rows.some(row => row.source === 'cableDuty'));
    assert.equal(pkg.summary.fail, 0);
    assert(pkg.summary.missingData > 0);
  });

  it('matches one-line and protective-device context by stable identifiers', () => {
    const inventory = buildEquipmentEvaluationInventory({
      equipment: [{ tag: 'SWBD-1', oneLineRef: 'swbd-1', protectiveDeviceId: 'br-65', interruptRatingKa: 65 }],
      oneLine,
      protectiveDevices,
      studyResults,
    });
    assert.equal(inventory.rows[0].component.id, 'swbd-1');
    assert.equal(inventory.rows[0].protectiveDevice.id, 'br-65');
    assert.equal(inventory.rows[0].fault.availableFaultKa, 42);
  });

  it('consumes packaged arc-flash rows for equipment context', () => {
    const inventory = buildEquipmentEvaluationInventory({
      equipment: [{ tag: 'SWBD-1', oneLineRef: 'swbd-1', interruptRatingKa: 65 }],
      oneLine,
      protectiveDevices,
      studyResults: {
        ...studyResults,
        arcFlash: {
          version: 'arc-flash-study-case-v1',
          summary: { highEnergyCount: 1 },
          results: {
            'swbd-1': { equipmentTag: 'SWBD-1', incidentEnergy: 12.5, ppeCategory: 3 },
          },
          scenarioComparison: [{
            scenarioId: 'baseline',
            equipmentId: 'swbd-1',
            equipmentTag: 'SWBD-1',
            incidentEnergy: 12.5,
            status: 'review',
          }],
        },
      },
    });
    assert.equal(inventory.rows[0].arcFlash.incidentEnergy, 12.5);
  });

  it('summarizes rows and escapes rendered HTML', () => {
    const pkg = buildEquipmentEvaluationPackage({
      equipment: [{ tag: 'SWBD-<1>', oneLineRef: 'swbd-1', interruptRatingKa: 65 }],
      oneLine,
      protectiveDevices,
      studyResults,
    });
    const summary = summarizeEquipmentEvaluation(pkg.rows);
    assert.equal(summary.equipmentCount, 1);
    assert.equal(summary.byStatus.pass >= 1, true);
    const html = renderEquipmentEvaluationHTML(pkg);
    assert(html.includes('SWBD-&lt;1&gt;'));
    assert(!html.includes('SWBD-<1>'));
  });
});
