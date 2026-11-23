import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';
import { runLoadFlow } from '../../analysis/loadFlow.js';

function fixture(transformer = {}, load = { kw: 30, kvar: 0 }) {
  return {
    sheets: [{ components: [
      { id: 'HV', type: 'bus', busType: 'slack', baseKV: 0.48, Vm: 1, Va: 0 },
      { id: 'LV', type: 'bus', busType: 'PQ', baseKV: 0.208, Vm: 1, Va: 0, load },
      {
        id: 'TX', type: 'transformer', subtype: 'two_winding', volts_primary: 480,
        volts_secondary: 208, kva: 75, percent_z: 5, xr_ratio: 10,
        primary_connection: 'Delta', secondary_connection: 'Wye (Grounded)',
        ...transformer,
        connections: [{ target: 'HV', sourcePort: 0 }, { target: 'LV', sourcePort: 1 }]
      }
    ] }]
  };
}

function solve(input) {
  return runLoadFlow(buildLoadFlowModel(input), { baseMVA: 1, balanced: true, radialOptimization: false, maxIterations: 100 });
}

test('transformer flow reports both terminal currents and side-aware voltage drop', () => {
  const result = solve(fixture());
  assert.equal(result.converged, true);
  const line = result.lines[0];
  assert.ok(line.fromCurrentA > 36 && line.fromCurrentA < 37);
  assert.ok(line.toCurrentA > 83 && line.toCurrentA < 84);
  assert.equal(line.amps, line.fromCurrentA);
  assert.ok(line.dropPct > 0 && line.dropPct < 1, `unexpected transformer drop ${line.dropPct}`);
  assert.ok(line.dropKV > 0 && line.dropKV < 0.001, `unexpected transformer dropKV ${line.dropKV}`);
  assert.deepEqual(line.dropBasis.type, 'per-unit-terminal');
  assert.ok(line.fromPowerKW > 30 && line.toPowerKW < -29.99);
  assert.ok(Math.abs(line.fromPowerKW + line.toPowerKW - 0.06) < 0.01);
  assert.ok(Math.abs(result.losses.P - (line.fromPowerKW + line.toPowerKW)) < 1e-6);
  assert.ok(Math.abs(result.losses.Q - (line.fromPowerKvar + line.toPowerKvar)) < 1e-6);
});

test('named transformer losses map to primary shunt and phase shift is explicit', () => {
  const input = fixture({ coreLossKw: 0.3, magnetizingKvar: 0.6, phaseShiftDeg: 30 }, { kw: 0, kvar: 0 });
  const before = structuredClone(input);
  const model = buildLoadFlowModel(input);
  assert.deepEqual(input, before);
  const branch = model.branches[0];
  assert.equal(branch.tap.angle, -30);
  assert.equal(branch.shunt.from.g, 0.3 / (1000 * 0.48 ** 2));
  assert.equal(branch.shunt.from.b, -0.6 / (1000 * 0.48 ** 2));
  const result = solve(input);
  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.summary.totalGenKW - 0.3) < 1e-6);
  assert.ok(Math.abs(result.summary.totalGenKVAR - 0.6) < 1e-6);
  assert.ok(Math.abs(result.losses.P - 0.3) < 1e-6);
  assert.ok(Math.abs(result.losses.Q - 0.6) < 1e-6);
  assert.ok(Math.abs(result.buses.find(bus => bus.id === 'LV').Va - 30) < 1e-6);
});

test('non-unit tap changes the terminal voltage base without changing the from-side current contract', () => {
  const input = fixture({ tap: { ratio: 1.02 } });
  const model = buildLoadFlowModel(input);
  assert.equal(model.branches[0].tap.ratio, 1.02);
  const result = solve(input);
  const line = result.lines[0];
  const lv = result.buses.find(bus => bus.id === 'LV');
  assert.equal(result.converged, true);
  assert.ok(lv.Vm < 1, `unexpected LV pu voltage ${lv.Vm}`);
  assert.ok(line.toCurrentA > line.fromCurrentA * 2, 'LV current should reflect the distinct voltage base');
  assert.ok(Math.abs(line.dropBasis.fromPu - (1 / 1.02)) < 1e-12);
});

test('winding names do not infer a phase shift and malformed named transformer inputs are rejected', () => {
  const noShift = buildLoadFlowModel(fixture());
  assert.equal(noShift.branches[0].tap, undefined);
  assert.throws(() => buildLoadFlowModel(fixture({ coreLossKw: 'not-a-number' })), /coreLossKw/);
  assert.throws(() => buildLoadFlowModel(fixture({ coreLossKw: '0.3 garbage' })), /coreLossKw/);
  assert.throws(() => buildLoadFlowModel(fixture({ coreLossKw: null })), /coreLossKw/);
  assert.throws(() => buildLoadFlowModel(fixture({ tap: { ratio: '1,000' } })), /tap ratio/);
  assert.throws(() => buildLoadFlowModel(fixture({ phaseShiftDeg: 181 })), /phaseShiftDeg/);
  assert.throws(() => buildLoadFlowModel(fixture({ coreLossKw: 0.3, shunt: { from: { g: 1 } } })), /explicit shunt/);
});

test('transformer warnings distinguish synthesized magnitude-only from explicit phase and magnetizing inputs', () => {
  const explicit = fixture({ phaseShiftDeg: 30, magnetizingKvar: 0 }, { kw: 0, kvar: 0 });
  const explicitModel = buildLoadFlowModel(explicit);
  assert.equal(explicitModel.branches[0].phaseShiftModel, null);
  const explicitResult = solve(explicit);
  assert.ok(explicitResult.warnings.some(warning => warning.includes('balanced positive-sequence model')));
  assert.ok(!explicitResult.warnings.some(warning => warning.includes('magnitude-only')));
  assert.ok(!explicitResult.warnings.some(warning => warning.includes('magnetizing current/reactive power is not modeled')));

  const synthesized = fixture({}, { kw: 0, kvar: 0 });
  synthesized.sheets[0].components.find(component => component.id === 'TX').phaseShiftModel = 'magnitude-only-zero-angle-assumption';
  const synthesizedModel = buildLoadFlowModel(synthesized);
  assert.equal(synthesizedModel.branches[0].phaseShiftModel, 'magnitude-only-zero-angle-assumption');
  const synthesizedResult = solve(synthesized);
  assert.ok(synthesizedResult.warnings.some(warning => warning.includes('magnitude-only')));
  assert.ok(synthesizedResult.warnings.some(warning => warning.includes('magnetizing current/reactive power is not modeled')),
    'Missing magnetizing data must not be interpreted as numeric zero');
});
