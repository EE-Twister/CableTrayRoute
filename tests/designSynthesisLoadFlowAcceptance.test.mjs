import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} +/- ${tolerance}`);

test('generated drawing produces exactly the intended electrical branches and retains load power', () => {
  const input = sample();
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  const model = buildLoadFlowModel(proposal.oneLine);
  assert.equal(model.buses.length, 35);
  assert.equal(model.branches.length, 34);
  assert.deepEqual(new Set(model.branches.map(branch => branch.id)), new Set(proposal.cables.map(cable => cable.id)));
  assert.equal(model.buses.filter(bus => bus.busType === 'slack').length, 1);
  assert.equal(model.buses.find(bus => bus.busType === 'slack').id, input.supply.id);
  for (const load of input.equipment) {
    const bus = model.buses.find(item => item.id === load.id);
    near(bus.load.kw, load.kw);
    near(bus.load.kvar, load.kw * Math.tan(Math.acos(load.powerFactor)));
  }
  for (const cable of proposal.cables) {
    const branch = model.branches.find(item => item.id === cable.id);
    assert.equal(branch.from, cable.from);
    assert.equal(branch.to, cable.to);
    assert.equal(branch.rating, cable.ampacityA, 'Selected cable ampacity must reach the study model');
    if (cable.length > 0) assert.ok(branch.impedance.r > 0 && branch.impedance.x > 0, cable.id);
    else { near(branch.impedance.r, 0); near(branch.impedance.x, 0); }
  }
  // Independent Southwire SPEC45301 transcription for the sample's first feeder.
  const feeder = proposal.cables.find(item => item.id === 'F-DP-01');
  assert.equal(feeder.conductor_size, '600 kcmil');
  const feederBranch = model.branches.find(item => item.id === feeder.id);
  near(feederBranch.impedance.r, 0.024 * feeder.length / 1000);
  near(feederBranch.impedance.x, 0.039 * feeder.length / 1000);
  const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 60 });
  assert.equal(result.converged, true, JSON.stringify(result.warnings));
  const totalKw = input.equipment.reduce((sum, load) => sum + load.kw, 0);
  const totalKvar = input.equipment.reduce((sum, load) => sum + load.kw * Math.tan(Math.acos(load.powerFactor)), 0);
  near(result.summary.totalLoadKW, totalKw);
  near(result.summary.totalLoadKVAR, totalKvar);
  assert.ok(result.losses.P > 0.1, 'Real cable resistance must not become a lossless network');
  assert.ok(Math.min(...result.buses.map(bus => bus.Vm)) < 0.999, 'Loaded cable paths must retain voltage drop');
  near(result.summary.totalGenKW, totalKw + result.losses.P, 0.005);
  assert.deepEqual(new Set(result.lines.map(line => line.id)), new Set(proposal.cables.map(cable => cable.id)));
  for (const line of result.lines) {
    assert.equal(line.rating, proposal.cables.find(cable => cable.id === line.id).ampacityA);
  }
});

test('sourced cable handoff agrees with an independently solved two-bus constant-power circuit', () => {
  const voltage = 480, kw = 10, powerFactor = 0.9, length = 150;
  const oneLine = buildDesignSynthesisOneLine({
    supply: { id: 'S', voltage, phases: 3, x: 0, y: 0, z: 0 },
    loads: [{ id: 'L', tag: 'L', voltage, phases: 3, kw, powerFactor, x: 150, y: 0, z: 0 }],
    cables: [{ id: 'C', tag: 'C', from: 'S', to: 'L', length, conductor_size: '#8 AWG' }],
  });
  const model = buildLoadFlowModel(oneLine);
  assert.equal(model.branches.length, 1);
  const r = 0.810 * length / 1000, x = 0.052 * length / 1000;
  near(model.branches[0].impedance.r, r);
  near(model.branches[0].impedance.x, x);
  const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 60 });
  assert.equal(result.converged, true);
  // Per-phase power balance: w² + (2(RP+XQ)-Vs²)w + |Z|²|S|² = 0,
  // where w is squared receiving phase voltage. Choose the high-voltage root.
  const p = kw * 1000 / 3, q = p * Math.tan(Math.acos(powerFactor));
  const a = voltage ** 2 / 3 - 2 * (r * p + x * q);
  const b = (r ** 2 + x ** 2) * (p ** 2 + q ** 2);
  const w = (a + Math.sqrt(a ** 2 - 4 * b)) / 2;
  const expectedVm = Math.sqrt(3 * w) / voltage;
  const expectedCurrent = Math.hypot(p, q) / Math.sqrt(w);
  const expectedLossKw = 3 * expectedCurrent ** 2 * r / 1000;
  near(result.buses.find(bus => bus.id === 'L').Vm, expectedVm, 1e-8);
  near(result.losses.P, expectedLossKw, 1e-7);
  near(result.lines.find(line => line.from === 'S').amps, expectedCurrent, 1e-5);
});
