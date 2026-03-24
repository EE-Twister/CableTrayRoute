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

// ---------------------------------------------------------------------------
// Starter type profile helpers — extracted from analysis/motorStart.js
// ---------------------------------------------------------------------------

/** Returns effective inrush current for a given starter type at time t. */
function effectiveInrush(Ilr, Ifl, profile, time) {
  if (profile.type === 'vfd') {
    return Ifl * profile.vfdCurrentLimitPu;
  }
  if (profile.type === 'soft_starter') {
    const rampFrac = Math.min(time / profile.rampTimeSec, 1.0);
    const vRamp = profile.initialVoltagePu + (1.0 - profile.initialVoltagePu) * rampFrac;
    return Ilr * vRamp * vRamp;
  }
  if (profile.type === 'wye_delta') {
    return time < profile.wyeDeltaSwitchTimeSec ? Ilr / 3 : Ilr;
  }
  if (profile.type === 'autotransformer') {
    return Ilr * profile.autotransformerTap * profile.autotransformerTap;
  }
  return Ilr; // dol
}

/** Build a profile with defaults matching analysis/motorStart.js getStarterProfile. */
function makeProfile(type, overrides = {}) {
  return {
    type,
    vfdCurrentLimitPu: 1.1,
    initialVoltagePu: 0.3,
    rampTimeSec: 10,
    wyeDeltaSwitchTimeSec: 5,
    autotransformerTap: 0.65,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe('getStarterProfile — VFD', () => {
  it('VFD inrush is vfd_current_limit_pu × Ifl (default 1.1×), far less than DOL 6× Ifl', () => {
    const Ifl = fullLoadCurrent(100, 480, 0.9, 0.9);
    const Ilr = lockedRotorCurrent(Ifl, 6);
    const profile = makeProfile('vfd');
    const vfdInrush = effectiveInrush(Ilr, Ifl, profile, 0);
    const dolInrush = effectiveInrush(Ilr, Ifl, makeProfile('dol'), 0);
    assert.ok(vfdInrush < dolInrush / 4, `VFD inrush ${vfdInrush.toFixed(1)} A should be << DOL ${dolInrush.toFixed(1)} A`);
  });

  it('VFD inrush equals exactly Ifl × vfd_current_limit_pu', () => {
    const Ifl = 100;
    const Ilr = 600;
    const profile = makeProfile('vfd', { vfdCurrentLimitPu: 1.5 });
    const inrush = effectiveInrush(Ilr, Ifl, profile, 0);
    assert.ok(approxEqual(inrush, 150, 1e-9), `Got ${inrush}`);
  });
});

// ---------------------------------------------------------------------------
describe('getStarterProfile — Soft Starter', () => {
  it('at t=0 inrush is initialVoltagePu² × Ilr', () => {
    const Ilr = 600;
    const Ifl = 100;
    const profile = makeProfile('soft_starter', { initialVoltagePu: 0.3, rampTimeSec: 10 });
    const inrush0 = effectiveInrush(Ilr, Ifl, profile, 0);
    const expected = Ilr * 0.3 * 0.3;
    assert.ok(approxEqual(inrush0, expected, 0.01), `Got ${inrush0.toFixed(2)}, expected ${expected.toFixed(2)}`);
  });

  it('at t=rampTimeSec inrush equals full DOL inrush', () => {
    const Ilr = 600;
    const Ifl = 100;
    const profile = makeProfile('soft_starter', { initialVoltagePu: 0.3, rampTimeSec: 10 });
    const inrushFull = effectiveInrush(Ilr, Ifl, profile, 10);
    assert.ok(approxEqual(inrushFull, Ilr, 1e-9), `Got ${inrushFull}`);
  });

  it('inrush increases monotonically during ramp', () => {
    const Ilr = 600;
    const Ifl = 100;
    const profile = makeProfile('soft_starter', { initialVoltagePu: 0.3, rampTimeSec: 10 });
    const i0  = effectiveInrush(Ilr, Ifl, profile, 0);
    const i5  = effectiveInrush(Ilr, Ifl, profile, 5);
    const i10 = effectiveInrush(Ilr, Ifl, profile, 10);
    assert.ok(i0 < i5 && i5 < i10, `Not monotonic: ${i0.toFixed(1)} ${i5.toFixed(1)} ${i10.toFixed(1)}`);
  });
});

// ---------------------------------------------------------------------------
describe('getStarterProfile — Wye-Delta', () => {
  it('before switch time inrush is exactly Ilr / 3', () => {
    const Ilr = 600;
    const profile = makeProfile('wye_delta', { wyeDeltaSwitchTimeSec: 5 });
    const inrushWye = effectiveInrush(Ilr, 100, profile, 0);
    assert.ok(approxEqual(inrushWye, Ilr / 3, 1e-9), `Got ${inrushWye}`);
  });

  it('after switch time inrush equals full DOL inrush', () => {
    const Ilr = 600;
    const profile = makeProfile('wye_delta', { wyeDeltaSwitchTimeSec: 5 });
    const inrushDelta = effectiveInrush(Ilr, 100, profile, 5);
    assert.ok(approxEqual(inrushDelta, Ilr, 1e-9), `Got ${inrushDelta}`);
  });
});

// ---------------------------------------------------------------------------
describe('getStarterProfile — Autotransformer', () => {
  it('default 0.65 tap reduces inrush to 0.65² = 0.4225 of DOL', () => {
    const Ilr = 600;
    const profile = makeProfile('autotransformer', { autotransformerTap: 0.65 });
    const inrush = effectiveInrush(Ilr, 100, profile, 0);
    const expected = Ilr * 0.65 * 0.65;
    assert.ok(approxEqual(inrush, expected, 1e-9), `Got ${inrush.toFixed(2)}, expected ${expected.toFixed(2)}`);
  });

  it('custom 0.80 tap gives 64% of DOL inrush', () => {
    const Ilr = 1000;
    const profile = makeProfile('autotransformer', { autotransformerTap: 0.80 });
    const inrush = effectiveInrush(Ilr, 100, profile, 0);
    assert.ok(approxEqual(inrush / Ilr, 0.64, 1e-9), `Ratio ${inrush / Ilr}`);
  });

  it('autotransformer inrush is always less than DOL inrush for tap < 1', () => {
    const Ilr = 600;
    const profile = makeProfile('autotransformer', { autotransformerTap: 0.50 });
    const inrush = effectiveInrush(Ilr, 100, profile, 0);
    assert.ok(inrush < Ilr, `Expected inrush (${inrush}) < Ilr (${Ilr})`);
  });
});
