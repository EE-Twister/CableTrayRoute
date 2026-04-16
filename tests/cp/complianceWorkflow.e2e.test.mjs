import assert from 'node:assert/strict';
import { runCathodicProtectionAnalysis } from '../../cathodicprotection.js';
import { buildInitialComplianceStatus, evaluateComplianceChecks } from '../../src/studies/cp/standardsProfile.js';

function buildInput(overrides = {}) {
  return {
    assetType: 'pipe',
    pipeMaterial: 'carbon-steel',
    soilResistivityOhmM: 120,
    soilPh: 7,
    moistureCategory: 'moderate',
    coatingModelType: 'fixed',
    coatingBreakdownFactor: 0.2,
    surfaceAreaM2: 100,
    currentDensityMethod: 'table',
    manualCurrentDensityMaM2: 0,
    anodeCapacityAhPerKg: 780,
    anodeUtilization: 0.85,
    designFactor: 1.1,
    availabilityFactor: 0.95,
    targetLifeYears: 20,
    installedMassKg: 200,
    anodeTypeSystem: 'galvanic',
    numberOfAnodes: 4,
    anodeSpacingM: 25,
    anodeDistanceToStructureM: 3,
    anodeBurialDepthM: 2,
    zoneResistivityOhmM: [120, 120, 120, 120],
    zoneResistivityInputValid: true,
    measuredInstantOffPotentialMv: -900,
    simulatedPolarizationShiftMv: 120,
    testPointCount: 4,
    passingTestPointCount: 4,
    nearbyForeignStructures: 'none',
    dcTractionSystem: 'none',
    knownInterferenceSources: 'none',
    mitigationProfile: 'baseline',
    mitigationActions: ['baseline survey', 'test station checks'],
    verificationTestDate: '2026-03-12',
    testMethod: 'instant-off',
    measurementContext: 'native-soil',
    referenceElectrodeLocation: 'local',
    irDropCompensationMethod: 'instant-off',
    measuredIrDropMv: 0,
    couponDepolarizationMv: 0,
    ...overrides
  };
}

(function testComplianceMatrixTransitions() {
  const initial = buildInitialComplianceStatus();
  assert.ok(Object.values(initial).every((status) => status === 'not-run'));

  const passResult = runCathodicProtectionAnalysis(buildInput());
  const passChecks = evaluateComplianceChecks(passResult);
  assert.ok(Object.values(passChecks).every((status) => status === 'pass'));

  const failResult = runCathodicProtectionAnalysis(buildInput({
    measuredInstantOffPotentialMv: -780,
    simulatedPolarizationShiftMv: 70,
    passingTestPointCount: 2,
    nearbyForeignStructures: 'sharedCorridor',
    dcTractionSystem: 'parallelReturn',
    knownInterferenceSources: 'severe',
    mitigationProfile: 'critical',
    mitigationActions: ['baseline survey'],
    verificationTestDate: '',
    installedMassKg: 40
  }));
  const failChecks = evaluateComplianceChecks(failResult);

  assert.equal(failChecks.currentDensitySelection, 'pass');
  assert.equal(failChecks.anodeMassSizing, 'pass');
  assert.equal(failChecks.targetLifeVerification, 'fail');
  assert.equal(failChecks.commissioningChecksDefined, 'fail');
  assert.equal(failChecks.monitoringPlanDefined, 'pass');
  assert.equal(failChecks.interferenceAssessment, 'fail');
})();

console.log('✓ cp compliance workflow e2e tests passed');
