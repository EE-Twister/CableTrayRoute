/**
 * Motor start screening: full-load current, starter reductions and voltage
 * sag checked against hand calculations for a 100 hp, 480 V motor on a 30 kA
 * bus. The sag identity used is  sag % = I_start / I_short_circuit * 100.
 */
import assert from 'assert';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { calculateMotorStartCase, runMotorStart } = await import('../analysis/motorStartCalc.mjs');
const { setOneLine } = await import('../dataStore.mjs');

function it(name, fn) { fn(); console.log('  ✓', name); }

const V = 480;
const iscA = 30000;
const zPerPhase = V / (Math.sqrt(3) * iscA); // 0.009238 ohm, X/R = 10
const base = {
  id: 'M1', label: 'M1', hp: 100, volts: V, powerFactor: 0.88, efficiency: 0.94,
  inrushMultiple: 6, theveninR: zPerPhase / Math.sqrt(101), theveninX: 10 * zPerPhase / Math.sqrt(101),
  inertia: 5, speedRpm: 1800, type: 'dol',
  vfdCurrentLimitPu: 1.1, initialVoltagePu: 0.3, rampTimeSec: 10, wyeDeltaSwitchTimeSec: 5, autotransformerTap: 0.65,
};
const fla = 100 * 746 / (Math.sqrt(3) * V * 0.88 * 0.94);

it('full-load amps follow the three-phase power equation', () => {
  const r = calculateMotorStartCase(base);
  assert(Math.abs(r.fullLoadAmps - fla) < 0.1, `${r.fullLoadAmps} vs ${fla}`);
});

it('DOL voltage sag equals I_start / I_sc (about 2.2%), not 1/sqrt(3) of it', () => {
  const r = calculateMotorStartCase(base);
  const expected = (6 * fla) / iscA * 100;
  assert(Math.abs(r.voltageSagPct - expected) < 0.02, `${r.voltageSagPct} vs ${expected.toFixed(2)}`);
});

it('starter methods reduce the line current as expected', () => {
  const dol = calculateMotorStartCase(base).inrushKA;
  const near = (a, b) => Math.abs(a - b) < 0.002;
  assert(near(calculateMotorStartCase({ ...base, type: 'wye_delta' }).inrushKA, dol / 3));
  assert(near(calculateMotorStartCase({ ...base, type: 'autotransformer' }).inrushKA, dol * 0.65 * 0.65));
  assert(near(calculateMotorStartCase({ ...base, type: 'soft_starter' }).inrushKA, dol * 0.3));
  assert(near(calculateMotorStartCase({ ...base, type: 'vfd' }).inrushKA, fla * 1.1 / 1000));
});

it('sag scales with the source impedance', () => {
  const weak = calculateMotorStartCase({ ...base, theveninR: base.theveninR * 3, theveninX: base.theveninX * 3 });
  assert(Math.abs(weak.voltageSagPct / calculateMotorStartCase(base).voltageSagPct - 3) < 0.01);
});

it('a weak source fails the 15% default sag criterion and a strong one passes', () => {
  const weak = calculateMotorStartCase({ ...base, theveninR: base.theveninR * 8, theveninX: base.theveninX * 8 });
  assert.strictEqual(weak.status, 'review');
  assert.strictEqual(calculateMotorStartCase(base).status, 'pass');
});

it('missing source impedance is reported as an input error, not a 0% sag', () => {
  const r = calculateMotorStartCase({ ...base, theveninR: 0, theveninX: 0 });
  assert.strictEqual(r.ready, false);
  assert(r.errors.includes('Thevenin R or X'));
});

it('runMotorStart reports sag as not computed when no Thevenin impedance is given', () => {
  setOneLine({ activeSheet: 0, sheets: [{ name: 'S', components: [
    { id: 'MTR', type: 'motor_load', subtype: 'motor_load', rating: 100, voltage: 480, pf: 0.88, efficiency: 0.94, inrushMultiple: 6, inertia: 5 },
    { id: 'MTR2', type: 'motor_load', subtype: 'motor_load', rating: 100, voltage: 480, pf: 0.88, efficiency: 0.94, inrushMultiple: 6, inertia: 5, thevenin_r: 0.0009, thevenin_x: 0.0092 }
  ] }] });
  const results = runMotorStart();
  assert.strictEqual(results.MTR.voltageSagPct, null);
  assert(results.MTR.requiredInputs.length === 1);
  assert(results.MTR2.voltageSagPct > 1.5 && results.MTR2.voltageSagPct < 3.5, `${results.MTR2.voltageSagPct}`);
});

console.log('motorStartCalc tests passed');
