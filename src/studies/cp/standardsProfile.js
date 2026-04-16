export const CP_STANDARDS_PROFILE = {
  profileId: 'cp-design-basis-2026',
  organization: 'CableTrayRoute default profile',
  selectedProtectionCriteriaSetId: 'buried-steel-default',
  targetReferences: [
    { code: 'AMPP SP21424', edition: 'Adopted organizational edition' },
    { code: 'NACE SP0169', edition: 'Latest organization-approved edition' },
    { code: 'ISO 15589-1', edition: 'Latest organization-approved edition' },
    { code: 'DNV-RP-B401', edition: 'Latest organization-approved edition' }
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
      label: 'Anode mass sizing equation verification',
      required: true,
      description: 'Required mass is calculated from approved anode capacity/utilization inputs.'
    },
    targetLifeVerification: {
      key: 'targetLifeVerification',
      label: 'Target life verification',
      required: true,
      description: 'Installed mass life check confirms whether the selected target life is met.'
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
    anodeMassSizing: Number.isFinite(result.minimumAnodeMassKg) && result.minimumAnodeMassKg > 0 ? 'pass' : 'fail',
    targetLifeVerification: Number.isFinite(result.safetyMarginYears)
      ? (result.safetyMarginYears >= 0 ? 'pass' : 'fail')
      : 'fail',
    commissioningChecksDefined: criteriaStatus === 'pass' && hasVerificationDate ? 'pass' : 'fail',
    monitoringPlanDefined: hasMitigationActions ? 'pass' : 'fail',
    interferenceAssessment: unresolvedHighRisk ? 'fail' : 'pass'
  };

  return checks;
}
