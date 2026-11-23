import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { evaluateDesignSynthesisStudy } from '../analysis/designSynthesisStudy.mjs';

function fixture() {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.supply = { ...input.supply, x: 0, y: 0, z: 0, capacityKva: 10000 };
  input.equipment = Array.from({ length: 25 }, (_, index) => ({
    ...input.equipment[0], id: `LOAD-${String(index + 1).padStart(2, '0')}`, tag: `LOAD-${String(index + 1).padStart(2, '0')}`,
    kw: 10, powerFactor: 0.9, x: 250, y: 0, z: 0,
  }));
  input.corridors = {
    nodes: [{ id: 'S', x: 0, y: 0, z: 0 }, { id: 'P', x: 100, y: 0, z: 0 }, { id: 'L', x: 250, y: 0, z: 0 }],
    edges: [{ id: 'SP', from: 'S', to: 'P', widthIn: 48, depthIn: 6 }, { id: 'PL', from: 'P', to: 'L', widthIn: 48, depthIn: 6 }],
  };
  input.criteria.maxLoadsPerPanel = 1;
  input.overrides = { panelLocations: Object.fromEntries(input.equipment.map((_, index) => [`DP-${String(index + 1).padStart(2, '0')}`, { x: 100, y: 0, z: 0 }])) };
  return input;
}

// Independent transcription from Southwire SPEC45301, not the runtime catalog.
const rx = {
  '#8 AWG': [0.810, 0.052], '#6 AWG': [0.510, 0.051], '#4 AWG': [0.320, 0.048],
  '#3 AWG': [0.254, 0.047], '#2 AWG': [0.201, 0.045], '#1 AWG': [0.159, 0.046],
  '1/0 AWG': [0.127, 0.044], '2/0 AWG': [0.102, 0.043], '3/0 AWG': [0.079, 0.042],
  '4/0 AWG': [0.063, 0.041], '250 kcmil': [0.053, 0.041], '350 kcmil': [0.039, 0.040],
  '500 kcmil': [0.027, 0.039], '600 kcmil': [0.024, 0.039], '750 kcmil': [0.019, 0.038],
};
const near = (actual, expected, tolerance) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} +/- ${tolerance}`);

function independentCircuit(feeder, branch) {
  const r = rx[feeder.conductor_size][0] * 0.100 + rx[branch.conductor_size][0] * 0.150;
  const x = rx[feeder.conductor_size][1] * 0.100 + rx[branch.conductor_size][1] * 0.150;
  const p = 10000 / 3, q = p * Math.tan(Math.acos(0.9));
  const a = 480 ** 2 / 3 - 2 * (r * p + x * q);
  const b = (r * r + x * x) * (p * p + q * q);
  const w = (a + Math.sqrt(a * a - 4 * b)) / 2;
  const amps = Math.hypot(p, q) / Math.sqrt(w);
  return { vm: Math.sqrt(3 * w) / 480, amps, lossKw: 3 * amps ** 2 * r / 1000, lossKvar: 3 * amps ** 2 * x / 1000 };
}

test('automatic revision meets operating voltage and matches independent series-circuit arithmetic for all 25 loads', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.995 };
  const before = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.deepEqual(input, before, 'The loop cannot improve results by changing input ratings or limits');
  assert.deepEqual(proposal.inputs.original, before);
  assert.ok(proposal.studyValidation, 'The proposal must retain the study and revision evidence');
  assert.ok(proposal.cables.some(cable => cable.conductor_size !== '#8 AWG'), 'A real selection change is required');
  assert.ok(Array.isArray(proposal.studyValidation.conductorChanges));
  assert.ok(proposal.studyValidation.conductorChanges.length > 0);
  for (const change of proposal.studyValidation.conductorChanges) {
    assert.equal(change.from, '#8 AWG');
    assert.equal(change.to, proposal.cables.find(cable => cable.id === change.cableId).conductor_size);
  }
  assert.equal(proposal.cables.length, 50);
  assert.equal(proposal.panels.length, 25);
  const study = runLoadFlow(buildLoadFlowModel(proposal.oneLine), { baseMVA: 1, balanced: true, maxIterations: 60 });
  const newtonStudy = runLoadFlow(buildLoadFlowModel(proposal.oneLine), { baseMVA: 1, balanced: true, maxIterations: 60, radialOptimization: false });
  assert.equal(study.converged, true);
  assert.equal(newtonStudy.converged, true, 'The general solver must also solve the same physical network');
  assert.ok(study.maxMismatchKW < 0.001);
  let totalLossKw = 0, totalLossKvar = 0;
  for (const load of input.equipment) {
    const panel = proposal.panels.find(row => row.loadIds.includes(load.id));
    const feeder = proposal.cables.find(row => row.to === panel.id);
    const branch = proposal.cables.find(row => row.loadId === load.id);
    assert.equal(feeder.length, 100);
    assert.equal(branch.length, 150);
    const expected = independentCircuit(feeder, branch);
    assert.ok(expected.vm >= 0.995 - 1e-8);
    // The same bounded residual current across at most 250 ft of #8 cable
    // produces less than 3e-6 pu voltage error at 480 V.
    near(study.buses.find(row => row.id === load.id).Vm, expected.vm, 3e-6);
    near(newtonStudy.buses.find(row => row.id === load.id).Vm, expected.vm, 3e-6);
    for (const cable of [feeder, branch]) {
      // Solver tolerance is 1e-6 pu on a 1 MVA base (1 W/var per bus).
      // Two downstream buses can contribute residual current; 0.004 A bounds
      // 2 * sqrt(2) * 1 VA / (sqrt(3) * 480 V * 0.995), with rounding margin.
      near(study.lines.find(row => row.id === cable.id).amps, expected.amps, 0.004);
      assert.ok(cable.ampacityA >= expected.amps * 1.25 - 1e-6);
      assert.ok(cable.protectiveDevice.continuousCurrentA >= expected.amps * 1.25 - 1e-6);
      assert.equal(proposal.routeResults.batchResults.find(row => row.cable === cable.tag).total_length, cable.length);
    }
    totalLossKw += expected.lossKw;
    totalLossKvar += expected.lossKvar;
  }
  // Aggregate I²R sensitivity to the bounded current residual stays below 1 W.
  near(study.losses.P, totalLossKw, 0.001);
  near(study.summary.totalGenKW, 250 + totalLossKw, 0.005);
  near(study.summary.totalGenKVAR, 250 * Math.tan(Math.acos(0.9)) + totalLossKvar, 0.005);
  assert.deepEqual(generateDesignProposal(input), proposal, 'Identical inputs must have deterministic iteration evidence');
});

test('continuous operating current revises protection without upsizing unrelated circuits', () => {
  const input = fixture();
  input.equipment[0].kw = (20 / 1.25) * Math.sqrt(3) * 480 * 0.9 / 1000 * 0.999;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const study = runLoadFlow(buildLoadFlowModel(proposal.oneLine), { baseMVA: 1, balanced: true, maxIterations: 60 });
  const targetPanel = proposal.panels.find(panel => panel.loadIds.includes(input.equipment[0].id));
  for (const cable of proposal.cables) {
    const operating = study.lines.find(line => line.id === cable.id).amps;
    assert.ok(cable.protectiveDevice.continuousCurrentA + 1e-6 >= operating * 1.25, cable.id);
    if (cable.loadId !== input.equipment[0].id && cable.to !== targetPanel.id) {
      assert.equal(cable.conductor_size, '#8 AWG', `${cable.id}: unrelated circuits must retain their feasible selection`);
    }
  }
});

test('source operating capacity includes losses and can drive revision without changing equipment ratings', () => {
  const input = fixture();
  input.supply.capacityKva = 278.5;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.ok(proposal.cables.some(cable => cable.conductor_size !== '#8 AWG'));
  const study = runLoadFlow(buildLoadFlowModel(proposal.oneLine), { baseMVA: 1, balanced: true, maxIterations: 60 });
  assert.equal(study.converged, true);
  assert.ok(Math.hypot(study.summary.totalGenKW, study.summary.totalGenKVAR) <= input.supply.capacityKva + 1e-6);
  assert.equal(proposal.loads.reduce((sum, load) => sum + load.kw, 0), 250);
});

test('voltage-driven revision retains non-continuous branch duty without adding a continuous allowance', () => {
  const input = fixture();
  input.equipment[0].kw = 17 * Math.sqrt(3) * 480 * 0.9 / 1000;
  input.equipment[0].duty = 'non-continuous';
  input.criteria.loadFlow = { minimumVoltagePu: 0.995 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const branch = proposal.cables.find(cable => cable.loadId === input.equipment[0].id);
  const circuit = proposal.studyValidation.final.circuits.find(row => row.id === branch.id);
  assert.equal(circuit.dutyFactor, 1);
  assert.equal(circuit.designCurrentA, circuit.currentA);
  assert.ok(branch.protectiveRequirement.ampereRatingA < 20);
  assert.equal(branch.protectiveDevice.continuousCurrentA, 20);
});

test('low-voltage revisions target the failing source-to-load path', () => {
  const input = fixture();
  input.equipment.slice(1).forEach(load => { load.x = 125; });
  input.criteria.loadFlow = { minimumVoltagePu: 0.995 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const targetPanel = proposal.panels.find(panel => panel.loadIds.includes(input.equipment[0].id));
  for (const cable of proposal.cables) {
    if (cable.loadId !== input.equipment[0].id && cable.to !== targetPanel.id) {
      assert.equal(cable.conductor_size, '#8 AWG', `${cable.id}: already feasible independent paths must remain unchanged`);
    }
  }
});

test('a larger revision budget reaches the final catalog size with 60 C terminals', () => {
  const input = fixture();
  input.equipment.slice(1).forEach(load => { load.kw = 0.1; });
  input.criteria.terminalRatingC = 60;
  input.criteria.loadFlow = { minimumVoltagePu: 0.99955, maxRevisions: 64 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const targetPanel = proposal.panels.find(panel => panel.loadIds.includes(input.equipment[0].id));
  for (const cable of proposal.cables) {
    if (cable.loadId === input.equipment[0].id || cable.to === targetPanel.id) {
      assert.equal(cable.conductor_size, '750 kcmil');
      assert.equal(cable.ampacityA, 400, 'The 60 C terminal cap remains active after catalog stepping');
    } else assert.equal(cable.conductor_size, '#8 AWG');
  }
});

test('revision exhaustion and nonconvergence cannot leave an applicable proposal or accepted loads', () => {
  for (const loadFlow of [{ minimumVoltagePu: 0.995, maxRevisions: 0 }, { maxIterations: 1 }]) {
    const input = fixture();
    input.criteria.loadFlow = loadFlow;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', JSON.stringify(loadFlow));
    assert.ok(proposal.studyValidation);
    assert.equal(proposal.distributionBaseline, null);
    assert.equal(proposal.summary.generatedLoadCount, 0);
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking'));
    assert.ok(proposal.loadDispositions.every(row => row.status !== 'accepted'));
    assert.ok(proposal.panelLocationOverrides.every(row => row.status === 'blocked'));
    assert.equal(proposal.studyValidation.stopReason, loadFlow.maxRevisions === 0 ? 'revision-budget-exhausted' : 'nonconvergence');
  }
});

test('invalid study criteria are diagnostic input rather than implicit defaults', () => {
  for (const loadFlow of [null, false, { disabled: true }, { minimumVoltagePu: '0.995' }, { minimumVoltagePu: null }, { minimumVoltagePu: 1.1 }, { minimumVoltagePu: 0.95 }, { maxIterations: 0 }, { maxIterations: null }, { maxRevisions: -1 }, { maxRevisions: null }]) {
    const input = fixture();
    input.criteria.loadFlow = loadFlow;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', JSON.stringify(loadFlow));
    assert.deepEqual(proposal.inputs.original.criteria.loadFlow, loadFlow);
    assert.ok(proposal.issues.some(issue => issue.path?.startsWith('criteria.loadFlow')));
  }
});

test('exhaustion retains both the initial study and the attempted revision', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.999, maxRevisions: 1 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.studyValidation.history.length, 2);
  assert.ok(proposal.issues.some(issue => /revision|budget|exhaust/i.test(`${issue.code} ${issue.message}`)));
  assert.ok(proposal.checks.some(check => check.id === 'loadFlow' && check.status !== 'pass'));
  assert.equal(proposal.studyValidation.stopReason, 'revision-budget-exhausted');
  const last = proposal.studyValidation.history.at(-1);
  assert.deepEqual(proposal.studyValidation.final, last.final);
  const independentlyRepeated = evaluateDesignSynthesisStudy(proposal, input.criteria);
  assert.deepEqual(proposal.studyValidation.final, independentlyRepeated.final);
  assert.deepEqual(proposal.studyValidation.modelInputFingerprint, independentlyRepeated.modelInputFingerprint);
  assert.ok(proposal.cables.some(cable => cable.conductor_size === '#6 AWG'));
});

test('public generation cannot bypass the operating study using internal revision options', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.999, maxRevisions: 0 };
  const proposal = generateDesignProposal(input, { skipStudy: true });
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.studyValidation);
});

test('a revised cable that exceeds raceway capacity retains the attempted selection and unevaluated study', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.995 };
  input.corridors.edges.forEach(edge => { edge.widthIn = 12; });
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.studyValidation.status, 'unevaluated');
  assert.equal(proposal.studyValidation.stopReason, 'regeneration-blocked');
  assert.ok(proposal.studyValidation.final == null, 'The unstudied attempted design must not inherit an earlier numeric result');
  assert.equal(proposal.studyValidation.history.length, 2);
  assert.ok(proposal.studyValidation.history[0].final.minVoltagePu < 0.995);
  assert.ok(proposal.cables.every(cable => cable.conductor_size === '#6 AWG'));
  assert.ok(proposal.issues.some(issue => issue.code === 'RACEWAY-CAPACITY-BLOCKED'));
  assert.equal(proposal.distributionBaseline, null);
  assert.equal(proposal.summary.generatedLoadCount, 0);
  assert.ok(proposal.loadDispositions.every(row => row.status !== 'accepted'));
});

test('study coverage cannot pass a missing or inconsistent generated circuit model', () => {
  const proposal = generateDesignProposal(fixture());
  assert.equal(proposal.status, 'proposal');
  const cases = [
    { ...proposal, oneLine: { activeSheet: 0, sheets: [] } },
    { ...proposal, cables: proposal.cables.slice(1) },
    { ...proposal, cables: [...proposal.cables, proposal.cables[0]] },
    { ...proposal, cables: proposal.cables.map((row, index) => index === 0 ? { ...row, id: 'FOREIGN-CIRCUIT' } : row) },
    { ...proposal, equipment: [] },
    { ...proposal, equipment: [...proposal.equipment, proposal.equipment[0]] },
    { ...proposal, equipment: proposal.equipment.slice(0, -1) },
    { ...proposal, loads: [...proposal.loads, { ...proposal.loads[0], id: 'FOREIGN-LOAD' }] },
  ];
  for (const changed of cases) {
    const study = evaluateDesignSynthesisStudy(changed, proposal.inputs.criteria);
    assert.notEqual(study.status, 'pass');
    assert.ok(study.issues.some(issue => issue.severity === 'blocking'));
  }
});
