const RISK_WEIGHTS = {
  nearbyForeignStructures: {
    none: 0,
    isolated: 2,
    multiple: 4,
    sharedCorridor: 6
  },
  dcTractionSystem: {
    none: 0,
    regional: 3,
    nearby: 5,
    parallelReturn: 7
  },
  knownInterferenceSources: {
    none: 0,
    possible: 2,
    confirmed: 5,
    severe: 7
  },
  interferenceGeometry: {
    none: 0,
    crossing: 2,
    parallel: 4,
    'shared-corridor': 6
  },
  interferenceSourceType: {
    none: 0,
    'foreign-iccp': 3,
    'dc-traction': 5,
    hvdc: 6,
    'industrial-dc': 3,
    unknown: 2
  },
  bondingStrategy: {
    none: 0,
    'monitoring-only': 0,
    'test-bond': -1,
    'controlled-drainage': -3
  }
};

const MITIGATION_PROFILES = {
  baseline: {
    id: 'baseline',
    label: 'Baseline mitigation profile',
    requiredMitigations: ['baseline survey', 'test station checks']
  },
  enhanced: {
    id: 'enhanced',
    label: 'Enhanced mitigation profile',
    requiredMitigations: ['baseline survey', 'test station checks', 'bonding review', 'drainage design review']
  },
  critical: {
    id: 'critical',
    label: 'Critical interference mitigation profile',
    requiredMitigations: ['baseline survey', 'test station checks', 'bonding review', 'drainage design review', 'traction coordination', 'continuous monitoring coupons']
  }
};

const MINIMUM_PROFILE_BY_RISK_LEVEL = {
  low: 'baseline',
  medium: 'enhanced',
  high: 'critical'
};
const PROFILE_RANK = {
  baseline: 0,
  enhanced: 1,
  critical: 2
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function parseMitigationActions(rawInput) {
  return String(rawInput || '')
    .split(/\r?\n|,/)
    .map((token) => normalizeToken(token))
    .filter((token) => token.length > 0);
}

export function evaluateInterferenceAssessment(input) {
  const nearbyForeignStructures = input.nearbyForeignStructures || 'none';
  const dcTractionSystem = input.dcTractionSystem || 'none';
  const knownInterferenceSources = input.knownInterferenceSources || 'none';
  const interferenceGeometry = input.interferenceGeometry || 'none';
  const interferenceSourceType = input.interferenceSourceType || 'none';
  const foreignStructureSeparationM = Number.isFinite(input.foreignStructureSeparationM)
    ? Math.max(0, input.foreignStructureSeparationM)
    : null;
  const parallelExposureLengthM = Number.isFinite(input.parallelExposureLengthM)
    ? Math.max(0, input.parallelExposureLengthM)
    : 0;
  const crossingAngleDeg = Number.isFinite(input.crossingAngleDeg)
    ? Math.min(90, Math.max(0, input.crossingAngleDeg))
    : 90;
  const measuredPotentialGradientMvPerM = Number.isFinite(input.measuredPotentialGradientMvPerM)
    ? Math.max(0, input.measuredPotentialGradientMvPerM)
    : 0;
  const bondingStrategy = input.bondingStrategy || 'none';
  const mitigationProfileId = input.mitigationProfile || 'baseline';
  const selectedMitigationProfile = MITIGATION_PROFILES[mitigationProfileId] || MITIGATION_PROFILES.baseline;
  const mitigationActions = Array.isArray(input.mitigationActions)
    ? input.mitigationActions.map((action) => normalizeToken(action)).filter((action) => action.length > 0)
    : [];
  const verificationTestDate = typeof input.verificationTestDate === 'string'
    ? input.verificationTestDate
    : '';
  const hasInteractionGeometry = interferenceGeometry !== 'none';
  const separationScore = !hasInteractionGeometry || foreignStructureSeparationM === null
    ? 0
    : (foreignStructureSeparationM < 3 ? 4 : (foreignStructureSeparationM < 10 ? 2 : 0));
  const parallelExposureScore = ['parallel', 'shared-corridor'].includes(interferenceGeometry)
    ? (parallelExposureLengthM >= 1000
      ? 4
      : (parallelExposureLengthM >= 250 ? 2 : (parallelExposureLengthM > 0 ? 1 : 0)))
    : 0;
  const crossingAngleScore = interferenceGeometry === 'crossing'
    ? (crossingAngleDeg <= 30 ? 3 : (crossingAngleDeg <= 60 ? 1 : 0))
    : 0;
  const potentialGradientScore = measuredPotentialGradientMvPerM >= 5
    ? 5
    : (measuredPotentialGradientMvPerM >= 2 ? 3 : (measuredPotentialGradientMvPerM > 0 ? 1 : 0));

  const riskFactorScores = [
    {
      key: 'nearbyForeignStructures',
      label: 'Nearby foreign structures',
      value: nearbyForeignStructures,
      score: RISK_WEIGHTS.nearbyForeignStructures[nearbyForeignStructures] ?? 0
    },
    {
      key: 'dcTractionSystem',
      label: 'DC traction systems',
      value: dcTractionSystem,
      score: RISK_WEIGHTS.dcTractionSystem[dcTractionSystem] ?? 0
    },
    {
      key: 'knownInterferenceSources',
      label: 'Known interference sources',
      value: knownInterferenceSources,
      score: RISK_WEIGHTS.knownInterferenceSources[knownInterferenceSources] ?? 0
    },
    {
      key: 'interferenceGeometry',
      label: 'Foreign-structure relationship',
      value: interferenceGeometry,
      score: RISK_WEIGHTS.interferenceGeometry[interferenceGeometry] ?? 0
    },
    {
      key: 'interferenceSourceType',
      label: 'Dominant interference source',
      value: interferenceSourceType,
      score: RISK_WEIGHTS.interferenceSourceType[interferenceSourceType] ?? 0
    },
    {
      key: 'foreignStructureSeparationM',
      label: 'Minimum structure separation',
      value: foreignStructureSeparationM === null ? 'not provided' : `${foreignStructureSeparationM} m`,
      score: separationScore
    },
    {
      key: 'parallelExposureLengthM',
      label: 'Parallel exposure length',
      value: `${parallelExposureLengthM} m`,
      score: parallelExposureScore
    },
    {
      key: 'crossingAngleDeg',
      label: 'Crossing angle',
      value: `${crossingAngleDeg}°`,
      score: crossingAngleScore
    },
    {
      key: 'measuredPotentialGradientMvPerM',
      label: 'Potential gradient',
      value: `${measuredPotentialGradientMvPerM} mV/m`,
      score: potentialGradientScore
    },
    {
      key: 'bondingStrategy',
      label: 'Bonding strategy credit',
      value: bondingStrategy,
      score: RISK_WEIGHTS.bondingStrategy[bondingStrategy] ?? 0
    }
  ];

  const totalScore = Math.max(0, riskFactorScores.reduce((sum, factor) => sum + factor.score, 0));
  const riskLevel = totalScore >= 13 ? 'high' : (totalScore >= 6 ? 'medium' : 'low');
  const minimumProfileId = MINIMUM_PROFILE_BY_RISK_LEVEL[riskLevel] || 'baseline';
  const minimumMitigationProfile = MITIGATION_PROFILES[minimumProfileId] || MITIGATION_PROFILES.baseline;
  const requiredMitigations = minimumMitigationProfile.requiredMitigations;
  const missingMitigations = requiredMitigations.filter((requiredAction) => !mitigationActions.includes(requiredAction));
  const verificationDateValid = /^\d{4}-\d{2}-\d{2}$/.test(verificationTestDate);
  const unresolvedHighRisk = riskLevel === 'high' && (missingMitigations.length > 0 || !verificationDateValid);
  const profileBelowRiskMinimum = (PROFILE_RANK[selectedMitigationProfile.id] ?? 0) < (PROFILE_RANK[minimumMitigationProfile.id] ?? 0);
  const riskDrivers = riskFactorScores
    .filter((factor) => factor.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((factor) => `${factor.label} (+${factor.score})`);
  const riskSummary = riskDrivers.length
    ? `${riskLevel.toUpperCase()} design-stage risk is driven by ${riskDrivers.slice(0, 3).join(', ')}.`
    : 'LOW design-stage risk: no scored interference drivers were identified.';

  return {
    profile: {
      id: selectedMitigationProfile.id,
      label: selectedMitigationProfile.label
    },
    minimumProfile: {
      id: minimumMitigationProfile.id,
      label: minimumMitigationProfile.label
    },
    score: totalScore,
    riskLevel,
    riskSummary,
    riskDrivers,
    riskFactorScores,
    geometry: {
      relationship: interferenceGeometry,
      sourceType: interferenceSourceType,
      foreignStructureSeparationM,
      parallelExposureLengthM,
      crossingAngleDeg,
      measuredPotentialGradientMvPerM,
      bondingStrategy
    },
    requiredMitigations,
    mitigationActions,
    missingMitigations,
    verificationTestDate: verificationTestDate || null,
    verificationDateValid,
    unresolvedHighRisk,
    profileBelowRiskMinimum
  };
}
