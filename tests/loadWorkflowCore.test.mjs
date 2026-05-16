import assert from 'node:assert/strict';
import {
  getEquipmentSourceOptions,
  mergeLoadRows,
  missingLoadFields,
  previewLoadImport,
  summarizeLoadValidation
} from '../analysis/loadWorkflow.mjs';

const loads = [
  { source: 'SWBD-101', tag: 'PMP-101', kw: '18.6', voltage: '480', powerFactor: '0.85', phases: '3' },
  { source: '', tag: 'LTG-101', kw: '', voltage: '120', powerFactor: '', phases: '1' }
];

const summary = summarizeLoadValidation(loads);
assert.equal(summary.total, 2);
assert.equal(summary.complete, 1);
assert.equal(summary.incomplete, 1);
assert.equal(summary.missingSource, 1);
assert.equal(summary.missingKw, 1);
assert.equal(summary.missingPowerFactor, 1);
assert.deepEqual(missingLoadFields(loads[0]), {
  source: false,
  kw: false,
  voltage: false,
  powerFactor: false,
  phases: false
});

assert.deepEqual(
  getEquipmentSourceOptions([{ tag: 'MCC-101' }, { id: 'SWBD-101' }, { ref: 'XFMR-101' }, { tag: 'MCC-101' }]),
  ['MCC-101', 'SWBD-101', 'XFMR-101']
);

const preview = previewLoadImport(
  [{ tag: 'PMP-101', source: 'MCC-101', kw: '' }, { tag: 'KEEP-1' }],
  [{ tag: 'PMP-101', kw: '18.6' }, { tag: 'REC-101', kw: '2' }]
);
assert.equal(preview.mergeCreates, 1);
assert.equal(preview.mergeUpdates, 1);
assert.equal(preview.mergeUnchanged, 0);

const merged = mergeLoadRows(
  [{ tag: 'PMP-101', source: 'MCC-101', kw: '' }, { tag: 'KEEP-1' }],
  [{ tag: 'PMP-101', kw: '18.6' }, { tag: 'REC-101', kw: '2' }]
);
assert.equal(merged.length, 3, 'merge must not delete absent existing loads');
assert.equal(merged[0].source, 'MCC-101');
assert.equal(merged[0].kw, '18.6');

console.log('✓ load workflow core');
