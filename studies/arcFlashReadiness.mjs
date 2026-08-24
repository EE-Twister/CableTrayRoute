function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

export function arcFlashResultEntries(results = {}, scope = 'project') {
  return Object.entries(results || {}).filter(([id, result]) => {
    if (id.startsWith('_') || !result || typeof result !== 'object') return false;
    if (!finiteNumber(result.incidentEnergy)) return false;
    return scope === 'project' || id === scope;
  });
}

export function isArcFlashLabelEligible(info = {}) {
  const requiredInputs = Array.isArray(info.requiredInputs) ? info.requiredInputs : [];
  return info.calculationStatus !== 'incomplete'
    && requiredInputs.length === 0
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
    && info.upstreamDevice !== 'Not Specified';
}

export function summarizeArcFlashResults(results = {}, scope = 'project') {
  const entries = arcFlashResultEntries(results, scope);
  const total = entries.length;
  const labelEligible = entries.filter(([, result]) => isArcFlashLabelEligible(result)).length;
  const incomplete = entries.filter(([, result]) => {
    return result.calculationStatus === 'incomplete'
      || (Array.isArray(result.requiredInputs) && result.requiredInputs.length > 0);
  }).length;
  const outsideModelRange = entries.filter(([, result]) => result.calculationInputs?.withinModelRange === false).length;
  const assumedClearingTime = entries.filter(([, result]) => {
    const source = String(result.calculationInputs?.clearingTimeSource || '');
    return source === 'default-screening-assumption' || source === 'unavailable';
  }).length;
  const status = !total ? 'empty' : incomplete || outsideModelRange ? 'review' : 'ready';

  let title = 'Run the study to establish readiness';
  let summary = 'Label eligibility is determined only after both arcing-current cases and their clearing-time evidence are checked.';
  if (status === 'review') {
    title = `${incomplete || outsideModelRange} location(s) need engineering follow-up`;
    summary = `${labelEligible} of ${total} location(s) are eligible for draft label generation. Incomplete results remain in the draft report with their required inputs and provenance.`;
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
    assumedClearingTime,
  };
}

export function arcFlashReadinessLabel(result = {}) {
  if (isArcFlashLabelEligible(result)) return 'Label eligible';
  if (result.calculationInputs?.withinModelRange === false) return 'Outside model range';
  if (result.calculationStatus === 'incomplete' || result.requiredInputs?.length) return 'Inputs required';
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
