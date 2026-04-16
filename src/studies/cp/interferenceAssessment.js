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
  const mitigationProfileId = input.mitigationProfile || 'baseline';
  const mitigationProfile = MITIGATION_PROFILES[mitigationProfileId] || MITIGATION_PROFILES.baseline;
  const mitigationActions = Array.isArray(input.mitigationActions)
    ? input.mitigationActions.map((action) => normalizeToken(action)).filter((action) => action.length > 0)
    : [];
  const verificationTestDate = typeof input.verificationTestDate === 'string'
    ? input.verificationTestDate
    : '';

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
    }
  ];

  const totalScore = riskFactorScores.reduce((sum, factor) => sum + factor.score, 0);
  const riskLevel = totalScore >= 13 ? 'high' : (totalScore >= 6 ? 'medium' : 'low');
  const requiredMitigations = mitigationProfile.requiredMitigations;
  const missingMitigations = requiredMitigations.filter((requiredAction) => !mitigationActions.includes(requiredAction));
  const verificationDateValid = /^\d{4}-\d{2}-\d{2}$/.test(verificationTestDate);
  const unresolvedHighRisk = riskLevel === 'high' && (missingMitigations.length > 0 || !verificationDateValid);

  return {
    profile: {
      id: mitigationProfile.id,
      label: mitigationProfile.label
    },
    score: totalScore,
    riskLevel,
    riskFactorScores,
    requiredMitigations,
    mitigationActions,
    missingMitigations,
    verificationTestDate: verificationTestDate || null,
    verificationDateValid,
    unresolvedHighRisk
  };
}
