import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCableSpanFaultEnvelope } from '../analysis/cableSpanFaultEnvelope.mjs';

const c = (re = 0, im = 0) => ({ re, im });
const E = 480 / Math.sqrt(3);
const source = (id, busId, emfPhaseV, rOhm, xOhm) => ({ id, busId, emfPhaseV, impedance: { rOhm, xOhm }, inService: true, reference: `Synthetic analytical source ${id}` });
const branch = (id, fromBusId, toBusId, rOhm, xOhm) => ({ id, fromBusId, toBusId, impedance: { rOhm, xOhm, referenceBusId: toBusId }, tapPu: c(1) });
function input(ids, branches, sources, selected = branches.map(row => row.id)) {
  return { network: { networkBaseMVA: 1, buses: ids.map(id => ({ id, voltageLLV: 480 })), branches, sources,
    sourceInventory: { status: 'complete', reference: 'Complete synthetic mathematical inventory only' } },
    faultSpanBranchIds: branches.map(row => row.id), targetBranchIds: selected,
    profiles: sources.map(row => ({ equipmentId: row.id, points: [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.25, emfMultiplier: 1 }] })),
    clearingTimeS: 0.25, allowancesByBranchId: Object.fromEntries(selected.map(id => [id, 1e12])) };
}
function evaluated(request) {
  const before = structuredClone(request);
  const result = evaluateCableSpanFaultEnvelope(request);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  assert.deepEqual(request, before);
  assert.equal(result.coverage.evaluatedPairCount, request.faultSpanBranchIds.length * request.targetBranchIds.length);
  assert.equal(result.coverage.evaluatedTerminalCount, 2 * result.coverage.evaluatedPairCount);
  assert.equal(result.coverage.status, 'complete-for-all-requested-span-target-pairs');
  return result;
}
const close = (a, b, tolerance = 2e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} versus ${b}`);

test('own-span near-terminal fault uses full source current and clips the supplied linear profile at clearing', () => {
  const request = input(['S', 'L'], [branch('A', 'S', 'L', 0.02, 0.008)], [source('U', 'S', c(E), 0.006, 0.015)]);
  request.profiles[0].points[1].emfMultiplier = 0;
  request.clearingTimeS = 0.1;
  const result = evaluated(request), row = result.targetResults[0];
  // Multipliers are 1 -> .6 over .1 seconds, so integral(m^2 dt)=.1*(1+.6+.36)/3.
  const expected = E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.1 * 1.96 / 3;
  assert.equal(row.from.faultSpanId, 'A');
  close(row.from.position, 0);
  close(row.from.exposureLower, expected);
  close(row.from.exposureUpper, expected);
  assert.ok(Math.abs(row.to.exposureUpper) < expected * 1e-20, 'Unsourced remote half has no physical infeed');
});

test('a selected conductor fails from an interior fault in a different unselected cable', () => {
  const request = input(['M', 'J', 'END'], [branch('B', 'M', 'J', 0.0051, 0.00051), branch('A', 'J', 'END', 1.2105329770517606, 0.07771322815640931)],
    [source('MOTOR', 'M', c(265.5811238272279), 0.0006817787428137423, 0.07606868291111757), source('UTILITY', 'J', c(-234.2272552616048, -148.11344602234817), 0.03544186792469067, 0.07035065044223082)], ['B']);
  request.allowancesByBranchId.B = (26240 * 0.0719) ** 2;
  const result = evaluated(request), row = result.targetResults[0];
  assert.equal(result.comparison, 'fail');
  assert.equal(row.comparison, 'fail');
  assert.equal(row.branchId, 'B');
  assert.equal(row.from.faultSpanId, 'A');
  close(row.from.position, 0.031388224894248624, 1e-11);
  close(row.from.exposureLower, 3853249.467679375, 1e-8);
  close(row.from.exposureUpper, 3853249.467679375, 1e-8);
  close(row.to.exposureUpper, row.from.exposureUpper, 1e-9);
  assert.ok(row.from.positionInterval[0] <= row.from.position && row.from.position <= row.from.positionInterval[1]);
});

test('an ideal fault span is split exactly and retains separate infeed into its two physical halves', () => {
  const request = input(['S', 'L'], [branch('T', 'S', 'L', 0, 0)], [source('U', 'S', c(E), 0.006, 0.015), source('M', 'L', c(260, -20), 0.03, 0.1)]);
  const result = evaluated(request), row = result.targetResults[0];
  close(row.from.exposureLower, E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.25);
  close(row.to.exposureUpper, (260 ** 2 + 20 ** 2) / (0.03 ** 2 + 0.1 ** 2) * 0.25);
  assert.deepEqual(row.from.positionDomain, [0, 1]);
  assert.deepEqual(row.to.positionDomain, [0, 1]);
  assert.equal(row.from.maximumIdentity, 'constant-over-full-interval');
  assert.notEqual(row.from.exposureUpper, row.to.exposureUpper, 'The two fault halves are not constrained equal/opposite');
});

test('ideal target currents retain original injection-node KCL while every other cable is faulted', () => {
  const request = input(['S', 'P', 'L'], [branch('T', 'S', 'P', 0, 0), branch('A', 'P', 'L', 0.02, 0.008)], [source('U', 'S', c(E), 0.006, 0.015), source('M', 'L', c(260, -20), 0.03, 0.1)]);
  const result = evaluated(request);
  const tied = result.targetResults.find(row => row.branchId === 'T');
  close(tied.from.exposureUpper, E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.25);
  const a = result.targetResults.find(row => row.branchId === 'A');
  close(a.from.exposureUpper, E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.25);
  close(a.to.exposureUpper, (260 ** 2 + 20 ** 2) / (0.03 ** 2 + 0.1 ** 2) * 0.25);
});

test('mixed-voltage phase-shifting transformer preserves the low-side fault-current basis', () => {
  const tx = branch('TX', 'H', 'L', 0.01, 0.025);
  tx.tapPu = c(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  const request = input(['H', 'L', 'END'], [tx, branch('A', 'L', 'END', 0.02, 0.008)], [source('U', 'H', c(E), 0.006, 0.015)], ['A']);
  request.faultSpanBranchIds = ['A'];
  request.network.buses.slice(1).forEach(bus => { bus.voltageLLV = 208; });
  const result = evaluated(request), row = result.targetResults[0];
  const ratio = 480 / 208;
  const rLow = 0.006 / ratio ** 2 + 0.01, xLow = 0.015 / ratio ** 2 + 0.025;
  const expected = (208 / Math.sqrt(3)) ** 2 / (rLow ** 2 + xLow ** 2) * 0.25;
  close(row.from.exposureUpper, expected);
  close(row.from.position, 0);
});

test('50-load coverage checks every fault span against every target without adding dense histories', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `L${i}`);
  const request = input(['S', ...ids], ids.map((id, i) => branch(`C${i}`, 'S', id, 0.02 + i * 0.001, 0.008 + i * 0.0001)), [source('U', 'S', c(E), 0.006, 0.015)]);
  const result = evaluated(request);
  assert.equal(result.coverage.expectedPairCount, 2500);
  assert.equal(result.coverage.evaluatedTerminalCount, 5000);
  assert.equal(result.targetResults.length, 50);
  const expected = E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.25;
  for (const row of result.targetResults) close(row.from.exposureUpper, expected);
  assert.ok(JSON.stringify(result).length < 250000, 'Result summaries do not duplicate the transient network operator or all pair histories');
});

test('tree reduction retains reversed span orientation and transformer transfer to an upstream conductor', () => {
  const reverse = input(['S', 'L'], [branch('A', 'S', 'L', 0.02, 0.008)], [source('U', 'L', c(E), 0.006, 0.015)]);
  const reversed = evaluated(reverse).targetResults[0];
  assert.equal(reversed.to.position, 1);
  close(reversed.to.exposureUpper, E ** 2 / (0.006 ** 2 + 0.015 ** 2) * 0.25);
  assert.equal(reversed.from.exposureUpper, 0);
  const tx = branch('TX', 'H1', 'L', 0.01, 0.025);
  tx.tapPu = c(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  const request = input(['H0', 'H1', 'L', 'END', 'OFF'], [branch('B', 'H1', 'H0', 0.005, 0.002), tx,
    branch('A', 'L', 'END', 0.02, 0.008), branch('OFF', 'H0', 'OFF', 0.03, 0.01)], [source('U', 'H0', c(E), 0.006, 0.015)], ['B', 'OFF']);
  request.faultSpanBranchIds = ['A'];
  request.network.buses.filter(bus => ['L', 'END'].includes(bus.id)).forEach(bus => { bus.voltageLLV = 208; });
  const result = evaluated(request), upstream = result.targetResults.find(row => row.branchId === 'B');
  assert.equal(result.coverage.structuralReduction, 'single-in-service-source-unloaded-tree-kcl');
  const a2 = (480 / 208) ** 2;
  const expected = E ** 2 / ((0.006 + 0.005 + a2 * 0.01) ** 2 + (0.015 + 0.002 + a2 * 0.025) ** 2) * 0.25;
  close(upstream.from.exposureUpper, expected);
  assert.equal(result.targetResults.find(row => row.branchId === 'OFF').from.exposureUpper, 0);
});

test('a second connected zero-EMF source disables structural zeros and carries real off-fault-path current', () => {
  const request = input(['S', 'M', 'END'], [branch('B', 'S', 'M', 0.02, 0), branch('A', 'S', 'END', 0.04, 0)],
    [source('U', 'S', c(E), 0.01, 0), source('ZERO', 'M', c(), 0.1, 0)], ['B']);
  request.faultSpanBranchIds = ['A'];
  const result = evaluated(request), row = result.targetResults[0];
  assert.equal(result.coverage.structuralReduction, 'general-network-port-response');
  close(row.from.exposureUpper, (6.25 * E) ** 2 * 0.25);
  assert.equal(row.from.position, 1);
  assert.ok(row.from.exposureLower > 0);
});

test('missing identities, source histories, unsupported spans and excessive work remain incomplete and numeric-free', () => {
  const valid = input(['S', 'L'], [branch('A', 'S', 'L', 0.02, 0.008)], [source('U', 'S', c(E), 0.006, 0.015)]);
  for (const change of [
    row => { row.targetBranchIds = ['UNKNOWN']; },
    row => { row.faultSpanBranchIds.push('A'); },
    row => { row.profiles = []; },
    row => { row.profiles[0].points[1].timeS = 0.01; },
    row => { row.profiles[0].points[1].emfMultiplier = -1; },
    row => { row.network.branches[0].tapPu = c(1.01); },
    row => { row.allowancesByBranchId.A = 0; },
    row => { row.faultSpanBranchIds = Array.from({ length: 12001 }, (_, i) => `C${i}`); },
  ]) {
    const request = structuredClone(valid); change(request);
    const result = evaluateCableSpanFaultEnvelope(request);
    assert.equal(result.status, 'blocked');
    assert.equal(result.coverage.status, 'incomplete');
    assert.equal(result.comparison, 'not-evaluated');
    assert.deepEqual(result.targetResults, []);
  }
});
