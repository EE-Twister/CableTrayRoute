import assert from 'node:assert';
import { runLoadFlow } from './loadFlow.js';

const feeder = {
  buses: [
    { id: 'source', type: 'slack', baseKV: 13.8 },
    { id: 'load', type: 'PQ', baseKV: 13.8, load: { kw: 90, kvar: 30 } },
  ],
  branches: [{ id: 'feeder', from: 'source', to: 'load', impedance: { r: 0.01, x: 0.02 } }],
};

function phaseLoads(result) {
  return Object.fromEntries(
    result.buses
      .filter(bus => bus.id === 'load')
      .map(bus => [bus.phase, { kw: bus.Pd, kvar: bus.Qd }]),
  );
}

{
  const result = runLoadFlow(feeder, { baseMVA: 1, balanced: false });
  const loads = phaseLoads(result);
  assert.deepStrictEqual(loads, {
    A: { kw: 30, kvar: 10 },
    B: { kw: 30, kvar: 10 },
    C: { kw: 30, kvar: 10 },
  });
  assert.strictEqual(Object.values(loads).reduce((total, value) => total + value.kw, 0), 90);
}

{
  const model = structuredClone(feeder);
  model.buses[1].load = {
    phases: {
      A: { kw: 60, kvar: 20 },
      B: { kw: 30, kvar: 10 },
    },
  };
  const result = runLoadFlow(model, { baseMVA: 1, balanced: false });
  assert.deepStrictEqual(phaseLoads(result), {
    A: { kw: 60, kvar: 20 },
    B: { kw: 30, kvar: 10 },
    C: { kw: 0, kvar: 0 },
  });
}

{
  const model = structuredClone(feeder);
  model.buses[1].load = { kw: 24, kvar: 12, phase: 'B' };
  const result = runLoadFlow(model, { baseMVA: 1, balanced: false });
  assert.deepStrictEqual(phaseLoads(result), {
    A: { kw: 0, kvar: 0 },
    B: { kw: 24, kvar: 12 },
    C: { kw: 0, kvar: 0 },
  });
}

console.log('unbalanced load-flow allocation tests passed');
