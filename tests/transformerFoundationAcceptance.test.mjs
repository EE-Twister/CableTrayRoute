import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} +/- ${tolerance}`);

function fixture(tap, shift, load = { kw: 30, kvar: 12 }) {
  return { sheets: [{ components: [
    { id: 'S', type: 'bus', busType: 'slack', baseKV: 0.48, Vm: 1, Va: 0 },
    { id: 'L', type: 'bus', busType: 'PQ', baseKV: 0.208, load },
    { id: 'T', type: 'transformer', subtype: 'two_winding', volts_primary: 480, volts_secondary: 208,
      kva: 75, impedance: { r: 0.03, x: 0.08 }, tap: { ratio: tap }, phaseShiftDeg: shift,
      coreLossKw: 0.2, magnetizingKvar: 0.5,
      connections: [{ target: 'L', sourcePort: 1 }, { target: 'S', sourcePort: 0 }] }
  ] }] };
}

// Independently solve E = V + Z conjugate(S/V) per phase, on the 208 V side.
// This quadratic does not use solver voltages, admittance matrices, or production helpers.
function expected(tap, shift, kw = 30, kvar = 12) {
  const r = 0.03 * (208 / 480) ** 2, x = 0.08 * (208 / 480) ** 2;
  const p = kw * 1000 / 3, q = kvar * 1000 / 3, e = 208 / tap;
  const a = e * e / 3 - 2 * (r * p + x * q);
  const b = (r * r + x * x) * (p * p + q * q);
  const w = (a + Math.sqrt(a * a - 4 * b)) / 2;
  const secondaryA = Math.hypot(p, q) / Math.sqrt(w);
  const lossKW = 3 * secondaryA ** 2 * r / 1000 + 0.2 / tap ** 2;
  const lossKvar = 3 * secondaryA ** 2 * x / 1000 + 0.5 / tap ** 2;
  const primaryA = Math.hypot(kw + lossKW, kvar + lossKvar) * 1000 / (Math.sqrt(3) * 480);
  return { secondaryA, primaryA, lossKW, lossKvar, secondaryV: Math.sqrt(3 * w),
    secondaryAngle: shift - Math.atan2(x * p - r * q, w + r * p + x * q) * 180 / Math.PI,
    dropPct: 100 * (e - Math.sqrt(3 * w)) / e };
}

for (const tap of [0.95, 1, 1.05]) {
  for (const shift of [-30, 0, 30]) {
    test(`loaded transformer independently balances power and both currents: tap ${tap}, shift ${shift}`, () => {
      const input = fixture(tap, shift), before = structuredClone(input), target = expected(tap, shift);
      for (const baseMVA of [0.1, 1]) {
        const result = runLoadFlow(buildLoadFlowModel(input), { baseMVA, balanced: true, radialOptimization: false, maxIterations: 100 });
        assert.equal(result.converged, true);
        const line = result.lines.find(row => row.id === 'T');
        const bus = result.buses.find(row => row.id === 'L');
        // At 1 MVA, the established 1e-6 pu P/Q residual allows 1 W per
        // component: sqrt(2) W / (sqrt(3) * 197 V) is approximately 0.0042 A.
        near(line.fromCurrentA, target.primaryA, 0.005, 'primary A');
        near(line.toCurrentA, target.secondaryA, 0.005, 'secondary A');
        near(line.toKV * 1000, target.secondaryV, 0.002, 'secondary V');
        near(bus.Va, target.secondaryAngle, 0.001, 'secondary angle');
        near(line.dropPct, target.dropPct, 0.001, 'voltage drop %');
        near(line.fromPowerKW, 30 + target.lossKW, 0.002, 'primary kW');
        near(line.fromPowerKvar, 12 + target.lossKvar, 0.002, 'primary kvar');
        near(line.toPowerKW, -30, 0.002, 'secondary kW');
        near(line.toPowerKvar, -12, 0.002, 'secondary kvar');
        near(result.losses.P, target.lossKW, 0.002, 'real loss');
        near(result.losses.Q, target.lossKvar, 0.002, 'reactive absorption');
        near(result.summary.totalGenKW, 30 + target.lossKW, 0.002, 'source kW');
        near(result.summary.totalGenKVAR, 12 + target.lossKvar, 0.002, 'source kvar');
        assert.equal(line.amps, line.fromCurrentA);
      }
      assert.deepEqual(input, before);
    });
  }
}

test('unloaded tapped transformer consumes only specified excitation power and has no series drop', () => {
  const input = fixture(1.05, 30, { kw: 0, kvar: 0 });
  const result = runLoadFlow(buildLoadFlowModel(input), { baseMVA: 1, balanced: true, maxIterations: 100 });
  assert.equal(result.converged, true);
  const line = result.lines[0];
  near(line.toCurrentA, 0, 0.003, 'unloaded secondary A');
  near(line.dropPct, 0, 0.001, 'unloaded drop %');
  near(result.losses.P, 0.2 / 1.05 ** 2, 0.002, 'excitation kW');
  near(result.losses.Q, 0.5 / 1.05 ** 2, 0.002, 'excitation kvar');
});
