import assert from 'node:assert';

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

const { buildLoadFlowModel } = await import('../../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../../analysis/loadFlow.js');

describe('Transformer orientation handling', () => {
  it('uses the primary bus as the from side even when the secondary connection is listed first', () => {
    const fixture = {
      sheets: [
        {
          components: [
            {
              id: 'hv_bus',
              type: 'slack',
              subtype: 'Bus',
              baseKV: 13.8
            },
            {
              id: 'lv_bus',
              type: 'PQ',
              subtype: 'Bus',
              baseKV: 0.48
            },
            {
              id: 'xfmr1',
              type: 'transformer',
              subtype: 'two_winding',
              connections: [
                { target: 'lv_bus', sourcePort: 1 },
                { target: 'hv_bus', sourcePort: 0 }
              ],
              voltage_primary: 13.8,
              voltage_secondary: 0.48,
              kva_primary: 1500,
              kva_secondary: 1500,
              percent_z: 5,
              tap: { ratio: 1 }
            },
            {
              id: 'load1',
              type: 'load',
              connections: ['lv_bus'],
              kw: 1,
              kvar: 0.4
            }
          ]
        }
      ]
    };

    const model = buildLoadFlowModel(fixture);
    const branch = model.branches.find(item => item.id === 'xfmr1');
    assert(branch, 'Transformer branch should be constructed');
    assert.strictEqual(branch.from, 'hv_bus', 'Transformer should orient from the primary bus');
    assert.strictEqual(branch.to, 'lv_bus', 'Transformer secondary should remain on the to side');
    assert(branch.tap, 'Derived tap data should be present');
    const expectedRatio = 13.8 / 0.48;
    assert(Math.abs(branch.tap.ratio - expectedRatio) < 1e-6, 'Tap ratio should match the primary to secondary voltage ratio');

    const result = runLoadFlow(model, { baseMVA: 10, balanced: true });
    assert(result.converged, 'Load flow should converge with correctly oriented transformer');
    const hvBus = result.buses.find(bus => bus.id === 'hv_bus');
    const lvBus = result.buses.find(bus => bus.id === 'lv_bus');
    assert(hvBus && lvBus, 'Both buses should be present in the load flow results');
    assert(Math.abs(hvBus.Vm - 1) < 1e-6, 'Primary bus voltage should remain at 1.0 pu');
    assert(lvBus.Vm > 0, 'Secondary bus voltage should be positive when the system converges');
  });
});
