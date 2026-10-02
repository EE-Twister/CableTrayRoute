import assert from 'node:assert/strict';
import {
  getEquipmentSourceOptions,
  invalidLoadFields,
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

// Present-but-wrong values are flagged, not treated as complete
const good = { source: 'S', kw: '10', voltage: '480', powerFactor: '0.85', phases: '3' };
assert.deepEqual(invalidLoadFields(good), { kw: false, voltage: false, powerFactor: false, phases: false });
assert.equal(invalidLoadFields({ ...good, powerFactor: '85' }).powerFactor, true, 'PF typed as a percent');
assert.equal(invalidLoadFields({ ...good, powerFactor: '0' }).powerFactor, true);
assert.equal(invalidLoadFields({ ...good, powerFactor: '1.00' }).powerFactor, false, 'unity PF is valid');
assert.equal(invalidLoadFields({ ...good, voltage: '0' }).voltage, true);
assert.equal(invalidLoadFields({ ...good, voltage: '480V' }).voltage, true);
assert.equal(invalidLoadFields({ ...good, kw: '-5' }).kw, true);
assert.equal(invalidLoadFields({ ...good, kw: '0' }).kw, false);
assert.equal(invalidLoadFields({ ...good, phases: '2' }).phases, true);
assert.equal(invalidLoadFields({ ...good, phases: 1 }).phases, false);
assert.deepEqual(invalidLoadFields({}), { kw: false, voltage: false, powerFactor: false, phases: false }, 'blank is missing, not invalid');
const badSummary = summarizeLoadValidation([good, { ...good, tag: 'BAD', powerFactor: '85', phases: '2' }]);
assert.equal(badSummary.complete, 1);
assert.equal(badSummary.incomplete, 1);
assert.equal(badSummary.invalidPowerFactor, 1);
assert.equal(badSummary.invalidPhases, 1);

console.log('✓ load workflow core');
