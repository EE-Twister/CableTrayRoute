import assert from 'assert';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { runShortCircuit } from '../analysis/shortCircuit.mjs';
import { evaluateConduitFill } from '../analysis/conduitFill.mjs';
import { evaluateTrayFill } from '../analysis/trayFill.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

function exactTwoBusVoltageMagnitude({ p, q, r, x }) {
  // From |V|² = conj(V) - Z*conj(S), with the slack voltage fixed at 1∠0 pu:
  // u² + (2a - 1)u + a² + b² = 0, u = |V|²,
  // a = RP + XQ and b = XP - RQ. Select the high-voltage root.
  const a = (r * p) + (x * q);
  const b = (x * p) - (r * q);
  const coefficient = (2 * a) - 1;
  const discriminant = (coefficient ** 2) - (4 * ((a ** 2) + (b ** 2)));
  const voltageSquared = (-coefficient + Math.sqrt(discriminant)) / 2;
  return Math.sqrt(voltageSquared);
}

describe('independently derived engineering evidence benchmarks', () => {
  it('matches the load-flow solver to the exact two-bus quadratic', () => {
    const result = runLoadFlow({
      buses: [
        { id: 'S', type: 'slack', baseKV: 13.8, Vm: 1, Va: 0 },
        { id: 'L', type: 'PQ', baseKV: 13.8, load: { kw: 1000, kvar: 400 } },
      ],
      branches: [
        { id: 'F', from: 'S', to: 'L', impedance: { r: 0.01, x: 0.04 } },
      ],
    }, { baseMVA: 100 });

    const impedanceBaseOhm = (13.8 ** 2) / 100;
    const expected = exactTwoBusVoltageMagnitude({
      p: 0.01,
      q: 0.004,
      r: 0.01 / impedanceBaseOhm,
      x: 0.04 / impedanceBaseOhm,
    });
    const actual = result.buses.find(bus => bus.id === 'L')?.Vm;
    assert.strictEqual(result.converged, true);
    assert.ok(Math.abs(actual - expected) < 1e-6, `solver ${actual}; exact ${expected}`);
    assert.ok(Math.abs(expected - 0.9998634375) < 1e-10);
  });

  it('matches the ANSI path to separate Thevenin and symmetrical-component arithmetic', () => {
    const voltageKV = 13.8;
    const z1 = { r: 0.01, x: 0.10 };
    const z2 = { r: 0.01, x: 0.10 };
    const z0 = { r: 0.03, x: 0.30 };
    const xr = 10;
    const magnitude = z => Math.hypot(z.r, z.x);
    const phaseVoltageKV = voltageKV / Math.sqrt(3);
    const expectedThreePhaseKA = phaseVoltageKV / magnitude(z1);
    const sequenceSum = { r: z1.r + z2.r + z0.r, x: z1.x + z2.x + z0.x };
    const expectedLineToGroundKA = (3 * phaseVoltageKV) / magnitude(sequenceSum);
    const expectedAsymmetricalPeakKA = expectedThreePhaseKA * Math.SQRT2 * (1 + Math.exp(-Math.PI / xr));

    const actual = runShortCircuit([{
      id: 'ANSI-BUS', type: 'bus', subtype: 'Bus', kV: voltageKV,
      z1, z2, z0, xr_ratio: xr, v_factor: 1, method: 'ANSI',
    }], { method: 'ANSI' })['ANSI-BUS'];

    assert.ok(Math.abs(actual.threePhaseKA - expectedThreePhaseKA) < 0.01);
    assert.ok(Math.abs(actual.lineToGroundKA - expectedLineToGroundKA) < 0.01);
    assert.ok(Math.abs(actual.asymKA - expectedAsymmetricalPeakKA) < 0.01);
  });

  it('applies NEC 2023 Chapter 9 count limits and cable-area arithmetic', () => {
    const conduit = { conduit_id: 'EMT-1', conduit_type: 'EMT', trade_size: '1/2' };
    const cable = { name: 'C-1', cable_od: 0.4 };
    const one = evaluateConduitFill(conduit, [cable]);
    const two = evaluateConduitFill(conduit, [cable, cable]);
    const three = evaluateConduitFill(conduit, [cable, cable, cable]);
    const expectedOneCableFill = (Math.PI * (0.4 / 2) ** 2 / 0.304) * 100;

    assert.strictEqual(one.fillLimit, 0.53);
    assert.strictEqual(two.fillLimit, 0.31);
    assert.strictEqual(three.fillLimit, 0.40);
    assert.ok(Math.abs(one.fillPercent - expectedOneCableFill) < 1e-10);
    assert.ok(Math.abs(one.fillPercent - 41.336745) < 0.0001);
  });

  it('applies the NEC 2023 Article 392 mixed-cable diameter penalty at its boundary', () => {
    const tray = { tray_type: 'Ladder', inside_width: 12, tray_depth: 6 };
    const large = {
      tag: 'LARGE', cable_type: 'Power', conductors: 3,
      conductor_size: '4/0 AWG', cable_area: Math.PI,
    };
    const atBoundary = evaluateTrayFill(tray, [
      large,
      { tag: 'SMALL', cable_type: 'Power', conductors: 3, conductor_size: '#2 AWG', cable_area: 11.6 },
    ]);
    const aboveBoundary = evaluateTrayFill(tray, [
      large,
      { tag: 'SMALL', cable_type: 'Power', conductors: 3, conductor_size: '#2 AWG', cable_area: 11.601 },
    ]);

    assert.equal(atBoundary.allowable.baseTableAreaIn2, 14);
    assert.ok(Math.abs(atBoundary.allowable.diameterPenaltyIn2 - 2.4) < 1e-10);
    assert.ok(Math.abs(atBoundary.allowable.smallCableAreaIn2 - 11.6) < 1e-10);
    assert.equal(atBoundary.status, 'pass');
    assert.equal(aboveBoundary.status, 'fail');
  });
});
