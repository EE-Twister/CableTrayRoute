import { getSelectedProtectionCriteriaSet } from './standardsProfile.js';
import { applyMeasurementCorrections } from './measurementCorrections.js';

function toCheckStatus(isPassing) {
  return isPassing ? 'pass' : 'fail';
}

function toDecisionLabel(status) {
  return status === 'pass' ? 'Pass' : 'Fail';
}

export function evaluateCriteriaChecks(input, standardsProfile) {
  const selectedCriteriaSet = getSelectedProtectionCriteriaSet(standardsProfile);
  if (!selectedCriteriaSet) {
    return {
      selectedCriteriaSet: null,
      measurementCorrections: null,
      dataUsed: {},
      criteriaResults: [],
      overallStatus: 'fail'
    };
  }

  const measurementCorrections = applyMeasurementCorrections(input);
  const dataUsed = {
    measuredInstantOffPotentialMv: input.measuredInstantOffPotentialMv,
    correctedInstantOffPotentialMv: measurementCorrections.correctedValues.instantOffPotentialMv,
    simulatedPolarizationShiftMv: input.simulatedPolarizationShiftMv,
    correctedPolarizationShiftMv: measurementCorrections.correctedValues.polarizationShiftMv,
    testPointCount: input.testPointCount,
    passingTestPointCount: input.passingTestPointCount,
    testMethod: measurementCorrections.metadata.testMethod,
    measurementContext: measurementCorrections.metadata.measurementContext,
    referenceElectrodeLocation: measurementCorrections.metadata.referenceElectrodeLocation,
    irDropCompensationMethod: measurementCorrections.metadata.irDropCompensationMethod
  };

  const instantOffPass = Number.isFinite(dataUsed.correctedInstantOffPotentialMv)
    && dataUsed.correctedInstantOffPotentialMv <= -850;
  const polarizationPass = Number.isFinite(dataUsed.correctedPolarizationShiftMv)
    && dataUsed.correctedPolarizationShiftMv >= 100;
  const coveragePass = Number.isInteger(dataUsed.testPointCount)
    && Number.isInteger(dataUsed.passingTestPointCount)
    && dataUsed.testPointCount > 0
    && dataUsed.passingTestPointCount === dataUsed.testPointCount;

  const criteriaResults = [
    {
      key: 'instantOffPotential',
      label: 'Instant-off potential criterion',
      requirement: 'Corrected instant-off potential ≤ -850 mV (CSE)',
      rawValue: `${dataUsed.measuredInstantOffPotentialMv} mV`,
      correctedValue: `${dataUsed.correctedInstantOffPotentialMv} mV`,
      decision: toDecisionLabel(toCheckStatus(instantOffPass)),
      status: toCheckStatus(instantOffPass)
    },
    {
      key: 'polarizationShift',
      label: 'Polarization criterion',
      requirement: 'Corrected polarization shift ≥ 100 mV',
      rawValue: `${dataUsed.simulatedPolarizationShiftMv} mV`,
      correctedValue: `${dataUsed.correctedPolarizationShiftMv} mV`,
      decision: toDecisionLabel(toCheckStatus(polarizationPass)),
      status: toCheckStatus(polarizationPass)
    },
    {
      key: 'testPointCoverage',
      label: 'Test-point coverage criterion',
      requirement: 'All reported test points satisfy selected criteria',
      rawValue: `${dataUsed.passingTestPointCount} / ${dataUsed.testPointCount} points pass`,
      correctedValue: `${dataUsed.passingTestPointCount} / ${dataUsed.testPointCount} points pass`,
      decision: toDecisionLabel(toCheckStatus(coveragePass)),
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
    measurementCorrections,
    dataUsed,
    criteriaResults,
    overallStatus
  };
}
