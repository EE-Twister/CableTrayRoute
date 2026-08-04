import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const { parseHarmonicSpectrum, runNetworkHarmonics } = await import('../analysis/harmonicNetwork.mjs');
const { setOneLine } = await import('../dataStore.mjs');
const { runHarmonics } = await import('../analysis/harmonics.js');

function makeBus(id, busType = 'PQ') {
  return {
    id,
    type: 'bus',
    subtype: 'Bus',
    busType,
    baseKV: 0.48,
    connections: []
  };
}

function buildThreeBusCase(secondAngle = 0) {
  const utility = {
    ...makeBus('UTILITY', 'slack'),
    z1: { r: 0.01, x: 0.02 },
    connections: [
      { target: 'BUS-1', impedance: { r: 0.01, x: 0.02 } },
      { target: 'BUS-2', impedance: { r: 0.01, x: 0.02 } }
    ]
  };
  const source = (id, busId, angleDeg = 0) => ({
    id,
    type: 'load',
    subtype: 'VFD',
    harmonicSource: true,
    amps: 100,
    baseKV: 0.48,
    harmonics: { 5: 20 },
    harmonicAngles: { 5: angleDeg },
    connections: [{ target: busId }]
  });
  return {
    activeSheet: 0,
    sheets: [{
      name: 'Three-bus harmonic case',
      components: [
        utility,
        makeBus('BUS-1'),
        makeBus('BUS-2'),
        source('VFD-1', 'BUS-1'),
        source('VFD-2', 'BUS-2', secondAngle)
      ]
    }]
  };
}

function buildLargeCase(busCount) {
  const utility = {
    ...makeBus('UTILITY', 'slack'),
    z1: { r: 0.002, x: 0.01 },
    connections: []
  };
  const components = [utility];
  for (let index = 0; index < busCount; index++) {
    const busId = `BUS-${index + 1}`;
    utility.connections.push({ target: busId, impedance: { r: 0.003, x: 0.012 } });
    components.push(makeBus(busId));
    components.push({
      id: `VFD-${index + 1}`,
      type: 'load',
      subtype: 'VFD',
      harmonicSource: true,
      amps: 100,
      baseKV: 0.48,
      harmonics: { 5: 20, 7: 14, 11: 9, 13: 7 },
      connections: [{ target: busId }]
    });
    components.push({
      id: `LOAD-${index + 1}`,
      type: 'load',
      subtype: 'Load',
      baseKV: 0.48,
      connections: [{ target: busId }]
    });
  }
  return { activeSheet: 0, sheets: [{ name: 'Large harmonic case', components }] };
}

describe('network harmonic analysis', () => {
  it('accepts object-form harmonic spectra', () => {
    assert.deepEqual(parseHarmonicSpectrum({ 5: 20, 7: 14 }), { 5: 20, 7: 14 });
  });

  it('returns source and network results for the One-Line workflow', () => {
    setOneLine(buildThreeBusCase());
    const sources = runHarmonics();
    const network = runNetworkHarmonics({ maximumDemandCurrentA: 250 });

    assert.ok(sources['VFD-1']);
    assert.equal(sources['VFD-1'].ithd, 20);
    assert.equal(network.topology.busCount, 3);
    assert.equal(network.pcc.currentTddPct, 16);
  });

  it('retains every bus result while aggregating the PCC phasors', () => {
    const result = runNetworkHarmonics({
      oneLine: buildThreeBusCase(),
      maximumDemandCurrentA: 250
    });

    assert.equal(result.calculationStatus, 'network-screening');
    assert.equal(result.topology.busCount, 3);
    assert.equal(result.topology.sourceCount, 2);
    assert.equal(Object.keys(result.buses).length, 3);
    assert.equal(Object.keys(result.branches).length, 2);
    assert.ok(Math.abs(result.pcc.harmonics[5].currentA - 40) < 0.001);
    assert.ok(Math.abs(result.pcc.currentThdPct - 20) < 0.001);
    assert.ok(Math.abs(result.pcc.currentTddPct - 16) < 0.001);
    assert.ok(result.buses['BUS-1'].voltageThdPct > result.buses.UTILITY.voltageThdPct);
    assert.ok(Math.abs(result.branches['UTILITY->BUS-1'].harmonics[5].currentA - 20) < 0.001);
  });

  it('shows local bus distortion even when sources cancel at the PCC', () => {
    const result = runNetworkHarmonics({ oneLine: buildThreeBusCase(180) });

    assert.ok(result.pcc.harmonics[5].currentA < 0.001);
    assert.ok(result.buses['BUS-1'].harmonics[5].currentA > 19.99);
    assert.ok(result.buses['BUS-2'].harmonics[5].currentA > 19.99);
    assert.ok(result.buses['BUS-1'].voltageThdPct > result.pcc.voltageThdPct);
  });

  it('analyzes 1,001 buses and 2,000 devices within one second and two MiB', () => {
    const started = performance.now();
    const result = runNetworkHarmonics({
      oneLine: buildLargeCase(1000),
      maximumDemandCurrentA: 120000
    });
    const durationMs = performance.now() - started;

    assert.equal(result.calculationStatus, 'network-screening');
    assert.equal(result.topology.busCount, 1001);
    assert.equal(result.topology.sourceCount, 1000);
    assert.equal(Object.keys(result.buses).length, 1001);
    assert.ok(durationMs < 1000, `Expected < 1000 ms, measured ${durationMs.toFixed(1)} ms`);
    const serializedBytes = Buffer.byteLength(JSON.stringify(result));
    assert.ok(
      serializedBytes < 2 * 1024 * 1024,
      `Expected < 2 MiB serialized, measured ${(serializedBytes / 1024 / 1024).toFixed(2)} MiB`
    );
  });
});
