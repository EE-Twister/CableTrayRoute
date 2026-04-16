export const CP_STANDARDS_PROFILE = {
  profileId: 'cp-design-basis-2026',
  organization: 'CableTrayRoute default profile',
  targetReferences: [
    { code: 'AMPP SP21424', edition: 'Adopted organizational edition' },
    { code: 'NACE SP0169', edition: 'Latest organization-approved edition' },
    { code: 'ISO 15589-1', edition: 'Latest organization-approved edition' },
    { code: 'DNV-RP-B401', edition: 'Latest organization-approved edition' }
  ],
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
      required: false,
      description: 'Optional review for stray-current and foreign structure interference.'
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

export function evaluateComplianceChecks(result) {
  const checks = {
    ...buildInitialComplianceStatus(),
    currentDensitySelection: Number.isFinite(result.designCurrentDensityMaM2) && result.designCurrentDensityMaM2 > 0 ? 'pass' : 'fail',
    anodeMassSizing: Number.isFinite(result.minimumAnodeMassKg) && result.minimumAnodeMassKg > 0 ? 'pass' : 'fail',
    targetLifeVerification: Number.isFinite(result.safetyMarginYears)
      ? (result.safetyMarginYears >= 0 ? 'pass' : 'fail')
      : 'fail'
  };

  return checks;
}
