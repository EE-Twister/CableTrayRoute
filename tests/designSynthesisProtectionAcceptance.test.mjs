import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const library = read('data/protectiveDevices.json');
const records = Array.isArray(library) ? library : library.devices;

test('every circuit selects a traceable governed device within its conductor and duty bounds', () => {
  const input = read('samples/design-synthesis-industrial.json');
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.ok(proposal.cables.length > 30);
  for (const cable of proposal.cables) {
    const selected = cable.protectiveDevice;
    assert.ok(selected, `${cable.tag} must have a device candidate`);
    const original = records.find(record => record.id === selected.id);
    assert.ok(original, 'Candidate must identify a real governed library record');
    assert.deepEqual(selected.sourceDocuments, original.sourceDocuments);
    assert.deepEqual(selected.fieldSources, original.fieldSources);
    assert.equal(selected.catalogNumber, original.catalogNumber);
    assert.equal(selected.libraryStatus, 'screening');
    assert.equal(selected.selectionStatus, 'candidate');
    const rating = selected.tripRatingA ?? selected.continuousCurrentA;
    assert.ok(rating >= cable.protectiveRequirement.ampereRatingA);
    assert.ok(rating <= cable.ampacityA, `${cable.tag}: ${rating} A device exceeds ${cable.ampacityA} A installed conductor`);
    const applicable = original.interruptingRatings.filter(row => row.voltageVac === input.supply.voltage && row.currentType === 'AC' && row.poles === 3);
    assert.ok(applicable.some(row => row.currentKA >= input.supply.availableFaultCurrentKA));
  }
});

test('rating-level incompatibility cannot hide behind a compatible device-level rating', () => {
  const original = records.find(record => record.id === 'eaton_series_c_fd3020');
  const cable = { phases: 3, operating_voltage: 480, ampacityA: 50, protectiveRequirement: { ampereRatingA: 15 } };
  const supply = { phases: 3, voltage: 480, frequencyHz: 60, availableFaultCurrentKA: 20 };
  assert.ok(selectProtectiveDevice({ cable, supply, devices: [original] }).selected);
  for (const [field, value] of [['poles', 1], ['frequencyHz', 50], ['currentType', 'DC'], ['currentType', null]]) {
    const device = structuredClone(original);
    device.interruptingRatings.forEach(row => { row[field] = value; });
    assert.equal(selectProtectiveDevice({ cable, supply, devices: [device] }).selected, null, `Reject incompatible ${field}=${value}`);
  }
});

test('changing protective-device evidence invalidates the generation input signature', () => {
  const first = read('samples/design-synthesis-industrial.json');
  first.protectiveDevices = [records.find(record => record.id === 'eaton_series_c_fd3020')];
  const second = structuredClone(first);
  second.protectiveDevices[0].interruptingRatings[1].currentKA = 10;
  assert.notEqual(generateDesignProposal(first).inputSignature, generateDesignProposal(second).inputSignature);
});
