import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countHomeWorkspaceRecords, resolveHomeState } from '../src/homeState.js';

describe('home page state', () => {
  it('counts workspace records across lists, skipping placeholders and failed reads', () => {
    const readErrors = [];
    const count = countHomeWorkspaceRecords({
      getEquipment: () => [{ tag: 'SW-1' }, {}],
      getLoads: () => { throw new Error('unavailable'); },
      getCables: () => [{ tag: 'C-1' }, { _ui: true }],
      getTrays: () => [{ tray_id: 'T-1' }],
      getConduits: () => null,
      getDuctbanks: () => [{ tag: 'DB-1' }]
    }, error => readErrors.push(error.message));
    assert.equal(count, 4);
    assert.deepEqual(readErrors, ['unavailable']);
    assert.equal(countHomeWorkspaceRecords({}), 0);
  });

  it('shows one home state per workspace and offers Save only for unsaved work', () => {
    assert.deepEqual(resolveHomeState({ saveState: { state: 'unnamed' }, recordCount: 0 }), { state: 'empty', canSave: false });
    assert.deepEqual(resolveHomeState({}), { state: 'empty', canSave: false });
    assert.deepEqual(resolveHomeState({ saveState: { state: 'unnamed' }, recordCount: 3 }), { state: 'active', canSave: true });
    assert.deepEqual(resolveHomeState({ saveState: { state: 'saved' }, recordCount: 0 }), { state: 'active', canSave: false });
    assert.deepEqual(resolveHomeState({ saveState: { state: 'saved' }, recordCount: 12 }), { state: 'active', canSave: false });
    assert.deepEqual(resolveHomeState({ saveState: { state: 'unsaved' }, recordCount: 12 }), { state: 'active', canSave: true });
  });
});
