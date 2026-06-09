const assert = require('assert');

function describe(name, fn) { console.log(name); fn(); }
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

(async () => {
  const { setOneLine, setItem } = await import('../../dataStore.mjs');
  const { runArcFlash } = await import('../../analysis/arcFlash.mjs');

  describe('arc flash analysis', () => {
    it('uses protective device clearing time', async () => {
      setItem('tccSettings', { devices: ['abb_tmax_160'], settings: { abb_tmax_160: { pickup: 160, delay: 0.2, instantaneous: 800 } } });
      setOneLine({ activeSheet: 0, sheets: [{ name: 'S1', components: [
        { id: 'BUS1', kV: 0.48, z1: { r: 0, x: 0.05 }, z2: { r: 0, x: 0.05 }, z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
          enclosure: 'Box', gap: 32, working_distance: 455, electrode_config: 'VCB', tccId: 'abb_tmax_160',
          enclosure_height: 508, enclosure_width: 508, enclosure_depth: 508 }
      ] }] });
      const res = await runArcFlash();
      const af = res.BUS1;
      // IEEE 1584-2018 model: 480 V, 20.4 kA bolted / 15.2 kA arcing, 10 ms
      // instantaneous clearing → very low incident energy (PPE 0).
      assert(Math.abs(af.incidentEnergy - 0.39) < 0.05, `incidentEnergy=${af.incidentEnergy}`);
      assert(Math.abs(af.boundary - 224.8) < 2, `boundary=${af.boundary}`);
      assert.strictEqual(af.ppeCategory, 0);
      assert(Math.abs(af.clearingTime - 0.01) < 0.001);
      assert.strictEqual(af.calculationInputs.model, 'IEEE 1584-2018');
      assert.strictEqual(af.nominalVoltage, 480);
      assert.strictEqual(af.workingDistance, 455);
      assert.strictEqual(af.limitedApproach, 1067);
      assert.strictEqual(af.restrictedApproach, 305);
      assert.strictEqual(af.equipmentTag, 'BUS1');
      assert.strictEqual(af.upstreamDevice, 'ABB Tmax T3 160A');
      const today = new Date().toISOString().split('T')[0];
      assert.strictEqual(af.studyDate, today);

      setOneLine({ activeSheet: 0, sheets: [{ name: 'S2', components: [
        { id: 'BUS2', kV: 0.48, z1: { r: 0, x: 0.05 }, z2: { r: 0, x: 0.05 }, z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }],
          enclosure: 'Box', gap: 32, working_distance: 455, electrode_config: { bad: true } }
      ] }] });
      const hardened = await runArcFlash();
      assert(hardened.BUS2, 'arc flash result should be produced for non-string electrode config');
      assert(Number.isFinite(hardened.BUS2.incidentEnergy), 'incident energy should be numeric');
    });

  });
})();

