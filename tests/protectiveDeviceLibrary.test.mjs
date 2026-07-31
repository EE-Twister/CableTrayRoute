import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessProtectiveDeviceLibraryEntry,
  normalizeCatalogProtectiveDevice,
  PROTECTIVE_DEVICE_LIBRARY_STATUS,
  summarizeProtectiveDeviceLibrary
} from '../analysis/protectiveDeviceLibrary.mjs';
import { interpolateTime } from '../analysis/tccAutoCoord.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devices = JSON.parse(fs.readFileSync(path.join(root, 'data', 'protectiveDevices.json'), 'utf8'));
const status = PROTECTIVE_DEVICE_LIBRARY_STATUS;

function check(name, fn) {
  try {
    fn();
    console.log(`âœ“ ${name}`);
  } catch (error) {
    console.error(`âœ— ${name}`);
    throw error;
  }
}

check('IEC equation records are labelled as standards references', () => {
  const entry = devices.find(device => device.id === 'iec_ni_relay');
  const assessment = assessProtectiveDeviceLibraryEntry(entry);
  assert.equal(assessment.status, status.STANDARDS_REFERENCE);
  assert.equal(assessment.missing.length, 0);
});

check('manufacturer names alone cannot promote sparse curves to calculation-ready', () => {
  const entry = devices.find(device => device.id === 'abb_tmax_160');
  const assessment = assessProtectiveDeviceLibraryEntry(entry);
  assert.equal(assessment.status, status.SCREENING);
  assert.ok(assessment.missing.includes('exact catalog number or trip-unit model'));
  assert.ok(assessment.missing.includes('voltage-specific interrupting ratings'));
  assert.ok(assessment.missing.includes('traceable curve evidence and reviewer'));
});

check('calculation-ready promotion requires exact identity, ratings, curve evidence, and review', () => {
  const candidate = {
    id: 'reviewed_breaker',
    type: 'breaker',
    libraryStatus: status.CALCULATION_READY,
    catalogNumber: 'ABC-100-3P',
    interruptingRatings: [{ voltage: 480, currentKA: 35, currentType: 'AC', ratingType: 'AIR' }],
    curve: [{ current: 100, time: 10 }, { current: 1000, time: 0.1 }],
    curveEvidence: {
      document: 'ABC TCC 123',
      revision: 'Rev 4',
      curveNumber: 'C-12',
      extractionMethod: 'manufacturer spreadsheet',
      reviewer: 'Engineering review'
    }
  };
  assert.equal(assessProtectiveDeviceLibraryEntry(candidate).status, status.CALCULATION_READY);
  candidate.curveEvidence.reviewer = '';
  assert.equal(assessProtectiveDeviceLibraryEntry(candidate).status, status.SCREENING);
});

check('governed protective-device catalog rows preserve curve provenance and readiness', () => {
  const entry = normalizeCatalogProtectiveDevice({
    id: 'ACME-100',
    manufacturer: 'Acme Power',
    catalogNumber: 'ACME-100-3P',
    category: 'protective_device',
    description: '100 A breaker',
    evidenceStatus: 'source_verified',
    protective_device_type: 'breaker',
    protective_device_trip_unit_model: 'TX-100',
    protective_device_interrupting_ratings: '480:35;600:25',
    protective_device_curve: '100:100;500:1;1000:0.1',
    protective_device_curve_document: 'Acme curve sheet',
    protective_device_curve_revision: 'Rev 3',
    protective_device_curve_id: 'Figure 7',
    protective_device_curve_extraction_method: 'manufacturer CSV',
    protective_device_curve_reviewer: 'Project EE',
    protective_device_library_status: 'calculation_ready'
  });
  assert.equal(entry.id, 'project_catalog_acme_power_acme_100_3p');
  assert.equal(entry.curve.length, 3);
  assert.equal(entry.interruptingRatings.length, 2);
  assert.equal(assessProtectiveDeviceLibraryEntry(entry).status, status.CALCULATION_READY);
});

check('catalog adapters do not create curves or promote non-protective rows', () => {
  assert.equal(normalizeCatalogProtectiveDevice({ category: 'cable', id: 'C-1' }), null);
  const incomplete = normalizeCatalogProtectiveDevice({
    id: 'ACME-EMPTY', manufacturer: 'Acme Power', category: 'protective_device',
    protective_device_type: 'breaker', evidenceStatus: 'source_verified'
  });
  assert.equal(assessProtectiveDeviceLibraryEntry(incomplete).status, status.SCREENING);
  assert.ok(assessProtectiveDeviceLibraryEntry(incomplete).missing.includes('curve data'));
});

check('calculation-ready catalog declarations require source-verified catalog evidence', () => {
  const entry = normalizeCatalogProtectiveDevice({
    id: 'ACME-UNVERIFIED', manufacturer: 'Acme Power', catalogNumber: 'ACME-UNVERIFIED',
    category: 'protective_device', protective_device_type: 'breaker',
    protective_device_interrupting_ratings: '480:35', protective_device_curve: '100:10;1000:0.1',
    protective_device_curve_document: 'Acme curve sheet', protective_device_curve_revision: 'Rev 3',
    protective_device_curve_id: 'Figure 7', protective_device_curve_extraction_method: 'manufacturer CSV',
    protective_device_curve_reviewer: 'Project EE', protective_device_library_status: 'calculation_ready'
  });
  assert.equal(assessProtectiveDeviceLibraryEntry(entry).status, status.SCREENING);
});

check('invalid interrupting ratings cannot satisfy the promotion gate', () => {
  const candidate = {
    id: 'invalid-duty-breaker',
    type: 'breaker',
    libraryStatus: status.CALCULATION_READY,
    catalogNumber: 'ABC-100-3P',
    interruptingRatings: [{ voltageVac: 0, currentKA: 35 }],
    curve: [{ current: 100, time: 10 }, { current: 1000, time: 0.1 }],
    curveEvidence: {
      document: 'ABC TCC 123',
      revision: 'Rev 4',
      curveNumber: 'C-12',
      extractionMethod: 'manufacturer spreadsheet',
      reviewer: 'Engineering review'
    }
  };
  const assessment = assessProtectiveDeviceLibraryEntry(candidate);
  assert.equal(assessment.status, status.SCREENING);
  assert.ok(assessment.missing.includes('voltage-specific interrupting ratings'));
});

check('S&C SMU-20 standard-speed family records retain source provenance and both fuse boundaries', () => {
  const family = [
    ['sc_smu20_25e_standard_14kv', '612025', 25],
    ['sc_smu20_65e_standard_14kv', '612065', 65],
    ['sc_smu20_100e_standard_14kv', '612100', 100]
  ];
  family.forEach(([id, catalogNumber, ampRating]) => {
    const entry = devices.find(device => device.id === id);
    assert.equal(entry.catalogNumber, catalogNumber);
    assert.equal(entry.continuousCurrentA, ampRating);
    assert.equal(entry.interruptingRatings[0].voltageVac, 14400);
    assert.equal(entry.interruptingRatings[0].currentKA, 14);
    assert.equal(entry.libraryStatus, status.SOURCE_VERIFIED);
    assert.match(entry.installationRequirement, /SMD-20/);
    assert.equal(entry.curveProfiles.length, 2);
    assert.deepEqual(entry.curveProfiles.map(profile => profile.role), ['melting', 'clearing']);
    entry.curveProfiles.forEach(profile => {
      assert.ok(profile.curveEvidence?.document, `${id}/${profile.id} is missing source evidence`);
      assert.ok(profile.curve.length >= 10, `${id}/${profile.id} needs a representative source-point set`);
    });
    const assessment = assessProtectiveDeviceLibraryEntry(entry);
    assert.equal(assessment.status, status.SOURCE_VERIFIED);
    assert.deepEqual(assessment.missing, ['independent reviewer']);
  });
});

check('S&C SMU-20 65E reduced curves reproduce official source spot checks within 2.5%', () => {
  const entry = devices.find(device => device.id === 'sc_smu20_65e_standard_14kv');
  const profiles = Object.fromEntries(entry.curveProfiles.map(profile => [profile.id, profile.curve]));
  const sourceSpotChecks = [
    ['minimum_melting', 669.73403, 0.221316],
    ['minimum_melting', 383.70809, 0.68512],
    ['minimum_melting', 175.54204, 5.83482],
    ['total_clearing_14_4kv', 1083.47, 0.12923],
    ['total_clearing_14_4kv', 174.327, 9.34503]
  ];
  sourceSpotChecks.forEach(([profileId, current, expected]) => {
    const actual = interpolateTime(profiles[profileId], current);
    const relativeError = Math.abs(actual - expected) / expected;
    assert.ok(relativeError <= 0.025, `${profileId} at ${current} A has ${(relativeError * 100).toFixed(2)}% error`);
  });
});

check('S&C SMU-20 25E and 100E reduced curves reproduce official source spot checks within 2.5%', () => {
  const sourceSpotChecks = [
    ['sc_smu20_25e_standard_14kv', 'minimum_melting', 128.115, 1.02515],
    ['sc_smu20_25e_standard_14kv', 'minimum_melting', 596.412, 0.048744],
    ['sc_smu20_25e_standard_14kv', 'total_clearing_14_4kv', 337.961, 0.215205],
    ['sc_smu20_25e_standard_14kv', 'total_clearing_14_4kv', 2212.61, 0.025909],
    ['sc_smu20_100e_standard_14kv', 'minimum_melting', 225.638, 42.8132],
    ['sc_smu20_100e_standard_14kv', 'minimum_melting', 1563.88, 0.098651],
    ['sc_smu20_100e_standard_14kv', 'total_clearing_14_4kv', 266.915, 17.7227],
    ['sc_smu20_100e_standard_14kv', 'total_clearing_14_4kv', 4550.21, 0.034904]
  ];
  sourceSpotChecks.forEach(([entryId, profileId, current, expected]) => {
    const entry = devices.find(device => device.id === entryId);
    const profile = entry.curveProfiles.find(item => item.id === profileId);
    const actual = interpolateTime(profile.curve, current);
    const relativeError = Math.abs(actual - expected) / expected;
    assert.ok(relativeError <= 0.025, `${entryId}/${profileId} at ${current} A has ${(relativeError * 100).toFixed(2)}% error`);
  });
});

check('bundled-library readiness counts are explicit and exhaustive', () => {
  const summary = summarizeProtectiveDeviceLibrary(devices);
  assert.equal(summary.total, devices.length);
  assert.equal(summary[status.CALCULATION_READY], 0);
  assert.equal(summary[status.SOURCE_VERIFIED], 3);
  assert.equal(
    summary[status.SOURCE_VERIFIED] + summary[status.STANDARDS_REFERENCE] + summary[status.SCREENING],
    devices.length
  );
});
