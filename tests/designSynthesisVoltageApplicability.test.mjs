import assert from 'node:assert/strict';
import test from 'node:test';
import bundledDeviceSnapshot from '../data/designSynthesisDevices.json' with { type: 'json' };
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';
import { buildSynthesisDeviceVoltageApplicability } from '../analysis/designSynthesisVoltageApplicability.mjs';

test('grants sourced straight-voltage applicability only to exact bundled Eaton electrical records', () => {
  const records = bundledDeviceSnapshot.records;
  const evidence = buildSynthesisDeviceVoltageApplicability(records);
  assert.equal(Object.keys(evidence).length, 8);
  for (const record of records) {
    assert.equal(evidence[record.id].ratingKind, 'straight');
    assert.ok(evidence[record.id].sourceDocuments.some(source => source.url.includes('/skuPage.')));
    const guide = evidence[record.id].sourceDocuments.find(source => source.id === 'eaton_enclosed_circuit_breaker_application_guide_2016');
    assert.equal(guide.printedPage, '27.3-7');
    assert.equal(guide.pdfIndex, 38);
  }
  const fd3020 = records.find(record => record.catalogNumber === 'FD3020');
  const result = selectProtectiveDevice({
    cable: { phases: 3, operating_voltage: 208, currentA: 20, ampacityA: 20, protectiveRequirement: { ampereRatingA: 20 } },
    supply: { voltage: 208, phases: 3, availableFaultCurrentKA: 25 },
    devices: [fd3020],
    deviceVoltageApplicabilityById: evidence
  });
  assert.equal(result.selected.catalogNumber, 'FD3020');
  assert.equal(result.selected.evaluatedVoltageVac, 208);
  assert.equal(result.selected.interruptingRatingVoltageVac, 240);
});

test('does not grant bundled applicability when an ID is reused with changed ratings', () => {
  const fd3020 = structuredClone(bundledDeviceSnapshot.records.find(record => record.catalogNumber === 'FD3020'));
  fd3020.ratedVoltageVac = 480;
  assert.deepEqual(buildSynthesisDeviceVoltageApplicability([fd3020]), {});
  fd3020.ratedVoltageVac = 600;
  fd3020.interruptingRatings.find(row => row.voltageVac === 240).currentKA = 64;
  assert.deepEqual(buildSynthesisDeviceVoltageApplicability([fd3020]), {});
  fd3020.interruptingRatings.find(row => row.voltageVac === 240).currentKA = 65;
  fd3020.poles = [1];
  assert.deepEqual(buildSynthesisDeviceVoltageApplicability([fd3020]), {});
});

test('malformed device input returns no applicability and does not throw', () => {
  assert.deepEqual(buildSynthesisDeviceVoltageApplicability(null), {});
  assert.deepEqual(buildSynthesisDeviceVoltageApplicability([null, {}, [], { id: 7 }, { id: 'eaton_series_c_fd3020' }]), {});
});
