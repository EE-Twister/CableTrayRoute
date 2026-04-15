import assert from 'node:assert/strict';
import {
  calculateRequiredCurrent,
  calculateRequiredAnodeMass,
  calculatePredictedDesignLife,
  runCathodicProtectionAnalysis
} from '../cathodicprotection.js';

(function testPureFormulas() {
  assert.equal(calculateRequiredCurrent(100, 0.01), 1);
  assert.equal(calculateRequiredAnodeMass(1, 8760, 780, 0.85, 1.1).toFixed(6), '12.011518');
  assert.equal(calculatePredictedDesignLife(100, 780, 0.85, 1.1, 1).toFixed(6), '8.325342');
})();

(function testIntegratedSizing() {
  const result = runCathodicProtectionAnalysis({
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
    installedMassKg: 200
  });

  assert.ok(result.requiredCurrentA > 0);
  assert.ok(result.minimumAnodeMassKg > 0);
  assert.ok(result.predictedLifeYears > 0);
})();

console.log('✓ cathodic protection sizing tests passed');
