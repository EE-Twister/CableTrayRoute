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

console.log('✓ cp interference assessment tests passed');
