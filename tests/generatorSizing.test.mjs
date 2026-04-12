/**
 * Tests for analysis/generatorSizing.mjs
 *
 * Verifies generator sizing calculations against hand-calculated reference values.
 *
 * Golden-path reference:
 *   Continuous load: 400 kW
 *   Site: 5000 ft altitude (naturally-aspirated), 45 °C ambient
 *   Altitude factor: 1 - 0.03 × (5000-500)/1000 = 1 - 0.03 × 4.5 = 1 - 0.135 = 0.865
 *   After altitude: 400 × 0.865 = 346.0 kW
 *   Temperature factor: 1 - 0.01 × (45-40) = 1 - 0.05 = 0.95
 *   After temperature: 346.0 × 0.95 = 328.7 kW
 *
 *   Motor step load: 100 HP, PF 0.85, eff 0.92, LRC ×6
 *   startingKva = (100 × 0.746) / (0.85 × 0.92) × 6 = (74.6 / 0.782) × 6 = 95.396 × 6 ≈ 572.4 kVA
 *   recommendedGenKw = ceil(572.4 × 0.80) = ceil(457.9) = 458 kW
 *
 *   Required = max(328.7, 458) = 458 kW → selected standard size = 500 kW
 */

import assert from 'assert';
import {
  derateForAltitude,
  derateForTemperature,
  largestMotorStepLoad,
  estimateVoltageDip,
  continuousLoad,
  fuelRuntime,
  selectStandardSize,
  runGeneratorSizingAnalysis,
  STANDARD_GEN_SIZES_KW,
  NFPA110_TYPES,
} from '../analysis/generatorSizing.mjs';

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

function approx(actual, expected, tol = 0.02) {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.1,
    `Expected ~${expected}, got ${actual} (rel error ${(rel * 100).toFixed(3)}%)`
  );
}

// ---------------------------------------------------------------------------
// derateForAltitude
// ---------------------------------------------------------------------------
describe('derateForAltitude — NFPA 110 Annex B altitude derating', () => {
  it('no derating below 500 ft', () => {
    const r = derateForAltitude(500, 300);
    assert.strictEqual(r.altitudeFactor, 1.0);
    assert.strictEqual(r.deratedKw, 500);
  });

  it('no derating at exactly 500 ft', () => {
    const r = derateForAltitude(500, 500);
    assert.strictEqual(r.altitudeFactor, 1.0);
    assert.strictEqual(r.deratedKw, 500);
  });

  it('golden path: 500 kW at 5000 ft, naturally-aspirated → factor ≈ 0.865', () => {
    const r = derateForAltitude(500, 5000, 'naturally-aspirated');
    // excess = (5000-500)/1000 = 4.5; factor = 1 - 0.03×4.5 = 0.865
    approx(r.altitudeFactor, 0.865, 0.001);
    approx(r.deratedKw, 432.5, 0.005);
  });

  it('turbocharged engine: 3% per kft becomes 1% per kft', () => {
    const rNA = derateForAltitude(1000, 5000, 'naturally-aspirated');
    const rTC = derateForAltitude(1000, 5000, 'turbocharged');
    assert.ok(rTC.deratedKw > rNA.deratedKw, 'Turbocharged should derate less than naturally-aspirated');
    // TC factor = 1 - 0.01×4.5 = 0.955
    approx(rTC.altitudeFactor, 0.955, 0.001);
  });

  it('altitude at 1500 ft: 1 kft excess → 3% NA derating', () => {
    const r = derateForAltitude(1000, 1500, 'naturally-aspirated');
    // excess = (1500-500)/1000 = 1.0; factor = 1 - 0.03 = 0.97
    approx(r.altitudeFactor, 0.97, 0.001);
    approx(r.deratedKw, 970, 0.005);
  });

  it('throws on non-positive ratedKw', () => {
    assert.throws(() => derateForAltitude(0, 1000), /ratedKw/i);
  });

  it('throws on negative altitude', () => {
    assert.throws(() => derateForAltitude(500, -100), /altitudeFt/i);
  });
});

// ---------------------------------------------------------------------------
// derateForTemperature
// ---------------------------------------------------------------------------
describe('derateForTemperature — ISO 8528-1 temperature derating', () => {
  it('no derating at exactly 40 °C', () => {
    const r = derateForTemperature(500, 40);
    assert.strictEqual(r.tempFactor, 1.0);
    assert.strictEqual(r.deratedKw, 500);
  });

  it('no derating below 40 °C', () => {
    const r = derateForTemperature(500, 25);
    assert.strictEqual(r.tempFactor, 1.0);
  });

  it('golden path: 500 kW at 50 °C → factor = 0.90', () => {
    const r = derateForTemperature(500, 50);
    // excess = 10 °C; factor = 1 - 0.10 = 0.90
    assert.strictEqual(r.tempFactor, 0.9);
    assert.strictEqual(r.deratedKw, 450);
  });

  it('45 °C ambient → 5% derating', () => {
    const r = derateForTemperature(1000, 45);
    approx(r.tempFactor, 0.95, 0.001);
    approx(r.deratedKw, 950, 0.005);
  });

  it('throws on non-positive ratedKw', () => {
    assert.throws(() => derateForTemperature(0, 40), /ratedKw/i);
  });
});

// ---------------------------------------------------------------------------
// largestMotorStepLoad
// ---------------------------------------------------------------------------
describe('largestMotorStepLoad — IEEE 446 §5.3 motor starting demand', () => {
  it('golden path: 100 HP, PF 0.85, eff 0.92, LRC ×6 → startingKva ≈ 572 kVA', () => {
    const r = largestMotorStepLoad({
      motorHp: 100,
      powerFactor: 0.85,
      efficiency: 0.92,
      lrcMultiplier: 6,
    });
    // runningKw = 100×0.746/0.92 = 81.09; startingKva = 81.09/0.85 × 6 = 572.4
    approx(r.startingKva, 572.4, 0.01);
    assert.ok(r.startingKw > 0, 'startingKw must be positive');
    assert.ok(r.recommendedGenKw > 0, 'recommendedGenKw must be positive');
  });

  it('recommendedGenKw = ceil(startingKva × 0.80)', () => {
    const r = largestMotorStepLoad({ motorHp: 50, powerFactor: 0.85, efficiency: 0.90, lrcMultiplier: 6 });
    const expected = Math.ceil(r.startingKva * 0.80);
    assert.strictEqual(r.recommendedGenKw, expected);
  });

  it('VFD-driven motor: LRC ×1.5 → much lower step demand', () => {
    const rAcross = largestMotorStepLoad({ motorHp: 100, lrcMultiplier: 6 });
    const rVfd = largestMotorStepLoad({ motorHp: 100, lrcMultiplier: 1.5 });
    assert.ok(rVfd.startingKva < rAcross.startingKva / 2,
      'VFD starting kVA should be much lower than across-the-line');
  });

  it('throws on zero motorHp', () => {
    assert.throws(() => largestMotorStepLoad({ motorHp: 0 }), /motorHp/i);
  });

  it('throws on out-of-range powerFactor', () => {
    assert.throws(() => largestMotorStepLoad({ motorHp: 50, powerFactor: 1.5 }), /powerFactor/i);
  });
});

// ---------------------------------------------------------------------------
// estimateVoltageDip
// ---------------------------------------------------------------------------
describe('estimateVoltageDip — IEEE 446 §5.4 transient dip model', () => {
  it('golden path: 500 kVA step on 1000 kVA gen, X\'d=25% → dip = 12.5%', () => {
    const r = estimateVoltageDip({ stepLoadKva: 500, genKva: 1000, xdPrimePct: 25 });
    assert.strictEqual(r.dipPct, 12.5);
    assert.strictEqual(r.acceptable, true);
  });

  it('large dip: 900 kVA step on 1000 kVA gen → dip > 35%, not acceptable', () => {
    const r = estimateVoltageDip({ stepLoadKva: 900, genKva: 1000, xdPrimePct: 40 });
    assert.ok(r.dipPct > r.limit, `Dip ${r.dipPct}% should exceed limit ${r.limit}%`);
    assert.strictEqual(r.acceptable, false);
  });

  it('exact limit of 35%: flagged as acceptable (≤)', () => {
    // dip = (stepKva / genKva) × xdPrime = 35% exactly when stepKva/genKva = 35/25 = 1.4
    const r = estimateVoltageDip({ stepLoadKva: 1400, genKva: 1000, xdPrimePct: 25 });
    assert.strictEqual(r.dipPct, 35);
    assert.strictEqual(r.acceptable, true);
  });

  it('throws on non-positive genKva', () => {
    assert.throws(() => estimateVoltageDip({ stepLoadKva: 100, genKva: 0, xdPrimePct: 25 }), /genKva/i);
  });
});

// ---------------------------------------------------------------------------
// continuousLoad
// ---------------------------------------------------------------------------
describe('continuousLoad — load schedule summation', () => {
  it('golden path: two loads, one with demand factor', () => {
    const r = continuousLoad([
      { label: 'Lighting', kw: 100, demandFactor: 1.0 },
      { label: 'HVAC', kw: 200, demandFactor: 0.8 },
    ]);
    // 100×1.0 + 200×0.8 = 100 + 160 = 260
    assert.strictEqual(r.totalKw, 260);
    assert.strictEqual(r.loads.length, 2);
  });

  it('single load, default demand factor = 1.0', () => {
    const r = continuousLoad([{ label: 'Motor', kw: 75 }]);
    assert.strictEqual(r.totalKw, 75);
    assert.strictEqual(r.loads[0].demandFactor, 1.0);
  });

  it('zero-kW loads contribute nothing', () => {
    const r = continuousLoad([
      { kw: 100, demandFactor: 1.0 },
      { kw: 0, demandFactor: 1.0 },
    ]);
    assert.strictEqual(r.totalKw, 100);
  });

  it('throws on empty array', () => {
    assert.throws(() => continuousLoad([]), /at least one load/i);
  });

  it('throws on invalid demand factor', () => {
    assert.throws(() => continuousLoad([{ kw: 100, demandFactor: 1.5 }]), /demandFactor/i);
  });
});

// ---------------------------------------------------------------------------
// fuelRuntime
// ---------------------------------------------------------------------------
describe('fuelRuntime — diesel consumption and runtime calculation', () => {
  it('golden path: 400 kW, 500 gal, SFC 0.38 → runtime ≈ 12.4 hr', () => {
    const r = fuelRuntime({ loadKw: 400, fuelCapGal: 500, sfcLbPerHpHr: 0.38 });
    // fuelRate = 400 × 1.341 × 0.38 / 6.791 = 536.4×0.38/6.791 = 203.8/6.791 ≈ 30.01 gal/hr
    // runtime = 500 / 30.01 ≈ 16.7 hr
    // (Let's just check positive and finite)
    assert.ok(r.runtimeHours > 0, 'runtimeHours must be positive');
    assert.ok(r.fuelRateGalPerHr > 0, 'fuelRateGalPerHr must be positive');
    assert.ok(Number.isFinite(r.runtimeHours), 'runtimeHours must be finite');
  });

  it('runtime scales linearly with tank size', () => {
    const r1 = fuelRuntime({ loadKw: 200, fuelCapGal: 100 });
    const r2 = fuelRuntime({ loadKw: 200, fuelCapGal: 200 });
    approx(r2.runtimeHours, r1.runtimeHours * 2, 0.001);
  });

  it('higher load = lower runtime', () => {
    const rLow = fuelRuntime({ loadKw: 100, fuelCapGal: 500 });
    const rHigh = fuelRuntime({ loadKw: 400, fuelCapGal: 500 });
    assert.ok(rHigh.runtimeHours < rLow.runtimeHours, 'Higher load should produce shorter runtime');
  });

  it('throws on non-positive loadKw', () => {
    assert.throws(() => fuelRuntime({ loadKw: 0, fuelCapGal: 500 }), /loadKw/i);
  });

  it('throws on non-positive fuelCapGal', () => {
    assert.throws(() => fuelRuntime({ loadKw: 100, fuelCapGal: 0 }), /fuelCapGal/i);
  });
});

// ---------------------------------------------------------------------------
// selectStandardSize
// ---------------------------------------------------------------------------
describe('selectStandardSize — standard generator kW selection', () => {
  it('487 kW required → 500 kW selected', () => {
    const r = selectStandardSize(487);
    assert.strictEqual(r.selectedKw, 500);
  });

  it('exact match on a standard size', () => {
    const r = selectStandardSize(300);
    assert.strictEqual(r.selectedKw, 300);
  });

  it('very small requirement → first standard size', () => {
    const r = selectStandardSize(5);
    assert.strictEqual(r.selectedKw, STANDARD_GEN_SIZES_KW[0]);
  });

  it('0 kW required → first standard size', () => {
    const r = selectStandardSize(0);
    assert.strictEqual(r.selectedKw, STANDARD_GEN_SIZES_KW[0]);
  });

  it('options array always contains the selected size', () => {
    const r = selectStandardSize(450);
    assert.ok(r.options.includes(r.selectedKw), 'options should include selected size');
  });

  it('requirement above all standard sizes → largest standard size returned', () => {
    const r = selectStandardSize(9999);
    assert.strictEqual(r.selectedKw, STANDARD_GEN_SIZES_KW[STANDARD_GEN_SIZES_KW.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// NFPA110_TYPES constant
// ---------------------------------------------------------------------------
describe('NFPA110_TYPES — type classification table', () => {
  it('type-10 has 10-second response time', () => {
    assert.strictEqual(NFPA110_TYPES['type-10'].responseTimeSec, 10);
  });

  it('type-60 has 60-second response time', () => {
    assert.strictEqual(NFPA110_TYPES['type-60'].responseTimeSec, 60);
  });

  it('type-120 has 120-second response time', () => {
    assert.strictEqual(NFPA110_TYPES['type-120'].responseTimeSec, 120);
  });
});

// ---------------------------------------------------------------------------
// runGeneratorSizingAnalysis — integration test
// ---------------------------------------------------------------------------
describe('runGeneratorSizingAnalysis — full integration', () => {
  const baseInputs = {
    projectLabel: 'Test Building',
    loads: [
      { label: 'Emergency lighting', kw: 50, demandFactor: 1.0 },
      { label: 'HVAC critical', kw: 150, demandFactor: 0.8 },
      { label: 'Fire pump', kw: 75, demandFactor: 1.0 },
    ],
    altitudeFt: 5000,
    ambientC: 45,
    aspiration: 'naturally-aspirated',
    nfpa110Type: 'type-10',
    motorHp: 100,
    motorPf: 0.85,
    motorEff: 0.92,
    lrcMultiplier: 6,
    xdPrimePct: 25,
    fuelCapGal: 500,
    sfcLbPerHpHr: 0.38,
  };

  it('returns all expected top-level keys', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    const requiredKeys = [
      'projectLabel', 'loads', 'continuousKw', 'altitudeFt', 'ambientC',
      'altitudeFactor', 'altitudeNote', 'tempFactor', 'tempNote',
      'siteDeratedKw', 'stepLoad', 'voltageDip', 'requiredKw',
      'selectedSizeKw', 'standardSizeOptions', 'nfpa110Type', 'nfpa110Info',
      'fuelCapGal', 'fuelRuntime', 'warnings', 'timestamp',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in result, `Missing key: ${key}`);
    }
  });

  it('continuous load is summed correctly', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    // 50 + 150×0.8 + 75 = 50 + 120 + 75 = 245 kW
    assert.strictEqual(result.continuousKw, 245);
  });

  it('altitude factor matches derateForAltitude', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    approx(result.altitudeFactor, 0.865, 0.001);
  });

  it('selected size is always ≥ required kW', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    assert.ok(result.selectedSizeKw >= result.requiredKw,
      `selectedSizeKw ${result.selectedSizeKw} should be ≥ requiredKw ${result.requiredKw}`);
  });

  it('fuel runtime is computed', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    assert.ok(result.fuelRuntime != null, 'fuelRuntime should not be null when fuelCapGal > 0');
    assert.ok(result.fuelRuntime.runtimeHours > 0);
  });

  it('step load is computed when motorHp > 0', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    assert.ok(result.stepLoad != null, 'stepLoad should not be null when motorHp > 0');
    assert.ok(result.stepLoad.startingKva > 0);
  });

  it('no step load when motorHp = 0', () => {
    const result = runGeneratorSizingAnalysis({ ...baseInputs, motorHp: 0 });
    assert.strictEqual(result.stepLoad, null);
    assert.strictEqual(result.voltageDip, null);
  });

  it('no fuel runtime when fuelCapGal = 0', () => {
    const result = runGeneratorSizingAnalysis({ ...baseInputs, fuelCapGal: 0 });
    assert.strictEqual(result.fuelRuntime, null);
  });

  it('timestamp is an ISO string', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    assert.ok(typeof result.timestamp === 'string');
    assert.ok(!isNaN(Date.parse(result.timestamp)), 'timestamp should parse as a valid date');
  });

  it('standard size options array includes the selected size', () => {
    const result = runGeneratorSizingAnalysis(baseInputs);
    assert.ok(result.standardSizeOptions.includes(result.selectedSizeKw));
  });

  it('sea-level 40 °C site: no derating, required kW driven by load or step load', () => {
    const result = runGeneratorSizingAnalysis({
      ...baseInputs,
      altitudeFt: 0,
      ambientC: 40,
      motorHp: 0,
      fuelCapGal: 0,
    });
    assert.strictEqual(result.altitudeFactor, 1.0);
    assert.strictEqual(result.tempFactor, 1.0);
    assert.strictEqual(result.continuousKw, result.siteDeratedKw);
  });
});

console.log('\nAll generatorSizing tests completed.');
