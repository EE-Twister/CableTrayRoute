import {
  CP_STANDARDS_PROFILE,
  getRequiredComplianceChecks
} from './standardsProfile.js';
import { computeDistributionBySegment } from './distributionModel.js';
import { evaluateCriteriaChecks } from './criteriaChecks.js';
import { evaluateInterferenceAssessment } from './interferenceAssessment.js';
import { COATING_MODEL_TYPES, resolveCoatingModel } from './coatingModel.js';

const LB_TO_KG = 0.45359237;
const MAX_NUMBER_OF_ANODES = 10000;

const TABLE_CURRENT_DENSITY_MA_M2 = {
  pipe: { low: 5, moderate: 10, high: 20 },
  tank: { low: 8, moderate: 15, high: 25 },
  other: { low: 6, moderate: 12, high: 22 }
};

const PIPE_MATERIAL_FACTORS = {
  'carbon-steel': { factor: 1.0, hint: 'Preset-based current density factor for carbon steel is applied.' },
  'ductile-iron': { factor: 1.1, hint: 'Ductile iron often uses slightly higher current demand than coated carbon steel.' },
  'stainless-steel': { factor: 0.6, hint: 'Stainless steel can use reduced current demand depending on grade and environment.' },
  copper: { factor: 0.35, hint: 'Copper is typically less common for CP; verify the design basis before final sizing.' },
  other: { factor: 1.0, hint: 'Generic metal preset is selected. Verify current density by project specification.' }
};

export const CP_STANDARD_BASIS = {
  standardsProfile: {
    id: 'cp-standards-profile',
    label: 'Adopted standards profile',
    summary: 'Defines target standards references, required deliverables, and mandatory/optional compliance checks.',
    standards: CP_STANDARDS_PROFILE.targetReferences.map((reference) => `${reference.code} (${reference.edition})`),
    selectedProtectionCriteriaSetId: CP_STANDARDS_PROFILE.selectedProtectionCriteriaSetId,
    requiredChecks: getRequiredComplianceChecks(),
    outputs: ['Standards references', 'Required design checks', 'Report design basis'],
    deliverables: Object.values(CP_STANDARDS_PROFILE.deliverables)
      .filter((deliverable) => deliverable.required)
      .map((deliverable) => deliverable.key)
  },
  currentDensitySelection: {
    id: 'current-density-selection',
    label: 'Current density selection ranges',
    standards: ['AMPP SP21424', 'NACE SP0169'],
    requiredChecks: ['currentDensitySelection'],
    summary: 'Table-range style current demand selection by structure condition and environment severity.',
    equation: 'i_design = i_base × F_resistivity × F_pH × F_material',
    outputs: ['Design current density', 'Area-based required current']
  },
  polarizationCriteria: {
    id: 'polarization-criteria',
    label: 'Polarization / protection criteria assumptions',
    standards: ['NACE SP0169', 'ISO 15589-1'],
    requiredChecks: ['commissioningChecksDefined', 'monitoringPlanDefined'],
    summary: 'Protection assumptions align with conventional on/off potential and polarization criteria used for buried steel CP design.',
    equation: 'I_required = (A_surface × f_coating × i_design × F_distribution) / F_availability',
    outputs: ['Required CP current', 'Profile potential assumptions']
  },
  anodeCapacityUtilization: {
    id: 'anode-capacity-utilization',
    label: 'Anode capacity and utilization values',
    standards: ['DNV-RP-B401', 'ISO 15589-1'],
    requiredChecks: ['anodeMassSizing', 'targetLifeVerification'],
    summary: 'Galvanic anode ampere-hour capacity and utilization factors follow published anode design guidance.',
    equation: 'W_required = (I_required × t) / (Q_anode × U × F_design)',
    secondaryEquation: 'Life = (W_installed × Q_anode × U × F_design) / (I_required × 8760)',
    outputs: ['Minimum anode mass', 'Predicted design life', 'Safety margin']
  },
  engineeringJudgmentAssumptions: {
    id: 'engineering-judgment',
    label: 'Engineering judgment assumptions',
    standards: ['Project-specific engineering judgment'],
    requiredChecks: ['commissioningChecksDefined', 'monitoringPlanDefined'],
    summary: 'Coating breakdown factor, design factor, and optional temperature correction require project-specific engineering validation.',
    outputs: ['Coating uncertainty band', 'Sensitivity scenarios', 'Design advisories'],
    assumptions: [
      'Coating demand model is selected by fixed factor, degradation curve, or segment-based condition factors.',
      'Design factor is selected as a reliability margin for uncertainty and lifecycle variability.',
      'Temperature correction is not explicitly modeled in this tool and should be applied by engineering review when needed.'
    ]
  },
  interferenceAssessment: {
    id: 'interference-assessment',
    label: 'Interference risk assessment and mitigation profile',
    standards: ['AMPP SP21424', 'NACE SP0169'],
    requiredChecks: ['interferenceAssessment'],
    summary: 'Scored risk screening for foreign structures, DC sources, route geometry, measured gradients, and profile-specific mitigations.',
    equation: 'Risk score = categorical drivers + geometry + exposure + gradient − mitigation credits',
    outputs: ['Interference risk level', 'Risk drivers', 'Required mitigation profile']
  }
};

export function calculateRequiredCurrent(areaExposedM2, currentDensityAperM2) {
  return areaExposedM2 * currentDensityAperM2;
}

export function calculateRequiredAnodeMass(requiredCurrentA, designHours, anodeCapacityAhPerKg, utilizationFactor, designFactor) {
  return (requiredCurrentA * designHours) / (anodeCapacityAhPerKg * utilizationFactor * designFactor);
}

export function calculatePredictedDesignLife(installedMassKg, anodeCapacityAhPerKg, utilizationFactor, designFactor, requiredCurrentA) {
  return (installedMassKg * anodeCapacityAhPerKg * utilizationFactor * designFactor) / (requiredCurrentA * 8760);
}

export function calculateIccpSourceSizing(requiredCurrentA, reserveFactor, groundbedResistanceOhm, voltageAllowanceV, ratedCurrentA, ratedVoltageV) {
  const requiredRectifierCurrentA = requiredCurrentA * reserveFactor;
  const requiredRectifierVoltageV = (requiredRectifierCurrentA * groundbedResistanceOhm) + voltageAllowanceV;
  const currentHeadroomA = ratedCurrentA - requiredRectifierCurrentA;
  const voltageHeadroomV = ratedVoltageV - requiredRectifierVoltageV;
  return {
    requiredRectifierCurrentA: roundTo(requiredRectifierCurrentA, 4),
    requiredRectifierVoltageV: roundTo(requiredRectifierVoltageV, 2),
    currentHeadroomA: roundTo(currentHeadroomA, 4),
    voltageHeadroomV: roundTo(voltageHeadroomV, 2),
    currentCapacityStatus: currentHeadroomA >= 0 ? 'pass' : 'fail',
    voltageCapacityStatus: voltageHeadroomV >= 0 ? 'pass' : 'fail',
    overallStatus: currentHeadroomA >= 0 && voltageHeadroomV >= 0 ? 'pass' : 'fail'
  };
}

function buildDistributionInput(input) {
  return {
    anodeTypeSystem: input.anodeTypeSystem,
    numberOfAnodes: input.numberOfAnodes,
    anodeSpacingM: input.anodeSpacingM,
    anodeDistanceToStructureM: input.anodeDistanceToStructureM,
    anodeBurialDepthM: input.anodeBurialDepthM,
    soilResistivityOhmM: input.soilResistivityOhmM,
    zoneResistivityOhmM: input.zoneResistivityOhmM
  };
}

function composeCpAnalysisResult({
  input,
  designCurrentDensityMaM2,
  distributionModel,
  coatingModel,
  criteriaCheckEvidence,
  interferenceAssessment
}) {
  const designCurrentDensityAperM2 = designCurrentDensityMaM2 / 1000;
  const exposedAreaM2 = input.surfaceAreaM2 * coatingModel.effectiveFactor;
  const areaBasedRequiredCurrentA = calculateRequiredCurrent(exposedAreaM2, designCurrentDensityAperM2);
  const distributionAdjustedCurrentA = areaBasedRequiredCurrentA * distributionModel.globalAttenuationFactor;
  const adjustedRequiredCurrentA = distributionAdjustedCurrentA / input.availabilityFactor;
  const isIccp = input.anodeTypeSystem === 'iccp';
  const designHours = input.targetLifeYears * 8760;
  const minimumAnodeMassKg = isIccp
    ? null
    : calculateRequiredAnodeMass(
      adjustedRequiredCurrentA,
      designHours,
      input.anodeCapacityAhPerKg,
      input.anodeUtilization,
      input.designFactor
    );
  const predictedLifeYears = isIccp
    ? null
    : calculatePredictedDesignLife(
      input.installedMassKg,
      input.anodeCapacityAhPerKg,
      input.anodeUtilization,
      input.designFactor,
      adjustedRequiredCurrentA
    );
  const iccpSizing = isIccp
    ? calculateIccpSourceSizing(
      adjustedRequiredCurrentA,
      input.iccpReserveFactor,
      input.iccpGroundbedResistanceOhm,
      input.iccpVoltageAllowanceV,
      input.iccpRatedCurrentA,
      input.iccpRatedVoltageV
    )
    : null;
  const measurementMetadataWarnings = Array.isArray(criteriaCheckEvidence?.measurementCorrections?.warnings)
    ? criteriaCheckEvidence.measurementCorrections.warnings
    : [];
  const profileData = buildCpProfileData({
    input,
    adjustedRequiredCurrentA,
    distributionModel,
    modeledReferencePotentialMv: input.modeledReferencePotentialMv,
    baseCoatingFactor: coatingModel.effectiveFactor
  });

  return {
    ...input,
    timestamp: new Date().toISOString(),
    standardsBasis: CP_STANDARD_BASIS,
    outputBasis: isIccp
      ? {
        requiredCurrentA: 'Uses exposed-area current demand adjusted for distribution and source availability.',
        requiredRectifierCurrentA: 'Applies the ICCP reserve factor to the required structure current.',
        requiredRectifierVoltageV: 'Adds the cable and polarization allowance to the calculated groundbed circuit voltage.',
        sourceHeadroom: 'Compares the entered rectifier current and voltage ratings with the preliminary source requirements.'
      }
      : {
        requiredCurrentA: 'Uses exposed-area current demand relation adjusted with per-segment distribution attenuation/effectiveness factors.',
        minimumAnodeMassKg: 'Uses anode mass sizing equation with anode capacity/utilization values from anode-capacity standards basis.',
        predictedLifeYears: 'Uses installed mass life relation with anode capacity/utilization basis and protection criteria assumptions.',
        safetyMargin: 'Compares predicted life versus target design life using the same protection and anode basis assumptions.'
      },
    designCurrentDensityMaM2: roundTo(designCurrentDensityMaM2, 3),
    coatingModel,
    coatingBreakdownFactor: roundTo(coatingModel.effectiveFactor, 4),
    exposedAreaM2: roundTo(exposedAreaM2, 3),
    areaBasedRequiredCurrentA: roundTo(areaBasedRequiredCurrentA, 4),
    distributionAdjustedCurrentA: roundTo(distributionAdjustedCurrentA, 4),
    distributionModel,
    requiredCurrentA: roundTo(adjustedRequiredCurrentA, 4),
    minimumAnodeMassKg: isIccp ? null : roundTo(minimumAnodeMassKg, 3),
    minimumAnodeMassLb: isIccp ? null : roundTo(minimumAnodeMassKg / LB_TO_KG, 3),
    predictedLifeYears: isIccp ? null : roundTo(predictedLifeYears, 2),
    safetyMarginYears: isIccp ? null : roundTo(predictedLifeYears - input.targetLifeYears, 2),
    safetyMarginPercent: isIccp ? null : roundTo(((predictedLifeYears - input.targetLifeYears) / input.targetLifeYears) * 100, 1),
    iccpSizing,
    criteriaCheckEvidence,
    measurementMetadataWarnings,
    interferenceAssessment,
    profileData,
    sensitivity: buildSensitivitySummary({
      input,
      adjustedRequiredCurrentA,
      minimumAnodeMassKg,
      predictedLifeYears,
      coatingModel,
      distributionModel
    })
  };
}

export function runCathodicProtectionAnalysis(input) {
  const analysisInput = withAnalysisInputDefaults(input);
  const validationErrors = validateCathodicProtectionInputs(analysisInput);
  if (validationErrors.length) {
    throw new Error(validationErrors.join(' '));
  }

  const designCurrentDensityMaM2 = analysisInput.currentDensityMethod === 'manual'
    ? analysisInput.manualCurrentDensityMaM2
    : lookupCurrentDensity(analysisInput.assetType, analysisInput.moistureCategory, analysisInput.soilResistivityOhmM, analysisInput.soilPh, analysisInput.pipeMaterial);

  const distributionModel = computeDistributionBySegment(buildDistributionInput(analysisInput));
  const coatingModel = resolveCoatingModel(analysisInput, { segmentCount: distributionModel.segments.length });
  const criteriaCheckEvidence = evaluateCriteriaChecks(analysisInput, CP_STANDARDS_PROFILE);
  const interferenceAssessment = evaluateInterferenceAssessment(analysisInput);

  return composeCpAnalysisResult({
    input: analysisInput,
    designCurrentDensityMaM2,
    distributionModel,
    coatingModel,
    criteriaCheckEvidence,
    interferenceAssessment
  });
}

export function buildCpProfileData({ input, adjustedRequiredCurrentA, distributionModel, modeledReferencePotentialMv, baseCoatingFactor }) {
  const segments = Array.isArray(distributionModel?.segments) && distributionModel.segments.length
    ? distributionModel.segments
    : [{ segment: 1, attenuationFactor: 1, zoneResistivityOhmM: input.soilResistivityOhmM }];
  const totalDistanceM = Math.max(input.anodeSpacingM * Math.max(input.numberOfAnodes - 1, 1), 1);
  const stepDistanceM = totalDistanceM / segments.length;
  const globalAttenuation = distributionModel?.globalAttenuationFactor || 1;
  const scenarioScale = {
    base: 1,
    conservative: 1.25,
    optimized: 0.85
  };

  const attenuation = segments.map((segment, index) => ({
    segmentIndex: index,
    distanceM: roundTo((index + 1) * stepDistanceM, 3),
    value: roundTo(segment.attenuationFactor ?? 1, 4),
    passMetricValue: roundTo(segment.attenuationFactor ?? 1, 4),
    zoneResistivityOhmM: segment.zoneResistivityOhmM
  }));

  const buildScenarioRows = (multiplier) => {
    const potential = segments.map((segment, index) => {
      const attenuationFactor = segment.attenuationFactor ?? 1;
      const distanceM = roundTo((index + 1) * stepDistanceM, 3);
      const potentialMv = modeledReferencePotentialMv - ((1 - attenuationFactor) * 220 * multiplier) - ((baseCoatingFactor || 0.2) * 40 * (multiplier - 1));
      return {
        segmentIndex: index,
        distanceM,
        value: roundTo(potentialMv, 1),
        passMetricValue: roundTo(potentialMv, 1)
      };
    });
    const currentDemand = segments.map((segment, index) => {
      const attenuationFactor = segment.attenuationFactor ?? 1;
      const demandA = adjustedRequiredCurrentA * (attenuationFactor / globalAttenuation) * multiplier;
      return {
        segmentIndex: index,
        distanceM: roundTo((index + 1) * stepDistanceM, 3),
        value: roundTo(demandA, 4),
        passMetricValue: roundTo(demandA, 4)
      };
    });
    return { potential, currentDemand };
  };

  return {
    generatedAt: new Date().toISOString(),
    thresholdBands: {
      potentialMv: { passWhenLessThanOrEqual: -850 },
      currentDemandA: { passWhenLessThanOrEqual: roundTo(adjustedRequiredCurrentA, 4) },
      attenuation: { passWhenGreaterThanOrEqual: 0.75 }
    },
    attenuation,
    scenarios: {
      base: buildScenarioRows(scenarioScale.base),
      conservative: buildScenarioRows(scenarioScale.conservative),
      optimized: buildScenarioRows(scenarioScale.optimized)
    }
  };
}

export function buildSensitivitySummary({ input, adjustedRequiredCurrentA, minimumAnodeMassKg, predictedLifeYears, coatingModel, distributionModel }) {
  const isIccp = input.anodeTypeSystem === 'iccp';
  const uncertainty = coatingModel?.uncertaintyBand || { lowFactor: input.coatingBreakdownFactor, baseFactor: input.coatingBreakdownFactor, highFactor: input.coatingBreakdownFactor };
  const baseFactor = uncertainty.baseFactor || input.coatingBreakdownFactor;
  const scenarios = [
    { key: 'low-coating', label: 'Low coating demand band', factor: uncertainty.lowFactor },
    { key: 'base', label: 'Base case', factor: uncertainty.baseFactor },
    { key: 'high-coating', label: 'High coating demand band', factor: uncertainty.highFactor }
  ];
  const segmentDemands = computeWorstCaseSegmentDemand({
    distributionModel,
    coatingModel,
    adjustedRequiredCurrentA,
    baseFactor
  });

  return scenarios.map((scenario) => {
    const currentMultiplier = baseFactor > 0 ? scenario.factor / baseFactor : 1;
    const scenarioCurrentA = adjustedRequiredCurrentA * currentMultiplier;
    const scenarioIccpSizing = isIccp
      ? calculateIccpSourceSizing(
        scenarioCurrentA,
        input.iccpReserveFactor,
        input.iccpGroundbedResistanceOhm,
        input.iccpVoltageAllowanceV,
        input.iccpRatedCurrentA,
        input.iccpRatedVoltageV
      )
      : null;
    const scenarioRequiredMassKg = minimumAnodeMassKg * currentMultiplier;
    const scenarioPredictedLifeYears = predictedLifeYears / currentMultiplier;
    const scenarioSafetyMarginYears = scenarioPredictedLifeYears - input.targetLifeYears;
    const scenarioWorstCaseSegmentDemandA = segmentDemands.worstCaseSegmentDemandA * currentMultiplier;
    const approvalStatus = isIccp
      ? (scenarioIccpSizing.overallStatus === 'pass' ? 'Capacity available' : 'Review required')
      : (scenarioSafetyMarginYears >= 0 ? 'Preliminary margin met' : 'Review required');
    return {
      ...scenario,
      approvalStatus,
      coatingFactor: roundTo(scenario.factor, 4),
      requiredCurrentA: roundTo(scenarioCurrentA, 4),
      minimumAnodeMassKg: isIccp ? null : roundTo(scenarioRequiredMassKg, 3),
      minimumAnodeMassLb: isIccp ? null : roundTo(scenarioRequiredMassKg / LB_TO_KG, 3),
      predictedLifeYears: isIccp ? null : roundTo(scenarioPredictedLifeYears, 2),
      requiredRectifierCurrentA: scenarioIccpSizing?.requiredRectifierCurrentA ?? null,
      requiredRectifierVoltageV: scenarioIccpSizing?.requiredRectifierVoltageV ?? null,
      currentHeadroomA: scenarioIccpSizing?.currentHeadroomA ?? null,
      voltageHeadroomV: scenarioIccpSizing?.voltageHeadroomV ?? null,
      worstCaseSegmentDemandA: roundTo(scenarioWorstCaseSegmentDemandA, 4),
      worstCaseSegmentLabel: segmentDemands.worstCaseSegmentLabel,
      safetyMarginYears: isIccp ? null : roundTo(scenarioSafetyMarginYears, 2),
      safetyMarginPercent: isIccp ? null : roundTo((scenarioSafetyMarginYears / input.targetLifeYears) * 100, 1)
    };
  });
}

function computeWorstCaseSegmentDemand({ distributionModel, coatingModel, adjustedRequiredCurrentA, baseFactor }) {
  const segments = Array.isArray(distributionModel?.segments) ? distributionModel.segments : [];
  if (!segments.length) {
    return { worstCaseSegmentDemandA: adjustedRequiredCurrentA, worstCaseSegmentLabel: 'Segment 1' };
  }

  const segmentFactors = Array.isArray(coatingModel?.segmentFactors) && coatingModel.segmentFactors.length
    ? coatingModel.segmentFactors
    : new Array(segments.length).fill(baseFactor);
  const averageSegmentFactor = segmentFactors.reduce((sum, factor) => sum + factor, 0) / segmentFactors.length;
  const worstSegment = segments.reduce((worst, segment, index) => {
    const factor = segmentFactors[index] ?? averageSegmentFactor;
    const localDemand = (segment.attenuationFactor ?? 1) * factor;
    if (!worst || localDemand > worst.localDemand) {
      return {
        localDemand,
        label: `Segment ${segment.segment ?? index + 1}`
      };
    }
    return worst;
  }, null);
  const worstCaseSegmentDemandA = averageSegmentFactor > 0
    ? adjustedRequiredCurrentA * (worstSegment.localDemand / averageSegmentFactor)
    : adjustedRequiredCurrentA;
  return {
    worstCaseSegmentDemandA,
    worstCaseSegmentLabel: worstSegment?.label || 'Segment 1'
  };
}

export function withAnalysisInputDefaults(input) {
  const candidate = input && typeof input === 'object' ? input : {};
  return {
    ...candidate,
    modeledReferencePotentialMv: Number.isFinite(candidate.modeledReferencePotentialMv)
      ? candidate.modeledReferencePotentialMv
      : candidate.measuredInstantOffPotentialMv,
    iccpRatedCurrentA: Number.isFinite(candidate.iccpRatedCurrentA) ? candidate.iccpRatedCurrentA : 10,
    iccpRatedVoltageV: Number.isFinite(candidate.iccpRatedVoltageV) ? candidate.iccpRatedVoltageV : 50,
    iccpGroundbedResistanceOhm: Number.isFinite(candidate.iccpGroundbedResistanceOhm) ? candidate.iccpGroundbedResistanceOhm : 1.5,
    iccpVoltageAllowanceV: Number.isFinite(candidate.iccpVoltageAllowanceV) ? candidate.iccpVoltageAllowanceV : 5,
    iccpReserveFactor: Number.isFinite(candidate.iccpReserveFactor) ? candidate.iccpReserveFactor : 1.25
  };
}

export function validateCathodicProtectionInputs(input) {
  const errors = [];
  const positiveChecks = [
    ['soilResistivityOhmM', input.soilResistivityOhmM],
    ['surfaceAreaM2', input.surfaceAreaM2],
    ['targetLifeYears', input.targetLifeYears],
    ['availabilityFactor', input.availabilityFactor]
  ];

  positiveChecks.forEach(([name, value]) => {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} must be greater than zero.`);
    }
  });

  if (!Number.isFinite(input.coatingBreakdownFactor) || input.coatingBreakdownFactor <= 0 || input.coatingBreakdownFactor > 1) {
    errors.push('coatingBreakdownFactor must be between 0 and 1, exclusive of zero.');
  }

  if (!Object.values(COATING_MODEL_TYPES).includes(input.coatingModelType)) {
    errors.push('coatingModelType must be fixed, degradation-curve, or segment-condition.');
  }

  if (input.coatingModelType === COATING_MODEL_TYPES.degradationCurve) {
    if (!Number.isFinite(input.coatingInitialBreakdownFactor) || input.coatingInitialBreakdownFactor <= 0 || input.coatingInitialBreakdownFactor > 1) {
      errors.push('coatingInitialBreakdownFactor must be between 0 and 1 for degradation-curve mode.');
    }
    if (!Number.isFinite(input.coatingEndOfLifeBreakdownFactor) || input.coatingEndOfLifeBreakdownFactor <= 0 || input.coatingEndOfLifeBreakdownFactor > 1) {
      errors.push('coatingEndOfLifeBreakdownFactor must be between 0 and 1 for degradation-curve mode.');
    }
    if (!Number.isFinite(input.coatingDegradationExponent) || input.coatingDegradationExponent <= 0) {
      errors.push('coatingDegradationExponent must be greater than zero for degradation-curve mode.');
    }
  }

  if (input.coatingModelType === COATING_MODEL_TYPES.segmentCondition) {
    if (!Array.isArray(input.segmentConditionFactors) || !input.segmentConditionFactors.length) {
      errors.push('segmentConditionFactors must include at least one factor for segment-condition mode.');
    } else if (input.segmentConditionFactors.some((value) => !Number.isFinite(value) || value <= 0 || value > 1)) {
      errors.push('segmentConditionFactors values must be between 0 and 1 for segment-condition mode.');
    }
  }

  if (!Number.isFinite(input.soilPh) || input.soilPh < 0 || input.soilPh > 14) {
    errors.push('soilPh must be between 0 and 14.');
  }

  if (!['pipe', 'tank', 'other'].includes(input.assetType)) {
    errors.push('assetType must be pipe, tank, or other.');
  }

  if (input.assetType === 'pipe' && !Object.keys(PIPE_MATERIAL_FACTORS).includes(input.pipeMaterial)) {
    errors.push('pipeMaterial must be a supported material option.');
  }

  if (!['low', 'moderate', 'high'].includes(input.moistureCategory)) {
    errors.push('moistureCategory must be low, moderate, or high.');
  }

  if (!['table', 'manual'].includes(input.currentDensityMethod)) {
    errors.push('currentDensityMethod must be table or manual.');
  }

  if (input.currentDensityMethod === 'manual' && (!Number.isFinite(input.manualCurrentDensityMaM2) || input.manualCurrentDensityMaM2 <= 0)) {
    errors.push('manualCurrentDensityMaM2 must be greater than zero when manual mode is selected.');
  }

  if (!['galvanic', 'iccp'].includes(input.anodeTypeSystem)) {
    errors.push('anodeTypeSystem must be galvanic or iccp.');
  }

  if (input.anodeTypeSystem === 'galvanic') {
    [
      ['anodeCapacityAhPerKg', input.anodeCapacityAhPerKg],
      ['installedMassKg', input.installedMassKg],
      ['designFactor', input.designFactor],
      ['anodeUtilization', input.anodeUtilization]
    ].forEach(([name, value]) => {
      if (!Number.isFinite(value) || value <= 0) {
        errors.push(`${name} must be greater than zero for galvanic systems.`);
      }
    });
  }

  if (input.anodeTypeSystem === 'iccp') {
    [
      ['iccpRatedCurrentA', input.iccpRatedCurrentA],
      ['iccpRatedVoltageV', input.iccpRatedVoltageV],
      ['iccpGroundbedResistanceOhm', input.iccpGroundbedResistanceOhm],
      ['iccpReserveFactor', input.iccpReserveFactor]
    ].forEach(([name, value]) => {
      if (!Number.isFinite(value) || value <= 0) {
        errors.push(`${name} must be greater than zero for ICCP systems.`);
      }
    });
    if (!Number.isFinite(input.iccpVoltageAllowanceV) || input.iccpVoltageAllowanceV < 0) {
      errors.push('iccpVoltageAllowanceV must be zero or greater for ICCP systems.');
    }
    if (Number.isFinite(input.iccpReserveFactor) && input.iccpReserveFactor < 1) {
      errors.push('iccpReserveFactor must be at least 1.');
    }
  }

  if (!Number.isInteger(input.numberOfAnodes) || input.numberOfAnodes <= 0 || input.numberOfAnodes > MAX_NUMBER_OF_ANODES) {
    errors.push(`numberOfAnodes must be a positive integer up to ${MAX_NUMBER_OF_ANODES}.`);
  }

  ['anodeSpacingM', 'anodeDistanceToStructureM', 'anodeBurialDepthM'].forEach((fieldName) => {
    if (!Number.isFinite(input[fieldName]) || input[fieldName] <= 0) {
      errors.push(`${fieldName} must be greater than zero.`);
    }
  });

  if (!Array.isArray(input.zoneResistivityOhmM) || input.zoneResistivityOhmM.some((value) => !Number.isFinite(value) || value <= 0)) {
    errors.push('zoneResistivityOhmM values must be positive numbers when provided.');
  }

  if (input.zoneResistivityInputValid === false) {
    errors.push('zoneResistivityOhmM input must be a comma-separated list of positive numbers.');
  }

  if (!Number.isFinite(input.modeledReferencePotentialMv)) {
    errors.push('modeledReferencePotentialMv must be a finite number.');
  }

  if (input.criteriaEvidenceEnabled !== false) {
    if (!Number.isFinite(input.measuredInstantOffPotentialMv)) {
      errors.push('measuredInstantOffPotentialMv must be a finite number.');
    }

    if (!Number.isFinite(input.simulatedPolarizationShiftMv) || input.simulatedPolarizationShiftMv < 0) {
      errors.push('simulatedPolarizationShiftMv must be zero or greater.');
    }

    if (!Number.isInteger(input.testPointCount) || input.testPointCount <= 0) {
      errors.push('testPointCount must be a positive integer.');
    }

    if (!Number.isInteger(input.passingTestPointCount) || input.passingTestPointCount < 0 || input.passingTestPointCount > input.testPointCount) {
      errors.push('passingTestPointCount must be an integer between 0 and testPointCount.');
    }
  }

  if (!['none', 'isolated', 'multiple', 'sharedCorridor'].includes(input.nearbyForeignStructures)) {
    errors.push('nearbyForeignStructures must be a supported risk value.');
  }

  if (!['none', 'regional', 'nearby', 'parallelReturn'].includes(input.dcTractionSystem)) {
    errors.push('dcTractionSystem must be a supported risk value.');
  }

  if (!['none', 'possible', 'confirmed', 'severe'].includes(input.knownInterferenceSources)) {
    errors.push('knownInterferenceSources must be a supported risk value.');
  }

  if (input.interferenceGeometry !== undefined && !['none', 'crossing', 'parallel', 'shared-corridor'].includes(input.interferenceGeometry)) {
    errors.push('interferenceGeometry must be none, crossing, parallel, or shared-corridor.');
  }

  if (input.interferenceSourceType !== undefined && !['none', 'foreign-iccp', 'dc-traction', 'hvdc', 'industrial-dc', 'unknown'].includes(input.interferenceSourceType)) {
    errors.push('interferenceSourceType must be a supported source option.');
  }

  ['foreignStructureSeparationM', 'parallelExposureLengthM', 'measuredPotentialGradientMvPerM'].forEach((fieldName) => {
    if (input[fieldName] !== undefined && (!Number.isFinite(input[fieldName]) || input[fieldName] < 0)) {
      errors.push(`${fieldName} must be zero or greater when provided.`);
    }
  });

  if (input.crossingAngleDeg !== undefined && (!Number.isFinite(input.crossingAngleDeg) || input.crossingAngleDeg < 0 || input.crossingAngleDeg > 90)) {
    errors.push('crossingAngleDeg must be between 0 and 90.');
  }

  if (input.bondingStrategy !== undefined && !['none', 'monitoring-only', 'test-bond', 'controlled-drainage'].includes(input.bondingStrategy)) {
    errors.push('bondingStrategy must be a supported design-stage strategy.');
  }

  if (!['baseline', 'enhanced', 'critical'].includes(input.mitigationProfile)) {
    errors.push('mitigationProfile must be baseline, enhanced, or critical.');
  }

  if (input.criteriaEvidenceEnabled !== false) {
    if (!['instant-off', 'on-potential', 'coupon'].includes(input.testMethod)) {
      errors.push('testMethod must be instant-off, on-potential, or coupon.');
    }

    if (!['native-soil', 'casing', 'foreign-interference', 'test-station', 'unknown'].includes(input.measurementContext)) {
      errors.push('measurementContext must be a supported option.');
    }

    if (!['local', 'remote', 'coupon-lead', 'unknown'].includes(input.referenceElectrodeLocation)) {
      errors.push('referenceElectrodeLocation must be a supported option.');
    }

    if (!['instant-off', 'coupon', 'calculated', 'none', 'unknown'].includes(input.irDropCompensationMethod)) {
      errors.push('irDropCompensationMethod must be a supported option.');
    }

    if (Number.isFinite(input.measuredIrDropMv) && input.measuredIrDropMv < 0) {
      errors.push('measuredIrDropMv cannot be negative.');
    }

    if (Number.isFinite(input.couponDepolarizationMv) && input.couponDepolarizationMv < 0) {
      errors.push('couponDepolarizationMv cannot be negative.');
    }

    if (input.testMethod === 'on-potential' && (!Number.isFinite(input.measuredIrDropMv) || input.measuredIrDropMv <= 0)) {
      errors.push('on-potential testMethod requires measuredIrDropMv greater than 0 mV.');
    }

    if (input.testMethod === 'coupon' && (!Number.isFinite(input.couponDepolarizationMv) || input.couponDepolarizationMv <= 0)) {
      errors.push('coupon testMethod requires couponDepolarizationMv greater than 0 mV.');
    }
  }

  return errors;
}

export function lookupCurrentDensity(assetType, moistureCategory, soilResistivityOhmM, soilPh, pipeMaterial = 'carbon-steel') {
  const base = TABLE_CURRENT_DENSITY_MA_M2[assetType]?.[moistureCategory] ?? 10;
  const resistivityFactor = soilResistivityOhmM < 50 ? 1.2 : (soilResistivityOhmM > 200 ? 0.85 : 1.0);
  const phFactor = soilPh < 5.5 || soilPh > 9 ? 1.15 : 1.0;
  const materialFactor = assetType === 'pipe'
    ? (PIPE_MATERIAL_FACTORS[pipeMaterial]?.factor ?? 1.0)
    : 1.0;
  return base * resistivityFactor * phFactor * materialFactor;
}

export function roundTo(value, decimals) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}
