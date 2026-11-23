import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { evaluateDesignSynthesisFaultScenarios } from '../analysis/designSynthesisFaultScenarios.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} versus independently derived ${expected}`);
const source = { id: 'S', tag: 'S', type: 'source', voltage: 480, phases: 3, availableFaultCurrentKA: 20 };
const motor = { id: 'M', tag: 'M', type: 'load', voltage: 480, phases: 3, motor: { ratedVoltageV: 460 } };
const device = {
  id: 'SYNTHETIC-65', type: 'breaker', interruptingRatingKA: 65,
  interruptingRatingVoltageVac: 480, evaluatedVoltageVac: 480,
  sourceIds: ['SYNTHETIC-RATING'], sourceDocuments: ['SYNTHETIC-RATING'],
  fieldSources: [
    { pointer: '/candidate/branchCircuitBreaker/interruptingRatingKA', sourceId: 'SYNTHETIC-RATING' },
    { pointer: '/candidate/branchCircuitBreaker/ratedVoltageV', sourceId: 'SYNTHETIC-RATING' },
  ],
};

function fixture() {
  const supply = structuredClone(source);
  const load = structuredClone(motor);
  const cable = {
    id: 'SM', tag: 'SM', from: 'S', to: 'M', lengthFt: 1000,
    conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052,
    impedanceBasis: 'Southwire SPEC45301 rev1.000.008', protectiveDevice: structuredClone(device),
  };
  return {
    inputs: { original: { supply } }, equipment: [supply, load], loads: [load], cables: [cable],
    oneLine: buildDesignSynthesisOneLine({ supply, loads: [load], cables: [cable] }),
  };
}

function operatingCases() {
  const sources = [
    { equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic source impedance on 480 V base' },
    { equipmentId: 'M', emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.2, xOhm: 0.5 }, inService: false, reference: 'Synthetic motor impedance on 460 V rating' },
  ];
  return ['utility-only', 'motor-only'].map((id, index) => {
    const rows = structuredClone(sources);
    rows[0].inService = index === 0;
    rows[1].inService = index === 1;
    return {
      id, reference: `Synthetic switching condition ${id}; no installation claim`,
      study: { networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Synthetic two-source inventory' }, sources: rows },
    };
  });
}

test('different buses can have different limiting source conditions, matching independent series-circuit arithmetic', () => {
  const proposal = fixture();
  const input = operatingCases();
  const before = structuredClone({ proposal, input });
  const actual = evaluateDesignSynthesisFaultScenarios({ proposal, faultScenarios: input });
  assert.equal(actual.status, 'evaluated', JSON.stringify(actual.issues));
  const atS = actual.busEnvelopes.find(row => row.busId === 'S');
  const atM = actual.busEnvelopes.find(row => row.busId === 'M');
  // With one source open, each circuit is either its own source impedance or
  // that impedance plus the literal 1,000 ft cable R+jX. This oracle neither
  // invokes the network solver nor reads its contributions or branch currents.
  const utilityOwnKA = (480 / Math.sqrt(3)) / Math.hypot(0.006, 0.015) / 1000;
  const utilityRemoteKA = (480 / Math.sqrt(3)) / Math.hypot(0.006 + 0.810, 0.015 + 0.052) / 1000;
  const motorOwnKA = (460 / Math.sqrt(3)) / Math.hypot(0.2, 0.5) / 1000;
  const motorRemoteKA = (460 / Math.sqrt(3)) / Math.hypot(0.2 + 0.810, 0.5 + 0.052) / 1000;
  close(atS.maximum.valueKA, utilityOwnKA);
  close(atS.minimum.valueKA, motorRemoteKA);
  close(atM.maximum.valueKA, motorOwnKA);
  close(atM.minimum.valueKA, utilityRemoteKA);
  assert.equal(atS.maximum.scenarioId, 'utility-only');
  assert.equal(atM.maximum.scenarioId, 'motor-only');
  const placement = actual.deviceEnvelopes[0];
  close(placement.lineTerminalAvailableInitialRms.maximum.valueKA, utilityOwnKA);
  close(placement.maximumThroughDeviceInitialRms.maximum.valueKA, utilityOwnKA);
  assert.equal(placement.maximumThroughDeviceInitialRms.maximum.scenarioId, 'utility-only');
  assert.equal(placement.protectionStatus, 'not-evaluated');
  assert.equal(actual.coverage.verifiedAsExtrema, false);
  assert.deepEqual({ proposal, input }, before);
});

test('canonical source applicability changes invalidate scenario evidence even when currents remain equal', () => {
  const proposal = fixture();
  const initial = evaluateDesignSynthesisFaultScenarios({ proposal, faultScenarios: operatingCases() });
  const changed = structuredClone(proposal);
  changed.inputs.original.supply.availableFaultCurrentKA = 30;
  const later = evaluateDesignSynthesisFaultScenarios({ proposal: changed, faultScenarios: operatingCases() });
  assert.equal(later.status, 'evaluated', JSON.stringify(later.issues));
  assert.deepEqual(later.busEnvelopes, initial.busEnvelopes);
  assert.notEqual(later.modelInputFingerprint, initial.modelInputFingerprint);
});

test('25/50-load mixed-voltage envelopes use final route impedance and transformer referral in each supplied condition', () => {
  for (const count of [25, 50]) {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const originals = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({
      ...originals[index % originals.length], id: `ORACLE-${index}`, tag: `ORACLE-${index}`,
      voltage: index < count * 0.8 ? 208 : 480,
      kw: index < count * 0.8 ? 1 : 3, powerFactor: 0.9, phases: 3,
    }));
    input.faultScenarios = [1, 2].map(multiplier => ({
      id: `source-z-${multiplier}`, reference: `Explicit synthetic impedance multiplier ${multiplier}`,
      study: {
        networkBaseMVA: 1,
        sourceInventory: { status: 'complete', reference: 'Synthetic utility only; no rotating equipment in this fixture' },
        transformerPhase: { degrees: 0, reference: 'Explicit synthetic zero-phase assumption' },
        sources: [{ equipmentId: input.supply.id, emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006 * multiplier, xOhm: 0.015 * multiplier }, inService: true, reference: 'Synthetic phase ohms on the source bus base' }],
      },
    }));
    const result = generateDesignProposal(input);
    assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
    assert.equal(result.faultScenarioValidation.status, 'evaluated');
    const tx = result.transformer;
    assert.ok(tx);
    const equipment = new Map(result.equipment.map(row => [row.id, row]));
    const incoming = new Map(result.cables.map(row => [row.to, row]));
    for (const load of result.loads) {
      const faultV = load.voltage;
      const totals = [];
      for (const factor of [1, 2]) {
        let re = 0.006 * factor * (faultV / 480) ** 2;
        let im = 0.015 * factor * (faultV / 480) ** 2;
        let id = load.id;
        const visited = new Set();
        while (id !== input.supply.id) {
          assert.ok(!visited.has(id), 'Oracle requires the generated radial path');
          visited.add(id);
          if (id === tx.secondaryBusId) {
            const zBasePrimary = tx.primaryVoltageVac ** 2 / (tx.ratedKVA * 1000);
            const referral = (faultV / tx.primaryVoltageVac) ** 2;
            re += tx.seriesModel.rPercent / 100 * zBasePrimary * referral;
            im += tx.seriesModel.xPercent / 100 * zBasePrimary * referral;
            id = tx.primaryBusId;
          } else {
            const cable = incoming.get(id);
            assert.ok(cable, `Missing actual path cable to ${id}`);
            const nominal = equipment.get(cable.from).voltage;
            const referral = (faultV / nominal) ** 2;
            re += cable.r_ohm_per_kft * cable.lengthFt / 1000 * referral;
            im += cable.x_ohm_per_kft * cable.lengthFt / 1000 * referral;
            id = cable.from;
          }
        }
        totals.push((faultV / Math.sqrt(3)) / Math.hypot(re, im) / 1000);
      }
      const actual = result.faultScenarioValidation.busEnvelopes.find(row => row.busId === load.id);
      close(actual.maximum.valueKA, totals[0]);
      close(actual.minimum.valueKA, totals[1]);
      assert.equal(actual.maximum.scenarioId, 'source-z-1');
      assert.equal(actual.minimum.scenarioId, 'source-z-2');
    }
  }
});
