import assert from 'node:assert/strict';
import { openDeviceSelectionModalView } from '../../analysis/tcc/deviceSelectionModal.mjs';

console.log('TCC device selection modal');

{
  let config;
  await openDeviceSelectionModalView({
    deviceEntries: [],
    deviceMap: new Map(),
    getContextDeviceRelationshipMap: () => new Map(),
    buildTypeGroups: () => [],
    openModal: async options => { config = options; }
  });
  assert.equal(config.title, 'Select Devices');
  assert.equal(config.primaryText, 'Close');
  assert.equal(config.secondaryText, null);
  assert.equal(config.onSubmit(), true);
  console.log('  ✓ preserves the empty protective-device catalog state');
}
