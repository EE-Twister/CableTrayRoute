import assert from 'node:assert/strict';
import {
  buildCableTemperatureTimeline,
  buildCableThermalEnvironmentPackage,
  buildDeratingWaterfall,
  buildThermalInstallationAlternatives,
  evaluateCableThermalEnvironment,
  normalizeCableThermalEnvironment,
  renderCableThermalEnvironmentHTML,
  summarizeCableThermalEnvironment,
} from '../analysis/cableThermalEnvironment.mjs';

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

const cable = {
  id: 'C-101',
  tag: 'C-101 <Main>',
  conductor_size: '4/0 AWG',
  conductor_material: 'Copper',
  insulation_type: 'XLPE',
  voltage_rating: '600 V',
  loadAmps: 180,
};

describe('cable thermal environment helpers', () => {
  it('normalizes legacy/minimal cable rows with explicit missing data warnings', () => {
    const normalized = normalizeCableThermalEnvironment({ cables: [{ tag: 'C-MIN' }] });
    assert.equal(normalized.cables.length, 1);
    assert.deepEqual(normalized.cables[0].missingFields, ['conductor_size', 'designCurrentA']);
    const rows = evaluateCableThermalEnvironment({ cables: [{ tag: 'C-MIN' }], installationMethods: ['tray'] });
    assert.equal(rows[0].status, 'missingData');
    assert(rows[0].warnings[0].includes('Missing'));
  });

  it('builds deterministic installation alternatives for all required methods', () => {
    const normalized = normalizeCableThermalEnvironment({
      cables: [cable],
      installationMethods: ['tray', 'conduit', 'direct-burial', 'ductbank', 'air'],
      ambientTempC: 35,
      earthTempC: 25,
    });
    const alternatives = buildThermalInstallationAlternatives(normalized);
    assert.deepEqual(alternatives.map(row => row.method), ['tray', 'conduit', 'direct-burial', 'ductbank', 'air']);
    assert.equal(alternatives.find(row => row.method === 'tray').ambientTempC, 35);
    assert.equal(alternatives.find(row => row.method === 'ductbank').iecMethod, 'conduit');
  });

  it('evaluates tray, conduit, burial, ductbank, and free-air rows with deterministic statuses', () => {
    const rows = evaluateCableThermalEnvironment({
      cables: [cable],
      installationMethods: ['tray', 'conduit', 'direct-burial', 'ductbank', 'air'],
      ambientTempC: 30,
      earthTempC: 20,
      soilResistivity: 1.2,
      nCables: 2,
    });
    assert.equal(rows.length, 5);
    assert(rows.every(row => Number.isFinite(row.allowableAmpacityA)));
    assert(rows.every(row => ['pass', 'warn', 'fail', 'missingData'].includes(row.status)));
    assert(rows.some(row => row.installationMethod === 'ductbank' && row.warnings.some(w => w.includes('IEC conduit screening'))));
  });

  it('identifies limiting factors and derating waterfall rows', () => {
    const [row] = evaluateCableThermalEnvironment({
      cables: [{ ...cable, loadAmps: 340 }],
      installationMethods: ['direct-burial'],
      soilResistivity: 3.0,
      nCables: 4,
      groupArrangement: 'flat-touching',
    });
    const waterfall = buildDeratingWaterfall(row);
    assert(waterfall.length >= 2);
    assert(['load current', 'soil thermal resistivity', 'grouping'].includes(row.limitingFactor));
    assert(waterfall.some(item => item.factor === 'Design current loading'));
  });

  it('builds a cyclic load temperature timeline and flags high-temperature points', () => {
    const [row] = evaluateCableThermalEnvironment({
      cables: [cable],
      installationMethods: ['tray'],
    });
    const timeline = buildCableTemperatureTimeline(row, [
      { hour: 0, loadPct: 50 },
      { hour: 12, loadPct: 104 },
    ]);
    assert.equal(timeline.length, 2);
    assert.equal(timeline[1].status, 'fail');
    assert(Number.isFinite(timeline[1].estimatedConductorTempC));
  });

  it('builds package JSON, summary, warnings, assumptions, and escaped HTML', () => {
    const pkg = buildCableThermalEnvironmentPackage({
      projectName: 'Thermal <Demo>',
      cables: [cable],
      installationMethods: ['tray', 'direct-burial'],
      soilResistivity: 3.2,
    });
    const html = renderCableThermalEnvironmentHTML(pkg);
    const summary = summarizeCableThermalEnvironment(pkg.evaluations);
    assert.equal(pkg.version, 'cable-thermal-environment-v1');
    assert.equal(pkg.summary.total, 2);
    assert.equal(summary.total, pkg.summary.total);
    assert(pkg.assumptions.some(text => text.includes('IEC 60287')));
    assert.doesNotThrow(() => JSON.stringify(pkg));
    assert(html.includes('C-101 &lt;Main&gt;'));
    assert(!html.includes('C-101 <Main>'));
  });
});
