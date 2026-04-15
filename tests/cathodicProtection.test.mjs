import assert from 'node:assert/strict';
import {
  calculateRequiredCurrent,
  calculateRequiredAnodeMass,
  calculatePredictedDesignLife,
  runCathodicProtectionAnalysis
} from '../cathodicprotection.js';

function baseInput(overrides = {}) {
  return {
    assetType: 'pipe',
    soilResistivityOhmM: 100,
    soilPh: 7,
    moistureCategory: 'moderate',
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
    ...overrides
  };
}

(function testNominalValidCase() {
  const result = runCathodicProtectionAnalysis(baseInput());

  assert.equal(result.designCurrentDensityMaM2, 10);
  assert.equal(result.exposedAreaM2, 20);
  assert.equal(result.requiredCurrentA, 0.2105);
  assert.equal(result.minimumAnodeMassKg, 50.575);
  assert.equal(result.predictedLifeYears, 79.09);
  assert.equal(result.safetyMarginYears, 59.09);

  assert.ok(result.requiredCurrentA > 0);
  assert.ok(result.minimumAnodeMassKg > 0);
  assert.ok(result.predictedLifeYears > 0);
})();

(function testFormulaHelpers() {
  assert.equal(calculateRequiredCurrent(100, 0.01), 1);
  assert.equal(calculateRequiredAnodeMass(1, 8760, 780, 0.85, 1.1).toFixed(6), '12.011518');
  assert.equal(calculatePredictedDesignLife(100, 780, 0.85, 1.1, 1).toFixed(6), '8.325342');
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
