import { bootstrapPage } from './src/lifecycle/pageBootstrap.js';
import {
  getCathodicProtectionDraft,
  getStudies,
  getStudyApprovals,
  setCathodicProtectionDraft,
  setStudies
} from './dataStore.mjs';
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
// Worker-routed entry points for the user-initiated calculate action.
// Hot paths (normalizeSavedStudy recomputes triggered by mouse/keyboard handlers
// and comparison toggles) still use the sync imports above so per-event latency
// is not gated on postMessage.
import {
  computeDistributionBySegment as computeDistributionBySegmentOffMain,
  resolveCoatingModel as resolveCoatingModelOffMain,
  evaluateCriteriaChecks as evaluateCriteriaChecksOffMain,
  evaluateInterferenceAssessment as evaluateInterferenceAssessmentOffMain,
} from './src/workers/cathodicProtectionClient.js';
import { initCpLayoutCanvas } from './src/cpLayoutCanvas.js';
import { initCpProfiles } from './src/cpProfiles.js';

const SQFT_TO_SQM = 0.09290304;
const LB_TO_KG = 0.45359237;
const IN_TO_M = 0.0254;
const MM_TO_M = 0.001;
const FT_TO_M = 0.3048;
const SQM_TO_SQFT = 10.76391041671;
const COMMISSIONING_CHECKLIST_ITEMS = [];
const MAX_NUMBER_OF_ANODES = 10000;
const CP_DRAFT_SCHEMA_VERSION = 2;
const CP_PROFILE_POTENTIAL_THRESHOLD_MV = -850;
const CP_PROFILE_CURRENT_DEMAND_LIMIT_A = 1;
const CP_PROFILE_DISTRIBUTION_MIN = 0.75;
const CP_CALCULATION_INPUT_KEYS = Object.freeze([
  'assetType',
  'pipeMaterial',
  'soilResistivityOhmM',
  'soilPh',
  'moistureCategory',
  'coatingModelType',
  'coatingBreakdownFactor',
  'coatingInitialBreakdownFactor',
  'coatingEndOfLifeBreakdownFactor',
  'coatingDegradationExponent',
  'segmentConditionFactors',
  'surfaceAreaM2',
  'currentDensityMethod',
  'surfaceAreaMode',
  'manualCurrentDensityMaM2',
  'modeledReferencePotentialMv',
  'anodeCapacityAhPerKg',
  'anodeUtilization',
  'designFactor',
  'availabilityFactor',
  'targetLifeYears',
  'installedMassKg',
  'anodeTypeSystem',
  'iccpRatedCurrentA',
  'iccpRatedVoltageV',
  'iccpGroundbedResistanceOhm',
  'iccpVoltageAllowanceV',
  'iccpReserveFactor',
  'numberOfAnodes',
  'anodeSpacingM',
  'anodeDistanceToStructureM',
  'anodeBurialDepthM',
  'zoneResistivityOhmM',
  'criteriaEvidenceEnabled',
  'testMethod',
  'measurementContext',
  'referenceElectrodeLocation',
  'irDropCompensationMethod',
  'measuredIrDropMv',
  'couponDepolarizationMv',
  'measuredInstantOffPotentialMv',
  'simulatedPolarizationShiftMv',
  'testPointCount',
  'passingTestPointCount',
  'nearbyForeignStructures',
  'dcTractionSystem',
  'knownInterferenceSources',
  'interferenceGeometry',
  'interferenceSourceType',
  'foreignStructureSeparationM',
  'parallelExposureLengthM',
  'crossingAngleDeg',
  'measuredPotentialGradientMvPerM',
  'bondingStrategy',
  'mitigationProfile',
  'mitigationActions',
  'verificationTestDate'
]);
const CP_CONVERTIBLE_FIELDS = Object.freeze([
  { id: 'surface-area', imperialToMetric: SQFT_TO_SQM },
  { id: 'pipe-od', imperialToMetric: IN_TO_M / MM_TO_M },
  { id: 'pipe-length', imperialToMetric: FT_TO_M },
  { id: 'anode-spacing', imperialToMetric: FT_TO_M },
  { id: 'anode-distance-to-structure', imperialToMetric: FT_TO_M },
  { id: 'anode-burial-depth', imperialToMetric: FT_TO_M },
  { id: 'installed-mass', imperialToMetric: LB_TO_KG },
  { id: 'foreign-structure-separation', imperialToMetric: FT_TO_M },
  { id: 'parallel-exposure-length', imperialToMetric: FT_TO_M }
]);
const VALIDATION_FIELD_IDS = Object.freeze({
  soilResistivityOhmM: 'soil-resistivity',
  soilPh: 'soil-ph',
  surfaceAreaM2: 'surface-area',
  coatingBreakdownFactor: 'coating-breakdown',
  coatingInitialBreakdownFactor: 'coating-initial-breakdown',
  coatingEndOfLifeBreakdownFactor: 'coating-eol-breakdown',
  coatingDegradationExponent: 'coating-degradation-exponent',
  segmentConditionFactors: 'segment-condition-factors',
  manualCurrentDensityMaM2: 'manual-density',
  modeledReferencePotentialMv: 'modeled-reference-potential',
  anodeCapacityAhPerKg: 'anode-capacity',
  anodeUtilization: 'anode-utilization',
  designFactor: 'design-factor',
  availabilityFactor: 'availability-factor',
  targetLifeYears: 'design-life-years',
  installedMassKg: 'installed-mass',
  iccpRatedCurrentA: 'iccp-rated-current',
  iccpRatedVoltageV: 'iccp-rated-voltage',
  iccpGroundbedResistanceOhm: 'iccp-groundbed-resistance',
  iccpVoltageAllowanceV: 'iccp-voltage-allowance',
  iccpReserveFactor: 'iccp-reserve-factor',
  numberOfAnodes: 'number-of-anodes',
  anodeSpacingM: 'anode-spacing',
  anodeDistanceToStructureM: 'anode-distance-to-structure',
  anodeBurialDepthM: 'anode-burial-depth',
  zoneResistivityOhmM: 'zone-resistivity-values',
  measuredInstantOffPotentialMv: 'measured-off-potential',
  simulatedPolarizationShiftMv: 'simulated-polarization-shift',
  testPointCount: 'test-point-count',
  passingTestPointCount: 'test-point-pass-count',
  foreignStructureSeparationM: 'foreign-structure-separation',
  parallelExposureLengthM: 'parallel-exposure-length',
  measuredPotentialGradientMvPerM: 'measured-potential-gradient',
  crossingAngleDeg: 'crossing-angle',
  measuredIrDropMv: 'measured-ir-drop',
  couponDepolarizationMv: 'coupon-depolarization'
});

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
let cpComparisonState = {
  baselineStudy: null,
  hoveredSegmentIndex: null,
  zoomScale: 1
};
const TIMELINE_STEP_SEQUENCE = ['inputs', 'geometry', 'interference', 'distribution', 'outcomes'];
const DEFAULT_TIMELINE_STATE = Object.freeze({
  collapsed: false,
  activeStep: 'inputs'
});
const TIMELINE_STEP_DEFINITIONS = [
  {
    key: 'inputs',
    title: 'Inputs',
    navTargetId: 'cp-form',
    navLabel: 'Jump to CP inputs form',
    whyThisMatters: 'The asset condition, environment, and coating assumptions establish the current-demand basis.'
  },
  {
    key: 'geometry',
    title: 'Geometry',
    navTargetId: 'cp-layout-canvas-panel',
    navLabel: 'Jump to CP layout canvas',
    whyThisMatters: 'Anode count, spacing, burial depth, and structure offset determine how the design distributes current.'
  },
  {
    key: 'interference',
    title: 'Interference',
    navTargetId: 'cp-interference-results',
    navFallbackId: 'results',
    navLabel: 'Jump to interference assessment',
    whyThisMatters: 'Nearby structures, DC sources, separation, and parallel exposure can change the required mitigation strategy.'
  },
  {
    key: 'distribution',
    title: 'Distribution',
    navTargetId: 'cp-profile-results',
    navFallbackId: 'results',
    navLabel: 'Jump to distribution profile chart',
    whyThisMatters: 'Segment effectiveness and attenuation show whether the design delivers current consistently along the protected asset.'
  },
  {
    key: 'outcomes',
    title: 'Outcomes',
    navTargetId: 'cp-result-kpis',
    navFallbackId: 'results',
    navLabel: 'Jump to sizing outcomes',
    whyThisMatters: 'Required current, minimum anode mass, predicted life, and safety margin are the primary design decisions produced by the study.'
  }
];
const DESIGN_HISTORY_FIELDS = [
  { key: 'assetType', label: 'Asset type' },
  { key: 'soilResistivityOhmM', label: 'Soil resistivity', unit: 'Ω·m' },
  { key: 'coatingBreakdownFactor', label: 'Coating factor' },
  { key: 'numberOfAnodes', label: 'Anode count' },
  { key: 'anodeSpacingM', label: 'Anode spacing', unit: 'm' },
  { key: 'anodeDistanceToStructureM', label: 'Structure offset', unit: 'm' },
  { key: 'installedMassKg', label: 'Installed mass', unit: 'kg' },
  { key: 'iccpRatedCurrentA', label: 'Rectifier current rating', unit: 'A' },
  { key: 'iccpRatedVoltageV', label: 'Rectifier voltage rating', unit: 'V' },
  { key: 'iccpGroundbedResistanceOhm', label: 'Groundbed resistance', unit: 'Ω' },
  { key: 'iccpReserveFactor', label: 'ICCP reserve factor' },
  { key: 'targetLifeYears', label: 'Target life', unit: 'years' },
  { key: 'interferenceGeometry', label: 'Interference geometry' },
  { key: 'interferenceSourceType', label: 'Interference source' },
  { key: 'foreignStructureSeparationM', label: 'Structure separation', unit: 'm' },
  { key: 'parallelExposureLengthM', label: 'Parallel exposure', unit: 'm' },
  { key: 'measuredPotentialGradientMvPerM', label: 'Potential gradient', unit: 'mV/m' },
  { key: 'bondingStrategy', label: 'Bonding strategy' }
];

function buildLayoutAssessmentPayload(study) {
  if (!study || typeof study !== 'object') {
    return null;
  }
  return {
    profileData: study.profileData || null,
    distributionModel: study.distributionModel || null,
    interferenceAssessment: study.interferenceAssessment || null,
    safetyMarginYears: study.safetyMarginYears,
    safetyMarginPercent: study.safetyMarginPercent,
    measuredInstantOffPotentialMv: study.modeledReferencePotentialMv,
    targetLifeYears: study.targetLifeYears
  };
}

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
  const validationErrors = validateInputs(analysisInput);
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

async function runCathodicProtectionAnalysisOffMain(input) {
  const analysisInput = withAnalysisInputDefaults(input);
  const validationErrors = validateInputs(analysisInput);
  if (validationErrors.length) {
    throw new Error(validationErrors.join(' '));
  }

  const designCurrentDensityMaM2 = analysisInput.currentDensityMethod === 'manual'
    ? analysisInput.manualCurrentDensityMaM2
    : lookupCurrentDensity(analysisInput.assetType, analysisInput.moistureCategory, analysisInput.soilResistivityOhmM, analysisInput.soilPh, analysisInput.pipeMaterial);

  const distributionModel = await computeDistributionBySegmentOffMain(buildDistributionInput(analysisInput));
  const coatingModel = await resolveCoatingModelOffMain(analysisInput, { segmentCount: distributionModel.segments.length });
  const [criteriaCheckEvidence, interferenceAssessment] = await Promise.all([
    evaluateCriteriaChecksOffMain(analysisInput, CP_STANDARDS_PROFILE),
    evaluateInterferenceAssessmentOffMain(analysisInput),
  ]);

  return composeCpAnalysisResult({
    input: analysisInput,
    designCurrentDensityMaM2,
    distributionModel,
    coatingModel,
    criteriaCheckEvidence,
    interferenceAssessment
  });
}

function buildCpProfileData({ input, adjustedRequiredCurrentA, distributionModel, modeledReferencePotentialMv, baseCoatingFactor }) {
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

function buildSensitivitySummary({ input, adjustedRequiredCurrentA, minimumAnodeMassKg, predictedLifeYears, coatingModel, distributionModel }) {
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
      : (scenarioSafetyMarginYears >= 0 ? 'Approved' : 'Review required');
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

function withAnalysisInputDefaults(input) {
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

function validateInputs(input) {
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

  const normalizedInput = normalizeAnalysisInput(saved);
  if (!normalizedInput) {
    return null;
  }

  const recomputed = runCathodicProtectionAnalysis(normalizedInput);
  const compliance = saved.compliance && typeof saved.compliance === 'object'
    ? {
      ...saved.compliance,
      requiredChecks: saved.compliance.requiredChecks && typeof saved.compliance.requiredChecks === 'object'
        ? saved.compliance.requiredChecks
        : buildInitialComplianceStatus(),
      failedCheckKeys: Array.isArray(saved.compliance.failedCheckKeys) ? saved.compliance.failedCheckKeys : []
    }
    : {
      profileId: CP_STANDARDS_PROFILE.profileId,
      requiredChecks: buildInitialComplianceStatus(),
      optionalChecks: {},
      lastEvaluatedAt: null,
      failedCheckKeys: []
    };

  const existingHistory = Array.isArray(saved.complianceHistory)
    ? saved.complianceHistory
    : [];

  return {
    ...saved,
    ...recomputed,
    timestamp: saved.timestamp || recomputed.timestamp,
    timelineState: normalizeTimelineState(saved.timelineState),
    compliance,
    complianceHistory: existingHistory
  };
}

function normalizeAnalysisInput(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const normalized = withAnalysisInputDefaults({
    ...candidate,
    criteriaEvidenceEnabled: candidate.criteriaEvidenceEnabled === true,
    modeledReferencePotentialMv: Number.isFinite(candidate.modeledReferencePotentialMv)
      ? candidate.modeledReferencePotentialMv
      : (Number.isFinite(candidate.measuredInstantOffPotentialMv) ? candidate.measuredInstantOffPotentialMv : -900),
    zoneResistivityOhmM: parseZoneResistivityValues(candidate.zoneResistivityOhmM)
  });
  const validationErrors = validateInputs(normalized);
  return validationErrors.length ? null : normalized;
}

function normalizeTimelineState(state) {
  const nextState = state && typeof state === 'object' ? state : {};
  const activeStep = TIMELINE_STEP_SEQUENCE.includes(nextState.activeStep) ? nextState.activeStep : DEFAULT_TIMELINE_STATE.activeStep;
  return {
    collapsed: Boolean(nextState.collapsed),
    activeStep
  };
}

function normalizeUnitSystem(value) {
  return value === 'metric' ? 'metric' : 'imperial';
}

function updateCpUnitLabels(unitSystem) {
  const isMetric = normalizeUnitSystem(unitSystem) === 'metric';
  document.querySelectorAll('.unit-label-ft').forEach((label) => {
    label.hidden = isMetric;
  });
  document.querySelectorAll('.unit-label-m').forEach((label) => {
    label.hidden = !isMetric;
  });
}

function convertCpDisplayUnits(fromUnitSystem, toUnitSystem) {
  const from = normalizeUnitSystem(fromUnitSystem);
  const to = normalizeUnitSystem(toUnitSystem);
  if (from === to) {
    updateCpUnitLabels(to);
    return;
  }

  CP_CONVERTIBLE_FIELDS.forEach(({ id, imperialToMetric }) => {
    const field = document.getElementById(id);
    if (!field) {
      return;
    }
    const value = Number.parseFloat(field.value);
    if (!Number.isFinite(value)) {
      return;
    }
    const converted = to === 'metric'
      ? value * imperialToMetric
      : value / imperialToMetric;
    field.value = String(roundTo(converted, 6));
  });
  updateCpUnitLabels(to);
}

function captureCpFormValues(form) {
  if (!form) {
    return {};
  }
  return [...form.elements].reduce((values, field) => {
    if (!field.id || field.id === 'design-change-note' || field.type === 'file' || field.type === 'submit' || field.type === 'button') {
      return values;
    }
    if (field.type === 'checkbox' || field.type === 'radio') {
      values[field.id] = Boolean(field.checked);
    } else {
      values[field.id] = field.value;
    }
    return values;
  }, {});
}

function applyCpFormValues(form, draft, displayUnitSystem) {
  if (!form || !draft || typeof draft !== 'object' || !draft.values || typeof draft.values !== 'object') {
    return false;
  }
  Object.entries(draft.values).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (!field || field.form !== form || field.type === 'file') {
      return;
    }
    if (field.type === 'checkbox' || field.type === 'radio') {
      field.checked = Boolean(value);
    } else {
      field.value = String(value ?? '');
    }
  });
  const draftUnits = normalizeUnitSystem(draft.unitSystem);
  const displayUnits = normalizeUnitSystem(displayUnitSystem);
  if (draftUnits !== displayUnits) {
    convertCpDisplayUnits(draftUnits, displayUnits);
  } else {
    updateCpUnitLabels(displayUnits);
  }
  return true;
}

function normalizeFingerprintValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeFingerprintValue);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return roundTo(value, 6);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        normalized[key] = normalizeFingerprintValue(value[key]);
        return normalized;
      }, {});
  }
  return value ?? null;
}

function buildCalculationInputFingerprint(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const normalized = CP_CALCULATION_INPUT_KEYS.reduce((values, key) => {
    values[key] = normalizeFingerprintValue(input[key]);
    return values;
  }, {});
  return JSON.stringify(normalized);
}

function summarizeModeledProfile(profileData = {}) {
  const baseScenario = profileData?.scenarios?.base || {};
  const currentDemandLimitA = Number(profileData?.thresholdBands?.currentDemandA?.passWhenLessThanOrEqual)
    || CP_PROFILE_CURRENT_DEMAND_LIMIT_A;
  const checks = [
    {
      key: 'potential',
      label: 'potential',
      rows: Array.isArray(baseScenario.potential) ? baseScenario.potential : [],
      passes: (row) => Number(row?.passMetricValue ?? row?.value) <= CP_PROFILE_POTENTIAL_THRESHOLD_MV
    },
    {
      key: 'currentDemand',
      label: 'current demand',
      rows: Array.isArray(baseScenario.currentDemand) ? baseScenario.currentDemand : [],
      passes: (row) => Number(row?.passMetricValue ?? row?.value) <= currentDemandLimitA
    },
    {
      key: 'attenuation',
      label: 'distribution',
      rows: Array.isArray(profileData?.attenuation) ? profileData.attenuation : [],
      passes: (row) => Number(row?.passMetricValue ?? row?.value) >= CP_PROFILE_DISTRIBUTION_MIN
    }
  ].map((metric) => {
    const failed = metric.rows.filter((row) => !metric.passes(row)).length;
    return {
      key: metric.key,
      label: metric.label,
      total: metric.rows.length,
      failed
    };
  });
  return {
    checks,
    total: checks.reduce((sum, metric) => sum + metric.total, 0),
    failed: checks.reduce((sum, metric) => sum + metric.failed, 0)
  };
}

function applySavedCpInputs(study, displayUnitSystem = 'imperial') {
  if (!study || typeof study !== 'object') {
    return;
  }

  const displayUnits = normalizeUnitSystem(displayUnitSystem);
  const savedUnits = normalizeUnitSystem(study.units);
  const displayDistance = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return displayUnits === 'metric' ? value : (value / FT_TO_M);
  };
  const displayArea = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return displayUnits === 'metric' ? value : (value * SQM_TO_SQFT);
  };
  const displayMass = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return displayUnits === 'metric' ? value : (value / LB_TO_KG);
  };
  const displaySavedLength = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    const meters = savedUnits === 'metric' ? value : value * FT_TO_M;
    return displayUnits === 'metric' ? meters : meters / FT_TO_M;
  };
  const displaySavedDiameter = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    const meters = savedUnits === 'metric' ? value * MM_TO_M : value * IN_TO_M;
    return displayUnits === 'metric' ? meters / MM_TO_M : meters / IN_TO_M;
  };
  const valueMap = {
    'surface-area': displayArea(study.surfaceAreaM2),
    'modeled-reference-potential': study.modeledReferencePotentialMv,
    'pipe-od': displaySavedDiameter(study.pipeOdInput),
    'pipe-length': displaySavedLength(study.pipeLengthInput),
    'number-of-anodes': study.numberOfAnodes,
    'anode-spacing': displayDistance(study.anodeSpacingM),
    'anode-distance-to-structure': displayDistance(study.anodeDistanceToStructureM),
    'anode-burial-depth': displayDistance(study.anodeBurialDepthM),
    'installed-mass': displayMass(study.installedMassKg),
    'criteria-evidence-enabled': study.criteriaEvidenceEnabled === true,
    'iccp-rated-current': study.iccpRatedCurrentA,
    'iccp-rated-voltage': study.iccpRatedVoltageV,
    'iccp-groundbed-resistance': study.iccpGroundbedResistanceOhm,
    'iccp-voltage-allowance': study.iccpVoltageAllowanceV,
    'iccp-reserve-factor': study.iccpReserveFactor,
    'test-point-count': study.testPointCount,
    'test-point-pass-count': study.passingTestPointCount,
    'reference-electrode-location': study.referenceElectrodeLocation,
    'interference-geometry': study.interferenceGeometry,
    'interference-source-type': study.interferenceSourceType,
    'foreign-structure-separation': displayDistance(study.foreignStructureSeparationM),
    'parallel-exposure-length': displayDistance(study.parallelExposureLengthM),
    'crossing-angle': study.crossingAngleDeg,
    'measured-potential-gradient': study.measuredPotentialGradientMvPerM,
    'bonding-strategy': study.bondingStrategy
  };

  Object.entries(valueMap).forEach(([id, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    const field = document.getElementById(id);
    if (!field) {
      return;
    }
    if (field.type === 'checkbox') {
      field.checked = value === true;
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

function formatDesignHistoryValue(value, unit = '') {
  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }
  const formatted = typeof value === 'number' && Number.isFinite(value)
    ? String(roundTo(value, 3))
    : String(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function designHistoryValuesEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.0001;
  }
  return String(a ?? '') === String(b ?? '');
}

function buildDesignHistoryEntry(result, previousStudy = null) {
  const changes = DESIGN_HISTORY_FIELDS.flatMap((field) => {
    const nextValue = result?.[field.key];
    const previousValue = previousStudy?.[field.key];
    if (previousStudy && designHistoryValuesEqual(previousValue, nextValue)) {
      return [];
    }
    return [{
      key: field.key,
      label: field.label,
      from: previousStudy ? formatDesignHistoryValue(previousValue, field.unit) : 'Initial',
      to: formatDesignHistoryValue(nextValue, field.unit)
    }];
  });
  return {
    id: result.timestamp,
    timestamp: result.timestamp,
    note: String(result.designChangeNote || '').trim() || (previousStudy ? 'Design inputs recalculated.' : 'Initial design basis established.'),
    changes,
    outcomes: {
      sourceType: result.anodeTypeSystem,
      requiredCurrentA: result.requiredCurrentA,
      minimumAnodeMassKg: result.minimumAnodeMassKg,
      predictedLifeYears: result.predictedLifeYears,
      safetyMarginYears: result.safetyMarginYears,
      requiredRectifierCurrentA: result.iccpSizing?.requiredRectifierCurrentA ?? null,
      requiredRectifierVoltageV: result.iccpSizing?.requiredRectifierVoltageV ?? null,
      sourceHeadroomA: result.iccpSizing?.currentHeadroomA ?? null,
      interferenceRisk: result.interferenceAssessment?.riskLevel || 'low'
    }
  };
}

function appendDesignHistory(result, previousStudy = null) {
  const previousHistory = Array.isArray(previousStudy?.designHistory) ? previousStudy.designHistory : [];
  return [...previousHistory, buildDesignHistoryEntry(result, previousStudy)].slice(-20);
}

function buildTimelineStepSnapshot(stepKey, result) {
  if (!result || typeof result !== 'object') {
    return `<svg viewBox="0 0 120 64" role="img" aria-label="No study yet snapshot"><rect x="6" y="10" width="108" height="44" rx="8" fill="color-mix(in srgb, var(--panel-bg, #f8fafc) 85%, #dbeafe 15%)"></rect><text x="60" y="38" text-anchor="middle" font-size="11" fill="currentColor">Run analysis</text></svg>`;
  }
  if (stepKey === 'inputs') {
    const severity = escapeHtml(result.moistureCategory || 'moderate');
    return `<svg viewBox="0 0 120 64" role="img" aria-label="Input snapshot"><rect x="8" y="12" width="104" height="12" rx="4" fill="#1d4ed8"></rect><rect x="8" y="30" width="72" height="10" rx="4" fill="#0ea5e9"></rect><rect x="8" y="44" width="52" height="8" rx="4" fill="#94a3b8"></rect><text x="111" y="52" text-anchor="end" font-size="10" fill="currentColor">${severity}</text></svg>`;
  }
  if (stepKey === 'geometry') {
    return `<svg viewBox="0 0 120 64" role="img" aria-label="Geometry snapshot"><line x1="16" y1="34" x2="104" y2="34" stroke="#334155" stroke-width="5" stroke-linecap="round"></line><circle cx="28" cy="22" r="5" fill="#2563eb"></circle><circle cx="56" cy="22" r="5" fill="#2563eb"></circle><circle cx="84" cy="22" r="5" fill="#2563eb"></circle><rect x="94" y="30" width="12" height="12" rx="2" fill="#16a34a"></rect></svg>`;
  }
  if (stepKey === 'interference') {
    const score = Number.isFinite(result.interferenceAssessment?.score) ? result.interferenceAssessment.score : 0;
    const barWidth = Math.max(4, Math.min(96, Math.round((score / 25) * 96)));
    return `<svg viewBox="0 0 120 64" role="img" aria-label="Interference risk snapshot"><rect x="12" y="18" width="96" height="20" rx="6" fill="none" stroke="#475569" stroke-width="1.5"></rect><rect x="12" y="18" width="${barWidth}" height="20" rx="6" fill="#d55e00"></rect><text x="60" y="56" text-anchor="middle" font-size="10" fill="currentColor">risk ${score}</text></svg>`;
  }
  if (stepKey === 'distribution') {
    const attenuation = Number.isFinite(result.distributionModel?.globalAttenuationFactor) ? result.distributionModel.globalAttenuationFactor : 1;
    const barWidth = Math.max(10, Math.min(96, Math.round(attenuation * 72)));
    return `<svg viewBox="0 0 120 64" role="img" aria-label="Distribution snapshot"><rect x="12" y="18" width="96" height="28" rx="6" fill="none" stroke="#475569" stroke-width="1.5"></rect><rect x="12" y="18" width="${barWidth}" height="28" rx="6" fill="#f59e0b"></rect><text x="60" y="56" text-anchor="middle" font-size="10" fill="currentColor">attn ${roundTo(attenuation, 2)}</text></svg>`;
  }
  const outcomeLabel = result.anodeTypeSystem === 'iccp' ? 'current · voltage · headroom' : 'current · mass · life';
  return `<svg viewBox="0 0 120 64" role="img" aria-label="Sizing outcomes snapshot"><rect x="10" y="12" width="28" height="40" rx="5" fill="#2563eb"></rect><rect x="46" y="22" width="28" height="30" rx="5" fill="#0ea5e9"></rect><rect x="82" y="7" width="28" height="45" rx="5" fill="#16a34a"></rect><text x="60" y="63" text-anchor="middle" font-size="9" fill="currentColor">${outcomeLabel}</text></svg>`;
}

function summarizeTimelineStep(stepKey, result) {
  if (!result || typeof result !== 'object') {
    return 'No CP run saved yet. Run a study to capture a replayable design decision at this step.';
  }
  if (stepKey === 'inputs') {
    return `Inputs establish a ${result.assetType} in ${result.moistureCategory} conditions with ${result.soilResistivityOhmM} Ω·m soil and ${result.designCurrentDensityMaM2} mA/m² design density.`;
  }
  if (stepKey === 'geometry') {
    return `Geometry uses ${result.numberOfAnodes} anodes at ${roundTo(result.anodeSpacingM, 2)} m spacing with ${roundTo(result.anodeDistanceToStructureM, 2)} m structure offset.`;
  }
  if (stepKey === 'interference') {
    return result.interferenceAssessment?.riskSummary || 'No design-stage interference assessment has been calculated.';
  }
  if (stepKey === 'distribution') {
    return `Area demand ${result.areaBasedRequiredCurrentA} A becomes ${result.distributionAdjustedCurrentA} A after the ${result.distributionModel?.globalAttenuationFactor ?? 'n/a'} distribution factor.`;
  }
  if (result.anodeTypeSystem === 'iccp') {
    return `The design requires ${result.requiredCurrentA} A of structure current and a preliminary rectifier output of ${result.iccpSizing?.requiredRectifierCurrentA ?? 'n/a'} A at ${result.iccpSizing?.requiredRectifierVoltageV ?? 'n/a'} V.`;
  }
  return `The design requires ${result.requiredCurrentA} A and ${result.minimumAnodeMassKg} kg of anode mass, with ${result.predictedLifeYears} years predicted life and ${result.safetyMarginYears} years of margin.`;
}

function resolveTimelineCheckpoints(stepKey, result) {
  if (!result) return ['Run the sizing analysis to populate this checkpoint.'];
  if (stepKey === 'inputs') {
    return [`Density: ${result.currentDensityMethod}`, `Coating: ${result.coatingModel?.label || result.coatingModelType}`];
  }
  if (stepKey === 'geometry') {
    return [`${result.numberOfAnodes} anodes`, `${roundTo(result.anodeSpacingM, 2)} m spacing`, `${roundTo(result.anodeBurialDepthM, 2)} m burial`];
  }
  if (stepKey === 'interference') {
    return [`Risk: ${result.interferenceAssessment?.riskLevel || 'low'}`, `Score: ${result.interferenceAssessment?.score ?? 0}`, `Bonding: ${result.bondingStrategy || 'none'}`];
  }
  if (stepKey === 'distribution') {
    return [`Effectiveness: ${result.distributionModel?.averageEffectivenessFactor ?? 'n/a'}`, `Attenuation: ${result.distributionModel?.globalAttenuationFactor ?? 'n/a'}`];
  }
  if (result.anodeTypeSystem === 'iccp') {
    return [`Current: ${result.requiredCurrentA} A`, `Rectifier: ${result.iccpSizing?.requiredRectifierCurrentA ?? 'n/a'} A`, `Voltage: ${result.iccpSizing?.requiredRectifierVoltageV ?? 'n/a'} V`];
  }
  return [`Current: ${result.requiredCurrentA} A`, `Mass: ${result.minimumAnodeMassKg} kg`, `Life: ${result.predictedLifeYears} years`];
}

function renderTimelinePanel(root, result, timelineState) {
  if (!root) return;
  const state = normalizeTimelineState(timelineState);
  const activeDefinition = TIMELINE_STEP_DEFINITIONS.find((step) => step.key === state.activeStep) || TIMELINE_STEP_DEFINITIONS[0];
  const checkpoints = resolveTimelineCheckpoints(activeDefinition.key, result);
  const timelineItems = TIMELINE_STEP_DEFINITIONS.map((step) => {
    const isActive = step.key === activeDefinition.key;
    return `
      <li class="cp-timeline-step ${isActive ? 'is-active' : ''}">
        <button type="button" class="cp-timeline-step__header" data-cp-timeline-step="${step.key}" aria-pressed="${isActive ? 'true' : 'false'}">
          <span class="cp-timeline-step__index">${TIMELINE_STEP_SEQUENCE.indexOf(step.key) + 1}</span>
          <span class="cp-timeline-step__title">${step.title}</span>
        </button>
      </li>
    `;
  }).join('');
  const history = Array.isArray(result?.designHistory) ? [...result.designHistory].reverse() : [];
  const historyMarkup = history.length
    ? history.slice(0, 8).map((entry) => `
      <li class="cp-design-history__entry">
        <div>
          <strong>${escapeHtml(entry.note || 'Design recalculated.')}</strong>
          <time datetime="${escapeHtml(entry.timestamp || '')}">${entry.timestamp ? escapeHtml(new Date(entry.timestamp).toLocaleString()) : 'Unknown time'}</time>
        </div>
        <div class="cp-design-history__changes">
          ${(Array.isArray(entry.changes) && entry.changes.length
            ? entry.changes.map((change) => `<span><strong>${escapeHtml(change.label)}:</strong> ${escapeHtml(change.from)} → ${escapeHtml(change.to)}</span>`).join('')
            : '<span>No input changes; analysis rerun.</span>')}
        </div>
        <p>Calculated effect: Required current ${escapeHtml(String(entry.outcomes?.requiredCurrentA ?? 'n/a'))} A · ${entry.outcomes?.sourceType === 'iccp'
          ? `Rectifier ${escapeHtml(String(entry.outcomes?.requiredRectifierCurrentA ?? 'n/a'))} A at ${escapeHtml(String(entry.outcomes?.requiredRectifierVoltageV ?? 'n/a'))} V`
          : `Minimum mass ${escapeHtml(String(entry.outcomes?.minimumAnodeMassKg ?? 'n/a'))} kg · Predicted life ${escapeHtml(String(entry.outcomes?.predictedLifeYears ?? 'n/a'))} years`} · ${escapeHtml(String(entry.outcomes?.interferenceRisk || 'low'))} interference risk</p>
      </li>
    `).join('')
    : '<li class="cp-design-history__empty">Run the analysis to start the saved design history.</li>';

  root.innerHTML = `
    <details id="cp-timeline-details" class="cp-timeline-panel"${state.collapsed ? '' : ' open'}>
      <summary>Design Decision Timeline</summary>
      <p class="field-hint">Follow the current design path, then review the saved input changes and calculated effects for each iteration.</p>
      <ol class="cp-timeline-list">${timelineItems}</ol>
      <article class="cp-timeline-active-detail">
        <div class="cp-timeline-step__snapshot">${buildTimelineStepSnapshot(activeDefinition.key, result)}</div>
        <div>
          <h4>${escapeHtml(activeDefinition.title)}</h4>
          <p>${escapeHtml(summarizeTimelineStep(activeDefinition.key, result))}</p>
          <p class="cp-timeline-step__why">${escapeHtml(activeDefinition.whyThisMatters)}</p>
          <div class="cp-timeline-checkpoints">${checkpoints.map((checkpoint) => `<span>${escapeHtml(checkpoint)}</span>`).join('')}</div>
          <button type="button" class="btn" data-cp-nav-target="${activeDefinition.navTargetId}" data-cp-nav-fallback="${activeDefinition.navFallbackId || ''}">${activeDefinition.navLabel}</button>
        </div>
      </article>
      <section class="cp-design-history" aria-labelledby="cp-design-history-heading">
        <h4 id="cp-design-history-heading">Saved design iterations</h4>
        <ol>${historyMarkup}</ol>
      </section>
    </details>
  `;
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

bootstrapPage({
  onReady: () => {
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
      renderTimelinePanel(timelinePanelEl, studies.cathodicProtection, cpTimelineState);
      cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(studies.cathodicProtection));
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
      renderTimelinePanel(timelinePanelEl, studies.cathodicProtection, cpTimelineState);
      cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(studies.cathodicProtection));
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
  const supportingWorkspace = document.querySelector('.cp-supporting-workspace');
  const studyReviewSection = document.getElementById('study-review-panel')?.closest('section');
  if (supportingWorkspace && studyReviewSection) {
    studyReviewSection.before(supportingWorkspace);
  }
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
  const timelinePanelEl = document.getElementById('cp-decision-timeline-content');
  const unitSelectEl = document.getElementById('unit-select');
  const currentUnitSystem = normalizeUnitSystem(unitSelectEl?.value);

  const saved = normalizeSavedStudy(getStudies().cathodicProtection);
  const savedDraft = getCathodicProtectionDraft();
  const savedApproval = getStudyApprovals().cathodicProtection || null;
  let cpLayoutState = saved?.cpLayout || null;
  let cpTimelineState = normalizeTimelineState(saved?.timelineState);
  let lastCalculatedFingerprint = saved?.inputFingerprint || buildCalculationInputFingerprint(saved);
  let calculationInProgress = false;
  let draftSaveTimer = null;
  applySavedCpInputs(saved, currentUnitSystem);
  const restoredDraft = applyCpFormValues(form, savedDraft, currentUnitSystem);
  if (!saved && !restoredDraft && currentUnitSystem === 'metric') {
    convertCpDisplayUnits('imperial', 'metric');
  } else if (!restoredDraft) {
    updateCpUnitLabels(currentUnitSystem);
  }
  let displayedUnitSystem = currentUnitSystem;
  renderCalculationBasis(basisPanel, CP_STANDARD_BASIS);
  renderComplianceStatusPanel(compliancePanelEl, saved?.compliance?.requiredChecks, saved?.compliance?.lastEvaluatedAt, saved?.compliance);
  renderTimelinePanel(timelinePanelEl, saved, cpTimelineState);
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
    renderTimelinePanel(timelinePanelEl, saved, cpTimelineState);
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
  cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(saved));

  function persistTimelineState(nextTimelineState) {
    cpTimelineState = normalizeTimelineState(nextTimelineState);
    const studies = getStudies();
    const existingStudy = normalizeSavedStudy(studies.cathodicProtection);
    if (!existingStudy) return;
    studies.cathodicProtection = {
      ...existingStudy,
      timelineState: cpTimelineState
    };
    setStudies(studies);
  }

  function refreshTableDensity() {
    const input = readFormInputs();
    if (!input) return;
    const tableDensity = lookupCurrentDensity(input.assetType, input.moistureCategory, input.soilResistivityOhmM, input.soilPh, input.pipeMaterial);
    tableDensityEl.value = roundTo(tableDensity, 3);
    const baseDensity = TABLE_CURRENT_DENSITY_MA_M2[input.assetType]?.[input.moistureCategory] ?? 10;
    const resistivityFactor = input.soilResistivityOhmM < 50 ? 1.2 : (input.soilResistivityOhmM > 200 ? 0.85 : 1);
    const phFactor = input.soilPh < 5.5 || input.soilPh > 9 ? 1.15 : 1;
    const materialFactor = input.assetType === 'pipe'
      ? (PIPE_MATERIAL_FACTORS[input.pipeMaterial]?.factor ?? 1)
      : 1;
    const hint = document.getElementById('table-density-hint');
    if (hint) {
      hint.textContent = `Derived basis: ${baseDensity} × resistivity ${resistivityFactor.toFixed(2)} × pH ${phFactor.toFixed(2)} × material ${materialFactor.toFixed(2)} = ${roundTo(tableDensity, 3)} mA/m².`;
    }
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

  function refreshCpSourceFields() {
    const isIccp = document.getElementById('anode-system-type')?.value === 'iccp';
    document.querySelectorAll('.cp-system-dependent--galvanic').forEach((row) => {
      row.hidden = isIccp;
      row.querySelectorAll('input, select, textarea').forEach((field) => {
        field.disabled = isIccp;
        field.required = !isIccp;
      });
    });
    document.querySelectorAll('.cp-system-dependent--iccp').forEach((row) => {
      row.hidden = !isIccp;
      row.querySelectorAll('input, select, textarea').forEach((field) => {
        field.disabled = !isIccp;
        field.required = isIccp;
      });
    });
    const numberLabel = document.getElementById('number-of-anodes-label');
    if (numberLabel) {
      numberLabel.textContent = isIccp ? 'Number of groundbed elements' : 'Number of galvanic anodes';
    }
    const sourceGeometryLabels = {
      'anode-spacing-label': isIccp ? 'Groundbed element spacing' : 'Galvanic anode spacing',
      'anode-distance-label': isIccp ? 'Groundbed distance to structure' : 'Galvanic anode distance to structure',
      'anode-depth-label': isIccp ? 'Groundbed element burial depth' : 'Galvanic anode burial depth'
    };
    Object.entries(sourceGeometryLabels).forEach(([id, label]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = label;
      }
    });
  }

  function refreshCriteriaEvidenceFields() {
    const enabled = document.getElementById('criteria-evidence-enabled')?.checked === true;
    const fieldset = document.getElementById('cp-criteria-evidence-fields');
    const status = document.getElementById('criteria-evidence-status');
    if (fieldset) {
      fieldset.disabled = !enabled;
    }
    ['test-method', 'measurement-context', 'reference-electrode-location', 'ir-drop-compensation-method',
      'measured-off-potential', 'simulated-polarization-shift', 'test-point-count', 'test-point-pass-count']
      .forEach((id) => {
        const field = document.getElementById(id);
        if (field) {
          field.required = enabled;
        }
      });
    if (status) {
      status.textContent = enabled
        ? 'Field evidence is enabled. Enter actual project measurements before calculating.'
        : 'Field evidence is not included. Protection criteria will be reported as not evaluated.';
    }
  }

  function refreshInterferenceFields() {
    const geometry = document.getElementById('interference-geometry')?.value || 'none';
    const sourceType = document.getElementById('interference-source-type')?.value || 'none';
    const assessmentActive = geometry !== 'none' || sourceType !== 'none';
    const visibility = {
      'foreign-structure-separation-row': geometry !== 'none',
      'parallel-exposure-length-row': geometry === 'parallel' || geometry === 'shared-corridor',
      'crossing-angle-row': geometry === 'crossing',
      'measured-potential-gradient-row': assessmentActive,
      'bonding-strategy-row': assessmentActive
    };
    Object.entries(visibility).forEach(([rowId, visible]) => {
      const row = document.getElementById(rowId);
      if (!row) return;
      row.hidden = !visible;
      row.querySelectorAll('input, select, textarea').forEach((field) => {
        field.disabled = !visible;
      });
    });
  }

  function appendDescription(field, descriptionId) {
    if (!field || !descriptionId) {
      return;
    }
    const ids = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(descriptionId);
    field.setAttribute('aria-describedby', [...ids].join(' '));
  }

  function removeDescription(field, descriptionId) {
    if (!field || !descriptionId) {
      return;
    }
    const ids = (field.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== descriptionId);
    if (ids.length) {
      field.setAttribute('aria-describedby', ids.join(' '));
    } else {
      field.removeAttribute('aria-describedby');
    }
  }

  function enhanceFormGuidance() {
    form.querySelectorAll('.field-row + .field-hint').forEach((hint, index) => {
      const field = hint.previousElementSibling?.querySelector('input, select, textarea');
      if (!field) {
        return;
      }
      if (!hint.id) {
        hint.id = `cp-field-hint-${index + 1}`;
      }
      appendDescription(field, hint.id);
    });
  }

  function clearValidationState() {
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
      field.removeAttribute('aria-invalid');
      removeDescription(field, errorsDiv.id);
    });
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';
  }

  function fieldForValidationMessage(message) {
    const key = Object.keys(VALIDATION_FIELD_IDS).find((candidate) => message.includes(candidate));
    return key ? document.getElementById(VALIDATION_FIELD_IDS[key]) : null;
  }

  function showInputValidationError(message, field = null) {
    errorsDiv.hidden = false;
    errorsDiv.innerHTML = `<strong>Input validation error:</strong> ${escapeHtml(message)}`;
    if (!field) {
      errorsDiv.focus?.();
      return;
    }
    const details = field.closest('details');
    if (details) {
      details.open = true;
    }
    field.setAttribute('aria-invalid', 'true');
    appendDescription(field, errorsDiv.id);
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const calculationStatus = document.getElementById('cp-calculation-status');
  let resultsAreStale = false;
  let pendingDraftDirty = false;

  function setCalculationBusy(isBusy, completionMessage = '') {
    calculationInProgress = isBusy;
    submitButton.disabled = isBusy;
    form.toggleAttribute('aria-busy', isBusy);
    resultsDiv.toggleAttribute('aria-busy', isBusy);
    if (isBusy) {
      submitButton.textContent = 'Calculating…';
      calculationStatus.hidden = false;
      calculationStatus.textContent = 'Calculating cathodic protection requirements…';
      return;
    }
    submitButton.textContent = resultsAreStale ? 'Recalculate Updated Inputs' : 'Calculate CP Requirements';
    calculationStatus.hidden = !completionMessage;
    calculationStatus.textContent = completionMessage;
  }

  function setResultsStaleState(stale) {
    resultsAreStale = Boolean(stale && resultsDiv.querySelector('.results-panel'));
    const panel = resultsDiv.querySelector('.results-panel');
    const staleAlert = resultsDiv.querySelector('#cp-stale-results-alert');
    panel?.classList.toggle('is-stale', resultsAreStale);
    if (staleAlert) {
      staleAlert.hidden = !resultsAreStale;
    }
    resultsDiv.setAttribute(
      'aria-label',
      resultsAreStale
        ? 'Cathodic protection sizing results — out of date'
        : 'Cathodic protection sizing results'
    );
    if (!calculationInProgress) {
      submitButton.textContent = resultsAreStale ? 'Recalculate Updated Inputs' : 'Calculate CP Requirements';
    }
  }

  function currentInputFingerprint() {
    return buildCalculationInputFingerprint(readFormInputs());
  }

  function flushDraft() {
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    setCathodicProtectionDraft({
      schemaVersion: CP_DRAFT_SCHEMA_VERSION,
      unitSystem: displayedUnitSystem,
      values: captureCpFormValues(form),
      dirty: pendingDraftDirty,
      updatedAt: new Date().toISOString()
    });
  }

  function scheduleDraftSave(dirty, immediate = false) {
    pendingDraftDirty = Boolean(dirty);
    if (immediate) {
      flushDraft();
      return;
    }
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
    }
    draftSaveTimer = setTimeout(flushDraft, 250);
  }

  function updateDraftAndStaleState({ immediate = false } = {}) {
    const fingerprint = currentInputFingerprint();
    const stale = Boolean(lastCalculatedFingerprint && fingerprint !== lastCalculatedFingerprint);
    setResultsStaleState(stale);
    scheduleDraftSave(stale || !lastCalculatedFingerprint, immediate);
  }

  function refreshFormPresentation() {
    refreshCoatingModelInputs();
    refreshCpSourceFields();
    refreshCriteriaEvidenceFields();
    refreshInterferenceFields();
    updatePipeVisibility();
    refreshPipeMaterialHint();
    refreshSurfaceAreaMode();
    toggleDensityMode();
    refreshTableDensity();
    cpLayoutCanvasController?.syncFromInputs();
  }

  function restoreLastCalculatedInputs() {
    const study = normalizeSavedStudy(getStudies().cathodicProtection);
    if (!study) {
      return;
    }
    const restored = applyCpFormValues(form, {
      values: study.formValues,
      unitSystem: study.formUnitSystem || study.units
    }, displayedUnitSystem);
    if (!restored) {
      applySavedCpInputs(study, displayedUnitSystem);
    }
    refreshFormPresentation();
    lastCalculatedFingerprint = study.inputFingerprint || buildCalculationInputFingerprint(study);
    setResultsStaleState(false);
    scheduleDraftSave(false, true);
  }

  toggleDensityMode();
  refreshCoatingModelInputs();
  refreshCpSourceFields();
  refreshCriteriaEvidenceFields();
  refreshInterferenceFields();
  updatePipeVisibility();
  refreshPipeMaterialHint();
  refreshSurfaceAreaMode();
  refreshTableDensity();
  enhanceFormGuidance();
  setResultsStaleState(Boolean(lastCalculatedFingerprint && currentInputFingerprint() !== lastCalculatedFingerprint));

  unitSelectEl?.addEventListener('change', () => {
    const nextUnitSystem = normalizeUnitSystem(unitSelectEl.value);
    convertCpDisplayUnits(displayedUnitSystem, nextUnitSystem);
    displayedUnitSystem = nextUnitSystem;
    refreshSurfaceAreaMode();
    cpLayoutCanvasController?.syncFromInputs();
    updateDraftAndStaleState();
  });

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

  ['anode-system-type', 'criteria-evidence-enabled', 'interference-geometry', 'interference-source-type'].forEach((id) => {
    const field = document.getElementById(id);
    field?.addEventListener('change', () => {
      refreshCpSourceFields();
      refreshCriteriaEvidenceFields();
      refreshInterferenceFields();
      cpLayoutCanvasController?.syncFromInputs();
    });
  });

  form.addEventListener('input', (event) => {
    const field = event.target.closest('input, select, textarea');
    if (!field || field.getAttribute('aria-invalid') !== 'true') {
      return;
    }
    field.removeAttribute('aria-invalid');
    removeDescription(field, errorsDiv.id);
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';
  });

  form.addEventListener('input', () => updateDraftAndStaleState());
  form.addEventListener('change', () => updateDraftAndStaleState());
  window.addEventListener('pagehide', flushDraft);

  resultsDiv?.addEventListener('click', (event) => {
    const resultLink = event.target.closest('.cp-results-nav a[href^="#"], a[data-cp-result-link][href^="#"]');
    if (resultLink) {
      const target = document.querySelector(resultLink.getAttribute('href'));
      if (target) {
        event.preventDefault();
        if (target instanceof HTMLDetailsElement) {
          target.open = true;
        }
        const focusTarget = target instanceof HTMLDetailsElement
          ? target.querySelector(':scope > summary')
          : (target.querySelector('h2, h3, summary') || target);
        if (focusTarget && !focusTarget.matches('a, button, input, select, textarea, summary, [tabindex]')) {
          focusTarget.setAttribute('tabindex', '-1');
        }
        window.history.replaceState(null, '', resultLink.getAttribute('href'));
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        focusTarget?.focus({ preventScroll: true });
      }
      return;
    }
    const trigger = event.target.closest('[data-cp-setup-target]');
    if (trigger) {
      focusMeasurementVisualization(trigger.dataset.cpSetupTarget);
      return;
    }
    const actionButton = event.target.closest('[data-cp-action]');
    if (actionButton) {
      if (actionButton.dataset.cpAction === 'enter-criteria-evidence') {
        const evidenceToggle = document.getElementById('criteria-evidence-enabled');
        const details = evidenceToggle?.closest('details');
        if (details) {
          details.open = true;
        }
        if (evidenceToggle) {
          evidenceToggle.checked = true;
          refreshCriteriaEvidenceFields();
          document.getElementById('measured-off-potential')?.focus();
          updateDraftAndStaleState();
        }
        return;
      }
      if (actionButton.dataset.cpAction === 'revert-calculated') {
        restoreLastCalculatedInputs();
        return;
      }
      const studies = getStudies();
      const activeStudy = normalizeSavedStudy(studies.cathodicProtection);
      if (!activeStudy) {
        return;
      }
      if (actionButton.dataset.cpAction === 'download-report-data') {
        const reportData = activeStudy.reportExport || buildReportExportData(
          activeStudy,
          getStudyApprovals().cathodicProtection || null
        );
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = `cathodic-protection-report-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        URL.revokeObjectURL(downloadUrl);
        return;
      }
      if (actionButton.dataset.cpAction === 'save-baseline') {
        const baselineStudy = sanitizeComparisonStudy({
          ...activeStudy,
          comparisonBaseline: null
        });
        if (!baselineStudy) {
          return;
        }
        studies.cathodicProtection = {
          ...activeStudy,
          comparisonBaseline: baselineStudy,
          timelineState: cpTimelineState
        };
        cpComparisonState.baselineStudy = baselineStudy;
        setStudies(studies);
        renderResults(studies.cathodicProtection, resultsDiv);
        const comparePanel = resultsDiv.querySelector('#cp-compare-panel');
        if (comparePanel) {
          comparePanel.hidden = false;
        }
        return;
      }
      if (actionButton.dataset.cpAction === 'show-compare') {
        const panel = resultsDiv.querySelector('#cp-compare-panel');
        if (panel) {
          panel.hidden = !panel.hidden;
        }
        return;
      }
      if (actionButton.dataset.cpAction === 'import-compare') {
        const importInput = resultsDiv.querySelector('#cp-compare-import-input');
        importInput?.click();
        return;
      }
      if (actionButton.dataset.cpAction === 'promote-baseline') {
        const baseline = normalizeSavedStudy(activeStudy.comparisonBaseline || cpComparisonState.baselineStudy);
        if (!baseline) {
          showModal('Comparison Baseline Missing', '<p>Import a comparison baseline before promoting Configuration B.</p>', 'warning');
          return;
        }
        studies.cathodicProtection = {
          ...baseline,
          comparisonBaseline: null,
          timelineState: cpTimelineState
        };
        cpComparisonState.baselineStudy = null;
        setStudies(studies);
        applySavedCpInputs(studies.cathodicProtection);
        cpLayoutCanvasController?.syncFromInputs();
        renderResults(studies.cathodicProtection, resultsDiv);
        renderTimelinePanel(timelinePanelEl, studies.cathodicProtection, cpTimelineState);
        cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(studies.cathodicProtection));
        renderComplianceStatusPanel(
          compliancePanelEl,
          studies.cathodicProtection.compliance?.requiredChecks,
          studies.cathodicProtection.compliance?.lastEvaluatedAt,
          studies.cathodicProtection.compliance
        );
      }
      return;
    }
    const zoomButton = event.target.closest('[data-cp-compare-zoom]');
    if (zoomButton) {
      if (zoomButton.dataset.cpCompareZoom === 'in') {
        cpComparisonState.zoomScale = Math.min(2.2, cpComparisonState.zoomScale + 0.15);
      } else if (zoomButton.dataset.cpCompareZoom === 'out') {
        cpComparisonState.zoomScale = Math.max(0.75, cpComparisonState.zoomScale - 0.15);
      } else {
        cpComparisonState.zoomScale = 1;
      }
      const refreshedStudy = normalizeSavedStudy(getStudies().cathodicProtection);
      if (refreshedStudy?.comparisonBaseline || cpComparisonState.baselineStudy) {
        renderComparisonCanvases(resultsDiv, refreshedStudy, refreshedStudy.comparisonBaseline || cpComparisonState.baselineStudy);
      }
      return;
    }
  });

  resultsDiv?.addEventListener('change', async (event) => {
    const input = event.target.closest('#cp-compare-import-input');
    if (!input?.files?.length) {
      return;
    }
    try {
      const file = input.files[0];
      const rawText = await file.text();
      const baselineStudy = parseComparisonStudyFromImport(rawText);
      if (!baselineStudy) {
        throw new Error('No cathodicProtection study payload found in imported file.');
      }
      const studies = getStudies();
      const activeStudy = normalizeSavedStudy(studies.cathodicProtection);
      if (!activeStudy) {
        throw new Error('Run a CP analysis before importing a comparison baseline.');
      }
      studies.cathodicProtection = {
        ...activeStudy,
        comparisonBaseline: baselineStudy,
        timelineState: cpTimelineState
      };
      cpComparisonState.baselineStudy = baselineStudy;
      setStudies(studies);
      renderResults(studies.cathodicProtection, resultsDiv);
      renderTimelinePanel(timelinePanelEl, studies.cathodicProtection, cpTimelineState);
      cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(studies.cathodicProtection));
      const comparePanel = resultsDiv.querySelector('#cp-compare-panel');
      if (comparePanel) {
        comparePanel.hidden = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import comparison baseline.';
      showModal('Import Comparison Failed', `<p>${escapeHtml(message)}</p>`, 'error');
    } finally {
      input.value = '';
    }
  });

  resultsDiv?.addEventListener('mousemove', (event) => {
    const segmentEl = event.target.closest('[data-cp-compare-segment]');
    const segmentIndex = segmentEl ? Number.parseInt(segmentEl.dataset.cpCompareSegment || '-1', 10) : null;
    const normalizedIndex = Number.isInteger(segmentIndex) && segmentIndex >= 0 ? segmentIndex : null;
    if (normalizedIndex === cpComparisonState.hoveredSegmentIndex) {
      return;
    }
    cpComparisonState.hoveredSegmentIndex = normalizedIndex;
    const activeStudy = normalizeSavedStudy(getStudies().cathodicProtection);
    const baseline = activeStudy?.comparisonBaseline || cpComparisonState.baselineStudy;
    if (activeStudy && baseline) {
      renderComparisonCanvases(resultsDiv, activeStudy, baseline);
    }
  });
  resultsDiv?.addEventListener('mouseleave', () => {
    if (cpComparisonState.hoveredSegmentIndex === null) {
      return;
    }
    cpComparisonState.hoveredSegmentIndex = null;
    const activeStudy = normalizeSavedStudy(getStudies().cathodicProtection);
    const baseline = activeStudy?.comparisonBaseline || cpComparisonState.baselineStudy;
    if (activeStudy && baseline) {
      renderComparisonCanvases(resultsDiv, activeStudy, baseline);
    }
  });

  compliancePanelEl?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-cp-setup-target]');
    if (!trigger) return;
    focusMeasurementVisualization(trigger.dataset.cpSetupTarget);
  });

  timelinePanelEl?.addEventListener('click', (event) => {
    const stepButton = event.target.closest('[data-cp-timeline-step]');
    if (stepButton) {
      const nextStep = stepButton.dataset.cpTimelineStep;
      if (TIMELINE_STEP_SEQUENCE.includes(nextStep)) {
        persistTimelineState({
          ...cpTimelineState,
          activeStep: nextStep
        });
        renderTimelinePanel(timelinePanelEl, normalizeSavedStudy(getStudies().cathodicProtection), cpTimelineState);
      }
      return;
    }

    const navButton = event.target.closest('[data-cp-nav-target]');
    if (navButton) {
      const primaryId = navButton.dataset.cpNavTarget;
      const fallbackId = navButton.dataset.cpNavFallback;
      const target = document.getElementById(primaryId) || (fallbackId ? document.getElementById(fallbackId) : null);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  timelinePanelEl?.addEventListener('toggle', (event) => {
    const details = event.target.closest('#cp-timeline-details');
    if (!details) return;
    persistTimelineState({
      ...cpTimelineState,
      collapsed: !details.open
    });
  }, true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (calculationInProgress) {
      return;
    }
    clearValidationState();
    if (!form.checkValidity()) {
      const firstInvalidField = [...form.elements].find((field) => field.willValidate && !field.validity.valid);
      const message = firstInvalidField?.validationMessage || 'Review the highlighted field and try again.';
      showInputValidationError(message, firstInvalidField);
      return;
    }
    const input = readFormInputs();
    if (!input) return;
    setCalculationBusy(true);
    let completionMessage = 'Calculation complete. Results are current for the displayed inputs.';
    try {
      await runSubmitCalculation(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid cathodic protection inputs.';
      showInputValidationError(message, fieldForValidationMessage(message));
      completionMessage = 'Calculation failed. Review the highlighted input and try again.';
    } finally {
      setCalculationBusy(false, completionMessage);
    }
  });

  async function runSubmitCalculation(input) {
    const inputFingerprint = buildCalculationInputFingerprint(input);
    const formValues = captureCpFormValues(form);
    const result = await runCathodicProtectionAnalysisOffMain(input);
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
      timelineState: cpTimelineState,
      inputFingerprint,
      formValues,
      formUnitSystem: displayedUnitSystem,
      designHistory: appendDesignHistory(result, previousStudy),
      comparisonBaseline: previousStudy?.comparisonBaseline || cpComparisonState.baselineStudy || null,
      compliance: complianceRecord.compliance,
      complianceHistory: complianceRecord.complianceHistory
    };
    setStudies(studies);
    const changeNote = document.getElementById('design-change-note');
    if (changeNote) {
      changeNote.value = '';
    }
    renderResults(studies.cathodicProtection, resultsDiv);
    lastCalculatedFingerprint = inputFingerprint;
    setResultsStaleState(false);
    scheduleDraftSave(false, true);
    cpLayoutCanvasController?.setAssessmentData(buildLayoutAssessmentPayload(studies.cathodicProtection));
    renderComplianceStatusPanel(
      compliancePanelEl,
      studies.cathodicProtection.compliance.requiredChecks,
      studies.cathodicProtection.compliance.lastEvaluatedAt,
      studies.cathodicProtection.compliance
    );
    renderTimelinePanel(timelinePanelEl, studies.cathodicProtection, cpTimelineState);
  }
  },
});

function readFormInputs() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));
  const isVisible = id => !document.getElementById(id)?.hidden;
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
  const foreignStructureSeparationInput = getNumber('foreign-structure-separation');
  const parallelExposureLengthInput = getNumber('parallel-exposure-length');
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
  const criteriaEvidenceEnabled = document.getElementById('criteria-evidence-enabled')?.checked === true;

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
    modeledReferencePotentialMv: getNumber('modeled-reference-potential'),
    anodeCapacityAhPerKg: getNumber('anode-capacity'),
    anodeUtilization: getNumber('anode-utilization'),
    designFactor: getNumber('design-factor'),
    availabilityFactor: getNumber('availability-factor'),
    targetLifeYears: getNumber('design-life-years'),
    installedMassKg: isMetric ? installedMassInput : installedMassInput * LB_TO_KG,
    anodeTypeSystem: getValue('anode-system-type'),
    iccpRatedCurrentA: getNumber('iccp-rated-current'),
    iccpRatedVoltageV: getNumber('iccp-rated-voltage'),
    iccpGroundbedResistanceOhm: getNumber('iccp-groundbed-resistance'),
    iccpVoltageAllowanceV: getNumber('iccp-voltage-allowance'),
    iccpReserveFactor: getNumber('iccp-reserve-factor'),
    numberOfAnodes: Math.round(getNumber('number-of-anodes')),
    anodeSpacingM: isMetric ? anodeSpacingInput : anodeSpacingInput * FT_TO_M,
    anodeDistanceToStructureM: isMetric ? anodeDistanceInput : anodeDistanceInput * FT_TO_M,
    anodeBurialDepthM: isMetric ? anodeBurialDepthInput : anodeBurialDepthInput * FT_TO_M,
    zoneResistivityOhmM: parsedZoneResistivityValues,
    zoneResistivityInputValid,
    criteriaEvidenceEnabled,
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
    interferenceGeometry: getValue('interference-geometry'),
    interferenceSourceType: getValue('interference-source-type'),
    foreignStructureSeparationM: isVisible('foreign-structure-separation-row')
      ? (isMetric ? foreignStructureSeparationInput : foreignStructureSeparationInput * FT_TO_M)
      : undefined,
    parallelExposureLengthM: isVisible('parallel-exposure-length-row')
      ? (isMetric ? parallelExposureLengthInput : parallelExposureLengthInput * FT_TO_M)
      : undefined,
    crossingAngleDeg: isVisible('crossing-angle-row') ? getNumber('crossing-angle') : undefined,
    measuredPotentialGradientMvPerM: isVisible('measured-potential-gradient-row') ? getNumber('measured-potential-gradient') : undefined,
    bondingStrategy: isVisible('bonding-strategy-row') ? getValue('bonding-strategy') : undefined,
    mitigationProfile: getValue('mitigation-profile'),
    mitigationActions,
    mitigationActionsText: getValue('mitigation-actions'),
    verificationTestDate: getValue('verification-test-date'),
    designChangeNote: getValue('design-change-note').trim(),
    units: isMetric ? 'metric' : 'imperial'
  };
}

function renderResults(result, root) {
  const isIccp = result.anodeTypeSystem === 'iccp';
  const useMetricUnits = normalizeUnitSystem(result.units) === 'metric';
  const massUnit = useMetricUnits ? 'kg' : 'lb';
  const distanceUnit = useMetricUnits ? 'm' : 'ft';
  const areaUnit = useMetricUnits ? 'm²' : 'ft²';
  const displayMass = (kilograms) => useMetricUnits ? kilograms : kilograms / LB_TO_KG;
  const displayDistance = (meters) => useMetricUnits ? meters : meters / FT_TO_M;
  const displayArea = (squareMeters) => useMetricUnits ? squareMeters : squareMeters * SQM_TO_SQFT;
  const profileData = result.profileData || buildCpProfileData({
    input: result,
    adjustedRequiredCurrentA: result.requiredCurrentA,
    distributionModel: result.distributionModel,
    modeledReferencePotentialMv: result.modeledReferencePotentialMv,
    baseCoatingFactor: result.coatingBreakdownFactor
  });
  const sourcePasses = isIccp ? result.iccpSizing?.overallStatus === 'pass' : result.safetyMarginYears >= 0;
  const lifeBadgeClass = sourcePasses ? 'result-badge--pass' : 'result-badge--fail';
  const lifeBadgeIcon = sourcePasses ? '✓' : '✕';
  const outputBasis = result.outputBasis || {};
  const sensitivityRows = Array.isArray(result.sensitivity) ? result.sensitivity : [];
  const modeledProfileSummary = summarizeModeledProfile(profileData);
  const modeledProfileChecks = modeledProfileSummary.checks
    .map((check) => `${check.label}: ${check.failed}/${check.total} outside threshold`)
    .join(' · ');
  const modeledProfileNeedsReview = modeledProfileSummary.failed > 0;
  const modeledProfileStatus = modeledProfileNeedsReview ? 'Review required' : 'Within modeled thresholds';
  const modeledProfileBadgeClass = modeledProfileNeedsReview ? 'result-badge--fail' : 'result-badge--pass';
  const advisories = buildDesignAdvisories(result, sensitivityRows, modeledProfileSummary);
  const criteriaEvidence = result.criteriaCheckEvidence || {};
  const criteriaSet = criteriaEvidence.selectedCriteriaSet;
  const criteriaRows = Array.isArray(criteriaEvidence.criteriaResults) ? criteriaEvidence.criteriaResults : [];
  const measurementCorrections = criteriaEvidence.measurementCorrections || {};
  const measurementWarnings = Array.isArray(result.measurementMetadataWarnings) ? result.measurementMetadataWarnings : [];
  const interference = result.interferenceAssessment || {};
  const riskFactorRows = Array.isArray(interference.riskFactorScores) ? interference.riskFactorScores : [];
  const activeRiskFactorRows = riskFactorRows.filter((factor) => Number(factor.score) > 0);
  const buildRiskFactorTable = (rows, label) => `
    <div class="table-wrap">
      <table class="data-table" aria-label="${escapeHtml(label)}">
        <thead><tr><th>Factor</th><th>Input</th><th>Score</th></tr></thead>
        <tbody>
          ${rows.map((factor) => `
            <tr>
              <td>${escapeHtml(factor.label)}</td>
              <td>${escapeHtml(factor.value)}</td>
              <td>${escapeHtml(String(factor.score))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  const riskBadgeClass = interference.riskLevel === 'high'
    ? 'result-badge--fail'
    : (interference.riskLevel === 'medium' ? 'result-badge--not-run' : 'result-badge--pass');
  const unresolvedHighRisk = interference.unresolvedHighRisk === true;
  const criteriaStatusLabel = criteriaEvidence.overallStatus === 'pass'
    ? 'Pass'
    : (criteriaEvidence.overallStatus === 'fail' ? 'Fail' : 'Not evaluated');
  const criteriaStatusClass = criteriaEvidence.overallStatus === 'pass'
    ? 'result-badge--pass'
    : (criteriaEvidence.overallStatus === 'fail' ? 'result-badge--fail' : '');
  const reportExport = result.reportExport || buildReportExportData(result, getStudyApprovals().cathodicProtection || null);
  const verificationPlan = reportExport.verificationPlan || {};
  const verificationRequiredCommissioningTests = Array.isArray(verificationPlan.requiredCommissioningTests)
    ? verificationPlan.requiredCommissioningTests
    : [];
  const verificationMonitoringIntervals = Array.isArray(verificationPlan.monitoringIntervals)
    ? verificationPlan.monitoringIntervals
    : [];
  const verificationCorrectiveActionThresholds = Array.isArray(verificationPlan.correctiveActionThresholds)
    ? verificationPlan.correctiveActionThresholds
    : [];
  const complianceState = result.compliance?.complianceState || 'provisional';
  const complianceBadgeClass = complianceState === 'compliant'
    ? 'result-badge--pass'
    : (complianceState === 'provisional' ? 'result-badge--not-run' : 'result-badge--fail');
  const complianceBadgeText = complianceState === 'compliant'
    ? 'Compliance status: Compliant'
    : (complianceState === 'provisional'
      ? 'Compliance status: Provisional (verification evidence pending)'
      : 'Compliance status: Not compliant');
  const comparisonBaseline = normalizeSavedStudy(result.comparisonBaseline || cpComparisonState.baselineStudy);
  cpComparisonState.baselineStudy = comparisonBaseline || null;
  const hasComparisonBaseline = Boolean(comparisonBaseline);
  const comparisonMarkup = hasComparisonBaseline
    ? buildComparisonPanelMarkup(result, comparisonBaseline)
    : `
      <div class="result-group cp-compare-group">
        <h3>Compare configurations</h3>
        <p class="field-hint">Lock the current result as Configuration B, change the design inputs, and run again to see design deltas. An older saved study can also be imported.</p>
        <div class="cp-compare-actions">
          <button type="button" class="btn" data-cp-action="save-baseline">Save current as baseline</button>
          <button type="button" class="btn" data-cp-action="import-compare">Import older saved CP study</button>
        </div>
        <input type="file" id="cp-compare-import-input" class="hidden" accept=".ctr.json,.json,application/json" title="Import comparison baseline">
      </div>
    `;

  root.innerHTML = `
    <section class="results-panel" aria-labelledby="cp-results-heading">
      <header class="cp-results-header">
        <div>
          <p class="cp-eyebrow">Design outcomes</p>
          <h2 id="cp-results-heading">Cathodic Protection Sizing Results</h2>
          <p>Review the primary sizing decisions first, then open the supporting calculations and design checks as needed.</p>
        </div>
        <div class="cp-results-header__actions">
          <div class="result-badge ${complianceBadgeClass}">${complianceBadgeText}</div>
          <button type="button" class="btn" data-cp-action="download-report-data">Download report data (JSON)</button>
        </div>
      </header>
      <div id="cp-stale-results-alert" class="cp-stale-results-alert" role="status" hidden>
        <div>
          <strong>Results out of date</strong>
          <span>Inputs have changed since this analysis was run. Recalculate before relying on the values below.</span>
        </div>
        <button type="button" class="btn" data-cp-action="revert-calculated">Revert to last calculated inputs</button>
      </div>
      <nav class="cp-results-nav" aria-label="Cathodic protection result sections">
        <a href="#cp-result-kpis">Sizing outcomes</a>
        <a href="#cp-interference-results">Interference</a>
        <a href="#cp-sensitivity-results">Sensitivity</a>
        <a href="#cp-profile-results">Profiles</a>
        <a href="#cp-design-input-summary">Calculation details</a>
      </nav>

      <div id="cp-result-kpis" class="cp-result-kpi-grid">
        <article class="cp-result-kpi">
          <span>Required CP current</span>
          <strong>${result.requiredCurrentA} A</strong>
          <small>Area demand ${result.areaBasedRequiredCurrentA} A · distribution-adjusted ${result.distributionAdjustedCurrentA} A</small>
          <details>
            <summary>Formula and basis</summary>
            <p>I<sub>area</sub> = A<sub>exposed</sub> × i<sub>d</sub> = ${result.exposedAreaM2} × ${(result.designCurrentDensityMaM2 / 1000).toFixed(4)} = ${result.areaBasedRequiredCurrentA} A</p>
            <p>I<sub>required</sub> = I<sub>area</sub> × ${result.distributionModel?.globalAttenuationFactor ?? 1} / ${result.availabilityFactor} = ${result.requiredCurrentA} A</p>
            <p>${escapeHtml(outputBasis.requiredCurrentA || 'See Calculation Basis for the standards mapping.')}</p>
          </details>
        </article>
        ${isIccp ? `
        <article class="cp-result-kpi">
          <span>Required rectifier output</span>
          <strong>${result.iccpSizing?.requiredRectifierCurrentA ?? 'n/a'} A</strong>
          <small>${result.iccpSizing?.requiredRectifierVoltageV ?? 'n/a'} V preliminary DC voltage requirement</small>
          <details>
            <summary>Formula and basis</summary>
            <p>Rated current basis = required CP current × ${result.iccpReserveFactor} reserve factor.</p>
            <p>${escapeHtml(outputBasis.requiredRectifierVoltageV || 'See Calculation Basis for the standards mapping.')}</p>
          </details>
        </article>
        <article class="cp-result-kpi">
          <span>Rectifier capacity headroom</span>
          <strong>${result.iccpSizing?.currentHeadroomA ?? 'n/a'} A</strong>
          <div class="result-badge ${lifeBadgeClass}">${lifeBadgeIcon} ${result.iccpSizing?.voltageHeadroomV ?? 'n/a'} V voltage headroom</div>
          <details>
            <summary>Capacity check</summary>
            <p>Entered rating: ${result.iccpRatedCurrentA} A at ${result.iccpRatedVoltageV} V DC.</p>
            <p>${escapeHtml(outputBasis.sourceHeadroom || '')}</p>
          </details>
        </article>` : `
        <article class="cp-result-kpi">
          <span>Minimum anode mass</span>
          <strong>${formatFiniteValue(displayMass(result.minimumAnodeMassKg), 3)} ${massUnit}</strong>
          <small>Required for the ${result.targetLifeYears}-year target</small>
          <details>
            <summary>Formula and basis</summary>
            <p>W<sub>required</sub> = (I<sub>required</sub> × design hours) / (capacity × utilization × design factor)</p>
            <p>${escapeHtml(outputBasis.minimumAnodeMassKg || 'See Calculation Basis for the standards mapping.')}</p>
          </details>
        </article>
        <article class="cp-result-kpi">
          <span>Predicted design life</span>
          <strong>${result.predictedLifeYears} years</strong>
          <div class="result-badge ${lifeBadgeClass}">${lifeBadgeIcon} ${result.safetyMarginYears} years (${result.safetyMarginPercent}%) margin</div>
          <details>
            <summary>Formula and basis</summary>
            <p>Installed mass life is compared with the ${result.targetLifeYears}-year target.</p>
            <p>${escapeHtml(outputBasis.predictedLifeYears || 'See Calculation Basis for the standards mapping.')}</p>
            <p>${escapeHtml(outputBasis.safetyMargin || '')}</p>
          </details>
        </article>`}
      </div>

      <section class="cp-modeled-coverage ${modeledProfileNeedsReview ? 'cp-modeled-coverage--review' : 'cp-modeled-coverage--pass'}" aria-labelledby="cp-modeled-coverage-heading">
        <div>
          <p class="cp-eyebrow">Modeled route coverage</p>
          <h3 id="cp-modeled-coverage-heading">Base profile threshold check</h3>
          <p><strong>${modeledProfileSummary.failed} of ${modeledProfileSummary.total}</strong> modeled points are outside the profile thresholds. ${escapeHtml(modeledProfileChecks)}</p>
          <p class="field-hint">This route-model check is separate from the entered field-measurement criteria evidence shown below.</p>
        </div>
        <div>
          <span class="result-badge ${modeledProfileBadgeClass}">${modeledProfileStatus}</span>
          <a class="btn" data-cp-result-link href="#cp-profile-results">Review distribution profiles</a>
        </div>
      </section>

      ${comparisonMarkup}

      <details id="cp-design-input-summary" class="cp-result-disclosure">
        <summary>Design inputs and calculated factors</summary>
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
            <tr><td>Exposed area</td><td>${formatFiniteValue(displayArea(result.exposedAreaM2), 3)} ${areaUnit}</td></tr>
            <tr><td>Modeled reference potential</td><td>${result.modeledReferencePotentialMv} mV vs CSE</td></tr>
            <tr><td>Anode system type</td><td>${escapeHtml(result.anodeTypeSystem)}</td></tr>
            <tr><td>${isIccp ? 'Number of groundbed elements' : 'Number of anodes'}</td><td>${result.numberOfAnodes}</td></tr>
            <tr><td>Anode spacing</td><td>${formatFiniteValue(displayDistance(result.anodeSpacingM), 3)} ${distanceUnit}</td></tr>
            <tr><td>Anode distance to structure</td><td>${formatFiniteValue(displayDistance(result.anodeDistanceToStructureM), 3)} ${distanceUnit}</td></tr>
            <tr><td>Anode burial depth</td><td>${formatFiniteValue(displayDistance(result.anodeBurialDepthM), 3)} ${distanceUnit}</td></tr>
            <tr><td>Distribution effectiveness (average)</td><td>${result.distributionModel?.averageEffectivenessFactor ?? 'n/a'}</td></tr>
            <tr><td>Distribution attenuation factor</td><td>${result.distributionModel?.globalAttenuationFactor ?? 'n/a'}</td></tr>
            ${isIccp ? `
            <tr><td>Rectifier rating</td><td>${result.iccpRatedCurrentA} A at ${result.iccpRatedVoltageV} V DC</td></tr>
            <tr><td>Groundbed circuit resistance</td><td>${result.iccpGroundbedResistanceOhm} Ω</td></tr>
            <tr><td>Voltage allowance</td><td>${result.iccpVoltageAllowanceV} V</td></tr>
            <tr><td>ICCP reserve factor</td><td>${result.iccpReserveFactor}</td></tr>` : `
            <tr><td>Anode capacity</td><td>${result.anodeCapacityAhPerKg} Ah/kg</td></tr>
            <tr><td>Anode utilization factor U</td><td>${result.anodeUtilization}</td></tr>
            <tr><td>Design factor F<sub>design</sub></td><td>${result.designFactor}</td></tr>`}
            <tr><td>Availability factor</td><td>${result.availabilityFactor}</td></tr>
            <tr><td>Field evidence</td><td>${result.criteriaEvidenceEnabled ? 'Included' : 'Not evaluated'}</td></tr>
            ${result.criteriaEvidenceEnabled ? `
            <tr><td>Test method</td><td>${escapeHtml(result.testMethod || 'instant-off')}</td></tr>
            <tr><td>Measurement context</td><td>${escapeHtml(result.measurementContext || 'unknown')}</td></tr>
            <tr><td>Reference electrode location</td><td>${escapeHtml(result.referenceElectrodeLocation || 'unknown')}</td></tr>
            <tr><td>IR-drop compensation method</td><td>${escapeHtml(result.irDropCompensationMethod || 'unknown')}</td></tr>
            <tr><td>Measured IR-drop</td><td>${Number.isFinite(result.measuredIrDropMv) ? `${result.measuredIrDropMv} mV` : 'Not provided'}</td></tr>
            <tr><td>Coupon depolarization</td><td>${Number.isFinite(result.couponDepolarizationMv) ? `${result.couponDepolarizationMv} mV` : 'Not provided'}</td></tr>
            <tr><td>Measured structure potential</td><td>${result.measuredInstantOffPotentialMv} mV</td></tr>
            <tr><td>Measured polarization shift</td><td>${result.simulatedPolarizationShiftMv} mV</td></tr>
            <tr><td>Test points passing</td><td>${result.passingTestPointCount} / ${result.testPointCount}</td></tr>` : ''}
            <tr><td>Foreign-structure relationship</td><td>${escapeHtml(result.interferenceGeometry || 'none')}</td></tr>
            <tr><td>Dominant interference source</td><td>${escapeHtml(result.interferenceSourceType || 'none')}</td></tr>
            <tr><td>Minimum structure separation</td><td>${Number.isFinite(result.foreignStructureSeparationM) ? `${formatFiniteValue(displayDistance(result.foreignStructureSeparationM), 3)} ${distanceUnit}` : 'Not applicable'}</td></tr>
            <tr><td>Parallel exposure length</td><td>${Number.isFinite(result.parallelExposureLengthM) ? `${formatFiniteValue(displayDistance(result.parallelExposureLengthM), 3)} ${distanceUnit}` : 'Not applicable'}</td></tr>
            <tr><td>Potential gradient</td><td>${Number.isFinite(result.measuredPotentialGradientMvPerM) ? `${result.measuredPotentialGradientMvPerM} mV/m` : 'Not provided'}</td></tr>
            <tr><td>Bonding strategy</td><td>${escapeHtml(result.bondingStrategy || 'none')}</td></tr>
            <tr><td>Interference mitigation actions</td><td>${escapeHtml(result.mitigationActionsText || 'Not provided')}</td></tr>
            <tr><td>Verification test date</td><td>${escapeHtml(result.verificationTestDate || 'Not scheduled')}</td></tr>
          </tbody>
        </table>
      </div>
      </details>

      <div id="cp-criteria-results" class="result-group" aria-label="Protection criteria check evidence">
        <h3>Protection Criteria Check Evidence</h3>
        ${criteriaEvidence.overallStatus === 'not-run' ? `
        <div class="result-badge result-badge--not-run">Not evaluated</div>
        <p>No field-measurement evidence was included in this preliminary analysis. The modeled route profile above is a design assumption and is not acceptance evidence.</p>
        <button type="button" class="btn" data-cp-action="enter-criteria-evidence">Enter field evidence</button>
        ` : `
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
        `}
      </div>

      <div id="cp-interference-results" class="result-group cp-interference-result" aria-label="Interference assessment results">
        <h3>Interference Assessment</h3>
        <div class="result-badge ${riskBadgeClass}">
          ${escapeHtml(String(interference.riskLevel || 'low').toUpperCase())} risk (score: ${Number.isFinite(interference.score) ? interference.score : 0})
        </div>
        <p class="cp-interference-summary">${escapeHtml(interference.riskSummary || 'No scored design-stage interference drivers were identified.')}</p>
        <p class="field-hint">Mitigation profile: ${escapeHtml(interference.profile?.label || 'Baseline mitigation profile')}</p>
        <p class="field-hint">Verification test date: ${escapeHtml(interference.verificationTestDate || 'Not scheduled')}</p>
        ${unresolvedHighRisk ? '<p class="field-hint"><strong>High-risk case remains unresolved and blocks compliant status until missing mitigations and verification are completed.</strong></p>' : ''}
        ${activeRiskFactorRows.length
          ? `<section class="cp-interference-drivers" aria-labelledby="cp-active-interference-drivers">
              <h4 id="cp-active-interference-drivers">Active risk drivers (${activeRiskFactorRows.length})</h4>
              ${buildRiskFactorTable(activeRiskFactorRows, 'Active interference risk drivers')}
            </section>`
          : '<p class="field-hint">Active risk drivers: none.</p>'}
        ${riskFactorRows.length
          ? `<details class="cp-result-disclosure">
              <summary>Show complete factor breakdown (${riskFactorRows.length})</summary>
              <div class="cp-result-disclosure__content">
                ${buildRiskFactorTable(riskFactorRows, 'Complete interference risk factor breakdown')}
              </div>
            </details>`
          : ''}
        <p class="field-hint">Required mitigations: ${escapeHtml((interference.requiredMitigations || []).join(', ') || 'None')}</p>
        <p class="field-hint">Implemented mitigations: ${escapeHtml((interference.mitigationActions || []).join(', ') || 'None')}</p>
        ${(interference.missingMitigations || []).length
          ? `<p class="field-hint">Missing mitigations: ${escapeHtml(interference.missingMitigations.join(', '))}</p>`
          : '<p class="field-hint">No missing mitigations for selected profile.</p>'}
      </div>

      <div class="result-group" aria-label="Verification and commissioning plan">
        <h3>Verification and Commissioning Plan</h3>
        <p class="field-hint">Required commissioning tests: ${escapeHtml(verificationRequiredCommissioningTests.join(' | ') || 'Not defined')}</p>
        <p class="field-hint">Monitoring intervals: ${escapeHtml(verificationMonitoringIntervals.join(' | ') || 'Not defined')}</p>
        <p class="field-hint">Trigger thresholds for corrective action: ${escapeHtml(verificationCorrectiveActionThresholds.join(' | ') || 'Not defined')}</p>
      </div>

      ${sensitivityRows.length ? `
      <details id="cp-sensitivity-results" class="cp-result-disclosure">
        <summary>Sensitivity scenarios</summary>
        <div class="table-wrap">
          <table class="data-table" aria-label="Cathodic protection sensitivity table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Design review</th>
              <th>Coating factor</th>
              <th>Required current (A)</th>
              <th>Worst-case segment demand (A)</th>
              ${isIccp ? `
              <th>Required rectifier output</th>
              <th>Source headroom</th>` : `
              <th>Minimum anode mass</th>
              <th>Predicted life (years)</th>
              <th>Safety margin</th>`}
            </tr>
          </thead>
          <tbody>
            ${sensitivityRows.map((scenario) => `
              <tr>
                <td>${escapeHtml(scenario.label)}</td>
                <td>${escapeHtml(scenario.approvalStatus || 'Review required')}</td>
                <td>${formatFiniteValue(scenario.coatingFactor, 4)}</td>
                <td>${formatFiniteValue(scenario.requiredCurrentA, 6)}</td>
                <td>${formatFiniteValue(scenario.worstCaseSegmentDemandA, 6)} (${escapeHtml(scenario.worstCaseSegmentLabel || 'Segment 1')})</td>
                ${isIccp ? `
                <td>${formatFiniteValue(scenario.requiredRectifierCurrentA, 4)} A at ${formatFiniteValue(scenario.requiredRectifierVoltageV, 2)} V</td>
                <td>${formatFiniteValue(scenario.currentHeadroomA, 4)} A / ${formatFiniteValue(scenario.voltageHeadroomV, 2)} V</td>` : `
                <td>${formatFiniteValue(useMetricUnits ? scenario.minimumAnodeMassKg : scenario.minimumAnodeMassLb, 3)} ${massUnit}</td>
                <td>${formatFiniteValue(scenario.predictedLifeYears, 2)}</td>
                <td>${formatFiniteValue(scenario.safetyMarginYears, 2)} years (${formatFiniteValue(scenario.safetyMarginPercent, 2)}%)</td>`}
              </tr>`).join('')}
          </tbody>
          </table>
        </div>
      </details>` : ''}

      ${Array.isArray(result.distributionModel?.segments) && result.distributionModel.segments.length ? `
      <details class="cp-result-disclosure">
        <summary>Current distribution by segment</summary>
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
                <td>${escapeHtml(segment.segment)}</td>
                <td>${escapeHtml(segment.zoneResistivityOhmM)}</td>
                <td>${escapeHtml(segment.effectivenessFactor)}</td>
                <td>${escapeHtml(segment.attenuationFactor)}</td>
              </tr>`).join('')}
          </tbody>
          </table>
        </div>
      </details>` : ''}

      <details id="cp-profile-results" class="cp-result-disclosure" aria-label="CP profile chart overlays">
        <summary>Distribution profiles</summary>
        <div class="cp-result-disclosure__content">
          <p class="field-hint">Profile overlays include base, conservative, and optimized scenarios with threshold-band pass/fail markers.</p>
          <div id="cp-profile-chart-root"></div>
        </div>
      </details>

      ${advisories.length ? `
      <div class="result-group" aria-label="Design improvement advisories">
        <h3>Design Improvement Opportunities</h3>
        <ul>
          ${advisories.map((advisory) => `<li>${escapeHtml(advisory)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <p class="field-hint result-timestamp">Analysis run: ${new Date(result.timestamp).toLocaleString()}</p>
      <p class="field-hint">Use “Download report data (JSON)” above to save the traceable design-basis package.</p>
    </section>`;

  const profileRoot = root.querySelector('#cp-profile-chart-root');
  if (profileRoot) {
    cpProfilesController = initCpProfiles({
      root: profileRoot,
      profileData,
      unitSystem: normalizeUnitSystem(result.units),
      onSegmentHover: (segmentIndex) => {
        cpLayoutCanvasController?.setExternalHoverSegment(segmentIndex);
      }
    });
  }
  if (hasComparisonBaseline) {
    renderComparisonCanvases(root, result, comparisonBaseline);
  }
}

function countCriteriaPasses(result) {
  const rows = Array.isArray(result?.criteriaCheckEvidence?.criteriaResults) ? result.criteriaCheckEvidence.criteriaResults : [];
  return rows.filter((row) => row?.status === 'pass').length;
}


function coerceFiniteNumber(value, fallback = 0, { min = -Infinity, max = Infinity } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function sanitizeGeometryPoint(point, fallbackX, fallbackY) {
  if (!point || typeof point !== 'object') {
    return { x: fallbackX, y: fallbackY };
  }
  return {
    x: coerceFiniteNumber(point.x, fallbackX, { min: -5000, max: 5000 }),
    y: coerceFiniteNumber(point.y, fallbackY, { min: -5000, max: 5000 })
  };
}

function sanitizeLayoutGeometry(geometry, fallbackGeometry) {
  if (!geometry || typeof geometry !== 'object') {
    return fallbackGeometry;
  }
  const maxItems = 100;
  const structureSegments = Array.isArray(geometry.structureSegments)
    ? geometry.structureSegments.slice(0, maxItems).map((segment, index) => ({
      x1: coerceFiniteNumber(segment?.x1, fallbackGeometry.structureSegments[index % fallbackGeometry.structureSegments.length].x1, { min: -5000, max: 5000 }),
      y1: coerceFiniteNumber(segment?.y1, fallbackGeometry.structureSegments[index % fallbackGeometry.structureSegments.length].y1, { min: -5000, max: 5000 }),
      x2: coerceFiniteNumber(segment?.x2, fallbackGeometry.structureSegments[index % fallbackGeometry.structureSegments.length].x2, { min: -5000, max: 5000 }),
      y2: coerceFiniteNumber(segment?.y2, fallbackGeometry.structureSegments[index % fallbackGeometry.structureSegments.length].y2, { min: -5000, max: 5000 })
    }))
    : fallbackGeometry.structureSegments;
  const anodes = Array.isArray(geometry.anodes)
    ? geometry.anodes.slice(0, maxItems).map((anode, index) => sanitizeGeometryPoint(anode, fallbackGeometry.anodes[index % fallbackGeometry.anodes.length].x, fallbackGeometry.anodes[index % fallbackGeometry.anodes.length].y))
    : fallbackGeometry.anodes;
  const testPoints = Array.isArray(geometry.testPoints)
    ? geometry.testPoints.slice(0, maxItems).map((point, index) => sanitizeGeometryPoint(point, fallbackGeometry.testPoints[index % fallbackGeometry.testPoints.length].x, fallbackGeometry.testPoints[index % fallbackGeometry.testPoints.length].y))
    : fallbackGeometry.testPoints;
  const referenceElectrode = sanitizeGeometryPoint(
    geometry.referenceElectrode,
    fallbackGeometry.referenceElectrode.x,
    fallbackGeometry.referenceElectrode.y
  );
  return { structureSegments, anodes, testPoints, referenceElectrode };
}

function sanitizeComparisonStudy(study) {
  const normalized = normalizeSavedStudy(study);
  if (!normalized) {
    return null;
  }
  const validSourceOutcome = normalized.anodeTypeSystem === 'iccp'
    ? Number.isFinite(Number(normalized.iccpSizing?.requiredRectifierCurrentA))
    : Number.isFinite(Number(normalized.predictedLifeYears));
  if (!Number.isFinite(Number(normalized.requiredCurrentA)) || !validSourceOutcome) {
    return null;
  }
  const fallbackGeometry = resolveLayoutGeometry({ ...normalized, cpLayout: null });
  return {
    ...normalized,
    requiredCurrentA: coerceFiniteNumber(normalized.requiredCurrentA, 0, { min: 0, max: 1e6 }),
    predictedLifeYears: normalized.anodeTypeSystem === 'iccp'
      ? null
      : coerceFiniteNumber(normalized.predictedLifeYears, 0, { min: 0, max: 1e4 }),
    interferenceAssessment: {
      ...(normalized.interferenceAssessment && typeof normalized.interferenceAssessment === 'object' ? normalized.interferenceAssessment : {}),
      score: coerceFiniteNumber(normalized.interferenceAssessment?.score, 0, { min: 0, max: 100 })
    },
    cpLayout: {
      ...(normalized.cpLayout && typeof normalized.cpLayout === 'object' ? normalized.cpLayout : {}),
      geometry: sanitizeLayoutGeometry(normalized.cpLayout?.geometry, fallbackGeometry)
    }
  };
}

function formatDelta(value, unit = '') {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${roundTo(value, 2)}${unit ? ` ${unit}` : ''}`;
}

function formatFiniteValue(value, decimals = null) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 'n/a';
  }
  if (Number.isInteger(decimals) && decimals >= 0) {
    return parsed.toFixed(decimals);
  }
  return String(parsed);
}

function buildComparisonPanelMarkup(activeStudy, baselineStudy) {
  const activeCriteriaPasses = countCriteriaPasses(activeStudy);
  const baselineCriteriaPasses = countCriteriaPasses(baselineStudy);
  const requiredCurrentDelta = activeStudy.requiredCurrentA - baselineStudy.requiredCurrentA;
  const compareIccpCapacity = activeStudy.anodeTypeSystem === 'iccp' && baselineStudy.anodeTypeSystem === 'iccp';
  const sourceCapacityDelta = compareIccpCapacity
    ? activeStudy.iccpSizing.currentHeadroomA - baselineStudy.iccpSizing.currentHeadroomA
    : activeStudy.predictedLifeYears - baselineStudy.predictedLifeYears;
  const riskDelta = (activeStudy.interferenceAssessment?.score || 0) - (baselineStudy.interferenceAssessment?.score || 0);
  const criteriaPassDelta = activeCriteriaPasses - baselineCriteriaPasses;
  const baselineTime = baselineStudy.timestamp ? new Date(baselineStudy.timestamp).toLocaleString() : 'Unknown';

  return `
    <div class="result-group cp-compare-group">
      <h3>Compare configurations</h3>
      <p class="field-hint">Configuration A is the active result. Configuration B is the locked baseline saved on ${escapeHtml(baselineTime)}.</p>
      <div class="cp-compare-actions">
        <button type="button" class="btn" data-cp-action="show-compare">Compare configurations</button>
        <button type="button" class="btn" data-cp-action="save-baseline">Replace baseline with current</button>
        <button type="button" class="btn" data-cp-action="import-compare">Import older saved CP study</button>
        <button type="button" class="btn" data-cp-action="promote-baseline">Promote B to active design</button>
      </div>
      <input type="file" id="cp-compare-import-input" class="hidden" accept=".ctr.json,.json,application/json" title="Import comparison baseline">
      <div id="cp-compare-panel" class="cp-compare-panel" hidden>
        <div class="cp-delta-card-grid">
          <article class="cp-delta-card">
            <h4>Required current Δ</h4>
            <p>${formatDelta(requiredCurrentDelta, 'A')}</p>
            <small>A: ${escapeHtml(String(activeStudy.requiredCurrentA))} A · B: ${escapeHtml(String(baselineStudy.requiredCurrentA))} A</small>
          </article>
          <article class="cp-delta-card">
            <h4>${compareIccpCapacity ? 'Current headroom Δ' : 'Predicted life Δ'}</h4>
            <p>${formatDelta(sourceCapacityDelta, compareIccpCapacity ? 'A' : 'years')}</p>
            <small>${compareIccpCapacity
              ? `A: ${escapeHtml(String(activeStudy.iccpSizing.currentHeadroomA))} A · B: ${escapeHtml(String(baselineStudy.iccpSizing.currentHeadroomA))} A`
              : `A: ${escapeHtml(String(activeStudy.predictedLifeYears))} y · B: ${escapeHtml(String(baselineStudy.predictedLifeYears))} y`}</small>
          </article>
          <article class="cp-delta-card">
            <h4>Risk score Δ</h4>
            <p>${formatDelta(riskDelta)}</p>
            <small>A: ${escapeHtml(String(activeStudy.interferenceAssessment?.score || 0))} · B: ${escapeHtml(String(baselineStudy.interferenceAssessment?.score || 0))}</small>
          </article>
          <article class="cp-delta-card">
            <h4>Criteria pass count Δ</h4>
            <p>${formatDelta(criteriaPassDelta)}</p>
            <small>A: ${activeCriteriaPasses} · B: ${baselineCriteriaPasses}</small>
          </article>
        </div>
        <div class="cp-compare-canvas-toolbar" role="group" aria-label="Comparison canvas zoom controls">
          <button type="button" class="btn" data-cp-compare-zoom="in">Zoom +</button>
          <button type="button" class="btn" data-cp-compare-zoom="out">Zoom −</button>
          <button type="button" class="btn" data-cp-compare-zoom="fit">Fit</button>
        </div>
        <div class="cp-compare-canvas-grid">
          <div>
            <h4>Configuration A (Active design)</h4>
            <div class="cp-compare-canvas" id="cp-compare-canvas-a"></div>
          </div>
          <div>
            <h4>Configuration B (Imported baseline)</h4>
            <div class="cp-compare-canvas" id="cp-compare-canvas-b"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderComparisonCanvases(root, activeStudy, baselineStudy) {
  const canvasA = root.querySelector('#cp-compare-canvas-a');
  const canvasB = root.querySelector('#cp-compare-canvas-b');
  if (!canvasA || !canvasB) return;

  const activeLayout = resolveLayoutGeometry(activeStudy);
  const baselineLayout = resolveLayoutGeometry(baselineStudy);

  const renderCanvas = (container, currentLayout, otherLayout, label) => {
    const zoom = cpComparisonState.zoomScale;
    const groupTransform = `translate(90 40) scale(${zoom})`;
    const segmentMarkup = currentLayout.structureSegments.map((segment, index) => {
      const colorClass = resolveSegmentDiffClass(segment, otherLayout.structureSegments[index]);
      const hoverClass = cpComparisonState.hoveredSegmentIndex === index ? 'is-hovered' : '';
      return `
        <line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" class="cp-layout-structure-line ${colorClass} ${hoverClass}" data-cp-compare-segment="${index}"></line>
      `;
    }).join('');
    const anodeMarkup = currentLayout.anodes.map((anode, index) => {
      const other = otherLayout.anodes[index];
      const changed = !other || Math.abs(anode.x - other.x) > 8 || Math.abs(anode.y - other.y) > 8;
      return `<circle cx="${anode.x}" cy="${anode.y}" r="8" class="cp-layout-anode-node ${changed ? 'cp-compare-diff-node' : ''}"></circle>`;
    }).join('');
    const testMarkup = currentLayout.testPoints.map((point, index) => {
      const other = otherLayout.testPoints[index];
      const changed = !other || Math.abs(point.x - other.x) > 8 || Math.abs(point.y - other.y) > 8;
      return `<rect x="${point.x - 6}" y="${point.y - 6}" width="12" height="12" class="cp-layout-test-node ${changed ? 'cp-compare-diff-node' : ''}"></rect>`;
    }).join('');
    const refChanged = !otherLayout.referenceElectrode
      || Math.abs(currentLayout.referenceElectrode.x - otherLayout.referenceElectrode.x) > 8
      || Math.abs(currentLayout.referenceElectrode.y - otherLayout.referenceElectrode.y) > 8;
    container.innerHTML = `
      <svg viewBox="0 0 1200 500" role="img" aria-label="${escapeHtml(label)} comparison canvas">
        <g transform="${groupTransform}">
          <rect x="0" y="0" width="980" height="380" class="cp-layout-background"></rect>
          ${segmentMarkup}
          ${anodeMarkup}
          ${testMarkup}
          <circle cx="${currentLayout.referenceElectrode.x}" cy="${currentLayout.referenceElectrode.y}" r="9" class="cp-layout-reference-node ${refChanged ? 'cp-compare-diff-node' : ''}"></circle>
        </g>
      </svg>
    `;
  };

  renderCanvas(canvasA, activeLayout, baselineLayout, 'Configuration A');
  renderCanvas(canvasB, baselineLayout, activeLayout, 'Configuration B');
}

function resolveSegmentDiffClass(segment, otherSegment) {
  if (!otherSegment) {
    return 'cp-compare-diff-segment';
  }
  const distanceCurrent = Math.abs(segment.x2 - segment.x1);
  const distanceOther = Math.abs(otherSegment.x2 - otherSegment.x1);
  return Math.abs(distanceCurrent - distanceOther) > 16 ? 'cp-compare-diff-segment' : '';
}

function resolveLayoutGeometry(study) {
  if (study?.cpLayout?.geometry) {
    return study.cpLayout.geometry;
  }
  const numberOfAnodes = Math.max(1, Math.round(study?.numberOfAnodes || 1));
  const anodeSpacingM = Math.max(0.1, Number(study?.anodeSpacingM || 1));
  const anodeDistanceM = Math.max(0.1, Number(study?.anodeDistanceToStructureM || 1));
  const testPointCount = Math.max(1, Math.round(study?.testPointCount || 1));
  const structureLengthM = Math.max(60, (numberOfAnodes - 1) * anodeSpacingM + 80);
  const pxPerMeter = 9.5;
  const structureStartX = 80;
  const structureStartY = 210;
  const structureLengthPx = structureLengthM * pxPerMeter;
  const segmentLengthPx = structureLengthPx / 4;
  const structureSegments = Array.from({ length: 4 }, (_, index) => ({
    x1: structureStartX + segmentLengthPx * index,
    y1: structureStartY,
    x2: structureStartX + segmentLengthPx * (index + 1),
    y2: structureStartY
  }));
  const anodes = Array.from({ length: numberOfAnodes }, (_, index) => ({
    x: structureStartX + 20 + (index * anodeSpacingM * pxPerMeter),
    y: structureStartY - (anodeDistanceM * pxPerMeter)
  }));
  const spacing = testPointCount > 1 ? (structureLengthPx - 40) / (testPointCount - 1) : 0;
  const testPoints = Array.from({ length: testPointCount }, (_, index) => ({
    x: structureStartX + 20 + spacing * index,
    y: structureStartY + 46
  }));
  const referenceElectrode = { x: structureStartX + 180, y: structureStartY + 70 };
  return { structureSegments, anodes, testPoints, referenceElectrode };
}

function parseComparisonStudyFromImport(rawText) {
  const parsed = JSON.parse(rawText);
  if (parsed?.studyResults?.cathodicProtection) {
    return sanitizeComparisonStudy(parsed.studyResults.cathodicProtection);
  }
  if (parsed?.cathodicProtection) {
    return sanitizeComparisonStudy(parsed.cathodicProtection);
  }
  if (parsed?.requiredCurrentA && (parsed?.predictedLifeYears || parsed?.iccpSizing?.requiredRectifierCurrentA)) {
    return sanitizeComparisonStudy(parsed);
  }
  return null;
}

function buildDesignAdvisories(result, sensitivityRows, modeledProfileSummary = null) {
  const notes = [];
  const conservativeScenario = sensitivityRows.find((scenario) => scenario.key === 'high-coating');

  if (modeledProfileSummary?.failed > 0) {
    const failureSummary = modeledProfileSummary.checks
      .filter((check) => check.failed > 0)
      .map((check) => `${check.failed}/${check.total} ${check.label}`)
      .join(', ');
    notes.push(`Base modeled route thresholds need review (${failureSummary}). Open Distribution profiles to locate the affected segments before accepting the design.`);
  }

  if (result.anodeTypeSystem === 'iccp') {
    if (result.iccpSizing?.currentCapacityStatus === 'fail') {
      notes.push('The entered rectifier current rating is below the preliminary reserved-current requirement; increase the rating or reduce demand.');
    }
    if (result.iccpSizing?.voltageCapacityStatus === 'fail') {
      notes.push('The entered rectifier voltage rating is below the groundbed circuit requirement; review groundbed resistance, cable losses, and source voltage.');
    }
    if (conservativeScenario?.approvalStatus === 'Review required') {
      notes.push('The high coating uncertainty band exceeds the entered rectifier capacity; add source headroom or reduce uncertainty through field condition data.');
    }
  } else {
    if (result.safetyMarginYears < 0) {
      notes.push('Installed anode mass is below target-life demand; increase installed mass or reduce coating breakdown assumptions.');
    } else if (result.safetyMarginPercent < 15) {
      notes.push('Life margin is modest; consider adding design contingency to improve resilience against coating degradation uncertainty.');
    }

    if (conservativeScenario && conservativeScenario.safetyMarginYears < 0) {
      notes.push('The high coating uncertainty band fails target life; add contingency mass or plan earlier replacement intervals.');
    }
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

  const standardsNeedConfiguration = CP_STANDARDS_PROFILE.targetReferences
    .some((reference) => String(reference.edition).includes('not configured'));
  const sections = [
    basis.standardsProfile,
    basis.currentDensitySelection,
    basis.polarizationCriteria,
    basis.anodeCapacityUtilization,
    basis.engineeringJudgmentAssumptions,
    basis.interferenceAssessment
  ].filter(Boolean);

  root.innerHTML = `
    ${standardsNeedConfiguration ? `
      <div class="cp-standards-warning" role="note">
        <strong>Standards editions are not configured.</strong>
        <span>Select and document the exact project-adopted editions before issuing the calculation package.</span>
      </div>
    ` : ''}
    <div class="cp-basis-grid">
      ${sections.map((section) => `
        <article id="${escapeHtml(section.id)}" class="cp-basis-card">
          <h3>${escapeHtml(section.label)}</h3>
          <p>${escapeHtml(section.summary)}</p>
          ${section.equation
            ? `<code>${escapeHtml(section.equation)}</code>`
            : ''}
          ${section.secondaryEquation
            ? `<code>${escapeHtml(section.secondaryEquation)}</code>`
            : ''}
          ${Array.isArray(section.outputs) && section.outputs.length
            ? `<div class="cp-basis-outputs"><strong>Affects:</strong> ${section.outputs.map((output) => `<span>${escapeHtml(output)}</span>`).join('')}</div>`
            : ''}
          <div class="field-hint"><strong>References:</strong> ${escapeHtml(section.standards.join(', '))}</div>
          ${Array.isArray(section.requiredChecks) && section.requiredChecks.length
            ? `<div class="field-hint"><strong>Checks:</strong> ${escapeHtml(section.requiredChecks.join(', '))}</div>`
            : ''}
          ${Array.isArray(section.deliverables) && section.deliverables.length
            ? `<div class="field-hint"><strong>Deliverables:</strong> ${escapeHtml(section.deliverables.join(', '))}</div>`
            : ''}
          ${Array.isArray(section.assumptions) && section.assumptions.length
            ? `<details><summary>Assumptions</summary><ul>${section.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul></details>`
            : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderComplianceStatusPanel(root, requiredChecks = {}, lastEvaluatedAt = null, compliance = {}) {
  if (!root) return;
  const normalizedRequiredChecks = requiredChecks && typeof requiredChecks === 'object' ? requiredChecks : {};

  const rows = getRequiredComplianceChecks().map((checkKey) => {
    const check = CP_STANDARDS_PROFILE.checks[checkKey];
    const status = normalizedRequiredChecks[checkKey] || 'not-run';
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
  if (!COMMISSIONING_CHECKLIST_ITEMS.length) {
    return false;
  }
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
    modeledReferencePotentialMv: result.modeledReferencePotentialMv,
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
            safetyMarginYears: result.safetyMarginYears,
            iccpSizing: result.iccpSizing || null
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
