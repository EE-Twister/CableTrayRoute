import assert from 'node:assert/strict';

global.localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
};

const {
  buildShortCircuitDutyRows,
  buildShortCircuitStudyPackage,
  normalizeShortCircuitStudyCase,
  renderShortCircuitStudyHTML,
  runShortCircuitStudyCase,
} = await import('../analysis/shortCircuitStudyCase.mjs');
const {
  buildEquipmentEvaluationInventory,
  evaluateEquipmentDuty,
} = await import('../analysis/equipmentEvaluation.mjs');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

function sampleOneLine() {
  return {
    activeSheet: 0,
    sheets: [{
      name: 'SC',
      components: [
        {
          id: 'bus-main',
          subtype: 'Bus',
          type: 'bus',
          kV: 13.8,
          area: 'Plant',
          zone: 'MV',
          z1: { r: 0, x: 1 },
          z2: { r: 0, x: 1 },
          z0: { r: 0, x: 1 },
          sources: [{ z1: { r: 0, x: 0.5 }, z2: { r: 0, x: 0.5 }, z0: { r: 0, x: 1 } }],
          xr_ratio: 8,
        },
        {
          id: 'bus-aux',
          subtype: 'Bus',
          type: 'bus',
          kV: 0.48,
          area: 'Utility',
          zone: 'LV',
          z1: { r: 0, x: 0.05 },
          z2: { r: 0, x: 0.05 },
          z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
          xr_ratio: 6,
        },
      ],
    }],
  };
}

describe('short-circuit study case', () => {
  it('normalizes defaults and rejects invalid values', () => {
    const row = normalizeShortCircuitStudyCase({});
    assert.equal(row.method, 'Auto');
    assert.equal(row.dutyBasis, 'equipmentEvaluation');
    assert.deepEqual(row.faultTypes, ['threePhase', 'lineToGround', 'lineToLine', 'doubleLineGround']);
    assert.throws(() => normalizeShortCircuitStudyCase({ method: 'bad' }), /Unsupported/);
    assert.throws(() => normalizeShortCircuitStudyCase({ faultTypes: ['bad'] }), /Unsupported/);
  });

  it('runs ANSI and IEC cases deterministically through the existing engine', () => {
    const ansi = runShortCircuitStudyCase({ oneLine: sampleOneLine(), studyCase: { method: 'ANSI' } });
    const iec = runShortCircuitStudyCase({ oneLine: sampleOneLine(), studyCase: { method: 'IEC' } });
    assert.equal(ansi.results['bus-main'].method, 'ANSI');
    assert.equal(iec.results['bus-main'].method, 'IEC');
    assert(ansi.results['bus-main'].threePhaseKA > 1);
    assert(iec.results['bus-main'].threePhaseKA > 1);
  });

  it('filters scope by voltage, area, zone, include text, and exclude text', () => {
    const run = runShortCircuitStudyCase({
      oneLine: sampleOneLine(),
      studyCase: {
        scope: {
          area: 'Plant',
          zone: 'MV',
          minKv: 1,
          maxKv: 15,
          includeText: 'main',
          excludeText: 'aux',
        },
      },
    });
    assert.deepEqual(Object.keys(run.results), ['bus-main']);
  });

  it('creates min/nominal/max sensitivity duty rows', () => {
    const pkg = buildShortCircuitStudyPackage({
      projectName: 'SC',
      oneLine: sampleOneLine(),
      studyCase: { voltageCase: 'sensitivity', voltageSensitivityPct: 10 },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const rows = pkg.dutyRows.filter(row => row.busId === 'bus-main');
    assert.deepEqual(rows.map(row => row.voltageCase), ['minimum', 'nominal', 'maximum']);
    assert(rows[0].dutyValueKA < rows[1].dutyValueKA);
    assert(rows[2].dutyValueKA > rows[1].dutyValueKA);
  });

  it('selects duty rows by requested basis', () => {
    const results = {
      bus1: {
        method: 'ANSI',
        prefaultKV: 0.48,
        threePhaseKA: 10,
        asymKA: 22,
        lineToGroundKA: 8,
        lineToLineKA: 9,
        doubleLineGroundKA: 7,
      },
    };
    assert.equal(buildShortCircuitDutyRows(results, { dutyBasis: 'momentary' })[0].dutyValueKA, 22);
    assert.equal(buildShortCircuitDutyRows(results, { dutyBasis: 'interrupting' })[0].dutyValueKA, 10);
    assert.equal(buildShortCircuitDutyRows(results, { dutyBasis: 'relay' })[0].dutyValueKA, 8);
  });

  it('lets equipment evaluation consume packaged duty rows before legacy three-phase values', () => {
    const pkg = buildShortCircuitStudyPackage({
      projectName: 'SC',
      oneLine: sampleOneLine(),
      studyCase: { method: 'ANSI', dutyBasis: 'momentary' },
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    const duty = pkg.dutyRows.find(row => row.busId === 'bus-aux').dutyValueKA;
    const inventory = buildEquipmentEvaluationInventory({
      equipment: [{ tag: 'bus-aux', oneLineRef: 'bus-aux', interruptRatingKa: 65 }],
      oneLine: sampleOneLine(),
      studyResults: { shortCircuit: pkg },
    });
    const rows = evaluateEquipmentDuty(inventory);
    const interrupt = rows.find(row => row.ratingType === 'Interrupting Rating');
    assert.equal(interrupt.requiredValue, duty);
  });

  it('escapes rendered HTML content', () => {
    const pkg = buildShortCircuitStudyPackage({
      projectName: 'SC <bad>',
      oneLine: {
        activeSheet: 0,
        sheets: [{ name: 'X', components: [{
          id: 'bus-<1>',
          subtype: 'Bus',
          type: 'bus',
          kV: 0.48,
          z1: { r: 0, x: 0.05 },
          z2: { r: 0, x: 0.05 },
          z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
        }] }],
      },
      studyCase: { notes: '<script>alert(1)</script>' },
    });
    const html = renderShortCircuitStudyHTML(pkg);
    assert(html.includes('bus-&lt;1&gt;'));
    assert(!html.includes('bus-<1>'));
  });
});
