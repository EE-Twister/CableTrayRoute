import assert from 'node:assert/strict';
import {
  calculateRequiredCurrent,
  calculateRequiredAnodeMass,
  calculatePredictedDesignLife,
  calculateIccpSourceSizing,
  runCathodicProtectionAnalysis
} from '../cathodicprotection.js';

function baseInput(overrides = {}) {
  return {
    assetType: 'pipe',
    pipeMaterial: 'carbon-steel',
    soilResistivityOhmM: 100,
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
    zoneResistivityOhmM: [100, 100, 100, 100],
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

(function testNominalValidCase() {
  const result = runCathodicProtectionAnalysis(baseInput());

  assert.equal(result.designCurrentDensityMaM2, 10);
  assert.equal(result.exposedAreaM2, 20);
  assert.equal(result.requiredCurrentA, 0.2971);
  assert.equal(result.minimumAnodeMassKg, 71.361);
  assert.equal(result.predictedLifeYears, 56.05);
  assert.equal(result.safetyMarginYears, 36.05);

  assert.ok(result.requiredCurrentA > 0);
  assert.ok(result.minimumAnodeMassKg > 0);
  assert.ok(result.predictedLifeYears > 0);
})();

(function testIccpUsesRectifierCapacityInsteadOfGalvanicMass() {
  const result = runCathodicProtectionAnalysis(baseInput({
    anodeTypeSystem: 'iccp',
    criteriaEvidenceEnabled: false,
    modeledReferencePotentialMv: -910,
    anodeCapacityAhPerKg: undefined,
    anodeUtilization: undefined,
    designFactor: undefined,
    installedMassKg: undefined,
    iccpRatedCurrentA: 10,
    iccpRatedVoltageV: 50,
    iccpGroundbedResistanceOhm: 1.5,
    iccpVoltageAllowanceV: 5,
    iccpReserveFactor: 1.25
  }));

  assert.equal(result.minimumAnodeMassKg, null);
  assert.equal(result.predictedLifeYears, null);
  assert.equal(result.criteriaCheckEvidence.overallStatus, 'not-run');
  assert.equal(result.iccpSizing.requiredRectifierCurrentA, 0.3311);
  assert.equal(result.iccpSizing.requiredRectifierVoltageV, 5.5);
  assert.equal(result.iccpSizing.overallStatus, 'pass');
  assert.equal(result.profileData.thresholdBands.currentDemandA.passWhenLessThanOrEqual, result.requiredCurrentA);
  assert.equal(result.modeledReferencePotentialMv, -910);
  const firstAttenuation = result.distributionModel.segments[0].attenuationFactor;
  assert.equal(
    result.profileData.scenarios.base.potential[0].value,
    Number((-910 - ((1 - firstAttenuation) * 220)).toFixed(1))
  );
})();

(function testFormulaHelpers() {
  assert.equal(calculateRequiredCurrent(100, 0.01), 1);
  assert.equal(calculateRequiredAnodeMass(1, 8760, 780, 0.85, 1.1).toFixed(6), '12.011518');
  assert.equal(calculatePredictedDesignLife(100, 780, 0.85, 1.1, 1).toFixed(6), '8.325342');
  assert.deepEqual(
    calculateIccpSourceSizing(2, 1.25, 1.5, 5, 4, 10),
    {
      requiredRectifierCurrentA: 2.5,
      requiredRectifierVoltageV: 8.75,
      currentHeadroomA: 1.5,
      voltageHeadroomV: 1.25,
      currentCapacityStatus: 'pass',
      voltageCapacityStatus: 'pass',
      overallStatus: 'pass'
    }
  );
  assert.deepEqual(
    calculateIccpSourceSizing(10, 1.25, 2, 5, 10, 25),
    {
      requiredRectifierCurrentA: 12.5,
      requiredRectifierVoltageV: 30,
      currentHeadroomA: -2.5,
      voltageHeadroomV: -5,
      currentCapacityStatus: 'fail',
      voltageCapacityStatus: 'fail',
      overallStatus: 'fail'
    }
  );
})();

(function testEdgeCaseVeryLowHighResistivity() {
  const lowRes = runCathodicProtectionAnalysis(baseInput({ soilResistivityOhmM: 10 }));
  const highRes = runCathodicProtectionAnalysis(baseInput({ soilResistivityOhmM: 500 }));

  assert.equal(lowRes.designCurrentDensityMaM2, 12, 'low resistivity should increase current density');
  assert.equal(highRes.designCurrentDensityMaM2, 8.5, 'high resistivity should decrease current density');
  assert.ok(lowRes.requiredCurrentA > highRes.requiredCurrentA, 'lower resistivity case should require more current');
})();

(function testEdgeCaseCoatingBreakdownNearBounds() {
  const almostIntact = runCathodicProtectionAnalysis(baseInput({ coatingBreakdownFactor: 0.001 }));
  const almostBare = runCathodicProtectionAnalysis(baseInput({ coatingBreakdownFactor: 0.999 }));

  assert.ok(almostIntact.requiredCurrentA > 0, 'near-zero breakdown should still produce finite positive current');
  assert.ok(almostBare.requiredCurrentA > almostIntact.requiredCurrentA, 'near-one breakdown should require more current');
})();

(function testValidationErrorsMissingOrNegativeInputs() {
  assert.throws(
    () => runCathodicProtectionAnalysis(baseInput({ soilResistivityOhmM: undefined })),
    /soilResistivityOhmM must be greater than zero/,
    'missing numeric input should fail validation'
  );

  assert.throws(
    () => runCathodicProtectionAnalysis(baseInput({ targetLifeYears: -1 })),
    /targetLifeYears must be greater than zero/,
    'negative input should fail validation'
  );

  assert.throws(
    () => runCathodicProtectionAnalysis(baseInput({ coatingBreakdownFactor: 0 })),
    /coatingBreakdownFactor must be between 0 and 1/,
    'coating breakdown at exactly zero should fail validation'
  );

  assert.throws(
    () => runCathodicProtectionAnalysis(baseInput({ coatingBreakdownFactor: 1.2 })),
    /coatingBreakdownFactor must be between 0 and 1/,
    'coating breakdown above one should fail validation'
  );
})();

(function testRequiredMassAndPredictedLifeConsistency() {
  const baseline = baseInput({ installedMassKg: 200, targetLifeYears: 20 });
  const baselineResult = runCathodicProtectionAnalysis(baseline);

  const matchedMassResult = runCathodicProtectionAnalysis(baseInput({
    installedMassKg: baselineResult.minimumAnodeMassKg,
    targetLifeYears: baseline.targetLifeYears
  }));

  assert.ok(
    Math.abs(matchedMassResult.predictedLifeYears - baseline.targetLifeYears) <= 0.02,
    `predicted life (${matchedMassResult.predictedLifeYears}) should match target life (${baseline.targetLifeYears}) when installed mass equals required mass`
  );
})();

console.log('✓ cathodic protection sizing tests passed');
