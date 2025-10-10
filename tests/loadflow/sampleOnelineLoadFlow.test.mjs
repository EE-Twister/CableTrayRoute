import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const store = {};
const storageKeys = () => Object.keys(store);

global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => {
    store[key] = value;
  },
  removeItem: key => {
    delete store[key];
  },
  clear: () => {
    storageKeys().forEach(key => delete store[key]);
  },
  key: index => storageKeys()[index] ?? null,
  get length() {
    return storageKeys().length;
  }
};

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const samplePath = path.join(__dirname, '../../examples/sample_oneline.json');
const sampleDiagram = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

const { setOneLine } = await import('../../dataStore.mjs');
const { buildLoadFlowModel } = await import('../../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../../analysis/loadFlow.js');

describe('Published sample one-line load flow', () => {
  it('produces the expected balanced study results', () => {
    setOneLine({
      activeSheet: sampleDiagram.activeSheet ?? 0,
      sheets: sampleDiagram.sheets
    });

    const model = buildLoadFlowModel({ sheets: sampleDiagram.sheets });
    const bus = model.buses.find(b => b.id === 'n1');
    assert(bus, 'Sample diagram should contain bus n1');
    assert(bus.load, 'Bus n1 should aggregate downstream loads');
    assert(Math.abs(bus.load.kw - 600) < 1e-9, 'Aggregated kW should equal 600');
    assert(Math.abs(bus.load.kvar || 0) < 1e-9, 'Aggregated kvar should equal 0');

    const result = runLoadFlow(model, { baseMVA: 100, balanced: true });
    assert.strictEqual(result.buses.length, 1, 'Study should produce a single slack bus');
    const [slack] = result.buses;
    assert.strictEqual(slack.id, 'n1');
    assert(Math.abs(slack.Vm - 1) < 1e-9, 'Slack voltage magnitude should remain at 1.0 pu');
    assert(Math.abs(slack.Va) < 1e-9, 'Slack voltage angle should remain at 0°');
    assert(Array.isArray(result.lines));
    assert.strictEqual(result.lines.length, 0, 'No line flows expected in single-bus system');
    assert(Math.abs(result.losses.P) < 1e-6, 'Active losses should be zero');
    assert(Math.abs(result.losses.Q) < 1e-6, 'Reactive losses should be zero');
  });
});

describe('Simple feeder load flow', () => {
  it('reports negligible losses for a near-ideal feeder', () => {
    const model = {
      buses: [
        { id: 'source', type: 'slack', baseKV: 13.8 },
        { id: 'load', type: 'PQ', baseKV: 13.8, load: { kw: 100, kvar: 0 } }
      ],
      branches: [
        {
          id: 'feeder',
          from: 'source',
          to: 'load',
          impedance: { r: 0.01, x: 0 }
        }
      ]
    };

    const result = runLoadFlow(model, { baseMVA: 1, balanced: true });
    assert(result.converged, 'Load flow should converge');
    const branchFlow = result.lines.find(line => line.from === 'source' && line.to === 'load');
    assert(branchFlow, 'Feeder flow should be reported');
    assert(Math.abs(branchFlow.P - 100) < 1e-3, 'Active power transfer should remain near 100 kW');
    assert(Math.abs(result.summary.totalLoadKW - 100) < 1e-6, 'Load total should reflect 100 kW demand');
    assert(Math.abs(result.summary.totalGenKW - 100) < 1e-3, 'Generation should supply the load with negligible loss');
    assert(Array.isArray(result.losses.branches), 'Per-branch losses should be reported');
    assert(result.losses.branches.length === 1, 'Single feeder should produce one branch loss record');
    assert(Math.abs(result.losses.P) < 1e-3, 'System losses should be effectively zero');
    assert(Math.abs(result.summary.totalLossKW - result.losses.P) < 1e-9, 'Summary loss tally should match detailed losses');
  });
});
