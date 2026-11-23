import { validateStartingSourceBasis } from './designSynthesisStartingSourceBasis.mjs';

const METHOD = 'source-only-symmetric-three-phase-fault-consistency-v1';
const LIMITATIONS = [
  'The estimate includes only the external source represented by positive-sequence per-phase R/X at the source line-to-line voltage.',
  'Motor and generator contributions, downstream network impedance, and transformer fault transfer are not included and remain unresolved.',
  'The comparison does not establish interrupting duty, asymmetrical current, ground-fault current, or protection coordination.'
];

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function issue(code, message, path) { return { code, message, path, severity: 'blocking' }; }

/**
 * Compare the nominal source-only symmetrical three-phase current implied by
 * the supplied source impedance with its explicit external-source upper bound.
 * Inputs are read as supplied; no numeric coercion or source-data repair occurs.
 */
export function analyzeDesignSynthesisSourceFaultConsistency({ source } = {}) {
  const record = object(source) ? source : null;
  const voltageV = record?.voltage;
  const phases = record?.phases;
  const impedance = record?.motorStartingImpedance;
  const declaredAvailableFaultCurrentKA = record?.availableFaultCurrentKA;
  const issues = [];
  const derivedBasisIssue = validateStartingSourceBasis(record);
  if (derivedBasisIssue) issues.push(issue('SOURCE_STARTING_BASIS_STALE', derivedBasisIssue, 'equipment.source.motorStartingImpedanceBasis'));

  if (!record) issues.push(issue('SOURCE_FAULT_SOURCE_REQUIRED', 'A source equipment record is required for source fault consistency.', 'equipment.source'));
  if (!finite(voltageV) || voltageV <= 0) issues.push(issue('INVALID_SOURCE_FAULT_VOLTAGE', 'Source line-to-line voltage must be a positive finite number in volts.', 'equipment.source.voltage'));
  if (phases === 1) issues.push(issue('UNSUPPORTED_SOURCE_FAULT_PHASES', 'Source-only three-phase fault consistency requires a three-phase source; single-phase sources are unsupported.', 'equipment.source.phases'));
  else if (phases !== 3) issues.push(issue('INVALID_SOURCE_FAULT_PHASES', 'Source phases must be the numeric value 3.', 'equipment.source.phases'));
  if (!finite(declaredAvailableFaultCurrentKA) || declaredAvailableFaultCurrentKA <= 0) {
    issues.push(issue('SOURCE_FAULT_BOUND_REQUIRED', 'A positive finite availableFaultCurrentKA external-source upper bound is required; no default is inferred.', 'equipment.source.availableFaultCurrentKA'));
  }
  if (!object(impedance)) {
    issues.push(issue('SOURCE_FAULT_IMPEDANCE_REQUIRED', 'Positive-sequence per-phase source R/X impedance and a reference are required.', 'equipment.source.motorStartingImpedance'));
  } else {
    if (!finite(impedance.rOhm) || impedance.rOhm < 0) issues.push(issue('INVALID_SOURCE_FAULT_RESISTANCE', 'Source positive-sequence resistance rOhm must be a finite nonnegative number in ohms.', 'equipment.source.motorStartingImpedance.rOhm'));
    if (!finite(impedance.xOhm) || impedance.xOhm < 0) issues.push(issue('INVALID_SOURCE_FAULT_REACTANCE', 'Source positive-sequence reactance xOhm must be a finite nonnegative number in ohms.', 'equipment.source.motorStartingImpedance.xOhm'));
    if (finite(impedance.rOhm) && finite(impedance.xOhm) && impedance.rOhm >= 0 && impedance.xOhm >= 0 && impedance.rOhm === 0 && impedance.xOhm === 0) {
      issues.push(issue('ZERO_SOURCE_FAULT_IMPEDANCE', 'Source impedance magnitude must be greater than zero.', 'equipment.source.motorStartingImpedance'));
    }
    if (finite(impedance.rOhm) && finite(impedance.xOhm) && impedance.rOhm >= 0 && impedance.xOhm >= 0 && !Number.isFinite(Math.hypot(impedance.rOhm, impedance.xOhm))) {
      issues.push(issue('SOURCE_FAULT_IMPEDANCE_MAGNITUDE_RANGE', 'The source impedance magnitude is outside the finite numeric range.', 'equipment.source.motorStartingImpedance'));
    }
    if (typeof impedance.reference !== 'string' || !impedance.reference.trim()) issues.push(issue('SOURCE_FAULT_IMPEDANCE_REFERENCE_REQUIRED', 'Source impedance requires a non-blank reference identifying its basis.', 'equipment.source.motorStartingImpedance.reference'));
  }

  const impedanceMagnitude = object(impedance) && finite(impedance.rOhm) && impedance.rOhm >= 0 && finite(impedance.xOhm) && impedance.xOhm >= 0
    ? Math.hypot(impedance.rOhm, impedance.xOhm) : null;
  const validImpedance = object(impedance) && finite(impedance.rOhm) && impedance.rOhm >= 0
    && finite(impedance.xOhm) && impedance.xOhm >= 0 && finite(impedanceMagnitude) && impedanceMagnitude > 0
    && typeof impedance.reference === 'string' && Boolean(impedance.reference.trim());
  const sourceImpedanceMagnitudeOhm = validImpedance ? impedanceMagnitude : null;
  const estimatedCurrentKA = finite(voltageV) && voltageV > 0 && phases === 3 && validImpedance
    ? (voltageV / sourceImpedanceMagnitudeOhm) / (Math.sqrt(3) * 1000)
    : null;
  const impliedSourceOnlyFaultCurrentKA = finite(estimatedCurrentKA) && estimatedCurrentKA > 0 ? estimatedCurrentKA : null;
  if (finite(voltageV) && voltageV > 0 && phases === 3 && validImpedance && impliedSourceOnlyFaultCurrentKA === null) {
    issues.push(issue('SOURCE_FAULT_CURRENT_RANGE', 'The implied source-only fault current is outside the finite positive numeric range and cannot be compared safely.', 'equipment.source.motorStartingImpedance'));
  }
  let comparison = { relation: 'unavailable', toleranceKA: null };
  if (finite(impliedSourceOnlyFaultCurrentKA) && finite(declaredAvailableFaultCurrentKA) && declaredAvailableFaultCurrentKA > 0) {
    const toleranceKA = 16 * Number.EPSILON * Math.max(Math.abs(impliedSourceOnlyFaultCurrentKA), Math.abs(declaredAvailableFaultCurrentKA), Number.MIN_VALUE);
    const exceeds = impliedSourceOnlyFaultCurrentKA - declaredAvailableFaultCurrentKA > toleranceKA;
    comparison = { relation: exceeds ? 'implied-exceeds-declared-bound' : impliedSourceOnlyFaultCurrentKA < declaredAvailableFaultCurrentKA - toleranceKA ? 'below-declared-bound' : 'equal-within-roundoff', toleranceKA };
    if (exceeds) issues.push(issue('SOURCE_FAULT_BOUND_INCONSISTENT', 'The declared availableFaultCurrentKA is below the symmetrical three-phase source-only current implied by the supplied source voltage and positive-sequence impedance.', 'equipment.source.availableFaultCurrentKA'));
  }

  return {
    status: issues.length ? 'blocked' : 'pass',
    blockedReason: issues.length ? issues[0].code : null,
    method: METHOD,
    sourceVoltageV: finite(voltageV) ? voltageV : null,
    sourcePhases: finite(phases) || typeof phases === 'string' ? phases : null,
    sourceImpedanceOhm: validImpedance ? { r: impedance.rOhm, x: impedance.xOhm, magnitude: sourceImpedanceMagnitudeOhm, reference: impedance.reference } : null,
    impliedSourceOnlyFaultCurrentKA,
    declaredAvailableFaultCurrentKA: finite(declaredAvailableFaultCurrentKA) || typeof declaredAvailableFaultCurrentKA === 'string' ? declaredAvailableFaultCurrentKA : null,
    declaredAvailableFaultCurrentKAInputType: declaredAvailableFaultCurrentKA === null ? 'null' : typeof declaredAvailableFaultCurrentKA,
    declaredAvailableFaultCurrentKAProvided: record ? Object.prototype.hasOwnProperty.call(record, 'availableFaultCurrentKA') : false,
    comparison,
    assumptions: ['Source internal open-circuit voltage is 1.0 per unit at the declared source line-to-line voltage.', 'The nominal symmetrical three-phase source-only estimate is V_LL / (sqrt(3) × |Z_source|); no source impedance or declared bound is changed.'],
    limitations: LIMITATIONS,
    issues
  };
}

export default { analyzeDesignSynthesisSourceFaultConsistency };
