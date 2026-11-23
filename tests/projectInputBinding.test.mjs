import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLinkedValue,
  bindProjectField,
} from '../src/components/projectInputBinding.js';

function fakeInput(value = '') {
  const listeners = new Map();
  return {
    value,
    title: '',
    dataset: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.({ currentTarget: this });
    },
  };
}

test('project-linked fields preserve an initial manual value until a link is assigned', () => {
  const input = fakeInput('50');
  const overrides = new Set();
  const binding = { sourcePath: 'loads', sourceLabel: 'Load List (0 loads)' };
  bindProjectField(input, binding, overrides, 'averageLoadKw');

  applyLinkedValue(input, null, overrides, 'averageLoadKw', binding);
  assert.equal(input.value, '50');
  assert.equal(input.dataset.projectInputState, 'manual');
  assert.equal(binding.sourcePath, 'manual.averageLoadKw');
  assert.equal(binding.sourceLabel, 'Manual input');

  applyLinkedValue(input, 22.4, overrides, 'averageLoadKw', binding);
  assert.equal(input.value, 22.4);
  assert.equal(input.dataset.projectInputState, 'linked');
  assert.equal(input.dataset.projectLinkedValueAssigned, 'true');

  applyLinkedValue(input, null, overrides, 'averageLoadKw', binding);
  assert.equal(input.value, '', 'a previously assigned link must be cleared when its source disappears');
  assert.equal(input.dataset.projectInputState, 'linked');
});

test('manual override is retained during ordinary source refresh and force-cleared only after a real link', () => {
  const input = fakeInput('50');
  const overrides = new Set();
  const binding = { sourcePath: 'loads', sourceLabel: 'Load List' };
  bindProjectField(input, binding, overrides, 'averageLoadKw');
  input.value = '100';
  input.dispatch('input');

  applyLinkedValue(input, null, overrides, 'averageLoadKw', binding);
  assert.equal(input.value, '100');
  assert.ok(overrides.has('averageLoadKw'));

  applyLinkedValue(input, null, overrides, 'averageLoadKw', binding, { force: true });
  assert.equal(input.value, '100', 'a manual-only field has no stale linked value to clear');
  assert.equal(input.dataset.projectInputState, 'manual');

  applyLinkedValue(input, 22.4, overrides, 'averageLoadKw', binding);
  input.value = '100';
  input.dispatch('input');
  applyLinkedValue(input, null, overrides, 'averageLoadKw', binding, { force: true });
  assert.equal(input.value, '', 'force refresh clears a value that was actually linked');
});
