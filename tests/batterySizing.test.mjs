/**
 * Tests for analysis/batterySizing.mjs
 *
 * Run with:  node tests/batterySizing.test.mjs
 *
 * Reference calculations are hand-verified against IEEE 485-2010.
 */

import assert from 'assert';
import {
  CHEMISTRY,
  STANDARD_BANK_KWH,
  STANDARD_UPS_KVA,
  temperatureFactor,
  requiredEnergyKwh,
  designCapacityKwh,
  standardBankSize,
  runtimeCurve,
  upsKvaRequired,
  runBatterySizingAnalysis,
} from '../analysis/batterySizing.mjs';

// ---------------------------------------------------------------------------
// Test helpers
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

/**
 * Floating-point approximate equality.
 * Passes when |actual − expected| / max(|expected|, 1) ≤ tol  OR  |actual − expected| < 0.01.
 */
function approx(actual, expected, tol = 0.01, label = '') {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.01,
    `${label}Expected ≈${expected}, got ${actual} (rel error ${(rel * 100).toFixed(2)}%)`
  );
}

// ---------------------------------------------------------------------------
// temperatureFactor
// ---------------------------------------------------------------------------

describe('temperatureFactor()', () => {
  it('returns 1.0 at exactly 25 °C for lead-acid-agm', () => {
    assert.strictEqual(temperatureFactor('lead-acid-agm', 25), 1.0);
  });

  it('returns 1.0 at exactly 25 °C for lithium-ion', () => {
    assert.strictEqual(temperatureFactor('lithium-ion', 25), 1.0);
  });

  it('Li-ion at 10 °C → K_temp ≈ 0.955', () => {
    // K = 1 + 0.003 × (10 - 25) = 1 - 0.045 = 0.955
    approx(temperatureFactor('lithium-ion', 10), 0.955, 0.001, 'Li-ion 10°C: ');
  });

  it('Lead-acid at −5 °C → K_temp ≈ 0.76', () => {
    // K = 1 + 0.008 × (−5 − 25) = 1 − 0.24 = 0.76
    approx(temperatureFactor('lead-acid-agm', -5), 0.76, 0.001, 'LA-AGM −5°C: ');
  });

  it('Temperature above 25 °C is capped at 1.0 (lead-acid, 40 °C)', () => {
    // Without cap: 1 + 0.008 × 15 = 1.12 → should be capped to 1.0
    assert.strictEqual(temperatureFactor('lead-acid-agm', 40), 1.0);
  });

  it('Temperature above 25 °C is capped at 1.0 (Li-ion, 45 °C)', () => {
    assert.strictEqual(temperatureFactor('lithium-ion', 45), 1.0);
  });

  it('NiCd at 0 °C → K_temp ≈ 0.85', () => {
    // K = 1 + 0.006 × (0 − 25) = 1 − 0.15 = 0.85
    approx(temperatureFactor('nickel-cadmium', 0), 0.85, 0.001, 'NiCd 0°C: ');
  });

  it('throws on unknown chemistry', () => {
    assert.throws(
      () => temperatureFactor('mystery-cell', 25),
      /Unknown chemistry/
    );
  });
});

// ---------------------------------------------------------------------------
// requiredEnergyKwh
// ---------------------------------------------------------------------------

describe('requiredEnergyKwh()', () => {
  it('single uniform period: 50 kW × 2 h = 100 kWh', () => {
    approx(requiredEnergyKwh([{ powerKw: 50, durationHours: 2 }]), 100);
  });

  it('multi-period duty cycle: 30×1 + 50×0.5 + 20×2 = 95 kWh', () => {
    const result = requiredEnergyKwh([
      { powerKw: 30, durationHours: 1 },
      { powerKw: 50, durationHours: 0.5 },
      { powerKw: 20, durationHours: 2 },
    ]);
    approx(result, 95);
  });

  it('100 kW × 4 h = 400 kWh', () => {
    approx(requiredEnergyKwh([{ powerKw: 100, durationHours: 4 }]), 400);
  });

  it('throws on empty array', () => {
    assert.throws(
      () => requiredEnergyKwh([]),
      /non-empty array/
    );
  });

  it('throws if a period has non-positive powerKw', () => {
    assert.throws(
      () => requiredEnergyKwh([{ powerKw: 0, durationHours: 1 }]),
      /powerKw must be a positive number/
    );
  });

  it('throws if a period has non-positive durationHours', () => {
    assert.throws(
      () => requiredEnergyKwh([{ powerKw: 10, durationHours: -1 }]),
      /durationHours must be a positive number/
    );
  });
});

// ---------------------------------------------------------------------------
// designCapacityKwh
// ---------------------------------------------------------------------------

describe('designCapacityKwh()', () => {
  // Golden-path: 100 kWh net, lead-acid-agm, 25 °C, 10% margin
  //   kwhDesign   = 100 / (0.85 × 0.80) = 100 / 0.68 = 147.059
  //   K_temp      = 1.0 (25 °C)
  //   kwhTempCorr = 147.059
  //   kwhWithAging = 147.059 × 1.25 = 183.824
  //   kwhFinal    = 183.824 × 1.10 = 202.206
  it('golden path: 100 kWh, lead-acid-agm, 25°C, 10% margin', () => {
    const r = designCapacityKwh(100, 'lead-acid-agm', 25, 10);
    approx(r.kwhDesign, 147.06, 0.001, 'kwhDesign: ');
    approx(r.kTempFactor, 1.0, 0.001, 'kTempFactor: ');
    approx(r.kwhTempCorrected, 147.06, 0.001, 'kwhTempCorrected: ');
    approx(r.kwhWithAging, 183.82, 0.002, 'kwhWithAging: ');
    approx(r.kwhFinal, 202.2, 0.003, 'kwhFinal: ');
  });

  it('kwhDesign = kwhNet / (eta × dod) — verified formula isolation', () => {
    const kwhNet = 68;          // chosen so result is a round number
    // lead-acid-agm: eta=0.85, dod=0.80 → eta*dod=0.68
    const r = designCapacityKwh(kwhNet, 'lead-acid-agm', 25, 0);
    approx(r.kwhDesign, 100, 0.001);
  });

  it('cold temperature (0 °C, lead-acid-flooded) produces larger final capacity than at 25 °C', () => {
    const warm = designCapacityKwh(100, 'lead-acid-flooded', 25, 10);
    const cold = designCapacityKwh(100, 'lead-acid-flooded', 0, 10);
    // K_temp at 0°C = 1 + 0.008×(0-25) = 0.80 → divides by 0.80 → 25% more
    assert.ok(cold.kwhFinal > warm.kwhFinal, `cold(${cold.kwhFinal}) should > warm(${warm.kwhFinal})`);
  });

  it('Li-ion at −10 °C: K_temp ≈ 0.895 → correctly reduces usable capacity', () => {
    const r = designCapacityKwh(100, 'lithium-ion', -10, 0);
    // K_temp = 1 + 0.003×(−10−25) = 0.895
    // kwhDesign = 100 / (0.95×0.90) = 100/0.855 ≈ 116.96
    // kwhTempCorr = 116.96 / 0.895 ≈ 130.68
    approx(r.kTempFactor, 0.895, 0.001);
    assert.ok(r.kwhTempCorrected > r.kwhDesign, 'Temperature correction should increase required capacity in cold');
  });

  it('throws on kwhNet <= 0', () => {
    assert.throws(
      () => designCapacityKwh(0, 'lead-acid-agm', 25),
      /kwhNet must be greater than zero/
    );
  });

  it('throws on negative designMarginPct', () => {
    assert.throws(
      () => designCapacityKwh(100, 'lead-acid-agm', 25, -5),
      /designMarginPct must be ≥ 0/
    );
  });
});

// ---------------------------------------------------------------------------
// standardBankSize
// ---------------------------------------------------------------------------

describe('standardBankSize()', () => {
  it('202.2 kWh required → selected = 250 kWh', () => {
    const r = standardBankSize(202.2);
    assert.strictEqual(r.selectedKwh, 250);
  });

  it('exact match on a standard size (100 kWh → 100 kWh)', () => {
    const r = standardBankSize(100);
    assert.strictEqual(r.selectedKwh, 100);
  });

  it('very small requirement (5 kWh) → first standard size (10 kWh)', () => {
    const r = standardBankSize(5);
    assert.strictEqual(r.selectedKwh, 10);
  });

  it('nextLargerKwh is always > selectedKwh when not at maximum', () => {
    const r = standardBankSize(50);
    assert.ok(r.nextLargerKwh > r.selectedKwh, `nextLargerKwh(${r.nextLargerKwh}) should > selected(${r.selectedKwh})`);
  });

  it('exceedsStandard is false for requirements within standard range', () => {
    assert.strictEqual(standardBankSize(500).exceedsStandard, false);
  });

  it('exceedsStandard is true when requirement exceeds 1000 kWh', () => {
    const r = standardBankSize(1200);
    assert.strictEqual(r.exceedsStandard, true);
    assert.strictEqual(r.selectedKwh, 1000);
  });
});

// ---------------------------------------------------------------------------
// runtimeCurve
// ---------------------------------------------------------------------------

describe('runtimeCurve()', () => {
  it('returns exactly 5 entries', () => {
    const pts = runtimeCurve(250, 50, 'lead-acid-agm');
    assert.strictEqual(pts.length, 5);
  });

  it('at 100% load, runtime = (kwhSelected × dod × eta) / loadKw', () => {
    // 250 kWh, LA-AGM: usable = 250 × 0.80 × 0.85 = 170 kWh
    // at 100% of 50 kW → runtime = 170/50 = 3.4 h
    const pts = runtimeCurve(250, 50, 'lead-acid-agm');
    const at100 = pts.find(p => p.loadFraction === 1.00);
    approx(at100.runtimeHours, 3.4, 0.001, '100% load runtime: ');
  });

  it('at 50% load, runtime is exactly 2× the runtime at 100% load', () => {
    const pts = runtimeCurve(200, 80, 'lithium-ion');
    const at100 = pts.find(p => p.loadFraction === 1.00);
    const at50  = pts.find(p => p.loadFraction === 0.50);
    approx(at50.runtimeHours, at100.runtimeHours * 2, 0.001);
  });

  it('each entry has loadFraction, loadKw, and runtimeHours fields', () => {
    const pts = runtimeCurve(100, 40, 'nickel-cadmium');
    pts.forEach(p => {
      assert.ok('loadFraction' in p, 'missing loadFraction');
      assert.ok('loadKw' in p, 'missing loadKw');
      assert.ok('runtimeHours' in p, 'missing runtimeHours');
    });
  });

  it('throws on nominalLoadKw <= 0', () => {
    assert.throws(
      () => runtimeCurve(100, 0, 'lead-acid-agm'),
      /nominalLoadKw must be greater than zero/
    );
  });
});

// ---------------------------------------------------------------------------
// upsKvaRequired
// ---------------------------------------------------------------------------

describe('upsKvaRequired()', () => {
  it('45 kW / 0.9 pf = 50 kVA required → standard 50 kVA', () => {
    const r = upsKvaRequired(45, 0.9);
    approx(r.kvaRequired, 50, 0.001);
    assert.strictEqual(r.standardKva, 50);
  });

  it('60 kW / 0.9 pf ≈ 66.67 kVA → standard 75 kVA', () => {
    const r = upsKvaRequired(60, 0.9);
    approx(r.kvaRequired, 66.67, 0.01);
    assert.strictEqual(r.standardKva, 75);
  });

  it('100 kW / 0.9 pf ≈ 111.1 kVA → standard 120 kVA', () => {
    const r = upsKvaRequired(100, 0.9);
    approx(r.kvaRequired, 111.11, 0.01);
    assert.strictEqual(r.standardKva, 120);
  });

  it('power factor is preserved in result', () => {
    const r = upsKvaRequired(50, 0.85);
    assert.strictEqual(r.powerFactor, 0.85);
  });

  it('throws on peakKw <= 0', () => {
    assert.throws(
      () => upsKvaRequired(0, 0.9),
      /peakKw must be greater than zero/
    );
  });

  it('throws on upsPowerFactor > 1', () => {
    assert.throws(
      () => upsKvaRequired(100, 1.1),
      /upsPowerFactor must be in/
    );
  });
});

// ---------------------------------------------------------------------------
// runBatterySizingAnalysis (integration)
// ---------------------------------------------------------------------------

describe('runBatterySizingAnalysis()', () => {
  const baseInputs = {
    systemLabel: 'Main UPS Bus',
    averageLoadKw: 50,
    peakLoadKw: 60,
    runtimeHours: 2,
    chemistry: 'lead-acid-agm',
    ambientTempC: 25,
    designMarginPct: 10,
    upsPowerFactor: 0.9,
  };

  it('returns a result with all required keys', () => {
    const r = runBatterySizingAnalysis(baseInputs);
    const requiredKeys = [
      'systemLabel', 'chemistry', 'chemistryLabel',
      'averageLoadKw', 'peakLoadKw', 'runtimeHours',
      'ambientTempC', 'designMarginPct', 'upsPowerFactor',
      'kwhNet', 'kwhDesign', 'kTempFactor', 'kwhTempCorrected',
      'agingFactor', 'kwhWithAging', 'kwhFinal',
      'dod', 'eta',
      'selectedBankKwh', 'nextLargerKwh', 'bankOptions', 'exceedsStandard',
      'runtimeCurvePoints',
      'kvaRequired', 'standardKva',
      'warnings', 'timestamp',
    ];
    requiredKeys.forEach(k => assert.ok(k in r, `Missing key: ${k}`));
  });

  it('timestamp is a valid ISO 8601 date string', () => {
    const r = runBatterySizingAnalysis(baseInputs);
    assert.ok(!isNaN(Date.parse(r.timestamp)), `Invalid timestamp: ${r.timestamp}`);
  });

  it('golden path result values are consistent', () => {
    // 50 kW × 2 h = 100 kWh net
    // LA-AGM: 100/(0.85×0.80)=147.06 → ×1.25=183.82 → ×1.10=202.21 → 250 kWh bank
    const r = runBatterySizingAnalysis(baseInputs);
    approx(r.kwhNet, 100, 0.001);
    approx(r.kwhFinal, 202.21, 0.005);
    assert.strictEqual(r.selectedBankKwh, 250);
  });

  it('cold environment warning generated when ambientTempC < 0', () => {
    const r = runBatterySizingAnalysis({ ...baseInputs, ambientTempC: -5 });
    const hasWarning = r.warnings.some(w => /below freezing/i.test(w));
    assert.ok(hasWarning, 'Expected cold temperature warning');
  });

  it('lead-acid-flooded + cold generates heating advisory', () => {
    const r = runBatterySizingAnalysis({
      ...baseInputs,
      chemistry: 'lead-acid-flooded',
      ambientTempC: 5,
    });
    const hasWarning = r.warnings.some(w => /thermal management/i.test(w));
    assert.ok(hasWarning, 'Expected flooded cell cold warning');
  });

  it('multi-period duty cycle overrides averageLoadKw × runtimeHours for energy', () => {
    const periods = [
      { powerKw: 30, durationHours: 1 },
      { powerKw: 70, durationHours: 1 },
    ];
    // net = 30×1 + 70×1 = 100 kWh (same as baseInputs 50×2=100, but different shape)
    const rDC = runBatterySizingAnalysis({ ...baseInputs, loadProfilePeriods: periods });
    approx(rDC.kwhNet, 100, 0.001);
    assert.ok(rDC.usingDutyCycle === true, 'usingDutyCycle should be true');
  });

  it('throws with descriptive message on invalid chemistry', () => {
    assert.throws(
      () => runBatterySizingAnalysis({ ...baseInputs, chemistry: 'unknown-cell' }),
      /Unknown chemistry/
    );
  });

  it('throws when averageLoadKw is zero', () => {
    assert.throws(
      () => runBatterySizingAnalysis({ ...baseInputs, averageLoadKw: 0 }),
      /averageLoadKw must be greater than zero/
    );
  });
});

// ---------------------------------------------------------------------------
// STANDARD_BANK_KWH array integrity
// ---------------------------------------------------------------------------

describe('STANDARD_BANK_KWH array', () => {
  it('is sorted ascending', () => {
    for (let i = 1; i < STANDARD_BANK_KWH.length; i++) {
      assert.ok(STANDARD_BANK_KWH[i] > STANDARD_BANK_KWH[i - 1],
        `Out of order at index ${i}: ${STANDARD_BANK_KWH[i - 1]} → ${STANDARD_BANK_KWH[i]}`);
    }
  });

  it('contains the expected boundary values', () => {
    assert.ok(STANDARD_BANK_KWH.includes(10), 'Should include 10 kWh');
    assert.ok(STANDARD_BANK_KWH.includes(100), 'Should include 100 kWh');
    assert.ok(STANDARD_BANK_KWH.includes(1000), 'Should include 1000 kWh');
  });
});

console.log('\n  batterySizing tests complete.\n');
