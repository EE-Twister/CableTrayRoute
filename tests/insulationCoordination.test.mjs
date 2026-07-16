import assert from 'node:assert/strict';
import {
  getStandardLevels,
  atmosphericCorrectionFactor,
  coordinationWithstandVoltage,
  protectiveMargin,
  surgeArresterMcov,
  temporaryOvervoltage,
  selectStandardBil,
  statisticalRiskOfFailure,
  runInsulationCoordinationStudy,
  IEC60071_RANGE_I,
  IEC60071_RANGE_II,
  TOV_FACTOR,
  MIN_PROTECTIVE_MARGIN_LI_PCT,
  MIN_PROTECTIVE_MARGIN_SI_PCT,
  SAFETY_FACTOR_DETERMINISTIC,
  SAFETY_FACTOR_STATISTICAL,
} from '../analysis/insulationCoordination.mjs';

// ---------------------------------------------------------------------------
// Module constants
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.equal(MIN_PROTECTIVE_MARGIN_LI_PCT, 20, 'LI margin requirement is 20%');
  assert.equal(MIN_PROTECTIVE_MARGIN_SI_PCT, 15, 'SI margin requirement is 15%');
  assert.equal(SAFETY_FACTOR_DETERMINISTIC, 1.15, 'deterministic Ks = 1.15');
  assert.equal(SAFETY_FACTOR_STATISTICAL, 1.05, 'statistical Ks = 1.05');
  assert.ok(IEC60071_RANGE_I.length >= 13, 'Range I has at least 13 entries');
  assert.ok(IEC60071_RANGE_II.length >= 6, 'Range II has at least 6 entries');
  assert.ok(Object.keys(TOV_FACTOR).includes('solidly_grounded'), 'TOV_FACTOR has solidly_grounded');
  assert.ok(Object.keys(TOV_FACTOR).includes('isolated'), 'TOV_FACTOR has isolated');
  console.log('✓ module constants');
})();

// ---------------------------------------------------------------------------
// getStandardLevels — Range I exact matches
// ---------------------------------------------------------------------------
(function testGetStandardLevels() {
  // Um = 145 kV — standard transformer class for 138 kV systems
  const r145 = getStandardLevels(145);
  assert.ok(r145, 'finds 145 kV entry');
  assert.equal(r145.um, 145, 'um = 145');
  assert.ok(r145.liwv.includes(550), '145 kV has 550 kV BIL option');
  assert.ok(r145.liwv.includes(650), '145 kV has 650 kV BIL option');
  assert.ok(r145.pfwv.includes(275), '145 kV has 275 kV PFWV option');
  assert.equal(r145.rangeII, false, '145 kV is Range I');

  // Um = 245 kV
  const r245 = getStandardLevels(245);
  assert.ok(r245.liwv.includes(1050), '245 kV has 1050 kV BIL');

  // Um = 72.5 kV
  const r72 = getStandardLevels(72.5);
  assert.equal(r72.liwv[0], 325, '72.5 kV BIL = 325 kV');
  assert.equal(r72.pfwv[0], 140, '72.5 kV PFWV = 140 kV rms');

  // Range II
  const r362 = getStandardLevels(362);
  assert.equal(r362.rangeII, true, '362 kV is Range II');
  assert.ok(r362.siwv.includes(850), '362 kV has 850 kV SIL');

  // Non-standard Um → next higher
  const rNext = getStandardLevels(150);
  assert.equal(rNext.um, 170, 'Um=150 (non-standard) maps to next higher Um=170');

  // Invalid input
  assert.throws(() => getStandardLevels(-1), /positive/, 'negative Um throws');
  console.log('✓ getStandardLevels');
})();

// ---------------------------------------------------------------------------
// atmosphericCorrectionFactor — IEC 60071-2 §3.3
// ---------------------------------------------------------------------------
(function testAtmosphericCorrection() {
  // Sea level → Ka = 1.0
  assert.equal(atmosphericCorrectionFactor(0), 1, 'Ka = 1.0 at sea level');

  // 1000 m, m = 1.0 → Ka = e^(1000/8150) ≈ 1.1290
  const ka1000 = atmosphericCorrectionFactor(1000, 1.0);
  assert.ok(ka1000 > 1.12 && ka1000 < 1.14, `Ka(1000m) ≈ 1.13, got ${ka1000}`);

  // 2000 m, m = 1.0 → Ka = e^(2000/8150) ≈ 1.2746
  const ka2000 = atmosphericCorrectionFactor(2000, 1.0);
  assert.ok(ka2000 > 1.27 && ka2000 < 1.29, `Ka(2000m) ≈ 1.27, got ${ka2000}`);

  // PF exponent m = 0.75
  const kaPF1000 = atmosphericCorrectionFactor(1000, 0.75);
  assert.ok(kaPF1000 < ka1000, 'PF Ka < LI Ka at same altitude');
  assert.ok(kaPF1000 > 1.0, 'PF Ka > 1 at altitude');

  // Invalid inputs
  assert.throws(() => atmosphericCorrectionFactor(-10), /non-negative/, 'negative altitude throws');
  assert.throws(() => atmosphericCorrectionFactor(1000, 0), /positive/, 'zero exponent throws');
  console.log('✓ atmosphericCorrectionFactor');
})();

// ---------------------------------------------------------------------------
// coordinationWithstandVoltage — Ucw = Urp × Ks × Ka
// ---------------------------------------------------------------------------
(function testCoordinationWithstand() {
  // Urp = 416 kV, Ks = 1.15, Ka = 1.0 → Ucw = 478.4 kV
  const ucw = coordinationWithstandVoltage(416, 1.15, 1.0);
  assert.ok(Math.abs(ucw - 478.4) < 0.1, `Ucw = 478.4 kV, got ${ucw}`);

  // At altitude 1000m, Ka ≈ 1.129 → Ucw should be larger
  const ka = atmosphericCorrectionFactor(1000);
  const ucwAlt = coordinationWithstandVoltage(416, 1.15, ka);
  assert.ok(ucwAlt > ucw, 'altitude increases Ucw');

  // Statistical Ks = 1.05
  const ucwStat = coordinationWithstandVoltage(416, 1.05, 1.0);
  assert.ok(ucwStat < ucw, 'statistical Ucw < deterministic Ucw');
  assert.ok(Math.abs(ucwStat - 436.8) < 0.5, `statistical Ucw ≈ 436.8, got ${ucwStat}`);

  // Invalid inputs
  assert.throws(() => coordinationWithstandVoltage(0, 1.15, 1.0), /greater than zero/);
  assert.throws(() => coordinationWithstandVoltage(416, 0.9, 1.0), /≥ 1.0/);
  assert.throws(() => coordinationWithstandVoltage(416, 1.15, 0.5), /≥ 1.0/);
  console.log('✓ coordinationWithstandVoltage');
})();

// ---------------------------------------------------------------------------
// protectiveMargin — Mp = (selected withstand/Ures − 1) × 100
// ---------------------------------------------------------------------------
(function testProtectiveMargin() {
  // Selected BIL = 550, Ures = 416 → Mp = 32.2% → PASS.
  const mp1 = protectiveMargin(550, 416, 'li');
  assert.ok(mp1.marginPct > 32 && mp1.marginPct < 33, `Mp ≈ 32.2%, got ${mp1.marginPct}`);
  assert.equal(mp1.pass, true, 'equipment-to-arrester margin ≥ 20% → PASS for LI');
  assert.equal(mp1.minMarginPct, 20, 'LI min margin = 20%');

  // Same BIL with a 500 kV arrester protective level gives only 10% → FAIL.
  const mp2 = protectiveMargin(550, 500, 'li');
  assert.equal(mp2.marginPct, 10);
  assert.equal(mp2.pass, false, 'margin < 20% → FAIL for LI');

  // Switching impulse — min margin = 15%
  const mp3 = protectiveMargin(900, 800, 'si');
  assert.ok(mp3.marginPct > 12 && mp3.marginPct < 13, `SI Mp ≈ 12.5%, got ${mp3.marginPct}`);
  assert.equal(mp3.pass, false, 'SI margin < 15% → FAIL');
  assert.equal(mp3.minMarginPct, 15, 'SI min margin = 15%');

  const mp4 = protectiveMargin(900, 750, 'si');
  assert.equal(mp4.pass, true, 'SI margin ≥ 15% → PASS');

  // Invalid inputs
  assert.throws(() => protectiveMargin(0, 416, 'li'), /greater than zero/);
  assert.throws(() => protectiveMargin(478, 0, 'li'), /greater than zero/);
  console.log('✓ protectiveMargin');
})();

// ---------------------------------------------------------------------------
// surgeArresterMcov — minimum MCOV by earthing type
// ---------------------------------------------------------------------------
(function testSurgeArresterMcov() {
  // Solidly earthed: MCOV ≥ Um / √3
  const m145solid = surgeArresterMcov(145, 'solidly_grounded');
  assert.ok(Math.abs(m145solid.mcovMinKv - 83.72) < 0.1, `MCOV = 83.7 kV, got ${m145solid.mcovMinKv}`);

  // Isolated: MCOV ≥ Um
  const m145iso = surgeArresterMcov(145, 'isolated');
  assert.equal(m145iso.mcovMinKv, 145, 'isolated MCOV = Um = 145 kV');

  // High resistance: same as isolated
  const m36hr = surgeArresterMcov(36, 'high_resistance');
  assert.equal(m36hr.mcovMinKv, 36, 'high-R MCOV = Um for Um=36 kV');

  // Low resistance: treated as effectively earthed
  const m72lr = surgeArresterMcov(72.5, 'low_resistance');
  assert.ok(m72lr.mcovMinKv < 72.5, 'low-R MCOV < Um');

  // Invalid
  assert.throws(() => surgeArresterMcov(0, 'solidly_grounded'), /greater than zero/);
  console.log('✓ surgeArresterMcov');
})();

// ---------------------------------------------------------------------------
// temporaryOvervoltage — TOV magnitude by earthing type
// ---------------------------------------------------------------------------
(function testTemporaryOvervoltage() {
  // Solidly earthed (factor 1.0): TOV = Um / √3
  const tov145 = temporaryOvervoltage(145, 'solidly_grounded');
  assert.ok(Math.abs(tov145.tovKvRms - 83.72) < 0.1, `TOV rms ≈ 83.7 kV, got ${tov145.tovKvRms}`);
  assert.equal(tov145.factor, 1.0, 'solidly earthed factor = 1.0');

  // Isolated (factor 1.73): TOV = Um
  const tov145iso = temporaryOvervoltage(145, 'isolated');
  assert.ok(tov145iso.tovKvRms > 144 && tov145iso.tovKvRms < 146, `TOV ≈ Um for isolated`);
  assert.equal(tov145iso.factor, 1.73, 'isolated factor = 1.73');

  // Peak = rms × √2
  assert.ok(Math.abs(tov145.tovKvPeak - tov145.tovKvRms * Math.sqrt(2)) < 0.01, 'peak = rms × √2');

  // Invalid Um
  assert.throws(() => temporaryOvervoltage(-1, 'solidly_grounded'), /greater than zero/);
  console.log('✓ temporaryOvervoltage');
})();

// ---------------------------------------------------------------------------
// selectStandardBil — lowest BIL ≥ Ucw from IEC table
// ---------------------------------------------------------------------------
(function testSelectStandardBil() {
  // Um = 145 kV, Ucw = 478.4 → lowest BIL ≥ 478.4 is 550 kV
  const r = selectStandardBil(145, 478.4);
  assert.equal(r.selectedBilKv, 550, 'selected BIL = 550 kV');
  assert.ok(r.availableBilKv.includes(550), 'available includes 550');
  assert.ok(r.availableBilKv.includes(650), 'available includes 650');

  // Ucw very high → no standard BIL found
  const rHigh = selectStandardBil(145, 9999);
  assert.equal(rHigh.selectedBilKv, null, 'no BIL for Ucw=9999 kV');

  // Ucw below lowest BIL → lowest BIL is selected
  const rLow = selectStandardBil(145, 100);
  assert.equal(rLow.selectedBilKv, 550, 'lowest BIL selected when Ucw < all options');

  // Range I — Um = 72.5 kV: only one BIL option (325 kV)
  const r72 = selectStandardBil(72.5, 300);
  assert.equal(r72.selectedBilKv, 325, '72.5 kV → 325 kV BIL');
  console.log('✓ selectStandardBil');
})();

// ---------------------------------------------------------------------------
// statisticalRiskOfFailure — Gaussian convolution approximation
// ---------------------------------------------------------------------------
(function testStatisticalRisk() {
  // When mean overvoltage << BIL, risk should be very low
  const lowRisk = statisticalRiskOfFailure({
    meanOvervoltageKv: 300,
    covStress: 0.20,
    selectedWithstandKv: 650,
    covWithstand: 0.03,
    stressClass: 'li',
  });
  assert.ok(lowRisk.riskOfFailure < 1e-4, `low risk < 1e-4, got ${lowRisk.riskOfFailure}`);
  assert.ok(Number.isFinite(lowRisk.u50) && lowRisk.u50 > 0, 'u50 is positive finite');

  // When mean ≈ withstand, risk should be higher
  const highRisk = statisticalRiskOfFailure({
    meanOvervoltageKv: 600,
    covStress: 0.15,
    selectedWithstandKv: 650,
    covWithstand: 0.03,
    stressClass: 'li',
  });
  assert.ok(highRisk.riskOfFailure > lowRisk.riskOfFailure, 'higher stress → higher risk');

  // Risk is between 0 and 1
  assert.ok(lowRisk.riskOfFailure >= 0 && lowRisk.riskOfFailure <= 1, 'risk ∈ [0,1]');

  // Invalid inputs
  assert.throws(() => statisticalRiskOfFailure({
    meanOvervoltageKv: 0, covStress: 0.2, selectedWithstandKv: 650, covWithstand: 0.03,
  }), /greater than zero/);
  assert.throws(() => statisticalRiskOfFailure({
    meanOvervoltageKv: 300, covStress: 1.5, selectedWithstandKv: 650, covWithstand: 0.03,
  }), /between 0 and 1/);
  console.log('✓ statisticalRiskOfFailure');
})();

// ---------------------------------------------------------------------------
// runInsulationCoordinationStudy — integration
// ---------------------------------------------------------------------------
(function testIntegration() {
  // Base 138 kV system, deterministic, solidly earthed, LI only
  const base = {
    studyLabel: 'Test 138 kV Substation',
    nominalVoltageKv: 138,
    umKv: 145,
    altitudeM: 0,
    groundingType: 'solidly_grounded',
    approach: 'deterministic',
    lightningImpulse: {
      representativeKvPeak: 416,
      arresterResidualKvPeak: 340,
    },
    surgeArresterMcovKv: 84,
  };

  const result = runInsulationCoordinationStudy(base);

  // Structure checks
  assert.ok(result.inputs, 'has inputs');
  assert.ok(result.standardRow, 'has standardRow');
  assert.ok(result.atmosphericCorrection, 'has atmosphericCorrection');
  assert.ok(result.liResult, 'has liResult');
  assert.ok(result.tovResult, 'has tovResult');
  assert.ok(Array.isArray(result.warnings), 'has warnings array');
  assert.ok(typeof result.timestamp === 'string', 'has timestamp');

  // Sea-level Ka = 1.0
  assert.equal(result.atmosphericCorrection.kaLI, 1, 'Ka = 1.0 at sea level');

  // deterministic Ks = 1.15
  assert.equal(result.safetyFactor, 1.15, 'Ks = 1.15');

  // BIL selection: Ucw = 416 × 1.15 × 1.0 = 478.4 → BIL = 550 kV
  assert.equal(result.liResult.ucwKvPeak, 478.4, 'Ucw = 478.4 kV');
  assert.equal(result.liResult.selectedBilKv, 550, 'selected BIL = 550 kV');

  // Protective margin: (478.4/340 − 1)*100 ≈ 40.7% → PASS
  assert.ok(result.liResult.protectiveMargin.pass, 'margin PASS with adequate arrester');

  // MCOV check: 84 ≥ 83.7 → PASS
  assert.ok(result.mcovCheck, 'mcovCheck performed');
  assert.ok(result.mcovCheck.pass, 'MCOV = 84 kV passes for solidly earthed Um=145');

  // TOV check should be present for Range I
  assert.ok(result.tovResult, 'TOV result present for Range I');
  assert.ok(result.tovResult.selectedPfwvKv != null, 'PFWV selected');

  // allPassed
  assert.equal(result.allPassed, true, 'all checks passed');

  console.log('✓ runInsulationCoordinationStudy — 138 kV base case');
})();

(function testIntegrationAltitude() {
  // At 1500 m altitude, Ka is larger, so Ucw is larger
  const r0 = runInsulationCoordinationStudy({
    nominalVoltageKv: 138, umKv: 145, altitudeM: 0, groundingType: 'solidly_grounded',
    approach: 'deterministic',
    lightningImpulse: { representativeKvPeak: 416, arresterResidualKvPeak: 340 },
  });
  const r1500 = runInsulationCoordinationStudy({
    nominalVoltageKv: 138, umKv: 145, altitudeM: 1500, groundingType: 'solidly_grounded',
    approach: 'deterministic',
    lightningImpulse: { representativeKvPeak: 416, arresterResidualKvPeak: 340 },
  });
  assert.ok(r1500.liResult.ucwKvPeak > r0.liResult.ucwKvPeak, 'altitude increases Ucw');
  assert.ok(r1500.atmosphericCorrection.kaLI > 1, 'Ka > 1 at 1500 m');
  console.log('✓ runInsulationCoordinationStudy — altitude correction');
})();

(function testIntegrationIsolated() {
  // Isolated system has higher MCOV requirement
  const r = runInsulationCoordinationStudy({
    nominalVoltageKv: 34.5, umKv: 36, altitudeM: 0, groundingType: 'isolated',
    approach: 'deterministic',
    lightningImpulse: { representativeKvPeak: 170, arresterResidualKvPeak: 130 },
    surgeArresterMcovKv: 30,  // Too low for isolated system (needs 36 kV)
  });
  assert.equal(r.mcovCheck.pass, false, 'MCOV = 30 kV fails for isolated Um=36 kV system');
  assert.ok(r.warnings.some(w => w.toLowerCase().includes('mcov')), 'MCOV warning generated');
  console.log('✓ runInsulationCoordinationStudy — isolated system MCOV check');
})();

(function testIntegrationStatistical() {
  // Statistical approach with risk estimation
  const r = runInsulationCoordinationStudy({
    nominalVoltageKv: 138, umKv: 145, altitudeM: 0, groundingType: 'solidly_grounded',
    approach: 'statistical',
    lightningImpulse: { representativeKvPeak: 416, arresterResidualKvPeak: 340 },
    statisticalLI: { meanKvPeak: 350, cov: 0.20 },
  });
  assert.equal(r.safetyFactor, SAFETY_FACTOR_STATISTICAL, 'statistical Ks = 1.05');
  assert.ok(r.liResult.risk, 'risk estimate present');
  assert.ok(r.liResult.risk.riskOfFailure >= 0, 'risk is non-negative');
  assert.ok(r.liResult.risk.riskOfFailure < 1e-2, 'risk is low for well-coordinated system');
  console.log('✓ runInsulationCoordinationStudy — statistical approach');
})();

(function testIntegrationRangeII() {
  // 345 kV system (Um = 362 kV, Range II) with switching impulse
  const r = runInsulationCoordinationStudy({
    nominalVoltageKv: 345, umKv: 362, altitudeM: 0, groundingType: 'solidly_grounded',
    approach: 'deterministic',
    lightningImpulse: { representativeKvPeak: 900, arresterResidualKvPeak: 750 },
    switchingImpulse: { representativeKvPeak: 800, arresterResidualKvPeak: 680 },
  });
  assert.equal(r.standardRow.rangeII, true, 'Um=362 kV is Range II');
  assert.equal(r.tovResult, null, 'no PFWV result for Range II');
  assert.ok(r.siResult, 'SI result present for Range II');
  assert.ok(Array.isArray(r.siResult.availableSiwv) && r.siResult.availableSiwv.length > 0, 'Range II has SIWV options');
  console.log('✓ runInsulationCoordinationStudy — Range II (345 kV)');
})();

(function testValidationErrors() {
  // Missing required fields
  assert.throws(() => runInsulationCoordinationStudy({}), /nominalVoltageKv/);
  assert.throws(() => runInsulationCoordinationStudy({ nominalVoltageKv: 138 }), /umKv/);
  assert.throws(() => runInsulationCoordinationStudy({ nominalVoltageKv: 138, umKv: -5 }), /greater than zero/);
  assert.throws(() => runInsulationCoordinationStudy({
    nominalVoltageKv: 138, umKv: 145, altitudeM: -100
  }), /non-negative/);
  assert.throws(() => runInsulationCoordinationStudy({
    nominalVoltageKv: 138, umKv: 145, approach: 'invalid'
  }), /approach/);
  console.log('✓ validation errors');
})();

console.log('\nAll insulationCoordination tests passed.');
