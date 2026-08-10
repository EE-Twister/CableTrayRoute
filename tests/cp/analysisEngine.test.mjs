import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CP_STANDARD_BASIS as engineStandardBasis,
  buildCpProfileData,
  calculateIccpSourceSizing as engineCalculateIccpSourceSizing,
  calculatePredictedDesignLife as engineCalculatePredictedDesignLife,
  calculateRequiredAnodeMass as engineCalculateRequiredAnodeMass,
  calculateRequiredCurrent as engineCalculateRequiredCurrent,
  runCathodicProtectionAnalysis as runEngineAnalysis,
  validateCathodicProtectionInputs,
  withAnalysisInputDefaults
} from '../../src/studies/cp/analysisEngine.js';
import {
  CP_STANDARD_BASIS as entryStandardBasis,
  calculateIccpSourceSizing as entryCalculateIccpSourceSizing,
  calculatePredictedDesignLife as entryCalculatePredictedDesignLife,
  calculateRequiredAnodeMass as entryCalculateRequiredAnodeMass,
  calculateRequiredCurrent as entryCalculateRequiredCurrent,
  runCathodicProtectionAnalysis as runEntryAnalysis
} from '../../cathodicprotection.js';
import {
  isUsingFallback,
  runCathodicProtectionAnalysis as runWorkerAnalysis,
  terminate as terminateWorkerClient
} from '../../src/workers/cathodicProtectionClient.js';
import { CP_WORKER_OPERATIONS } from '../../src/studies/cp/workerOperations.js';

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
    criteriaEvidenceEnabled: true,
    modeledReferencePotentialMv: -900,
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

function withoutGeneratedTimes(result) {
  const normalized = structuredClone(result);
  normalized.timestamp = '<generated>';
  normalized.profileData.generatedAt = '<generated>';
  return normalized;
}

(function testCompatibilityExportsAreDirectEngineBindings() {
  assert.strictEqual(entryStandardBasis, engineStandardBasis);
  assert.strictEqual(entryCalculateRequiredCurrent, engineCalculateRequiredCurrent);
  assert.strictEqual(entryCalculateRequiredAnodeMass, engineCalculateRequiredAnodeMass);
  assert.strictEqual(entryCalculatePredictedDesignLife, engineCalculatePredictedDesignLife);
  assert.strictEqual(entryCalculateIccpSourceSizing, engineCalculateIccpSourceSizing);
  assert.strictEqual(runEntryAnalysis, runEngineAnalysis);
})();

(function testValidationMessagesAndOrderingAreStable() {
  const errors = validateCathodicProtectionInputs(baseInput({
    soilResistivityOhmM: 0,
    coatingBreakdownFactor: 0,
    soilPh: 15,
    numberOfAnodes: 10001
  }));

  assert.deepEqual(errors, [
    'soilResistivityOhmM must be greater than zero.',
    'coatingBreakdownFactor must be between 0 and 1, exclusive of zero.',
    'soilPh must be between 0 and 14.',
    'numberOfAnodes must be a positive integer up to 10000.'
  ]);
})();

(function testDefaultsAndResultSemanticsArePreserved() {
  const defaulted = withAnalysisInputDefaults({ measuredInstantOffPotentialMv: -875 });
  assert.equal(defaulted.modeledReferencePotentialMv, -875);
  assert.equal(defaulted.iccpRatedCurrentA, 10);
  assert.equal(defaulted.iccpRatedVoltageV, 50);
  assert.equal(defaulted.iccpGroundbedResistanceOhm, 1.5);
  assert.equal(defaulted.iccpVoltageAllowanceV, 5);
  assert.equal(defaulted.iccpReserveFactor, 1.25);

  const result = runEngineAnalysis(baseInput());
  assert.deepEqual(Object.keys(result.profileData.scenarios), ['base', 'conservative', 'optimized']);
  assert.deepEqual(result.sensitivity.map((scenario) => scenario.key), ['low-coating', 'base', 'high-coating']);
  assert.equal(result.sensitivity.find((scenario) => scenario.key === 'base')?.approvalStatus, 'Preliminary margin met');
  assert.ok(result.sensitivity.every((scenario) => scenario.approvalStatus !== 'Approved'));
  assert.equal(result.profileData.thresholdBands.potentialMv.passWhenLessThanOrEqual, -850);
  assert.equal(result.profileData.thresholdBands.attenuation.passWhenGreaterThanOrEqual, 0.75);
  assert.equal(
    result.outputBasis.requiredCurrentA,
    'Uses exposed-area current demand relation adjusted with per-segment distribution attenuation/effectiveness factors.'
  );
  assert.match(result.standardsBasis.engineeringJudgmentAssumptions.summary, /engineering validation/);

  const rebuiltProfile = buildCpProfileData({
    input: result,
    adjustedRequiredCurrentA: result.requiredCurrentA,
    distributionModel: result.distributionModel,
    modeledReferencePotentialMv: result.modeledReferencePotentialMv,
    baseCoatingFactor: result.coatingModel.effectiveFactor
  });
  assert.deepEqual(Object.keys(rebuiltProfile.scenarios), Object.keys(result.profileData.scenarios));
  assert.deepEqual(rebuiltProfile.attenuation, result.profileData.attenuation);
  assert.deepEqual(rebuiltProfile.thresholdBands, result.profileData.thresholdBands);
  assert.deepEqual(rebuiltProfile.scenarios.base.potential, result.profileData.scenarios.base.potential);
})();

(function testEngineHasNoBrowserDependency() {
  const source = fs.readFileSync(new URL('../../src/studies/cp/analysisEngine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|localStorage|sessionStorage)\b/);

  [
    new URL('../../cathodicProtectionWorker.js', import.meta.url),
    new URL('../../src/workers/cathodicProtectionClient.js', import.meta.url)
  ].forEach((moduleUrl) => {
    const workerBoundarySource = fs.readFileSync(moduleUrl, 'utf8');
    assert.doesNotMatch(workerBoundarySource, /from\s+['"][^'"]*cathodicprotection\.js['"]/i);
  });
})();

assert.ok(Object.isFrozen(CP_WORKER_OPERATIONS));
assert.deepEqual(Object.keys(CP_WORKER_OPERATIONS), [
  'computeDistributionBySegment',
  'parseZoneResistivityValues',
  'evaluateCriteriaChecks',
  'evaluateInterferenceAssessment',
  'parseMitigationActions',
  'parseConditionFactorValues',
  'resolveCoatingModel',
  'runCathodicProtectionAnalysis'
]);

const workerMessages = [];
const previousSelf = globalThis.self;
globalThis.self = { postMessage: message => workerMessages.push(message) };
try {
  await import(`../../cathodicProtectionWorker.js?boundary-test=${Date.now()}`);
  assert.equal(typeof globalThis.self.onmessage, 'function');
  globalThis.self.onmessage({
    data: { id: 73, op: 'runCathodicProtectionAnalysis', args: [baseInput()] }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(workerMessages.length, 1);
  assert.equal(workerMessages[0].id, 73);
  assert.equal(workerMessages[0].type, 'result');
  assert.deepEqual(
    withoutGeneratedTimes(workerMessages[0].result),
    withoutGeneratedTimes(runEngineAnalysis(baseInput()))
  );
} finally {
  if (previousSelf === undefined) delete globalThis.self;
  else globalThis.self = previousSelf;
}

const input = baseInput();
const syncResult = runEngineAnalysis(input);
const workerResult = await runWorkerAnalysis(input);
assert.equal(isUsingFallback(), true, 'Node test environment should exercise the worker client fallback');
assert.deepEqual(withoutGeneratedTimes(workerResult), withoutGeneratedTimes(syncResult));
terminateWorkerClient();

console.log('✓ cathodic protection analysis engine boundary tests passed');
