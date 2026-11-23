import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { evaluateDesignSynthesisStudy } from '../analysis/designSynthesisStudy.mjs';

// Independent secondary-referred radial sweep in physical volts/amps. This
// oracle does not use the application's model builder, per-unit conversion,
// Newton Jacobian, cable impedance helper, or transformer profile derivation.
const cableRx = {
  '#8 AWG': [0.810, 0.052], '#6 AWG': [0.510, 0.051],
  '#4 AWG': [0.320, 0.048], '#3 AWG': [0.254, 0.047],
  '#2 AWG': [0.201, 0.045], '#1 AWG': [0.159, 0.046],
  '1/0 AWG': [0.127, 0.044], '2/0 AWG': [0.102, 0.043],
  '3/0 AWG': [0.079, 0.042], '4/0 AWG': [0.063, 0.041],
  '250 kcmil': [0.053, 0.041], '350 kcmil': [0.039, 0.040],
  '500 kcmil': [0.027, 0.039], '600 kcmil': [0.024, 0.039],
  '750 kcmil': [0.019, 0.038],
};
const transformerPublication = {
  EXN30T3HCU: { kva: 30, z: 0.0408, xr: 0.65, coreW: 68 },
  EXN75T3HCU: { kva: 75, z: 0.0556, xr: 1.76, coreW: 142 },
  EXN150T3HCU: { kva: 150, z: 0.0379, xr: 1.70, coreW: 235 },
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const scale = (a, k) => [a[0] * k, a[1] * k];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = a => [a[0], -a[1]];
const abs = a => Math.hypot(...a);
const divide = (a, b) => scale(mul(a, conj(b)), 1 / abs(b) ** 2);
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}, tolerance ${tolerance}`);

function fixture(count = 25) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({
    ...originals[index % originals.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`,
    voltage: index < count * 0.8 ? 208 : 480, kw: index < count * 0.8 ? 1 : 3,
    powerFactor: 0.9, phases: 3,
  }));
  return input;
}

function independentNetwork(input, proposal) {
  const tx = proposal.transformer;
  assert.ok(tx, 'A transformer must be part of the same generated proposal');
  const pub = transformerPublication[tx.catalogNumber];
  assert.ok(pub, `Unexpected transformer publication ${tx.catalogNumber}`);
  const nodes = new Map(proposal.equipment.filter(row => row.type !== 'transformer').map(row => [row.id, row]));
  const edgeList = proposal.cables.map(cable => {
    const rx = cableRx[cable.conductor_size];
    assert.ok(rx, `Unknown conductor ${cable.conductor_size}`);
    return { id: cable.id, from: cable.from, to: cable.to, ratio: 1, z: scale(rx, cable.lengthFt / 1000), g: 0 };
  });
  const zPrimary = pub.z * 480 ** 2 / (pub.kva * 1000);
  const rPrimary = zPrimary / Math.hypot(1, pub.xr);
  edgeList.push({ id: tx.id, from: tx.primaryBusId, to: tx.secondaryBusId, ratio: 208 / 480,
    z: scale([rPrimary, rPrimary * pub.xr], (208 / 480) ** 2), g: pub.coreW / 480 ** 2 });
  const byParent = new Map();
  for (const edge of edgeList) {
    assert.ok(nodes.has(edge.from) && nodes.has(edge.to), `${edge.id}: missing terminal node`);
    byParent.set(edge.from, [...(byParent.get(edge.from) || []), edge]);
  }
  const order = [input.supply.id];
  const seen = new Set(order);
  for (let index = 0; index < order.length; index += 1) {
    for (const edge of byParent.get(order[index]) || []) {
      assert.ok(!seen.has(edge.to), `Loop or multiple parents at ${edge.to}`);
      seen.add(edge.to); order.push(edge.to);
    }
  }
  assert.equal(seen.size, nodes.size, 'Every generated terminal, panel and load must be source-connected');
  const powers = new Map(input.equipment.map(load => [load.id, [load.kw * 1000 / 3, load.kw * 1000 / 3 * Math.tan(Math.acos(load.powerFactor))]]));
  const volts = new Map([...nodes].map(([id, row]) => [id, [row.voltage / Math.sqrt(3), 0]]));
  const currents = new Map();
  let sourceCurrent;
  let converged = false;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    for (const id of [...order].reverse()) {
      let total = conj(divide(powers.get(id) || [0, 0], volts.get(id)));
      for (const edge of byParent.get(id) || []) {
        total = add(total, add(scale(currents.get(edge.id), edge.ratio), scale(volts.get(id), edge.g)));
      }
      const parentEdge = edgeList.find(edge => edge.to === id);
      if (parentEdge) currents.set(parentEdge.id, total);
      else sourceCurrent = total;
    }
    let delta = 0;
    for (const id of order) {
      for (const edge of byParent.get(id) || []) {
        const next = sub(scale(volts.get(id), edge.ratio), mul(edge.z, currents.get(edge.id)));
        delta = Math.max(delta, abs(sub(next, volts.get(edge.to))));
        volts.set(edge.to, next);
      }
    }
    if (delta < 1e-10) { converged = true; break; }
  }
  assert.ok(converged, 'Independent radial sweep did not converge');
  const sourcePower = scale(mul(volts.get(input.supply.id), conj(sourceCurrent)), 3 / 1000);
  const terminalCurrents = new Map(edgeList.map(edge => [edge.id, {
    from: abs(add(scale(currents.get(edge.id), edge.ratio), scale(volts.get(edge.from), edge.g))),
    to: abs(currents.get(edge.id)),
  }]));
  return { nodes, volts, terminalCurrents, sourcePower };
}

for (const count of [25, 50]) {
  test(`${count} mixed-voltage loads form one network and agree with an independent radial sweep`, () => {
    const input = fixture(count);
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.loads.length, count);
    assert.equal(proposal.checks.find(check => check.id === 'loadFlow')?.status, 'pass',
      'The final proposal must retain the successful operating-study check after revisions');
    assert.equal(proposal.transformer.catalogNumber, count === 25 ? 'EXN75T3HCU' : 'EXN150T3HCU',
      'The connected operating study must select a profile meeting the unchanged voltage criterion');
    assert.deepEqual(input, original, 'Generation must not rewrite equipment ratings or criteria');
    const oracle = independentNetwork(input, proposal);
    const model = buildLoadFlowModel(proposal.oneLine);
    assert.equal(model.branches.length, proposal.cables.length + 1);
    for (const baseMVA of [0.1, 1]) {
      const result = runLoadFlow(model, { baseMVA, balanced: true, maxIterations: 60 });
      assert.equal(result.converged, true);
      for (const bus of result.buses) {
        const physical = oracle.volts.get(bus.id);
        assert.ok(physical, `Unexpected modeled bus ${bus.id}`);
        near(bus.Vm, abs(physical) * Math.sqrt(3) / oracle.nodes.get(bus.id).voltage, 1e-5, `${bus.id} voltage pu`);
      }
      for (const line of result.lines) {
        const expected = oracle.terminalCurrents.get(line.id);
        assert.ok(expected, `Unexpected modeled branch ${line.id}`);
        near(line.fromCurrentA, expected.from, 0.05, `${line.id} from amps`);
        near(line.toCurrentA, expected.to, 0.05, `${line.id} to amps`);
      }
      // The 1e-6 pu solver residual permits 1 W per bus at the 1 MVA base.
      // Allow accumulated system residual, while requiring every bus/current.
      near(result.summary.totalGenKW, oracle.sourcePower[0], count * 0.002, 'Source real kW');
      near(result.summary.totalGenKVAR, oracle.sourcePower[1], count * 0.002, 'Source reactive kvar');
      near(result.losses.P, oracle.sourcePower[0] - input.equipment.reduce((sum, row) => sum + row.kw, 0), count * 0.002, 'Network loss kW');
    }
    if (count === 25) {
      // Signed displacement is not sourced. In this radial balanced model,
      // changing the downstream angle reference must not change magnitudes.
      for (const displacement of [-30, 30]) {
        const shifted = structuredClone(proposal.oneLine);
        shifted.sheets.flatMap(sheet => sheet.components).find(row => row.id === proposal.transformer.id).phaseShiftDeg = displacement;
        const result = runLoadFlow(buildLoadFlowModel(shifted), { baseMVA: 1, balanced: true, maxIterations: 60 });
        assert.equal(result.converged, true);
        for (const bus of result.buses) near(bus.Vm, abs(oracle.volts.get(bus.id)) * Math.sqrt(3) / oracle.nodes.get(bus.id).voltage, 1e-5, `${displacement}deg ${bus.id} magnitude`);
        near(result.summary.totalGenKW, oracle.sourcePower[0], 0.05, 'Phase reference does not change source kW');
      }
    }
  });
}

test('independent ideal-cable bound shows the 25-load case needs more than the 30 kVA capacity-only choice', () => {
  const pub = transformerPublication.EXN30T3HCU;
  const r = pub.z * 208 ** 2 / (pub.kva * 1000) / Math.hypot(1, pub.xr);
  const x = r * pub.xr;
  const p = 20000 / 3, q = p * Math.tan(Math.acos(0.9));
  const vSquared = 208 ** 2 / 3;
  const a = vSquared - 2 * (r * p + x * q);
  const b = (r * r + x * x) * (p * p + q * q);
  const vm = Math.sqrt((a + Math.sqrt(a * a - 4 * b)) / 2 / vSquared);
  assert.ok(20 / 0.9 < pub.kva, 'Capacity alone admits the smaller transformer');
  assert.ok(vm < 0.97, `Even ideal cables leave receiving voltage ${vm} pu below 0.97`);
});

test('transformer revisions respect the original profile policy and shared revision budget', () => {
  const input = fixture(25);
  input.criteria.loadFlow = { maxRevisions: 0 };
  const initial = generateDesignProposal(input);
  assert.equal(initial.status, 'blocked');
  assert.equal(initial.transformer.catalogNumber, 'EXN30T3HCU');
  assert.equal(initial.studyValidation.history.length, 1);
  assert.equal(initial.studyValidation.stopReason, 'revision-budget-exhausted');

  input.criteria.loadFlow.maxRevisions = 1;
  const revised = generateDesignProposal(input);
  assert.equal(revised.status, 'proposal', JSON.stringify(revised.issues));
  assert.equal(revised.transformer.catalogNumber, 'EXN75T3HCU');
  assert.equal(revised.studyValidation.history.length, 2);
  assert.equal(revised.studyValidation.history[0].status, 'fail');
  assert.equal(revised.studyValidation.history[1].status, 'pass');

  input.criteria.transformer = { allowedProfileIds: ['schneider-exn30t3hcu-2020'] };
  const original = structuredClone(input);
  const restricted = generateDesignProposal(input);
  assert.equal(restricted.status, 'blocked', 'A failed study cannot silently bypass the transformer allowlist');
  assert.equal(restricted.transformer.catalogNumber, 'EXN30T3HCU');
  assert.ok(restricted.studyValidation.history.length <= 2, 'The same revision budget covers all candidate types');
  assert.deepEqual(input, original);
  assert.equal(restricted.loadDispositions.length, 25);
});

test('transformer operating study checks aggregate secondary-main duty and loading policy', () => {
  const input = fixture(25);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  const actual = proposal.studyValidation.final.circuits.find(row => row.type === 'transformer');
  const insufficientMain = structuredClone(proposal);
  insufficientMain.equipment.find(row => row.type === 'transformer').secondaryMainDevice.continuousCurrentA = actual.secondaryCurrentA * 1.1;
  const mainStudy = evaluateDesignSynthesisStudy(insufficientMain, input.criteria);
  assert.equal(mainStudy.status, 'fail', 'A main below continuous design duty cannot pass merely because it exceeds running amps');
  assert.equal(mainStudy.final.circuits.find(row => row.type === 'transformer').status, 'fail');
  assert.notEqual(mainStudy.modelInputFingerprint, proposal.studyValidation.modelInputFingerprint,
    'Changing transformer protection must invalidate saved operating-check evidence');

  const insufficientLoading = structuredClone(proposal);
  insufficientLoading.equipment.find(row => row.type === 'transformer').maximumLoadingPercent = actual.loadingPercent - 0.1;
  const loadingStudy = evaluateDesignSynthesisStudy(insufficientLoading, input.criteria);
  assert.equal(loadingStudy.status, 'fail', 'Both terminal currents must obey the user loading limit');
  assert.notEqual(loadingStudy.modelInputFingerprint, proposal.studyValidation.modelInputFingerprint,
    'Changing transformer loading policy must invalidate saved operating-check evidence');
});

test('mixed-voltage conductor revisions traverse the transformer to its primary feeder', () => {
  const input = fixture(25);
  input.criteria.transformer = { allowedProfileIds: ['schneider-exn75t3hcu-2020'] };
  input.criteria.loadFlow = { minimumVoltagePu: 0.983, maxRevisions: 12 };
  const original = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.deepEqual(input, original);
  assert.equal(proposal.transformer.catalogNumber, 'EXN75T3HCU');
  const primary = proposal.cables.find(cable => cable.transformerSide === 'primary');
  assert.ok(proposal.studyValidation.conductorChanges.some(change => change.cableId === primary.id && change.from !== change.to),
    'Failed downstream buses must cause real primary-feeder revisions where needed');
  const oracle = independentNetwork(input, proposal);
  const minimumVoltage = Math.min(...[...oracle.volts].map(([id, voltage]) => abs(voltage) * Math.sqrt(3) / oracle.nodes.get(id).voltage));
  assert.ok(minimumVoltage >= 0.983, `Independent final minimum ${minimumVoltage} must meet the unchanged criterion`);
  near(proposal.studyValidation.final.minimumVoltagePu, minimumVoltage, 1e-5, 'Revised primary/secondary network voltage');
  assert.ok(proposal.studyValidation.history.length <= 13);
});

test('browser regeneration fixture retains all increased load and meets voltage after conductor revisions', () => {
  const input = fixture(25);
  for (const load of input.equipment) if (load.voltage === 208) load.kw = 2;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.loads.reduce((sum, load) => sum + load.kw, 0), 55);
  assert.equal(proposal.transformer.catalogNumber, 'EXN75T3HCU');
  const oracle = independentNetwork(input, proposal);
  const minimumVoltage = Math.min(...[...oracle.volts].map(([id, voltage]) => abs(voltage) * Math.sqrt(3) / oracle.nodes.get(id).voltage));
  assert.ok(minimumVoltage >= 0.97, `Independent revised voltage ${minimumVoltage} must satisfy 3% criterion`);
  near(proposal.studyValidation.final.minimumVoltagePu, minimumVoltage, 1e-5, 'Regenerated layout minimum voltage');
});
