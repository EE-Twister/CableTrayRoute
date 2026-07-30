export const CP_STANDARDS_PROFILE = {
  profileId: 'cp-design-basis-2026',
  organization: 'CableTrayRoute preliminary profile — project adoption required',
  selectedProtectionCriteriaSetId: 'buried-steel-default',
  targetReferences: [
    { code: 'AMPP SP21424', edition: 'Edition not configured — project selection required' },
    { code: 'NACE SP0169', edition: 'Edition not configured — project selection required' },
    { code: 'ISO 15589-1', edition: 'Edition not configured — project selection required' },
    { code: 'DNV-RP-B401', edition: 'Edition not configured — project selection required' }
  ],
  protectionCriteriaSets: {
    'buried-steel-default': {
      id: 'buried-steel-default',
      label: 'Buried steel default criteria',
      reference: 'NACE SP0169 / ISO 15589-1',
      criteria: [
        {
          key: 'instantOffPotential',
          label: 'Instant-off potential criterion',
          requirement: 'Measured instant-off potential ≤ -850 mV (CSE).'
        },
        {
          key: 'polarizationShift',
          label: 'Polarization criterion',
          requirement: 'Measured/simulated polarization shift ≥ 100 mV.'
        },
        {
          key: 'testPointCoverage',
          label: 'Test-point coverage criterion',
          requirement: 'All reported test points satisfy selected protection criteria.'
        }
      ]
    }
  },
  checks: {
    currentDensitySelection: {
      key: 'currentDensitySelection',
      label: 'Current density basis selected',
      required: true,
      description: 'Validate that table/manual current density basis is documented and finite.'
    },
    anodeMassSizing: {
      key: 'anodeMassSizing',
      label: 'CP source sizing verification',
      required: true,
      description: 'Galvanic mass or ICCP rectifier current and voltage requirements are calculated from the selected source basis.'
    },
    targetLifeVerification: {
      key: 'targetLifeVerification',
      label: 'Source capacity margin verification',
      required: true,
      description: 'Installed galvanic mass life or ICCP rectifier capacity confirms that the preliminary source basis is adequate.'
    },
    commissioningChecksDefined: {
      key: 'commissioningChecksDefined',
      label: 'Commissioning checks defined',
      required: true,
      description: 'Project package includes polarization and acceptance checks for commissioning.'
    },
    monitoringPlanDefined: {
      key: 'monitoringPlanDefined',
      label: 'Monitoring plan defined',
      required: true,
      description: 'Long-term monitoring and inspection cadence is documented for auditing.'
    },
    interferenceAssessment: {
      key: 'interferenceAssessment',
      label: 'Interference assessment',
      required: true,
      description: 'Stray-current and foreign structure interference risk is assessed and unresolved high-risk cases are mitigated.'
    }
  },
  deliverables: {
    designBasis: {
      key: 'designBasis',
      label: 'Design basis memorandum',
      required: true
    },
    calculations: {
      key: 'calculations',
      label: 'Sizing calculations package',
      required: true
    },
    commissioningChecks: {
      key: 'commissioningChecks',
      label: 'Commissioning and acceptance checks',
      required: true
    },
    monitoringPlan: {
      key: 'monitoringPlan',
      label: 'Monitoring and survey plan',
      required: true
    }
  }
};

export function getRequiredComplianceChecks() {
  return Object.values(CP_STANDARDS_PROFILE.checks)
    .filter((check) => check.required)
    .map((check) => check.key);
}

export function buildInitialComplianceStatus() {
  return Object.fromEntries(getRequiredComplianceChecks().map((checkKey) => [checkKey, 'not-run']));
}

export function getSelectedProtectionCriteriaSet(profile = CP_STANDARDS_PROFILE) {
  const selectedId = profile.selectedProtectionCriteriaSetId;
  return profile.protectionCriteriaSets?.[selectedId] || null;
}

export function evaluateComplianceChecks(result) {
  const criteriaStatus = result.criteriaCheckEvidence?.overallStatus || 'fail';
  const interferenceAssessment = result.interferenceAssessment || {};
  const hasVerificationDate = Boolean(interferenceAssessment.verificationTestDate);
  const hasMitigationActions = Array.isArray(interferenceAssessment.mitigationActions)
    && interferenceAssessment.mitigationActions.length > 0;
  const unresolvedHighRisk = interferenceAssessment.unresolvedHighRisk === true;

  const checks = {
    ...buildInitialComplianceStatus(),
    currentDensitySelection: Number.isFinite(result.designCurrentDensityMaM2) && result.designCurrentDensityMaM2 > 0 ? 'pass' : 'fail',
    anodeMassSizing: result.anodeTypeSystem === 'iccp'
      ? (Number.isFinite(result.iccpSizing?.requiredRectifierCurrentA)
        && Number.isFinite(result.iccpSizing?.requiredRectifierVoltageV) ? 'pass' : 'fail')
      : (Number.isFinite(result.minimumAnodeMassKg) && result.minimumAnodeMassKg > 0 ? 'pass' : 'fail'),
    targetLifeVerification: result.anodeTypeSystem === 'iccp'
      ? (result.iccpSizing?.overallStatus === 'pass' ? 'pass' : 'fail')
      : (Number.isFinite(result.safetyMarginYears)
        ? (result.safetyMarginYears >= 0 ? 'pass' : 'fail')
        : 'fail'),
    commissioningChecksDefined: criteriaStatus === 'pass' && hasVerificationDate ? 'pass' : 'fail',
    monitoringPlanDefined: hasMitigationActions ? 'pass' : 'fail',
    interferenceAssessment: unresolvedHighRisk ? 'fail' : 'pass'
  };

  return checks;
}
