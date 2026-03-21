/**
 * Tests for analysis/transientStability.mjs
 *
 * Verifies swing equation integration, CCT bisection, and EAC calculations
 * against known textbook results for the OMIB model.
 */
import assert from 'assert';
import {
  initialRotorAngle,
  simulateSwingEquation,
  findCriticalClearingTime,
  equalAreaCriterion,
} from '../analysis/transientStability.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// Reference system: Kundur Example 13.1 (simplified)
// H=5, f=60, Pm=1.0, Pmax_pre=2.1, Pmax_fault=0.6, Pmax_post=1.75
const BASE = {
  H: 5.0, f: 60, Pm: 1.0,
  Pmax_pre: 2.1, Pmax_fault: 0.6, Pmax_post: 1.75,
  t_end: 2.0,
};

// ---------------------------------------------------------------------------
describe('initialRotorAngle', () => {
  it('δ₀ = arcsin(1.0/2.1) ≈ 28.5°', () => {
    const d = initialRotorAngle(1.0, 2.1);
    const deg = (d * 180) / Math.PI;
    assert.ok(Math.abs(deg - 28.44) < 0.1, `Expected ~28.44°, got ${deg.toFixed(2)}°`);
  });

  it('throws when Pm > Pmax', () => {
    assert.throws(
      () => initialRotorAngle(2.5, 2.0),
      /exceeds/i
    );
  });

  it('returns 90° for Pm = Pmax', () => {
    const d = initialRotorAngle(1.0, 1.0);
    assert.ok(Math.abs(d - Math.PI / 2) < 1e-9);
  });
});

// ---------------------------------------------------------------------------
describe('simulateSwingEquation — stable case', () => {
  const delta0 = initialRotorAngle(BASE.Pm, BASE.Pmax_pre);
  const stableResult = simulateSwingEquation({
    ...BASE, delta0, t_fault: 0, t_clear: 0.08,
  });

  it('returns time, delta, omega arrays', () => {
    assert.ok(stableResult.time.length > 10);
    assert.ok(stableResult.delta.length === stableResult.time.length);
    assert.ok(stableResult.omega.length === stableResult.time.length);
  });

  it('initial delta matches delta0', () => {
    assert.ok(Math.abs(stableResult.delta[0] - delta0) < 1e-10);
  });

  it('short clearing time yields stable result', () => {
    assert.strictEqual(stableResult.stable, true);
    assert.strictEqual(stableResult.t_unstable, null);
  });

  it('max angle is less than 180° for stable case', () => {
    assert.ok(stableResult.deltaMax_deg < 180);
  });
});

// ---------------------------------------------------------------------------
describe('simulateSwingEquation — unstable case', () => {
  const delta0 = initialRotorAngle(BASE.Pm, BASE.Pmax_pre);
  const unstableResult = simulateSwingEquation({
    ...BASE, delta0, t_fault: 0, t_clear: 1.0,
  });

  it('long clearing time yields unstable result', () => {
    assert.strictEqual(unstableResult.stable, false);
    assert.ok(unstableResult.t_unstable !== null);
  });

  it('max angle exceeds 180°', () => {
    assert.ok(unstableResult.deltaMax_deg >= 180);
  });
});

// ---------------------------------------------------------------------------
describe('simulateSwingEquation — zero fault power', () => {
  it('bolted fault (Pmax_fault=0) still solves without error', () => {
    const delta0 = initialRotorAngle(BASE.Pm, BASE.Pmax_pre);
    const r = simulateSwingEquation({
      ...BASE, Pmax_fault: 0, delta0, t_fault: 0, t_clear: 0.05,
    });
    assert.ok(Array.isArray(r.time) || r.time instanceof Float64Array);
  });
});

// ---------------------------------------------------------------------------
describe('findCriticalClearingTime', () => {
  const delta0 = initialRotorAngle(BASE.Pm, BASE.Pmax_pre);

  it('CCT is between 0 and 2 s', () => {
    const cct = findCriticalClearingTime({ ...BASE, delta0, t_fault: 0 });
    assert.ok(cct.cct_s > 0 && cct.cct_s < 2.0,
      `CCT out of range: ${cct.cct_s}`);
  });

  it('system is stable at CCT - 0.01 and unstable at CCT + 0.05', () => {
    const cct = findCriticalClearingTime({ ...BASE, delta0, t_fault: 0 });
    const stableCheck = simulateSwingEquation({
      ...BASE, delta0, t_fault: 0, t_clear: Math.max(0.001, cct.cct_s - 0.01),
    });
    const unstableCheck = simulateSwingEquation({
      ...BASE, delta0, t_fault: 0, t_clear: cct.cct_s + 0.05,
    });
    assert.ok(stableCheck.stable, `Expected stable at CCT-0.01s`);
    assert.ok(!unstableCheck.stable, `Expected unstable at CCT+0.05s`);
  });

  it('CCT in cycles = CCT_s × f', () => {
    const cct = findCriticalClearingTime({ ...BASE, delta0, t_fault: 0 });
    assert.ok(Math.abs(cct.cct_cycles - cct.cct_s * BASE.f) < 0.2);
  });
});

// ---------------------------------------------------------------------------
describe('equalAreaCriterion', () => {
  it('returns feasible result for standard inputs', () => {
    const eac = equalAreaCriterion(BASE);
    assert.strictEqual(eac.feasible, true);
    assert.ok(Number.isFinite(eac.delta0_deg));
    assert.ok(Number.isFinite(eac.deltaCr_deg));
    assert.ok(Number.isFinite(eac.deltaMax_deg));
    assert.ok(Number.isFinite(eac.eac_cct_s));
  });

  it('δ_cr is between δ₀ and δ_max', () => {
    const eac = equalAreaCriterion(BASE);
    assert.ok(eac.deltaCr_deg > eac.delta0_deg,
      `deltaCr (${eac.deltaCr_deg}°) should be > delta0 (${eac.delta0_deg}°)`);
    assert.ok(eac.deltaCr_deg < eac.deltaMax_deg,
      `deltaCr (${eac.deltaCr_deg}°) should be < deltaMax (${eac.deltaMax_deg}°)`);
  });

  it('δ_max = π - arcsin(Pm/Pmax_post)', () => {
    const eac = equalAreaCriterion(BASE);
    const expected = 180 - Math.asin(BASE.Pm / BASE.Pmax_post) * 180 / Math.PI;
    assert.ok(Math.abs(eac.deltaMax_deg - expected) < 0.01,
      `Expected deltaMax ≈ ${expected.toFixed(2)}°, got ${eac.deltaMax_deg}°`);
  });

  it('infeasible when post-fault Pmax < Pm', () => {
    const eac = equalAreaCriterion({ ...BASE, Pmax_post: 0.5 });
    assert.strictEqual(eac.feasible, false);
  });

  it('EAC CCT is in the same order of magnitude as numerical CCT', () => {
    const eac = equalAreaCriterion(BASE);
    const delta0 = initialRotorAngle(BASE.Pm, BASE.Pmax_pre);
    const cct = findCriticalClearingTime({ ...BASE, delta0, t_fault: 0 });
    // EAC is an approximation; allow ±50% tolerance
    const ratio = eac.eac_cct_s / cct.cct_s;
    assert.ok(ratio > 0.5 && ratio < 2.0,
      `EAC CCT ${eac.eac_cct_s.toFixed(4)}s vs numerical ${cct.cct_s.toFixed(4)}s (ratio ${ratio.toFixed(2)})`);
  });
});
