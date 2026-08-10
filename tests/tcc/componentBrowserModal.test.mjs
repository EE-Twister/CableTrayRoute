import assert from 'node:assert/strict';
import { openComponentBrowserModalView } from '../../analysis/tcc/componentBrowserModal.mjs';

console.log('TCC component browser modal');

{
  const attributes = new Map();
  let refreshed;
  let config;
  await openComponentBrowserModalView({
    componentModalBtn: { setAttribute: (name, value) => attributes.set(name, value) },
    refreshCatalog: options => { refreshed = options; },
    buildComponentDisplayEntries: () => [],
    openModal: async options => { config = options; }
  });
  assert.deepEqual(refreshed, { preserveSelection: true });
  assert.equal(config.title, 'One-Line Components');
  assert.equal(config.onSubmit(), true);
  assert.equal(attributes.get('aria-expanded'), 'false');
  console.log('  ✓ refreshes the catalog and preserves empty-state ARIA lifecycle');
}
