import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createProtectiveDeviceCatalogLoader,
  decodeProtectiveDeviceIndex,
} from '../src/protectiveDevices/catalogLoader.mjs';
import { createTccCatalogHydrator } from '../src/protectiveDevices/tccCatalogHydrator.mjs';
import { resolveCatalogSelection } from '../analysis/tcc/catalogSelectionModel.mjs';
import calculationDevices from '../data/protectiveDeviceCalculations.mjs';

function response(value, ok = true, status = 200) {
  return { ok, status, json: async () => value };
}

const source = JSON.parse(fs.readFileSync(new URL('../data/protectiveDevices.json', import.meta.url), 'utf8'));
const packedIndex = JSON.parse(fs.readFileSync(new URL('../data/protectiveDeviceIndex.json', import.meta.url), 'utf8'));
const index = decodeProtectiveDeviceIndex(packedIndex);
assert.equal(packedIndex.schemaVersion, 2, 'locator index must use the versioned packed format');
assert.deepEqual(packedIndex.fields, [
  'id', 'type', 'subtype', 'voltageClass', 'vendor', 'series', 'name',
  'catalogNumber', 'tripUnitModel', 'groundFault', 'catalogAssessmentStatus', 'catalogShard'
]);
assert.equal(index.length, source.length, 'compact locator must cover every protective device');
assert.deepEqual(index.map(device => device.id), source.map(device => device.id), 'index order and IDs must match the canonical catalog');
assert.ok(index.every(device => device.catalogShard && device.catalogAssessmentStatus), 'each index record must identify its shard and readiness');
assert.ok(index.every(device => !('curve' in device) && !('settings' in device) && !('sourceDocuments' in device)), 'calculation and governance fields must stay out of the locator');
assert.ok(
  fs.statSync(new URL('../data/protectiveDeviceIndex.json', import.meta.url)).size < 1_000_000,
  'packed locator must remain below the 1 MB startup budget'
);
assert.deepEqual(calculationDevices.map(device => device.id), source.map(device => device.id), 'calculation catalog must cover every canonical device');
assert.ok(calculationDevices.every(device => !('sourceDocuments' in device) && !('fieldSources' in device)), 'calculation catalog must omit governance payloads');
assert.ok(
  fs.statSync(new URL('../data/protectiveDeviceCalculations.mjs', import.meta.url)).size
    < fs.statSync(new URL('../data/protectiveDevices.json', import.meta.url)).size * 0.1,
  'calculation catalog must remain below 10% of the canonical catalog size'
);

const calls = [];
const loader = createProtectiveDeviceCatalogLoader({
  indexUrl: '/index.json',
  shardBaseUrl: '/shards',
  legacyUrl: '/legacy.json',
  fetchFn: async url => {
    calls.push(url);
    if (url === '/index.json') return response([{ id: 'a', catalogShard: '0a' }]);
    if (url === '/shards/0a.json') return response([{ id: 'a', curve: [{ current: 1, time: 2 }] }]);
    throw new Error(`Unexpected URL: ${url}`);
  },
});

assert.deepEqual(await loader.loadIndex(), [{ id: 'a', catalogShard: '0a' }]);
assert.deepEqual(calls, ['/index.json'], 'loading metadata must not fetch curve shards');
assert.equal((await loader.loadDevice('a')).curve.length, 1);
assert.deepEqual(calls, ['/index.json', '/shards/0a.json']);
await loader.loadDevice('a');
assert.deepEqual(calls, ['/index.json', '/shards/0a.json'], 'device and shard results must be cached');
assert.deepEqual(loader.getStats(), {
  indexLoaded: true,
  loadedShardCount: 1,
  hydratedDeviceCount: 1,
  legacyFallbackUsed: false,
});

const packedLoader = createProtectiveDeviceCatalogLoader({
  indexUrl: '/packed-index.json',
  fetchFn: async () => response({
    schemaVersion: 2,
    fields: ['id', 'name', 'catalogShard'],
    records: [['packed-a', 'Packed device', '0b']],
  }),
});
assert.deepEqual(await packedLoader.loadIndex(), [{ id: 'packed-a', name: 'Packed device', catalogShard: '0b' }]);

let baseDevices = [{ id: 'a', catalogShard: '0a', name: 'Metadata' }];
let libraryDevices = [...baseDevices];
const entries = [{ baseDeviceId: 'a', baseDevice: libraryDevices[0] }];
const hydrate = createTccCatalogHydrator({
  catalog: loader,
  getBaseDevices: () => baseDevices,
  getLibraryDevices: () => libraryDevices,
  setBaseDevices: value => { baseDevices = value; },
  setLibraryDevices: value => { libraryDevices = value; },
  getDeviceEntries: () => entries,
  getReviews: () => ({}),
  mergeReview: device => device,
  assess: device => ({ status: device.curve ? 'ready' : 'metadata' }),
});
await hydrate(['a']);
assert.equal(entries[0].baseDevice.curve.length, 1, 'TCC entries must receive the hydrated curve record');
assert.equal(entries[0].libraryAssessment.status, 'ready');

const fallbackCalls = [];
const fallbackLoader = createProtectiveDeviceCatalogLoader({
  indexUrl: '/missing-index.json',
  legacyUrl: '/legacy.json',
  fetchFn: async url => {
    fallbackCalls.push(url);
    if (url === '/missing-index.json') return response(null, false, 404);
    return response([{ id: 'legacy', curve: [] }]);
  },
});
assert.equal((await fallbackLoader.loadIndex())[0].id, 'legacy');
assert.equal((await fallbackLoader.loadDevice('legacy')).id, 'legacy');
assert.deepEqual(fallbackCalls, ['/missing-index.json', '/legacy.json']);
assert.equal(fallbackLoader.getStats().legacyFallbackUsed, true);

const selection = resolveCatalogSelection({
  entries: [
    { uid: 'component:a', kind: 'component', baseDeviceId: 'a' },
    { uid: 'a', kind: 'library', baseDeviceId: 'a' },
    { uid: 'neighbor', kind: 'library', baseDeviceId: 'b' },
  ],
  savedDeviceIds: ['a'],
  includeComponentContext: true,
  contextComponentUid: 'component:a',
  neighborDeviceIds: ['neighbor'],
  includeDeviceParam: true,
  deviceParam: 'a',
});
assert.deepEqual(selection, ['a', 'component:a', 'neighbor'], 'selection model must preserve saved, context, and adjacent devices without duplicates');

console.log('protective device catalog tests passed');
