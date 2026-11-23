/**
 * Balanced load flow checked against an independent complex-number solution
 * of the same radial circuit (fixed-point iteration on the load voltage),
 * for a plain cable feeder and for a 13.8 kV / 480 V transformer.
 */
import assert from 'node:assert';

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { runLoadFlow } = await import('../../analysis/loadFlow.js');
const { buildLoadFlowModel } = await import('../../analysis/loadFlowModel.js');

function it(name, fn) { fn(); console.log('  ✓', name); }

// Per-phase Z (ohm) feeding P + jQ (three-phase kW / kvar) at line voltage vll.
function solveHand({ vll, pKw, qKvar, r, x }) {
  const v0 = vll / Math.sqrt(3);
  let v = { re: v0, im: 0 };
  let current = { re: 0, im: 0 };
  for (let i = 0; i < 300; i += 1) {
    const den = v.re ** 2 + v.im ** 2;
    const s = { re: (pKw * 1e3) / 3, im: (-qKvar * 1e3) / 3 };
    current = { re: (s.re * v.re - s.im * v.im) / den, im: (s.re * v.im + s.im * v.re) / den };
    v = { re: v0 - (r * current.re - x * current.im), im: -(r * current.im + x * current.re) };
  }
  return {
    vpu: Math.hypot(v.re, v.im) / v0,
    angleDeg: (Math.atan2(v.im, v.re) * 180) / Math.PI,
    lossKw: (3 * (current.re ** 2 + current.im ** 2) * r) / 1e3
  };
}

it('cable feeder matches the hand solution at light, medium and heavy load', () => {
  for (const [kw, kvar, r, x] of [[50, 5, 0.01, 0.02], [400, 200, 0.005, 0.01], [800, 400, 0.004, 0.008]]) {
    const model = {
      buses: [{ id: 'src', type: 'slack', baseKV: 0.48 }, { id: 'ld', type: 'PQ', baseKV: 0.48, load: { kw, kvar } }],
      branches: [{ id: 'c1', type: 'cable', from: 'src', to: 'ld', impedance: { r, x } }]
    };
    const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 50 });
    const hand = solveHand({ vll: 480, pKw: kw, qKvar: kvar, r, x });
    const bus = result.buses.find(b => b.id === 'ld');
    assert(result.converged);
    assert(Math.abs(bus.Vm - hand.vpu) < 5e-4, `V ${bus.Vm} vs ${hand.vpu}`);
    assert(Math.abs(bus.Va - hand.angleDeg) < 0.01, `angle ${bus.Va} vs ${hand.angleDeg}`);
    assert(Math.abs(result.losses.P - hand.lossKw) / hand.lossKw < 0.005, `loss ${result.losses.P} vs ${hand.lossKw}`);
  }
});

it('transformer feeder matches the hand solution referred to 480 V', () => {
  for (const [kw, pf, pctZ, xr] of [[1000, 0.9, 5.75, 8], [1300, 0.85, 5.75, 8]]) {
    const kvar = kw * Math.tan(Math.acos(pf));
    const fixture = { sheets: [{ components: [
      { id: 'hv', type: 'slack', subtype: 'Bus', baseKV: 13.8 },
      { id: 'lv', type: 'PQ', subtype: 'Bus', baseKV: 0.48 },
      { id: 'xf', type: 'transformer', subtype: 'two_winding', connections: [{ target: 'hv', sourcePort: 0 }, { target: 'lv', sourcePort: 1 }], voltage_primary: 13.8, voltage_secondary: 0.48, kva_primary: 1500, kva_secondary: 1500, percent_z: pctZ, xr_ratio: xr, tap: { ratio: 1 } },
      { id: 'ld', type: 'load', connections: ['lv'], kw, kvar }
    ] }] };
    const result = runLoadFlow(buildLoadFlowModel(fixture), { baseMVA: 1, balanced: true, maxIterations: 50 });
    const zOhm = (pctZ / 100) * (0.48 ** 2) / 1.5;
    const r = zOhm / Math.sqrt(1 + xr * xr);
    const hand = solveHand({ vll: 480, pKw: kw, qKvar: kvar, r, x: r * xr });
    const bus = result.buses.find(b => b.id === 'lv');
    assert(result.converged);
    assert(Math.abs(bus.Vm - hand.vpu) < 5e-4, `V ${bus.Vm} vs ${hand.vpu}`);
    assert(Math.abs(result.losses.P - hand.lossKw) / hand.lossKw < 0.005, `loss ${result.losses.P} vs ${hand.lossKw}`);
  }
});

it('a transformer with no impedance data is flagged as an ideal tie', () => {
  const fixture = { sheets: [{ components: [
    { id: 'hv', type: 'slack', subtype: 'Bus', baseKV: 13.8 },
    { id: 'lv', type: 'PQ', subtype: 'Bus', baseKV: 0.48 },
    { id: 'xf', type: 'transformer', subtype: 'two_winding', connections: [{ target: 'hv', sourcePort: 0 }, { target: 'lv', sourcePort: 1 }], voltage_primary: 13.8, voltage_secondary: 0.48, kva_primary: 1500, kva_secondary: 1500, tap: { ratio: 1 } },
    { id: 'ld', type: 'load', connections: ['lv'], kw: 500, kvar: 240 }
  ] }] };
  const result = runLoadFlow(buildLoadFlowModel(fixture), { baseMVA: 1, balanced: true });
  assert(result.warnings.some(w => /ideal tie/i.test(w)));
});

console.log('loadflow hand-solution tests passed');
