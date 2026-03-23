/**
 * Tests for the motor-starting calculation formulas used in analysis/motorStart.js.
 *
 * Because motorStart.js imports d3 from a CDN URL that is not resolvable in
 * Node.js, the pure mathematical functions are verified here in isolation.
 * The formulas are extracted verbatim from the module implementation.
 */
import assert from 'assert';

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

function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// Formula helpers extracted from analysis/motorStart.js
// ---------------------------------------------------------------------------

/** Full-load current (A) for a three-phase motor. */
function fullLoadCurrent(hp, V, pf, eff) {
  return (hp * 746) / (Math.sqrt(3) * V * pf * eff);
}

/** Locked-rotor (inrush) current. */
function lockedRotorCurrent(Ifl, inrushMultiple) {
  return Ifl * inrushMultiple;
}

/** Voltage sag percentage given drop across Thevenin impedance. */
function voltageSagPct(Vdrop, V) {
  return (Vdrop / V) * 100;
}

/** Synchronous angular velocity (rad/s). */
function syncOmega(rpm) {
  return 2 * Math.PI * rpm / 60;
}

/**
 * Base torque for steady-state rated operation.
 * T = P / ω_sync
 */
function baseTorque(hp, rpm) {
  if (!hp || !rpm) return 0;
  return (hp * 746) / syncOmega(rpm);
}

/**
 * Thevenin impedance magnitude.
 */
function theveninImpedance(R, X) {
  return Math.hypot(R, X);
}

/**
 * Simplified slip-torque product used in motor dynamics:
 *   Tm ≈ T_base × (Vterm/V)² × slip
 */
function motorTorque(Tbase, Vterm, V, slip) {
  return Tbase * (Vterm / V) * (Vterm / V) * slip;
}

// ---------------------------------------------------------------------------
describe('fullLoadCurrent', () => {
  it('100 hp, 480 V, pf=0.9, eff=0.9 ≈ 110.6 A', () => {
    const Ifl = fullLoadCurrent(100, 480, 0.9, 0.9);
    // 100*746 / (sqrt(3)*480*0.81) ≈ 110.56 A
    assert.ok(approxEqual(Ifl, 110.56, 0.5), `Got ${Ifl.toFixed(2)}`);
  });

  it('scales linearly with horsepower', () => {
    const I50  = fullLoadCurrent(50,  480, 0.9, 0.9);
    const I100 = fullLoadCurrent(100, 480, 0.9, 0.9);
    assert.ok(approxEqual(I100 / I50, 2, 1e-9), `Ratio ${I100 / I50}`);
  });

  it('scales inversely with voltage', () => {
    const I480  = fullLoadCurrent(100, 480,  0.9, 0.9);
    const I4160 = fullLoadCurrent(100, 4160, 0.9, 0.9);
    assert.ok(approxEqual(I480 / I4160, 4160 / 480, 1e-6),
      `Expected ratio ${4160/480}, got ${I480/I4160}`);
  });

  it('zero voltage returns Infinity (division by zero guard needed in module)', () => {
    const Ifl = fullLoadCurrent(100, 0, 0.9, 0.9);
    assert.ok(!Number.isFinite(Ifl));
  });
});

// ---------------------------------------------------------------------------
describe('lockedRotorCurrent', () => {
  it('default 6× inrush gives 6× full-load current', () => {
    const Ifl = 100;
    assert.strictEqual(lockedRotorCurrent(Ifl, 6), 600);
  });

  it('7.5× inrush multiple is preserved', () => {
    const Ifl = fullLoadCurrent(100, 480, 0.9, 0.9);
    const Ilr = lockedRotorCurrent(Ifl, 7.5);
    assert.ok(approxEqual(Ilr / Ifl, 7.5, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('voltageSagPct', () => {
  it('10 V drop on 100 V → 10%', () => {
    assert.strictEqual(voltageSagPct(10, 100), 10);
  });

  it('no drop → 0%', () => {
    assert.strictEqual(voltageSagPct(0, 480), 0);
  });

  it('sag percentage is proportional to drop', () => {
    const sag1 = voltageSagPct(24, 480);
    const sag2 = voltageSagPct(48, 480);
    assert.ok(approxEqual(sag2 / sag1, 2, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('syncOmega', () => {
  it('1800 rpm → 60π rad/s ≈ 188.5 rad/s', () => {
    const w = syncOmega(1800);
    assert.ok(approxEqual(w, 60 * Math.PI, 1e-9), `Got ${w}`);
  });

  it('3600 rpm is double 1800 rpm', () => {
    const w1 = syncOmega(1800);
    const w2 = syncOmega(3600);
    assert.ok(approxEqual(w2 / w1, 2, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('baseTorque', () => {
  it('100 hp at 1800 rpm ≈ 396 N·m', () => {
    const T = baseTorque(100, 1800);
    // 100*746 / (2π*30) = 74600 / 188.5 ≈ 395.8
    assert.ok(approxEqual(T, 395.8, 1), `Got ${T.toFixed(1)}`);
  });

  it('returns 0 for zero horsepower', () => {
    assert.strictEqual(baseTorque(0, 1800), 0);
  });

  it('returns 0 for zero rpm', () => {
    assert.strictEqual(baseTorque(100, 0), 0);
  });

  it('scales linearly with hp', () => {
    const T50  = baseTorque(50,  1800);
    const T100 = baseTorque(100, 1800);
    assert.ok(approxEqual(T100 / T50, 2, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('theveninImpedance', () => {
  it('3-4-5 right triangle gives |Z| = 5', () => {
    assert.ok(approxEqual(theveninImpedance(3, 4), 5, 1e-9));
  });

  it('purely resistive: Z = R', () => {
    assert.ok(approxEqual(theveninImpedance(10, 0), 10, 1e-9));
  });

  it('purely reactive: Z = X', () => {
    assert.ok(approxEqual(theveninImpedance(0, 7), 7, 1e-9));
  });
});

// ---------------------------------------------------------------------------
describe('motorTorque', () => {
  it('full voltage, slip=1 → T = Tbase', () => {
    const Tbase = 400;
    const Tm = motorTorque(Tbase, 480, 480, 1.0);
    assert.ok(approxEqual(Tm, Tbase, 1e-9));
  });

  it('half voltage reduces torque to 25% (V² dependency)', () => {
    const Tbase = 400;
    const Tm_full = motorTorque(Tbase, 480, 480, 1.0);
    const Tm_half = motorTorque(Tbase, 240, 480, 1.0);
    assert.ok(approxEqual(Tm_half / Tm_full, 0.25, 1e-9),
      `Expected 0.25, got ${Tm_half / Tm_full}`);
  });

  it('zero slip → zero torque', () => {
    const Tm = motorTorque(400, 480, 480, 0);
    assert.strictEqual(Tm, 0);
  });
});
