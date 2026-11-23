import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../analysis/faultNetwork.mjs';

// Independent port-response oracles use physical circuit reductions, not the
// production matrix builder or the response under test to create expectations.
const c = (re = 0, im = 0) => ({ re, im });
const add = (a, b) => c(a.re + b.re, a.im + b.im);
const sub = (a, b) => c(a.re - b.re, a.im - b.im);
const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a, k) => c(a.re * k, a.im * k);
const conj = (a) => c(a.re, -a.im);
const div = (a, b) => c((a.re * b.re + a.im * b.im) / (b.re ** 2 + b.im ** 2), (a.im * b.re - a.re * b.im) / (b.re ** 2 + b.im ** 2));
const z = (rOhm, xOhm = 0) => ({ rOhm, xOhm });
const E = 480 / Math.sqrt(3);
const source = (id, busId, emfPhaseV, impedance, inService = true) => ({ id, busId, emfPhaseV, impedance, inService, reference: `Independent synthetic circuit ${id}; not manufacturer evidence` });
const branch = (id, fromBusId, toBusId, impedance, referenceBusId = toBusId, tapPu = c(1)) => ({ id, fromBusId, toBusId, impedance: { ...impedance, referenceBusId }, tapPu });
const network = (ids, branches, sources) => ({
  networkBaseMVA: 1,
  buses: ids.map(id => ({ id, voltageLLV: 480 })),
  branches, sources,
  sourceInventory: { status: 'complete', reference: 'Complete inventory for this mathematical fixture only' },
  responseBusIds: [...ids],
  targetBranchIds: branches.map(row => row.id),
});
const base = (input, id) => {
  const voltage = input.buses.find(row => row.id === id).voltageLLV;
  return { z: voltage ** 2 / (input.networkBaseMVA * 1e6), i: input.networkBaseMVA * 1e6 / (Math.sqrt(3) * voltage), v: voltage / Math.sqrt(3) };
};
function close(actual, expected, label = '') {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= 2e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} versus ${expected}`);
}
function cc(actual, expected, label = '') {
  assert.ok(actual, label);
  close(actual.re, expected.re, `${label} real`);
  close(actual.im, expected.im, `${label} imaginary`);
}
function evaluated(input) {
  assert.equal(typeof core.preparePositiveSequenceNetworkLinearResponse, 'function');
  const before = structuredClone(input);
  const result = core.preparePositiveSequenceNetworkLinearResponse(input);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.method, 'positive-sequence-unfaulted-port-response-v1');
  assert.deepEqual(input, before, 'The response preparation must not repair supplied records');
  assert.equal(result.sourceResponses.length, input.sources.length);
  assert.equal(result.unitCurrentInjectionResponses.length, input.responseBusIds.length);
  return result;
}
const injection = (result, id) => result.unitCurrentInjectionResponses.find(row => row.injectionBusId === id);
const sourceRow = (result, id) => result.sourceResponses.find(row => row.sourceId === id);
const current = (row, id) => row.targetBranchCurrentsPu.find(item => item.branchId === id);

test('unfaulted one-bus response retains EMF and exposes the exact driving-point impedance', () => {
  for (const mva of [0.001, 1, 100]) {
    const input = network(['S'], [], [source('U', 'S', c(270, 13), z(0.006, 0.015))]);
    input.networkBaseMVA = mva;
    const result = evaluated(input), b = base(input, 'S');
    cc(sourceRow(result, 'U').voltagePuByBusId.S, scale(c(270, 13), 1 / b.v));
    cc(injection(result, 'S').voltagePuByBusId.S, scale(c(0.006, 0.015), 1 / b.z));
    assert.deepEqual(result.targetBranchIds, []);
  }
});

test('two-bus radial port columns match series impedances and signed unit-current transfer', () => {
  const zs = c(0.006, 0.015), zc = c(0.02, 0.008);
  const input = network(['S', 'L'], [branch('C', 'S', 'L', z(zc.re, zc.im))], [source('U', 'S', c(E), z(zs.re, zs.im))]);
  const result = evaluated(input), b = base(input, 'S');
  for (const id of ['S', 'L']) cc(sourceRow(result, 'U').voltagePuByBusId[id], c(1));
  cc(current(sourceRow(result, 'U'), 'C').fromCurrentIntoBranchPu, c());
  cc(injection(result, 'S').voltagePuByBusId.S, scale(zs, 1 / b.z));
  cc(injection(result, 'S').voltagePuByBusId.L, scale(zs, 1 / b.z));
  cc(injection(result, 'L').voltagePuByBusId.S, scale(zs, 1 / b.z));
  cc(injection(result, 'L').voltagePuByBusId.L, scale(add(zs, zc), 1 / b.z));
  cc(current(injection(result, 'S'), 'C').fromCurrentIntoBranchPu, c());
  cc(current(injection(result, 'L'), 'C').fromCurrentIntoBranchPu, c(-1));
  cc(current(injection(result, 'L'), 'C').toCurrentIntoBranchPu, c(1));
});

test('per-source unfaulted circulating currents retain the other connected source impedance', () => {
  const za = c(0.006, 0.015), zb = c(0.03, 0.1), zc = c(0.02, 0.008);
  const ea = c(270, 13), eb = c(260, -20), totalZ = add(add(za, zc), zb);
  const input = network(['S', 'L'], [branch('C', 'S', 'L', z(zc.re, zc.im))], [source('U', 'S', ea, z(za.re, za.im)), source('M', 'L', eb, z(zb.re, zb.im))]);
  const result = evaluated(input), b = base(input, 'S');
  for (const [id, ia, va, vb] of [
    ['U', div(ea, totalZ), sub(ea, mul(div(ea, totalZ), za)), mul(div(ea, totalZ), zb)],
    ['M', scale(div(eb, totalZ), -1), mul(div(eb, totalZ), za), sub(eb, mul(div(eb, totalZ), zb))],
  ]) {
    const row = sourceRow(result, id);
    cc(row.voltagePuByBusId.S, scale(va, 1 / b.v));
    cc(row.voltagePuByBusId.L, scale(vb, 1 / b.v));
    cc(current(row, 'C').fromCurrentIntoBranchPu, scale(ia, 1 / b.i));
    cc(current(row, 'C').toCurrentIntoBranchPu, scale(ia, -1 / b.i));
  }
  // Inverse of a two-source series circuit, independently reduced in ohms.
  const haa = div(mul(za, add(zc, zb)), totalZ);
  const hab = div(mul(za, zb), totalZ);
  const hbb = div(mul(zb, add(zc, za)), totalZ);
  cc(injection(result, 'S').voltagePuByBusId.S, scale(haa, 1 / b.z));
  cc(injection(result, 'S').voltagePuByBusId.L, scale(hab, 1 / b.z));
  cc(injection(result, 'L').voltagePuByBusId.S, scale(hab, 1 / b.z));
  cc(injection(result, 'L').voltagePuByBusId.L, scale(hbb, 1 / b.z));
});

test('complex transformer taps have distinct transfer directions and terminal current bases', () => {
  const zs = c(0.006, 0.015), zlow = c(0.01, 0.025);
  const tap = c(1.02 * Math.cos(Math.PI / 6), 1.02 * Math.sin(Math.PI / 6));
  const input = network(['H', 'L'], [branch('TX', 'H', 'L', z(zlow.re, zlow.im), 'L', tap)], [source('U', 'H', c(E), z(zs.re, zs.im))]);
  input.buses[1].voltageLLV = 208;
  for (const mva of [0.01, 1, 100]) {
    input.networkBaseMVA = mva;
    const result = evaluated(input), bh = base(input, 'H'), bl = base(input, 'L');
    const h = scale(zs, 1 / bh.z);
    cc(sourceRow(result, 'U').voltagePuByBusId.H, c(1));
    cc(sourceRow(result, 'U').voltagePuByBusId.L, div(c(1), tap));
    cc(injection(result, 'H').voltagePuByBusId.H, h);
    cc(injection(result, 'H').voltagePuByBusId.L, div(h, tap));
    cc(injection(result, 'L').voltagePuByBusId.H, div(h, conj(tap)));
    cc(injection(result, 'L').voltagePuByBusId.L, add(scale(zlow, 1 / bl.z), scale(h, 1 / (tap.re ** 2 + tap.im ** 2))));
    const row = current(injection(result, 'L'), 'TX');
    cc(row.fromCurrentIntoBranchPu, scale(div(c(1), conj(tap)), -1));
    cc(row.toCurrentIntoBranchPu, c(1));
    assert.ok(Math.abs(injection(result, 'H').voltagePuByBusId.L.im - injection(result, 'L').voltagePuByBusId.H.im) > 1e-6);
    // One ampere injected at L gives -1/conj(physical ratio) amperes at H.
    const physicalRatio = scale(tap, 480 / 208);
    cc(scale(row.fromCurrentIntoBranchPu, bh.i / bl.i), scale(div(c(1), conj(physicalRatio)), -1));
  }
});

test('ideal-forest port columns preserve injection locations and recover per-source tie circulation', () => {
  const zs = c(0.01, 0.02), zm = c(0.03, 0.08);
  const input = network(['S', 'P', 'L'], [branch('T1', 'S', 'P', z(0)), branch('T2', 'P', 'L', z(0))], [source('U', 'S', c(E), z(zs.re, zs.im)), source('M', 'L', c(E), z(zm.re, zm.im))]);
  const result = evaluated(input), b = base(input, 'S');
  const zeq = div(mul(zs, zm), add(zs, zm));
  const sFraction = div(zeq, zs), mFraction = div(zeq, zm);
  const expected = {
    S: [mFraction, mFraction],
    P: [scale(sFraction, -1), mFraction],
    L: [scale(sFraction, -1), scale(sFraction, -1)],
  };
  for (const id of input.responseBusIds) {
    const row = injection(result, id);
    for (const bus of input.responseBusIds) cc(row.voltagePuByBusId[bus], scale(zeq, 1 / b.z));
    for (const [index, tid] of ['T1', 'T2'].entries()) {
      cc(current(row, tid).fromCurrentIntoBranchPu, expected[id][index]);
      cc(current(row, tid).toCurrentIntoBranchPu, scale(expected[id][index], -1));
    }
  }
  const circulatingA = div(c(E), add(zs, zm));
  for (const id of ['T1', 'T2']) {
    cc(current(sourceRow(result, 'U'), id).fromCurrentIntoBranchPu, scale(circulatingA, 1 / b.i));
    cc(current(sourceRow(result, 'M'), id).fromCurrentIntoBranchPu, scale(circulatingA, -1 / b.i));
  }
});

test('zero-EMF connected sources retain impedance while out-of-service sources are explicit open circuits', () => {
  const input = network(['S'], [], [source('U', 'S', c(E), z(0, 0.02)), source('M', 'S', c(), z(0, 0.1))]);
  const connected = evaluated(input);
  cc(sourceRow(connected, 'U').voltagePuByBusId.S, c(5 / 6));
  cc(sourceRow(connected, 'M').voltagePuByBusId.S, c());
  input.sources[1].inService = false;
  const open = evaluated(input);
  cc(sourceRow(open, 'U').voltagePuByBusId.S, c(1));
  cc(sourceRow(open, 'M').voltagePuByBusId.S, c());
  assert.equal(sourceRow(open, 'M').inService, false);
  cc(injection(open, 'S').voltagePuByBusId.S, scale(c(0, 0.02), 1 / base(input, 'S').z));
});

test('invalid, singular, unfed or ambiguous responses block rather than fabricating a port or impedance', () => {
  const valid = network(['S', 'L'], [branch('C', 'S', 'L', z(0.02, 0.008))], [source('U', 'S', c(E), z(0.006, 0.015))]);
  const mutate = [
    input => { input.fault = { busId: 'S', type: 'three-phase-bolted' }; },
    input => { input.responseBusIds = ['UNKNOWN']; },
    input => { input.responseBusIds = ['S', 'S']; },
    input => { input.targetBranchIds = ['UNKNOWN']; },
    input => { input.targetBranchIds = ['C', 'C']; },
    input => { input.buses[0].voltageLLV = 0; },
    input => { input.sources[0].inService = false; },
    input => { input.buses.push({ id: 'UNFED', voltageLLV: 480 }); },
    input => { input.branches[0].impedance = { ...z(0), referenceBusId: 'L' }; input.branches.push(branch('C2', 'S', 'L', z(0))); },
    input => { input.branches[0].impedance = { ...z(0), referenceBusId: 'L' }; input.buses[1].voltageLLV = 208; },
    input => { input.sources[0].impedance = z(0); },
    input => { input.sources[0].emfPhaseV.re = Infinity; },
    input => { input.responseBusIds = Array(251).fill('S'); },
    input => { input.targetBranchIds = Array(1001).fill('C'); },
  ];
  for (const change of mutate) {
    const input = structuredClone(valid); change(input);
    const before = structuredClone(input);
    const result = core.preparePositiveSequenceNetworkLinearResponse(input);
    assert.equal(result.status, 'blocked', JSON.stringify({ input, result }));
    assert.ok(result.issues.length);
    assert.deepEqual(input, before);
    assert.ok(!result.unitCurrentInjectionResponses?.length, 'A blocked response must not expose numeric transfer columns');
  }
});
