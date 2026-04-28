import assert from 'node:assert/strict';
import {
  computeSourceImpedance,
  computeCapacitorImpedance,
  computeFilterImpedance,
  computeCableImpedance,
  parallelImpedances,
  identifyResonances,
  runFrequencyScan,
} from '../analysis/frequencyScan.mjs';
import { buildHarmonicFilterAlternatives } from '../analysis/harmonicStudyCase.mjs';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function baseInput(overrides = {}) {
  return {
    baseFreqHz: 60,
    systemKv: 4.16,
    scMva: 50,
    xrRatio: 10,
    capacitorBanks: [{ kvar: 600, label: 'Cap Bank 1' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeSourceImpedance
// ---------------------------------------------------------------------------
(function testSourceImpedance() {
  // Z_base = 4.16² / 50 = 0.34611 Ω
  // den = √(101) ≈ 10.0499
  // R = 0.34611 / 10.0499 ≈ 0.03444 Ω
  // X1 = 10 × R ≈ 0.3444 Ω
  const z1 = computeSourceImpedance(1, { systemKv: 4.16, scMva: 50, xrRatio: 10 });
  assert.ok(z1.r > 0, 'source R must be positive');
  assert.ok(z1.x > 0, 'source X at h=1 must be positive');

  const z5 = computeSourceImpedance(5, { systemKv: 4.16, scMva: 50, xrRatio: 10 });
  assert.ok(Math.abs(z5.x / z1.x - 5) < 0.001, 'source X scales 5× at h=5');
  assert.ok(Math.abs(z5.r - z1.r) < 0.0001, 'source R is constant across harmonics');
})();

// ---------------------------------------------------------------------------
// computeCapacitorImpedance
// ---------------------------------------------------------------------------
(function testCapacitorImpedance() {
  // X_c1 = 4.16² × 1000 / 600 = 28.835 Ω
  // At h=1: Z_cap = -j × 28.835
  const zc1 = computeCapacitorImpedance(1, { kvar: 600, systemKv: 4.16 });
  assert.equal(zc1.r, 0, 'cap R must be zero');
  assert.ok(zc1.x < 0, 'cap X must be negative (capacitive)');

  const zc5 = computeCapacitorImpedance(5, { kvar: 600, systemKv: 4.16 });
  assert.ok(Math.abs(zc5.x / zc1.x - 1 / 5) < 0.001, 'cap X scales as 1/h');
})();

// ---------------------------------------------------------------------------
// computeFilterImpedance — series LC
// ---------------------------------------------------------------------------
(function testFilterImpedance() {
  // 5.67% reactor tunes to h_tune = √(100/5.67) ≈ 4.20
  const f = { reactorPct: 5.67, kvar: 600, systemKv: 4.16 };

  const zf4 = computeFilterImpedance(4, f);
  const zf5 = computeFilterImpedance(5, f);

  // Below tuning frequency the filter is capacitive (negative X)
  assert.ok(zf4.x < 0, 'filter is capacitive below tuning frequency');
  // Above tuning frequency the filter is inductive (positive X)
  assert.ok(zf5.x > 0, 'filter is inductive above tuning frequency');

  // Exactly at tuning order the impedance approaches zero (series resonance)
  const hTune = Math.sqrt(100 / 5.67);
  const zfTune = computeFilterImpedance(hTune, f);
  assert.ok(Math.abs(zfTune.x) < 0.01, 'filter impedance ≈ 0 at tuning frequency');
})();

// ---------------------------------------------------------------------------
// computeCableImpedance
// ---------------------------------------------------------------------------
(function testCableImpedance() {
  const c = { rOhmPerKft: 0.1, xOhmPerKft: 0.05, lengthKft: 2 };
  const zc1 = computeCableImpedance(1, c);
  assert.equal(zc1.r, 0.2, 'cable R = r_per_kft × length');
  assert.equal(zc1.x, 0.1, 'cable X at h=1');

  const zc5 = computeCableImpedance(5, c);
  assert.equal(zc5.r, 0.2, 'cable R constant with harmonic');
  assert.equal(zc5.x, 0.5, 'cable X × 5 at h=5');
})();

// ---------------------------------------------------------------------------
// parallelImpedances
// ---------------------------------------------------------------------------
(function testParallelImpedances() {
  // Two equal resistors in parallel → half resistance
  const z = parallelImpedances([{ r: 2, x: 0 }, { r: 2, x: 0 }]);
  assert.ok(Math.abs(z.r - 1) < 0.0001, 'two equal R in parallel → R/2');
  assert.ok(Math.abs(z.x) < 0.0001, 'no reactive component for pure R parallel');

  // Inductive + capacitive at near-resonance: Z >> source impedance
  const zRes = parallelImpedances([{ r: 0.01, x: 1 }, { r: 0, x: -1 }]);
  assert.ok(zRes.r > 50, 'near-resonance produces large impedance magnitude');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — basic structure
// ---------------------------------------------------------------------------
(function testScanBasicStructure() {
  const result = runFrequencyScan(baseInput());
  assert.ok(Array.isArray(result.points), 'points must be an array');
  assert.ok(result.points.length > 0, 'must have scan points');
  assert.ok(Array.isArray(result.resonances), 'resonances must be an array');
  assert.ok(Array.isArray(result.warnings), 'warnings must be an array');

  // Default range 1–50 with SCAN_STEP=0.5 → 99 points
  assert.equal(result.points.length, 99, 'default scan has 99 points (1 to 50 in 0.5 steps)');
  assert.equal(result.points[0].h, 1, 'first point at h=1');
  assert.equal(result.points[result.points.length - 1].h, 50, 'last point at h=50');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — monotonic source with no cap banks
// ---------------------------------------------------------------------------
(function testScanMonotonicSourceOnly() {
  const result = runFrequencyScan(baseInput({ capacitorBanks: [] }));

  // Without cap banks, Z = Z_source which is mostly inductive → grows with h
  // Z_mag at h=10 should be greater than at h=1
  const z1 = result.points.find(p => p.h === 1).zMagOhm;
  const z10 = result.points.find(p => p.h === 10).zMagOhm;
  assert.ok(z10 > z1, 'source impedance magnitude grows with harmonic order');
  assert.equal(result.resonances.length, 0, 'no resonances when no shunt capacitance');
  assert.ok(result.warnings.some(w => /no capacitor/.test(w.toLowerCase())), 'warning when no cap banks');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — resonance near expected harmonic order (IEEE 519 formula)
// ---------------------------------------------------------------------------
(function testScanResonanceMatchesFormula() {
  // h_r = √(S_sc_kva / Q_cap_kvar) = √(50000 / 600) ≈ 9.13
  const expectedHr = Math.sqrt(50000 / 600);
  const result = runFrequencyScan(baseInput());

  assert.ok(result.resonances.length > 0, 'should find at least one resonance');

  const parallel = result.resonances.find(r => r.type === 'parallel');
  assert.ok(parallel, 'should find a parallel resonance');
  assert.ok(
    Math.abs(parallel.h - expectedHr) <= 1.0,
    `parallel resonance h=${parallel.h} should be within 1 of formula h_r=${expectedHr.toFixed(2)}`
  );

  // h ≈ 9.1 is far from 7th and 11th harmonics (nearest dominants) → risk = 'low'
  assert.equal(parallel.risk, 'low', 'resonance at h≈9 is low risk (not near 5/7/11/13)');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — larger cap bank shifts resonance lower
// ---------------------------------------------------------------------------
(function testScanResonanceShiftsWithCapBank() {
  // Larger kVAR → lower resonance order: h_r = √(50000/kVAR)
  // 300 kVAR → h_r ≈ 12.9 (caution — near 13th harmonic)
  const result = runFrequencyScan(baseInput({ capacitorBanks: [{ kvar: 300, label: 'Big Bank' }] }));
  const parallel = result.resonances.find(r => r.type === 'parallel');
  assert.ok(parallel, 'should find a parallel resonance');
  assert.ok(parallel.h > 10, 'larger kVAR bank resonance should be at lower h value... wait larger kVAR = smaller X_c = lower h_r');
  // Actually: bigger kVAR → smaller X_c → resonance at LOWER h
  // h_r = √(S_sc / Q) and bigger Q → smaller h_r (h_r ≈ 12.9 for 300 kVAR)
  // Compared to 600 kVAR (h_r ≈ 9.1), 300 kVAR → h_r ≈ 12.9 (higher!)
  // Because h_r = √(50000/300) ≈ 12.9 vs √(50000/600) ≈ 9.1
  // So smaller kVAR → higher resonance order
  const smallResult = runFrequencyScan(baseInput({ capacitorBanks: [{ kvar: 1200, label: 'Large' }] }));
  const smallParallel = smallResult.resonances.find(r => r.type === 'parallel');
  assert.ok(smallParallel && smallParallel.h < parallel.h, 'larger kVAR bank resonates at lower harmonic order');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — detuned filter shifts resonance below 5th harmonic
// ---------------------------------------------------------------------------
(function testScanDetunedFilter() {
  // 5.67% reactor tunes to h=4.2, so resonance moves to ~4.2 (below 5th)
  const result = runFrequencyScan(baseInput({
    capacitorBanks: [],
    filters: [{ reactorPct: 5.67, kvar: 600, label: '5th Detuned' }],
  }));

  assert.ok(result.resonances.length > 0, 'detuned filter should produce a resonance');
  const parallel = result.resonances.find(r => r.type === 'parallel');
  assert.ok(parallel, 'should find a parallel resonance with filter');
  assert.ok(parallel.h < 5, 'detuned 5.67% filter resonance should be below 5th harmonic');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — danger classification when resonance is on a dominant harmonic
// ---------------------------------------------------------------------------
(function testScanDangerClassification() {
  // Force resonance near 5th harmonic: h_r = √(S_sc/Q) ≈ 5 → Q = S_sc/25
  // 50 MVA → Q = 50000 kVAR / 25 = 2000 kVAR
  const result = runFrequencyScan(baseInput({
    capacitorBanks: [{ kvar: 2000, label: 'Resonant at 5th' }],
  }));
  const parallel = result.resonances.find(r => r.type === 'parallel');
  assert.ok(parallel, 'should find parallel resonance');
  // h_r = √(50000/2000) = √25 = 5 → exactly on 5th harmonic → danger
  assert.ok(['danger', 'caution'].includes(parallel.risk), 'resonance at h=5 should be danger or caution');
})();

// ---------------------------------------------------------------------------
// harmonic study-case integration
// ---------------------------------------------------------------------------
(function testHarmonicStudyFilterAlternativeUsesFrequencyScanRisk() {
  const scan = runFrequencyScan(baseInput({ capacitorBanks: [{ kvar: 2000, label: 'Resonant at 5th' }] }));
  const filters = buildHarmonicFilterAlternatives({
    studyCase: { pccBus: 'PCC-1', nominalVoltageKv: 4.16, utilityScMva: 50, maximumDemandCurrentA: 1000 },
    sourceRows: [{ id: 'vfd-1', tag: 'VFD-1', sourceType: 'vfd', fundamentalCurrentA: 300, spectrumText: '5:35,7:25' }],
    frequencyScan: scan,
  });
  assert.ok(filters.some(row => row.frequencyScanResonanceRisk === 'danger' || row.frequencyScanResonanceRisk === 'caution'), 'filter alternatives carry scan resonance risk');
})();

// ---------------------------------------------------------------------------
// runFrequencyScan — validation errors
// ---------------------------------------------------------------------------
(function testScanValidationErrors() {
  assert.throws(
    () => runFrequencyScan({ ...baseInput(), systemKv: -1 }),
    /systemKv must be a positive number/,
    'negative systemKv should throw'
  );

  assert.throws(
    () => runFrequencyScan({ ...baseInput(), scMva: 0 }),
    /scMva must be greater than zero/,
    'zero scMva should throw'
  );

  assert.throws(
    () => runFrequencyScan({ ...baseInput(), xrRatio: -5 }),
    /xrRatio must be a positive number/,
    'negative xrRatio should throw'
  );

  assert.throws(
    () => runFrequencyScan({ ...baseInput(), capacitorBanks: [{ kvar: -100 }] }),
    /kVAR must be greater than zero/,
    'negative cap bank kVAR should throw'
  );

  assert.throws(
    () => runFrequencyScan({ ...baseInput(), filters: [{ reactorPct: 0, kvar: 600 }] }),
    /reactorPct must be between/,
    'zero reactorPct should throw'
  );
})();

// ---------------------------------------------------------------------------
// identifyResonances — direct unit test
// ---------------------------------------------------------------------------
(function testIdentifyResonances() {
  const flat = [
    { h: 1, freqHz: 60, zMagOhm: 1 },
    { h: 2, freqHz: 120, zMagOhm: 2 },
    { h: 3, freqHz: 180, zMagOhm: 3 },
  ];
  assert.equal(identifyResonances(flat).length, 0, 'no resonances in monotonic series');

  const withPeak = [
    { h: 1, freqHz: 60, zMagOhm: 1 },
    { h: 2, freqHz: 120, zMagOhm: 10 },
    { h: 3, freqHz: 180, zMagOhm: 1 },
  ];
  const r = identifyResonances(withPeak);
  assert.equal(r.length, 1, 'should find one peak');
  assert.equal(r[0].type, 'parallel', 'peak is a parallel resonance');
  assert.equal(r[0].h, 2, 'peak at h=2');
})();

console.log('✓ frequency scan tests passed');
