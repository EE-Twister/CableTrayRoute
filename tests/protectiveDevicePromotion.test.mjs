import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareProtectiveDevicePromotion } from '../scripts/promoteProtectiveDeviceCandidates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batch = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'protective-device-research-results-2026-07-31.json'), 'utf8'));

const merged = prepareProtectiveDevicePromotion([{ id: 'legacy_fixture' }], batch);
assert.equal(merged.length, batch.records.length + 1);
assert.equal(merged.slice(1).every(record => record.libraryStatus === 'screening' && record.researchStatus === 'candidate'), true);

const duplicateBatch = {
  ...batch,
  records: [batch.records[0], batch.records[0]]
};
assert.throws(
  () => prepareProtectiveDevicePromotion([], duplicateBatch),
  /Duplicate candidate id|Duplicate device id/
);

assert.throws(
  () => prepareProtectiveDevicePromotion([{ id: batch.records[0].id }], batch),
  /already exists in production library/
);

console.log(`Protective-device promotion tests passed for ${batch.records.length} screening candidates.`);
