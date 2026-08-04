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

const { setOneLine } = await import('../../dataStore.mjs');
const { runLoadFlow } = await import('../../analysis/loadFlow.js');

function buildRadialBuses(count) {
  const buses = [{
    id: 'UTILITY',
    type: 'bus',
    subtype: 'Bus',
    busType: 'slack',
    baseKV: 13.8,
    Vm: 1,
    Va: 0,
    connections: []
  }];
  for (let index = 0; index < count; index++) {
    const id = `BUS-${index + 1}`;
    buses[0].connections.push({
      target: id,
      impedance: { r: 0.003 + (index % 5) * 0.0001, x: 0.012 }
    });
    buses.push({
      id,
      type: 'bus',
      subtype: 'Bus',
      busType: 'PQ',
      baseKV: 13.8,
      Vm: 1,
      Va: 0,
      load: { kw: 40 + index % 20, kvar: 12 + index % 8 },
      connections: []
    });
  }
  return buses;
}

function buildLargeOneLine(count) {
  const buses = buildRadialBuses(count);
  const components = [...buses];
  for (let index = 0; index < count; index++) {
    const busId = `BUS-${index + 1}`;
    components.push({
      id: `MTR-${index + 1}`,
      type: 'motor',
      subtype: 'Motor',
      load: { kw: 25 + index % 10, kvar: 8 + index % 5 },
      connections: [{ target: busId }]
    });
    components.push({
      id: `LOAD-${index + 1}`,
      type: 'load',
      subtype: 'Load',
      load: { kw: 15 + index % 10, kvar: 4 + index % 5 },
      connections: [{ target: busId }]
    });
  }
  return { activeSheet: 0, sheets: [{ name: 'Large radial utility system', components }] };
}

describe('large radial load-flow performance', () => {
  it('matches the Newton-Raphson solution on a supported radial network', () => {
    const model = { buses: buildRadialBuses(260) };
    const optimized = runLoadFlow(model, { baseMVA: 100 });
    const reference = runLoadFlow(model, { baseMVA: 100, radialOptimization: false });

    assert.equal(optimized.converged, true);
    assert.equal(reference.converged, true);
    assert.equal(optimized.solver, 'radial-backward-forward-sweep');
    assert.equal(reference.solver, 'newton-raphson');
    optimized.buses.forEach((bus, index) => {
      assert.ok(Math.abs(bus.Vm - reference.buses[index].Vm) < 1e-7, `${bus.id} voltage magnitude differs`);
      assert.ok(Math.abs(bus.Va - reference.buses[index].Va) < 1e-5, `${bus.id} voltage angle differs`);
    });
    assert.ok(Math.abs(optimized.losses.P - reference.losses.P) < 0.01);
    assert.ok(Math.abs(optimized.losses.Q - reference.losses.Q) < 0.01);
  });

  it('retains Newton-Raphson when a large network includes a tap', () => {
    const buses = buildRadialBuses(250);
    buses[0].connections[0].tap = { ratio: 1.01, angle: 0 };
    const result = runLoadFlow({ buses }, { baseMVA: 100 });

    assert.equal(result.converged, true);
    assert.equal(result.solver, 'newton-raphson');
  });

  it('solves 1,001 buses and 2,000 attached devices within 2 seconds', () => {
    setOneLine(buildLargeOneLine(1000));
    const started = performance.now();
    const result = runLoadFlow({ baseMVA: 100 });
    const durationMs = performance.now() - started;

    assert.equal(result.converged, true);
    assert.equal(result.buses.length, 1001);
    assert.equal(result.solver, 'radial-backward-forward-sweep');
    assert.ok(durationMs < 2000, `Expected < 2000 ms, measured ${durationMs.toFixed(1)} ms`);
  });
});
