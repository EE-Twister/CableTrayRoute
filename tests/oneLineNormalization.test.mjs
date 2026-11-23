import assert from 'node:assert/strict';
import { normalizeOneLineStudyInput } from '../src/workers/oneLineNormalization.mjs';

const components = [{ id: 'BUS-1', type: 'bus' }, { id: 'LOAD-1', type: 'load' }];
const cases = [
  components,
  { components },
  { sheets: [{ id: 'SHEET-1', name: 'Main', components }] },
  { oneLine: { activeSheet: 0, sheets: [{ id: 'SHEET-1', name: 'Main', components }] }, options: { balanced: true } },
];

for (const input of cases) {
  const before = JSON.stringify(input);
  const normalized = normalizeOneLineStudyInput(input);
  assert.equal(normalized.components.length, 2);
  assert.deepEqual(normalized.components.map(item => item.id), ['BUS-1', 'LOAD-1']);
  assert.equal(normalized.oneLine.sheets[0].components.length, 2);
  assert.equal(JSON.stringify(input), before, 'normalization must not mutate caller input');
}

const bounded = normalizeOneLineStudyInput({ sheets: [{ id: 'BOUNDARY-BUS', components }] });
assert.equal(bounded.oneLine.sheets[0].id, 'BOUNDARY-BUS');
assert.equal(bounded.oneLine.sheets[0].components[0].id, 'BUS-1');

assert.throws(() => normalizeOneLineStudyInput({ sheets: {} }), /sheets must be an array/);
assert.throws(() => normalizeOneLineStudyInput({ components: 'bad' }), /components must be an array/);
assert.throws(() => normalizeOneLineStudyInput({ oneLine: { sheets: {} } }), /oneLine\.sheets must be an array/);
assert.throws(() => normalizeOneLineStudyInput({ oneLine: 'bad' }), /oneLine must be an object or array/);
assert.throws(() => normalizeOneLineStudyInput({ sheets: [{ id: 'S', name: 'Main', components: 'bad' }] }), /sheet components must be an array/);
assert.throws(() => normalizeOneLineStudyInput({ sheets: [{ id: 'S', components: 'bad' }, { id: 'C', type: 'bus' }] }), /sheet components must be an array/);

console.log('one-line normalization tests passed');
