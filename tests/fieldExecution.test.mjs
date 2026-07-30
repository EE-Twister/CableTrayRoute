import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findFieldExecutionRecord,
  normalizeFieldExecutionRecord,
  summarizeFieldExecution,
  upsertFieldExecutionRecord,
} from '../analysis/fieldExecution.mjs';

test('field execution records normalize and upsert by type and source id', () => {
  const first = normalizeFieldExecutionRecord({
    recordType: 'Cable',
    sourceId: 'C-1',
    status: 'installed',
    quantityComplete: 12,
  });
  assert.equal(first.key, 'cable:c-1');
  const records = upsertFieldExecutionRecord([first], {
    recordType: 'cable',
    sourceId: 'C-1',
    status: 'tested',
    punchOpen: true,
  });
  assert.equal(records.length, 1);
  assert.equal(findFieldExecutionRecord(records, 'cable', 'C-1').status, 'tested');
});

test('field execution summary reports accepted, blocked, and punch records', () => {
  const summary = summarizeFieldExecution([
    { recordType: 'cable', sourceId: 'C-1', status: 'accepted' },
    { recordType: 'tray', sourceId: 'T-1', status: 'blocked', punchOpen: true },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.complete, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.punchOpen, 1);
});
