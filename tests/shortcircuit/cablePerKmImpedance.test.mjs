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

const store = {};

global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => {
    store[key] = value;
  },
  removeItem: key => {
    delete store[key];
  }
};

const { computeImpedanceFromPerKm } = await import('../../utils/cableImpedance.js');
const { setOneLine } = await import('../../dataStore.mjs');
const { runShortCircuit } = await import('../../analysis/shortCircuit.mjs');

describe('Short-circuit per-km cable impedance', () => {
  it('avoids low-impedance fallbacks when per-km data is supplied', () => {
    const resistancePerKm = 0.4;
    const reactancePerKm = 0.35;
    const cableLengthFt = 200;
    const derived = computeImpedanceFromPerKm({
      resistancePerKm,
      reactancePerKm,
      length: cableLengthFt,
      unit: 'ft'
    });
    assert(derived, 'Derived impedance should exist for per-km cable data');

    setOneLine({
      activeSheet: 0,
      sheets: [
        {
          name: 'Fault Study',
          components: [
            {
              id: 'source',
              type: 'utility_source',
              voltage: 13800,
              thevenin_mva: 500,
              connections: [{ target: 'cable_sc', sourcePort: 0, targetPort: 0 }]
            },
            {
              id: 'cable_sc',
              type: 'cable',
              cable: {
                tag: 'SC-1',
                resistance_per_km: resistancePerKm,
                reactance_per_km: reactancePerKm,
                manual_length: true,
                length: cableLengthFt,
                impedance: derived
              },
              connections: [
                {
                  target: 'load_bus',
                  sourcePort: 1,
                  impedance: derived
                }
              ]
            },
            {
              id: 'load_bus',
              type: 'bus',
              subtype: 'Bus',
              kV: 13.8
            }
          ]
        }
      ]
    });

    const results = runShortCircuit();
    const bus = results.load_bus;
    assert(bus, 'Downstream bus results should be present');
    assert(!bus.warnings, 'Cable-derived impedance should suppress low-impedance warnings');
    assert(bus.threePhaseKA > 0.1, 'Three-phase fault current should be computed from derived impedance');
  });
});
