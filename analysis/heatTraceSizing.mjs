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

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite number greater than zero`);
  }
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
    pipeMaterial = 'carbonSteel',
    environment = 'outdoor-sheltered',
    insulationType = 'mineralWool',
    insulationK,
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

  if (!Object.prototype.hasOwnProperty.call(ENVIRONMENT_MULTIPLIERS, environment)) {
    throw new Error(`Unsupported environment "${environment}"`);
  }

  if (!Object.prototype.hasOwnProperty.call(PIPE_MATERIAL_FACTORS, pipeMaterial)) {
    throw new Error(`Unsupported pipeMaterial "${pipeMaterial}"`);
  }

  if (environment === 'outdoor-windy' && windSpeedMph <= 0) {
    throw new Error('windSpeedMph must be > 0 for outdoor-windy environment');
  }

  return {
    pipeNps,
    pipeOdIn: resolvedPipeOdIn,
    insulationThicknessIn,
    lineLengthFt,
    maintainTempC,
    ambientTempC,
    windSpeedMph,
    safetyMarginPct,
    pipeMaterial,
    environment,
    insulationType,
    insulationK: resolvedInsulationK,
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
export function externalFilmResistance({ pipeOdIn, insulationThicknessIn, environment, windSpeedMph = 0 }) {
  assertFinitePositive(pipeOdIn, 'pipeOdIn');
  assertFinitePositive(insulationThicknessIn, 'insulationThicknessIn');

  const envFactor = ENVIRONMENT_MULTIPLIERS[environment];
  if (!envFactor) throw new Error(`Unsupported environment "${environment}"`);
  if (!Number.isFinite(windSpeedMph) || windSpeedMph < 0) throw new Error('windSpeedMph must be ≥ 0');

  const rOuterM = (pipeOdIn * INCH_TO_M) / 2 + insulationThicknessIn * INCH_TO_M;
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
    pipeMaterial,
    environment,
    insulationK,
  } = normalized;

  const warnings = [];
  const deltaT = maintainTempC - ambientTempC;

  const rCond = cylindricalInsulationResistance({ pipeOdIn, insulationThicknessIn, insulationK });
  const rExt = externalFilmResistance({ pipeOdIn, insulationThicknessIn, environment, windSpeedMph });
  const rTotal = rCond + rExt;

  const baseLossWPerM = deltaT / rTotal;
  const materialFactor = PIPE_MATERIAL_FACTORS[pipeMaterial];
  const safetyFactor = 1 + safetyMarginPct / 100;

  const requiredWPerM = baseLossWPerM * materialFactor * safetyFactor;
  const requiredWPerFt = requiredWPerM * FT_TO_M;
  const totalCircuitWatts = requiredWPerFt * lineLengthFt;

  const rating = selectStandardHeatTraceRating(requiredWPerFt);

  if (ambientTempC <= -30) {
    warnings.push('Very low ambient temperature detected (≤ -30 °C). Verify startup and control strategy.');
  }
  if (lineLengthFt >= 500) {
    warnings.push('Long circuit length (≥ 500 ft). Check voltage drop and maximum circuit length limits.');
  }
  if (environment === 'outdoor-windy' && windSpeedMph >= 20) {
    warnings.push('High wind speed input (≥ 20 mph). Confirm wind shielding and trace placement assumptions.');
  }
  if (rating.selectedWPerFt < requiredWPerFt) {
    warnings.push('Required W/ft exceeds available standard ratings. Use multiple runs or engineered solution.');
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
    requiredWPerFt: round(requiredWPerFt, 2),
    requiredWPerM: round(requiredWPerM, 2),
    totalCircuitWatts: round(totalCircuitWatts, 1),
    recommendedCableRatingWPerFt: rating.selectedWPerFt,
    recommendedCableOptionsWPerFt: rating.options,
    warnings,
  };
}
