import { assessArcFlashResultPlausibility } from '../analysis/arcFlashResultUnits.mjs';

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIncompleteArcFlashResult(result = {}) {
  return !finiteNumber(result.incidentEnergy)
    || ['incomplete', 'unevaluated', 'unsupported', 'invalid', 'missing-inputs'].includes(String(result.calculationStatus || '').toLowerCase())
    || ['incomplete', 'unevaluated', 'invalid'].includes(String(result.validity || '').toLowerCase())
    || (Array.isArray(result.requiredInputs) && result.requiredInputs.length > 0);
}

/** False when the saved boundary contradicts the incident energy (see analysis/arcFlashResultUnits.mjs). */
export function isArcFlashResultPlausible(info = {}) {
  return assessArcFlashResultPlausibility(info).plausible;
}

export function arcFlashResultEntries(results = {}, scope = 'project') {
  return Object.entries(results || {}).filter(([id, result]) => {
    if (id.startsWith('_') || !result || typeof result !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(result, 'incidentEnergy')
        && !Object.prototype.hasOwnProperty.call(result, 'calculationStatus')
        && !Object.prototype.hasOwnProperty.call(result, 'requiredInputs')) return false;
    return scope === 'project' || id === scope;
  });
}

export function isArcFlashLabelEligible(info = {}) {
  const requiredInputs = Array.isArray(info.requiredInputs) ? info.requiredInputs : [];
  const validity = typeof info.validity === 'string' ? info.validity.toLowerCase() : '';
  const calculationStatus = String(info.calculationStatus || '').toLowerCase();
  return !['incomplete', 'unevaluated', 'unsupported', 'invalid', 'missing-inputs'].includes(calculationStatus)
    && !['incomplete', 'unevaluated', 'invalid'].includes(validity)
    && requiredInputs.length === 0
    && info.calculationInputs?.withinModelRange !== false
    && finiteNumber(info.incidentEnergy)
    && Number(info.incidentEnergy) >= 0
    && finiteNumber(info.nominalVoltage)
    && Number(info.nominalVoltage) > 0
    && finiteNumber(info.workingDistance)
    && Number(info.workingDistance) > 0
    && finiteNumber(info.boundary)
    && Number(info.boundary) >= 0
    && finiteNumber(info.clearingTime)
    && Number(info.clearingTime) > 0
    && typeof info.upstreamDevice === 'string'
    && info.upstreamDevice.trim().length > 0
    && info.upstreamDevice !== 'Not Specified'
    && isArcFlashResultPlausible(info);
}

export function summarizeArcFlashResults(results = {}, scope = 'project') {
  const entries = arcFlashResultEntries(results, scope);
  const total = entries.length;
  const labelEligible = entries.filter(([, result]) => isArcFlashLabelEligible(result)).length;
  const incomplete = entries.filter(([, result]) => isIncompleteArcFlashResult(result)).length;
  const outsideModelRange = entries.filter(([, result]) => result.calculationInputs?.withinModelRange === false).length;
  const invalid = entries.filter(([, result]) => !isArcFlashResultPlausible(result)).length;
  const assumedClearingTime = entries.filter(([, result]) => {
    const source = String(result.calculationInputs?.clearingTimeSource || '');
    return source === 'default-screening-assumption' || source === 'unavailable';
  }).length;
  const status = !total ? 'empty' : incomplete || outsideModelRange || invalid ? 'review' : 'ready';

  let title = 'Run the study to establish readiness';
  let summary = 'Label eligibility is determined only after both arcing-current cases and their clearing-time evidence are checked.';
  if (status === 'review') {
    const followUp = entries.filter(([, result]) => isIncompleteArcFlashResult(result)
      || result.calculationInputs?.withinModelRange === false
      || !isArcFlashResultPlausible(result)).length;
    title = `${followUp} location(s) need engineering follow-up`;
    summary = `${labelEligible} of ${total} location(s) are eligible for draft label generation. Incomplete results remain in the draft report with their required inputs and provenance.`;
    if (invalid) {
      summary += ` ${invalid} location(s) have an arc-flash boundary that is inconsistent with the incident energy and are marked invalid; check boundary units.`;
    }
  } else if (status === 'ready') {
    title = `${total} location(s) calculated with complete inputs`;
    summary = `${labelEligible} location(s) are eligible for draft label generation. Engineer review is still required before field use.`;
  }

  return {
    status,
    title,
    summary,
    total,
    labelEligible,
    incomplete,
    outsideModelRange,
    invalid,
    assumedClearingTime,
  };
}

export function arcFlashReadinessLabel(result = {}) {
  if (!isArcFlashResultPlausible(result)) return 'Invalid result';
  if (isArcFlashLabelEligible(result)) return 'Label eligible';
  if (result.calculationInputs?.withinModelRange === false) return 'Outside model range';
  if (isIncompleteArcFlashResult(result)) return 'Inputs required';
  return 'Review required';
}

export function formatArcFlashClearingBasis(result = {}) {
  const source = String(result.calculationInputs?.clearingTimeSource || '').trim();
  const labels = {
    'protective-device-total-clearing-curve': 'Reviewed total-clearing curve',
    'protective-device-instantaneous-setting': 'Instantaneous setting',
    'component-explicit': 'Equipment input',
    'upstream-explicit': 'Upstream equipment input',
    'default-screening-assumption': '0.2 s screening assumption',
    unavailable: 'Unavailable',
  };
  return labels[source] || source.replaceAll('-', ' ') || 'Not recorded';
}
