const MIN_FACTOR = 0.001;
const MAX_FACTOR = 1;

export const COATING_MODEL_TYPES = {
  fixed: 'fixed',
  degradationCurve: 'degradation-curve',
  segmentCondition: 'segment-condition'
};

export function parseConditionFactorValues(rawValue) {
  if (typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(',')
    .map((token) => Number.parseFloat(token.trim()))
    .filter((value) => Number.isFinite(value));
}

export function resolveCoatingModel(input, context = {}) {
  const modelType = input.coatingModelType || COATING_MODEL_TYPES.fixed;
  const segmentCount = Number.isInteger(context.segmentCount) && context.segmentCount > 0 ? context.segmentCount : 1;

  if (modelType === COATING_MODEL_TYPES.degradationCurve) {
    return buildDegradationCurveModel(input, segmentCount);
  }

  if (modelType === COATING_MODEL_TYPES.segmentCondition) {
    return buildSegmentConditionModel(input, segmentCount);
  }

  return buildFixedFactorModel(input, segmentCount);
}

function buildFixedFactorModel(input, segmentCount) {
  const factor = clampFactor(input.coatingBreakdownFactor);
  const uncertainty = buildSymmetricUncertainty(factor, 0.2);
  return {
    modelType: COATING_MODEL_TYPES.fixed,
    label: 'Fixed factor',
    effectiveFactor: factor,
    worstCaseFactor: uncertainty.highFactor,
    uncertaintyBand: uncertainty,
    segmentFactors: new Array(segmentCount).fill(factor),
    curvePoints: []
  };
}

function buildDegradationCurveModel(input, segmentCount) {
  const initialFactor = clampFactor(input.coatingInitialBreakdownFactor);
  const endOfLifeFactor = clampFactor(input.coatingEndOfLifeBreakdownFactor);
  const exponent = Number.isFinite(input.coatingDegradationExponent) && input.coatingDegradationExponent > 0
    ? input.coatingDegradationExponent
    : 1;
  const effectiveFactor = clampFactor(initialFactor + ((endOfLifeFactor - initialFactor) / (exponent + 1)));

  return {
    modelType: COATING_MODEL_TYPES.degradationCurve,
    label: 'Time-varying degradation curve',
    effectiveFactor,
    worstCaseFactor: Math.max(initialFactor, endOfLifeFactor),
    uncertaintyBand: {
      lowFactor: Math.min(initialFactor, endOfLifeFactor),
      baseFactor: effectiveFactor,
      highFactor: Math.max(initialFactor, endOfLifeFactor)
    },
    segmentFactors: new Array(segmentCount).fill(effectiveFactor),
    curvePoints: [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
      const factor = clampFactor(initialFactor + ((endOfLifeFactor - initialFactor) * (fraction ** exponent)));
      return {
        lifeFraction: fraction,
        factor
      };
    })
  };
}

function buildSegmentConditionModel(input, segmentCount) {
  const parsedFactors = Array.isArray(input.segmentConditionFactors) ? input.segmentConditionFactors : [];
  const sanitized = parsedFactors.map((value) => clampFactor(value)).filter((value) => Number.isFinite(value));
  const fallbackFactor = clampFactor(input.coatingBreakdownFactor);
  const segmentFactors = Array.from({ length: segmentCount }, (_, index) => sanitized[index] ?? fallbackFactor);
  const sum = segmentFactors.reduce((accumulator, factor) => accumulator + factor, 0);
  const effectiveFactor = clampFactor(sum / segmentFactors.length);
  const lowFactor = Math.min(...segmentFactors);
  const highFactor = Math.max(...segmentFactors);

  return {
    modelType: COATING_MODEL_TYPES.segmentCondition,
    label: 'Segment-based condition factors',
    effectiveFactor,
    worstCaseFactor: highFactor,
    uncertaintyBand: {
      lowFactor,
      baseFactor: effectiveFactor,
      highFactor
    },
    segmentFactors,
    curvePoints: []
  };
}

function buildSymmetricUncertainty(baseFactor, deltaFraction) {
  return {
    lowFactor: clampFactor(baseFactor * (1 - deltaFraction)),
    baseFactor: clampFactor(baseFactor),
    highFactor: clampFactor(baseFactor * (1 + deltaFraction))
  };
}

function clampFactor(value) {
  if (!Number.isFinite(value)) {
    return MIN_FACTOR;
  }

  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, value));
}
