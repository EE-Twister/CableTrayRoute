import assert from 'node:assert/strict';
import test from 'node:test';
import { runLoadFlow } from '../../analysis/loadFlow.js';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';

const options = { baseMVA: 1, balanced: true, radialOptimization: false, maxIterations: 60 };
const close = (actual, expected, tolerance, message) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${message}: ${actual} versus ${expected} (tolerance ${tolerance})`
);
const cable = (id, from, to, r = 0, x = 0) => ({ id, type: 'cable', from, to, impedance: { r, x } });
const bus = (id, kw = 0, kvar = 0, baseKV = 0.48) => ({
  id, type: 'bus', busType: id === 'S' ? 'slack' : 'PQ', baseKV, Vm: 1, Va: 0,
  name: `Name ${id}`, label: `Label ${id}`, ref: `Ref ${id}`, load: { kw, kvar }
});
const getLine = (result, id) => {
  const line = result.lines.find(item => item.id === id);
  assert.ok(line, `Original branch ${id} retained`);
  return line;
};

// Independent receiving-end constant-power solution: u = |Vr_phase|^2,
// u^2 - (Vs_phase^2 - 2 Re(Z conj(S_phase))) u + |Z S_phase|^2 = 0.
// This uses SI phase quantities, with no solver or per-unit helper imports.
function receivingEnd(volts, kw, kvar, r, x) {
  const vs = volts / Math.sqrt(3);
  const p = kw * 1000 / 3;
  const q = kvar * 1000 / 3;
  const a = vs * vs - 2 * (r * p + x * q);
  const b = (r * r + x * x) * (p * p + q * q);
  const u = (a + Math.sqrt(a * a - 4 * b)) / 2;
  const real = (u + r * p + x * q) / vs;
  const imaginary = (r * q - x * p) / vs;
  const currentSquared = (p * p + q * q) / u;
  return {
    vm: Math.sqrt(u) / vs, angle: Math.atan2(imaginary, real) * 180 / Math.PI,
    amps: Math.sqrt(currentSquared),
    lossKW: 3 * currentSquared * r / 1000,
    lossKvar: 3 * currentSquared * x / 1000
  };
}

function assertBusKCL(result, tolerance = 0.001) {
  for (const item of result.buses) {
    let p = 0;
    let q = 0;
    for (const line of result.lines) {
      if (line.from === item.id) { p += line.fromPowerKW; q += line.fromPowerKvar; }
      if (line.to === item.id) { p += line.toPowerKW; q += line.toPowerKvar; }
    }
    close(p + item.Pd - item.Pg, 0, tolerance, `${item.id} real-power KCL`);
    close(q + item.Qd - item.Qg, 0, tolerance, `${item.id} reactive-power KCL`);
  }
}

for (const reverse of [false, true]) {
  test(`ideal cable tree recovers unique cut powers and original loads; reversed=${reverse}`, () => {
    const model = {
      buses: [bus('S'), bus('A', 6, 3), bus('B', 4, 2)],
      branches: [cable('SA', 'S', 'A'), reverse ? cable('BA', 'B', 'A') : cable('AB', 'A', 'B')]
    };
    const before = structuredClone(model);
    const result = runLoadFlow(model, options);
    assert.deepEqual(model, before, 'The input model remains unchanged');
    assert.equal(result.converged, true, result.warnings.join('\n'));
    assert.match(result.solver, /exact-ideal-cable-tie-contraction/);
    assert.deepEqual(result.buses.map(item => item.id), ['S', 'A', 'B']);
    for (const original of model.buses) {
      const actual = result.buses.find(item => item.id === original.id);
      assert.equal(actual.Pd, original.load.kw);
      assert.equal(actual.Qd, original.load.kvar);
      assert.equal(actual.label, original.label);
      assert.equal(actual.name, original.name);
      assert.equal(actual.ref, original.ref);
      close(actual.Vm, 1, 1e-12, `${original.id} voltage`);
      close(actual.Va, 0, 1e-12, `${original.id} angle`);
      if (original.id !== 'S') {
        close(actual.Pg, 0, 1e-9, `${original.id} generation`);
        close(actual.Qg, 0, 1e-9, `${original.id} reactive generation`);
      }
    }
    const upstream = getLine(result, 'SA');
    const downstream = getLine(result, reverse ? 'BA' : 'AB');
    close(upstream.fromPowerKW, 10, 1e-9, 'Source tie real power');
    close(upstream.fromPowerKvar, 5, 1e-9, 'Source tie reactive power');
    close(downstream.fromPowerKW, reverse ? -4 : 4, 1e-9, 'Oriented downstream power');
    close(downstream.toPowerKW, reverse ? 4 : -4, 1e-9, 'Receiving terminal power');
    close(downstream.fromPowerKvar, reverse ? -2 : 2, 1e-9, 'Oriented downstream reactive power');
    close(downstream.amps, Math.hypot(4, 2) * 1000 / (Math.sqrt(3) * 480), 1e-8, 'Three-phase RMS tie current');
    close(result.summary.totalGenKW, 10, 1e-9, 'Source generation');
    close(result.summary.totalLoadKW, 10, 1e-9, 'No duplicated load');
    close(result.losses.P, 0, 1e-9, 'Ideal real losses');
    close(result.losses.Q, 0, 1e-9, 'Ideal reactive losses');
    assertBusKCL(result, 1e-9);
  });
}

test('tie tree plus physical feeder matches a separately derived constant-power circuit', () => {
  const model = {
    buses: [bus('S'), bus('A', 6, 3), bus('B', 4, 2), bus('L', 3, 1)],
    branches: [cable('SA', 'S', 'A'), cable('AB', 'A', 'B'), cable('BL', 'B', 'L', 0.04, 0.02)]
  };
  const expected = receivingEnd(480, 3, 1, 0.04, 0.02);
  const result = runLoadFlow(model, options);
  assert.equal(result.converged, true, result.warnings.join('\n'));
  assert.ok(result.iterations <= 60);
  const load = result.buses.find(item => item.id === 'L');
  close(load.Vm, expected.vm, 1e-7, 'Receiving voltage');
  close(load.Va, expected.angle, 1e-5, 'Receiving angle');
  close(getLine(result, 'BL').amps, expected.amps, 0.001, 'Finite feeder current');
  close(getLine(result, 'AB').fromPowerKW, 7 + expected.lossKW, 0.001, 'Downstream tie includes feeder loss');
  close(getLine(result, 'AB').fromPowerKvar, 3 + expected.lossKvar, 0.001, 'Downstream tie includes reactive loss');
  close(getLine(result, 'SA').fromPowerKW, 13 + expected.lossKW, 0.001, 'Source tie real power');
  close(getLine(result, 'SA').fromPowerKvar, 6 + expected.lossKvar, 0.001, 'Source tie reactive power');
  close(result.losses.P, expected.lossKW, 0.001, 'Series real loss');
  close(result.losses.Q, expected.lossKvar, 0.001, 'Series reactive loss');
  assertBusKCL(result);
});

test('ties on both transformer terminals preserve two voltage bases and core/magnetizing losses', () => {
  const diagram = { sheets: [{ components: [bus('S'), bus('LV', 0, 0, 0.208), {
    id: 'TX', type: 'transformer', subtype: 'two_winding', volts_primary: 480,
    volts_secondary: 208, kva: 75, percent_z: 5, xr_ratio: 10,
    coreLossKw: 0.1, magnetizingKvar: 0.2,
    connections: [{ target: 'S', sourcePort: 0 }, { target: 'LV', sourcePort: 1 }]
  }] }] };
  const model = buildLoadFlowModel(diagram);
  for (const item of model.buses) item.connections = [];
  model.buses.push(bus('HVC'), bus('OUT', 30, 10, 0.208));
  const transformer = model.branches.find(item => item.id === 'TX');
  transformer.from = 'HVC';
  model.branches.push(cable('HV-TIE', 'S', 'HVC'), cable('LV-TIE', 'LV', 'OUT'));
  const z = 0.05 * 208 ** 2 / 75000;
  const r = z / Math.sqrt(101);
  const x = 10 * r;
  const expected = receivingEnd(208, 30, 10, r, x);
  const result = runLoadFlow(model, options);
  assert.equal(result.converged, true, result.warnings.join('\n'));
  assert.deepEqual(new Set(result.buses.map(item => item.id)), new Set(['S', 'LV', 'HVC', 'OUT']));
  close(result.buses.find(item => item.id === 'OUT').Vm, expected.vm, 1e-7, 'Secondary loaded voltage');
  close(result.summary.totalLoadKW, 30, 1e-9, 'Original loads retained once');
  close(result.summary.totalGenKW, 30 + expected.lossKW + 0.1, 0.001, 'Source power including core loss');
  close(result.summary.totalGenKVAR, 10 + expected.lossKvar + 0.2, 0.001, 'Source reactive power including magnetizing demand');
  close(result.losses.P, expected.lossKW + 0.1, 0.001, 'Transformer real loss');
  close(result.losses.Q, expected.lossKvar + 0.2, 0.001, 'Transformer reactive loss');
  close(getLine(result, 'LV-TIE').amps, expected.amps, 0.001, 'LV tie current');
  close(getLine(result, 'TX').toCurrentA, expected.amps, 0.001, 'Transformer LV terminal current');
  const hvAmps = Math.hypot(30 + expected.lossKW + 0.1, 10 + expected.lossKvar + 0.2) * 1000 / (Math.sqrt(3) * 480);
  close(getLine(result, 'HV-TIE').amps, hvAmps, 0.001, 'HV tie uses 480-V current base');
  close(getLine(result, 'TX').fromCurrentA, hvAmps, 0.001, 'Transformer HV terminal current');
  for (const item of result.buses.filter(item => item.id !== 'S')) close(item.Pg, 0, 0.001, `${item.id} no invented generation`);
  assertBusKCL(result);
});

test('unsupported ideal cycles, merged controls and conflicting bases cannot report a converged study', () => {
  const cases = [
    { buses: [bus('S'), bus('A'), bus('B', 1)], branches: [cable('SA', 'S', 'A'), cable('AB', 'A', 'B'), cable('BS', 'B', 'S')] },
    { buses: [bus('S'), { ...bus('A', 1), busType: 'PV' }], branches: [cable('SA', 'S', 'A')] },
    { buses: [bus('S'), { ...bus('A'), busType: 'slack' }], branches: [cable('SA', 'S', 'A')] },
    { buses: [bus('S'), bus('A', 1, 0, 0.208)], branches: [cable('SA', 'S', 'A')] },
    { buses: [bus('S'), bus('A', 1)], branches: [{ ...cable('SA', 'S', 'A'), tap: { ratio: 'invalid' } }] },
    { buses: [bus('S'), bus('A', 1)], branches: [{ ...cable('SA', 'S', 'A'), tap: { angle: 'invalid' } }] },
    { buses: [bus('S'), bus('A', 1)], branches: [{ ...cable('SA', 'S', 'A'), shunt: { from: { g: 'invalid', b: 0 } } }] }
  ];
  for (const model of cases) {
    const result = runLoadFlow(model, options);
    assert.equal(result.converged, false);
    assert.ok(result.warnings.some(warning => /Unsupported exact zero-ohm cable-tie topology/.test(warning)), result.warnings.join('\n'));
  }
});

test('a nonzero physical cable retains positive drop and loss', () => {
  const result = runLoadFlow({ buses: [bus('S'), bus('A', 10, 3)], branches: [cable('SA', 'S', 'A', 0.0001, 0.00005)] }, options);
  assert.equal(result.converged, true, result.warnings.join('\n'));
  assert.doesNotMatch(result.solver, /exact-ideal-cable-tie-contraction/);
  assert.ok(result.buses.find(item => item.id === 'A').Vm < 1);
  assert.ok(result.losses.P > 0);
});
