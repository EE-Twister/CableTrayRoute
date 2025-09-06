const assert = require('assert');

function describe(name, fn) { console.log(name); fn(); }
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
  const { setOneLine, setItem } = await import('../../dataStore.mjs');
  const { runArcFlash } = await import('../../analysis/arcFlash.js');

  describe('arc flash analysis', () => {
    it('uses protective device clearing time', () => {
      setItem('tccSettings', { devices: ['abb_tmax_160'], settings: { abb_tmax_160: { pickup: 160, delay: 0.2, instantaneous: 800 } } });
      setOneLine([{ name: 'S1', components: [
        { id: 'BUS1', kV: 0.48, z1: { r: 0, x: 0.05 }, z2: { r: 0, x: 0.05 }, z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
          enclosure: 'Box', gap: 32, working_distance: 455, electrode_config: 'VCB', tccId: 'abb_tmax_160',
          enclosure_height: 508, enclosure_width: 508, enclosure_depth: 508 }
      ] }]);
      const res = runArcFlash();
      const af = res.BUS1;
      assert(Math.abs(af.incidentEnergy - 1.25) < 0.05);
      assert(Math.abs(af.boundary - 463.6) < 1.5);
      assert.strictEqual(af.ppeCategory, 1);
      assert(Math.abs(af.clearingTime - 0.01) < 0.001);
    });
  });
})();

