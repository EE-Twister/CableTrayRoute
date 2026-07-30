import assert from 'node:assert/strict';
import { evaluateInterferenceAssessment, parseMitigationActions } from '../../src/studies/cp/interferenceAssessment.js';

(function testMitigationActionParsing() {
  const parsed = parseMitigationActions('Baseline Survey,\n test station checks,\n');
  assert.deepEqual(parsed, ['baseline survey', 'test station checks']);
})();

(function testHighRiskInterferenceAssessment() {
  const result = evaluateInterferenceAssessment({
    nearbyForeignStructures: 'sharedCorridor',
    dcTractionSystem: 'parallelReturn',
    knownInterferenceSources: 'severe',
    mitigationProfile: 'critical',
    mitigationActions: ['baseline survey'],
    verificationTestDate: ''
  });

  assert.equal(result.score, 20);
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.missingMitigations.length, 5);
  assert.equal(result.unresolvedHighRisk, true);
})();

(function testQuantitativeDesignDriversAreScoredAndExplained() {
  const result = evaluateInterferenceAssessment({
    interferenceGeometry: 'parallel',
    interferenceSourceType: 'dc-traction',
    foreignStructureSeparationM: 2,
    parallelExposureLengthM: 1200,
    measuredPotentialGradientMvPerM: 6,
    bondingStrategy: 'none',
    mitigationProfile: 'critical',
    mitigationActions: [],
    verificationTestDate: ''
  });

  assert.equal(result.score, 22);
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.geometry.relationship, 'parallel');
  assert.equal(result.geometry.foreignStructureSeparationM, 2);
  assert.match(result.riskSummary, /potential gradient/i);
  assert.ok(result.riskDrivers.some((driver) => /minimum structure separation/i.test(driver)));
})();

(function testControlledDrainageReceivesAVisibleRiskCredit() {
  const unmitigated = evaluateInterferenceAssessment({
    interferenceGeometry: 'crossing',
    interferenceSourceType: 'foreign-iccp',
    foreignStructureSeparationM: 8,
    crossingAngleDeg: 25,
    measuredPotentialGradientMvPerM: 3,
    bondingStrategy: 'none',
    mitigationProfile: 'critical'
  });
  const controlledDrainage = evaluateInterferenceAssessment({
    interferenceGeometry: 'crossing',
    interferenceSourceType: 'foreign-iccp',
    foreignStructureSeparationM: 8,
    crossingAngleDeg: 25,
    measuredPotentialGradientMvPerM: 3,
    bondingStrategy: 'controlled-drainage',
    mitigationProfile: 'critical'
  });

  assert.equal(unmitigated.score - controlledDrainage.score, 3);
  assert.equal(controlledDrainage.riskFactorScores.find((factor) => factor.key === 'bondingStrategy').score, -3);
})();

(function testMoreConservativeProfileIsNotFlaggedBelowMinimum() {
  const result = evaluateInterferenceAssessment({
    interferenceGeometry: 'none',
    foreignStructureSeparationM: 1,
    parallelExposureLengthM: 1200,
    mitigationProfile: 'critical'
  });

  assert.equal(result.riskLevel, 'low');
  assert.equal(result.score, 0);
  assert.equal(result.minimumProfile.id, 'baseline');
  assert.equal(result.profileBelowRiskMinimum, false);
})();

console.log('✓ cp interference assessment tests passed');
