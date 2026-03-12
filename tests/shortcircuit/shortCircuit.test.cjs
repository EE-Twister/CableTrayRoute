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
  const { setOneLine, setItem } = await import('../../dataStore.mjs');
  const { runShortCircuit } = await import('../../analysis/shortCircuit.mjs');

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

    it('propagates transformer impedance from secondary data fields', () => {
      setOneLine({
        activeSheet: 0,
        sheets: [{
          name: 'Impedance',
          components: [
            {
              id: 'source',
              type: 'utility_source',
              voltage: 13800,
              thevenin_mva: 500,
              connections: [{ target: 'xf1', sourcePort: 0, targetPort: 0 }]
            },
            {
              id: 'xf1',
              type: 'transformer',
              subtype: 'two_winding',
              percent_secondary: 5.75,
              kva_secondary: 1500,
              volts_primary: 13800,
              volts_secondary: 480,
              connections: [{ target: 'bus480', sourcePort: 1, targetPort: 0 }]
            },
            { id: 'bus480', type: 'bus', subtype: 'Bus' }
          ]
        }]
      });
      const res = runShortCircuit();
      const bus = res.bus480;
      assert(bus, 'bus results should exist');
      assert(bus.threePhaseKA > 0.1, 'three-phase fault current should be non-zero');
      assert(bus.lineToGroundKA > 0.1, 'line-to-ground fault current should be non-zero');
      assert(!bus.warnings, 'bus should not have impedance warnings');
    });

    it('limits downstream fault current using protective device let-through data', () => {
      const buildModel = withTcc => {
        const fuse = {
          id: 'fuse1',
          type: 'fuse',
          connections: [{ target: 'bus480', sourcePort: 1, targetPort: 0 }]
        };
        if (withTcc) fuse.tccId = 'mersen_trs200r';
        return {
          activeSheet: 0,
          sheets: [{
            name: 'Fuse Study',
            components: [
              {
                id: 'utility',
                type: 'utility_source',
                voltage: 480,
                thevenin_mva: 500,
                connections: [{ target: 'fuse1', sourcePort: 0, targetPort: 0 }]
              },
              fuse,
              {
                id: 'bus480',
                type: 'bus',
                subtype: 'Bus',
                kV: 0.48,
                z1: { r: 0.0004, x: 0.0004 },
                z2: { r: 0.0004, x: 0.0004 },
                z0: { r: 0.0004, x: 0.0004 }
              }
            ]
          }]
        };
      };

      setItem('tccSettings', { devices: [], settings: {}, componentOverrides: {} });

      setOneLine(buildModel(false));
      const baseline = runShortCircuit();
      const base = baseline.bus480;
      assert(base, 'baseline bus should exist');
      assert(base.threePhaseKA > 5, 'baseline short-circuit current should exceed 5 kA');

      setOneLine(buildModel(true));
      const limited = runShortCircuit();
      const bus = limited.bus480;
      assert(bus, 'limited bus should exist');
      assert(bus.protectionLimit, 'protection limit metadata should be present');
      assert.strictEqual(bus.protectionLimit.deviceId, 'mersen_trs200r');
      assert.strictEqual(bus.protectionLimit.basis, 'i2t');
      assert(bus.threePhaseKA < base.threePhaseKA, 'limited current should be lower than baseline');
      assert(Math.abs(bus.threePhaseKA - bus.protectionLimit.limitKA) < 0.05, 'reported current should match limit');
      const ratioBase = base.lineToGroundKA / base.threePhaseKA;
      const ratioLimited = bus.lineToGroundKA / bus.threePhaseKA;
      assert(Math.abs(ratioBase - ratioLimited) < 0.05, 'fault components should scale consistently');
    });
  });
})();

