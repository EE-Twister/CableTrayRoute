import assert from 'node:assert/strict';
import {
  buildTccSettingsSnapshot,
  reconcileComponentOverrides,
  settingsEqual
} from '../../analysis/tcc/persistenceModel.mjs';

console.log('TCC persistence model');

{
  const saved = { customCurves: [{ id: 'curve-1' }], calloutScope: 'all' };
  const componentEntry = { kind: 'component', componentId: 'CB-1' };
  const libraryEntry = { kind: 'library', baseDeviceId: 'device-1' };
  const annotation = { id: 'note-1', current: 1000, time: 0.2, text: 'Review' };
  const result = buildTccSettingsSnapshot({
    saved,
    selectedIds: ['component:CB-1', 'library:device-1'],
    entryOverrides: [
      { entry: componentEntry, overrides: { pickup: 200 } },
      { entry: libraryEntry, overrides: { time: 0.3 } }
    ],
    annotations: [annotation],
    viewOptions: ['equipment'],
    rangePreset: 'coordination'
  });
  assert.deepEqual(result.componentSettings, { 'CB-1': { pickup: 200 } });
  assert.deepEqual(result.deviceSettings, { 'device-1': { time: 0.3 } });
  assert.deepEqual(result.snapshot.devices, ['component:CB-1', 'library:device-1']);
  assert.deepEqual(result.snapshot.customCurves, saved.customCurves);
  assert.equal(result.snapshot.calloutScope, 'all');
  assert.notEqual(result.snapshot.annotations[0], annotation);
  console.log('  ✓ builds the canonical settings snapshot while retaining unrelated saved state');
}

{
  assert.equal(settingsEqual({ pickup: 100 }, { pickup: 100 }), true);
  assert.equal(settingsEqual({ pickup: 100 }, { pickup: '100' }), false);
  assert.equal(settingsEqual(null, {}), true);
  console.log('  ✓ preserves strict shallow override equality semantics');
}

{
  const oneLine = {
    sheets: [{
      components: [
        { id: 'CB-1', type: 'breaker', tccId: 'device-1', tccOverrides: { pickup: 100 } },
        { id: 'CB-2', subtype: 'fuse', tccId: 'device-2', tccOverrides: { time: 0.2 } },
        { id: 'LOAD', type: 'load', tccOverrides: { pickup: 1 } }
      ]
    }]
  };
  const result = reconcileComponentOverrides(
    oneLine,
    { 'CB-1': { pickup: 200 } },
    [{ id: 'device-1' }, { id: 'device-2' }],
    {
      isProtectiveType: type => ['breaker', 'fuse'].includes(type),
      snapOverrides: (_device, overrides) => ({ ...overrides })
    }
  );
  assert.equal(result.changed, true);
  assert.deepEqual(oneLine.sheets[0].components[0].tccOverrides, { pickup: 200 });
  assert.equal('tccOverrides' in oneLine.sheets[0].components[1], false);
  assert.deepEqual(oneLine.sheets[0].components[2].tccOverrides, { pickup: 1 });
  const unchanged = reconcileComponentOverrides(
    oneLine,
    { 'CB-1': { pickup: 200 } },
    [{ id: 'device-1' }],
    {
      isProtectiveType: type => ['breaker', 'fuse'].includes(type),
      snapOverrides: (_device, overrides) => ({ ...overrides })
    }
  );
  assert.equal(unchanged.changed, false);
  console.log('  ✓ reconciles only protective-component overrides and reports actual mutations');
}
