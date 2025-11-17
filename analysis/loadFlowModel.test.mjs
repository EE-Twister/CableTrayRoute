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

const { buildLoadFlowModel } = await import('./loadFlowModel.js');

describe('loadFlowModel voltage inheritance', () => {
  it('retains downstream baseKV values supplied via prefault voltage inheritance', () => {
    const hvPrefault = 13.8;
    const lvPrefault = 0.48;
    const fixture = {
      sheets: [
        {
          components: [
            {
              id: 'hv_bus',
              type: 'bus',
              subtype: 'bus_Bus',
              voltage: `${hvPrefault}`,
              props: { voltage: `${hvPrefault}`, prefault_voltage: hvPrefault },
              prefault_voltage: hvPrefault
            },
            {
              id: 'lv_bus',
              type: 'bus',
              subtype: 'bus_Bus',
              voltage: `${lvPrefault}`,
              props: { voltage: `${lvPrefault}`, prefault_voltage: lvPrefault },
              prefault_voltage: lvPrefault
            },
            {
              id: 'xfmr',
              type: 'transformer',
              subtype: 'two_winding',
              connections: [
                { target: 'hv_bus', sourcePort: 0 },
                { target: 'lv_bus', sourcePort: 1 }
              ],
              voltage_primary: hvPrefault,
              voltage_secondary: lvPrefault
            }
          ],
          connections: [
            { from: 'hv_bus', to: 'lv_bus' }
          ]
        }
      ]
    };

    const model = buildLoadFlowModel(fixture);
    const hvBus = model.buses.find(bus => bus.id === 'hv_bus');
    const lvBus = model.buses.find(bus => bus.id === 'lv_bus');
    assert(hvBus && lvBus, 'Both buses should be included in the load flow model');
    assert(Math.abs(hvBus.baseKV - hvPrefault) < 1e-9, 'Primary bus baseKV should match its prefault voltage');
    assert(Math.abs(lvBus.baseKV - lvPrefault) < 1e-9, 'Secondary bus baseKV should match its prefault voltage');
    assert.strictEqual(hvBus.prefault_voltage, hvPrefault, 'Primary bus should expose prefault voltage for studies');
    assert.strictEqual(lvBus.prefault_voltage, lvPrefault, 'Secondary bus should expose prefault voltage for studies');
  });

  it('propagates loads across deep component chains when searching for a bus', () => {
    const chainLength = 5;
    const busId = 'source_bus';
    const loadId = 'far_load';
    const chainIds = Array.from({ length: chainLength }, (_, idx) => `link_${idx + 1}`);
    const components = [
      {
        id: busId,
        type: 'bus',
        subtype: 'bus_Bus',
        voltage: '13.8'
      },
      ...chainIds.map((id, idx) => ({
        id,
        type: 'cable',
        connections: [
          {
            target: idx === 0 ? busId : chainIds[idx - 1]
          }
        ]
      })),
      {
        id: loadId,
        type: 'load',
        kw: 125,
        connections: [
          {
            target: chainIds[chainIds.length - 1]
          }
        ]
      }
    ];
    const fixture = {
      sheets: [
        {
          components,
          connections: []
        }
      ]
    };

    const model = buildLoadFlowModel(fixture);
    const sourceBus = model.buses.find(bus => bus.id === busId);
    assert(sourceBus, 'The source bus should exist in the model');
    assert(sourceBus.load, 'The bus should have an aggregated load');
    assert.strictEqual(sourceBus.load.kw, 125, 'The bus should accumulate the remote load kW');
  });
});
