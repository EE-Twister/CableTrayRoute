import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const stores = { local: new Map(), session: new Map() };
function storage(map) { return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), key: index => [...map.keys()][index] || null, get length() { return map.size; } }; }
globalThis.localStorage = storage(stores.local);
globalThis.sessionStorage = storage(stores.session);

const storageApi = await import('../projectStorage.mjs'.replace('.mjs', '.js'));
await storageApi.initializeProjectStorage();
const dataStore = await import('../dataStore.mjs');

describe('project history scenario mirrors', () => {
  it('removes introduced settings from active scenario while preserving another scenario', () => {
    storageApi.setProjectState({ name: 'history-mirrors', cables: [], trays: [], conduits: [], ductbanks: [], cableTypicals: [], settings: { session: {}, collapsedGroups: {} } });
    dataStore.switchScenario('history-other');
    dataStore.setItem('historyCustom', { value: 'other' });
    dataStore.switchScenario('base');
    dataStore.setItem('historyCustom', { value: 'base' });
    assert.deepEqual(dataStore.getItem('historyCustom'), { value: 'base' });
    storageApi.undoProjectChange();
    assert.equal(dataStore.getItem('historyCustom', null), null);
    assert.equal(stores.local.has('base:historyCustom'), false);
    dataStore.switchScenario('history-other');
    assert.deepEqual(dataStore.getItem('historyCustom'), { value: 'other' });
    dataStore.switchScenario('base');
    storageApi.redoProjectChange();
    assert.deepEqual(dataStore.getItem('historyCustom'), { value: 'base' });
    assert.deepEqual(JSON.parse(stores.local.get('base:historyCustom')), { value: 'base' });
  });

  it('mirrors conduit and ductbank collections after undo and redo', () => {
    storageApi.beginProjectMutationBatch();
    dataStore.setConduits([{ id: 'C-1', conduit_id: 'C-1' }]);
    dataStore.setDuctbanks([{ id: 'D-1', ductbank_id: 'D-1' }]);
    storageApi.endProjectMutationBatch();
    storageApi.undoProjectChange();
    assert.deepEqual(dataStore.getConduits(), []);
    assert.deepEqual(dataStore.getDuctbanks(), []);
    storageApi.redoProjectChange();
    assert.equal(dataStore.getConduits()[0].id, 'C-1');
    assert.equal(dataStore.getDuctbanks()[0].id, 'D-1');
  });
});
