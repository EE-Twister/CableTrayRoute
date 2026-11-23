import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

function fixture({ motorTorqueNm = 60, loadTorqueNm = 10 } = {}) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.equipment = [{ ...input.equipment[0], id: 'M-ACC', tag: 'M-ACC', kw: 8, voltage: 480, powerFactor: 0.86, duty: 'continuous', x: 180, y: 0,
    ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design current for revision acceptance.' },
      nameplateCurrentA: 12.8, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3,
      starterType: 'dol', rotorType: 'squirrel-cage',
      acceleration: {
        reference: 'Synthetic independent mechanics fixture.', motorInertiaKgM2: 0.4, motorInertiaReference: 'Synthetic shaft inertia.',
        loadInertiaKgM2: 0.6, loadInertiaReference: 'Synthetic load inertia referred to motor shaft.', targetSpeedRpm: 1000,
        performanceCurve: { reference: 'Supplied synthetic speed-varying electrical and torque data.', points: [
          { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: motorTorqueNm },
          { speedRpm: 500, currentA: 80, powerFactor: 0.4, torqueNm: motorTorqueNm },
          { speedRpm: 1000, currentA: 70, powerFactor: 0.5, torqueNm: motorTorqueNm },
        ] },
        loadTorqueCurve: { reference: 'Synthetic constant load torque.', points: [
          { speedRpm: 0, torqueNm: loadTorqueNm }, { speedRpm: 1000, torqueNm: loadTorqueNm },
        ] },
      },
    } }];
  input.supply = { ...input.supply, capacityKva: 10000, motorStartingImpedance: { rOhm: 0.08, xOhm: 0.16, reference: 'Synthetic source impedance for revision behavior testing.' } };
  input.corridors = { nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'N1', x: 170, y: 0, z: 0 }],
    edges: [{ id: 'E01', from: 'N0', to: 'N1', widthIn: 48, depthIn: 6 }] };
  input.criteria.maxLoadsPerPanel = 1;
  input.criteria.maxEndpointAttachmentFt = 90;
  input.criteria.motorStarting = { minimumVoltagePu: 0.1 };
  input.criteria.loadFlow = { maxRevisions: 6 };
  input.overrides = { panelLocations: { 'DP-01': { x: 0, y: 0, z: 0 } } };
  return input;
}

test('a supplied acceleration duration failure upsizes its sourced path and passes without changing the limit', () => {
  const referenceInput = fixture();
  referenceInput.criteria.motorAcceleration = { maximumTimeS: 1e6 };
  const reference = generateDesignProposal(referenceInput);
  assert.equal(reference.motorAccelerationValidation.status, 'evaluated', JSON.stringify({ status: reference.status, issues: reference.issues, acceleration: reference.motorAccelerationValidation }));
  const firstTime = reference.motorAccelerationValidation.cases[0].timeS;
  assert.ok(Number.isFinite(firstTime) && firstTime > 0);

  const input = fixture();
  input.criteria.motorAcceleration = { maximumTimeS: firstTime * 0.995 };
  const snapshot = structuredClone(input);
  const revised = generateDesignProposal(input);
  assert.deepEqual(input, snapshot);
  assert.equal(revised.motorStartingValidation.status, 'pass');
  assert.equal(revised.motorAccelerationValidation.criteria.maximumTimeS, firstTime * 0.995);
  assert.equal(revised.motorAccelerationValidation.cases[0].criterionStatus, 'pass', JSON.stringify(revised.motorAccelerationValidation.revision));
  assert.equal(revised.motorAccelerationValidation.revision.status, 'complete');
  assert.ok(revised.motorAccelerationValidation.revision.history.length > 1);
  assert.ok(revised.motorAccelerationValidation.revision.history.slice(1).some(row => row.changedCircuits.some(circuit => circuit.id === 'C-M-ACC')));
});

test('zero shared revision budget preserves the failed numeric result and records the actual stop reason', () => {
  const input = fixture();
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  input.criteria.loadFlow.maxRevisions = 0;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorAccelerationValidation.cases[0].criterionStatus, 'fail');
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'stopped');
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'revision-budget-exhausted');
  assert.equal(proposal.motorAccelerationValidation.revision.history.length, 1);
});

test('a low-speed torque deficit can recover when the motor path voltage improves', () => {
  const input = fixture({ motorTorqueNm: 10.5, loadTorqueNm: 10 });
  input.criteria.motorAcceleration = {};
  const proposal = generateDesignProposal(input);
  assert.ok(proposal.motorAccelerationValidation.revision.history.some(row => row.accelerationCases.some(item => item.torqueStatus === 'fail')),
    JSON.stringify(proposal.motorAccelerationValidation.revision.history));
  assert.equal(proposal.motorAccelerationValidation.cases[0].status, 'evaluated', JSON.stringify(proposal.motorAccelerationValidation.revision));
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'complete');
  assert.ok(proposal.motorAccelerationValidation.revision.history.slice(1).some(row => row.changedCircuits.length));
});

test('operating-load-flow revisions consume the same absolute budget used by acceleration', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.996, maxRevisions: 1 };
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.studyValidation.status, 'pass', JSON.stringify(proposal.studyValidation.history));
  assert.ok(proposal.studyValidation.history.some(row => row.revision === 1), JSON.stringify(proposal.studyValidation.history));
  assert.equal(proposal.motorAccelerationValidation.revision.history.length, 1);
  assert.equal(proposal.motorAccelerationValidation.revision.history[0].revision, 1);
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'revision-budget-exhausted');
});

test('a passing acceleration number cannot mark the combined revision complete when operating load flow fails', () => {
  const input = fixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.9999, maxRevisions: 0 };
  input.criteria.motorAcceleration = { maximumTimeS: 1e6 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorAccelerationValidation.cases[0].criterionStatus, 'pass');
  assert.equal(proposal.studyValidation.status, 'fail');
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'stopped');
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'operating-load-flow-failed');
  assert.equal(proposal.motorAccelerationValidation.revision.history[0].status, 'fail');
});

test('a passing acceleration number cannot complete the combined revision when starting voltage fails', () => {
  const input = fixture();
  input.criteria.motorStarting = { minimumVoltagePu: 0.95 };
  input.criteria.motorAcceleration = { maximumTimeS: 1e6 };
  input.criteria.loadFlow.maxRevisions = 0;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorStartingValidation.status, 'fail');
  assert.equal(proposal.motorAccelerationValidation.cases[0].criterionStatus, 'pass');
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'stopped');
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'revision-budget-exhausted');
  assert.equal(proposal.motorAccelerationValidation.revision.history[0].status, 'fail');
});

test('malformed supplied curve blocks without attempting a conductor revision', () => {
  const input = fixture();
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  input.equipment[0].motor.acceleration.performanceCurve.points[1].powerFactor = null;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorAccelerationValidation.status, 'blocked');
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'stopped');
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'acceleration-study-blocked');
  assert.equal(proposal.motorAccelerationValidation.revision.history.length, 0, 'Malformed input is rejected before any finalized motor network or revision attempt exists.');
});

test('blocked requested acceleration halts even when starting voltage could otherwise trigger retries', () => {
  const input = fixture();
  input.criteria.motorStarting = { minimumVoltagePu: 0.95 };
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  // Keep the supplied curve syntactically finite, but large enough that its
  // squared-current quantities exceed Float64 range and block numeric network
  // evaluation. Locked-rotor inputs remain independent for starting voltage.
  input.equipment[0].motor.acceleration.performanceCurve.points[1].currentA = 1e160;
  input.equipment[0].motor.acceleration.performanceCurve.points[1].powerFactor = 0.99;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorStartingValidation.status, 'fail');
  assert.equal(proposal.motorAccelerationValidation.status, 'blocked');
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'stopped');
  assert.equal(proposal.motorAccelerationValidation.revision.stopReason, 'acceleration-study-blocked');
  assert.equal(proposal.motorAccelerationValidation.revision.history.length, 1);
  assert.deepEqual(proposal.motorAccelerationValidation.revision.history[0].changedCircuits, []);
});

test('a regeneration rejected by route capacity cannot inherit the earlier passing study or acceleration result', () => {
  const input = fixture();
  input.criteria.motorAcceleration = { maximumTimeS: 1e-10 };
  input.criteria.endpointInstallation = { method: 'dedicated-emt', minimumTradeSize: '1/2', maximumTradeSize: '2' };
  input.criteria.loadFlow.maxRevisions = 12;
  const proposal = generateDesignProposal(input);
  if (proposal.motorAccelerationValidation.revision.stopReason !== 'regenerated-design-blocked') {
    assert.fail(`Fixture did not reach blocked regeneration: ${JSON.stringify({ revision: proposal.motorAccelerationValidation.revision, sizes: proposal.cables.map(row => [row.id, row.conductor_size]), issues: proposal.issues })}`);
  }
  assert.equal(proposal.studyValidation.status, 'blocked');
  assert.equal(proposal.motorAccelerationValidation.status, 'blocked');
  assert.ok(proposal.motorAccelerationValidation.cases.every(item => item.timeS === null));
  assert.equal(proposal.motorAccelerationValidation.revision.history.at(-1).operatingStatus, 'not-evaluated');
});

test('unrelated circuits are absent from the acceleration revision path evidence', () => {
  const input = fixture();
  input.equipment.push({ ...JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8')).equipment[1],
    id: 'U-1', tag: 'U-1', kw: 4, duty: 'continuous', x: 180, y: 60 });
  input.corridors.nodes.push({ id: 'N2', x: 170, y: 60, z: 0 });
  input.corridors.edges.push({ id: 'E12', from: 'N1', to: 'N2', widthIn: 48, depthIn: 6 });
  input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 170, y: 60, z: 0 } };
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  const proposal = generateDesignProposal(input);
  const revisedCircuits = proposal.motorAccelerationValidation.revision.history.flatMap(row => row.changedCircuits.map(item => item.id));
  assert.ok(revisedCircuits.every(id => id === 'C-M-ACC' || id === 'F-DP-01'), JSON.stringify(revisedCircuits));
  assert.ok(proposal.cables.find(row => row.id === 'C-U-1')?.conductor_size);
  assert.ok(!revisedCircuits.includes('C-U-1'));
  assert.ok(proposal.motorAccelerationValidation.revision.history.some(row => row.status === 'fail'));
});

test('a direct 480 V motor failure does not consume an unrelated 208 V transformer candidate', () => {
  const input = fixture();
  input.equipment.push({ ...JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8')).equipment[1],
    id: 'U-208', tag: 'U-208', kw: 4, voltage: 208, phases: 3, powerFactor: 0.9, duty: 'continuous', x: 180, y: 60 });
  input.corridors.nodes.push({ id: 'N2', x: 170, y: 60, z: 0 });
  input.corridors.edges.push({ id: 'E12', from: 'N1', to: 'N2', widthIn: 48, depthIn: 6 });
  input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 170, y: 60, z: 0 } };
  input.criteria.motorAcceleration = { maximumTimeS: 1e-8 };
  input.criteria.loadFlow.maxRevisions = 1;
  const proposal = generateDesignProposal(input);
  assert.ok(proposal.transformer);
  assert.ok(proposal.motorAccelerationValidation.revision.history.length > 1, JSON.stringify(proposal.issues));
  assert.ok(proposal.motorAccelerationValidation.revision.history.every(row => row.transformerProfileId === proposal.transformer.profileId));
  assert.ok(proposal.motorAccelerationValidation.revision.history.slice(1).every(row => row.reason !== 'tested next eligible sourced transformer profile against the unchanged project study criteria'));
});
