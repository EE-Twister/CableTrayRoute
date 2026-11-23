import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';

const cable = { phases: 3, operating_voltage: 480, currentA: 80, ampacityA: 100, protectiveRequirement: { ampereRatingA: 80 } };
const device = { id: 'DEV-100', catalogNumber: 'CAT-100', libraryStatus: 'screening', poles: [3], frequencyHz: [60], ratedVoltageVac: 600, continuousCurrentA: 100, sourceDocuments: ['manufacturer-catalog'], interruptingRatings: [{ voltageVac: 480, currentKA: 25, currentType: 'AC', frequencyHz: 60 }] };

test('selects exact screening device with adequate interrupting rating', () => {
  const result = selectProtectiveDevice({ cable, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, devices: [device] });
  assert.equal(result.selected.catalogNumber, 'CAT-100');
  assert.equal(result.selected.selectionStatus, 'candidate');
});

test('rejects wrong pole, voltage, frequency, current, and interrupting records', () => {
  const wrong = { ...device, poles: 2, ratedVoltageVac: 600, frequencyHz: 50, continuousCurrentA: 70, interruptingRatings: [{ voltageVac: 480, currentKA: 10, currentType: 'DC', frequencyHz: 50 }] };
  const result = selectProtectiveDevice({ cable, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, devices: [wrong] });
  assert.equal(result.selected, null);
  assert.equal(result.issues[0].code, 'NO_APPLICABLE_PROTECTIVE_DEVICE');
});

test('missing fault current blocks selection without defaulting', () => {
  const result = selectProtectiveDevice({ cable, supply: { voltage: 480, phases: 3 }, devices: [device] });
  assert.equal(result.selected, null);
  assert.equal(result.issues[0].code, 'MISSING_FAULT_CURRENT');
});

test('local circuit protection basis overrides cable and supply voltage/current duty', () => {
  const secondaryCable = { ...cable, operating_voltage: 480, currentA: 1, ampacityA: 200 };
  const result = selectProtectiveDevice({
    cable: secondaryCable,
    supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 1 },
    basis: { operatingVoltageVac: 480, phases: 3, frequencyHz: 60, requiredCurrentA: 80, conductorAmpacityA: 100, availableFaultCurrentKA: 20, faultBasis: 'transformer-secondary-3phase-screen', provenance: { source: 'local-test-basis' } },
    devices: [device]
  });
  assert.equal(result.selected.interruptingRatingKA, 25);
  assert.equal(result.selected.faultBasis, 'transformer-secondary-3phase-screen');
  assert.deepEqual(result.selected.protectionBoundary, { source: 'local-test-basis' });
});

test('higher-voltage interrupting row requires explicit straight-voltage evidence and retains both voltages', () => {
  const lowVoltageCable = { ...cable, operating_voltage: 208, ampacityA: 100 };
  const at240 = { ...device, interruptingRatings: [{ voltageVac: 240, currentKA: 25, currentType: 'AC', frequencyHz: 60 }] };
  assert.equal(selectProtectiveDevice({ cable: lowVoltageCable, supply: { voltage: 208, phases: 3, availableFaultCurrentKA: 20 }, devices: [at240] }).selected, null);
  const evidence = { ratingKind: 'straight', sourceDocuments: ['manufacturer-rating-document'], basis: 'Manufacturer straight-voltage rating table and applicability evidence.' };
  const result = selectProtectiveDevice({ cable: lowVoltageCable, supply: { voltage: 208, phases: 3, availableFaultCurrentKA: 20 }, devices: [at240], deviceVoltageApplicabilityById: { [at240.id]: evidence } });
  assert.equal(result.selected.evaluatedVoltageVac, 208);
  assert.equal(result.selected.interruptingRatingVoltageVac, 240);
  assert.equal(result.selected.voltageApplicability, 'manufacturer-documented-straight-voltage-rating-used-at-lower-system-voltage');
  assert.deepEqual(result.selected.voltageApplicabilitySourceDocuments, evidence.sourceDocuments);
});

test('rejects malformed local basis scalars instead of coercing booleans or arrays', () => {
  for (const requiredCurrentA of [true, [80]]) {
    const result = selectProtectiveDevice({ cable, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, basis: { requiredCurrentA, operatingVoltageVac: 480, phases: 3, frequencyHz: 60, conductorAmpacityA: 100 }, devices: [device] });
    assert.equal(result.selected, null);
    assert.equal(result.issues[0].code, 'INVALID_LOCAL_PROTECTION_BASIS');
  }
  const explicitNull = selectProtectiveDevice({ cable, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, basis: { availableFaultCurrentKA: null, requiredCurrentA: 80, operatingVoltageVac: 480, phases: 3, frequencyHz: 60, conductorAmpacityA: 100 }, devices: [device] });
  assert.equal(explicitNull.selected, null);
  assert.equal(explicitNull.issues[0].code, 'MISSING_FAULT_CURRENT');
});

test('enforces a local maximum protection rating while choosing eligible devices', () => {
  const smaller = { ...device, id: 'DEV-80', catalogNumber: 'CAT-80', continuousCurrentA: 80 };
  const result = selectProtectiveDevice({ cable: { ...cable, ampacityA: 120 }, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, basis: { requiredCurrentA: 70, conductorAmpacityA: 120, maximumRatingA: 90, operatingVoltageVac: 480, phases: 3, frequencyHz: 60 }, devices: [device, smaller] });
  assert.equal(result.selected.id, 'DEV-80');
  const noFit = selectProtectiveDevice({ cable: { ...cable, ampacityA: 120 }, supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 }, basis: { requiredCurrentA: 70, conductorAmpacityA: 120, maximumRatingA: 70, operatingVoltageVac: 480, phases: 3, frequencyHz: 60 }, devices: [device, smaller] });
  assert.equal(noFit.selected, null);
});
