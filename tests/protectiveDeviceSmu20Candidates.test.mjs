import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import {
  getProtectiveDeviceProductionMissing,
  validateProtectiveDeviceCollection,
} from '../analysis/protectiveDeviceValidation.mjs';
import { evaluateTimeCurrentCurve } from '../analysis/timeCurrentCurve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'data', 'protectiveDevices.schema.json'), 'utf8'));
const candidates = JSON.parse(fs.readFileSync(
  path.join(root, 'docs', 'protective-device-research-candidates-smu20-2026-08-12.json'),
  'utf8',
));

const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
assert.equal(ajv.validate(schema, candidates), true, JSON.stringify(ajv.errors, null, 2));

const validation = validateProtectiveDeviceCollection(candidates, { mode: 'research' });
assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
assert.deepEqual(validation.warnings, []);
assert.equal(candidates.records.length, 3);
assert.equal(
  candidates.records.flatMap(record => record.curveProfiles)
    .reduce((total, profile) => total + profile.curve.length, 0),
  522,
);

candidates.records.forEach((record) => {
  assert.equal(record.researchStatus, 'candidate');
  assert.equal(record.libraryStatus, 'screening');
  assert.equal(record.review.reviewer, null);
  assert.equal(record.review.reviewedOn, null);
  assert.deepEqual(getProtectiveDeviceProductionMissing(record), ['independent engineering review']);
  assert.equal(record.curveValidation.spotChecks.length, 6);
  assert.equal(record.tolerance.profileSemantics.length, 2);

  const bulletin242 = record.sourceDocuments.find(source => source.id === 'sc_smu20_spec_242_31');
  const bulletin665 = record.sourceDocuments.find(source => source.id === 'sc_smu20_spec_665_31_cross_application');
  assert.equal(bulletin242.documentNumber, '242-31');
  assert.equal(bulletin665.documentNumber, '665-31');
  assert.ok(!Object.values(record.fieldSources).flat().includes(bulletin665.id));

  record.curveValidation.spotChecks.forEach((check) => {
    const profile = record.curveProfiles.find(item => item.id === check.profileId);
    assert.ok(profile);
    const boundary = profile.role === 'clearing' ? 'upper' : 'lower';
    const evaluated = evaluateTimeCurrentCurve(profile.curve, check.current, { boundary });
    assert.equal(evaluated.time, check.expectedTime);
    assert.equal(check.actualTime, check.expectedTime);
    assert.equal(check.relativeError, 0);
  });
});

console.log('SMU-20 protective-device research candidates passed');
