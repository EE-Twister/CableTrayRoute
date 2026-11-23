import assert from 'node:assert/strict';
import test from 'node:test';
import { solvePositiveSequenceBoltedFault } from '../analysis/faultNetwork.mjs';

const E = 480 / Math.sqrt(3);
const c = (re, im = 0) => ({ re, im });
const add = (a, b) => c(a.re + b.re, a.im + b.im);
const sub = (a, b) => c(a.re - b.re, a.im - b.im);
const scale = (a, k) => c(a.re * k, a.im * k);
const div = (a, b) => c((a.re * b.re + a.im * b.im) / (b.re ** 2 + b.im ** 2), (a.im * b.re - a.re * b.im) / (b.re ** 2 + b.im ** 2));
const z = (rOhm, xOhm) => ({ rOhm, xOhm });
const source = (id, busId, emf, impedance) => ({ id, busId, emfPhaseV: emf, impedance, inService: true, reference: `Synthetic analytical source ${id}; not manufacturer evidence` });
const branch = (id, fromBusId, toBusId, impedance, referenceBusId = toBusId, tapPu = c(1)) => ({ id, fromBusId, toBusId, impedance: { ...impedance, referenceBusId }, tapPu });
function network(buses, branches, sources, busId = 'A') {
  return { networkBaseMVA: 1, buses: buses.map(id => ({ id, voltageLLV: 480 })), branches, sources, fault: { busId, type: 'three-phase-bolted' }, sourceInventory: { status: 'complete', reference: 'Complete inventory for this synthetic mathematical fixture only' } };
}
function close(actual, expected, message) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${message || ''}: ${actual} versus ${expected}`);
}
function complexClose(actual, expectedA, message) {
  assert.ok(actual, message);
  close(actual.re, expectedA.re / 1000, `${message} real kA`);
  close(actual.im, expectedA.im / 1000, `${message} imaginary kA`);
  close(actual.magnitude, Math.hypot(expectedA.re, expectedA.im) / 1000, `${message} magnitude kA`);
}
function contribution(result, id) { return result.sourceFaultContributions.find(row => row.sourceId === id).currentKA; }
function terminal(result, id) { return result.sourceTerminalCurrents.find(row => row.sourceId === id).currentKA; }
function flow(result, id) { return result.branchTerminalCurrents.find(row => row.branchId === id) || result.zeroImpedanceTieCurrents.find(row => row.branchId === id); }
function evaluated(input) {
  const copy = structuredClone(input);
  const result = solvePositiveSequenceBoltedFault(input);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.scope, 'initial-symmetrical-rms-only');
  assert.equal(result.sourceInventory.verificationStatus, 'not-verified');
  assert.deepEqual(input, copy, 'The solver cannot repair supplied data in place');
  const sum = result.sourceFaultContributions.reduce((total, row) => add(total, row.currentKA), c(0));
  close(sum.re, result.fault.totalFaultCurrentKA.re, 'Per-infeed real current conservation');
  close(sum.im, result.fault.totalFaultCurrentKA.im, 'Per-infeed imaginary current conservation');
  return result;
}

test('remote infeed changes the upstream fault as well as its own bus result', () => {
  const input = network(['A', 'B'], [branch('AB', 'A', 'B', z(0, 0.03))], [source('UTILITY', 'A', c(E), z(0, 0.02)), source('MOTOR', 'B', c(E), z(0, 0.1))]);
  const upstream = evaluated(input);
  const uA = c(0, -E / 0.02), mA = c(0, -E / 0.13);
  complexClose(upstream.fault.totalFaultCurrentKA, add(uA, mA), 'Upstream total');
  close(upstream.fault.faultCurrentRmsKA, 15.988161300635792);
  complexClose(contribution(upstream, 'UTILITY'), uA);
  complexClose(contribution(upstream, 'MOTOR'), mA);
  complexClose(flow(upstream, 'AB').fromCurrentIntoBranchKA, scale(mA, -1));
  input.fault.busId = 'B';
  const downstream = evaluated(input);
  complexClose(downstream.fault.totalFaultCurrentKA, c(0, -E * (1 / 0.05 + 1 / 0.1)));
  close(downstream.fault.faultCurrentRmsKA, 8.313843876330612);
});

test('complex shared paths use current division rather than summing independent path magnitudes', () => {
  const zu = c(0.01, 0.03), zt = c(0.02, 0.015), zb = c(0.01, 0.02), zc = c(0.015, 0.025);
  const zm = c(0.08, 0.2), zn = c(0.09, 0.17), eu = c(E), em = c(260, -20), en = c(270, 15);
  const input = network(['A', 'D', 'B', 'C'], [branch('TRUNK', 'A', 'D', z(zt.re, zt.im)), branch('DB', 'D', 'B', z(zb.re, zb.im)), branch('DC', 'D', 'C', z(zc.re, zc.im))], [source('U', 'A', eu, z(zu.re, zu.im)), source('M', 'B', em, z(zm.re, zm.im)), source('N', 'C', en, z(zn.re, zn.im))]);
  const ym = div(c(1), add(zm, zb)), yn = div(c(1), add(zn, zc)), yt = div(c(1), zt);
  const denominator = add(add(ym, yn), yt);
  const vd = div(add(div(em, add(zm, zb)), div(en, add(zn, zc))), denominator);
  const iu = div(eu, zu), im = div(sub(em, vd), add(zm, zb)), inn = div(sub(en, vd), add(zn, zc));
  const result = evaluated(input);
  complexClose(result.fault.totalFaultCurrentKA, add(iu, div(vd, zt)));
  complexClose(terminal(result, 'M'), im);
  complexClose(terminal(result, 'N'), inn);
  complexClose(flow(result, 'TRUNK').fromCurrentIntoBranchKA, scale(div(vd, zt), -1));
  complexClose(flow(result, 'DB').fromCurrentIntoBranchKA, scale(im, -1));
  // Superposition includes both inactive internal impedances in the network.
  const vdFromM = div(div(em, add(zm, zb)), denominator);
  complexClose(contribution(result, 'M'), div(vdFromM, zt));
});

test('mixed-voltage complex taps refer impedance and terminal current on their declared bases', () => {
  const nominalRatio = 480 / 208;
  const angle = Math.PI / 6, tap = c(1.02 * Math.cos(angle), 1.02 * Math.sin(angle));
  const a = scale(tap, nominalRatio), a2 = a.re ** 2 + a.im ** 2;
  const zu = c(0.006, 0.015), ztx = c(0.01, 0.025), zm = c(0.02, 0.08);
  const em = c(208 / Math.sqrt(3));
  const input = network(['H', 'L'], [branch('TX', 'H', 'L', z(ztx.re, ztx.im), 'L', tap)], [source('U', 'H', c(E), z(zu.re, zu.im)), source('M', 'L', em, z(zm.re, zm.im))], 'L');
  input.buses[1].voltageLLV = 208;
  const iLowFromU = div(div(c(E), a), add(scale(zu, 1 / a2), ztx));
  const iHigh = div(iLowFromU, c(a.re, -a.im));
  const result = evaluated(input);
  complexClose(result.fault.totalFaultCurrentKA, add(iLowFromU, div(em, zm)));
  complexClose(contribution(result, 'U'), iLowFromU);
  complexClose(flow(result, 'TX').fromCurrentIntoBranchKA, iHigh);
  complexClose(flow(result, 'TX').toCurrentIntoBranchKA, scale(iLowFromU, -1));
  // Ohms are nominally referred; the off-nominal tap is a separate element.
  const fromReference = structuredClone(input);
  fromReference.branches[0].impedance = { rOhm: ztx.re * nominalRatio ** 2, xOhm: ztx.im * nominalRatio ** 2, referenceBusId: 'H' };
  complexClose(evaluated(fromReference).fault.totalFaultCurrentKA, add(iLowFromU, div(em, zm)));
  input.fault.busId = 'H';
  const reverse = evaluated(input);
  const mHigh = div(div(em, add(zm, ztx)), c(a.re, -a.im));
  complexClose(contribution(reverse, 'M'), mHigh);
  complexClose(reverse.fault.totalFaultCurrentKA, add(div(c(E), zu), mHigh));
});

test('exact ideal tie forests retain physical fault location and recover unique cable currents', () => {
  const input = network(['S', 'P', 'L', 'END'], [branch('T1', 'S', 'P', z(0, 0)), branch('T2', 'P', 'L', z(0, 0)), branch('C', 'P', 'END', z(0, 0.02))], [source('U', 'S', c(E), z(0, 0.01)), source('M', 'L', c(E), z(0, 0.1))], 'END');
  const v = E * (1 / 0.01 + 1 / 0.1) / (1 / 0.01 + 1 / 0.1 + 1 / 0.02);
  const result = evaluated(input);
  complexClose(result.fault.totalFaultCurrentKA, c(0, -v / 0.02));
  complexClose(flow(result, 'T1').fromCurrentIntoBranchKA, c(0, -(E - v) / 0.01));
  complexClose(flow(result, 'T2').fromCurrentIntoBranchKA, c(0, (E - v) / 0.1));
  const tiedVoltages = result.busVoltages.filter(row => ['S', 'P', 'L'].includes(row.busId));
  assert.deepEqual(tiedVoltages[0].voltagePhaseV, tiedVoltages[1].voltagePhaseV);
  assert.deepEqual(tiedVoltages[1].voltagePhaseV, tiedVoltages[2].voltagePhaseV);
  input.fault.busId = 'L';
  const localFault = evaluated(input);
  complexClose(flow(localFault, 'T2').fromCurrentIntoBranchKA, c(0, -E / 0.01));
  complexClose(localFault.fault.totalFaultCurrentKA, c(0, -E * (1 / 0.01 + 1 / 0.1)));
});

test('finite-impedance meshes match an independent two-equation reduction', () => {
  const input = network(['A', 'B', 'C'], [branch('AB', 'A', 'B', z(0, 0.03)), branch('BC', 'B', 'C', z(0, 0.04)), branch('AC', 'A', 'C', z(0, 0.05))], [source('U', 'A', c(E), z(0, 0.02)), source('M', 'B', c(E), z(0, 0.1))], 'C');
  const aa = 1 / 0.02 + 1 / 0.03 + 1 / 0.05, bb = 1 / 0.1 + 1 / 0.03 + 1 / 0.04, ab = -1 / 0.03;
  const determinant = aa * bb - ab ** 2;
  const va = (E / 0.02 * bb - ab * E / 0.1) / determinant;
  const vb = (aa * E / 0.1 - ab * E / 0.02) / determinant;
  const result = evaluated(input);
  complexClose(result.fault.totalFaultCurrentKA, c(0, -(va / 0.05 + vb / 0.04)));
});

test('25/50 remote motor equivalents feed a common fault and remain invariant to order and MVA base', () => {
  for (const count of [25, 50]) {
    const ids = Array.from({ length: count }, (_, i) => `M-${String(i).padStart(2, '0')}`);
    const input = network(['A', ...ids], ids.map(id => branch(`C-${id}`, 'A', id, z(0, 0.03))), [source('U', 'A', c(E), z(0, 0.02)), ...ids.map(id => source(id, id, c(E), z(0, 0.1)))]);
    const result = evaluated(input);
    complexClose(result.fault.totalFaultCurrentKA, c(0, -E * (1 / 0.02 + count / 0.13)));
    assert.equal(result.sourceFaultContributions.length, count + 1);
    const reversed = structuredClone(input);
    reversed.buses.reverse(); reversed.branches.reverse(); reversed.sources.reverse();
    assert.deepEqual(evaluated(reversed), result);
    reversed.networkBaseMVA = 100;
    complexClose(evaluated(reversed).fault.totalFaultCurrentKA, c(0, -E * (1 / 0.02 + count / 0.13)));
  }
});

test('out-of-service sources are removed and inventory completeness never becomes verified evidence', () => {
  const input = network(['A', 'B'], [branch('AB', 'A', 'B', z(0, 0.03))], [source('U', 'A', c(E), z(0, 0.02)), source('M', 'B', c(E), z(0, 0.1))]);
  input.sources[1].inService = false;
  input.sourceInventory.status = 'partial';
  const result = evaluated(input);
  complexClose(result.fault.totalFaultCurrentKA, c(0, -E / 0.02));
  assert.equal(result.sourceInventory.status, 'partial');
  assert.equal(result.sourceInventory.verificationStatus, 'not-verified');
  const offline = result.sourceFaultContributions.find(row => row.sourceId === 'M');
  assert.ok(!offline || offline.currentKA.magnitude === 0);
});

test('small but representable currents are not rounded to zero or rejected solely by MVA scaling', () => {
  for (const impedanceOhm of [1e14, 1e160]) {
    const input = network(['A', 'B'], [branch('AB', 'A', 'B', z(impedanceOhm, 0))], [source('U', 'A', c(E), z(impedanceOhm, 0))], 'B');
    const expectedKA = E / impedanceOhm / 2 / 1000;
    for (const base of [0.0001, 1, 100]) {
      input.networkBaseMVA = base;
      const result = evaluated(input);
      assert.ok(Math.abs(result.fault.faultCurrentRmsKA / expectedKA - 1) < 1e-8,
        `${impedanceOhm} ohms on ${base} MVA cannot become zero or a singularity`);
    }
  }
});

test('opposed source phasors sum vectorially while terminal currents remain nonzero', () => {
  const input = network(['A'], [], [source('U', 'A', c(E), z(0, 0.02)), source('M', 'A', c(-E), z(0, 0.02))]);
  const result = evaluated(input);
  close(result.fault.faultCurrentRmsKA, 0);
  assert.ok(terminal(result, 'U').magnitude > 13);
  assert.ok(terminal(result, 'M').magnitude > 13);
  assert.ok(contribution(result, 'U').magnitude + contribution(result, 'M').magnitude > 27);
});

test('unrepresentable source injection and kA conversion cannot silently become evaluated zero current', () => {
  for (const [base, emf, resistance] of [[1, 1e-200, 1e200], [1e-300, 1e-200, 1e200], [1e-200, 1e-161, 1e161]]) {
    const input = network(['A'], [], [source('U', 'A', c(emf), z(resistance, 0))]);
    input.networkBaseMVA = base;
    const result = solvePositiveSequenceBoltedFault(input);
    assert.equal(result.status, 'blocked', JSON.stringify({ base, emf, resistance, result }));
    assert.ok(result.issues.some(item => /RANGE|NONFINITE|UNREPRESENTABLE/.test(item.code)));
    assert.equal(result.fault, null);
    assert.deepEqual(result.sourceFaultContributions, []);
  }
});

test('nearly opposed source phasors retain a small fault current without a cancellation-sensitive residual failure', () => {
  for (const offset of [1e-5, 1e-8, 1e-11]) {
    const input = network(['A'], [], [source('U', 'A', c(E), z(0.006, 0.015)), source('M', 'A', c(-E + offset), z(0.006, 0.015))]);
    const result = evaluated(input);
    const expected = div(c(E + (-E + offset)), c(0.006, 0.015));
    assert.ok(Math.abs(result.fault.totalFaultCurrentKA.re - expected.re / 1000) < 2e-14);
    assert.ok(Math.abs(result.fault.totalFaultCurrentKA.im - expected.im / 1000) < 2e-14);
    assert.ok(result.fault.faultCurrentRmsKA > 0);
    assert.ok(contribution(result, 'U').magnitude + contribution(result, 'M').magnitude > 34);
  }
});

test('healthy unloaded branches do not make valid faults fail a cancellation-sensitive residual check', () => {
  const ids = Array.from({ length: 26 }, (_, index) => `B${index}`);
  const branches = ids.slice(1).map((id, index) => branch(`C${index}`, 'B0', id, z(0.015 + index * 0.00157, 0.00217 + index * 0.000177)));
  const input = network(ids, branches, [source('U', 'B0', c(E), z(0.006, 0.015))], 'B0');
  for (let index = 0; index < ids.length; index += 1) {
    input.fault.busId = ids[index];
    const result = evaluated(input);
    const cable = index === 0 ? c(0) : c(branches[index - 1].impedance.rOhm, branches[index - 1].impedance.xOhm);
    complexClose(result.fault.totalFaultCurrentKA, div(c(E), add(cable, c(0.006, 0.015))));
    for (const row of result.branchTerminalCurrents.filter(row => row.toBusId !== input.fault.busId)) {
      assert.ok(row.toCurrentIntoBranchKA.magnitude < 1e-10, 'Unloaded healthy leaves carry only roundoff-sized current');
    }
  }
});

test('ambiguous ideal loops, invalid data and absent infeed withhold numeric fault currents', () => {
  const valid = network(['A', 'B'], [branch('AB', 'A', 'B', z(0, 0.03))], [source('U', 'A', c(E), z(0, 0.02))]);
  const mutations = [
    input => { input.branches[0].impedance.xOhm = '0.03'; },
    input => { input.branches[0].impedance.referenceBusId = 'UNKNOWN'; },
    input => { input.sources[0].inService = 'true'; },
    input => { input.sources[0].impedance.xOhm = 0; },
    input => { input.sources[0].emfPhaseV.re = Infinity; },
    input => { input.sources[0].emfPhaseV = c(Number.MAX_VALUE, Number.MAX_VALUE); },
    input => { input.sources[0].impedance.xOhm = Number.MIN_VALUE; },
    input => { input.sources[0].reference = ' '; },
    input => { input.sourceInventory.status = 'verified'; },
    input => { input.branches[0].tapPu = c(0); },
    input => { input.buses.push({ ...input.buses[0] }); },
    input => { input.sources[0].inService = false; },
    input => { input.branches = []; input.fault.busId = 'B'; },
    input => { input.branches[0].impedance.xOhm = 0; input.branches.push(branch('SECOND-TIE', 'B', 'A', z(0, 0))); },
    input => { input.branches[0].impedance.xOhm = 0; input.buses[1].voltageLLV = 208; },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(valid); mutate(input);
    const snapshot = structuredClone(input);
    const result = solvePositiveSequenceBoltedFault(input);
    assert.notEqual(result.status, 'evaluated', JSON.stringify(input));
    assert.ok(result.issues.length);
    assert.ok(result.fault?.faultCurrentRmsKA === null || result.fault?.faultCurrentRmsKA === undefined);
    assert.deepEqual(input, snapshot, 'No fixture coercion is permitted');
  }
});
