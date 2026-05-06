import assert from 'node:assert/strict';
import {
  parseProfileCsv,
  builtinDailyProfile,
  builtinAnnualProfile,
  classifyVoltage,
  runQuasiDynamic,
  VOLTAGE_HIGH_PU,
  VOLTAGE_LOW_PU,
  VOLTAGE_WARN_HIGH_PU,
  VOLTAGE_WARN_LOW_PU,
} from '../analysis/quasiDynamic.mjs';

// ---------------------------------------------------------------------------
// Module constants
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.equal(VOLTAGE_HIGH_PU,      1.05, 'ANSI C84.1 Range A upper = 1.05 pu');
  assert.equal(VOLTAGE_LOW_PU,       0.95, 'ANSI C84.1 Range A lower = 0.95 pu');
  assert.equal(VOLTAGE_WARN_HIGH_PU, 1.03, 'warn upper = 1.03 pu');
  assert.equal(VOLTAGE_WARN_LOW_PU,  0.97, 'warn lower = 0.97 pu');
})();

// ---------------------------------------------------------------------------
// classifyVoltage
// ---------------------------------------------------------------------------
(function testClassifyVoltage() {
  // High side
  assert.equal(classifyVoltage(1.06, 'high'), 'fail',  'vm > 1.05 → fail (high)');
  assert.equal(classifyVoltage(1.05, 'high'), 'warn',  'vm = 1.05 → warn (at limit, ≤ 1.05 is still Range A)');
  assert.equal(classifyVoltage(1.04, 'high'), 'warn',  '1.03 < vm < 1.05 → warn (high)');
  assert.equal(classifyVoltage(1.03, 'high'), 'pass',  'vm = 1.03 → pass (warn starts above 1.03)');
  assert.equal(classifyVoltage(1.00, 'high'), 'pass',  'nominal voltage → pass (high)');
  assert.equal(classifyVoltage(0.95, 'high'), 'pass',  'low voltage is pass for high-side check');

  // Low side
  assert.equal(classifyVoltage(0.94, 'low'), 'fail',  'vm < 0.95 → fail (low)');
  assert.equal(classifyVoltage(0.95, 'low'), 'warn',  'vm = 0.95 → warn (at limit, ≥ 0.95 is still Range A)');
  assert.equal(classifyVoltage(0.96, 'low'), 'warn',  '0.95 < vm < 0.97 → warn (low)');
  assert.equal(classifyVoltage(0.97, 'low'), 'pass',  'vm = 0.97 → pass (warn starts below 0.97)');
  assert.equal(classifyVoltage(1.00, 'low'), 'pass',  'nominal voltage → pass (low)');
  assert.equal(classifyVoltage(1.05, 'low'), 'pass',  'high voltage is pass for low-side check');

  // Non-finite input
  assert.equal(classifyVoltage(NaN,       'high'), 'warn', 'NaN → warn');
  assert.equal(classifyVoltage(Infinity,  'low'),  'warn', 'Infinity is non-finite → warn');
})();

// ---------------------------------------------------------------------------
// parseProfileCsv
// ---------------------------------------------------------------------------
(function testParseProfileCsv() {
  // 3-column with header
  const csv3 = `# comment\nhour, loadScale, genScale\n0, 0.5, 1.0\n1, 0.8, 0.9\n`;
  const r3 = parseProfileCsv(csv3);
  assert.equal(r3.length, 2, '2 data rows parsed from 3-col CSV');
  assert.equal(r3[0].hour, 0);
  assert.ok(Math.abs(r3[0].loadScale - 0.5) < 1e-9);
  assert.ok(Math.abs(r3[0].genScale  - 1.0) < 1e-9);
  assert.equal(r3[1].hour, 1);
  assert.ok(Math.abs(r3[1].loadScale - 0.8) < 1e-9);
  assert.ok(Math.abs(r3[1].genScale  - 0.9) < 1e-9);

  // 2-column (hour, loadScale) — genScale defaults to 1.0
  const csv2 = '0,0.6\n1,0.9\n2,1.0';
  const r2 = parseProfileCsv(csv2);
  assert.equal(r2.length, 3, '3 rows from 2-col CSV');
  assert.ok(Math.abs(r2[0].genScale - 1.0) < 1e-9, 'genScale defaults to 1.0 in 2-col mode');

  // 1-column (loadScale only) — hours auto-assigned
  const csv1 = '0.5\n0.8\n1.0\n0.7';
  const r1 = parseProfileCsv(csv1);
  assert.equal(r1.length, 4, '4 rows from 1-col CSV');
  assert.equal(r1[0].hour, 0, 'auto-hour starts at 0');
  assert.equal(r1[3].hour, 3, 'auto-hour increments');

  // Tab-separated values
  const csvTab = '0\t0.5\t1.0\n1\t0.9\t1.0';
  const rTab = parseProfileCsv(csvTab);
  assert.equal(rTab.length, 2, 'tab-delimited CSV parsed');

  // Comment lines and blank lines are skipped
  const csvComment = '# this is a comment\n\n0, 0.5, 1.0\n';
  const rCom = parseProfileCsv(csvComment);
  assert.equal(rCom.length, 1, 'comments and blank lines skipped');

  // Non-numeric rows skipped
  const csvMixed = 'hour,loadScale,genScale\n0,0.5,1.0\nbad,row,here\n1,0.8,1.0';
  const rMix = parseProfileCsv(csvMixed);
  assert.equal(rMix.length, 2, 'non-numeric rows skipped');

  // Negative loadScale rows are skipped
  const csvNeg = '0, -0.5, 1.0\n1, 0.8, 1.0';
  const rNeg = parseProfileCsv(csvNeg);
  assert.equal(rNeg.length, 1, 'negative loadScale row is skipped');
  assert.ok(Math.abs(rNeg[0].loadScale - 0.8) < 1e-9, 'remaining row has correct loadScale');

  // Type check
  assert.throws(() => parseProfileCsv(123), /csvText must be a string/, 'non-string throws');
})();

// ---------------------------------------------------------------------------
// builtinDailyProfile
// ---------------------------------------------------------------------------
(function testBuiltinDailyProfile() {
  const profile = builtinDailyProfile();
  assert.equal(profile.length, 24, '24-hour daily profile has 24 steps');
  assert.equal(profile[0].hour, 0, 'first hour = 0');
  assert.equal(profile[23].hour, 23, 'last hour = 23');
  assert.ok(profile.every(p => p.loadScale >= 0 && p.loadScale <= 1.0), 'all loadScales in [0, 1]');
  assert.ok(profile.every(p => p.genScale === 1.0), 'genScale = 1.0 for all steps');
  const peakScale = Math.max(...profile.map(p => p.loadScale));
  assert.equal(peakScale, 1.0, 'peak load factor = 1.0 (normalised to peak)');
})();

// ---------------------------------------------------------------------------
// builtinAnnualProfile
// ---------------------------------------------------------------------------
(function testBuiltinAnnualProfile() {
  const profile = builtinAnnualProfile();
  assert.equal(profile.length, 8760, '8760-hour annual profile');
  assert.equal(profile[0].hour, 0, 'first hour = 0');
  assert.equal(profile[8759].hour, 8759, 'last hour = 8759');
  assert.ok(profile.every(p => p.loadScale >= 0 && p.loadScale <= 1.0), 'all loadScales in [0, 1]');
  // Weekends (day 5 and 6, i.e. hours 5*24 – 6*24+23) should have lower load
  const weekdayPeak = profile[0 * 24 + 12].loadScale; // midday Monday
  const weekendPeak = profile[5 * 24 + 12].loadScale; // midday Saturday
  assert.ok(weekendPeak < weekdayPeak, 'weekend load lower than weekday');
})();

// ---------------------------------------------------------------------------
// runQuasiDynamic — error handling
// ---------------------------------------------------------------------------
(function testRunQuasiDynamicErrors() {
  assert.throws(
    () => runQuasiDynamic(null, [], {}),
    /profiles must be a non-empty array/,
    'empty profiles array throws'
  );
  assert.throws(
    () => runQuasiDynamic(null, null, {}),
    /profiles must be a non-empty array/,
    'null profiles throws'
  );
  // Model with no buses throws
  const emptyModel = { buses: [], branches: [] };
  assert.throws(
    () => runQuasiDynamic(emptyModel, [{ hour: 0, loadScale: 1, genScale: 1 }]),
    /No load flow model available/,
    'empty model throws'
  );
})();

// ---------------------------------------------------------------------------
// runQuasiDynamic — 3-bus fixture
// ---------------------------------------------------------------------------
(function testRunQuasiDynamicFixture() {
  // Minimal 3-bus system: slack → PQ load bus, with a second load bus
  const model = {
    buses: [
      { id: 'S', label: 'Slack', busType: 'slack', Vm: 1.0, Va: 0,  baseKV: 13.8, load: { kw: 0,   kvar: 0 }, generation: { kw: 999, kvar: 0 } },
      { id: 'A', label: 'BusA',  busType: 'PQ',    Vm: 1.0, Va: 0,  baseKV: 13.8, load: { kw: 500, kvar: 100 }, generation: null,
        connections: [{ target: 'S', impedance: { r: 0.01, x: 0.05 } }] },
      { id: 'B', label: 'BusB',  busType: 'PQ',    Vm: 1.0, Va: 0,  baseKV: 13.8, load: { kw: 300, kvar: 60 },  generation: null,
        connections: [{ target: 'A', impedance: { r: 0.01, x: 0.05 } }] },
    ],
    branches: [],
  };

  const profiles = [
    { hour: 0,  loadScale: 0.5, genScale: 1.0 },
    { hour: 1,  loadScale: 1.0, genScale: 1.0 },
    { hour: 2,  loadScale: 0.3, genScale: 1.0 },
  ];

  const result = runQuasiDynamic(model, profiles, { baseMVA: 100, balanced: true, maxIterations: 30 });

  assert.equal(result.timestepCount, 3, 'three timesteps');
  assert.ok(result.convergedCount > 0, 'at least one timestep converged');
  assert.ok(Array.isArray(result.timeSeries), 'timeSeries is array');
  assert.equal(result.timeSeries.length, 3, 'timeSeries has 3 entries');

  // Peak step should be hour 1 (loadScale = 1.0 → highest total load)
  if (result.peakStep) {
    assert.equal(result.peakStep.hour, 1, 'peak step at hour 1 (max loadScale)');
  }
  // Valley step should be hour 2 (loadScale = 0.3 → lowest total load)
  if (result.valleyStep) {
    assert.equal(result.valleyStep.hour, 2, 'valley step at hour 2 (min loadScale)');
  }

  // Voltage envelope should exist for converged steps
  assert.ok(Array.isArray(result.busEnvelope), 'busEnvelope is array');

  // Energy loss should be non-negative
  assert.ok(result.totalEnergyLossKwh >= 0, 'energy loss ≥ 0');

  // Warnings is array
  assert.ok(Array.isArray(result.warnings), 'warnings is array');

  // Load factor: avg / peak — should be between 0 and 1 for this profile
  if (result.loadFactor !== null) {
    assert.ok(result.loadFactor > 0 && result.loadFactor <= 1.0, 'load factor in (0, 1]');
  }

  // avgLoadKw should be >= 0
  assert.ok(result.avgLoadKw >= 0, 'avgLoadKw >= 0');
})();

// ---------------------------------------------------------------------------
// runQuasiDynamic — energy loss accumulation across steps
// ---------------------------------------------------------------------------
(function testEnergyLossAccumulation() {
  const model = {
    buses: [
      { id: 'S', label: 'Slack', busType: 'slack', Vm: 1.0, Va: 0, baseKV: 13.8, load: { kw: 0, kvar: 0 }, generation: { kw: 999, kvar: 0 } },
      { id: 'L', label: 'Load',  busType: 'PQ',    Vm: 1.0, Va: 0, baseKV: 13.8, load: { kw: 1000, kvar: 200 }, generation: null,
        connections: [{ target: 'S', impedance: { r: 0.02, x: 0.08 } }] },
    ],
    branches: [],
  };

  // Two identical steps — energy loss should be exactly double a single step
  const single = runQuasiDynamic(model, [{ hour: 0, loadScale: 1.0, genScale: 1.0 }], { baseMVA: 100, balanced: true });
  const double = runQuasiDynamic(model, [
    { hour: 0, loadScale: 1.0, genScale: 1.0 },
    { hour: 1, loadScale: 1.0, genScale: 1.0 },
  ], { baseMVA: 100, balanced: true });

  if (single.convergedCount > 0 && double.convergedCount === 2) {
    assert.ok(Math.abs(double.totalEnergyLossKwh - 2 * single.totalEnergyLossKwh) < 0.01,
      'energy loss doubles when the same step is repeated twice');
  }
})();

console.log('quasiDynamic.test.mjs: all assertions passed');
