const assert = require('assert');
const fs = require('fs');
const path = require('path');

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

(async () => {
  const root = path.resolve(__dirname, '..');
  const equipmentHtml = fs.readFileSync(path.join(root, 'equipmentlist.html'), 'utf8');
  const equipmentJs = fs.readFileSync(path.join(root, 'equipmentlist.js'), 'utf8');
  const equipmentDistJs = fs.readFileSync(path.join(root, 'dist', 'equipmentlist.js'), 'utf8');
  const dataStoreJs = fs.readFileSync(path.join(root, 'dataStore.mjs'), 'utf8');
  const { getItem, setItem, STORAGE_KEYS, getEquipment, setEquipment } = await import('../dataStore.mjs');
  const cols = [{ key: 'extra', label: 'Extra', type: 'text' }];
  setItem(STORAGE_KEYS.equipmentColumns, cols);
  let saved = getItem(STORAGE_KEYS.equipmentColumns, []);
  assert.deepStrictEqual(saved, cols);
  setItem(STORAGE_KEYS.equipmentColumns, []);
  saved = getItem(STORAGE_KEYS.equipmentColumns, []);
  assert.deepStrictEqual(saved, []);
  assert.ok(dataStoreJs.includes("arrangement: ''"), 'dataStore.mjs missing default equipment arrangement field');
  ['width', 'depth', 'height', 'baseElevation', 'lineup'].forEach(key => {
    assert.ok(dataStoreJs.includes(`${key}: ''`), `dataStore.mjs missing default equipment ${key} field`);
  });
  setEquipment([{ tag: 'MCC-1' }]);
  assert.strictEqual(getEquipment()[0].arrangement, '', 'setEquipment should add a default arrangement field');
  assert.strictEqual(getEquipment()[0].width, '', 'setEquipment should add a default width field');
  assert.strictEqual(getEquipment()[0].depth, '', 'setEquipment should add a default depth field');
  assert.strictEqual(getEquipment()[0].height, '', 'setEquipment should add a default height field');
  assert.strictEqual(getEquipment()[0].baseElevation, '', 'setEquipment should add a default base elevation field');
  assert.strictEqual(getEquipment()[0].lineup, '', 'setEquipment should add a default lineup field');
  setEquipment([{ tag: 'MCC-2', arrangement: 'Main Electrical Room' }]);
  assert.strictEqual(getEquipment()[0].arrangement, 'Main Electrical Room', 'setEquipment should preserve arrangement assignments');
  assert.ok(equipmentHtml.includes('id="bulk-arrangement-btn"'), 'equipmentlist.html missing bulk arrangement control');
  assert.ok(equipmentHtml.includes('id="bulk-lineup-btn"'), 'equipmentlist.html missing bulk lineup control');
  assert.ok(equipmentHtml.includes('description, arrangement, lineup, manufacturer'), 'equipmentlist.html search placeholder should mention arrangement and lineup');
  assert.ok(
    equipmentJs.includes("{ key: 'arrangement', label: 'Arrangement', type: 'text' }"),
    'equipmentlist.js missing Arrangement column'
  );
  assert.ok(equipmentJs.includes("{ key: 'width', label: 'Width (ft)'"), 'equipmentlist.js missing Width column');
  assert.ok(equipmentJs.includes("{ key: 'depth', label: 'Depth (ft)'"), 'equipmentlist.js missing Depth column');
  assert.ok(equipmentJs.includes("{ key: 'height', label: 'Height (ft)'"), 'equipmentlist.js missing Height column');
  assert.ok(equipmentJs.includes("{ key: 'baseElevation', label: 'Base Elev. (ft)'"), 'equipmentlist.js missing Base Elevation column');
  assert.ok(equipmentJs.includes("{ key: 'lineup', label: 'Lineup', type: 'text' }"), 'equipmentlist.js missing Lineup column');
  assert.ok(
    equipmentJs.includes("table.globalFilterCols = ['tag', 'description', 'arrangement', 'lineup', 'manufacturer', 'category', 'model'];"),
    'equipmentlist.js global search should include arrangement and lineup'
  );
  assert.ok(equipmentJs.includes("'Equipment Arrangement': 'arrangement'"), 'equipmentlist.js import map missing Equipment Arrangement');
  assert.ok(equipmentJs.includes("'Lineup': 'lineup'"), 'equipmentlist.js import map missing Lineup');
  assert.ok(equipmentDistJs.includes('key:"arrangement",label:"Arrangement"'), 'dist/equipmentlist.js missing Arrangement column');
  assert.ok(equipmentDistJs.includes('key:"lineup",label:"Lineup"'), 'dist/equipmentlist.js missing Lineup column');
  assert.ok(equipmentDistJs.includes('description","arrangement","lineup","manufacturer'), 'dist/equipmentlist.js search bundle missing arrangement and lineup');
  assert.ok(equipmentDistJs.includes('"Equipment Arrangement":"arrangement"'), 'dist/equipmentlist.js import map missing Equipment Arrangement');
  assert.ok(equipmentDistJs.includes('Lineup:"lineup"') || equipmentDistJs.includes('"Lineup":"lineup"'), 'dist/equipmentlist.js import map missing Lineup');
  console.log('\u2713 equipment column persistence');
})().catch(err => { console.error(err); process.exitCode = 1; });
