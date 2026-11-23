import assert from 'node:assert/strict';
import test from 'node:test';
import { contractIdealCableTies } from '../../analysis/idealCableTieContraction.mjs';
import { runLoadFlow } from '../../analysis/loadFlow.js';

function tieFixture(includeTie = true) {
  const buses = [
    { id: 'S', type: 'bus', busType: 'slack', baseKV: 0.48, Vm: 1, Va: 0 },
    { id: 'PRI', type: 'bus', busType: 'PQ', baseKV: 0.48 },
    { id: 'SEC', type: 'bus', busType: 'PQ', baseKV: 0.208 },
    ...(includeTie ? [{ id: 'PANEL', type: 'bus', busType: 'PQ', baseKV: 0.208 }] : []),
    { id: 'LOAD', type: 'bus', busType: 'PQ', baseKV: 0.208, load: { kw: 5, kvar: 2.4 } },
  ];
  const branches = [
    { id: 'FEED', type: 'cable', from: 'S', to: 'PRI', impedance: { r: 0.01, x: 0.005 } },
    { id: 'TX', type: 'transformer', subtype: 'two_winding', from: 'PRI', to: 'SEC', impedance: { r: 0.05, x: 0.12 }, tap: { ratio: 1.02 }, shunt: { from: { g: 0.0001, b: -0.0002 } } },
    ...(includeTie ? [{ id: 'TIE', type: 'cable', from: 'SEC', to: 'PANEL', impedance: { r: 0, x: 0 } }] : []),
    { id: 'CBR', type: 'cable', from: includeTie ? 'PANEL' : 'SEC', to: 'LOAD', impedance: { r: 0.1, x: 0.05 } },
  ];
  return { buses, branches };
}

test('exact cable ties preserve original buses, transformer two-port data, and KCL branch current', () => {
  const tied = runLoadFlow(tieFixture(true), { baseMVA: 1, balanced: true, radialOptimization: false, maxIterations: 60 });
  const reference = runLoadFlow(tieFixture(false), { baseMVA: 1, balanced: true, radialOptimization: false, maxIterations: 60 });
  assert.equal(tied.converged, true, tied.warnings.join('\n'));
  assert.equal(reference.converged, true, reference.warnings.join('\n'));
  assert.match(tied.solver, /exact-ideal-cable-tie-contraction/);
  assert.deepEqual(tied.buses.map(bus => bus.id), ['S', 'PRI', 'SEC', 'PANEL', 'LOAD']);
  assert.equal(tied.buses.find(bus => bus.id === 'PANEL').Pd, 0);
  assert.equal(tied.buses.find(bus => bus.id === 'LOAD').Pd, 5);
  assert.equal(tied.buses.find(bus => bus.id === 'LOAD').Qd, 2.4);
  assert.ok(Math.abs(tied.buses.find(bus => bus.id === 'SEC').Vm - tied.buses.find(bus => bus.id === 'PANEL').Vm) < 1e-14);
  for (const busId of ['S', 'PRI', 'SEC', 'LOAD']) {
    const actual = tied.buses.find(bus => bus.id === busId);
    const expected = reference.buses.find(bus => bus.id === busId);
    assert.ok(Math.abs(actual.Vm - expected.Vm) < 1e-9, `${busId} voltage differs from contracted reference`);
    assert.ok(Math.abs(actual.Va - expected.Va) < 1e-8, `${busId} angle differs from contracted reference`);
  }
  const cbr = tied.lines.find(line => line.id === 'CBR');
  const tie = tied.lines.find(line => line.id === 'TIE');
  assert.ok(cbr && tie, 'Original cable identities remain in the result');
  assert.ok(Math.abs(tie.amps - cbr.amps) < 1e-8, 'Recovered tie current must satisfy the downstream tree cut');
  assert.ok(Math.abs(tie.P + tie.toPowerKW) < 1e-10);
  assert.ok(Math.abs(tie.Q + tie.toPowerKvar) < 1e-10);
  const tieLoss = tied.losses.branches.find(branch => branch.componentId === 'TIE');
  assert.ok(Math.abs(tieLoss.P) < 1e-10);
  assert.ok(Math.abs(tieLoss.Q) < 1e-10);
  assert.ok(Math.abs(tied.summary.totalGenKW - reference.summary.totalGenKW) < 1e-8);
  assert.ok(Math.abs(tied.summary.totalGenKVAR - reference.summary.totalGenKVAR) < 1e-8);
  assert.ok(Math.abs(tied.losses.P - reference.losses.P) < 1e-8);
  assert.ok(Math.abs(tied.losses.Q - reference.losses.Q) < 1e-8);
  const tx = tied.lines.find(line => line.id === 'TX');
  assert.ok(tx && Math.abs(tx.toCurrentA - reference.lines.find(line => line.id === 'TX').toCurrentA) < 1e-8);
});

test('only explicit exact-zero cable forests are contractible', () => {
  const base = [
    { id: 'S', type: 'slack', baseKV: 0.48 },
    { id: 'A', type: 'pq', baseKV: 0.48 },
    { id: 'B', type: 'pq', baseKV: 0.48 },
  ];
  const tie = (from, to, impedance, componentId = `${from}-${to}`) => ({ target: to, componentId, componentType: 'cable', impedance });
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 0, x: 0 }, 'SA')] },
    { ...base[1], connections: [tie('A', 'B', { r: 0, x: 0 }, 'AB')] },
    { ...base[2], connections: [tie('B', 'S', { r: 0, x: 0 }, 'BS')] },
  ]).status, 'unsupported', 'A tie cycle has indeterminate current division.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 1e-10, x: 0 }, 'SA')] },
    { ...base[1], connections: [tie('A', 'S', { r: 1e-10, x: 0 }, 'SA')] },
  ]).status, 'none', 'A tiny finite impedance remains a physical branch.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 0, x: 0 }, 'SA')] },
    { ...base[1], baseKV: 0.208, connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')] },
  ]).status, 'unsupported', 'Conflicting voltage bases cannot be merged.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 0, x: 0 }, 'SA')] },
    { ...base[1], connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')], ibrProfile: { sRated_kVA: 100 } },
  ]).status, 'unsupported', 'PV/IBR voltage controls cannot be merged into a PQ node.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 0, x: 0 }, 'SA')] },
    { ...base[1], connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')] },
    { id: 'PV', type: 'pv', baseKV: 13.8 },
  ]).status, 'contracted', 'An unrelated singleton PV bus remains outside the contracted tie group.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [tie('S', 'A', { r: 0, x: 0 }, 'SA')] },
    { ...base[1], type: 'slack', connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')] },
  ]).status, 'unsupported', 'Multiple slack controls cannot be merged.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [{ ...tie('S', 'A', { r: 0, x: 0 }, 'SA'), tap: { ratio: Number.NaN } }] },
    { ...base[1], connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')] },
  ]).status, 'unsupported', 'Malformed nonfinite tap values cannot be treated as unity.');
  assert.equal(contractIdealCableTies([
    { ...base[0], connections: [{ ...tie('S', 'A', { r: 0, x: 0 }, 'SA'), shunt: { from: { g: 'invalid' } } }] },
    { ...base[1], connections: [tie('A', 'S', { r: 0, x: 0 }, 'SA')] },
  ]).status, 'unsupported', 'Malformed shunt values cannot be coerced to zero.');
  assert.equal(contractIdealCableTies([
    { id: 1, type: 'slack', baseKV: 0.48, connections: [tie(1, 2, { r: 0, x: 0 }, 'NUMERIC-TIE')] },
    { id: 2, type: 'pq', baseKV: 0.48, connections: [tie(2, 1, { r: 0, x: 0 }, 'NUMERIC-TIE')] },
  ]).status, 'contracted', 'Numeric public bus ids are normalized for lookup without changing output identities.');
});

test('tiny finite cable impedance is not reported or solved as an ideal cable tie', () => {
  const result = runLoadFlow({
    buses: [
      { id: 'S', type: 'bus', busType: 'slack', baseKV: 0.48 },
      { id: 'L', type: 'bus', busType: 'PQ', baseKV: 0.48, load: { kw: 0.1, kvar: 0 } },
    ],
    branches: [{ id: 'TINY', type: 'cable', from: 'S', to: 'L', impedance: { r: 1e-8, x: 0 } }],
  }, { baseMVA: 1, balanced: true, radialOptimization: false, maxIterations: 60 });
  assert.equal(result.converged, true, result.warnings.join('\n'));
  assert.equal(result.solver, 'newton-raphson');
  assert.ok(result.lines.find(line => line.id === 'TINY').amps > 0.05);
  assert.equal(result.warnings.some(warning => warning.includes('TINY')), false);
});
