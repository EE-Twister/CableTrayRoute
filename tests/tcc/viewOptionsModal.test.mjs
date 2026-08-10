import assert from 'node:assert/strict';
import { openTccViewOptionsModal } from '../../analysis/tcc/viewOptionsModal.mjs';

console.log('TCC view options modal');

{
  const attributes = new Map();
  const triggerButton = { setAttribute: (name, value) => attributes.set(name, value) };
  let config;
  let applied;
  let restored;
  let labelUpdates = 0;
  let refreshes = 0;
  await openTccViewOptionsModal({
    triggerButton,
    activeOptions: ['equipment', 'settings'],
    viewOptions: [{ id: 'equipment', label: 'Equipment' }],
    openModal: async options => { config = options; },
    applyOptions: value => { applied = value; },
    restoreOptions: value => { restored = value; },
    updateButtonLabel: () => { labelUpdates += 1; },
    hasSelectedDevices: () => true,
    requestPlotRefresh: () => { refreshes += 1; }
  });
  assert.equal(attributes.get('aria-expanded'), 'true');
  assert.equal(config.title, 'Device Views');
  assert.equal(config.onSubmit(), true);
  assert.deepEqual(applied, ['equipment', 'settings']);
  assert.equal(refreshes, 1);
  assert.equal(attributes.get('aria-expanded'), 'false');

  config.onCancel();
  assert.deepEqual(restored, ['equipment', 'settings']);
  assert.equal(labelUpdates, 1);
  config.onClose();
  assert.equal(attributes.get('aria-expanded'), 'false');
  console.log('  ✓ preserves modal apply, cancel, refresh, and ARIA lifecycle behavior');
}

{
  let opened = false;
  await openTccViewOptionsModal({
    triggerButton: null,
    openModal: async () => { opened = true; }
  });
  assert.equal(opened, false);
  console.log('  ✓ withholds the modal when its trigger is unavailable');
}
