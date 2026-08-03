import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROUTE_STARTUP_CONTRACTS,
  evaluateRouteStartupProfile,
  evaluateRouteStartupProfiles,
} from '../src/performance/routeStartupContracts.js';

describe('route startup contracts', () => {
  it('covers the protective-device study and library routes', () => {
    assert.deepEqual(Object.keys(ROUTE_STARTUP_CONTRACTS), [
      'shortCircuit.html',
      'iec60909.html',
      'arcFlash.html',
      'library.html',
    ]);
  });

  it('accepts metadata-only Library startup and catalog-free study startup', () => {
    assert.equal(evaluateRouteStartupProfile({
      route: 'shortCircuit.html',
      readyMs: 400,
      requests: ['file:///app/dist/shortCircuit.js'],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'library.html',
      readyMs: 900,
      requests: ['file:///app/data/protectiveDeviceIndex.json'],
    }).passed, true);
  });

  it('rejects eager shards, monoliths, and missing route profiles', () => {
    const eagerShard = evaluateRouteStartupProfile({
      route: 'arcFlash.html',
      readyMs: 300,
      requests: ['https://example.test/data/protectiveDeviceCatalog/3d.json'],
    });
    assert.equal(eagerShard.passed, false);
    assert.ok(eagerShard.failures.some(failure => failure.includes('shard startup requests')));

    const monolith = evaluateRouteStartupProfile({
      route: 'shortCircuit.html',
      readyMs: 300,
      requests: ['https://example.test/data/protectiveDeviceCalculations.mjs'],
    });
    assert.equal(monolith.passed, false);
    assert.ok(monolith.failures.some(failure => failure.includes('forbidden monolithic catalog')));

    const missing = evaluateRouteStartupProfiles([]);
    assert.ok(missing.every(result => !result.passed));
  });
});
