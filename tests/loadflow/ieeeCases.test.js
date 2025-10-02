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
  const { buildModel } = await import('../../studies/loadFlow.js');
  const case14 = require('./IEEE14.json');
  const case57 = require('./IEEE57.json');

  describe('IEEE load flow benchmarks', () => {
    it('solves IEEE 14-bus case', () => {
      setOneLine({ activeSheet: 0, sheets: caseToDiagram(case14) });
      const res = runLoadFlow({ baseMVA: case14.baseMVA });
      assert(res.buses.length === case14.buses.length);
    });

    it('loads IEEE 57-bus placeholder', () => {
      setOneLine({ activeSheet: 0, sheets: caseToDiagram(case57) });
      const res = runLoadFlow({ baseMVA: case57.baseMVA });
      assert(Array.isArray(res.buses || res));
    });

    it('keeps only bus components when subtype keys include metadata prefixes', () => {
      setOneLine({
        activeSheet: 0,
        sheets: [{
          name: 'meta',
          components: [
            {
              id: 'bus-1',
              type: 'bus',
              subtype: 'bus_Bus',
              busType: 'slack',
              baseKV: 13.8,
              Vm: 1,
              Va: 0,
              connections: [
                { target: 'motor-1', impedance: { r: 0.01, x: 0.05 } }
              ]
            },
            {
              id: 'motor-1',
              type: 'motor_load',
              subtype: 'motor_load',
              load: { kw: 75, kvar: 40 }
            }
          ]
        }]
      });
      const res = runLoadFlow();
      const buses = Array.isArray(res?.buses) ? res.buses : res;
      assert(Array.isArray(buses));
      assert.strictEqual(buses.length, 1);
      assert.strictEqual(buses[0].id, 'bus-1');
    });

    it('creates impedance links when buses are joined by non-bus equipment', () => {
      setOneLine({
        activeSheet: 0,
        sheets: [{
          name: 'links',
          components: [
            {
              id: 'bus-a',
              type: 'bus',
              subtype: 'Bus',
              busType: 'slack',
              baseKV: 13.8,
              Vm: 1,
              Va: 0
            },
            {
              id: 'cable-1',
              type: 'feeder',
              subtype: 'feeder',
              connections: [
                { target: 'bus-a' },
                { target: 'bus-b' }
              ],
              impedance: { r: 0.05, x: 0.15 }
            },
            {
              id: 'bus-b',
              type: 'bus',
              subtype: 'Bus',
              busType: 'PQ',
              baseKV: 13.8,
              Vm: 1,
              Va: 0,
              load: { kw: 500, kvar: 200 }
            }
          ]
        }]
      });
      const model = buildModel();
      const res = runLoadFlow(model, { baseMVA: 100 });
      const buses = Array.isArray(res?.buses) ? res.buses : res;
      const loadBus = buses.find(b => b.id === 'bus-b');
      assert(loadBus);
      assert(loadBus.Vm < 1);
      assert(Math.abs(loadBus.Va) > 0);
      const lines = res.lines || [];
      const flow = lines.find(l => l.from === 'bus-a' && l.to === 'bus-b');
      assert(flow);
      assert(Math.abs(flow.P) > 0);
    });
  });
})();
