const assert = require('assert');

function describe(name, fn){
  console.log(name); fn();
}
function it(name, fn){
  try { fn(); console.log('  \u2713', name); }
  catch(err){ console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

function caseToDiagram(data){
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
    const conn = { target: br.to.toString(), impedance: { r: br.r, x: br.x } };
    if (br.b && br.b !== 0) conn.shunt = { from: { b: br.b/2 }, to: { b: br.b/2 } };
    from.connections.push(conn);
  });
  return [{ name: 'case', components }];
}

(async () => {
  const { setOneLine } = await import('../../dataStore.mjs');
  const { runLoadFlow } = await import('../../analysis/loadFlow.js');
  const case14 = require('./IEEE14.json');
  const case57 = require('./IEEE57.json');

  describe('IEEE load flow benchmarks', () => {
    it('solves IEEE 14-bus case', () => {
      setOneLine(caseToDiagram(case14));
      const res = runLoadFlow({ baseMVA: case14.baseMVA });
      assert(res.buses.length === case14.buses.length);
    });

    it('loads IEEE 57-bus placeholder', () => {
      setOneLine(caseToDiagram(case57));
      const res = runLoadFlow({ baseMVA: case57.baseMVA });
      assert(Array.isArray(res.buses || res));
    });
  });
})();
