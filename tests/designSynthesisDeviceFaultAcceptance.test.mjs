import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisFaultStudy } from '../analysis/designSynthesisFaultStudy.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from '../analysis/designSynthesisDeviceFaultScreen.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { sourcedCableImpedance } from '../analysis/designSynthesisCableCatalog.mjs';
import { solvePositiveSequenceBoltedFault } from '../analysis/faultNetwork.mjs';
import { listTransformerProfiles } from '../analysis/designSynthesisTransformers.mjs';
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';
import { buildSynthesisDeviceVoltageApplicability } from '../analysis/designSynthesisVoltageApplicability.mjs';

const complex = (re, im = 0) => ({ re, im });
const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 2e-8 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
const device = generateDesignProposal(sample).cables.find(row => row.protectiveDevice)?.protectiveDevice;
assert.ok(device);

function fixture() {
  const supply = { id: 'A', tag: 'A', type: 'source', voltage: 480, phases: 3, availableFaultCurrentKA: 20 };
  const panel = { id: 'B', tag: 'B', type: 'panel', voltage: 480, phases: 3 };
  const loads = ['C', 'D'].map(id => ({ id, tag: id, type: 'load', voltage: 480, phases: 3, motor: { ratedVoltageV: 460 } }));
  const cables = [['AB', 'A', 'B', 50], ['BC', 'B', 'C', 120], ['BD', 'B', 'D', 70]].map(([id, from, to, lengthFt]) => {
    const z = sourcedCableImpedance('#8 AWG', lengthFt);
    return { id, tag: id, from, to, lengthFt, conductor_size: '#8 AWG', r_ohm_per_kft: z.r_ohm_per_kft, x_ohm_per_kft: z.x_ohm_per_kft, impedanceBasis: z.source, protectiveDevice: structuredClone(device) };
  });
  const proposal = { inputs: { original: { supply } }, equipment: [supply, panel, ...loads], loads, cables, oneLine: buildDesignSynthesisOneLine({ supply, panels: [panel], loads, cables }) };
  proposal.faultStudy = {
    networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Synthetic two-motor placement oracle' },
    sources: [
      { equipmentId: 'A', emfPhaseV: complex(480 / Math.sqrt(3)), impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent' },
      { equipmentId: 'C', emfPhaseV: complex(460 / Math.sqrt(3)), impedance: { rOhm: 0.2, xOhm: 0.5 }, inService: true, reference: 'Explicit synthetic motor C equivalent' },
      { equipmentId: 'D', emfPhaseV: complex(460 / Math.sqrt(3) * Math.cos(0.2), 460 / Math.sqrt(3) * Math.sin(0.2)), impedance: { rOhm: 0.1, xOhm: 0.3 }, inService: true, reference: 'Explicit synthetic phase-displaced motor D equivalent' },
    ],
  };
  proposal.faultStudyValidation = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: proposal.faultStudy });
  assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
  return proposal;
}

// This oracle places separate ideal breaker branches in the electrical network.
// It does not implement the screen's KCL transformation or read its case currents.
function explicitBreakerNetwork(proposal) {
  const buses = proposal.equipment.filter(row => row.type !== 'transformer').map(row => ({ id: row.id, voltageLLV: row.voltage }));
  const voltageById = new Map(buses.map(row => [row.id, row.voltageLLV]));
  const branches = [];
  const tx = proposal.equipment.find(row => row.type === 'transformer');
  if (tx) {
    const zBase = tx.primaryVoltageVac ** 2 / (tx.ratedKVA * 1000);
    const angle = proposal.faultStudy.transformerPhase.degrees * Math.PI / 180;
    branches.push({ id: tx.id, fromBusId: tx.primaryBusId, toBusId: tx.secondaryBusId, impedance: { rOhm: tx.seriesModel.rPercent / 100 * zBase, xOhm: tx.seriesModel.xPercent / 100 * zBase, referenceBusId: tx.primaryBusId }, tapPu: complex(Math.cos(angle), Math.sin(angle)) });
    buses.push({ id: 'AFTER:MAIN', voltageLLV: 208 });
    branches.push({ id: 'BREAKER:MAIN', fromBusId: tx.secondaryBusId, toBusId: 'AFTER:MAIN', impedance: { rOhm: 0, xOhm: 0, referenceBusId: tx.secondaryBusId }, tapPu: complex(1) });
  }
  for (const cable of proposal.cables) {
    const virtualBus = `AFTER:${cable.id}`;
    buses.push({ id: virtualBus, voltageLLV: voltageById.get(cable.from) });
    const breakerFrom = cable.from === tx?.secondaryBusId ? 'AFTER:MAIN' : cable.from;
    branches.push({ id: `BREAKER:${cable.id}`, fromBusId: breakerFrom, toBusId: virtualBus, impedance: { rOhm: 0, xOhm: 0, referenceBusId: breakerFrom }, tapPu: complex(1) });
    const z = sourcedCableImpedance(cable.conductor_size, cable.lengthFt);
    branches.push({ id: cable.id, fromBusId: virtualBus, toBusId: cable.to, impedance: { rOhm: z.r, xOhm: z.x, referenceBusId: virtualBus }, tapPu: complex(1) });
  }
  return {
    networkBaseMVA: 1, buses, branches,
    sourceInventory: proposal.faultStudy.sourceInventory,
    sources: proposal.faultStudy.sources.map(({ equipmentId, ...source }) => ({ id: equipmentId, busId: equipmentId, ...source })),
  };
}

test('source-end device currents match an explicitly augmented zero-impedance breaker network on both sides', context => {
  const proposal = fixture();
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(screen.status, 'evaluated', JSON.stringify(screen.issues));
  const network = explicitBreakerNetwork(proposal);
  const faults = new Map(network.buses.map(bus => {
    const result = solvePositiveSequenceBoltedFault({ ...network, fault: { busId: bus.id, type: 'three-phase-bolted' } });
    assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
    return [bus.id, result];
  }));
  for (const placement of screen.placements) {
    const cableId = placement.proposedLocation.branchId;
    for (const row of placement.cases) {
      const faultId = row.kind === 'immediate-load-side-zero-impedance-fault' ? `AFTER:${cableId}` : row.faultBusId;
      const original = faults.get(faultId).zeroImpedanceTieCurrents.find(item => item.branchId === `BREAKER:${cableId}`).fromCurrentIntoBranchKA;
      close(row.throughDeviceCurrentKA.re, original.re);
      close(row.throughDeviceCurrentKA.im, original.im);
      close(row.throughDeviceCurrentRmsKA, original.magnitude);
    }
    const explicitMaximum = Math.max(...[...faults.values()].map(row => row.zeroImpedanceTieCurrents.find(item => item.branchId === `BREAKER:${cableId}`).fromCurrentIntoBranchKA.magnitude));
    close(placement.comparisons.maximumThroughDeviceInitialRms.valueKA, explicitMaximum);
    assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
  }
  const first = screen.placements.find(row => row.proposedLocation.branchId === 'AB');
  const upstream = first.cases.find(row => row.kind === 'generated-bus-fault' && row.faultBusId === 'A');
  const downstream = first.cases.find(row => row.kind === 'immediate-load-side-zero-impedance-fault');
  assert.ok(downstream.throughDeviceCurrentRmsKA > upstream.throughDeviceCurrentRmsKA * 10);
  assert.notEqual(downstream.throughDeviceCurrentRmsKA, downstream.faultCurrentRmsKA, 'Motor backfeed into the load-side fault bypasses this breaker');
  context.diagnostic(JSON.stringify({ placement: first.id, upstreamFaultThroughKA: upstream.throughDeviceCurrentRmsKA, loadSideFaultThroughKA: downstream.throughDeviceCurrentRmsKA, availableLineTerminalKA: first.comparisons.lineTerminalAvailableInitialRms.valueKA, maximumModeledThroughKA: first.comparisons.maximumThroughDeviceInitialRms.valueKA }));
});

test('partial fault coverage cannot claim any device comparison is not exceeded', () => {
  const proposal = fixture();
  proposal.faultStudy.faultBusIds = ['A'];
  proposal.faultStudyValidation = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: proposal.faultStudy });
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(screen.status, 'blocked');
  assert.ok(screen.issues.some(row => /COVERAGE/.test(row.code)));
  assert.ok(screen.placements.every(row => row.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared'));
});

test('mutated cached case currents cannot pass the original network fingerprint', () => {
  const proposal = fixture();
  proposal.faultStudyValidation.cases[0].branchTerminalCurrents[0].fromCurrentIntoBranchKA = { re: 0, im: 0, magnitude: 0 };
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  // Recalculation is also acceptable: a stale supplied result must never be used.
  if (screen.status === 'evaluated') {
    const fresh = evaluateDesignSynthesisDeviceFaultScreen({ proposal: fixture() });
    assert.deepEqual(screen.placements, fresh.placements);
  } else {
    assert.ok(screen.issues.some(row => /STALE|MISMATCH|TAMPER/.test(row.code)), JSON.stringify(screen.issues));
    assert.ok(screen.placements.every(row => row.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared'));
  }
});

test('device evidence changes participate in device-screen identity and conditional SCCR cannot fill a missing standalone rating', () => {
  const proposal = fixture();
  const first = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  proposal.cables[0].protectiveDevice.interruptingRatingKA = 0.1;
  const changed = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.notEqual(changed.deviceInputFingerprint, first.deviceInputFingerprint, 'Device rating changes require a new device-screen identity');
  assert.equal(changed.status, 'blocked');
  assert.ok(changed.issues.some(row => /EXCEEDED/.test(row.code)));
  const deviceRecord = proposal.cables[0].protectiveDevice;
  delete deviceRecord.interruptingRatingKA;
  deviceRecord.conditionalCombination = { conditionalShortCircuitCurrentKA: 65, voltageVac: 480 };
  const missing = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(missing.status, 'blocked');
  const placement = missing.placements.find(row => row.proposedLocation.branchId === 'AB');
  assert.equal(placement.comparisons.maximumThroughDeviceInitialRms.status, 'not-compared');
  assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
});

function mixedFixture() {
  const proposal = fixture();
  const supply = proposal.equipment[0];
  const panel = proposal.equipment[1];
  panel.voltage = 208;
  proposal.loads.forEach(load => { load.voltage = 208; load.motor.ratedVoltageV = 208; });
  const primary = { id: 'PRI', tag: 'PRI', type: 'bus', voltage: 480, phases: 3 };
  const secondary = { id: 'SEC', tag: 'SEC', type: 'bus', voltage: 208, phases: 3 };
  const tx = { ...listTransformerProfiles().find(row => row.ratedKVA === 75), id: 'TX-1', tag: 'TX-1', type: 'transformer', primaryBusId: primary.id, secondaryBusId: secondary.id, primaryProtectionLocation: 'source-end-of-transformer-primary-feeder', secondaryMainLocation: 'transformer-secondary-terminals' };
  const records = JSON.parse(fs.readFileSync(new URL('../data/designSynthesisDevices.json', import.meta.url), 'utf8')).records;
  const lowerDevice = selectProtectiveDevice({ supply: { ...supply, voltage: 208 }, cable: { currentA: 10, ampacityA: 400, phases: 3 }, devices: records, deviceVoltageApplicabilityById: buildSynthesisDeviceVoltageApplicability(records) }).selected;
  assert.ok(lowerDevice);
  const feeder = proposal.cables[0];
  feeder.from = secondary.id;
  feeder.protectiveDevice = structuredClone(lowerDevice);
  proposal.cables.slice(1).forEach(row => { row.protectiveDevice = structuredClone(lowerDevice); });
  const primaryCable = { ...structuredClone(feeder), id: 'F-TX-1-PRI', from: supply.id, to: primary.id, protectiveDevice: structuredClone(device) };
  proposal.cables.unshift(primaryCable);
  tx.primaryProtectiveDevice = structuredClone(primaryCable.protectiveDevice);
  tx.secondaryMainDevice = structuredClone(lowerDevice);
  proposal.equipment = [supply, primary, secondary, tx, panel, ...proposal.loads];
  proposal.transformer = structuredClone(tx);
  proposal.oneLine = buildDesignSynthesisOneLine({ supply, panels: [panel], loads: proposal.loads, cables: proposal.cables, transformers: [tx], terminalBuses: [primary, secondary] });
  proposal.faultStudy.sources.slice(1).forEach(row => { row.emfPhaseV.re *= 208 / 460; row.emfPhaseV.im *= 208 / 460; });
  proposal.faultStudy.transformerPhase = { degrees: 30, reference: 'Explicit synthetic 30-degree phase displacement' };
  proposal.faultStudyValidation = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: proposal.faultStudy });
  assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
  return proposal;
}

test('mixed-voltage aggregate main and primary aliases match explicit placed breakers with a complex transformer tap', context => {
  const proposal = mixedFixture();
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(screen.status, 'evaluated', JSON.stringify(screen.issues));
  assert.equal(screen.placements.length, proposal.cables.length + 1);
  assert.equal(screen.placements.filter(row => row.aliases.length).length, 1, 'The primary alias is one physical proposed placement');
  const network = explicitBreakerNetwork(proposal);
  const faults = new Map(network.buses.map(bus => {
    const solved = solvePositiveSequenceBoltedFault({ ...network, fault: { busId: bus.id, type: 'three-phase-bolted' } });
    assert.equal(solved.status, 'evaluated', JSON.stringify(solved.issues));
    return [bus.id, solved];
  }));
  for (const placement of screen.placements) {
    const main = placement.kind === 'aggregate-secondary-main';
    const suffix = main ? 'MAIN' : placement.proposedLocation.branchId;
    for (const row of placement.cases) {
      const faultId = row.kind === 'immediate-load-side-zero-impedance-fault' ? `AFTER:${suffix}` : row.faultBusId;
      const actual = faults.get(faultId).zeroImpedanceTieCurrents.find(branch => branch.branchId === `BREAKER:${suffix}`).fromCurrentIntoBranchKA;
      close(row.throughDeviceCurrentKA.re, actual.re);
      close(row.throughDeviceCurrentKA.im, actual.im);
      close(row.throughDeviceCurrentRmsKA, actual.magnitude);
    }
    close(placement.comparisons.maximumThroughDeviceInitialRms.valueKA, Math.max(...[...faults.values()].map(row => row.zeroImpedanceTieCurrents.find(branch => branch.branchId === `BREAKER:${suffix}`).fromCurrentIntoBranchKA.magnitude)));
    assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
  }
  const main = screen.placements.find(row => row.kind === 'aggregate-secondary-main');
  const upstream = main.cases.find(row => row.kind === 'generated-bus-fault' && row.faultBusId === 'SEC');
  const downstream = main.cases.find(row => row.kind === 'immediate-load-side-zero-impedance-fault');
  assert.notEqual(upstream.throughDeviceCurrentRmsKA, downstream.throughDeviceCurrentRmsKA);
  context.diagnostic(JSON.stringify({ placement: main.id, voltageLLV: main.proposedLocation.nominalVoltageLLV, phaseDegrees: proposal.faultStudy.transformerPhase.degrees, upstreamFaultThroughKA: upstream.throughDeviceCurrentRmsKA, loadSideFaultThroughKA: downstream.throughDeviceCurrentRmsKA, availableLineTerminalKA: main.comparisons.lineTerminalAvailableInitialRms.valueKA, maximumModeledThroughKA: main.comparisons.maximumThroughDeviceInitialRms.valueKA }));
});

test('an incomplete secondary cut and a changed primary protection alias cannot claim evaluated device duty', () => {
  const proposal = mixedFixture();
  proposal.equipment.find(row => row.type === 'transformer').primaryProtectiveDevice.interruptingRatingKA = 0.1;
  const mismatch = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(mismatch.status, 'blocked');
  assert.ok(mismatch.issues.some(row => /ALIAS/.test(row.code)));
  assert.ok(mismatch.placements.every(row => row.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared'));
  const ambiguous = mixedFixture();
  ambiguous.equipment.find(row => row.type === 'transformer').secondaryMainLocation = 'unspecified';
  const blocked = evaluateDesignSynthesisDeviceFaultScreen({ proposal: ambiguous });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.issues.some(row => /SECONDARY/.test(row.code)));
});
