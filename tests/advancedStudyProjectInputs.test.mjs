import assert from 'node:assert/strict';
import {
  buildOpfProjectInputs,
  buildVoltageStabilityProjectInputs,
} from '../analysis/advancedStudyProjectInputs.mjs';
import { buildFrequencyScanProjectInputs } from '../analysis/frequencyScanProjectInputs.mjs';
import { buildTransientStabilityProjectInputs } from '../analysis/transientStabilityProjectInputs.mjs';

const oneLine = {
  sheets: [{
    components: [
      { id: 'B1', type: 'bus', busType: 'slack', baseKV: 13.8 },
      { id: 'B2', type: 'bus', busType: 'PQ', baseKV: 13.8 },
      {
        id: 'F1',
        type: 'cable',
        impedance: { r: 0.08, x: 0.12 },
        connections: [{ target: 'B1' }, { target: 'B2' }],
      },
      {
        id: 'L1',
        type: 'load',
        load: { p: 1200, q: 400 },
        connections: [{ target: 'B2' }],
      },
      {
        id: 'G1',
        type: 'generator',
        props: {
          tag: 'GEN-1',
          kw: 2000,
          min_kw: 200,
          max_kw: 2000,
          h_constant_s: 4,
          cost_b: 18,
          cost_c: 0.004,
        },
        connections: [{ target: 'B1' }],
      },
    ],
  }],
};

const voltage = buildVoltageStabilityProjectInputs(oneLine);
assert.equal(voltage.ready, true);
assert.equal(voltage.inputs.buses.length, 2);
assert.equal(voltage.inputs.buses.find(bus => bus.id === 'B2').Pd, 1200);
assert.equal(voltage.inputs.buses.find(bus => bus.id === 'B1').connections.length, 1);

const opf = buildOpfProjectInputs(oneLine);
assert.equal(opf.ready, true);
assert.equal(opf.units[0].pmax, 2);
assert.equal(opf.demandMW, 1.2);

const transient = buildTransientStabilityProjectInputs(oneLine, {});
assert.equal(transient.ready, false);
assert.equal(transient.inputs.H, 4);
assert.equal(transient.inputs.Pmax_fault, null);
assert.ok(transient.warnings.some(warning => warning.includes('not inferred')));

const frequency = buildFrequencyScanProjectInputs(oneLine, {
  shortCircuit: { availableFaultKa: 10, xrRatio: 12 },
}, [{ id: 'C1', tag: 'C-1', r_ohm_per_kft: 0.05, x_ohm_per_kft: 0.04, length_ft: 500 }]);
assert.equal(frequency.ready, true);
assert.ok(frequency.inputs.scMva > 200);
assert.equal(frequency.inputs.cables[0].lengthKft, 0.5);

console.log('advanced study project input tests passed');
