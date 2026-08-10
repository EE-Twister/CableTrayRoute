import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEventStateAdapter } from '../src/one-line/eventBindingController.mjs';

describe('One-Line event binding controller', () => {
  it('keeps event handlers connected to live page state', () => {
    let selected = 'initial';
    const readOnlyCatalog = { breaker: 'Breaker' };
    const state = createEventStateAdapter({
      selected: {
        get: () => selected,
        set: value => { selected = value; }
      },
      typeCatalog: { get: () => readOnlyCatalog }
    });

    assert.equal(state.selected, 'initial');
    selected = 'external-update';
    assert.equal(state.selected, 'external-update');
    state.selected = 'handler-update';
    assert.equal(selected, 'handler-update');
    assert.equal(state.typeCatalog, readOnlyCatalog);
    assert.throws(() => { state.typeCatalog = {}; }, TypeError);
  });
});
