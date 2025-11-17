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
});
