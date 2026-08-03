import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectDiagramComponents,
  collectReferencedProtectiveDeviceIds,
  loadReferencedProtectiveDevices,
} from '../src/protectiveDevices/calculationCatalog.mjs';

describe('referenced protective-device calculation catalog', () => {
  const components = [
    { id: 'main', type: 'breaker', tccId: 'breaker-a' },
    { id: 'feeder', type: 'fuse', tccId: 'fuse-b' },
    { id: 'duplicate', type: 'breaker', tccId: 'breaker-a' },
    { id: 'load', type: 'load' },
  ];

  it('collects unique device IDs from arrays and One-Line sheets', () => {
    assert.deepEqual(collectReferencedProtectiveDeviceIds(components), ['breaker-a', 'fuse-b']);
    assert.deepEqual(collectReferencedProtectiveDeviceIds({
      sheets: [{ components: components.slice(0, 2) }],
    }), ['breaker-a', 'fuse-b']);
    assert.equal(collectDiagramComponents({ components }).length, components.length);
  });

  it('loads only missing referenced IDs and retains project devices', async () => {
    const requested = [];
    const catalog = {
      async loadDevices(ids) {
        requested.push(...ids);
        return ids.map(id => ({ id, curve: [{ current: 100, time: 1 }] }));
      },
    };
    const devices = await loadReferencedProtectiveDevices(components, {
      catalog,
      additionalDevices: [{ id: 'breaker-a', name: 'Project breaker' }],
    });

    assert.deepEqual(requested, ['fuse-b']);
    assert.deepEqual(devices.map(device => device.id), ['breaker-a', 'fuse-b']);
    assert.equal(devices[0].name, 'Project breaker');
  });

  it('does not load the catalog when the project has no linked devices', async () => {
    let calls = 0;
    const catalog = { async loadDevices() { calls += 1; return []; } };
    assert.deepEqual(await loadReferencedProtectiveDevices([{ id: 'bus', type: 'bus' }], { catalog }), []);
    assert.equal(calls, 0);
  });
});
