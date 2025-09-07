const assert = require('assert');

function describe(name, fn) {
  console.log(name); fn();
}
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

(async () => {
  const { setOneLine } = await import('../../dataStore.mjs');
  const { runShortCircuit } = await import('../../analysis/shortCircuit.js');

  describe('short circuit engine', () => {
    it('handles multiple voltages with X/R and source contributions', () => {
      setOneLine({ activeSheet: 0, sheets: [{ name: 'S1', components: [
        { id: 'bus13kV', kV: 13.8, z1: { r: 0, x: 1 }, z2: { r: 0, x: 1 }, z0: { r: 0, x: 1 },
          sources: [{ z1: { r: 0, x: 0.5 }, z2: { r: 0, x: 0.5 }, z0: { r: 0, x: 1 } }] },
        { id: 'bus480V', kV: 0.48, z1: { r: 0, x: 0.05 }, z2: { r: 0, x: 0.05 }, z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }], xr_ratio: 6 }
      ] }] });
      const res = runShortCircuit();
      const a = res.bus13kV;
      assert(Math.abs(a.threePhaseKA - 26.29) < 0.1);
      assert(Math.abs(a.lineToGroundKA - 22.54) < 0.1);
      assert(Math.abs(a.lineToLineKA - 22.77) < 0.1);
      assert(Math.abs(a.doubleLineGroundKA - 49.3) < 0.1);
      const b = res.bus480V;
      assert(Math.abs(b.threePhaseKA - 20.37) < 0.1);
      assert(Math.abs(b.lineToGroundKA - 20.37) < 0.1);
      assert(Math.abs(b.lineToLineKA - 17.64) < 0.1);
      assert(Math.abs(b.doubleLineGroundKA - 40.74) < 0.1);
      assert(Math.abs(b.asymKA - 32.44) < 0.1);
    });
  });
})();

