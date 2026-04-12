/**
 * Tests for analysis/capacitorBank.mjs
 *
 * Verifies PFC sizing calculations against hand-calculated reference values.
 *
 * Golden-path reference (all steps):
 *   P = 1000 kW, pf_existing = 0.80, pf_target = 0.95
 *   Q_cap = 1000 × (tan(acos(0.80)) − tan(acos(0.95)))
 *         = 1000 × (0.7500 − 0.3287)
 *         ≈ 421.3 kVAR
 *
 *   With SC = 10 MVA → kVA_sc = 10,000 kVA, bank = 600 kVAR (nearest standard ≥ 421.3):
 *   h_r = √(10000 / 600) ≈ 4.08  → near 5th harmonic (distance 0.92 > 0.5, but < 1.0 → caution)
 *   Note: Using nearest standard 600 kVAR instead of exact 421.3 kVAR changes h_r.
 *   With exact 421.3 kVAR: h_r = √(10000 / 421.3) ≈ 4.87 → danger (distance to h=5 is 0.13)
 */
import assert from 'assert';
import {
  requiredKvar,
  resonanceOrder,
  detuningRecommendation,
  standardBankSizes,
  runCapacitorBankAnalysis,
  STANDARD_KVAR_SIZES,
} from '../analysis/capacitorBank.mjs';

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

function approx(actual, expected, tol = 0.01) {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.01,
    `Expected ~${expected}, got ${actual} (rel error ${(rel * 100).toFixed(3)}%)`
  );
}

// ---------------------------------------------------------------------------
// requiredKvar
// ---------------------------------------------------------------------------
describe('requiredKvar — PFC sizing formula', () => {
  it('golden path: 1000 kW from PF 0.80 to 0.95 ≈ 421 kVAR', () => {
    const r = requiredKvar({ pKw: 1000, pfExisting: 0.80, pfTarget: 0.95 });
    approx(r.kvarRequired, 421.3, 0.005);
    assert.ok(r.kvarRequired > 0, 'kvarRequired should be positive');
  });

  it('no correction required when already at target PF', () => {
    const r = requiredKvar({ pKw: 500, pfExisting: 0.95, pfTarget: 0.95 });
    assert.strictEqual(r.kvarRequired, 0, 'Should return 0 when pf_existing equals pf_target');
  });

  it('no correction required when PF exceeds target', () => {
    const r = requiredKvar({ pKw: 500, pfExisting: 0.98, pfTarget: 0.95 });
    assert.strictEqual(r.kvarRequired, 0, 'Should return 0 when existing PF is already above target');
  });

  it('very low PF (0.50 to 0.95): positive result', () => {
    const r = requiredKvar({ pKw: 800, pfExisting: 0.50, pfTarget: 0.95 });
    assert.ok(r.kvarRequired > 0, 'Should require positive kVAR for very low PF');
    // tan(acos(0.5)) = 1.732; tan(acos(0.95)) = 0.329
    // Q = 800 × (1.732 − 0.329) = 1122.4 kVAR
    approx(r.kvarRequired, 1122.4, 0.01);
  });

  it('unity target PF (1.0): result is finite (no NaN/Infinity)', () => {
    const r = requiredKvar({ pKw: 500, pfExisting: 0.70, pfTarget: 1.0 });
    assert.ok(Number.isFinite(r.kvarRequired), 'kvarRequired should be finite');
    assert.ok(r.kvarRequired > 0, 'kvarRequired should be positive');
  });

  it('preserves small values: 100 kW, PF 0.80→0.90', () => {
    const r = requiredKvar({ pKw: 100, pfExisting: 0.80, pfTarget: 0.90 });
    // tan(acos(0.80)) = 0.7500; tan(acos(0.90)) = 0.4843
    // Q = 100 × (0.7500 − 0.4843) ≈ 26.6 kVAR
    approx(r.kvarRequired, 26.6, 0.02);
  });

  it('throws on invalid pKw', () => {
    assert.throws(() => requiredKvar({ pKw: 0, pfExisting: 0.8, pfTarget: 0.95 }), /greater than zero/i);
  });

  it('throws on out-of-range pfExisting', () => {
    assert.throws(() => requiredKvar({ pKw: 100, pfExisting: 1.1, pfTarget: 0.95 }), /pfExisting/i);
  });
});

// ---------------------------------------------------------------------------
// resonanceOrder
// ---------------------------------------------------------------------------
describe('resonanceOrder — parallel resonance harmonic order', () => {
  it('golden path: 10 MVA SC, 421 kVAR → h_r ≈ 4.87, danger', () => {
    const r = resonanceOrder({ kvaScMva: 10, kvarCap: 421 });
    approx(r.harmonicOrder, 4.87, 0.01);
    assert.strictEqual(r.riskLevel, 'danger', `Expected danger, got ${r.riskLevel} (h_r=${r.harmonicOrder})`);
    assert.strictEqual(r.nearestDominant, 5);
  });

  it('8.1 MVA SC, 100 kVAR → h_r = 9.0, safe (midway between 7th and 11th)', () => {
    // √(8100 / 100) = √81 = 9.0 — distance to h=7 is 2.0, distance to h=11 is 2.0
    // Both exceed the caution band of 1.0, so riskLevel must be 'safe'.
    const r = resonanceOrder({ kvaScMva: 8.1, kvarCap: 100 });
    approx(r.harmonicOrder, 9.0, 0.005);
    assert.strictEqual(r.riskLevel, 'safe');
    assert.strictEqual(r.nearestDominant, null);
  });

  it('h_r near 7th harmonic is flagged as danger', () => {
    // kVA_sc / kVAR_cap = 49 → h_r = 7.0
    const r = resonanceOrder({ kvaScMva: 4.9, kvarCap: 100 });
    approx(r.harmonicOrder, 7.0, 0.01);
    assert.strictEqual(r.riskLevel, 'danger');
    assert.strictEqual(r.nearestDominant, 7);
  });

  it('h_r within caution band produces caution', () => {
    // h_r = 5.8 (within 1.0 of h=5 but outside 0.5) → caution
    const r = resonanceOrder({ kvaScMva: 33.64, kvarCap: 1000 });
    // √(33640 / 1000) = √33.64 ≈ 5.8
    assert.ok(r.harmonicOrder > 5.0 && r.harmonicOrder < 6.5, `h_r=${r.harmonicOrder}`);
    assert.strictEqual(r.riskLevel, 'caution');
  });

  it('throws on invalid inputs', () => {
    assert.throws(() => resonanceOrder({ kvaScMva: 0, kvarCap: 300 }), /kvaScMva/i);
    assert.throws(() => resonanceOrder({ kvaScMva: 10, kvarCap: 0 }), /kvarCap/i);
  });
});

// ---------------------------------------------------------------------------
// detuningRecommendation
// ---------------------------------------------------------------------------
describe('detuningRecommendation — reactor specification', () => {
  it('danger near 5th harmonic → 5.67% detuning', () => {
    const r = detuningRecommendation(4.87, 'danger');
    assert.strictEqual(r.needed, true);
    assert.strictEqual(r.detuningPct, 5.67);
    assert.strictEqual(r.tunedToOrder, 4.30);
  });

  it('danger near 7th harmonic → 7% detuning', () => {
    const r = detuningRecommendation(7.1, 'danger');
    assert.strictEqual(r.needed, true);
    assert.strictEqual(r.detuningPct, 7);
  });

  it('danger near 3rd harmonic → 14% detuning', () => {
    const r = detuningRecommendation(3.2, 'danger');
    assert.strictEqual(r.needed, true);
    assert.strictEqual(r.detuningPct, 14);
  });

  it('safe → no detuning needed', () => {
    const r = detuningRecommendation(10.0, 'safe');
    assert.strictEqual(r.needed, false);
    assert.strictEqual(r.detuningPct, null);
  });

  it('caution also produces a detuning recommendation', () => {
    const r = detuningRecommendation(5.6, 'caution');
    assert.strictEqual(r.needed, true);
    assert.ok(r.detuningPct != null, 'detuningPct should be set for caution');
  });
});

// ---------------------------------------------------------------------------
// standardBankSizes
// ---------------------------------------------------------------------------
describe('standardBankSizes — standard kVAR selection', () => {
  it('287 kVAR required → recommended = 300', () => {
    const r = standardBankSizes(287);
    assert.strictEqual(r.recommended, 300);
  });

  it('421 kVAR required → recommended = 600', () => {
    // Nearest standard size ≥ 421 is 600 kVAR
    const r = standardBankSizes(421);
    assert.strictEqual(r.recommended, 600);
    assert.strictEqual(r.stageKvar, 300);
  });

  it('exact match on a standard size', () => {
    const r = standardBankSizes(300);
    assert.strictEqual(r.recommended, 300);
  });

  it('very small requirement (10 kVAR) → nearest standard', () => {
    const r = standardBankSizes(10);
    assert.strictEqual(r.recommended, STANDARD_KVAR_SIZES[0]);
  });

  it('zero required → returns zero bank size', () => {
    const r = standardBankSizes(0);
    assert.strictEqual(r.recommended, 0);
    assert.strictEqual(r.options.length, 0);
  });

  it('options array always contains the recommended size', () => {
    const r = standardBankSizes(450);
    assert.ok(r.options.includes(r.recommended), 'options should include recommended');
  });
});

// ---------------------------------------------------------------------------
// runCapacitorBankAnalysis — integration
// ---------------------------------------------------------------------------
describe('runCapacitorBankAnalysis — integration', () => {
  it('golden path: 1000 kW, PF 0.80→0.95, 10 MVA SC', () => {
    const result = runCapacitorBankAnalysis({
      busLabel: 'Main LV Bus',
      pKw: 1000,
      pfExisting: 0.80,
      pfTarget: 0.95,
      voltageKv: 0.48,
      kvaScMva: 10,
      dominantHarmonics: [5, 7],
    });

    approx(result.kvarRequired, 421.3, 0.005);
    assert.ok(result.bankSize >= result.kvarRequired, 'Bank size should cover required kVAR');
    assert.ok(result.resonance != null, 'Resonance should be computed when SC MVA is provided');
    assert.ok(result.warnings.length > 0, 'Should have at least one warning about resonance');
    assert.ok(result.timestamp, 'Should include timestamp');
  });

  it('no correction needed: pf_existing >= pf_target', () => {
    const result = runCapacitorBankAnalysis({
      pKw: 500,
      pfExisting: 0.97,
      pfTarget: 0.95,
      voltageKv: 0.48,
      kvaScMva: 5,
    });

    assert.strictEqual(result.kvarRequired, 0);
    assert.strictEqual(result.bankSize, 0);
    assert.strictEqual(result.resonance, null);
  });

  it('skips resonance check when kvaScMva = 0', () => {
    const result = runCapacitorBankAnalysis({
      pKw: 500,
      pfExisting: 0.80,
      pfTarget: 0.95,
      voltageKv: 0.48,
      kvaScMva: 0,
    });

    assert.strictEqual(result.resonance, null, 'resonance should be null when SC MVA = 0');
    assert.ok(result.warnings.some(w => w.includes('Short-circuit MVA not provided')),
      'Should warn about missing SC MVA');
  });

  it('result object has all expected keys', () => {
    const result = runCapacitorBankAnalysis({
      pKw: 800,
      pfExisting: 0.75,
      pfTarget: 0.92,
      voltageKv: 4.16,
      kvaScMva: 25,
    });

    const requiredKeys = [
      'busLabel', 'pKw', 'pfExisting', 'pfTarget', 'voltageKv', 'kvaScMva',
      'kvarRequired', 'bankSize', 'twoStage', 'stageKvar', 'standardSizes',
      'tanDeltaExisting', 'tanDeltaTarget', 'resonance', 'detuning', 'warnings', 'timestamp',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in result, `Missing result key: ${key}`);
    }
  });
});

console.log('\nAll capacitorBank tests completed.');
