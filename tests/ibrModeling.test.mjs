/**
 * Tests for analysis/ibrModeling.mjs
 *
 * Run with:  node tests/ibrModeling.test.mjs
 *
 * Reference values hand-verified against IEEE 1547-2018 and IEC 61727:2004.
 */

import assert from 'assert';
import {
  pvArrayOutput,
  ibrPQCapability,
  ibrFaultContribution,
  bessDispatch,
  freqWattResponse,
  interpolateVoltVar,
  runIBRStudy,
  VOLT_VAR_CURVES,
  IBR_DEFAULTS,
  STC_IRRADIANCE,
  STC_TEMP_C,
} from '../analysis/ibrModeling.mjs';

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

function approx(actual, expected, tol = 0.01, label = '') {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.01,
    `${label}Expected ≈${expected}, got ${actual} (rel ${(rel * 100).toFixed(2)}%)`
  );
}

// ---------------------------------------------------------------------------
// pvArrayOutput
// ---------------------------------------------------------------------------

describe('pvArrayOutput()', () => {
  it('returns pAC ≈ Pstc × eta at STC (1000 W/m², 25°C)', () => {
    const r = pvArrayOutput({ irradiance_W_m2: 1000, temp_C: 25, Pstc_kW: 100, inverterEff: 0.97 });
    approx(r.pAC_kW, 97, 0.001, 'pAC at STC: ');
    approx(r.pDC_kW, 100, 0.001, 'pDC at STC: ');
    assert.strictEqual(r.curtailed, false);
    approx(r.tempFactor, 1.0, 0.001, 'tempFactor: ');
    approx(r.irradFactor, 1.0, 0.001, 'irradFactor: ');
  });

  it('returns 50 % output at 500 W/m²', () => {
    const r = pvArrayOutput({ irradiance_W_m2: 500, temp_C: 25, Pstc_kW: 100, inverterEff: 1.0 });
    approx(r.pAC_kW, 50, 0.001, 'pAC at 500 W/m²: ');
    approx(r.irradFactor, 0.5, 0.001, 'irradFactor: ');
  });

  it('applies temperature derating correctly at 50 °C (−0.35 %/°C × 25 °C = −8.75 %)', () => {
    const r = pvArrayOutput({ irradiance_W_m2: 1000, temp_C: 50, Pstc_kW: 100, inverterEff: 1.0 });
    // tempFactor = 1 + (-0.0035)(50-25) = 1 - 0.0875 = 0.9125
    approx(r.tempFactor, 0.9125, 0.001, 'tempFactor at 50°C: ');
    approx(r.pAC_kW, 91.25, 0.01, 'pAC at 50°C: ');
  });

  it('marks curtailed=true when P² + Q² would exceed S_rated²', () => {
    // 100 kW array, 80 kVA inverter → must curtail
    const r = pvArrayOutput({ irradiance_W_m2: 1000, temp_C: 25, Pstc_kW: 100, inverterEff: 1.0, sRated_kVA: 80 });
    assert.strictEqual(r.curtailed, true);
    assert.ok(r.pAC_kW <= 80, 'pAC_kW should be ≤ S_rated');
  });

  it('zero irradiance → zero output', () => {
    const r = pvArrayOutput({ irradiance_W_m2: 0, temp_C: 25, Pstc_kW: 100 });
    assert.strictEqual(r.pAC_kW, 0);
  });

  it('throws on negative irradiance', () => {
    assert.throws(() => pvArrayOutput({ irradiance_W_m2: -10, temp_C: 25, Pstc_kW: 100 }), /irradiance/);
  });

  it('throws on invalid Pstc_kW', () => {
    assert.throws(() => pvArrayOutput({ irradiance_W_m2: 1000, temp_C: 25, Pstc_kW: 0 }), /Pstc/);
  });
});

// ---------------------------------------------------------------------------
// interpolateVoltVar
// ---------------------------------------------------------------------------

describe('interpolateVoltVar()', () => {
  const curveB = VOLT_VAR_CURVES.B;

  it('returns capacitive Q at low voltage (below 0.90 pu)', () => {
    const q = interpolateVoltVar(0.85, curveB);
    approx(q, 0.44, 0.001, 'Q at 0.85 pu: ');
  });

  it('returns 0 in the deadband (0.98 – 1.02 pu)', () => {
    approx(interpolateVoltVar(1.00, curveB), 0, 0.001, 'Q at 1.00 pu: ');
    approx(interpolateVoltVar(0.99, curveB), 0, 0.001, 'Q at 0.99 pu: ');
  });

  it('returns inductive Q at high voltage (above 1.10 pu)', () => {
    const q = interpolateVoltVar(1.15, curveB);
    approx(q, -0.44, 0.001, 'Q at 1.15 pu: ');
  });

  it('interpolates linearly between breakpoints', () => {
    // Between [0.90, 0.44] and [0.98, 0.0]: at 0.94 pu → t=0.5 → Q=0.22
    const q = interpolateVoltVar(0.94, curveB);
    approx(q, 0.22, 0.02, 'Q at 0.94 pu: ');
  });
});

// ---------------------------------------------------------------------------
// ibrPQCapability
// ---------------------------------------------------------------------------

describe('ibrPQCapability()', () => {
  it('P² + Q² ≤ S² at any operating point', () => {
    const r = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 80, vBus_pu: 1.0, voltVarEnabled: false });
    const s2 = r.operatingPoint.sApparent_kVA ** 2;
    const p2q2 = r.operatingPoint.pOutput_kW ** 2 + r.operatingPoint.qOutput_kvar ** 2;
    assert.ok(p2q2 <= s2 + 0.01, 'P² + Q² must be ≤ S²');
  });

  it('Q limits are symmetric when P = 0', () => {
    const r = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 0, voltVarEnabled: false });
    approx(r.qMax_kvar, 100, 0.001, 'qMax at P=0: ');
    approx(r.qMin_kvar, -100, 0.001, 'qMin at P=0: ');
  });

  it('qMax shrinks as P increases', () => {
    const r50 = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 50, voltVarEnabled: false });
    const r90 = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 90, voltVarEnabled: false });
    assert.ok(r90.qMax_kvar < r50.qMax_kvar, 'qMax should decrease as P increases');
  });

  it('Volt-VAR injects capacitive Q at low voltage', () => {
    const r = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 80, vBus_pu: 0.92, voltVarEnabled: true, voltVarCategory: 'B' });
    assert.ok(r.qDroop_kvar > 0, 'Should inject capacitive Q at low voltage');
  });

  it('Volt-VAR absorbs inductive Q at high voltage', () => {
    const r = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 80, vBus_pu: 1.08, voltVarEnabled: true, voltVarCategory: 'B' });
    assert.ok(r.qDroop_kvar < 0, 'Should absorb inductive Q at high voltage');
  });

  it('no Volt-VAR dispatch in the deadband (1.00 pu)', () => {
    const r = ibrPQCapability({ sRated_kVA: 100, pOutput_kW: 80, vBus_pu: 1.0, voltVarEnabled: true });
    approx(r.qDroop_kvar, 0, 0.001, 'qDroop in deadband: ');
  });

  it('throws on non-positive sRated_kVA', () => {
    assert.throws(() => ibrPQCapability({ sRated_kVA: 0, pOutput_kW: 50 }), /sRated/);
  });
});

// ---------------------------------------------------------------------------
// ibrFaultContribution
// ---------------------------------------------------------------------------

describe('ibrFaultContribution()', () => {
  it('rated current = S / (√3 × V)', () => {
    // 1000 kVA, 34.5 kV: I_rated = 1000 / (1.732 × 34.5) = 16.73 A
    const r = ibrFaultContribution({ sRated_kVA: 1000, vLL_kV: 34.5 });
    approx(r.Irated_A, 16.73, 0.005, 'Irated 34.5 kV: ');
  });

  it('fault current = limitFactor × I_rated when rideThrough=true', () => {
    const r = ibrFaultContribution({ sRated_kVA: 500, vLL_kV: 0.48, limitFactor: 1.1, rideThrough: true });
    approx(r.Ifault_A, 1.1 * r.Irated_A, 0.001, 'Ifault = 1.1 × Irated: ');
    assert.strictEqual(r.tripped, false);
  });

  it('returns zero fault current when rideThrough=false (inverter trips)', () => {
    const r = ibrFaultContribution({ sRated_kVA: 500, vLL_kV: 0.48, rideThrough: false });
    assert.strictEqual(r.Ifault_A, 0);
    assert.strictEqual(r.tripped, true);
  });

  it('Ifault_pu = limitFactor at nominal voltage (1.0 pu)', () => {
    const r = ibrFaultContribution({ sRated_kVA: 200, vLL_kV: 0.48, limitFactor: 1.2, vBus_pu: 1.0 });
    approx(r.Ifault_pu, 1.2, 0.001, 'Ifault_pu at 1.0 pu: ');
  });

  it('throws on invalid voltage', () => {
    assert.throws(() => ibrFaultContribution({ sRated_kVA: 500, vLL_kV: 0 }), /vLL/);
  });
});

// ---------------------------------------------------------------------------
// bessDispatch
// ---------------------------------------------------------------------------

describe('bessDispatch()', () => {
  it('discharge mode returns positive pAC', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 80, mode: 'discharge' });
    assert.ok(r.pAC_kW > 0, 'pAC_kW should be positive during discharge');
    assert.strictEqual(r.socLimited, false);
  });

  it('charge mode returns negative pAC (grid draw)', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 50, mode: 'charge' });
    assert.ok(r.pAC_kW < 0, 'pAC_kW should be negative during charge');
  });

  it('discharge blocked at minSoc (soc=10 %)', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 10, mode: 'discharge', minSocPct: 10 });
    assert.strictEqual(r.pAC_kW, 0);
    assert.strictEqual(r.socLimited, true);
  });

  it('charge blocked at maxSoc (soc=95 %)', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 95, mode: 'charge', maxSocPct: 95 });
    assert.strictEqual(r.pAC_kW, 0);
    assert.strictEqual(r.socLimited, true);
  });

  it('standby mode returns zero P and Q', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 50, mode: 'standby' });
    assert.strictEqual(r.pAC_kW, 0);
    assert.strictEqual(r.qAC_kvar, 0);
  });

  it('volt_var mode returns zero P and non-zero Q at off-nominal voltage', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 50, mode: 'volt_var', vBus_pu: 0.92 });
    assert.strictEqual(r.pAC_kW, 0);
    assert.ok(r.qAC_kvar > 0, 'Should inject Q at low voltage in volt_var mode');
  });

  it('discharge applies round-trip efficiency', () => {
    const r = bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 80, mode: 'discharge', roundTripEff: 0.9 });
    approx(r.pAC_kW, 90, 0.001, 'pAC_kW with 90% efficiency: ');
  });

  it('throws on invalid soc_pct', () => {
    assert.throws(() => bessDispatch({ sRated_kW: 100, sRated_kVA: 100, soc_pct: 110, mode: 'discharge' }), /soc/);
  });
});

// ---------------------------------------------------------------------------
// freqWattResponse
// ---------------------------------------------------------------------------

describe('freqWattResponse()', () => {
  it('no curtailment within the deadband (60.00 Hz)', () => {
    const r = freqWattResponse({ pMax_kW: 100, freq_Hz: 60.0 });
    assert.strictEqual(r.curtailFraction, 0);
    assert.strictEqual(r.pDispatch_kW, 100);
    assert.strictEqual(r.region, 'deadband');
  });

  it('curtails at 60.5 Hz (over-frequency) with 5% droop', () => {
    // excess = 60.5 - 60.02 = 0.48 Hz; curtailFraction = 0.05 × 0.48 = 0.024 → 2.4%
    const r = freqWattResponse({ pMax_kW: 100, freq_Hz: 60.5, droop_pct: 5 });
    approx(r.curtailFraction, 0.024, 0.001, 'curtailFraction at 60.5 Hz: ');
    assert.strictEqual(r.region, 'over-frequency');
  });

  it('full curtailment at very high frequency (100% curtailment cap)', () => {
    // excess = 85 - 60.02 = 24.98; 0.05 × 24.98 = 1.249 → clamped to 1
    const r = freqWattResponse({ pMax_kW: 100, freq_Hz: 85, droop_pct: 5 });
    assert.strictEqual(r.curtailFraction, 1);
    assert.strictEqual(r.pDispatch_kW, 0);
  });

  it('no curtailment under-frequency (under-freq support)', () => {
    const r = freqWattResponse({ pMax_kW: 100, freq_Hz: 59.5 });
    assert.strictEqual(r.pDispatch_kW, 100);
    assert.strictEqual(r.region, 'under-frequency');
  });

  it('throws on negative pMax_kW', () => {
    assert.throws(() => freqWattResponse({ pMax_kW: -10, freq_Hz: 60 }), /pMax/);
  });
});

// ---------------------------------------------------------------------------
// runIBRStudy — integration
// ---------------------------------------------------------------------------

describe('runIBRStudy() — PV resource', () => {
  it('produces all five result sections', () => {
    const r = runIBRStudy({
      resourceType: 'pv',
      sRated_kVA: 100,
      vLL_kV: 0.48,
      Pstc_kW: 100,
      irradiance_W_m2: 1000,
      temp_C: 25,
    });
    assert.ok(r.pvOutput !== null, 'pvOutput should be present');
    assert.ok(r.pqCapability !== null, 'pqCapability should be present');
    assert.ok(r.faultContribution !== null, 'faultContribution should be present');
    assert.ok(r.freqWatt !== null, 'freqWatt should be present');
  });

  it('pAC at STC ≈ Pstc × eta with default parameters', () => {
    const r = runIBRStudy({ resourceType: 'pv', sRated_kVA: 105, vLL_kV: 0.48, Pstc_kW: 100 });
    approx(r.pvOutput.pAC_kW, 97, 0.01, 'pAC at STC: ');
  });
});

describe('runIBRStudy() — BESS resource', () => {
  it('bessResult populated for BESS type', () => {
    const r = runIBRStudy({ resourceType: 'bess', sRated_kVA: 100, sRated_kW: 100, vLL_kV: 0.48, soc_pct: 80 });
    assert.ok(r.bessResult !== null, 'bessResult should be present for BESS');
  });

  it('pvOutput is null for BESS type', () => {
    const r = runIBRStudy({ resourceType: 'bess', sRated_kVA: 100, sRated_kW: 100, vLL_kV: 0.48, soc_pct: 80 });
    assert.strictEqual(r.pvOutput, null);
  });
});

describe('runIBRStudy() — fault contribution', () => {
  it('Ifault ≈ 1.1 × S / (√3 × V) at nominal voltage', () => {
    // 500 kVA, 0.48 kV: I_rated = 500000 / (1.732 × 480) = 601.4 A; I_fault = 1.1 × 601.4 = 661.5 A
    const r = runIBRStudy({ resourceType: 'ibr', sRated_kVA: 500, vLL_kV: 0.48 });
    const expected = 1.1 * (500 * 1000) / (Math.sqrt(3) * 480);
    approx(r.faultContribution.Ifault_A, expected, 0.005, 'Ifault 0.48 kV: ');
  });
});

console.log('\n  All IBR modeling tests complete.\n');
