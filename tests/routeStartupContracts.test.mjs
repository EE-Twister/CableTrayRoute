import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROUTE_STARTUP_CONTRACTS,
  evaluateRouteStartupProfile,
  evaluateRouteStartupProfiles,
} from '../src/performance/routeStartupContracts.js';

describe('route startup contracts', () => {
  it('covers the protected engineering and library routes', () => {
    assert.deepEqual(Object.keys(ROUTE_STARTUP_CONTRACTS), [
      'shortCircuit.html',
      'iec60909.html',
      'arcFlash.html',
      'tcc.html',
      'library.html',
      'harmonics.html',
      'loadFlow.html',
      'motorStart.html',
      'contingency.html',
      'transientstability.html',
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
      requests: [
        'file:///app/dist/vendor/xlsx.full.min.js',
        'file:///app/dist/library.js',
        'file:///app/data/protectiveDeviceIndex.json',
      ],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'tcc.html',
      readyMs: 800,
      requests: [
        'file:///app/dist/vendor/d3.min.js',
        'file:///app/dist/vendor/pdf.min.mjs',
        'file:///app/dist/tcc.js',
        'file:///app/dist/vendor/fast-json-patch.mjs',
        'file:///app/data/protectiveDeviceIndex.json',
      ],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'harmonics.html',
      readyMs: 500,
      requests: [
        'file:///app/dist/vendor/d3.min.js',
        'file:///app/dist/harmonics.js',
      ],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'loadFlow.html',
      readyMs: 500,
      requests: ['file:///app/dist/loadFlow.js'],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'motorStart.html',
      readyMs: 500,
      requests: [
        'file:///app/dist/vendor/d3.min.js',
        'file:///app/dist/motorStart.js',
      ],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'contingency.html',
      readyMs: 500,
      requests: ['file:///app/dist/contingency.js'],
    }).passed, true);
    assert.equal(evaluateRouteStartupProfile({
      route: 'transientstability.html',
      readyMs: 500,
      requests: [
        'file:///app/dist/vendor/plotly.min.js',
        'file:///app/dist/transientstability.js',
        'file:///app/dist/vendor/fast-json-patch.mjs',
      ],
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

    const moduleFanout = evaluateRouteStartupProfile({
      route: 'arcFlash.html',
      readyMs: 300,
      requests: [
        'https://example.test/dist/arcFlash.js',
        'https://example.test/dist/vendor/fast-json-patch.mjs',
        'https://example.test/src/components/modal.js',
      ],
    });
    assert.equal(moduleFanout.passed, false);
    assert.ok(moduleFanout.failures.some(failure => failure.includes('script startup requests')));

    const missing = evaluateRouteStartupProfiles([]);
    assert.ok(missing.every(result => !result.passed));
  });
});
