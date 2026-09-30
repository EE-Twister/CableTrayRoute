/**
 * An arc on the 480 V side is cleared by a device on the 13.8 kV side at the arc current
 * referred through the transformer (x 0.48/13.8), not at the 480 V arcing current itself.
 * Also: the model voltage falls back to the component's own voltage before the 0.48 kV default.
 */
import assert from 'node:assert';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { setOneLine, setItem } = await import('../../dataStore.mjs');
const { runArcFlash, currentAtDeviceKA } = await import('../../analysis/arcFlash.mjs');

assert.ok(Math.abs(currentAtDeviceKA(15, 0.48, 13.8) - 15 * 0.48 / 13.8) < 1e-12);
assert.strictEqual(currentAtDeviceKA(15, undefined, 13.8), 15, 'unknown voltage leaves the current unchanged');
assert.strictEqual(currentAtDeviceKA(15, 0.48, 0.48), 15);

setItem('tccSettings', { devices: ['abb_tmax_160'], settings: { abb_tmax_160: { pickup: 160, delay: 0.2, instantaneous: 800 } } });
const busProps = { id: 'bus', type: 'bus', subtype: 'Bus', kV: 0.48, enclosure: 'Box', gap: 32, working_distance: 455, electrode_config: 'VCB',
  enclosure_height: 508, enclosure_width: 508, enclosure_depth: 508 };
const withPrimaryDevice = {
  activeSheet: 0,
  sheets: [{ name: 'S', components: [
    { id: 'src', type: 'utility_source', voltage: 13800, thevenin_mva: 500, connections: [{ target: 'cb', sourcePort: 0, targetPort: 0 }] },
    { id: 'cb', type: 'breaker', subtype: 'breaker', tccId: 'abb_tmax_160', voltage: 13800, connections: [{ target: 'xf', sourcePort: 0, targetPort: 0 }] },
    { id: 'xf', type: 'transformer', subtype: 'two_winding', percent_secondary: 5.75, kva_secondary: 1500, volts_primary: 13800, volts_secondary: 480, connections: [{ target: 'bus', sourcePort: 1, targetPort: 0 }] },
    busProps,
  ] }],
};
setOneLine(withPrimaryDevice);
const res = await runArcFlash();
const af = res.bus;
// 480 V arcing current is >10 kA; through the 13.8 kV device it is < 0.5 kA, below the 800 A
// instantaneous setting, so the device must not clear in the 10 ms instantaneous time.
assert.ok(af.calculationInputs.arcingCurrentKA > 5, `arcing ${af.calculationInputs.arcingCurrentKA}`);
assert.notStrictEqual(af.calculationInputs.clearingTimeSource, 'protective-device-instantaneous-setting');
assert.ok(af.clearingTime > 0.05, `clearing time ${af.clearingTime}`);

// Model voltage falls back to the component voltage (4160 V equipment with no kV property)
setOneLine({ activeSheet: 0, sheets: [{ name: 'S2', components: [
  { id: 'mv', type: 'bus', subtype: 'Bus', voltage: 4160, enclosure: 'Box', gap: 104, working_distance: 914, electrode_config: 'VCB',
    z1: { r: 0, x: 0.3 }, z2: { r: 0, x: 0.3 }, z0: { r: 0, x: 0.3 },
    sources: [{ z1: { r: 0, x: 0.3 }, z2: { r: 0, x: 0.3 }, z0: { r: 0, x: 0.3 } }], clearing_time: 0.1 },
] }] });
const mv = (await runArcFlash()).mv;
assert.ok(Math.abs(mv.calculationInputs.voltageKVUsed - 4.16) < 1e-6, `model voltage ${mv.calculationInputs.voltageKVUsed}`);
assert.ok(!(mv.notes || []).some(n => /defaulted to 0\.48 kV/.test(n)));
console.log('arc flash primary-device and voltage fallback tests passed');
