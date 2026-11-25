import assert from 'node:assert/strict';
import {
  createImportableProjectSnapshot,
  isVersionedProjectSnapshot,
  prepareProjectSnapshotForSave,
  resolveEmptyProjectPrompt,
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

// A workspace with records but no saved project is offered Save, never Create New.
const emptyPrompt = resolveEmptyProjectPrompt({ equipment: 0, loads: 0, cables: 0, raceways: 0 });
assert.equal(emptyPrompt.kind, 'first-project');
assert.deepEqual(emptyPrompt.actions.map(item => item.label), ['Create New Project', 'Open Existing Project', 'Try a Sample Project']);
const unsavedPrompt = resolveEmptyProjectPrompt({ equipment: 1, cables: 2, raceways: 1 });
assert.equal(unsavedPrompt.kind, 'unsaved-workspace');
assert.match(unsavedPrompt.detail, /4 unsaved records/);
assert.deepEqual(unsavedPrompt.actions.map(item => item.action), ['save', 'load']);
assert.equal(unsavedPrompt.actions[0].primary, true);
assert.match(resolveEmptyProjectPrompt({ cables: 1 }).detail, /1 unsaved record\./);
assert.equal(resolveEmptyProjectPrompt({ oneLineComponents: 3 }).kind, 'unsaved-workspace');
assert.equal(resolveEmptyProjectPrompt().kind, 'first-project');

console.log('✓ project snapshot boundaries preserve raw data and produce stable summaries');
