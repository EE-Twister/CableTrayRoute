const assert = require('assert');

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      res.then(() => console.log('  \u2713', name))
        .catch(err => { console.log('  \u2717', name); console.error(err); process.exitCode = 1; });
    } else {
      console.log('  \u2713', name);
    }
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

function caseToDiagram(data) {
  const baseMVA = data.baseMVA || 100;
  const components = data.buses.map(b => {
    const comp = {
      id: b.id.toString(),
      busType: b.type,
      baseKV: b.baseKV,
      Vm: b.Vm,
      Va: b.Va,
      connections: []
    };
    if (b.Pd || b.Qd) comp.load = { kw: b.Pd || 0, kvar: b.Qd || 0 };
    if (b.Pg || b.Qg) comp.generation = { kw: b.Pg || 0, kvar: b.Qg || 0 };
    return comp;
  });
  data.branches.forEach(br => {
    const from = components.find(c => c.id === br.from.toString());
    if (!from) return;
    const baseKV = from.baseKV || 1;
    const baseZ = (baseKV * baseKV) / baseMVA;
    const baseY = baseMVA / (baseKV * baseKV);
    const conn = { target: br.to.toString(), impedance: { r: br.r * baseZ, x: br.x * baseZ } };
    if (br.b && br.b !== 0) conn.shunt = { from: { b: (br.b / 2) * baseY }, to: { b: (br.b / 2) * baseY } };
    from.connections.push(conn);
  });
  return [{ name: 'case', components }];
}

(async () => {
  const { setOneLine, setItem } = await import('../dataStore.mjs');
  const { runLoadFlow } = await import('../analysis/loadFlow.js');
  const { runShortCircuit } = await import('../analysis/shortCircuit.mjs');
  const { runArcFlash } = await import('../analysis/arcFlash.mjs');
  const { runReliability } = await import('../analysis/reliability.js');
  const { runValidation } = await import('../validation/rules.js');
  const { resolveComponentLabel } = await import('../utils/componentLabels.js');

  const lfBench = require('./benchmarks/loadflow_ieee14.json');
  const scBench = require('./benchmarks/shortCircuit_example.json');
  const afBench = require('./benchmarks/arcflash_example.json');

  describe('analysis benchmarks', () => {
    it('matches IEEE 14-bus load flow', () => {
      setOneLine({ activeSheet: 0, sheets: caseToDiagram(lfBench) });
      const res = runLoadFlow({ baseMVA: lfBench.baseMVA });
      Object.entries(lfBench.expected).forEach(([id, exp]) => {
        const bus = res.buses.find(b => b.id === id);
        assert(bus, `Missing bus ${id}`);
        if (exp.Vm !== undefined) assert(Math.abs(bus.Vm - exp.Vm) < 0.01);
        if (exp.Va !== undefined) assert(Math.abs(bus.Va - exp.Va) < 0.1);
      });
    });

    it('matches short-circuit example', () => {
      setOneLine({ activeSheet: 0, sheets: scBench.oneLine });
      const res = runShortCircuit();
      Object.entries(scBench.expected).forEach(([id, exp]) => {
        const bus = res[id];
        assert(bus, `Missing bus ${id}`);
        if (exp.threePhaseKA !== undefined) assert(Math.abs(bus.threePhaseKA - exp.threePhaseKA) < 0.1);
        if (exp.lineToGroundKA !== undefined) assert(Math.abs(bus.lineToGroundKA - exp.lineToGroundKA) < 0.1);
        if (exp.lineToLineKA !== undefined) assert(Math.abs(bus.lineToLineKA - exp.lineToLineKA) < 0.1);
        if (exp.doubleLineGroundKA !== undefined) assert(Math.abs(bus.doubleLineGroundKA - exp.doubleLineGroundKA) < 0.1);
      });
    });

    it('matches arc-flash example', async () => {
      setItem('tccSettings', afBench.tccSettings);
      setOneLine({ activeSheet: 0, sheets: afBench.oneLine });
      const res = await runArcFlash();
      Object.entries(afBench.expected).forEach(([id, exp]) => {
        const bus = res[id];
        assert(bus, `Missing bus ${id}`);
        if (exp.incidentEnergy !== undefined) assert(Math.abs(bus.incidentEnergy - exp.incidentEnergy) < 0.05);
        if (exp.boundary !== undefined) assert(Math.abs(bus.boundary - exp.boundary) < 1);
        if (exp.ppeCategory !== undefined) assert.strictEqual(bus.ppeCategory, exp.ppeCategory);
        if (exp.clearingTime !== undefined) assert(Math.abs(bus.clearingTime - exp.clearingTime) < 0.001);
      });
    });
  });

  describe('reliability labeling', () => {
    it('prefers metadata before falling back to id', () => {
      const comp = { id: 'comp-1', ref: 'REF-1', tag: 'TAG-1', props: { tag: 'PROP-TAG' } };
      const label = resolveComponentLabel(comp, comp.id);
      assert.strictEqual(label, 'REF-1');
    });

    it('does not emit radial reliability failures', () => {
      const source = { id: 'source', type: 'bus', connections: [{ target: 'breaker' }] };
      const breaker = { id: 'breaker', type: 'breaker', tag: 'BRK-1', connections: [{ target: 'source' }, { target: 'load' }] };
      const load = { id: 'load', type: 'bus', props: { tag: 'LD-1' }, connections: [{ target: 'breaker' }] };
      const components = [source, breaker, load];

      const reliability = runReliability(components);
      assert.deepStrictEqual(reliability.n1Failures, []);
      assert.deepStrictEqual(reliability.n1FailureDetails, {});

      const issues = runValidation(components, {
        reliability: {
          n1Failures: reliability.n1Failures,
          n1FailureDetails: reliability.n1FailureDetails
        }
      });
      assert.strictEqual(issues.length, 0);
    });
  });
})();
