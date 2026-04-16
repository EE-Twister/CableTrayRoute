import { getStudies, getStudyApprovals, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import {
  CP_STANDARDS_PROFILE,
  evaluateComplianceChecks,
  getRequiredComplianceChecks,
  buildInitialComplianceStatus
} from './src/studies/cp/standardsProfile.js';
import { computeDistributionBySegment, parseZoneResistivityValues } from './src/studies/cp/distributionModel.js';
import { evaluateCriteriaChecks } from './src/studies/cp/criteriaChecks.js';
import { evaluateInterferenceAssessment, parseMitigationActions } from './src/studies/cp/interferenceAssessment.js';
import { COATING_MODEL_TYPES, parseConditionFactorValues, resolveCoatingModel } from './src/studies/cp/coatingModel.js';
import { initCpLayoutCanvas } from './src/cpLayoutCanvas.js';
import { initCpProfiles } from './src/cpProfiles.js';

const SQFT_TO_SQM = 0.09290304;
const LB_TO_KG = 0.45359237;
const IN_TO_M = 0.0254;
const MM_TO_M = 0.001;
const FT_TO_M = 0.3048;
const SQM_TO_SQFT = 10.76391041671;
const COMMISSIONING_CHECKLIST_ITEMS = [
  {
    key: 'requiredCommissioningTests',
    label: 'Required commissioning tests',
    description: 'Record who completed acceptance criteria tests and where evidence is stored.'
  },
  {
    key: 'monitoringIntervals',
    label: 'Monitoring intervals',
    description: 'Record who approved monitoring cadence and reference the schedule evidence.'
  },
  {
    key: 'correctiveActionThresholds',
    label: 'Trigger thresholds for corrective action',
    description: 'Record who approved action trigger thresholds and supporting evidence.'
  }
];

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

let cpLayoutCanvasController = null;
let cpProfilesController = null;

function mapAcceptanceTargetToMeasurementSetup(checkKey = '') {
  if (checkKey === 'instantOffPotential') return 'instantOffPotential';
  if (checkKey === 'polarizationShift') return 'polarizationShift';
  if (checkKey === 'testPointCoverage') return 'testPointCoverage';
  if (checkKey === 'commissioningChecksDefined') return 'instantOffPotential';
  if (checkKey === 'monitoringPlanDefined') return 'testPointCoverage';
  return 'polarizationShift';
}

function focusMeasurementVisualization(checkKey = '') {
  const setupKey = mapAcceptanceTargetToMeasurementSetup(checkKey);
  cpLayoutCanvasController?.setMeasurementSetup?.(setupKey);
  const layoutPanel = document.getElementById('cp-layout-canvas-panel');
  layoutPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const CP_STANDARD_BASIS = {
  standardsProfile: {
    id: 'cp-standards-profile',
    label: 'Adopted standards profile',
    summary: 'Defines target standards references, required deliverables, and mandatory/optional compliance checks.',
    standards: CP_STANDARDS_PROFILE.targetReferences.map((reference) => `${reference.code} (${reference.edition})`),
    selectedProtectionCriteriaSetId: CP_STANDARDS_PROFILE.selectedProtectionCriteriaSetId,
    requiredChecks: getRequiredComplianceChecks(),
    deliverables: Object.values(CP_STANDARDS_PROFILE.deliverables)
      .filter((deliverable) => deliverable.required)
      .map((deliverable) => deliverable.key)
  },
  currentDensitySelection: {
    id: 'current-density-selection',
    label: 'Current density selection ranges',
    standards: ['AMPP SP21424', 'NACE SP0169'],
    requiredChecks: ['currentDensitySelection'],
    summary: 'Table-range style current demand selection by structure condition and environment severity.'
  },
  polarizationCriteria: {
    id: 'polarization-criteria',
    label: 'Polarization / protection criteria assumptions',
    standards: ['NACE SP0169', 'ISO 15589-1'],
    requiredChecks: ['commissioningChecksDefined', 'monitoringPlanDefined'],
    summary: 'Protection assumptions align with conventional on/off potential and polarization criteria used for buried steel CP design.'
  },
  anodeCapacityUtilization: {
    id: 'anode-capacity-utilization',
    label: 'Anode capacity and utilization values',
    standards: ['DNV-RP-B401', 'ISO 15589-1'],
    requiredChecks: ['anodeMassSizing', 'targetLifeVerification'],
    summary: 'Galvanic anode ampere-hour capacity and utilization factors follow published anode design guidance.'
  },
  engineeringJudgmentAssumptions: {
    id: 'engineering-judgment',
    label: 'Engineering judgment assumptions',
    standards: ['Project-specific engineering judgment'],
    requiredChecks: ['commissioningChecksDefined', 'monitoringPlanDefined'],
    summary: 'Coating breakdown factor, design factor, and optional temperature correction require project-specific engineering validation.',
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
    summary: 'Scored risk screening for foreign structures, DC traction systems, and known stray-current sources with profile-specific mitigations.'
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

export function runCathodicProtectionAnalysis(input) {
  const validationErrors = validateInputs(input);
  if (validationErrors.length) {
    throw new Error(validationErrors.join(' '));
  }

  const designCurrentDensityMaM2 = input.currentDensityMethod === 'manual'
    ? input.manualCurrentDensityMaM2
    : lookupCurrentDensity(input.assetType, input.moistureCategory, input.soilResistivityOhmM, input.soilPh, input.pipeMaterial);

  const designCurrentDensityAperM2 = designCurrentDensityMaM2 / 1000;
  const distributionModel = computeDistributionBySegment({
    anodeTypeSystem: input.anodeTypeSystem,
    numberOfAnodes: input.numberOfAnodes,
    anodeSpacingM: input.anodeSpacingM,
    anodeDistanceToStructureM: input.anodeDistanceToStructureM,
    anodeBurialDepthM: input.anodeBurialDepthM,
    soilResistivityOhmM: input.soilResistivityOhmM,
    zoneResistivityOhmM: input.zoneResistivityOhmM
  });
  const coatingModel = resolveCoatingModel(input, { segmentCount: distributionModel.segments.length });
  const exposedAreaM2 = input.surfaceAreaM2 * coatingModel.effectiveFactor;
  const areaBasedRequiredCurrentA = calculateRequiredCurrent(exposedAreaM2, designCurrentDensityAperM2);
  const distributionAdjustedCurrentA = areaBasedRequiredCurrentA * distributionModel.globalAttenuationFactor;
  const adjustedRequiredCurrentA = distributionAdjustedCurrentA / input.availabilityFactor;
  const designHours = input.targetLifeYears * 8760;

  const minimumAnodeMassKg = calculateRequiredAnodeMass(
    adjustedRequiredCurrentA,
    designHours,
    input.anodeCapacityAhPerKg,
    input.anodeUtilization,
    input.designFactor
  );

  const predictedLifeYears = calculatePredictedDesignLife(
    input.installedMassKg,
    input.anodeCapacityAhPerKg,
    input.anodeUtilization,
    input.designFactor,
    adjustedRequiredCurrentA
  );
  const criteriaCheckEvidence = evaluateCriteriaChecks(input, CP_STANDARDS_PROFILE);
  const interferenceAssessment = evaluateInterferenceAssessment(input);
  const measurementMetadataWarnings = Array.isArray(criteriaCheckEvidence?.measurementCorrections?.warnings)
    ? criteriaCheckEvidence.measurementCorrections.warnings
    : [];
  const profileData = buildCpProfileData({
    input,
    adjustedRequiredCurrentA,
    distributionModel,
    measuredInstantOffPotentialMv: input.measuredInstantOffPotentialMv,
    baseCoatingFactor: coatingModel.effectiveFactor
  });

  return {
    ...input,
    timestamp: new Date().toISOString(),
    standardsBasis: CP_STANDARD_BASIS,
    outputBasis: {
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
    minimumAnodeMassKg: roundTo(minimumAnodeMassKg, 3),
    minimumAnodeMassLb: roundTo(minimumAnodeMassKg / LB_TO_KG, 3),
    predictedLifeYears: roundTo(predictedLifeYears, 2),
    safetyMarginYears: roundTo(predictedLifeYears - input.targetLifeYears, 2),
    safetyMarginPercent: roundTo(((predictedLifeYears - input.targetLifeYears) / input.targetLifeYears) * 100, 1),
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

function buildCpProfileData({ input, adjustedRequiredCurrentA, distributionModel, measuredInstantOffPotentialMv, baseCoatingFactor }) {
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
      const potentialMv = measuredInstantOffPotentialMv - ((1 - attenuationFactor) * 220 * multiplier) - ((baseCoatingFactor || 0.2) * 40 * (multiplier - 1));
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
        passMetricValue: roundTo(demandA / adjustedRequiredCurrentA, 4)
      };
    });
    return { potential, currentDemand };
  };

  return {
    generatedAt: new Date().toISOString(),
    thresholdBands: {
      potentialMv: { passWhenLessThanOrEqual: -850 },
      currentDemandRatio: { passWhenLessThanOrEqual: 1 },
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

function buildSensitivitySummary({ input, adjustedRequiredCurrentA, minimumAnodeMassKg, predictedLifeYears, coatingModel, distributionModel }) {
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
    const scenarioRequiredMassKg = minimumAnodeMassKg * currentMultiplier;
    const scenarioPredictedLifeYears = predictedLifeYears / currentMultiplier;
    const scenarioSafetyMarginYears = scenarioPredictedLifeYears - input.targetLifeYears;
    const scenarioWorstCaseSegmentDemandA = segmentDemands.worstCaseSegmentDemandA * currentMultiplier;
    const approvalStatus = scenarioSafetyMarginYears >= 0 ? 'Approved' : 'Review required';
    return {
      ...scenario,
      approvalStatus,
      coatingFactor: roundTo(scenario.factor, 4),
      requiredCurrentA: roundTo(scenarioCurrentA, 4),
      minimumAnodeMassKg: roundTo(scenarioRequiredMassKg, 3),
      minimumAnodeMassLb: roundTo(scenarioRequiredMassKg / LB_TO_KG, 3),
      predictedLifeYears: roundTo(scenarioPredictedLifeYears, 2),
      worstCaseSegmentDemandA: roundTo(scenarioWorstCaseSegmentDemandA, 4),
      worstCaseSegmentLabel: segmentDemands.worstCaseSegmentLabel,
      safetyMarginYears: roundTo(scenarioSafetyMarginYears, 2),
      safetyMarginPercent: roundTo((scenarioSafetyMarginYears / input.targetLifeYears) * 100, 1)
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

function validateInputs(input) {
  const errors = [];
  const positiveChecks = [
    ['soilResistivityOhmM', input.soilResistivityOhmM],
    ['surfaceAreaM2', input.surfaceAreaM2],
    ['anodeCapacityAhPerKg', input.anodeCapacityAhPerKg],
    ['targetLifeYears', input.targetLifeYears],
    ['installedMassKg', input.installedMassKg],
    ['designFactor', input.designFactor],
    ['availabilityFactor', input.availabilityFactor],
    ['anodeUtilization', input.anodeUtilization]
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

  if (!Number.isInteger(input.numberOfAnodes) || input.numberOfAnodes <= 0) {
    errors.push('numberOfAnodes must be a positive integer.');
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

  if (!['none', 'isolated', 'multiple', 'sharedCorridor'].includes(input.nearbyForeignStructures)) {
    errors.push('nearbyForeignStructures must be a supported risk value.');
  }

  if (!['none', 'regional', 'nearby', 'parallelReturn'].includes(input.dcTractionSystem)) {
    errors.push('dcTractionSystem must be a supported risk value.');
  }

  if (!['none', 'possible', 'confirmed', 'severe'].includes(input.knownInterferenceSources)) {
    errors.push('knownInterferenceSources must be a supported risk value.');
  }

  if (!['baseline', 'enhanced', 'critical'].includes(input.mitigationProfile)) {
    errors.push('mitigationProfile must be baseline, enhanced, or critical.');
  }

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

  return errors;
}

function lookupCurrentDensity(assetType, moistureCategory, soilResistivityOhmM, soilPh, pipeMaterial = 'carbon-steel') {
  const base = TABLE_CURRENT_DENSITY_MA_M2[assetType]?.[moistureCategory] ?? 10;
  const resistivityFactor = soilResistivityOhmM < 50 ? 1.2 : (soilResistivityOhmM > 200 ? 0.85 : 1.0);
  const phFactor = soilPh < 5.5 || soilPh > 9 ? 1.15 : 1.0;
  const materialFactor = assetType === 'pipe'
    ? (PIPE_MATERIAL_FACTORS[pipeMaterial]?.factor ?? 1.0)
    : 1.0;
  return base * resistivityFactor * phFactor * materialFactor;
}

function roundTo(value, decimals) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

function normalizeSavedStudy(saved) {
  if (!saved || typeof saved !== 'object') {
    return null;
  }

  const compliance = saved.compliance && typeof saved.compliance === 'object'
    ? saved.compliance
    : {
      profileId: CP_STANDARDS_PROFILE.profileId,
      requiredChecks: buildInitialComplianceStatus(),
      optionalChecks: {},
      lastEvaluatedAt: null
    };

  const existingHistory = Array.isArray(saved.complianceHistory)
    ? saved.complianceHistory
    : [];

  return {
    ...saved,
    compliance,
    complianceHistory: existingHistory
  };
}

function applySavedCpInputs(study) {
  if (!study || typeof study !== 'object') {
    return;
  }

  const valueMap = {
    'number-of-anodes': study.numberOfAnodes,
    'anode-spacing': study.units === 'metric' ? study.anodeSpacingM : (study.anodeSpacingM / FT_TO_M),
    'anode-distance-to-structure': study.units === 'metric' ? study.anodeDistanceToStructureM : (study.anodeDistanceToStructureM / FT_TO_M),
    'anode-burial-depth': study.units === 'metric' ? study.anodeBurialDepthM : (study.anodeBurialDepthM / FT_TO_M),
    'test-point-count': study.testPointCount,
    'test-point-pass-count': study.passingTestPointCount,
    'reference-electrode-location': study.referenceElectrodeLocation
  };

  Object.entries(valueMap).forEach(([id, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    const field = document.getElementById(id);
    if (!field) {
      return;
    }
    if (field.tagName === 'SELECT') {
      field.value = String(value);
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      field.value = String(roundTo(value, 3));
      return;
    }
    field.value = String(value);
  });
}

function createComplianceRecord(result, previousStudy = null, approval = null) {
  const requiredChecks = evaluateComplianceChecks(result);
  const previousRequiredChecks = previousStudy?.compliance?.requiredChecks || {};
  const commissioningChecklistComplete = isCommissioningChecklistComplete(approval);
  const mergedRequiredChecks = {
    ...buildInitialComplianceStatus(),
    ...previousRequiredChecks,
    ...requiredChecks,
    commissioningChecksDefined: commissioningChecklistComplete && requiredChecks.commissioningChecksDefined === 'pass'
      ? 'pass'
      : 'fail'
  };
  const evaluatedAt = result.timestamp;
  const failedCheckKeys = Object.keys(mergedRequiredChecks).filter((checkKey) => mergedRequiredChecks[checkKey] !== 'pass');
  const complianceState = failedCheckKeys.length
    ? (commissioningChecklistComplete ? 'not-compliant' : 'provisional')
    : 'compliant';

  const compliance = {
    profileId: CP_STANDARDS_PROFILE.profileId,
    requiredChecks: mergedRequiredChecks,
    optionalChecks: previousStudy?.compliance?.optionalChecks || {},
    lastEvaluatedAt: evaluatedAt,
    commissioningChecklistComplete,
    complianceState,
    failedCheckKeys
  };

  const historyEntry = {
    evaluatedAt,
    requiredChecks: mergedRequiredChecks
  };

  const complianceHistory = [
    ...(Array.isArray(previousStudy?.complianceHistory) ? previousStudy.complianceHistory : []),
    historyEntry
  ];

  return { compliance, complianceHistory };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('cathodicProtection', 'study-review-panel', {
    checklistItems: COMMISSIONING_CHECKLIST_ITEMS,
    onSave: (approval) => {
      const studies = getStudies();
      const existingStudy = normalizeSavedStudy(studies.cathodicProtection);
      if (!existingStudy) return;
      const complianceRecord = createComplianceRecord(existingStudy, existingStudy, approval);
      studies.cathodicProtection = {
        ...existingStudy,
        reportExport: buildReportExportData(existingStudy, approval),
        compliance: complianceRecord.compliance,
        complianceHistory: complianceRecord.complianceHistory
      };
      setStudies(studies);
      renderResults(studies.cathodicProtection, resultsDiv);
      renderComplianceStatusPanel(
        compliancePanelEl,
        studies.cathodicProtection.compliance.requiredChecks,
        studies.cathodicProtection.compliance.lastEvaluatedAt,
        studies.cathodicProtection.compliance
      );
    },
    onClear: () => {
      const studies = getStudies();
      const existingStudy = normalizeSavedStudy(studies.cathodicProtection);
      if (!existingStudy) return;
      const complianceRecord = createComplianceRecord(existingStudy, existingStudy, null);
      studies.cathodicProtection = {
        ...existingStudy,
        reportExport: buildReportExportData(existingStudy, null),
        compliance: complianceRecord.compliance,
        complianceHistory: complianceRecord.complianceHistory
      };
      setStudies(studies);
      renderResults(studies.cathodicProtection, resultsDiv);
      renderComplianceStatusPanel(
        compliancePanelEl,
        studies.cathodicProtection.compliance.requiredChecks,
        studies.cathodicProtection.compliance.lastEvaluatedAt,
        studies.cathodicProtection.compliance
      );
    }
  });

  const form = document.getElementById('cp-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('cp-errors');
  const densityMethodEl = document.getElementById('density-method');
  const manualRow = document.getElementById('manual-density-row');
  const tableDensityEl = document.getElementById('table-density');
  const basisPanel = document.getElementById('calculation-basis-content');
  const assetTypeEl = document.getElementById('asset-type');
  const pipeMaterialEl = document.getElementById('pipe-material');
  const pipeMaterialRow = document.getElementById('pipe-material-row');
  const pipeMaterialHint = document.getElementById('pipe-material-hint');
  const surfaceAreaModeEl = document.getElementById('surface-area-mode');
  const surfaceAreaEl = document.getElementById('surface-area');
  const pipeOdRow = document.getElementById('pipe-od-row');
  const pipeLengthRow = document.getElementById('pipe-length-row');
  const calculatedSurfaceAreaRow = document.getElementById('calculated-surface-area-row');
  const calculatedSurfaceAreaEl = document.getElementById('calculated-surface-area');
  const pipeDimensionsIllustrationEl = document.getElementById('pipe-dimensions-illustration');
  const compliancePanelEl = document.getElementById('cp-compliance-status-content');
  const coatingModelTypeEl = document.getElementById('coating-model-type');
  const coatingFixedRow = document.getElementById('coating-fixed-row');
  const coatingCurveRows = document.querySelectorAll('[data-coating-curve-row]');
  const coatingSegmentRow = document.getElementById('coating-segment-row');

  const saved = normalizeSavedStudy(getStudies().cathodicProtection);
  const savedApproval = getStudyApprovals().cathodicProtection || null;
  let cpLayoutState = saved?.cpLayout || null;
  applySavedCpInputs(saved);
  renderCalculationBasis(basisPanel, CP_STANDARD_BASIS);
  renderComplianceStatusPanel(compliancePanelEl, saved?.compliance?.requiredChecks, saved?.compliance?.lastEvaluatedAt, saved?.compliance);
  if (saved) {
    if (!saved.reportExport) {
      const studies = getStudies();
      studies.cathodicProtection = {
        ...saved,
        reportExport: buildReportExportData(saved, savedApproval)
      };
      setStudies(studies);
    }
    renderResults(saved, resultsDiv);
  }

  cpLayoutCanvasController = initCpLayoutCanvas({
    panelId: 'cp-layout-canvas-panel',
    formId: 'cp-form',
    initialLayout: cpLayoutState,
    onLayoutChange: (nextLayout) => {
      cpLayoutState = nextLayout;
      const studies = getStudies();
      const existingStudy = normalizeSavedStudy(studies.cathodicProtection);
      if (!existingStudy) {
        return;
      }
      studies.cathodicProtection = {
        ...existingStudy,
        cpLayout: nextLayout
      };
      setStudies(studies);
    },
    onSegmentHover: (segmentIndex) => {
      cpProfilesController?.setExternalHoverSegment(segmentIndex);
    }
  });

  function refreshTableDensity() {
    const input = readFormInputs();
    if (!input) return;
    const tableDensity = lookupCurrentDensity(input.assetType, input.moistureCategory, input.soilResistivityOhmM, input.soilPh, input.pipeMaterial);
    tableDensityEl.value = roundTo(tableDensity, 3);
  }

  function refreshCoatingModelInputs() {
    const modelType = coatingModelTypeEl.value;
    coatingFixedRow.hidden = modelType !== COATING_MODEL_TYPES.fixed;
    coatingCurveRows.forEach((row) => {
      row.hidden = modelType !== COATING_MODEL_TYPES.degradationCurve;
    });
    coatingSegmentRow.hidden = modelType !== COATING_MODEL_TYPES.segmentCondition;
  }

  function toggleDensityMode() {
    const manual = densityMethodEl.value === 'manual';
    manualRow.hidden = !manual;
    tableDensityEl.closest('.field-row').hidden = manual;
  }

  function refreshPipeMaterialHint() {
    const pipeMaterial = pipeMaterialEl.value;
    pipeMaterialHint.textContent = PIPE_MATERIAL_FACTORS[pipeMaterial]?.hint
      ?? 'Preset-based current density factor is applied.';
  }

  function updatePipeVisibility() {
    const isPipe = assetTypeEl.value === 'pipe';
    pipeMaterialRow.hidden = !isPipe;
    pipeMaterialHint.hidden = !isPipe;
    surfaceAreaModeEl.closest('.field-row').hidden = !isPipe;
    if (!isPipe) {
      surfaceAreaModeEl.value = 'manual';
    }
  }

  function calculatePipeSurfaceAreaM2() {
    const isMetric = document.getElementById('unit-select')?.value === 'metric';
    const outsideDiameterInput = Number.parseFloat(document.getElementById('pipe-od').value);
    const lengthInput = Number.parseFloat(document.getElementById('pipe-length').value);
    if (!Number.isFinite(outsideDiameterInput) || !Number.isFinite(lengthInput) || outsideDiameterInput <= 0 || lengthInput <= 0) {
      return null;
    }

    const outsideDiameterM = isMetric ? outsideDiameterInput * MM_TO_M : outsideDiameterInput * IN_TO_M;
    const lengthM = isMetric ? lengthInput : lengthInput * FT_TO_M;
    return Math.PI * outsideDiameterM * lengthM;
  }

  function refreshSurfaceAreaMode() {
    const isPipe = assetTypeEl.value === 'pipe';
    const usePipeDimensions = isPipe && surfaceAreaModeEl.value === 'pipe-dimensions';
    pipeOdRow.hidden = !usePipeDimensions;
    pipeLengthRow.hidden = !usePipeDimensions;
    calculatedSurfaceAreaRow.hidden = !usePipeDimensions;
    pipeDimensionsIllustrationEl.hidden = !usePipeDimensions;
    surfaceAreaEl.closest('.field-row').hidden = usePipeDimensions;

    if (!usePipeDimensions) {
      calculatedSurfaceAreaEl.value = '';
      return;
    }

    const calculatedAreaM2 = calculatePipeSurfaceAreaM2();
    if (!Number.isFinite(calculatedAreaM2)) {
      calculatedSurfaceAreaEl.value = '';
      return;
    }

    const isMetric = document.getElementById('unit-select')?.value === 'metric';
    const displayArea = isMetric ? calculatedAreaM2 : (calculatedAreaM2 * SQM_TO_SQFT);
    calculatedSurfaceAreaEl.value = roundTo(displayArea, 3);
  }

  toggleDensityMode();
  refreshCoatingModelInputs();
  updatePipeVisibility();
  refreshPipeMaterialHint();
  refreshSurfaceAreaMode();
  refreshTableDensity();

  ['asset-type', 'soil-resistivity', 'soil-ph', 'moisture-category', 'density-method', 'pipe-material', 'surface-area-mode', 'pipe-od', 'pipe-length', 'unit-select', 'coating-model-type'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      refreshCoatingModelInputs();
      updatePipeVisibility();
      refreshPipeMaterialHint();
      refreshSurfaceAreaMode();
      toggleDensityMode();
      refreshTableDensity();
    });
    document.getElementById(id).addEventListener('change', () => {
      refreshCoatingModelInputs();
      updatePipeVisibility();
      refreshPipeMaterialHint();
      refreshSurfaceAreaMode();
      toggleDensityMode();
      refreshTableDensity();
    });
  });

  ['number-of-anodes', 'anode-spacing', 'anode-distance-to-structure', 'test-point-count', 'reference-electrode-location', 'unit-select'].forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener('input', () => cpLayoutCanvasController?.syncFromInputs());
    field.addEventListener('change', () => cpLayoutCanvasController?.syncFromInputs());
  });

  resultsDiv?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-cp-setup-target]');
    if (!trigger) return;
    focusMeasurementVisualization(trigger.dataset.cpSetupTarget);
  });

  compliancePanelEl?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-cp-setup-target]');
    if (!trigger) return;
    focusMeasurementVisualization(trigger.dataset.cpSetupTarget);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = readFormInputs();
    if (!input) return;

    try {
      const result = runCathodicProtectionAnalysis(input);
      errorsDiv.hidden = true;
      errorsDiv.textContent = '';
      const studies = getStudies();
      const previousStudy = normalizeSavedStudy(studies.cathodicProtection);
      const approval = getStudyApprovals().cathodicProtection || null;
      const complianceRecord = createComplianceRecord(result, previousStudy, approval);
      studies.cathodicProtection = {
        ...result,
        reportExport: buildReportExportData(result, approval),
        cpLayout: cpLayoutCanvasController?.getState() || cpLayoutState,
        compliance: complianceRecord.compliance,
        complianceHistory: complianceRecord.complianceHistory
      };
      setStudies(studies);
      renderResults(studies.cathodicProtection, resultsDiv);
      renderComplianceStatusPanel(
        compliancePanelEl,
        studies.cathodicProtection.compliance.requiredChecks,
        studies.cathodicProtection.compliance.lastEvaluatedAt,
        studies.cathodicProtection.compliance
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid cathodic protection inputs.';
      errorsDiv.hidden = false;
      errorsDiv.innerHTML = `<strong>Input validation error:</strong> ${escapeHtml(message)}`;
      showModal('Input Error', `<p>${escapeHtml(message)}</p>`, 'error');
    }
  });
  });
}

function readFormInputs() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));
  const isMetric = document.getElementById('unit-select')?.value === 'metric';
  const assetType = getValue('asset-type');
  const surfaceAreaMode = getValue('surface-area-mode');
  const calculatedAreaM2 = calculatePipeSurfaceAreaFromInputs(isMetric, getNumber('pipe-od'), getNumber('pipe-length'));
  const useCalculatedArea = assetType === 'pipe' && surfaceAreaMode === 'pipe-dimensions' && Number.isFinite(calculatedAreaM2);
  const surfaceAreaInput = useCalculatedArea
    ? (isMetric ? calculatedAreaM2 : calculatedAreaM2 * SQM_TO_SQFT)
    : getNumber('surface-area');
  const installedMassInput = getNumber('installed-mass');
  const anodeSpacingInput = getNumber('anode-spacing');
  const anodeDistanceInput = getNumber('anode-distance-to-structure');
  const anodeBurialDepthInput = getNumber('anode-burial-depth');
  const zoneResistivityRaw = getValue('zone-resistivity-values');
  const segmentConditionFactorsRaw = getValue('segment-condition-factors');
  const parsedZoneResistivityValues = parseZoneResistivityValues(zoneResistivityRaw);
  const parsedSegmentConditionFactors = parseConditionFactorValues(segmentConditionFactorsRaw);
  const mitigationActions = parseMitigationActions(getValue('mitigation-actions'));
  const zoneResistivityTokens = String(zoneResistivityRaw ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const zoneResistivityInputValid = zoneResistivityTokens.length === parsedZoneResistivityValues.length;

  return {
    assetType,
    pipeMaterial: getValue('pipe-material'),
    soilResistivityOhmM: getNumber('soil-resistivity'),
    soilPh: getNumber('soil-ph'),
    moistureCategory: getValue('moisture-category'),
    coatingModelType: getValue('coating-model-type'),
    coatingBreakdownFactor: getNumber('coating-breakdown'),
    coatingInitialBreakdownFactor: getNumber('coating-initial-breakdown'),
    coatingEndOfLifeBreakdownFactor: getNumber('coating-eol-breakdown'),
    coatingDegradationExponent: getNumber('coating-degradation-exponent'),
    segmentConditionFactors: parsedSegmentConditionFactors,
    segmentConditionFactorsText: segmentConditionFactorsRaw,
    surfaceAreaM2: isMetric ? surfaceAreaInput : surfaceAreaInput * SQFT_TO_SQM,
    currentDensityMethod: getValue('density-method'),
    surfaceAreaMode,
    pipeOdInput: getNumber('pipe-od'),
    pipeLengthInput: getNumber('pipe-length'),
    manualCurrentDensityMaM2: getNumber('manual-density'),
    anodeCapacityAhPerKg: getNumber('anode-capacity'),
    anodeUtilization: getNumber('anode-utilization'),
    designFactor: getNumber('design-factor'),
    availabilityFactor: getNumber('availability-factor'),
    targetLifeYears: getNumber('design-life-years'),
    installedMassKg: isMetric ? installedMassInput : installedMassInput * LB_TO_KG,
    anodeTypeSystem: getValue('anode-system-type'),
    numberOfAnodes: Math.round(getNumber('number-of-anodes')),
    anodeSpacingM: isMetric ? anodeSpacingInput : anodeSpacingInput * FT_TO_M,
    anodeDistanceToStructureM: isMetric ? anodeDistanceInput : anodeDistanceInput * FT_TO_M,
    anodeBurialDepthM: isMetric ? anodeBurialDepthInput : anodeBurialDepthInput * FT_TO_M,
    zoneResistivityOhmM: parsedZoneResistivityValues,
    zoneResistivityInputValid,
    testMethod: getValue('test-method'),
    measurementContext: getValue('measurement-context'),
    referenceElectrodeLocation: getValue('reference-electrode-location'),
    irDropCompensationMethod: getValue('ir-drop-compensation-method'),
    measuredIrDropMv: getNumber('measured-ir-drop'),
    couponDepolarizationMv: getNumber('coupon-depolarization'),
    measuredInstantOffPotentialMv: getNumber('measured-off-potential'),
    simulatedPolarizationShiftMv: getNumber('simulated-polarization-shift'),
    testPointCount: Math.round(getNumber('test-point-count')),
    passingTestPointCount: Math.round(getNumber('test-point-pass-count')),
    nearbyForeignStructures: getValue('nearby-foreign-structures'),
    dcTractionSystem: getValue('dc-traction-system'),
    knownInterferenceSources: getValue('known-interference-sources'),
    mitigationProfile: getValue('mitigation-profile'),
    mitigationActions,
    mitigationActionsText: getValue('mitigation-actions'),
    verificationTestDate: getValue('verification-test-date'),
    units: isMetric ? 'metric' : 'imperial'
  };
}

function renderResults(result, root) {
  const profileData = result.profileData || buildCpProfileData({
    input: result,
    adjustedRequiredCurrentA: result.requiredCurrentA,
    distributionModel: result.distributionModel,
    measuredInstantOffPotentialMv: result.measuredInstantOffPotentialMv,
    baseCoatingFactor: result.coatingBreakdownFactor
  });
  const lifeBadgeClass = result.safetyMarginYears >= 0 ? 'result-badge--pass' : 'result-badge--fail';
  const lifeBadgeIcon = result.safetyMarginYears >= 0 ? '✓' : '✗';
  const outputBasis = result.outputBasis || {};
  const sensitivityRows = Array.isArray(result.sensitivity) ? result.sensitivity : [];
  const advisories = buildDesignAdvisories(result, sensitivityRows);
  const criteriaEvidence = result.criteriaCheckEvidence || {};
  const criteriaSet = criteriaEvidence.selectedCriteriaSet;
  const criteriaRows = Array.isArray(criteriaEvidence.criteriaResults) ? criteriaEvidence.criteriaResults : [];
  const measurementCorrections = criteriaEvidence.measurementCorrections || {};
  const measurementWarnings = Array.isArray(result.measurementMetadataWarnings) ? result.measurementMetadataWarnings : [];
  const interference = result.interferenceAssessment || {};
  const riskFactorRows = Array.isArray(interference.riskFactorScores) ? interference.riskFactorScores : [];
  const riskBadgeClass = interference.riskLevel === 'high'
    ? 'result-badge--fail'
    : (interference.riskLevel === 'medium' ? 'result-badge--not-run' : 'result-badge--pass');
  const unresolvedHighRisk = interference.unresolvedHighRisk === true;
  const criteriaStatusLabel = criteriaEvidence.overallStatus === 'pass'
    ? 'Pass'
    : (criteriaEvidence.overallStatus === 'fail' ? 'Fail' : 'Not run');
  const criteriaStatusClass = criteriaEvidence.overallStatus === 'pass'
    ? 'result-badge--pass'
    : (criteriaEvidence.overallStatus === 'fail' ? 'result-badge--fail' : '');
  const reportExport = result.reportExport || buildReportExportData(result, getStudyApprovals().cathodicProtection || null);
  const verificationPlan = reportExport.verificationPlan || {};
  const commissioningChecklist = verificationPlan.completionChecklist || {};
  const complianceState = result.compliance?.complianceState || 'provisional';
  const complianceBadgeClass = complianceState === 'compliant'
    ? 'result-badge--pass'
    : (complianceState === 'provisional' ? 'result-badge--not-run' : 'result-badge--fail');
  const complianceBadgeText = complianceState === 'compliant'
    ? 'Compliance status: Compliant'
    : (complianceState === 'provisional'
      ? 'Compliance status: Provisional (commissioning evidence pending)'
      : 'Compliance status: Not compliant');

  root.innerHTML = `
    <section class="results-panel" aria-labelledby="cp-results-heading">
      <h2 id="cp-results-heading">Cathodic Protection Sizing Results</h2>
      <div class="result-badge ${complianceBadgeClass}">${complianceBadgeText}</div>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Required CP current</span>
          <span class="result-value">${result.requiredCurrentA} A</span>
        </div>
        <p class="field-hint result-formula">I<sub>area</sub> = A<sub>exposed</sub> × i<sub>d</sub> = ${result.exposedAreaM2} × ${(result.designCurrentDensityMaM2 / 1000).toFixed(4)} = ${result.areaBasedRequiredCurrentA} A</p>
        <p class="field-hint result-formula">I<sub>distribution</sub> = I<sub>area</sub> × attenuation factor (${result.distributionModel?.globalAttenuationFactor ?? 1}) = ${result.distributionAdjustedCurrentA} A</p>
        <p class="field-hint result-formula">I<sub>required</sub> = I<sub>distribution</sub> / availability (${result.availabilityFactor}) = ${result.requiredCurrentA} A</p>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.requiredCurrentA || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Minimum anode mass</span>
          <span class="result-value">${result.minimumAnodeMassKg} kg (${result.minimumAnodeMassLb} lb)</span>
        </div>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.minimumAnodeMassKg || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Predicted design life from installed mass</span>
          <span class="result-value">${result.predictedLifeYears} years</span>
        </div>
        <div class="result-badge ${lifeBadgeClass}">${lifeBadgeIcon} Safety margin: ${result.safetyMarginYears} years (${result.safetyMarginPercent}%) vs target ${result.targetLifeYears} years</div>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.predictedLifeYears || 'See Calculation Basis section for standards mapping.')}</p>
        <p class="field-hint result-basis">Safety margin basis: ${escapeHtml(outputBasis.safetyMargin || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="table-wrap">
        <table class="data-table" aria-label="Cathodic protection summary table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Asset type</td><td>${escapeHtml(result.assetType)}</td></tr>
            ${result.assetType === 'pipe' ? `<tr><td>Pipe material</td><td>${escapeHtml(result.pipeMaterial || 'carbon-steel')}</td></tr>` : ''}
            <tr><td>Soil resistivity</td><td>${result.soilResistivityOhmM} Ω·m</td></tr>
            <tr><td>Soil pH</td><td>${result.soilPh}</td></tr>
            <tr><td>Moisture / corrosivity category</td><td>${escapeHtml(result.moistureCategory)}</td></tr>
            <tr><td>Design current density i<sub>d</sub></td><td>${result.designCurrentDensityMaM2} mA/m²</td></tr>
            <tr><td>Coating demand model</td><td>${escapeHtml(result.coatingModel?.label || 'Fixed factor')}</td></tr>
            <tr><td>Effective coating factor</td><td>${result.coatingBreakdownFactor}</td></tr>
            <tr><td>Coating uncertainty band</td><td>${roundTo(result.coatingModel?.uncertaintyBand?.lowFactor ?? result.coatingBreakdownFactor, 4)} to ${roundTo(result.coatingModel?.uncertaintyBand?.highFactor ?? result.coatingBreakdownFactor, 4)}</td></tr>
            <tr><td>Exposed area</td><td>${result.exposedAreaM2} m²</td></tr>
            <tr><td>Anode capacity</td><td>${result.anodeCapacityAhPerKg} Ah/kg</td></tr>
            <tr><td>Anode system type</td><td>${escapeHtml(result.anodeTypeSystem)}</td></tr>
            <tr><td>Number of anodes</td><td>${result.numberOfAnodes}</td></tr>
            <tr><td>Anode spacing</td><td>${roundTo(result.anodeSpacingM, 3)} m</td></tr>
            <tr><td>Anode distance to structure</td><td>${roundTo(result.anodeDistanceToStructureM, 3)} m</td></tr>
            <tr><td>Anode burial depth</td><td>${roundTo(result.anodeBurialDepthM, 3)} m</td></tr>
            <tr><td>Distribution effectiveness (average)</td><td>${result.distributionModel?.averageEffectivenessFactor ?? 'n/a'}</td></tr>
            <tr><td>Distribution attenuation factor</td><td>${result.distributionModel?.globalAttenuationFactor ?? 'n/a'}</td></tr>
            <tr><td>Anode utilization factor U</td><td>${result.anodeUtilization}</td></tr>
            <tr><td>Design factor F<sub>design</sub></td><td>${result.designFactor}</td></tr>
            <tr><td>Availability factor</td><td>${result.availabilityFactor}</td></tr>
            <tr><td>Test method</td><td>${escapeHtml(result.testMethod || 'instant-off')}</td></tr>
            <tr><td>Measurement context</td><td>${escapeHtml(result.measurementContext || 'unknown')}</td></tr>
            <tr><td>Reference electrode location</td><td>${escapeHtml(result.referenceElectrodeLocation || 'unknown')}</td></tr>
            <tr><td>IR-drop compensation method</td><td>${escapeHtml(result.irDropCompensationMethod || 'unknown')}</td></tr>
            <tr><td>Measured IR-drop</td><td>${Number.isFinite(result.measuredIrDropMv) ? `${result.measuredIrDropMv} mV` : 'Not provided'}</td></tr>
            <tr><td>Coupon depolarization</td><td>${Number.isFinite(result.couponDepolarizationMv) ? `${result.couponDepolarizationMv} mV` : 'Not provided'}</td></tr>
            <tr><td>Measured structure potential</td><td>${result.measuredInstantOffPotentialMv} mV</td></tr>
            <tr><td>Measured/simulated polarization shift</td><td>${result.simulatedPolarizationShiftMv} mV</td></tr>
            <tr><td>Test points passing</td><td>${result.passingTestPointCount} / ${result.testPointCount}</td></tr>
            <tr><td>Interference mitigation actions</td><td>${escapeHtml(result.mitigationActionsText || 'Not provided')}</td></tr>
            <tr><td>Verification test date</td><td>${escapeHtml(result.verificationTestDate || 'Not scheduled')}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="result-group" aria-label="Protection criteria check evidence">
        <h3>Protection Criteria Check Evidence</h3>
        <p class="field-hint">Criteria selected: ${escapeHtml(criteriaSet?.label || 'Not configured')} (${escapeHtml(criteriaSet?.reference || 'No reference')})</p>
        <p class="field-hint">Measurement basis: method ${escapeHtml(measurementCorrections.metadata?.testMethod || result.testMethod || 'instant-off')}, context ${escapeHtml(measurementCorrections.metadata?.measurementContext || result.measurementContext || 'unknown')}, reference ${escapeHtml(measurementCorrections.metadata?.referenceElectrodeLocation || result.referenceElectrodeLocation || 'unknown')}.</p>
        <p class="field-hint">Correction summary: ${escapeHtml(measurementCorrections.correctionSummary || 'No correction summary provided.')}</p>
        <div class="result-badge ${criteriaStatusClass}">${criteriaStatusLabel}: criteria set evaluation</div>
        ${measurementWarnings.length ? `<p class="field-hint"><strong>Validation warnings:</strong> ${escapeHtml(measurementWarnings.join(' | '))}</p>` : '<p class="field-hint">Validation warnings: none.</p>'}
        <div class="table-wrap">
          <table class="data-table" aria-label="Protection criteria pass fail table">
            <thead><tr><th>Criterion</th><th>Requirement</th><th>Raw value</th><th>Corrected value</th><th>Acceptance decision</th></tr></thead>
            <tbody>
              ${criteriaRows.map((criterion) => `
                <tr>
                  <td>${escapeHtml(criterion.label)}</td>
                  <td>${escapeHtml(criterion.requirement)}</td>
                  <td>${escapeHtml(criterion.rawValue || criterion.observedValue || 'n/a')}</td>
                  <td>${escapeHtml(criterion.correctedValue || criterion.observedValue || 'n/a')}</td>
                  <td>
                    ${escapeHtml(criterion.decision || (criterion.status === 'pass' ? 'Pass' : 'Fail'))}
                    ${criterion.status === 'fail'
    ? `<button type="button" class="btn" data-cp-setup-target="${escapeHtml(criterion.key)}">Show measurement visual</button>`
    : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="result-group" aria-label="Interference assessment results">
        <h3>Interference Assessment</h3>
        <div class="result-badge ${riskBadgeClass}">
          ${escapeHtml(String(interference.riskLevel || 'low').toUpperCase())} risk (score: ${Number.isFinite(interference.score) ? interference.score : 0})
        </div>
        <p class="field-hint">Mitigation profile: ${escapeHtml(interference.profile?.label || 'Baseline mitigation profile')}</p>
        <p class="field-hint">Verification test date: ${escapeHtml(interference.verificationTestDate || 'Not scheduled')}</p>
        ${unresolvedHighRisk ? '<p class="field-hint"><strong>High-risk case remains unresolved and blocks compliant status until missing mitigations and verification are completed.</strong></p>' : ''}
        <div class="table-wrap">
          <table class="data-table" aria-label="Interference risk factors">
            <thead><tr><th>Factor</th><th>Input</th><th>Score</th></tr></thead>
            <tbody>
              ${riskFactorRows.map((factor) => `
                <tr>
                  <td>${escapeHtml(factor.label)}</td>
                  <td>${escapeHtml(factor.value)}</td>
                  <td>${escapeHtml(String(factor.score))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="field-hint">Required mitigations: ${escapeHtml((interference.requiredMitigations || []).join(', ') || 'None')}</p>
        <p class="field-hint">Implemented mitigations: ${escapeHtml((interference.mitigationActions || []).join(', ') || 'None')}</p>
        ${(interference.missingMitigations || []).length
          ? `<p class="field-hint">Missing mitigations: ${escapeHtml(interference.missingMitigations.join(', '))}</p>`
          : '<p class="field-hint">No missing mitigations for selected profile.</p>'}
      </div>

      <div class="result-group" aria-label="Verification and commissioning plan">
        <h3>Verification and Commissioning Plan</h3>
        <p class="field-hint">Required commissioning tests: ${escapeHtml((verificationPlan.requiredCommissioningTests || []).join(' | ') || 'Not defined')}</p>
        <p class="field-hint">Monitoring intervals: ${escapeHtml((verificationPlan.monitoringIntervals || []).join(' | ') || 'Not defined')}</p>
        <p class="field-hint">Trigger thresholds for corrective action: ${escapeHtml((verificationPlan.correctiveActionThresholds || []).join(' | ') || 'Not defined')}</p>
        <div class="table-wrap">
          <table class="data-table" aria-label="Commissioning checklist completion status">
            <thead><tr><th>Checklist item</th><th>Completed by</th><th>Completed on</th><th>Evidence</th></tr></thead>
            <tbody>
              ${COMMISSIONING_CHECKLIST_ITEMS.map((item) => {
    const completion = commissioningChecklist[item.key] || {};
    return `
                <tr>
                  <td>${escapeHtml(item.label)}</td>
                  <td>${escapeHtml(completion.completedBy || 'Pending')}</td>
                  <td>${escapeHtml(completion.completedAt || 'Pending')}</td>
                  <td>${escapeHtml(completion.evidence || 'Pending')}</td>
                </tr>`;
  }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${sensitivityRows.length ? `
      <div class="table-wrap">
        <table class="data-table" aria-label="Cathodic protection sensitivity table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Design review</th>
              <th>Coating factor</th>
              <th>Required current (A)</th>
              <th>Worst-case segment demand (A)</th>
              <th>Minimum anode mass</th>
              <th>Predicted life (years)</th>
              <th>Safety margin</th>
            </tr>
          </thead>
          <tbody>
            ${sensitivityRows.map((scenario) => `
              <tr>
                <td>${escapeHtml(scenario.label)}</td>
                <td>${escapeHtml(scenario.approvalStatus || 'Review required')}</td>
                <td>${scenario.coatingFactor}</td>
                <td>${scenario.requiredCurrentA}</td>
                <td>${scenario.worstCaseSegmentDemandA} (${escapeHtml(scenario.worstCaseSegmentLabel || 'Segment 1')})</td>
                <td>${scenario.minimumAnodeMassKg} kg (${scenario.minimumAnodeMassLb} lb)</td>
                <td>${scenario.predictedLifeYears}</td>
                <td>${scenario.safetyMarginYears} years (${scenario.safetyMarginPercent}%)</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${Array.isArray(result.distributionModel?.segments) && result.distributionModel.segments.length ? `
      <div class="table-wrap">
        <table class="data-table" aria-label="Current distribution by segment">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Zone resistivity (Ω·m)</th>
              <th>Effectiveness factor</th>
              <th>Attenuation factor</th>
            </tr>
          </thead>
          <tbody>
            ${result.distributionModel.segments.map((segment) => `
              <tr>
                <td>${segment.segment}</td>
                <td>${segment.zoneResistivityOhmM}</td>
                <td>${segment.effectivenessFactor}</td>
                <td>${segment.attenuationFactor}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="result-group" aria-label="CP profile chart overlays">
        <p class="field-hint">Profile overlays include base, conservative, and optimized scenarios with threshold-band pass/fail markers.</p>
        <div id="cp-profile-chart-root"></div>
      </div>

      ${advisories.length ? `
      <div class="result-group" aria-label="Design improvement advisories">
        <h3>Design Improvement Opportunities</h3>
        <ul>
          ${advisories.map((advisory) => `<li>${escapeHtml(advisory)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <p class="field-hint result-timestamp">Analysis run: ${new Date(result.timestamp).toLocaleString()}</p>
      <p class="field-hint">Report export package includes JSON and PDF payload sections for design basis and verification plan.</p>
    </section>`;

  const profileRoot = root.querySelector('#cp-profile-chart-root');
  if (profileRoot) {
    cpProfilesController = initCpProfiles({
      root: profileRoot,
      profileData,
      onSegmentHover: (segmentIndex) => {
        cpLayoutCanvasController?.setExternalHoverSegment(segmentIndex);
      }
    });
  }
}

function buildDesignAdvisories(result, sensitivityRows) {
  const notes = [];
  const conservativeScenario = sensitivityRows.find((scenario) => scenario.key === 'high-coating');

  if (result.safetyMarginYears < 0) {
    notes.push('Installed anode mass is below target-life demand; increase installed mass or reduce coating breakdown assumptions.');
  } else if (result.safetyMarginPercent < 15) {
    notes.push('Life margin is modest; consider adding design contingency to improve resilience against coating degradation uncertainty.');
  }

  if (conservativeScenario && conservativeScenario.safetyMarginYears < 0) {
    notes.push('The high coating uncertainty band fails target life; add contingency mass or plan earlier replacement intervals.');
  }

  if (result.soilResistivityOhmM < 50 || result.soilPh < 5.5 || result.soilPh > 9) {
    notes.push('Corrosive environment indicators detected (low resistivity or extreme pH); validate with field surveys and commissioning criteria.');
  }

  if (result.requiredCurrentA > 5) {
    notes.push('Required CP current is relatively high; evaluate segmenting protected zones to improve control and maintainability.');
  }

  if (result.coatingBreakdownFactor > 0.35) {
    notes.push('Effective coating demand is high; prioritize coating condition assessment/rehabilitation to reduce long-term CP demand.');
  }

  notes.push('For the next iteration, include temperature correction and stray-current interference checks in the final detailed design package.');
  return notes;
}

function calculatePipeSurfaceAreaFromInputs(isMetric, outsideDiameterInput, lengthInput) {
  if (!Number.isFinite(outsideDiameterInput) || !Number.isFinite(lengthInput) || outsideDiameterInput <= 0 || lengthInput <= 0) {
    return null;
  }
  const outsideDiameterM = isMetric ? outsideDiameterInput * MM_TO_M : outsideDiameterInput * IN_TO_M;
  const lengthM = isMetric ? lengthInput : lengthInput * FT_TO_M;
  return Math.PI * outsideDiameterM * lengthM;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderCalculationBasis(root, basis) {
  if (!root || !basis) return;

  const sections = [
    basis.standardsProfile,
    basis.currentDensitySelection,
    basis.polarizationCriteria,
    basis.anodeCapacityUtilization,
    basis.engineeringJudgmentAssumptions,
    basis.interferenceAssessment
  ].filter(Boolean);

  root.innerHTML = `
    <ul class="basis-list">
      ${sections.map((section) => `
        <li id="${escapeHtml(section.id)}">
          <strong>${escapeHtml(section.label)}:</strong>
          <span>${escapeHtml(section.summary)}</span>
          <div class="field-hint">Standards: ${escapeHtml(section.standards.join(', '))}</div>
          ${Array.isArray(section.requiredChecks) && section.requiredChecks.length
            ? `<div class="field-hint">Required checks: ${escapeHtml(section.requiredChecks.join(', '))}</div>`
            : ''}
          ${Array.isArray(section.deliverables) && section.deliverables.length
            ? `<div class="field-hint">Required deliverables: ${escapeHtml(section.deliverables.join(', '))}</div>`
            : ''}
          ${Array.isArray(section.assumptions) && section.assumptions.length
            ? `<ul>${section.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul>`
            : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

function renderComplianceStatusPanel(root, requiredChecks = {}, lastEvaluatedAt = null, compliance = {}) {
  if (!root) return;

  const rows = getRequiredComplianceChecks().map((checkKey) => {
    const check = CP_STANDARDS_PROFILE.checks[checkKey];
    const status = requiredChecks[checkKey] || 'not-run';
    return {
      key: checkKey,
      label: check?.label || checkKey,
      status
    };
  });

  const statusLabels = {
    pass: 'Pass',
    fail: 'Fail',
    'not-run': 'Not run'
  };
  const overallCompliant = rows.every((row) => row.status === 'pass');
  const complianceState = compliance?.complianceState || (overallCompliant ? 'compliant' : 'not-compliant');
  const overallBadgeClass = complianceState === 'compliant'
    ? 'result-badge--pass'
    : (complianceState === 'provisional' ? 'result-badge--not-run' : 'result-badge--fail');
  const overallBadgeText = complianceState === 'compliant'
    ? 'Compliant'
    : (complianceState === 'provisional'
      ? 'Provisional — awaiting commissioning evidence'
      : 'Not compliant');

  root.innerHTML = `
    <div class="result-badge ${overallBadgeClass}">${overallBadgeText}</div>
    <div class="table-wrap">
      <table class="data-table" aria-label="Cathodic protection required compliance checks">
        <thead><tr><th>Required check</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)} <span class="field-hint">(${escapeHtml(row.key)})</span></td>
              <td>
                <span class="result-badge result-badge--${escapeHtml(row.status)}">${escapeHtml(statusLabels[row.status] || 'Not run')}</span>
                ${row.status === 'fail'
    ? `<button type="button" class="btn" data-cp-setup-target="${escapeHtml(row.key)}">Jump to measurement view</button>`
    : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="field-hint">Last evaluated: ${lastEvaluatedAt ? escapeHtml(new Date(lastEvaluatedAt).toLocaleString()) : 'Not run yet'}</p>
  `;
}

function normalizeChecklistEntry(entry) {
  const completedBy = String(entry?.completedBy || '').trim();
  const completedAt = String(entry?.completedAt || '').trim();
  const evidence = String(entry?.evidence || '').trim();
  return { completedBy, completedAt, evidence };
}

function getCommissioningChecklist(approval = null) {
  const approvalChecklist = approval?.checklist && typeof approval.checklist === 'object' ? approval.checklist : {};
  return COMMISSIONING_CHECKLIST_ITEMS.reduce((acc, item) => {
    acc[item.key] = normalizeChecklistEntry(approvalChecklist[item.key]);
    return acc;
  }, {});
}

function isCommissioningChecklistComplete(approval = null) {
  const checklist = getCommissioningChecklist(approval);
  return COMMISSIONING_CHECKLIST_ITEMS.every((item) => {
    const completion = checklist[item.key];
    return Boolean(completion.completedBy && completion.completedAt && completion.evidence);
  });
}

function buildVerificationPlan(result, approval = null) {
  const criteriaRows = Array.isArray(result.criteriaCheckEvidence?.criteriaResults)
    ? result.criteriaCheckEvidence.criteriaResults
    : [];
  const interference = result.interferenceAssessment || {};
  return {
    requiredCommissioningTests: criteriaRows.map((criterion) => `${criterion.label}: ${criterion.requirement}`),
    monitoringIntervals: [
      `Verification test date: ${interference.verificationTestDate || result.verificationTestDate || 'Not scheduled'}`,
      `Mitigation profile: ${interference.profile?.label || 'Baseline mitigation profile'}`
    ],
    correctiveActionThresholds: [
      'Any failed protection criterion requires corrective action and re-test before final compliance.',
      'Unresolved high interference risk requires mitigation completion before compliance closure.',
      'Negative life safety margin requires design update or contingency mass increase.'
    ],
    completionChecklist: getCommissioningChecklist(approval),
    completionStatus: isCommissioningChecklistComplete(approval) ? 'complete' : 'incomplete'
  };
}

function buildReportExportData(result, approval = null) {
  const verificationPlan = buildVerificationPlan(result, approval);
  const profileData = result.profileData || buildCpProfileData({
    input: result,
    adjustedRequiredCurrentA: result.requiredCurrentA,
    distributionModel: result.distributionModel,
    measuredInstantOffPotentialMv: result.measuredInstantOffPotentialMv,
    baseCoatingFactor: result.coatingBreakdownFactor
  });
  return {
    version: 'cp-report-export-v1',
    generatedAt: new Date().toISOString(),
    format: ['json', 'pdf'],
    designBasis: {
      standardsProfile: CP_STANDARD_BASIS.standardsProfile,
      calculationBasis: result.standardsBasis || CP_STANDARD_BASIS,
      outputBasis: result.outputBasis || {}
    },
    verificationPlan,
    payloads: {
      json: {
        sectionOrder: ['designBasis', 'verificationPlan', 'resultsSummary'],
        data: {
          designBasis: result.standardsBasis || CP_STANDARD_BASIS,
          verificationPlan,
          chartData: profileData,
          resultsSummary: {
            requiredCurrentA: result.requiredCurrentA,
            minimumAnodeMassKg: result.minimumAnodeMassKg,
            predictedLifeYears: result.predictedLifeYears,
            safetyMarginYears: result.safetyMarginYears
          }
        }
      },
      pdf: {
        title: 'Cathodic Protection Design Basis + Verification Plan',
        sections: [
          { heading: 'Design Basis', contentKey: 'designBasis' },
          { heading: 'Verification Plan', contentKey: 'verificationPlan' },
          { heading: 'Sizing Results Summary', contentKey: 'resultsSummary' }
        ]
      }
    }
  };
}
