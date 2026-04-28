import assert from 'node:assert/strict';

global.localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
};

const {
  buildArcFlashEquipmentRows,
  buildArcFlashStudyPackage,
  normalizeArcFlashEquipmentRow,
  normalizeArcFlashStudyCase,
  renderArcFlashStudyHTML,
  runArcFlashStudyCase,
} = await import('../analysis/arcFlashStudyCase.mjs');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result
        .then(() => console.log('  \u2713', name))
        .catch(err => {
          console.log('  \u2717', name);
          console.error(err);
          process.exitCode = 1;
        });
      return;
    }
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
      name: 'Main',
      components: [{
        id: 'BUS1',
        type: 'bus',
        label: 'MSB-1',
        tag: 'MSB-1',
        kV: 0.48,
        z1: { r: 0, x: 0.05 },
        z2: { r: 0, x: 0.05 },
        z0: { r: 0, x: 0.05 },
        sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
        enclosure: 'box',
        gap: 32,
        working_distance: 455,
        electrode_config: 'VCB',
        enclosure_height: 508,
        enclosure_width: 508,
        enclosure_depth: 508,
        clearing_time: 0.2,
        tccId: 'main-breaker',
      }],
    }],
  };
}

describe('arc-flash study case', () => {
  it('normalizes equipment rows with defaults and voltage conversion', () => {
    const row = normalizeArcFlashEquipmentRow({
      component: { id: 'BUS1', tag: 'MSB-1', kV: 0.48 },
    });
    assert.equal(row.equipmentId, 'BUS1');
    assert.equal(row.nominalVoltageV, 480);
    assert(row.defaultedFields.includes('gapMM'));
    assert(row.defaultedFields.includes('workingDistanceMM'));
  });

  it('normalizes study-case defaults and report presets', () => {
    assert.equal(normalizeArcFlashStudyCase({ reportPreset: 'bad' }).reportPreset, 'summary');
    assert.equal(normalizeArcFlashStudyCase({ reportPreset: 'mitigation', includeDcArcFlashNote: true }).reportPreset, 'mitigation');
  });

  it('builds one-line equipment rows and preserves explicit overrides', () => {
    const rows = buildArcFlashEquipmentRows({
      oneLine: sampleOneLine(),
      existingRows: [{ equipmentId: 'BUS1', gapMM: 40, notes: 'verified' }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gapMM, 40);
    assert.equal(rows[0].notes, 'verified');
  });

  it('keeps legacy result maps reportable in the package shape', () => {
    const pkg = buildArcFlashStudyPackage({
      projectName: 'Legacy',
      results: {
        BUS1: {
          equipmentTag: 'MSB-1',
          incidentEnergy: 4.2,
          boundary: 850,
          ppeCategory: 2,
          clearingTime: 0.2,
          workingDistance: 455,
          upstreamDevice: 'Main',
          requiredInputs: [],
        },
      },
      mitigationScenarios: [{ id: 'baseline', name: 'Baseline', enabled: true }],
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert.equal(pkg.version, 'arc-flash-study-case-v1');
    assert.equal(pkg.scenarioComparison.length, 1);
    assert.equal(pkg.scenarioComparison[0].equipmentTag, 'MSB-1');
  });

  it('runs through the existing calculation path and compares mitigation scenarios', async () => {
    const execution = await runArcFlashStudyCase({
      oneLine: sampleOneLine(),
      studyCase: { reportPreset: 'mitigation' },
      equipmentRows: buildArcFlashEquipmentRows({ oneLine: sampleOneLine() }),
      mitigationScenarios: [
        { id: 'baseline', name: 'Baseline', enabled: true },
        { id: 'maintenance-mode', name: 'Maintenance <Mode>', enabled: true, clearingTimeMultiplier: 0.5, faultCurrentMultiplier: 1 },
        { id: 'current-limiting', name: 'Current Limiting', enabled: true, clearingTimeMultiplier: 1, faultCurrentMultiplier: 0.5 },
      ],
    });
    const baseline = execution.scenarioComparison.find(row => row.scenarioId === 'baseline');
    const maintenance = execution.scenarioComparison.find(row => row.scenarioId === 'maintenance-mode');
    const currentLimit = execution.scenarioComparison.find(row => row.scenarioId === 'current-limiting');
    assert(baseline.incidentEnergy > 0);
    assert(maintenance.incidentEnergy < baseline.incidentEnergy);
    assert(currentLimit.incidentEnergy < baseline.incidentEnergy);
    assert(maintenance.deltaIncidentEnergy < 0);
  });

  it('summarizes scenario comparison and escapes rendered HTML', async () => {
    const execution = await runArcFlashStudyCase({
      oneLine: sampleOneLine(),
      equipmentRows: [{ ...buildArcFlashEquipmentRows({ oneLine: sampleOneLine() })[0], equipmentTag: 'MSB <1>', notes: '<script>bad()</script>' }],
      mitigationScenarios: [
        { id: 'baseline', name: 'Baseline <bad>', enabled: true },
        { id: 'maintenance-mode', name: 'Maintenance <Mode>', enabled: true, clearingTimeMultiplier: 0.5 },
      ],
    });
    const pkg = buildArcFlashStudyPackage({
      projectName: 'Arc <Project>',
      ...execution,
      generatedAt: '2026-04-27T00:00:00.000Z',
    });
    assert.equal(pkg.summary.scenarioCount, 2);
    const html = renderArcFlashStudyHTML(pkg);
    assert(html.includes('MSB &lt;1&gt;'));
    assert(html.includes('Baseline &lt;bad&gt;'));
    assert(!html.includes('MSB <1>'));
    assert(!html.includes('<script>'));
  });
});
