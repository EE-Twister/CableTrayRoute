import { fingerprintStudySource } from './studyResultReadiness.mjs';

export function createCalculationResult({ value = null, units = '', validity = 'unevaluated', inputSources = {}, assumptions = {}, modelLimits = {}, warnings = [], inputs = {} } = {}) {
  // Do not let JavaScript's Number(null), Number(''), or boolean coercions
  // turn a missing result into an evaluated zero/one.
  const numericValue = (typeof value === 'number' && Number.isFinite(value))
    ? value
    : (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : Number.NaN);
  const hasValue = Number.isFinite(numericValue);
  const evaluated = validity === 'evaluated' && hasValue;
  const meaningfulSources = Object.fromEntries(Object.entries(inputSources).filter(([, source]) => source != null && source !== ''));
  return {
    value: evaluated ? numericValue : null,
    units,
    validity: evaluated ? 'evaluated' : 'unevaluated',
    inputSources: meaningfulSources,
    assumptions,
    modelLimits,
    warnings: [...new Set(warnings.filter(Boolean))],
    inputFingerprint: fingerprintStudySource(inputs),
  };
}

export function invalidCalculationResult(options = {}) {
  return createCalculationResult({ ...options, validity: 'unevaluated', value: null });
}
