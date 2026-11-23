import { evaluateDesignSynthesisFaultStudy } from './designSynthesisFaultStudy.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from './designSynthesisDeviceFaultScreen.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const magnitude = value => finite(value?.re) && finite(value?.im) ? Math.hypot(value.re, value.im) : null;
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });
const METHOD = 'design-synthesis-explicit-source-scenario-envelope-v1';

function validateScenarios(value) {
  const issues = [];
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    issues.push(issue('FAULT_SCENARIOS_COUNT', 'faultScenarios', 'faultScenarios must contain between two and four scenarios.'));
    return issues;
  }
  const ids = new Set();
  value.forEach((scenario, index) => {
    const path = `faultScenarios.${index}`;
    if (!object(scenario)) {
      issues.push(issue('FAULT_SCENARIO_INVALID', path, 'Each scenario must be an object.'));
      return;
    }
    for (const key of Object.keys(scenario)) if (!['id', 'reference', 'study'].includes(key)) issues.push(issue('FAULT_SCENARIO_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the fault-scenario contract.'));
    if (!text(scenario.id)) issues.push(issue('FAULT_SCENARIO_ID_INVALID', `${path}.id`, 'Scenario id must be a non-blank string.'));
    else if (ids.has(scenario.id)) issues.push(issue('FAULT_SCENARIO_ID_DUPLICATE', `${path}.id`, 'Scenario ids must be unique.'));
    else ids.add(scenario.id);
    if (!text(scenario.reference)) issues.push(issue('FAULT_SCENARIO_REFERENCE_INVALID', `${path}.reference`, 'Scenario reference must be a non-blank string.'));
    if (!object(scenario.study)) issues.push(issue('FAULT_SCENARIO_STUDY_INVALID', `${path}.study`, 'Scenario study must be a complete explicit faultStudy object.'));
  });
  return issues;
}

function busRows(scenarios) {
  if (!scenarios.length || scenarios.some(row => row.status !== 'evaluated')) return [];
  const maps = scenarios.map(row => new Map(row.faultStudyValidation.cases.map(item => [String(item?.fault?.busId || item?.busId || ''), magnitude(item?.fault?.totalFaultCurrentKA)])));
  const ids = [...maps[0].keys()].filter(id => id && maps.every(map => map.has(id) && map.get(id) !== null));
  if (maps.some(map => map.size !== ids.length)) return [];
  return ids.map(busId => {
    let minimum = null; let maximum = null;
    scenarios.forEach((scenario, index) => {
      const valueKA = maps[index].get(busId);
      if (!minimum || valueKA < minimum.valueKA) minimum = { scenarioId: scenario.id, valueKA };
      if (!maximum || valueKA > maximum.valueKA) maximum = { scenarioId: scenario.id, valueKA };
    });
    return { busId, minimum, maximum };
  });
}

function deviceRows(scenarios) {
  if (!scenarios.length || scenarios.some(row => row.status !== 'evaluated')) return [];
  const all = scenarios.map(row => new Map((row.deviceFaultValidation?.placements || []).map(item => [item.id, item])));
  const ids = [...all[0].keys()];
  if (!ids.length || all.some(map => map.size !== ids.length || ids.some(id => !map.has(id)))) return [];
  return ids.map(placementId => {
    const placements = all.map(map => map.get(placementId));
    const line = placements.map(item => magnitude(item.comparisons?.lineTerminalAvailableInitialRms?.phasorKA));
    const through = placements.map(item => ({ valueKA: magnitude(item.comparisons?.maximumThroughDeviceInitialRms?.phasorKA), faultBusId: item.comparisons?.maximumThroughDeviceInitialRms?.faultBusId, caseKind: item.comparisons?.maximumThroughDeviceInitialRms?.caseKind }));
    if (line.some(value => value === null) || through.some(item => item.valueKA === null)) return null;
    let lineMin = null; let lineMax = null; let throughMin = null; let throughMax = null;
    scenarios.forEach((scenario, index) => {
      if (!lineMin || line[index] < lineMin.valueKA) lineMin = { scenarioId: scenario.id, valueKA: line[index] };
      if (!lineMax || line[index] > lineMax.valueKA) lineMax = { scenarioId: scenario.id, valueKA: line[index] };
      const candidate = { scenarioId: scenario.id, ...through[index] };
      if (!throughMin || candidate.valueKA < throughMin.valueKA) throughMin = candidate;
      if (!throughMax || candidate.valueKA > throughMax.valueKA) throughMax = candidate;
    });
    return { placementId, lineTerminalAvailableInitialRms: { minimum: lineMin, maximum: lineMax }, maximumThroughDeviceInitialRms: { minimum: throughMin, maximum: throughMax }, protectionStatus: 'not-evaluated' };
  }).filter(Boolean);
}

export function evaluateDesignSynthesisFaultScenarios({ proposal, faultScenarios } = {}) {
  const issues = validateScenarios(faultScenarios);
  if (proposal?.inputs?.original?.faultStudy !== undefined) issues.push(issue('FAULT_SCENARIO_LEGACY_CONFLICT', 'faultScenarios', 'faultScenarios and the legacy faultStudy input are mutually exclusive.'));
  if (!Array.isArray(faultScenarios) || faultScenarios.length < 2 || faultScenarios.length > 4) {
    return {
      status: 'blocked', method: METHOD, scope: 'initial-symmetrical-rms-only',
      modelInputFingerprint: fingerprintStudyValue({ canonicalInputs: { supply: proposal?.inputs?.original?.supply, originalEquipment: proposal?.inputs?.original?.equipment, loads: proposal?.loads }, proposal: { equipment: proposal?.equipment, cables: proposal?.cables, transformer: proposal?.transformer, oneLine: proposal?.oneLine, ...(proposal?.cables?.some(item => item.protectiveDevice?.assemblyEvidenceRef?.section === 'motorStarterCandidates') ? { motorStarterCandidates: proposal.motorStarterCandidates } : {}) }, faultScenarios }),
      scenarios: [], busEnvelopes: [], deviceEnvelopes: [], issues,
      coverage: { status: 'incomplete', scope: 'supplied-scenarios-only', verifiedAsExtrema: false, scenarioCount: Array.isArray(faultScenarios) ? faultScenarios.length : 0 },
      limitations: limitations(),
    };
  }
  const scenarioRows = [];
  if (Array.isArray(faultScenarios)) faultScenarios.forEach((scenario, index) => {
    const path = `faultScenarios.${index}`;
    if (!object(scenario) || !object(scenario.study)) return;
    const localProposal = { ...proposal, inputs: { ...proposal?.inputs, original: { ...proposal?.inputs?.original, faultStudy: scenario.study } }, faultStudy: structuredClone(scenario.study) };
    const faultStudyValidation = evaluateDesignSynthesisFaultStudy({ proposal: localProposal, faultStudy: scenario.study });
    const deviceFaultValidation = evaluateDesignSynthesisDeviceFaultScreen({ proposal: localProposal, faultStudyValidation });
    const ids = new Set((proposal?.equipment || []).filter(item => ['source', 'panel', 'load', 'bus'].includes(item?.type)).map(item => String(item.id)));
    const cases = faultStudyValidation.cases || [];
    const completeNetwork = faultStudyValidation.status === 'evaluated' && faultStudyValidation.coverage?.status === 'complete' && cases.length === ids.size && cases.every(item => item.status === 'evaluated');
    const placements = deviceFaultValidation.placements || [];
    const onlyRatingExceedances = (deviceFaultValidation.issues || []).every(item => ['DEVICE_FAULT_SCREEN_RATING_EXCEEDED', 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'].includes(item.code));
    const completeDevices = deviceFaultValidation.coverage?.status === 'complete' && onlyRatingExceedances && placements.length > 0 && placements.every(item => magnitude(item.comparisons?.lineTerminalAvailableInitialRms?.phasorKA) !== null && magnitude(item.comparisons?.maximumThroughDeviceInitialRms?.phasorKA) !== null);
    const status = issues.some(item => item.path === path || item.path.startsWith(`${path}.`)) || !completeNetwork || !completeDevices ? 'blocked' : 'evaluated';
    scenarioRows.push({ id: scenario.id, reference: scenario.reference, status, faultStudyValidation, deviceFaultValidation });
    if (faultStudyValidation.status !== 'evaluated') issues.push(...faultStudyValidation.issues.map(item => ({ ...item, path: `${path}.${item.path}` })));
    if (!completeDevices) issues.push(issue('FAULT_SCENARIO_DEVICE_EVIDENCE_INCOMPLETE', `${path}.deviceFaultValidation`, 'Complete device current evidence is required for scenario envelopes.'));
  });
  const complete = issues.length === 0 && scenarioRows.length === faultScenarios?.length && scenarioRows.every(row => row.status === 'evaluated');
  const buses = complete ? busRows(scenarioRows) : [];
  const devices = complete ? deviceRows(scenarioRows) : [];
  if (complete && (!buses.length || !devices.length)) issues.push(issue('FAULT_SCENARIO_ENVELOPE_INCOMPLETE', 'faultScenarios', 'Complete bus and device envelopes could not be assembled across all scenarios.'));
  const finalComplete = complete && buses.length > 0 && devices.length > 0;
  return {
    status: finalComplete ? 'evaluated' : 'blocked',
    method: METHOD,
    scope: 'initial-symmetrical-rms-only',
    modelInputFingerprint: fingerprintStudyValue({ canonicalInputs: { supply: proposal?.inputs?.original?.supply, originalEquipment: proposal?.inputs?.original?.equipment, loads: proposal?.loads }, proposal: { equipment: proposal?.equipment, cables: proposal?.cables, transformer: proposal?.transformer, oneLine: proposal?.oneLine, ...(proposal?.cables?.some(item => item.protectiveDevice?.assemblyEvidenceRef?.section === 'motorStarterCandidates') ? { motorStarterCandidates: proposal.motorStarterCandidates } : {}) }, faultScenarios }),
    scenarios: scenarioRows,
    busEnvelopes: finalComplete ? buses : [],
    deviceEnvelopes: finalComplete ? devices : [],
    issues,
    coverage: { status: finalComplete ? 'complete' : 'incomplete', scope: 'supplied-scenarios-only', verifiedAsExtrema: false, scenarioCount: Array.isArray(faultScenarios) ? faultScenarios.length : 0 },
    limitations: limitations(),
  };
}

function limitations() {
  return [
    'Envelopes describe only the explicitly supplied operating scenarios and are not standards-derived maximum or minimum fault conditions.',
    'Nominal source EMF remains at the canonical nominal-voltage basis; no voltage factors, impedance tolerances, or standards-derived maximum or minimum cases are automatically applied.',
    'Sourced cable R/X remain at the catalog 75 C basis; no conductor-temperature cases are modeled.',
    'Initial symmetrical RMS comparisons do not establish protection adequacy, peak or asymmetrical duty, thermal duty, protective clearing, coordination, or code compliance.',
    'Source inventory and references are supplied metadata and are not independently verified.',
  ];
}

export default { evaluateDesignSynthesisFaultScenarios };
