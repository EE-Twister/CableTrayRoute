/**
 * Tests for analysis/derInterconnect.mjs
 *
 * Run with:  node tests/derInterconnect.test.mjs
 *
 * Reference values verified against IEEE 1547-2018, IEEE 1547a-2020, and ANSI C84.1-2020.
 */

import assert from 'assert';
import {
  checkPCCVoltage,
  checkFaultImpact,
  checkAntiIslanding,
  checkRideThrough,
  checkHarmonicsCompliance,
  runDERInterconnectStudy,
  ANSI_C84_1,
  ISLANDING_TRIP_TIME_LIMITS_S,
  VOLTAGE_RIDE_THROUGH,
  FREQUENCY_RIDE_THROUGH,
  HARMONIC_CURRENT_LIMITS_PCT,
} from '../analysis/derInterconnect.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`    ✓ ${name}`);
  } catch (err) {
    console.error(`    ✗ ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

function approx(actual, expected, tol = 0.001, label = '') {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.0001,
    `${label}Expected ≈${expected}, got ${actual} (rel ${(rel * 100).toFixed(4)}%)`
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('ANSI_C84_1 Range A limits are 0.95 and 1.05', () => {
    assert.strictEqual(ANSI_C84_1.rangeA.min, 0.95);
    assert.strictEqual(ANSI_C84_1.rangeA.max, 1.05);
  });

  it('ANSI_C84_1 Range B limits are 0.917 and 1.083', () => {
    assert.strictEqual(ANSI_C84_1.rangeB.min, 0.917);
    assert.strictEqual(ANSI_C84_1.rangeB.max, 1.083);
  });

  it('Anti-islanding trip time limits are 2.0, 1.0, 0.16 s', () => {
    assert.strictEqual(ISLANDING_TRIP_TIME_LIMITS_S.A, 2.0);
    assert.strictEqual(ISLANDING_TRIP_TIME_LIMITS_S.B, 1.0);
    assert.strictEqual(ISLANDING_TRIP_TIME_LIMITS_S.C, 0.16);
  });

  it('IEEE 1547 Table 2 THD limit is 5%', () => {
    assert.strictEqual(HARMONIC_CURRENT_LIMITS_PCT.thd, 5.0);
  });
});

// ---------------------------------------------------------------------------
// checkPCCVoltage
// ---------------------------------------------------------------------------

describe('checkPCCVoltage()', () => {
  it('nominal case — small DER, unity PF → Range A pass', () => {
    // 500 kW DER, 100 MVA SC, R=0.01 pu, X=0.05 pu
    // P_pu = 0.5/100 = 0.005; Q_pu = 0
    // ΔV = (0.005 × 0.01) / 1 = 0.00005 pu → tiny rise
    const r = checkPCCVoltage({ v_pcc_pu: 1.0, der_rated_kW: 500, der_rated_kVAR: 0, sc_MVA: 100, r_pu: 0.01, x_pu: 0.05 });
    assert.ok(r.rangeA_pass, 'Expected Range A pass for small DER on stiff grid');
    assert.ok(r.rangeB_pass, 'Expected Range B pass');
    assert.ok(r.pass, 'Overall pass expected');
  });

  it('delta_v_pct is proportional to P and R', () => {
    const r1 = checkPCCVoltage({ der_rated_kW: 1000, sc_MVA: 10, r_pu: 0.1, x_pu: 0.0 });
    const r2 = checkPCCVoltage({ der_rated_kW: 2000, sc_MVA: 10, r_pu: 0.1, x_pu: 0.0 });
    // Doubling P should roughly double ΔV (linearized)
    approx(r2.delta_v_pct / r1.delta_v_pct, 2.0, 0.01, 'Voltage rise ratio: ');
  });

  it('large DER on weak grid may violate Range A', () => {
    // 10 MW DER on 5 MVA SC grid with high R
    const r = checkPCCVoltage({ v_pcc_pu: 1.0, der_rated_kW: 10000, sc_MVA: 5, r_pu: 0.5, x_pu: 0.0 });
    assert.ok(!r.rangeA_pass, 'Expected Range A failure for large DER on weak grid');
  });

  it('capacitive reactive injection raises voltage further', () => {
    const rNoQ = checkPCCVoltage({ der_rated_kW: 1000, der_rated_kVAR: 0, sc_MVA: 20, r_pu: 0.0, x_pu: 0.1 });
    const rPosQ = checkPCCVoltage({ der_rated_kW: 1000, der_rated_kVAR: 500, sc_MVA: 20, r_pu: 0.0, x_pu: 0.1 });
    assert.ok(rPosQ.v_with_der_pu > rNoQ.v_with_der_pu, 'Capacitive injection should raise voltage');
  });

  it('throws for non-positive der_rated_kW', () => {
    assert.throws(() => checkPCCVoltage({ der_rated_kW: 0, sc_MVA: 100 }), /der_rated_kW must be > 0/);
  });

  it('throws for non-positive sc_MVA', () => {
    assert.throws(() => checkPCCVoltage({ der_rated_kW: 500, sc_MVA: 0 }), /sc_MVA must be > 0/);
  });

  it('returns correctly rounded v_with_der_pu (4 decimal places)', () => {
    const r = checkPCCVoltage({ der_rated_kW: 500, sc_MVA: 100, r_pu: 0.01 });
    assert.ok(String(r.v_with_der_pu).split('.')[1].length <= 4, 'Should be rounded to ≤4 decimal places');
  });
});

// ---------------------------------------------------------------------------
// checkFaultImpact
// ---------------------------------------------------------------------------

describe('checkFaultImpact()', () => {
  it('nominal case — small IBR contribution, device is not overloaded', () => {
    // 500 kVA IBR, 12.47 kV, k=1.1 → I_rated = 500k/(√3×12.47k) ≈ 23.14 A
    const r = checkFaultImpact({
      der_rated_kVA: 500,
      v_ll_kV: 12.47,
      existing_fault_kA: 5.0,
      device_interrupting_kA: 16.0,
      k_limit: 1.1,
    });
    assert.ok(r.pass, 'Small IBR on high-voltage feeder should pass');
    assert.ok(r.total_fault_kA > 5.0, 'Total fault should exceed existing fault');
    assert.ok(r.ibr_fault_A > 0, 'IBR fault current should be positive');
  });

  it('I_rated formula: S/(√3 × V_LL)', () => {
    const r = checkFaultImpact({
      der_rated_kVA: 1000,
      v_ll_kV: 0.480,
      existing_fault_kA: 1.0,
      device_interrupting_kA: 30.0,
      k_limit: 1.0,
    });
    // I_rated = 1000000 / (√3 × 480) ≈ 1202.8 A
    approx(r.ibr_rated_A, 1202.8, 0.005, 'Rated current at 480 V: ');
  });

  it('k_limit scales fault current proportionally', () => {
    const base = checkFaultImpact({ der_rated_kVA: 1000, v_ll_kV: 4.16, existing_fault_kA: 2.0, device_interrupting_kA: 20.0, k_limit: 1.0 });
    const scaled = checkFaultImpact({ der_rated_kVA: 1000, v_ll_kV: 4.16, existing_fault_kA: 2.0, device_interrupting_kA: 20.0, k_limit: 1.2 });
    approx(scaled.ibr_fault_A / base.ibr_fault_A, 1.2, 0.001, 'Fault current scale factor: ');
  });

  it('fails when total fault exceeds device interrupting rating', () => {
    // Large IBR at low voltage
    const r = checkFaultImpact({
      der_rated_kVA: 50000,
      v_ll_kV: 0.480,
      existing_fault_kA: 14.0,
      device_interrupting_kA: 16.0,
      k_limit: 1.2,
    });
    assert.ok(!r.pass, 'Should fail when total exceeds device rating');
    assert.ok(r.interrupting_margin_pct < 0, 'Margin should be negative when overloaded');
  });

  it('throws for non-positive der_rated_kVA', () => {
    assert.throws(() => checkFaultImpact({ der_rated_kVA: 0, v_ll_kV: 12.47, existing_fault_kA: 5, device_interrupting_kA: 16 }), /der_rated_kVA must be > 0/);
  });

  it('throws for non-positive v_ll_kV', () => {
    assert.throws(() => checkFaultImpact({ der_rated_kVA: 500, v_ll_kV: 0, existing_fault_kA: 5, device_interrupting_kA: 16 }), /v_ll_kV must be > 0/);
  });
});

// ---------------------------------------------------------------------------
// checkAntiIslanding
// ---------------------------------------------------------------------------

describe('checkAntiIslanding()', () => {
  it('Category A with 2.0 s trip time — exactly at limit → pass', () => {
    const r = checkAntiIslanding({ category: 'A', trip_time_s: 2.0, monitoring_type: 'active' });
    assert.ok(r.trip_time_compliant, 'Exactly at limit should pass');
    assert.ok(r.pass);
  });

  it('Category A with 2.01 s trip time — exceeds limit → fail', () => {
    const r = checkAntiIslanding({ category: 'A', trip_time_s: 2.01, monitoring_type: 'active' });
    assert.ok(!r.trip_time_compliant, 'Slightly over limit should fail');
    assert.ok(!r.pass);
  });

  it('Category B with 1.0 s trip time — exactly at limit → pass', () => {
    const r = checkAntiIslanding({ category: 'B', trip_time_s: 1.0, monitoring_type: 'passive' });
    assert.ok(r.trip_time_compliant);
    assert.ok(r.pass);
  });

  it('Category B with 1.5 s trip time — exceeds limit → fail', () => {
    const r = checkAntiIslanding({ category: 'B', trip_time_s: 1.5, monitoring_type: 'active' });
    assert.ok(!r.trip_time_compliant);
  });

  it('Category C with 0.16 s trip time — exactly at limit → pass', () => {
    const r = checkAntiIslanding({ category: 'C', trip_time_s: 0.16, monitoring_type: 'active' });
    assert.ok(r.trip_time_compliant);
  });

  it('Category C with 0.20 s trip time — exceeds limit → fail', () => {
    const r = checkAntiIslanding({ category: 'C', trip_time_s: 0.20, monitoring_type: 'active' });
    assert.ok(!r.trip_time_compliant);
  });

  it('monitoring_type "none" → non-compliant even if trip time ok', () => {
    const r = checkAntiIslanding({ category: 'A', trip_time_s: 1.0, monitoring_type: 'none' });
    assert.ok(!r.monitoring_method_valid, 'None is not a valid monitoring method');
    assert.ok(!r.pass);
  });

  it('passive monitoring is acceptable', () => {
    const r = checkAntiIslanding({ category: 'A', trip_time_s: 1.5, monitoring_type: 'passive' });
    assert.ok(r.monitoring_method_valid, 'Passive should be valid');
  });

  it('throws for invalid category', () => {
    assert.throws(() => checkAntiIslanding({ category: 'X', trip_time_s: 1.0 }), /category must be/);
  });

  it('returns limit_s matching the category', () => {
    const rA = checkAntiIslanding({ category: 'A', trip_time_s: 1.0 });
    const rB = checkAntiIslanding({ category: 'B', trip_time_s: 0.5 });
    const rC = checkAntiIslanding({ category: 'C', trip_time_s: 0.1 });
    assert.strictEqual(rA.limit_s, 2.0);
    assert.strictEqual(rB.limit_s, 1.0);
    assert.strictEqual(rC.limit_s, 0.16);
  });
});

// ---------------------------------------------------------------------------
// checkRideThrough
// ---------------------------------------------------------------------------

describe('checkRideThrough()', () => {
  it('Category I — standard settings exactly at IEEE 1547 Table 3/5 boundary → pass', () => {
    const r = checkRideThrough({
      category: 'I',
      v_rt_lo_pu: 0.70,
      v_rt_hi_pu: 1.10,
      f_rt_lo_hz: 58.5,
      f_rt_hi_hz: 61.5,
      frequency_hz: 60,
    });
    assert.ok(r.voltage_rt_pass, 'Category I voltage RT at boundary should pass');
    assert.ok(r.freq_rt_pass, 'Category I freq RT at boundary should pass');
    assert.ok(r.pass);
  });

  it('Category I — settings wider than requirement → pass', () => {
    const r = checkRideThrough({
      category: 'I',
      v_rt_lo_pu: 0.60,
      v_rt_hi_pu: 1.15,
      f_rt_lo_hz: 57.0,
      f_rt_hi_hz: 62.5,
      frequency_hz: 60,
    });
    assert.ok(r.pass, 'Wider settings should pass');
  });

  it('Category I — voltage window too narrow → fail', () => {
    const r = checkRideThrough({
      category: 'I',
      v_rt_lo_pu: 0.80,  // too high — does not cover 0.70 requirement
      v_rt_hi_pu: 1.10,
      f_rt_lo_hz: 58.5,
      f_rt_hi_hz: 61.5,
      frequency_hz: 60,
    });
    assert.ok(!r.voltage_rt_pass, 'Narrow voltage window should fail');
  });

  it('Category II — requires wider frequency window', () => {
    // Cat II needs 57.0–62.0 Hz
    const rCatI = checkRideThrough({ category: 'I', v_rt_lo_pu: 0.70, v_rt_hi_pu: 1.10, f_rt_lo_hz: 58.5, f_rt_hi_hz: 61.5, frequency_hz: 60 });
    const rCatII = checkRideThrough({ category: 'II', v_rt_lo_pu: 0.65, v_rt_hi_pu: 1.10, f_rt_lo_hz: 58.5, f_rt_hi_hz: 61.5, frequency_hz: 60 });
    assert.ok(rCatI.pass, 'Cat I should pass with Cat I settings');
    assert.ok(!rCatII.freq_rt_pass, 'Cat I freq settings should fail Cat II requirement');
  });

  it('Category III — passes for very wide settings', () => {
    const r = checkRideThrough({
      category: 'III',
      v_rt_lo_pu: 0.45,
      v_rt_hi_pu: 1.25,
      f_rt_lo_hz: 56.0,
      f_rt_hi_hz: 63.5,
      frequency_hz: 60,
    });
    assert.ok(r.pass, 'Wide settings should pass Cat III');
  });

  it('frequency limits scale proportionally for 50 Hz systems', () => {
    const r60 = checkRideThrough({ category: 'I', v_rt_lo_pu: 0.70, v_rt_hi_pu: 1.10, f_rt_lo_hz: 48.75, f_rt_hi_hz: 51.25, frequency_hz: 50 });
    // 58.5 × (50/60) = 48.75, 61.5 × (50/60) = 51.25
    assert.ok(r60.freq_rt_pass, '50 Hz system should scale limits correctly');
  });

  it('throws for invalid category', () => {
    assert.throws(() => checkRideThrough({ category: 'IV', v_rt_lo_pu: 0.7, v_rt_hi_pu: 1.1, f_rt_lo_hz: 58.5, f_rt_hi_hz: 61.5 }), /category must be/);
  });

  it('returns v_requirement and f_requirement fields', () => {
    const r = checkRideThrough({ category: 'I', v_rt_lo_pu: 0.70, v_rt_hi_pu: 1.10, f_rt_lo_hz: 58.5, f_rt_hi_hz: 61.5 });
    assert.ok(r.v_requirement, 'Should have v_requirement');
    assert.ok(r.f_requirement, 'Should have f_requirement');
    assert.strictEqual(r.v_requirement.lo, VOLTAGE_RIDE_THROUGH.I.v_lo);
    assert.strictEqual(r.v_requirement.hi, VOLTAGE_RIDE_THROUGH.I.v_hi);
  });
});

// ---------------------------------------------------------------------------
// checkHarmonicsCompliance
// ---------------------------------------------------------------------------

describe('checkHarmonicsCompliance()', () => {
  it('low THD, no individual violations → pass', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 3.5, individual_harmonics: [] });
    assert.ok(r.thd_pass);
    assert.ok(r.individual_pass);
    assert.ok(r.pass);
  });

  it('THD exactly at 5% limit → pass', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 5.0 });
    assert.ok(r.thd_pass, 'Exactly at limit should pass');
  });

  it('THD above 5% → fail', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 5.1 });
    assert.ok(!r.thd_pass, 'Above limit should fail');
    assert.ok(!r.pass);
  });

  it('individual harmonic 5th at limit (3.0%) → pass', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 2.0, individual_harmonics: [{ order: 5, pct: 3.0 }] });
    assert.ok(r.individual_pass, '5th at limit should pass');
    assert.strictEqual(r.violations.length, 0);
  });

  it('individual harmonic 5th above limit (3.1%) → violation', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 2.0, individual_harmonics: [{ order: 5, pct: 3.1 }] });
    assert.ok(!r.individual_pass);
    assert.strictEqual(r.violations.length, 1);
    assert.strictEqual(r.violations[0].order, 5);
    assert.ok(r.violations[0].actual_pct > r.violations[0].limit_pct);
  });

  it('multiple harmonics — some compliant, some not', () => {
    const r = checkHarmonicsCompliance({
      thd_pct: 4.0,
      individual_harmonics: [
        { order: 3, pct: 2.0 },  // OK (limit 3.0)
        { order: 5, pct: 4.0 },  // VIOLATES (limit 3.0)
        { order: 7, pct: 1.5 },  // OK (limit 3.0)
      ],
    });
    assert.strictEqual(r.violations.length, 1, 'Only 5th should be a violation');
    assert.strictEqual(r.violations[0].order, 5);
  });

  it('throws for negative thd_pct', () => {
    assert.throws(() => checkHarmonicsCompliance({ thd_pct: -1 }), /thd_pct must be/);
  });

  it('returns thd_limit_pct = 5.0', () => {
    const r = checkHarmonicsCompliance({ thd_pct: 2.0 });
    assert.strictEqual(r.thd_limit_pct, 5.0);
  });
});

// ---------------------------------------------------------------------------
// runDERInterconnectStudy — integration
// ---------------------------------------------------------------------------

describe('runDERInterconnectStudy()', () => {
  const PASSING_PARAMS = {
    pcc_voltage: { v_pcc_pu: 1.0, der_rated_kW: 500, der_rated_kVAR: 0, sc_MVA: 100, r_pu: 0.01, x_pu: 0.05 },
    fault_impact: { der_rated_kVA: 500, v_ll_kV: 12.47, existing_fault_kA: 5.0, device_interrupting_kA: 16.0, k_limit: 1.1 },
    anti_islanding: { category: 'B', trip_time_s: 0.5, monitoring_type: 'active' },
    ride_through: { category: 'I', v_rt_lo_pu: 0.70, v_rt_hi_pu: 1.10, f_rt_lo_hz: 58.5, f_rt_hi_hz: 61.5, frequency_hz: 60 },
    harmonics: { thd_pct: 3.0, individual_harmonics: [] },
  };

  it('all criteria passing → overall_pass = true', () => {
    const result = runDERInterconnectStudy(PASSING_PARAMS);
    assert.ok(result.overall_pass, 'All-passing inputs should give overall_pass = true');
  });

  it('returns all five sub-result keys', () => {
    const result = runDERInterconnectStudy(PASSING_PARAMS);
    assert.ok(result.pcc_voltage, 'Should have pcc_voltage result');
    assert.ok(result.fault_impact, 'Should have fault_impact result');
    assert.ok(result.anti_islanding, 'Should have anti_islanding result');
    assert.ok(result.ride_through, 'Should have ride_through result');
    assert.ok(result.harmonics, 'Should have harmonics result');
  });

  it('returns summary_flags with five boolean entries', () => {
    const result = runDERInterconnectStudy(PASSING_PARAMS);
    assert.ok(typeof result.summary_flags.pcc_voltage === 'boolean', 'pcc_voltage flag must be boolean');
    assert.ok(typeof result.summary_flags.fault_impact === 'boolean');
    assert.ok(typeof result.summary_flags.anti_islanding === 'boolean');
    assert.ok(typeof result.summary_flags.ride_through === 'boolean');
    assert.ok(typeof result.summary_flags.harmonics === 'boolean');
  });

  it('single criterion failure → overall_pass = false', () => {
    const params = JSON.parse(JSON.stringify(PASSING_PARAMS));
    params.harmonics.thd_pct = 8.0; // exceeds 5% limit
    const result = runDERInterconnectStudy(params);
    assert.ok(!result.overall_pass, 'THD failure should give overall_pass = false');
    assert.ok(!result.summary_flags.harmonics, 'harmonics flag should be false');
  });

  it('anti-islanding failure propagates to overall_pass = false', () => {
    const params = JSON.parse(JSON.stringify(PASSING_PARAMS));
    params.anti_islanding.trip_time_s = 5.0; // exceeds Cat B limit of 1.0 s
    const result = runDERInterconnectStudy(params);
    assert.ok(!result.overall_pass);
    assert.ok(!result.summary_flags.anti_islanding);
  });

  it('voltage ride-through failure propagates to overall_pass = false', () => {
    const params = JSON.parse(JSON.stringify(PASSING_PARAMS));
    params.ride_through.v_rt_lo_pu = 0.85; // too high, does not cover 0.70 Cat I requirement
    const result = runDERInterconnectStudy(params);
    assert.ok(!result.ride_through.voltage_rt_pass);
    assert.ok(!result.overall_pass);
  });

  it('all criteria failing → overall_pass = false and all summary_flags false', () => {
    const params = {
      pcc_voltage: { v_pcc_pu: 1.0, der_rated_kW: 50000, sc_MVA: 5, r_pu: 1.0, x_pu: 0 },
      fault_impact: { der_rated_kVA: 50000, v_ll_kV: 0.480, existing_fault_kA: 14.0, device_interrupting_kA: 16.0, k_limit: 1.2 },
      anti_islanding: { category: 'C', trip_time_s: 5.0, monitoring_type: 'none' },
      ride_through: { category: 'III', v_rt_lo_pu: 0.90, v_rt_hi_pu: 1.05, f_rt_lo_hz: 59.0, f_rt_hi_hz: 61.0, frequency_hz: 60 },
      harmonics: { thd_pct: 12.0, individual_harmonics: [{ order: 5, pct: 8.0 }] },
    };
    const result = runDERInterconnectStudy(params);
    assert.ok(!result.overall_pass, 'All-failing inputs should give overall_pass = false');
    const flags = result.summary_flags;
    const allFail = Object.values(flags).every(v => !v);
    assert.ok(allFail, 'All summary_flags should be false');
  });
});

console.log('\n  Done.\n');
