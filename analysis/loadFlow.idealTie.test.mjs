import assert from 'node:assert';
import { runLoadFlow } from './loadFlow.js';
import { buildLoadFlowModel } from './loadFlowModel.js';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      res.then(() => console.log('  \u2713', name))
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

describe('Ideal tie handling in load flow', () => {
  it('maintains a zero-impedance cable tie between source and load', () => {
    const sourceComponent = {
      id: 'source',
      type: 'bus',
      busType: 'slack',
      baseKV: 0.48
    };
    const loadComponent = {
      id: 'load',
      type: 'bus',
      busType: 'PQ',
      baseKV: 0.48,
      load: { kw: 75, kvar: 15 }
    };
    const tieCable = {
      id: 'cab-tie',
      type: 'cable',
      label: 'CAB-TIE',
      connections: [
        { target: 'source' },
        { target: 'load' }
      ],
      cable: { impedance: { r: 0, x: 0 } }
    };

    const model = buildLoadFlowModel({ sheets: [{ name: 'test', components: [sourceComponent, loadComponent, tieCable] }] });
    const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 30 });
    assert.strictEqual(result.converged, true, 'Load flow should converge with an ideal tie');
    const sourceBus = result.buses.find(b => b.id === 'source');
    const loadBus = result.buses.find(b => b.id === 'load');
    assert(sourceBus && loadBus, 'Both buses should be present in the results');
    assert(Math.abs(loadBus.Vm - sourceBus.Vm) < 1e-5, 'Ideal tie should keep bus voltages nearly equal');
    assert(result.maxMismatch < 1e-5, 'Mismatch should be negligible when buses are tied');
    const warning = result.warnings.find(msg => msg.toLowerCase().includes('ideal tie'));
    assert(warning, 'Ideal tie assumption should emit a warning for visibility');
  });
});
