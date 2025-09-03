const assert = require('assert');

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

(async () => {
  const { getItem, setItem, STORAGE_KEYS } = await import('../dataStore.mjs');
  const cols = [{ key: 'extra', label: 'Extra', type: 'text' }];
  setItem(STORAGE_KEYS.equipmentColumns, cols);
  let saved = getItem(STORAGE_KEYS.equipmentColumns, []);
  assert.deepStrictEqual(saved, cols);
  setItem(STORAGE_KEYS.equipmentColumns, []);
  saved = getItem(STORAGE_KEYS.equipmentColumns, []);
  assert.deepStrictEqual(saved, []);
  console.log('\u2713 equipment column persistence');
})().catch(err => { console.error(err); process.exitCode = 1; });
