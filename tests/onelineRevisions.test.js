const assert = require('assert');

const store = {};

global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

global.window = {
  addEventListener() {}
};

global.document = undefined;

global.navigator = global.navigator || {};

function resetStorage() {
  for (const key of Object.keys(store)) delete store[key];
}

(async () => {
  resetStorage();
  let dataStore = await import('../dataStore.mjs?cache=' + Date.now());
  dataStore.setOneLine({ activeSheet: 0, sheets: [{ name: 'Seed', components: [{ id: 'seed' }], connections: [] }] });
  for (let i = 1; i <= 15; i++) {
    dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{ name: 'Sheet', components: [{ id: `C${i}`, label: `Component ${i}` }], connections: [] }]
    });
  }
  let revisions = dataStore.getRevisions();
  assert.strictEqual(revisions.length, 10);
  assert.strictEqual(revisions[0].sheets[0].components[0].id, 'C5');
  assert.strictEqual(revisions[revisions.length - 1].sheets[0].components[0].id, 'C14');
  console.log('\u2713 one-line revisions prune by count');

  resetStorage();
  dataStore = await import('../dataStore.mjs?cache=' + Date.now());
  const largeText = 'x'.repeat(400000);
  for (let i = 0; i < 6; i++) {
    dataStore.setOneLine({
      activeSheet: 0,
      sheets: [{ name: 'Large', components: [{ id: `large-${i}`, label: `${i}-${largeText}` }], connections: [] }]
    });
  }
  revisions = dataStore.getRevisions();
  const serialized = JSON.stringify(revisions);
  const limitBytes = 1.5 * 1024 * 1024;
  assert(revisions.length < 6, 'expected revision list to trim entries when exceeding byte limit');
  assert(serialized.length <= limitBytes, `expected revisions under byte limit (${limitBytes}), got ${serialized.length}`);
  console.log('\u2713 one-line revisions respect byte limit');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
