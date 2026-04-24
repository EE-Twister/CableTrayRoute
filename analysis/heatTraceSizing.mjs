/**
 * Electric Heat Trace Sizing
 *
 * Simplified sizing workflow for process temperature maintenance and freeze protection:
 *   1. Validate pipe, thermal, and environment inputs.
 *   2. Compute insulation conduction resistance (cylindrical wall).
 *   3. Apply outside-film resistance with environment/wind adjustment.
 *   4. Apply pipe-material correction factor and design safety margin.
 *   5. Select nearest standard heat-trace cable rating.
 */

/** Nominal Pipe Size (NPS) to outside diameter map (inches). */
export const NPS_TO_OD_IN = {
  '0.5': 0.84,
  '0.75': 1.05,
  '1': 1.315,
  '1.25': 1.66,
  '1.5': 1.9,
  '2': 2.375,
  '2.5': 2.875,
  '3': 3.5,
  '4': 4.5,
  '5': 5.563,
  '6': 6.625,
  '8': 8.625,
  '10': 10.75,
  '12': 12.75,
};

/**
 * Environment multipliers for external heat transfer.
 * >1 increases losses (more severe environment), <1 decreases losses.
 */
export const ENVIRONMENT_MULTIPLIERS = {
  'indoor-still': 0.85,
  'outdoor-sheltered': 1.0,
  'outdoor-windy': 1.25,
  'hazardous-area': 1.1,
  freezer: 1.35,
  buried: 1.0,
};

/** Material correction factors for warm-up / hold behavior. */
export const PIPE_MATERIAL_FACTORS = {
  carbonSteel: 1.1,
  stainlessSteel: 1.05,
  pvc: 0.9,
  hdpe: 0.88,
  copper: 1.0,
  aluminum: 1.0,
};

/** Standard self-regulating / constant-watt cable outputs (W/ft at nominal conditions). */
export const STANDARD_HEAT_TRACE_RATINGS_W_PER_FT = [
  3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50,
];

export const HEAT_TRACE_CABLE_TYPES = {
  selfRegulating: {
    label: 'Self-regulating',
    selectionNote: 'Screening uses nominal W/ft. Verify temperature-dependent output curve, startup current, and maximum circuit length with manufacturer data.',
  },
  constantWattage: {
    label: 'Constant wattage',
    selectionNote: 'Output is treated as fixed W/ft. Confirm controller strategy, sheath temperature, and over-temperature protection.',
  },
  powerLimiting: {
    label: 'Power-limiting / zone',
    selectionNote: 'Screening uses nominal W/ft. Verify zone length, startup current, and manufacturer-specific output tables.',
  },
  mineralInsulated: {
    label: 'Mineral insulated',
    selectionNote: 'Screening uses nominal W/ft. Final design requires manufacturer resistance design, bend-radius, termination, and sheath temperature checks.',
  },
};

export const HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES = {
  valve: {
    label: 'Valve',
    defaultEquivalentLengthFt: 5,
  },
  flangePair: {
    label: 'Flange pair',
    defaultEquivalentLengthFt: 2,
  },
  pipeSupport: {
    label: 'Pipe support',
    defaultEquivalentLengthFt: 1,
  },
  instrumentTap: {
    label: 'Instrument tap',
    defaultEquivalentLengthFt: 2,
  },
  custom: {
    label: 'Custom',
    defaultEquivalentLengthFt: 0,
  },
};

/** Default thermal conductivity for insulation (W/m-K), typical for mineral wool / foam ranges. */
export const DEFAULT_INSULATION_K_W_PER_MK = 0.04;

/** Representative insulation thermal conductivity values (W/m-K). Lower values reduce heat dissipation. */
export const INSULATION_TYPE_K_W_PER_MK = {
  mineralWool: 0.04,
  closedCellFoam: 0.028,
  fiberglass: 0.042,
  calciumSilicate: 0.06,
  aerogelBlanket: 0.021,
};

const INCH_TO_M = 0.0254;
const FT_TO_M = 0.3048;
const DEFAULT_MAX_CIRCUIT_LENGTH_FT = 500;
const NEAR_LIMIT_UTILIZATION_THRESHOLD = 0.85;
const DEFAULT_SOIL_THERMAL_CONDUCTIVITY_W_PER_MK = 1.2;
const DEFAULT_BURIAL_DEPTH_FT = 3;
const DEFAULT_HEAT_TRACE_CABLE_TYPE = 'selfRegulating';
const DEFAULT_VOLTAGE_V = 240;
const DEFAULT_TRACE_RUN_COUNT = 1;
const MAX_TRACE_RUN_COUNT = 4;

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite number greater than zero`);
  }
}

function assertFiniteComputed(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number greater than or equal to zero`);
  }
}

function classifyCircuitUtilization(utilizationRatio) {
  assertFiniteComputed(utilizationRatio, 'circuitUtilizationRatio');
  if (utilizationRatio > 1) return 'overLimit';
  if (utilizationRatio >= NEAR_LIMIT_UTILIZATION_THRESHOLD) return 'nearLimit';
  return 'withinLimit';
}

function generatePipeTempProfile({
  lineLengthFt,
  maintainTempC,
  ambientTempC,
  circuitUtilizationRatio,
  points = 11,
}) {
  assertFinitePositive(lineLengthFt, 'lineLengthFt');
  assertFiniteComputed(maintainTempC, 'maintainTempC');
  assertFiniteComputed(ambientTempC, 'ambientTempC');
  assertFiniteComputed(circuitUtilizationRatio, 'circuitUtilizationRatio');

  const profile = [];
  const stepFt = lineLengthFt / (points - 1);
  const utilizationClamp = Math.max(0, Math.min(circuitUtilizationRatio, 1.25));
  const expectedTailDropC = (maintainTempC - ambientTempC) * 0.15 * utilizationClamp;

  for (let i = 0; i < points; i += 1) {
    const distanceFt = stepFt * i;
    const progress = i / (points - 1);
    const expectedPipeTempC = maintainTempC - expectedTailDropC * progress;

    profile.push({
      distanceFt: round(distanceFt, 2),
      expectedPipeTempC: round(expectedPipeTempC, 2),
    });
  }

  return profile;
}

/** Resolve pipe outside diameter in inches from direct OD or NPS. */
export function resolvePipeOdIn({ pipeOdIn, pipeNps }) {
  if (pipeOdIn != null) {
    assertFinitePositive(pipeOdIn, 'pipeOdIn');
    return pipeOdIn;
  }

  if (pipeNps == null) {
    throw new Error('Provide either pipeOdIn or pipeNps');
  }

  const npsKey = String(pipeNps);
  const mapped = NPS_TO_OD_IN[npsKey];
  if (!mapped) {
    throw new Error(`Unsupported pipeNps "${pipeNps}". Add a valid NPS or pass pipeOdIn directly.`);
  }
  return mapped;
}

export function normalizeHeatTraceComponentAllowances(componentAllowances = []) {
  if (componentAllowances == null) return [];
  if (!Array.isArray(componentAllowances)) {
    throw new Error('componentAllowances must be an array');
  }

  return componentAllowances.map((item, index) => {
    const type = String(item?.type || 'custom');
    if (!Object.prototype.hasOwnProperty.call(HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES, type)) {
      throw new Error(`Unsupported heat trace component allowance type "${type}"`);
    }
    const typeInfo = HEAT_TRACE_COMPONENT_ALLOWANCE_TYPES[type];
    const quantity = Number(item?.quantity ?? 0);
    const equivalentLengthFtEach = Number(
      item?.equivalentLengthFtEach
        ?? item?.equivalentLengthFt
        ?? typeInfo.defaultEquivalentLengthFt
    );
    assertFiniteNonNegative(quantity, `componentAllowances[${index}].quantity`);
    assertFiniteNonNegative(equivalentLengthFtEach, `componentAllowances[${index}].equivalentLengthFtEach`);

    return {
      id: String(item?.id || `component-${index + 1}`),
      type,
      label: String(item?.label || typeInfo.label),
      quantity: round(quantity, 3),
      equivalentLengthFtEach: round(equivalentLengthFtEach, 3),
      totalEquivalentLengthFt: round(quantity * equivalentLengthFtEach, 3),
    };
  });
}

/** Validate core input object and return normalized numeric fields. */
export function validateHeatTraceInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('inputs must be an object');
  }

  const {
    pipeNps,
    pipeOdIn,
    insulationThicknessIn,
    lineLengthFt,
    maintainTempC,
    ambientTempC,
    windSpeedMph = 0,
    safetyMarginPct = 10,
    maxCircuitLengthFt = DEFAULT_MAX_CIRCUIT_LENGTH_FT,
    pipeMaterial = 'carbonSteel',
    environment = 'outdoor-sheltered',
    insulationType = 'mineralWool',
    heatTraceCableType = DEFAULT_HEAT_TRACE_CABLE_TYPE,
    traceRunCount = DEFAULT_TRACE_RUN_COUNT,
    componentAllowances = [],
    voltageV = DEFAULT_VOLTAGE_V,
    insulationK,
    soilThermalConductivityWPerMK = DEFAULT_SOIL_THERMAL_CONDUCTIVITY_W_PER_MK,
    burialDepthFt = DEFAULT_BURIAL_DEPTH_FT,
  } = inputs;

  const resolvedPipeOdIn = resolvePipeOdIn({ pipeNps, pipeOdIn });

  assertFinitePositive(insulationThicknessIn, 'insulationThicknessIn');
  assertFinitePositive(lineLengthFt, 'lineLengthFt');
  if (!Object.prototype.hasOwnProperty.call(INSULATION_TYPE_K_W_PER_MK, insulationType)) {
    throw new Error(`Unsupported insulationType "${insulationType}"`);
  }

  const resolvedInsulationK = insulationK ?? INSULATION_TYPE_K_W_PER_MK[insulationType] ?? DEFAULT_INSULATION_K_W_PER_MK;
  assertFinitePositive(resolvedInsulationK, 'insulationK');

  if (!Number.isFinite(maintainTempC) || !Number.isFinite(ambientTempC)) {
    throw new Error('maintainTempC and ambientTempC must be finite numbers');
  }
  if (maintainTempC <= ambientTempC) {
    throw new Error('maintainTempC must be greater than ambientTempC for heat-loss sizing');
  }

  if (!Number.isFinite(windSpeedMph) || windSpeedMph < 0) {
    throw new Error('windSpeedMph must be a finite number ≥ 0');
  }
  if (!Number.isFinite(safetyMarginPct) || safetyMarginPct < 0 || safetyMarginPct > 100) {
    throw new Error('safetyMarginPct must be between 0 and 100');
  }
  assertFinitePositive(maxCircuitLengthFt, 'maxCircuitLengthFt');

  if (!Object.prototype.hasOwnProperty.call(ENVIRONMENT_MULTIPLIERS, environment)) {
    throw new Error(`Unsupported environment "${environment}"`);
  }

  if (!Object.prototype.hasOwnProperty.call(PIPE_MATERIAL_FACTORS, pipeMaterial)) {
    throw new Error(`Unsupported pipeMaterial "${pipeMaterial}"`);
  }
  if (!Object.prototype.hasOwnProperty.call(HEAT_TRACE_CABLE_TYPES, heatTraceCableType)) {
    throw new Error(`Unsupported heatTraceCableType "${heatTraceCableType}"`);
  }
  if (!Number.isInteger(Number(traceRunCount)) || Number(traceRunCount) < 1 || Number(traceRunCount) > MAX_TRACE_RUN_COUNT) {
    throw new Error(`traceRunCount must be an integer between 1 and ${MAX_TRACE_RUN_COUNT}`);
  }
  assertFinitePositive(Number(voltageV), 'voltageV');

  if (environment === 'outdoor-windy' && windSpeedMph <= 0) {
    throw new Error('windSpeedMph must be > 0 for outdoor-windy environment');
  }
  if (environment === 'buried') {
    assertFinitePositive(soilThermalConductivityWPerMK, 'soilThermalConductivityWPerMK');
    assertFinitePositive(burialDepthFt, 'burialDepthFt');
  }
  const normalizedComponentAllowances = normalizeHeatTraceComponentAllowances(componentAllowances);

  return {
    pipeNps,
    pipeOdIn: resolvedPipeOdIn,
    insulationThicknessIn,
    lineLengthFt,
    maintainTempC,
    ambientTempC,
    windSpeedMph,
    safetyMarginPct,
    maxCircuitLengthFt,
    pipeMaterial,
    environment,
    insulationType,
    heatTraceCableType,
    traceRunCount: Number(traceRunCount),
    componentAllowances: normalizedComponentAllowances,
    voltageV: Number(voltageV),
    insulationK: resolvedInsulationK,
    soilThermalConductivityWPerMK,
    burialDepthFt,
  };
}

/** Cylindrical conduction resistance through insulation for unit length (K·m/W). */
export function cylindricalInsulationResistance({ pipeOdIn, insulationThicknessIn, insulationK }) {
  assertFinitePositive(pipeOdIn, 'pipeOdIn');
  assertFinitePositive(insulationThicknessIn, 'insulationThicknessIn');
  assertFinitePositive(insulationK, 'insulationK');

  const rInnerM = (pipeOdIn * INCH_TO_M) / 2;
  const rOuterM = rInnerM + insulationThicknessIn * INCH_TO_M;

  return Math.log(rOuterM / rInnerM) / (2 * Math.PI * insulationK);
}

/** Approximate external film resistance for unit length (K·m/W). */
export function externalFilmResistance({
  pipeOdIn,
  insulationThicknessIn,
  environment,
  windSpeedMph = 0,
  soilThermalConductivityWPerMK = DEFAULT_SOIL_THERMAL_CONDUCTIVITY_W_PER_MK,
  burialDepthFt = DEFAULT_BURIAL_DEPTH_FT,
}) {
  assertFinitePositive(pipeOdIn, 'pipeOdIn');
  assertFinitePositive(insulationThicknessIn, 'insulationThicknessIn');

  const envFactor = ENVIRONMENT_MULTIPLIERS[environment];
  if (!envFactor) throw new Error(`Unsupported environment "${environment}"`);
  if (!Number.isFinite(windSpeedMph) || windSpeedMph < 0) throw new Error('windSpeedMph must be ≥ 0');

  const rOuterM = (pipeOdIn * INCH_TO_M) / 2 + insulationThicknessIn * INCH_TO_M;
  if (environment === 'buried') {
    assertFinitePositive(soilThermalConductivityWPerMK, 'soilThermalConductivityWPerMK');
    assertFinitePositive(burialDepthFt, 'burialDepthFt');
    const burialDepthM = burialDepthFt * FT_TO_M;
    const effectiveSoilRadiusM = Math.max(rOuterM * 1.2, burialDepthM + rOuterM);
    return Math.log(effectiveSoilRadiusM / rOuterM) / (2 * Math.PI * soilThermalConductivityWPerMK);
  }

  const baseH = 7; // W/m2-K representative natural convection + radiation
  let windBoost = 0;
  if (environment === 'outdoor-windy') {
    windBoost = 0.5 * windSpeedMph;
  } else if (environment === 'outdoor-sheltered') {
    windBoost = 0.2 * windSpeedMph;
  } else if (environment === 'hazardous-area') {
    windBoost = 0.15 * windSpeedMph;
  }
  const hEff = Math.max(2, (baseH + windBoost) * envFactor);

  return 1 / (hEff * 2 * Math.PI * rOuterM);
}

/** Select nearest standard cable rating equal to or above required W/ft. */
export function selectStandardHeatTraceRating(requiredWPerFt) {
  assertFinitePositive(requiredWPerFt, 'requiredWPerFt');

  const selected = STANDARD_HEAT_TRACE_RATINGS_W_PER_FT.find(r => r >= requiredWPerFt)
    ?? STANDARD_HEAT_TRACE_RATINGS_W_PER_FT[STANDARD_HEAT_TRACE_RATINGS_W_PER_FT.length - 1];

  const idx = STANDARD_HEAT_TRACE_RATINGS_W_PER_FT.indexOf(selected);
  const options = STANDARD_HEAT_TRACE_RATINGS_W_PER_FT.slice(
    Math.max(0, idx - 1),
    Math.min(STANDARD_HEAT_TRACE_RATINGS_W_PER_FT.length, idx + 2)
  );

  return { selectedWPerFt: selected, options };
}

/**
 * Run complete heat-trace sizing analysis.
 *
 * @param {object} inputs
 * @returns {object}
 */
export function runHeatTraceSizingAnalysis(inputs) {
  const normalized = validateHeatTraceInputs(inputs);
  const {
    pipeOdIn,
    insulationThicknessIn,
    lineLengthFt,
    maintainTempC,
    ambientTempC,
    windSpeedMph,
    safetyMarginPct,
    maxCircuitLengthFt,
    pipeMaterial,
    environment,
    heatTraceCableType,
    traceRunCount,
    componentAllowances,
    voltageV,
    insulationK,
    soilThermalConductivityWPerMK,
    burialDepthFt,
  } = normalized;

  const warnings = [];
  const deltaT = maintainTempC - ambientTempC;

  const rCond = cylindricalInsulationResistance({ pipeOdIn, insulationThicknessIn, insulationK });
  const rExt = externalFilmResistance({
    pipeOdIn,
    insulationThicknessIn,
    environment,
    windSpeedMph,
    soilThermalConductivityWPerMK,
    burialDepthFt,
  });
  const rTotal = rCond + rExt;

  const baseLossWPerM = deltaT / rTotal;
  const conductionLossShare = rCond / rTotal;
  const externalFilmLossShare = rExt / rTotal;
  const baseLossConductionComponentWPerM = baseLossWPerM * conductionLossShare;
  const baseLossExternalFilmComponentWPerM = baseLossWPerM * externalFilmLossShare;

  const materialFactor = PIPE_MATERIAL_FACTORS[pipeMaterial];
  const safetyFactor = 1 + safetyMarginPct / 100;

  const requiredWPerM = baseLossWPerM * materialFactor * safetyFactor;
  const requiredWPerFt = requiredWPerM * FT_TO_M;
  const totalCircuitWatts = requiredWPerFt * lineLengthFt;

  const rating = selectStandardHeatTraceRating(requiredWPerFt);
  const componentAllowanceLengthFt = componentAllowances.reduce((sum, item) => sum + item.totalEquivalentLengthFt, 0);
  const effectiveTraceLengthFt = lineLengthFt + componentAllowanceLengthFt;
  const installedWPerFt = rating.selectedWPerFt * traceRunCount;
  const installedTotalWatts = installedWPerFt * effectiveTraceLengthFt;
  const installedLoadAmps = installedTotalWatts / voltageV;
  const coverageRatio = requiredWPerFt > 0 ? installedWPerFt / requiredWPerFt : 0;

  if (ambientTempC <= -30) {
    warnings.push('Very low ambient temperature detected (≤ -30 °C). Verify startup and control strategy.');
  }
  if (lineLengthFt >= 500) {
    warnings.push('Long circuit length (≥ 500 ft). Check voltage drop and maximum circuit length limits.');
  }
  if (environment === 'outdoor-windy' && windSpeedMph >= 20) {
    warnings.push('High wind speed input (≥ 20 mph). Confirm wind shielding and trace placement assumptions.');
  }
  if (environment === 'buried') {
    warnings.push('Buried pipe case uses simplified radial soil conduction. Verify soil moisture, burial geometry, and manufacturer design method.');
  }
  if (rating.selectedWPerFt < requiredWPerFt) {
    warnings.push('Required W/ft exceeds available standard ratings. Use multiple runs or engineered solution.');
  }
  if (coverageRatio < 1) {
    warnings.push('Installed trace output is below required W/ft. Increase run count or select a higher cable rating.');
  }
  if (traceRunCount > 1) {
    warnings.push('Multiple parallel heat-trace runs selected. Verify spacing, circuit grouping, startup current, and manufacturer maximum lengths.');
  }
  if (componentAllowanceLengthFt > 0) {
    warnings.push('Component equivalent-length allowances are screening assumptions. Replace with project and manufacturer details for final design.');
  }
  if (traceRunCount > 1 || componentAllowanceLengthFt > 0) {
    warnings.push('Installed connected load uses selected nominal cable output, run count, and effective length. Verify final current and circuit length with manufacturer data.');
  }
  if (heatTraceCableType === 'constantWattage') {
    warnings.push('Constant-wattage cable selected. Confirm control strategy, sheath temperature, and over-temperature protection.');
  }
  if (heatTraceCableType === 'mineralInsulated') {
    warnings.push('Mineral-insulated cable selected. Final resistance design, bend radius, and termination details are manufacturer-specific.');
  }
  if (heatTraceCableType === 'powerLimiting') {
    warnings.push('Power-limiting / zone cable selected. Verify zone length, startup current, and manufacturer output tables.');
  }

  const circuitUtilizationRatio = lineLengthFt / maxCircuitLengthFt;
  const circuitLimitStatus = classifyCircuitUtilization(circuitUtilizationRatio);
  const profile = generatePipeTempProfile({
    lineLengthFt,
    maintainTempC,
    ambientTempC,
    circuitUtilizationRatio,
  });

  const baseLossConductionComponentWPerFt = baseLossConductionComponentWPerM * FT_TO_M;
  const baseLossExternalFilmComponentWPerFt = baseLossExternalFilmComponentWPerM * FT_TO_M;

  assertFiniteComputed(baseLossWPerM, 'baseLossWPerM');
  assertFiniteComputed(requiredWPerM, 'requiredWPerM');
  assertFiniteComputed(requiredWPerFt, 'requiredWPerFt');
  assertFiniteComputed(totalCircuitWatts, 'totalCircuitWatts');
  assertFiniteComputed(componentAllowanceLengthFt, 'componentAllowanceLengthFt');
  assertFiniteComputed(effectiveTraceLengthFt, 'effectiveTraceLengthFt');
  assertFiniteComputed(installedWPerFt, 'installedWPerFt');
  assertFiniteComputed(installedTotalWatts, 'installedTotalWatts');
  assertFiniteComputed(installedLoadAmps, 'installedLoadAmps');
  assertFiniteComputed(coverageRatio, 'coverageRatio');
  assertFiniteComputed(baseLossConductionComponentWPerM, 'baseLossConductionComponentWPerM');
  assertFiniteComputed(baseLossExternalFilmComponentWPerM, 'baseLossExternalFilmComponentWPerM');
  assertFiniteComputed(circuitUtilizationRatio, 'circuitUtilizationRatio');

  const unitConsistencyDelta = Math.abs(requiredWPerFt - (requiredWPerM * FT_TO_M));
  if (unitConsistencyDelta > 1e-8) {
    throw new Error('Computed power-unit conversion mismatch between W/m and W/ft');
  }

  return {
    ...normalized,
    deltaT,
    thermalResistance: {
      insulationKmPerW: round(rCond, 4),
      externalKmPerW: round(rExt, 4),
      totalKmPerW: round(rTotal, 4),
    },
    factors: {
      environmentMultiplier: ENVIRONMENT_MULTIPLIERS[environment],
      materialFactor,
      safetyFactor: round(safetyFactor, 4),
    },
    heatLossComponents: {
      baseLossTotalWPerM: round(baseLossWPerM, 2),
      baseLossTotalWPerFt: round(baseLossWPerM * FT_TO_M, 2),
      conductionComponentWPerM: round(baseLossConductionComponentWPerM, 2),
      conductionComponentWPerFt: round(baseLossConductionComponentWPerFt, 2),
      externalFilmComponentWPerM: round(baseLossExternalFilmComponentWPerM, 2),
      externalFilmComponentWPerFt: round(baseLossExternalFilmComponentWPerFt, 2),
      conductionSharePct: round(conductionLossShare * 100, 2),
      externalFilmSharePct: round(externalFilmLossShare * 100, 2),
    },
    circuit: {
      maxCircuitLengthFt,
      utilizationRatio: round(circuitUtilizationRatio, 4),
      status: circuitLimitStatus,
    },
    maxCircuitLengthFt,
    circuitUtilizationRatio: round(circuitUtilizationRatio, 4),
    circuitLimitStatus,
    profile,
    requiredWPerFt: round(requiredWPerFt, 2),
    requiredWPerM: round(requiredWPerM, 2),
    totalCircuitWatts: round(totalCircuitWatts, 1),
    componentAllowanceLengthFt: round(componentAllowanceLengthFt, 2),
    effectiveTraceLengthFt: round(effectiveTraceLengthFt, 2),
    installedWPerFt: round(installedWPerFt, 2),
    installedTotalWatts: round(installedTotalWatts, 1),
    installedLoadAmps: round(installedLoadAmps, 2),
    coverageRatio: round(coverageRatio, 4),
    heatTraceCableType,
    heatTraceCableTypeLabel: HEAT_TRACE_CABLE_TYPES[heatTraceCableType].label,
    heatTraceCableSelectionNote: HEAT_TRACE_CABLE_TYPES[heatTraceCableType].selectionNote,
    recommendedCableRatingWPerFt: rating.selectedWPerFt,
    recommendedCableOptionsWPerFt: rating.options,
    warnings,
  };
}
