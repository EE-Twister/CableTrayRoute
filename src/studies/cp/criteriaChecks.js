import { getSelectedProtectionCriteriaSet } from './standardsProfile.js';

function toCheckStatus(isPassing) {
  return isPassing ? 'pass' : 'fail';
}

export function evaluateCriteriaChecks(input, standardsProfile) {
  const selectedCriteriaSet = getSelectedProtectionCriteriaSet(standardsProfile);
  if (!selectedCriteriaSet) {
    return {
      selectedCriteriaSet: null,
      dataUsed: {},
      criteriaResults: [],
      overallStatus: 'fail'
    };
  }

  const dataUsed = {
    measuredInstantOffPotentialMv: input.measuredInstantOffPotentialMv,
    simulatedPolarizationShiftMv: input.simulatedPolarizationShiftMv,
    testPointCount: input.testPointCount,
    passingTestPointCount: input.passingTestPointCount
  };

  const instantOffPass = Number.isFinite(dataUsed.measuredInstantOffPotentialMv) && dataUsed.measuredInstantOffPotentialMv <= -850;
  const polarizationPass = Number.isFinite(dataUsed.simulatedPolarizationShiftMv) && dataUsed.simulatedPolarizationShiftMv >= 100;
  const coveragePass = Number.isInteger(dataUsed.testPointCount)
    && Number.isInteger(dataUsed.passingTestPointCount)
    && dataUsed.testPointCount > 0
    && dataUsed.passingTestPointCount === dataUsed.testPointCount;

  const criteriaResults = [
    {
      key: 'instantOffPotential',
      label: 'Instant-off potential criterion',
      requirement: 'Measured instant-off potential ≤ -850 mV (CSE)',
      observedValue: `${dataUsed.measuredInstantOffPotentialMv} mV`,
      status: toCheckStatus(instantOffPass)
    },
    {
      key: 'polarizationShift',
      label: 'Polarization criterion',
      requirement: 'Measured/simulated polarization shift ≥ 100 mV',
      observedValue: `${dataUsed.simulatedPolarizationShiftMv} mV`,
      status: toCheckStatus(polarizationPass)
    },
    {
      key: 'testPointCoverage',
      label: 'Test-point coverage criterion',
      requirement: 'All reported test points satisfy selected criteria',
      observedValue: `${dataUsed.passingTestPointCount} / ${dataUsed.testPointCount} points pass`,
      status: toCheckStatus(coveragePass)
    }
  ];

  const overallStatus = criteriaResults.every((check) => check.status === 'pass') ? 'pass' : 'fail';

  return {
    selectedCriteriaSet: {
      id: selectedCriteriaSet.id,
      label: selectedCriteriaSet.label,
      reference: selectedCriteriaSet.reference
    },
    dataUsed,
    criteriaResults,
    overallStatus
  };
}
