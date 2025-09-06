const assert = require('assert');

function describe(name, fn){
  console.log(name);
  fn();
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

(async () => {
  const { setOneLine } = await import('../dataStore.mjs');
  const { runShortCircuit } = await import('../analysis/shortCircuit.js');
  const { runArcFlash } = await import('../analysis/arcFlash.js');

  describe('symmetrical short circuit', () => {
    it('computes fault currents for each type', () => {
      setOneLine([{ name: 'S1', components: [
        { id: 'bus1', z1: { r: 0, x: 0.1 }, z2: { r: 0, x: 0.1 }, z0: { r: 0, x: 0.1 } }
      ] }]);
      const res = runShortCircuit();
      const r = res.bus1;
      assert(Math.abs(r.threePhaseKA - 10) < 0.01);
      assert(Math.abs(r.lineToGroundKA - 10) < 0.01);
      assert(Math.abs(r.lineToLineKA - 8.66) < 0.01);
      assert(Math.abs(r.doubleLineGroundKA - 20) < 0.01);
    });
  });

  describe('arc flash analysis', () => {
    it('computes incident energy and boundaries', () => {
      setOneLine([{ name: 'S1', components: [
        { id: 'bus1', z1: { r: 0, x: 0.1 }, z2: { r: 0, x: 0.1 }, z0: { r: 0, x: 0.1 },
          enclosure: 'Box', gap: 32, working_distance: 455, clearing_time: 0.2 }
      ] }]);
      const af = runArcFlash();
      const data = af.bus1;
      assert(Math.abs(data.incidentEnergy - 10.94) < 0.1);
      assert(Math.abs(data.boundary - 1373.7) < 1);
      assert.strictEqual(data.ppeCategory, 3);
    });
  });
})();
