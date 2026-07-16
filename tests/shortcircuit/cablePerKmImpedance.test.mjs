import assert from 'node:assert';
import { readFileSync } from 'node:fs';

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
  it('derives each feeder segment from the canonical Cable Schedule', () => {
    const buses = [
      {
        id: 'source',
        type: 'source',
        subtype: 'utility_source',
        label: 'SWBD-1',
        equipmentRef: 'SWBD-1',
        voltage: 480,
        thevenin_mva: 20,
        xr_ratio: 10,
        connections: [{ target: 'load_bus' }]
      },
      {
        id: 'load_bus',
        type: 'equipment',
        label: 'MCC-1',
        equipmentRef: 'MCC-1',
        voltage: 480
      }
    ];
    const cables = [{
      tag: 'CBL-SWBD-MCC',
      from: 'SWBD-1',
      to: 'MCC-1',
      conductor_size: '#4 AWG',
      conductor_material: 'Copper',
      raceway_material: 'PVC',
      length_ft: 100
    }];

    const results = runShortCircuit({ buses, cables }, { method: 'ANSI' });
    assert(results.source.threePhaseKA > results.load_bus.threePhaseKA,
      'Downstream fault current should decrease after canonical cable impedance is included');
    assert(!results.load_bus.requiredInputs, 'A complete Cable Schedule row should satisfy required cable inputs');
    assert(!results.load_bus.warnings, 'A complete Cable Schedule row should not create assumptions');
    assert.equal(results.load_bus.equipmentTag, 'MCC-1');
    assert.equal(results.load_bus.impedanceProvenance.segments[1].tag, 'CBL-SWBD-MCC');
    assert.equal(results.load_bus.impedanceProvenance.segments[1].source, 'Cable Schedule');
    assert(results.load_bus.impedanceProvenance.totalR > results.source.impedanceProvenance.totalR);
  });

  it('marks a referenced Cable Schedule row incomplete when impedance inputs are missing', () => {
    const buses = [
      {
        id: 'source',
        type: 'source',
        subtype: 'utility_source',
        label: 'SWBD-1',
        voltage: 480,
        thevenin_mva: 20,
        connections: [{ target: 'load_bus', cable: { tag: 'CBL-INCOMPLETE' } }]
      },
      { id: 'load_bus', type: 'equipment', label: 'MCC-1', voltage: 480 }
    ];
    const cables = [{
      tag: 'CBL-INCOMPLETE',
      from: 'SWBD-1',
      to: 'MCC-1',
      conductor_size: '#4 AWG',
      conductor_material: 'Copper'
    }];

    const results = runShortCircuit({ buses, cables }, { method: 'ANSI' });
    assert(results.load_bus.requiredInputs?.some(message => message.includes('positive cable length')),
      'Missing cable length should be a required input, not a silent ideal tie');
    assert.equal(results.load_bus.impedanceProvenance.segments[1].tag, 'CBL-INCOMPLETE');
    assert.equal(results.load_bus.impedanceProvenance.segments[1].rOhm, 0);
  });

  it('produces distinct downstream currents for the flagship workflow sample', () => {
    const sample = JSON.parse(readFileSync(new URL('../../samples/project-workflow-core.json', import.meta.url), 'utf8'));
    const buses = sample.oneLine.sheets.flatMap(sheet => sheet.components || []);
    const results = runShortCircuit({ buses, cables: sample.cables }, { method: 'ANSI' });

    assert(results['comp-swbd-101'].threePhaseKA > results['comp-mcc-101'].threePhaseKA);
    assert(results['comp-mcc-101'].threePhaseKA > results['comp-pmp-101'].threePhaseKA);
    assert(results['comp-swbd-101'].threePhaseKA > results['comp-xfmr-101'].threePhaseKA);
    assert(!results['comp-pmp-101'].requiredInputs, 'Flagship feeder path should have complete canonical cable inputs');
    assert.equal(results['comp-pmp-101'].impedanceProvenance.segments[2].tag, 'CBL-MCC-PMP-101');
  });

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

  it('derives impedance directly from nested per-km cable fields when no impedance object is stored', () => {
    setOneLine({
      activeSheet: 0,
      sheets: [
        {
          name: 'Nested Cable Fault Study',
          components: [
            {
              id: 'source',
              type: 'utility_source',
              voltage: 480,
              thevenin_mva: 50,
              connections: [{ target: 'cable_sc', sourcePort: 0, targetPort: 0 }]
            },
            {
              id: 'cable_sc',
              type: 'cable',
              cable: {
                tag: 'SC-2',
                resistance_per_km: 0.4,
                reactance_per_km: 0.35,
                length: 200,
                manual_length: true
              },
              connections: [{ target: 'load_bus', sourcePort: 1 }]
            },
            {
              id: 'load_bus',
              type: 'bus',
              subtype: 'Bus',
              kV: 0.48
            }
          ]
        }
      ]
    });

    const results = runShortCircuit();
    const bus = results.load_bus;
    assert(bus, 'Downstream bus results should be present');
    assert(!bus.warnings, 'Nested per-km fields should suppress missing-impedance warnings');
    assert(bus.threePhaseKA > 0.1, 'Fault current should be computed from derived per-km cable impedance');
  });

  it('recognizes a utility source stored as a source subtype', () => {
    setOneLine({
      activeSheet: 0,
      sheets: [
        {
          name: 'Source Subtype Fault Study',
          components: [
            {
              id: 'source',
              type: 'source',
              subtype: 'utility_source',
              voltage: 480,
              thevenin_mva: 20,
              xr_ratio: 10,
              connections: [{ target: 'load_bus' }]
            },
            {
              id: 'load_bus',
              type: 'bus',
              subtype: 'Bus',
              kV: 0.48
            }
          ]
        }
      ]
    });

    const results = runShortCircuit();
    assert(results.load_bus, 'Downstream bus results should be present');
    assert(!results.load_bus.warnings, 'The source subtype should provide non-zero source impedance');
    assert(results.load_bus.threePhaseKA > 20 && results.load_bus.threePhaseKA < 30,
      'The modeled 20 MVA source should produce a plausible 480 V fault-current range');
  });
});
