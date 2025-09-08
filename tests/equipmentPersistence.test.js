const assert = require('assert');

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

(async () => {
  global.window = {};
  const dataStore = await import('../dataStore.mjs');
  await import('../tableUtils.mjs');
  const TableUtils = global.window.TableUtils;
  const { STORAGE_KEYS } = TableUtils;

  const rows = [
    { id: 'eq1', description: 'Breaker', voltage: '480', category: 'A', subCategory: 'B', x: 1, y: 2, z: 3 }
  ];

  TableUtils.saveToStorage(STORAGE_KEYS.equipment, rows);
  const loaded = TableUtils.loadFromStorage(STORAGE_KEYS.equipment);
  assert.deepStrictEqual(loaded, rows);

  const stored = dataStore.getItem(STORAGE_KEYS.equipment);
  assert.deepStrictEqual(stored, rows);

  console.log('\u2713 equipment persistence');
})().catch(err => { console.error(err); process.exitCode = 1; });
