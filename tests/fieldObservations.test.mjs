import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeFieldObservation,
  buildFieldObservationReportRows,
  enqueueFieldObservation,
  normalizeFieldObservation,
  summarizeFieldObservations,
  upsertFieldObservation,
  validateFieldObservation,
} from '../analysis/fieldObservations.mjs';

const NOW = '2026-07-31T12:00:00.000Z';

test('field observations normalize typed records and attachment metadata', () => {
  const observation = normalizeFieldObservation({
    id: 'obs-1',
    type: 'punch',
    sourceType: 'cable',
    sourceId: 'C-101',
    summary: 'Missing identification tag',
    attachments: [{ name: 'tag.jpg', type: 'image/jpeg', size: 44, dataUrl: 'data:image/jpeg;base64,AA==' }],
  }, { now: NOW });
  assert.equal(observation.type, 'punch');
  assert.equal(observation.status, 'open');
  assert.equal(observation.attachments[0].mediaType, 'image/jpeg');
  assert.equal(observation.attachments[0].sizeBytes, 44);
});

test('field observations reject missing target, summary, and unresolved close-out evidence', () => {
  assert.equal(validateFieldObservation({ summary: 'Missing target' }, { now: NOW }).errors.length, 1);
  assert.equal(validateFieldObservation({ sourceId: 'C-1' }, { now: NOW }).errors.length, 1);
  assert.equal(validateFieldObservation({
    sourceId: 'C-1', summary: 'Closed', status: 'resolved',
  }, { now: NOW }).errors.length, 1);
});

test('field observations preserve creation data when records are updated', () => {
  const first = upsertFieldObservation([], {
    id: 'obs-1', sourceId: 'C-1', summary: 'Inspect bend radius', observedBy: 'Avery',
  }, { now: NOW });
  const second = upsertFieldObservation(first.observations, {
    id: 'obs-1', sourceId: 'C-1', summary: 'Bend radius verified', status: 'resolved', resolutionNote: 'Corrected in field',
  }, { now: '2026-08-01T12:00:00.000Z' });
  assert.equal(second.observations.length, 1);
  assert.equal(second.observations[0].createdAt, NOW);
  assert.equal(second.observations[0].status, 'resolved');
  assert.equal(second.observations[0].resolvedAt, '2026-08-01T12:00:00.000Z');
});

test('offline queue deduplicates observations and report rows expose pending state', () => {
  const queue = enqueueFieldObservation(enqueueFieldObservation([], 'obs-1'), 'obs-1');
  assert.deepEqual(queue, ['obs-1']);
  assert.deepEqual(acknowledgeFieldObservation(queue, 'obs-1'), []);
  const observations = [{ id: 'obs-1', sourceId: 'T-1', sourceType: 'tray', summary: 'Support spacing review', asBuiltChange: 'Shifted support 6 in.' }];
  const summary = summarizeFieldObservations(observations, queue);
  assert.equal(summary.open, 1);
  assert.equal(summary.asBuiltConflicts, 1);
  assert.equal(summary.queued, 1);
  const rows = buildFieldObservationReportRows(observations, queue);
  assert.equal(rows[0].syncStatus, 'Pending project sync');
  assert.equal(rows[0].attachmentCount, 0);
});
