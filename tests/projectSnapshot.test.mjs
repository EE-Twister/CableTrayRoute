import assert from 'node:assert/strict';
import {
  createImportableProjectSnapshot,
  isVersionedProjectSnapshot,
  prepareProjectSnapshotForSave,
  summarizeSavedProjectRecord
} from '../src/projectSnapshot.js';

const exported = {
  schemaVersion: 1,
  meta: { version: 1, scenario: 'base' },
  equipment: [{ id: 'eq-1' }],
  settings: {
    fieldObservationQueue: [{ id: 'observation-1' }],
    activeSampleWorkflow: { id: 'sample' }
  }
};
const prepared = prepareProjectSnapshotForSave(exported, {
  transientSettingKeys: ['fieldObservationQueue']
});
assert.deepEqual(prepared.settings.fieldObservationQueue, []);
assert.deepEqual(prepared.settings.activeSampleWorkflow, { id: 'sample' });
assert.equal(exported.settings.fieldObservationQueue.length, 1);

assert.equal(isVersionedProjectSnapshot(exported), true);
assert.equal(isVersionedProjectSnapshot({ schemaVersion: 1 }), false);
assert.equal(isVersionedProjectSnapshot(null), false);

const stored = { ...exported, __meta: { createdAt: '2026-08-12T00:00:00.000Z' } };
const importable = createImportableProjectSnapshot(stored);
assert.equal(Object.prototype.hasOwnProperty.call(importable, '__meta'), false);
assert.equal(Object.prototype.hasOwnProperty.call(stored, '__meta'), true);

const summary = summarizeSavedProjectRecord('Snapshot Project', {
  equipment: [{}, {}],
  loads: [{}],
  cables: [{}, {}, {}],
  trays: [{}],
  conduits: [{}, {}],
  ductbanks: [{}],
  oneLine: {
    sheets: [
      { components: [{}, {}] },
      { components: [{}] }
    ]
  },
  __meta: {
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z'
  }
});
assert.deepEqual(summary.counts, {
  equipment: 2,
  loads: 1,
  cables: 3,
  raceways: 4,
  oneLineComponents: 3
});
assert.equal(summary.createdAt, '2026-08-11T00:00:00.000Z');
assert.equal(summary.updatedAt, '2026-08-12T00:00:00.000Z');

const legacySummary = summarizeSavedProjectRecord('Legacy Project', {
  raceways: { trays: [{}], conduits: [{}], ductbanks: [{}] },
  oneLine: [{}, {}]
});
assert.equal(legacySummary.counts.raceways, 3);
assert.equal(legacySummary.counts.oneLineComponents, 2);

console.log('✓ project snapshot boundaries preserve raw data and produce stable summaries');
