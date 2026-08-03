import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginProjectMutationBatch,
  endProjectMutationBatch,
  getProjectState,
  onProjectChange,
  setProjectKey,
  setProjectState,
} from '../projectStorage.js';

describe('project storage mutation batches', () => {
  it('persists multiple imported keys with one project notification', () => {
    setProjectState({
      name: 'Batch test',
      ductbanks: [],
      conduits: [],
      trays: [],
      cables: [],
      settings: { session: {}, collapsedGroups: {}, units: 'imperial', theme: 'system' },
    });
    let notifications = 0;
    const unsubscribe = onProjectChange(() => { notifications += 1; });

    beginProjectMutationBatch();
    setProjectKey('equipment', JSON.stringify([{ id: 'EQ-1' }]));
    setProjectKey('loadList', JSON.stringify([{ id: 'LD-1' }]));
    endProjectMutationBatch();

    unsubscribe();
    const state = getProjectState();
    assert.deepEqual(state.settings.equipment, [{ id: 'EQ-1' }]);
    assert.deepEqual(state.settings.loadList, [{ id: 'LD-1' }]);
    assert.equal(notifications, 1);
  });
});
