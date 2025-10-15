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

  it('refreshes existing bus connection metadata to match the oriented transformer branch', () => {
    const fixture = {
      sheets: [
        {
          components: [
            {
              id: 'hv_bus',
              type: 'slack',
              subtype: 'Bus',
              baseKV: 13.8,
              connections: [
                {
                  target: 'lv_bus',
                  componentId: 'xfmr1',
                  componentType: 'transformer',
                  componentPort: 0,
                  connectionSide: 'primary',
                  connectionConfig: 'delta',
                  impedance: { r: 0, x: 0 },
                  tap: { ratio: 1 },
                  shunt: { b: 0.05 }
                }
              ]
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
              tap: { ratio: 1 },
              shunt: { b: 0.001 },
              secondary_connection: 'wye-grounded'
            },
            {
              id: 'load1',
              type: 'load',
              connections: ['lv_bus'],
              kw: 1.25,
              kvar: 0.5
            }
          ]
        }
      ]
    };

    const model = buildLoadFlowModel(fixture);
    const branch = model.branches.find(item => item.id === 'xfmr1');
    assert(branch, 'Transformer branch should exist after building the model');
    assert.strictEqual(branch.from, 'hv_bus', 'Transformer branch should orient from the primary bus');
    assert.strictEqual(branch.to, 'lv_bus', 'Transformer branch should orient to the secondary bus');

    const hvBus = model.buses.find(bus => bus.id === 'hv_bus');
    assert(hvBus, 'Primary bus should be present in the model');
    const hvConn = hvBus.connections.find(conn => (conn.componentId || conn.id) === 'xfmr1');
    assert(hvConn, 'Existing transformer connection should remain on the primary bus');
    assert.strictEqual(hvConn.target, 'lv_bus', 'Connection target should mirror the branch orientation');
    assert.deepStrictEqual(hvConn.impedance, branch.impedance, 'Connection impedance should be refreshed from the branch');
    assert.deepStrictEqual(hvConn.tap, branch.tap, 'Connection tap data should match the oriented branch');
    assert.deepStrictEqual(hvConn.shunt, branch.shunt, 'Connection shunt data should match the oriented branch');
    assert.strictEqual(hvConn.componentPort, 1, 'Connection port index should reflect the transformer secondary');
    assert.strictEqual(hvConn.connectionSide, 'secondary', 'Connection side should update to the secondary orientation');
    assert.strictEqual(hvConn.connectionConfig, 'wye-grounded', 'Connection configuration should reflect the transformer secondary');

    const result = runLoadFlow(model, { baseMVA: 10, balanced: true });
    assert(result.converged, 'Load flow should still converge after refreshing connection metadata');
  });
});
