import assert from 'node:assert/strict';
import { evaluateCriteriaChecks } from '../../src/studies/cp/criteriaChecks.js';
import { CP_STANDARDS_PROFILE } from '../../src/studies/cp/standardsProfile.js';

(function testCriteriaPassesWithCorrectedData() {
  const result = evaluateCriteriaChecks({
    measuredInstantOffPotentialMv: -930,
    simulatedPolarizationShiftMv: 130,
    measuredIrDropMv: 0,
    couponDepolarizationMv: 0,
    testMethod: 'instant-off',
    measurementContext: 'native-soil',
    referenceElectrodeLocation: 'local',
    irDropCompensationMethod: 'instant-off',
    testPointCount: 5,
    passingTestPointCount: 5
  }, CP_STANDARDS_PROFILE);

  assert.equal(result.selectedCriteriaSet.id, 'buried-steel-default');
  assert.equal(result.overallStatus, 'pass');
  assert.ok(result.criteriaResults.every((entry) => entry.status === 'pass'));
})();

(function testCriteriaFailsWhenCoverageAndPotentialFail() {
  const result = evaluateCriteriaChecks({
    measuredInstantOffPotentialMv: -830,
    simulatedPolarizationShiftMv: 90,
    measuredIrDropMv: 0,
    couponDepolarizationMv: 0,
    testMethod: 'instant-off',
    measurementContext: 'native-soil',
    referenceElectrodeLocation: 'local',
    irDropCompensationMethod: 'instant-off',
    testPointCount: 5,
    passingTestPointCount: 4
  }, CP_STANDARDS_PROFILE);

  assert.equal(result.overallStatus, 'fail');
  assert.deepEqual(result.criteriaResults.map((entry) => entry.status), ['fail', 'fail', 'fail']);
})();

console.log('✓ cp criteria checks tests passed');
