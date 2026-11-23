import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from './designSynthesisCableCatalog.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { buildDesignSynthesisFaultNetwork } from './designSynthesisFaultStudy.mjs';
import { evaluateCableSpanFaultEnvelope } from './cableSpanFaultEnvelope.mjs';

export const CONTINUOUS_CABLE_FAULT_SELECTION = 'all-generated-bus-and-cable-span-faults';

export const CABLE_FAULT_WITHSTAND_METHOD = 'southwire-mc-cu-adiabatic-90c-to-250c-v1';
export const CABLE_FAULT_WITHSTAND_SOURCE = Object.freeze({
  method: CABLE_FAULT_WITHSTAND_METHOD,
  coefficientSource: Object.freeze({
    sourceId: 'southwire-cts0002-2023-pdf',
    revision: 'CTS0002 (2023)',
    sourceUrl: 'https://www.southwire.com/medias/2307-Short-Circuit-Currents-Insulated-Cables-Whitepaper-PRINT.pdf?context=bWFzdGVyfHJvb3R8ODIzNzE3fGFwcGxpY2F0aW9uL3BkZnxoMDkvaGJkLzkyMjU2NjM3NzQ3NTAvMjMwN19TaG9ydF9DaXJjdWl0X0N1cnJlbnRzX0luc3VsYXRlZF9DYWJsZXNfV2hpdGVwYXBlcl9QUklOVC5wZGZ8YTM5OWJmMzQ0OWEzZDhmNzkyMDhiOWYyYTM1YTBkMDhmZDEwM2QzY2M5Y2Y2NzkwYWFmMTUxMDZkMjZiYzllZg',
    sha256: '7a67e2e2e4c660f12484182f6c7f3ce27f16a2e7a64144d05a57d70a4cc80d5a',
    page: 1,
    coefficientA: 0.0719,
    initialTemperatureC: 90,
    finalTemperatureC: 250,
    conductor: 'copper thermoset',
  }),
  conductorAreaSource: Object.freeze({
    sourceId: 'southwire-spec10080-nominal-area-pdf',
    revision: 'SPEC10080 nominal circular-mil area table',
    sourceUrl: 'https://cabletechsupport.southwire.com/en/cablespec/download_spec/?country=International&spec=10080',
    sha256: '418590a1934e4b90d8422fd1d9b2b03dbad4e2c217e8ae2513d66dae9ec1160d',
    basis: 'Nominal circular-mil area transfer only; this bare-conductor area table supplies no insulation or cable construction assumption.',
  }),
  cableSource: SOUTHWIRE_MC_SOURCE,
  catalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT,
  durationBasis: Object.freeze({
    sourceId: 'schneider-electrical-installation-guide-adiabatic-limit',
    sourceUrl: 'https://www.electrical-installation.org/enwiki/Verification_of_the_withstand_capabilities_of_cables_under_short-circuit_conditions',
    maximumDurationS: 5,
    caveat: 'The 5 s upper domain comes from a separate installation-guide method basis, not CTS0002. The 0.1 s lower domain is an application restriction.',
  }),
});

const AREAS_CMIL = Object.freeze({
  '#8 AWG': 16510, '#6 AWG': 26240, '#4 AWG': 41740, '#3 AWG': 52620,
  '#2 AWG': 66360, '#1 AWG': 83690, '1/0 AWG': 105600, '2/0 AWG': 133100,
  '3/0 AWG': 167800, '4/0 AWG': 211600, '250 kcmil': 250000, '350 kcmil': 350000,
  '500 kcmil': 500000, '600 kcmil': 600000, '750 kcmil': 750000,
});
const SOURCED_SIZE_ORDER = Object.freeze(['#8 AWG', '#6 AWG', '#4 AWG', '#3 AWG', '#2 AWG', '#1 AWG', '1/0 AWG', '2/0 AWG', '3/0 AWG', '4/0 AWG', '250 kcmil', '350 kcmil', '500 kcmil', '600 kcmil', '750 kcmil']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonblank = value => typeof value === 'string' && !!value.trim();
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });
const magnitudeSquared = value => value.re * value.re + value.im * value.im;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const bindingFields = Object.freeze(['id', 'branchId', 'tag', 'from', 'to', 'fromBusId', 'toBusId', 'conductor_size', 'conductorSize', 'size', 'cableStockId', 'cableCatalogFingerprint', 'r_ohm_per_kft', 'x_ohm_per_kft', 'impedanceBasis', 'source', 'cable_od', 'outerDiameterIn', 'diameter', 'conductorMaterial', 'conductor_material', 'conductor_count', 'conductors', 'conductors_per_cable', 'cable_rating', 'cableRating', 'cableConstructionSource', 'constructionSource', 'construction_source', 'length', 'lengthFt', 'totalImpedanceOhms']);

function spanWorstDetails(row) {
  return row?.caseKind === 'continuous-cable-span-envelope' ? { caseKind: row.caseKind, faultCaseId: row.faultCaseId,
    faultSpanId: row.faultSpanId, faultPosition: row.faultPosition, faultPositionInterval: row.faultPositionInterval } : {};
}
export function summarizeDesignSynthesisCableFaultWorstCase(row) {
  return row ? { cableId: row.cableId, faultBusId: row.faultBusId, exposureToAllowanceRatio: row.exposureToAllowanceRatio, comparison: row.comparison, ...spanWorstDetails(row) } : null;
}

export function buildDesignSynthesisCableFaultWithstandBindings(cables, request, { allCables = false } = {}) {
  if (!Array.isArray(cables) || !object(request)) return null;
  const ids = allCables || request.cableSelection?.mode === 'all-modeled' ? cables.map(cable => String(cable?.id || '')) : request.cableSelection?.cableIds;
  if (!Array.isArray(ids) || !ids.length) return null;
  const rows = [];
  for (const id of ids) {
    const matches = cables.filter(cable => String(cable?.id || '') === String(id));
    if (matches.length !== 1 || !validCable(matches[0])) return null;
    rows.push(Object.fromEntries(bindingFields.map(field => [field, field === 'branchId' ? matches[0].id
      : field === 'totalImpedanceOhms' ? { r: matches[0].r_ohm_per_kft * matches[0].lengthFt / 1000, x: matches[0].x_ohm_per_kft * matches[0].lengthFt / 1000 }
        : matches[0][field]]).filter(([, value]) => value !== undefined)));
  }
  return rows;
}

export function buildDesignSynthesisCableFaultWithstandRevisionBinding(proposal) {
  const validation = proposal?.cableFaultWithstandValidation;
  const cables = buildDesignSynthesisCableFaultWithstandBindings(proposal?.cables, proposal?.cableFaultWithstand, { allCables: true });
  if (!object(proposal) || !object(proposal.cableFaultWithstand) || !cables || validation?.status !== 'evaluated') return null;
  const feederLoadBindings = feederBindingsForProposal(proposal);
  const originalCriteria = proposal.inputs?.original?.criteria;
  if (originalCriteria !== undefined && !object(originalCriteria)) return null;
  return {
    designCriteria: originalCriteria === undefined ? null : structuredClone(originalCriteria),
    revisionBudgetBasis: {
      configuredMaximum: Number.isInteger(proposal.inputs?.original?.criteria?.loadFlow?.maxRevisions) ? proposal.inputs.original.criteria.loadFlow.maxRevisions : null,
      effectiveMaximum: Number.isInteger(proposal.inputs?.original?.criteria?.loadFlow?.maxRevisions) ? proposal.inputs.original.criteria.loadFlow.maxRevisions : 12,
    },
    request: structuredClone(proposal.cableFaultWithstand),
    cableCatalogSource: structuredClone(proposal.cableCatalogSource),
    cableCatalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT,
    cables,
    feederLoadBindings,
    faultStudyModelInputFingerprint: proposal.faultStudyValidation?.modelInputFingerprint || null,
    faultEvolutionModelInputFingerprint: proposal.faultEvolutionValidation?.modelInputFingerprint || null,
    finalThermalResult: {
      status: validation.status,
      comparison: validation.comparison,
      modelInputFingerprint: validation.modelInputFingerprint,
      caseCount: Array.isArray(validation.cases) ? validation.cases.length : 0,
      worstCase: validation.worstCase ? {
        cableId: validation.worstCase.cableId,
        faultCaseId: validation.worstCase.faultCaseId,
        exposureToAllowanceRatio: validation.worstCase.exposureToAllowanceRatio,
        comparison: validation.worstCase.comparison,
        ...spanWorstDetails(validation.worstCase),
      } : null,
    },
  };
}

function feederBindingsForProposal(proposal) {
  return Array.isArray(proposal?.feederLoadBindings) ? proposal.feederLoadBindings.map(row => ({
    feederCableId: String(row?.feederCableId || ''), loadIds: [...new Set((row?.loadIds || []).map(id => String(id)))].sort(),
  })).sort((left, right) => left.feederCableId.localeCompare(right.feederCableId))
    : (proposal?.panels || []).map(panel => ({ feederCableId: `F-${panel.id}`, loadIds: [...new Set((panel.loadIds || []).map(id => String(id)))].sort() })).sort((left, right) => left.feederCableId.localeCompare(right.feederCableId));
}

export function validateDesignSynthesisCableFaultWithstandRevision(trace, proposal) {
  if (!object(trace) || trace.schemaVersion !== '1.0.0' || !['complete', 'stopped'].includes(trace.status)
    || !object(trace.revisionBudget) || !Number.isSafeInteger(trace.revisionBudget.maximum) || trace.revisionBudget.maximum < 0 || trace.revisionBudget.maximum > 64
    || !Number.isSafeInteger(trace.revisionBudget.used) || trace.revisionBudget.used < 0
    || trace.revisionBudget.remaining !== Math.max(0, trace.revisionBudget.maximum - trace.revisionBudget.used)
    || !nonblank(trace.stopReason) || !Array.isArray(trace.initialCableSizes) || !Array.isArray(trace.history) || !trace.history.length) return false;
  const rank = size => SOURCED_SIZE_ORDER.indexOf(size);
  const sizeState = new Map();
  for (const row of trace.initialCableSizes) {
    if (!object(row) || !nonblank(row.cableId) || rank(row.size) < 0 || sizeState.has(row.cableId)
      || row.stockId !== SOURCED_MC_R_X[row.size]?.stockId) return false;
    sizeState.set(row.cableId, { size: row.size, stockId: row.stockId });
  }
  let maximumObservedRevision = 0;
  let priorAttemptLimit = -1;
  let expectedNextCandidateRevision = 1;
  for (let rowIndex = 0; rowIndex < trace.history.length; rowIndex += 1) {
    const row = trace.history[rowIndex];
    const overBudget = trace.revisionBudget.used > trace.revisionBudget.maximum;
    if (!object(row) || !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision > trace.revisionBudget.used
      || (row.revision > trace.revisionBudget.maximum && (!overBudget || trace.status !== 'stopped' || trace.stopReason !== 'absolute-revision-budget-exceeded'))
      || !['baseline', 'conductor-candidate'].includes(row.kind)
      || !['evaluated', 'blocked'].includes(row.status) || !Array.isArray(row.conductorChanges)
      || !Array.isArray(row.nestedRevisions) || !Array.isArray(row.routeChanges)
      || !Array.isArray(row.racewayChanges) || !Array.isArray(row.protectionChanges)
      || !object(row.requestedConductorFloors) || !object(row.requestedFeederFloors) || !Array.isArray(row.feederLoadBindings)
      || !['pass', 'fail', 'not-evaluated'].includes(row.thermalComparison)) return false;
    if (rowIndex === 0) {
      if (row.kind !== 'baseline' || row.revision !== 0) return false;
    } else {
      if (row.kind !== 'conductor-candidate' || row.revision !== expectedNextCandidateRevision || row.revision <= priorAttemptLimit) return false;
    }
    maximumObservedRevision = Math.max(maximumObservedRevision, row.revision);
    let nestedMaximum = row.revision;
    let priorNestedRevision = row.revision;
    for (const nested of row.nestedRevisions) {
      if (!object(nested) || !['operating', 'motor-starting', 'motor-acceleration'].includes(nested.stage)
        || !Number.isSafeInteger(nested.revision) || nested.revision < row.revision || nested.revision > trace.revisionBudget.used
        || (nested.revision > trace.revisionBudget.maximum && (!overBudget || trace.status !== 'stopped' || trace.stopReason !== 'absolute-revision-budget-exceeded'))
        || nested.revision < priorNestedRevision || !nonblank(nested.status)) return false;
      maximumObservedRevision = Math.max(maximumObservedRevision, nested.revision);
      nestedMaximum = Math.max(nestedMaximum, nested.revision);
      priorNestedRevision = nested.revision;
    }
    const changedIds = new Set();
    const floorIds = Object.keys(row.requestedConductorFloors);
    if (rowIndex > 0 && (floorIds.length !== sizeState.size || floorIds.some(id => !sizeState.has(id)))) return false;
    let raisedRequestedFloor = false;
    for (const [cableId, floorSize] of Object.entries(row.requestedConductorFloors)) {
      const prior = sizeState.get(cableId);
      if (!prior || rank(floorSize) < 0 || rank(floorSize) < rank(prior.size)) return false;
      if (rank(floorSize) > rank(prior.size)) raisedRequestedFloor = true;
    }
    if (rowIndex > 0 && !raisedRequestedFloor) return false;
    for (const [loadId, floorSize] of Object.entries(row.requestedFeederFloors)) {
      if (!nonblank(loadId) || rank(floorSize) < 0) return false;
    }
    const expectedFeederFloors = {};
    if (rowIndex > 0) {
      for (const feederBinding of trace.history[rowIndex - 1].feederLoadBindings || []) {
        const priorFeeder = sizeState.get(feederBinding.feederCableId);
        if (!priorFeeder || !Array.isArray(feederBinding.loadIds)) return false;
        for (const loadId of feederBinding.loadIds) {
          if (!nonblank(loadId) || Object.hasOwn(expectedFeederFloors, loadId)) return false;
          expectedFeederFloors[loadId] = priorFeeder.size;
        }
      }
      if (!same(row.requestedFeederFloors, Object.fromEntries(Object.entries(expectedFeederFloors).sort(([left], [right]) => left.localeCompare(right))))) return false;
    } else if (Object.keys(row.requestedFeederFloors).length) return false;
    for (const change of row.conductorChanges) {
      if (!object(change) || !nonblank(change.cableId) || !['retained', 'created', 'removed'].includes(change.identity)
        || (change.fromSize !== null && !nonblank(change.fromSize)) || (change.toSize !== null && !nonblank(change.toSize))
        || changedIds.has(change.cableId)) return false;
      changedIds.add(change.cableId);
      const current = sizeState.get(change.cableId);
      if (change.identity === 'retained') {
        const requestedFloor = row.requestedConductorFloors[change.cableId];
        if (!current || current.size !== change.fromSize || current.stockId !== change.fromStockId
          || rank(change.toSize) < 0 || rank(change.toSize) < rank(change.fromSize)
          || (requestedFloor && rank(change.toSize) < rank(requestedFloor))
          || change.fromStockId !== SOURCED_MC_R_X[change.fromSize]?.stockId
          || change.toStockId !== SOURCED_MC_R_X[change.toSize]?.stockId) return false;
        sizeState.set(change.cableId, { size: change.toSize, stockId: change.toStockId });
      } else if (change.identity === 'created') {
        if (current || change.fromSize !== null || change.fromStockId !== null || rank(change.toSize) < 0
          || change.toStockId !== SOURCED_MC_R_X[change.toSize]?.stockId) return false;
        sizeState.set(change.cableId, { size: change.toSize, stockId: change.toStockId });
      } else {
        if (!current || current.size !== change.fromSize || current.stockId !== change.fromStockId || change.toSize !== null || change.toStockId !== null
          || change.fromStockId !== SOURCED_MC_R_X[change.fromSize]?.stockId) return false;
        sizeState.delete(change.cableId);
      }
    }
    for (const [cableId, floorSize] of Object.entries(row.requestedConductorFloors)) {
      if (!sizeState.has(cableId) || rank(sizeState.get(cableId).size) < rank(floorSize)) return false;
    }
    const rowFeederIds = new Set(); const rowLoadIds = new Set();
    for (const feederBinding of row.feederLoadBindings) {
      if (!object(feederBinding) || !nonblank(feederBinding.feederCableId) || rowFeederIds.has(feederBinding.feederCableId)
        || !Array.isArray(feederBinding.loadIds) || !feederBinding.loadIds.length || !sizeState.has(feederBinding.feederCableId)) return false;
      rowFeederIds.add(feederBinding.feederCableId);
      for (const loadId of feederBinding.loadIds) {
        if (!nonblank(loadId) || rowLoadIds.has(loadId)) return false;
        rowLoadIds.add(loadId);
        const floorSize = row.requestedFeederFloors[loadId];
        if (rowIndex > 0 && (rank(floorSize) < 0 || rank(sizeState.get(feederBinding.feederCableId).size) < rank(floorSize))) return false;
      }
    }
    for (const item of [...row.routeChanges, ...row.racewayChanges, ...row.protectionChanges]) if (!object(item) || !nonblank(item.id)) return false;
    priorAttemptLimit = nestedMaximum;
    maximumObservedRevision = Math.max(maximumObservedRevision, nestedMaximum);
    if (rowIndex + 1 < trace.history.length) expectedNextCandidateRevision = nestedMaximum + 1;
  }
  if (trace.revisionBudget.used !== maximumObservedRevision) return false;
  const expectedBinding = buildDesignSynthesisCableFaultWithstandRevisionBinding(proposal);
  if (!expectedBinding || !object(trace.finalBinding) || !same(trace.finalBinding, expectedBinding)) return false;
  const expectedBudget = expectedBinding.revisionBudgetBasis.effectiveMaximum;
  if (trace.revisionBudget.maximum !== expectedBudget) return false;
  if (proposal.inputs?.original?.criteria && expectedBinding.revisionBudgetBasis.configuredMaximum !== (Number.isInteger(proposal.inputs.original.criteria.loadFlow?.maxRevisions) ? proposal.inputs.original.criteria.loadFlow.maxRevisions : null)) return false;
  const finalSizes = new Map((expectedBinding.cables || []).map(row => [String(row.id), { size: row.conductor_size, stockId: row.cableStockId || null }]));
  if (sizeState.size !== finalSizes.size || [...sizeState].some(([id, value]) => !same(value, finalSizes.get(id)))) return false;
  if (!same(trace.history.at(-1).feederLoadBindings, expectedBinding.feederLoadBindings)) return false;
  const finalPass = proposal.cableFaultWithstandValidation?.status === 'evaluated' && proposal.cableFaultWithstandValidation?.comparison === 'pass';
  const traceComplete = trace.stopReason === 'thermal-limit-passed' && finalPass;
  if (trace.status !== (traceComplete ? 'complete' : 'stopped')) return false;
  if (trace.revisionBudget.used > trace.revisionBudget.maximum
    && (trace.status !== 'stopped' || trace.stopReason !== 'absolute-revision-budget-exceeded' || traceComplete)) return false;
  const lastThermalRow = trace.history.at(-1);
  return lastThermalRow.thermalStatus === proposal.cableFaultWithstandValidation?.status
    && lastThermalRow.thermalComparison === (proposal.cableFaultWithstandValidation?.comparison || 'not-evaluated')
    && same(lastThermalRow.worstCase, summarizeDesignSynthesisCableFaultWorstCase(proposal.cableFaultWithstandValidation?.worstCase));
}

export function validateDesignSynthesisCableFaultWithstandBindings(bindings, cables, request) {
  const expected = buildDesignSynthesisCableFaultWithstandBindings(cables, request);
  return Array.isArray(bindings) && !!expected && same(bindings, expected);
}

export function rebindDesignSynthesisCableFaultWithstandBindings(bindings, canonicalCables) {
  if (!Array.isArray(bindings) || !Array.isArray(canonicalCables)) return null;
  const aligned = [];
  for (const binding of bindings) {
    const matches = canonicalCables.filter(row => String(row?.id || '') === String(binding?.id || '')
      || (!!binding?.tag && String(row?.tag || '') === String(binding.tag)));
    if (matches.length !== 1 || !validCable(matches[0])) return null;
    const row = matches[0];
    if ((!binding.tag || row.tag !== binding.tag) && String(row.id) !== String(binding.id)) return null;
    if (String(row.from).toLowerCase() !== String(binding.from).toLowerCase()
      || String(row.to).toLowerCase() !== String(binding.to).toLowerCase()) return null;
    const alignedRow = { ...row, id: binding.id, from: binding.from, to: binding.to };
    const expected = Object.fromEntries(bindingFields.map(field => [field, field === 'branchId' ? alignedRow.id
      : field === 'totalImpedanceOhms' ? { r: alignedRow.r_ohm_per_kft * alignedRow.lengthFt / 1000, x: alignedRow.x_ohm_per_kft * alignedRow.lengthFt / 1000 }
        : alignedRow[field]]));
    if (!same(expected, binding)) return null;
    aligned.push(alignedRow);
  }
  return aligned;
}

function blocked(request, issues, extra = {}) {
  const result = {
    status: 'blocked', method: CABLE_FAULT_WITHSTAND_METHOD, request: object(request) ? structuredClone(request) : null,
    modelInputFingerprint: null, cases: [], coverage: { scope: 'generated-bus-fault-cases-only', status: 'incomplete', allGeneratedCableCount: 0, generatedBusFaultCaseCount: 0, selectedCableCount: 0, evaluatedComparisonCount: 0, excludedImmediateLoadSideCaseCount: 0, excludedCoverage: ['immediate-load-side zero-impedance cases are excluded because their branch histories reuse original bus-fault currents', 'cable near-terminal and conductor interior/midspan faults are not modeled'] },
    qualificationStatus: 'unevaluated', protectionAdequacy: 'unevaluated', evidenceStatus: 'supplied-unverified', issues, limitations: [
      'This is a conditional single-event adiabatic RMS screening comparison, not a complete cable qualification or protection-adequacy determination.',
      'Only generated bus-fault cases are covered; conductor near-terminal and interior/midspan faults are not modeled.',
      'The supplied maximum total-clearing time and applicability statement are not independently authenticated, and actual device clearing/let-through is not calculated.',
      'A single event starting at or below 90 °C is assumed only with adequate thermal recovery before the event; repeated-event accumulation is not modeled.',
    ], ...extra,
  };
  if (request?.faultSelection?.mode === CONTINUOUS_CABLE_FAULT_SELECTION) {
    result.coverage = { ...result.coverage, scope: 'generated-bus-and-continuous-cable-span-faults', status: 'incomplete',
      excludedCoverage: ['No complete continuous span result is available; numerical values are withheld.', 'Earth, neutral, armor/sheath faults and repeated-event heating are outside this model.'] };
    result.limitations = result.limitations.filter(line => !line.startsWith('Only generated bus-fault cases'));
  }
  return result;
}

function validateRequest(request, issues) {
  const allowed = ['schemaVersion', 'cableSelection', 'faultSelection', 'clearing', 'thermal'];
  if (!object(request)) { issues.push(issue('CABLE_FAULT_WITHSTAND_REQUEST_REQUIRED', 'cableFaultWithstand', 'An explicit structured cable fault-withstand request is required.')); return; }
  for (const key of Object.keys(request)) if (!allowed.includes(key)) issues.push(issue('CABLE_FAULT_WITHSTAND_UNKNOWN_FIELD', `cableFaultWithstand.${key}`, 'Field is outside the explicit cable fault-withstand request contract.'));
  if (request.schemaVersion !== '1.0.0') issues.push(issue('CABLE_FAULT_WITHSTAND_SCHEMA', 'cableFaultWithstand.schemaVersion', 'schemaVersion must be 1.0.0.'));
  const cs = request.cableSelection;
  if (!object(cs) || !['all-modeled', 'selected'].includes(cs.mode)) issues.push(issue('CABLE_FAULT_WITHSTAND_CABLE_SELECTION', 'cableFaultWithstand.cableSelection', 'Choose all-modeled or selected cables explicitly.'));
  else if (cs.mode === 'all-modeled' && Object.keys(cs).some(key => key !== 'mode')) issues.push(issue('CABLE_FAULT_WITHSTAND_CABLE_SELECTION', 'cableFaultWithstand.cableSelection', 'all-modeled selection does not accept an explicit ID list.'));
  else if (cs.mode === 'selected' && (!Array.isArray(cs.cableIds) || !cs.cableIds.length || cs.cableIds.some(id => !nonblank(id)) || new Set(cs.cableIds).size !== cs.cableIds.length || Object.keys(cs).some(key => !['mode', 'cableIds'].includes(key)))) issues.push(issue('CABLE_FAULT_WITHSTAND_CABLE_SELECTION', 'cableFaultWithstand.cableSelection.cableIds', 'selected mode requires unique, nonblank cable IDs.'));
  if (!object(request.faultSelection) || !['all-generated-bus-fault-cases', CONTINUOUS_CABLE_FAULT_SELECTION].includes(request.faultSelection.mode) || Object.keys(request.faultSelection).some(key => key !== 'mode')) issues.push(issue('CABLE_FAULT_WITHSTAND_FAULT_SELECTION', 'cableFaultWithstand.faultSelection', 'Choose all-generated-bus-and-cable-span-faults for continuous coverage, or the legacy all-generated-bus-fault-cases scope.'));
  const clearing = request.clearing;
  if (!object(clearing) || !finite(clearing.maximumTotalClearingTimeS) || clearing.maximumTotalClearingTimeS < 0.1 || clearing.maximumTotalClearingTimeS > 5
    || !nonblank(clearing.reference) || !nonblank(clearing.applicabilityReference) || clearing.appliesToAllModeledSources !== true
    || Object.keys(clearing).some(key => !['maximumTotalClearingTimeS', 'reference', 'applicabilityReference', 'appliesToAllModeledSources'].includes(key))) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_CLEARING_BASIS', 'cableFaultWithstand.clearing', 'Supply a 0.1–5 s maximum total-clearing claim, separate nonblank time/applicability references, and explicit applicability to all modeled sources. These claims remain unverified.'));
  }
  const thermal = request.thermal;
  if (!object(thermal) || thermal.conductorMaterial !== 'copper' || !finite(thermal.maximumInitialTemperatureC) || thermal.maximumInitialTemperatureC <= -273.15 || thermal.maximumInitialTemperatureC > 90 || thermal.finalTemperatureC !== 250
    || thermal.singleEvent !== true || thermal.adequateRecoveryBeforeEvent !== true || !nonblank(thermal.reference)
    || Object.keys(thermal).some(key => !['conductorMaterial', 'maximumInitialTemperatureC', 'finalTemperatureC', 'singleEvent', 'adequateRecoveryBeforeEvent', 'reference'].includes(key))) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_THERMAL_BASIS', 'cableFaultWithstand.thermal', 'Declare a single copper-conductor event from no more than 90 °C to 250 °C, adequate recovery before the event, and a separate condition reference.'));
  }
}

function validCable(cable) {
  if (!object(cable) || !nonblank(cable.id) || cable.cableCatalogFingerprint !== SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT) return false;
  const size = String(cable.conductor_size || cable.conductorSize || cable.size || '');
  const row = SOURCED_MC_R_X[size];
  if (!nonblank(cable.from) || !nonblank(cable.to) || !finite(cable.lengthFt) || cable.lengthFt < 0
    || (cable.length !== undefined && cable.length !== cable.lengthFt)
    || (cable.fromBusId !== undefined && String(cable.fromBusId) !== String(cable.from))
    || (cable.toBusId !== undefined && String(cable.toBusId) !== String(cable.to))) return false;
  if (['conductor_size', 'conductorSize', 'size'].some(key => cable[key] !== undefined && String(cable[key]).trim() !== size)) return false;
  for (const field of ['conductorMaterial', 'conductor_material']) if (cable[field] !== undefined && !['cu', 'copper'].includes(String(cable[field]).trim().toLowerCase())) return false;
  for (const field of ['cable_od', 'outerDiameterIn', 'diameter']) if (cable[field] !== undefined && cable[field] !== row?.od) return false;
  for (const field of ['conductor_count', 'conductors', 'conductors_per_cable']) if (cable[field] !== undefined && cable[field] !== 3) return false;
  for (const field of ['cable_rating', 'cableRating']) if (cable[field] !== undefined && cable[field] !== 600) return false;
  for (const field of ['source', 'impedanceBasis']) if (cable[field] !== undefined && cable[field] !== row?.source) return false;
  for (const field of ['cableConstructionSource', 'constructionSource', 'construction_source']) if (cable[field] !== undefined && ![row?.source, SOUTHWIRE_MC_SOURCE.sourceId].includes(cable[field])) return false;
  return !!row && cable.cableStockId === row.stockId && cable.r_ohm_per_kft === row.r && cable.x_ohm_per_kft === row.x
    && cable.cable_od === row.od && cable.outerDiameterIn === row.od
    && cable.conductor_count === 3 && cable.cable_rating === 600
    && ['cu', 'copper'].includes(String(cable.conductorMaterial || '').trim().toLowerCase())
    && ['cu', 'copper'].includes(String(cable.conductor_material || '').trim().toLowerCase())
    && cable.impedanceBasis === row.source && cable.cableConstructionSource === row.source;
}

function integrateTo(rows, endpoint, path, issues) {
  if (!Array.isArray(rows) || rows.length < 2 || rows[0]?.timeS !== 0 || rows.at(-1)?.timeS < endpoint) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_COVERAGE', path, 'The signed branch history must begin at zero and cover the requested clearing endpoint without extrapolation.'));
    return null;
  }
  const clipped = [];
  for (const row of rows) {
    if (!finite(row?.timeS) || !object(row.currentKA) || !finite(row.currentKA.re) || !finite(row.currentKA.im)
      || !finite(row.currentKA.re * 1000) || !finite(row.currentKA.im * 1000)) {
      issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_INVALID', path, 'History knots require finite times and finite complex current phasors.'));
      return null;
    }
    const currentA = { re: row.currentKA.re * 1000, im: row.currentKA.im * 1000 };
    if (clipped.length && row.timeS <= clipped.at(-1).timeS) {
      issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_INVALID', path, 'History knot times must be strictly increasing.'));
      return null;
    }
    if (row.timeS <= endpoint) {
      clipped.push({ timeS: row.timeS, currentA });
      if (row.timeS === endpoint) break;
    }
    else {
      const left = clipped.at(-1);
      if (!left) return null;
      const ratio = (endpoint - left.timeS) / (row.timeS - left.timeS);
      clipped.push({ timeS: endpoint, currentA: { re: left.currentA.re + ratio * (currentA.re - left.currentA.re), im: left.currentA.im + ratio * (currentA.im - left.currentA.im) } });
      break;
    }
  }
  if (clipped.at(-1)?.timeS !== endpoint) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_COVERAGE', path, 'The requested clearing endpoint could not be represented within the supplied knots.'));
    return null;
  }
  let exposure = 0;
  for (let index = 1; index < clipped.length; index += 1) {
    const left = clipped[index - 1]; const right = clipped[index]; const dt = right.timeS - left.timeS;
    const currentScale = Math.max(Math.abs(left.currentA.re), Math.abs(left.currentA.im), Math.abs(right.currentA.re), Math.abs(right.currentA.im));
    const normalizedLeft = currentScale ? { re: left.currentA.re / currentScale, im: left.currentA.im / currentScale } : { re: 0, im: 0 };
    const normalizedRight = currentScale ? { re: right.currentA.re / currentScale, im: right.currentA.im / currentScale } : { re: 0, im: 0 };
    const dot = normalizedLeft.re * normalizedRight.re + normalizedLeft.im * normalizedRight.im;
    const normalizedIntegral = dt * (magnitudeSquared(normalizedLeft) + dot + magnitudeSquared(normalizedRight)) / 3;
    const segment = normalizedIntegral * currentScale * currentScale;
    exposure += segment;
    if (!finite(segment) || segment < 0 || !finite(exposure) || (segment === 0 && currentScale !== 0)) {
      issues.push(issue('CABLE_FAULT_WITHSTAND_EXPOSURE_RANGE', path, 'The integrated ampere-squared seconds left the finite nonnegative numeric range.'));
      return null;
    }
  }
  return { currentSquaredExposureA2S: exposure, endpointCurrentA: clipped.at(-1).currentA };
}

/** Conditional adiabatic phase-conductor screen using only exact finalized catalog and bus-fault history identities. */
export function evaluateDesignSynthesisCableFaultWithstand(options = {}) {
  if (!object(options)) return blocked(null, [issue('CABLE_FAULT_WITHSTAND_OPTIONS_INVALID', 'options', 'Evaluation options must be a structured object.')]);
  const { request, proposal, faultStudyValidation = proposal?.faultStudyValidation, faultEvolutionValidation = proposal?.faultEvolutionValidation } = options;
  const issues = [];
  validateRequest(request, issues);
  if (issues.length) return blocked(request, issues);
  const cables = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const faultCases = Array.isArray(faultEvolutionValidation?.faultCases) ? faultEvolutionValidation.faultCases : [];
  if (faultEvolutionValidation?.status !== 'evaluated' || !faultEvolutionValidation.modelInputFingerprint || !Array.isArray(faultEvolutionValidation.timeKnotsS)) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_REQUIRED', 'faultEvolutionValidation', 'A fresh complete signed fault-evolution history is required.'));
  }
  const knots = faultEvolutionValidation?.timeKnotsS;
  if (faultEvolutionValidation?.coverage?.status !== 'complete' || !Array.isArray(knots) || knots.length < 2 || knots[0] !== 0
    || knots.some((time, index) => !finite(time) || time < 0 || (index > 0 && time <= knots[index - 1]))
    || !finite(proposal?.faultEvolution?.horizonS) || proposal.faultEvolution.horizonS !== knots?.at(-1)) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_HISTORY_KNOTS', 'faultEvolutionValidation.timeKnotsS', 'A complete fault-evolution history with strictly increasing finite knots from zero through the declared horizon is required.'));
  }
  if (!same(proposal?.cableCatalogSource, SOUTHWIRE_MC_SOURCE) || !cables.length || cables.some(cable => !validCable(cable))) issues.push(issue('CABLE_FAULT_WITHSTAND_CATALOG_IDENTITY', 'proposal.cables', 'The current frozen catalog source object and every final cable stock, source fingerprint, construction, conductor count, rating, dimensions, and impedance must match.'));
  const selectedIds = request?.cableSelection?.mode === 'all-modeled' ? cables.map(cable => String(cable.id)) : request?.cableSelection?.cableIds || [];
  const selected = [];
  for (const id of selectedIds) {
    const matches = cables.filter(cable => String(cable.id) === String(id));
    if (matches.length !== 1) issues.push(issue('CABLE_FAULT_WITHSTAND_CABLE_IDENTITY', `cableFaultWithstand.cableSelection.${id}`, 'Each requested cable must match exactly one final canonical schedule identity.'));
    else selected.push(matches[0]);
  }
  if (request?.cableSelection?.mode === 'selected' && selected.length !== selectedIds.length) issues.push(issue('CABLE_FAULT_WITHSTAND_SELECTION_INCOMPLETE', 'cableFaultWithstand.cableSelection', 'One or more selected cable IDs could not be resolved uniquely.'));
  const busCases = faultCases.filter(row => row?.caseKind === 'generated-bus-fault');
  const excludedImmediateLoadSideCaseCount = faultCases.filter(row => row?.caseKind === 'immediate-load-side-zero-impedance-fault').length;
  if (faultCases.some(row => !['generated-bus-fault', 'immediate-load-side-zero-impedance-fault'].includes(row?.caseKind))) issues.push(issue('CABLE_FAULT_WITHSTAND_CASE_KIND', 'faultEvolutionValidation.faultCases', 'The history contains an unknown case class outside the generated bus and excluded immediate-load-side set.'));
  if (!busCases.length || busCases.some(row => !nonblank(row.caseId) || !nonblank(row.faultBusId) || !Array.isArray(row.timeRows))) issues.push(issue('CABLE_FAULT_WITHSTAND_CASE_COVERAGE', 'faultEvolutionValidation.faultCases', 'Every generated bus-fault case requires an exact ID, fault bus, and time-row history.'));
  const faultStudyCases = Array.isArray(faultStudyValidation?.cases) ? faultStudyValidation.cases : [];
  const expectedBusIds = faultStudyCases.filter(row => row?.status === 'evaluated').map(row => String(row.fault?.busId || row.busId || ''));
  if (faultStudyValidation?.status !== 'evaluated' || faultStudyValidation?.coverage?.status !== 'complete' || !expectedBusIds.length
    || faultStudyCases.some(row => row?.status !== 'evaluated') || expectedBusIds.some(id => !id) || new Set(expectedBusIds).size !== expectedBusIds.length
    || expectedBusIds.length !== busCases.length || busCases.some((row, index) => row.caseId !== `bus-fault:${row.faultBusId}` || String(row.faultBusId) !== expectedBusIds[index])
    || new Set(busCases.map(row => row.caseId)).size !== busCases.length || new Set(busCases.map(row => String(row.faultBusId))).size !== busCases.length
    || !same(faultEvolutionValidation?.coverage?.faultBusIds, expectedBusIds)
    || faultEvolutionValidation?.coverage?.historyCaseCount !== faultCases.length) {
    issues.push(issue('CABLE_FAULT_WITHSTAND_CASE_BIJECTION', 'faultEvolutionValidation.faultCases', 'Generated bus-fault histories must bijectively match every current evaluated initial fault-study bus in canonical order.'));
  }
  for (const faultCase of faultCases) {
    if (!Array.isArray(faultCase?.timeRows) || faultCase.timeRows.length !== knots?.length || faultCase.timeRows.some((row, index) => row?.timeS !== knots[index])) {
      issues.push(issue('CABLE_FAULT_WITHSTAND_CASE_TIME_GRID', `faultEvolutionValidation.${faultCase?.caseId || 'case'}`, 'Every generated and excluded case row must retain the exact complete common history knot list.'));
      break;
    }
  }
  if (selected.length * busCases.length > 12000 || selected.length * busCases.length * (faultEvolutionValidation?.timeKnotsS?.length || 0) > 150000) issues.push(issue('CABLE_FAULT_WITHSTAND_OUTPUT_LIMIT', 'cableFaultWithstand', 'The selected cable-by-fault comparison exceeds the existing bounded study output budget.'));
  if (issues.length) return blocked(request, issues, { coverage: { scope: 'generated-bus-fault-cases-only', status: 'incomplete', allGeneratedCableCount: cables.length, generatedBusFaultCaseCount: busCases.length, selectedCableCount: selected.length, evaluatedComparisonCount: 0, excludedImmediateLoadSideCaseCount, excludedCoverage: ['immediate-load-side zero-impedance cases are excluded because their branch histories reuse original bus-fault currents', 'cable near-terminal and conductor interior/midspan faults are not modeled'] } });

  const clearingTime = request.clearing.maximumTotalClearingTimeS;
  const cases = [];
  const branchRowsByCase = new Map();
  for (const faultCase of busCases) {
    branchRowsByCase.set(faultCase.caseId, faultCase.timeRows.map(timeRow => {
      const map = new Map();
      for (const row of Array.isArray(timeRow?.branchCurrents) ? timeRow.branchCurrents : []) {
        const id = String(row?.branchId);
        const matches = map.get(id) || [];
        matches.push(row);
        map.set(id, matches);
      }
      return map;
    }));
  }
  for (const cable of selected) {
    const area = AREAS_CMIL[cable.conductor_size];
    const allowable = (area * 0.0719) ** 2;
    if (!finite(allowable) || allowable <= 0) return blocked(request, [issue('CABLE_FAULT_WITHSTAND_AREA', `proposal.cables.${cable.id}.conductor_size`, 'No sourced nominal circular-mil area is available for this conductor size.')]);
    for (const faultCase of busCases) {
      const branchRows = faultCase.timeRows.map((timeRow, index) => {
        const matches = branchRowsByCase.get(faultCase.caseId)?.[index]?.get(String(cable.id)) || [];
        if (matches.length !== 1) {
          issues.push(issue('CABLE_FAULT_WITHSTAND_BRANCH_HISTORY', `faultEvolutionValidation.${faultCase.caseId}.timeRows[${index}]`, 'Exactly one signed branch-current record for the selected cable is required at every knot.'));
          return null;
        }
        const row = matches[0];
        if (String(row.fromBusId) !== String(cable.from) || String(row.toBusId) !== String(cable.to)
          || !object(row.fromCurrentIntoBranchKA) || !object(row.toCurrentIntoBranchKA)
          || !['re', 'im'].every(key => finite(row.fromCurrentIntoBranchKA[key]) && finite(row.toCurrentIntoBranchKA[key]))) {
          issues.push(issue('CABLE_FAULT_WITHSTAND_TERMINAL_IDENTITY', `faultEvolutionValidation.${faultCase.caseId}.timeRows[${index}]`, 'Both signed phasor terminals must match the exact cable orientation and contain finite complex values.'));
          return null;
        }
        const sum = { re: row.fromCurrentIntoBranchKA.re + row.toCurrentIntoBranchKA.re, im: row.fromCurrentIntoBranchKA.im + row.toCurrentIntoBranchKA.im };
        const scale = Math.max(1, Math.hypot(row.fromCurrentIntoBranchKA.re, row.fromCurrentIntoBranchKA.im), Math.hypot(row.toCurrentIntoBranchKA.re, row.toCurrentIntoBranchKA.im));
        if (Math.hypot(sum.re, sum.im) > 1e-8 * scale) issues.push(issue('CABLE_FAULT_WITHSTAND_TERMINAL_KCL', `faultEvolutionValidation.${faultCase.caseId}.timeRows[${index}]`, 'Signed cable terminal currents must be equal and opposite within the numerical consistency bound.'));
        return { timeS: timeRow.timeS, from: row.fromCurrentIntoBranchKA, to: row.toCurrentIntoBranchKA };
      });
      if (branchRows.some(row => !row)) continue;
      const from = integrateTo(branchRows.map(row => ({ timeS: row.timeS, currentKA: row.from })), clearingTime, `cables.${cable.id}.${faultCase.caseId}.from`, issues);
      const to = integrateTo(branchRows.map(row => ({ timeS: row.timeS, currentKA: row.to })), clearingTime, `cables.${cable.id}.${faultCase.caseId}.to`, issues);
      if (!from || !to) continue;
      const controllingTerminal = from.currentSquaredExposureA2S >= to.currentSquaredExposureA2S ? 'from' : 'to';
      const controlling = controllingTerminal === 'from' ? from : to;
      cases.push({ cableId: String(cable.id), cableStockId: cable.cableStockId, conductorSize: cable.conductor_size, conductorAreaCmil: area, catalogFingerprint: cable.cableCatalogFingerprint,
        faultCaseId: faultCase.caseId, faultBusId: String(faultCase.faultBusId), maximumTotalClearingTimeS: clearingTime,
        fromCurrentSquaredExposureA2S: from.currentSquaredExposureA2S, toCurrentSquaredExposureA2S: to.currentSquaredExposureA2S,
        controllingTerminal, currentSquaredExposureA2S: controlling.currentSquaredExposureA2S, allowableCurrentSquaredExposureA2S: allowable,
        exposureToAllowanceRatio: controlling.currentSquaredExposureA2S / allowable,
        comparison: controlling.currentSquaredExposureA2S <= allowable ? 'pass' : 'fail' });
    }
  }
  if (issues.length || cases.length !== selected.length * busCases.length) return blocked(request, issues.length ? issues : [issue('CABLE_FAULT_WITHSTAND_COMPARISON_INCOMPLETE', 'cableFaultWithstand', 'Not every selected cable × generated-bus-fault comparison was completed.')], { coverage: { scope: 'generated-bus-fault-cases-only', status: 'incomplete', allGeneratedCableCount: cables.length, generatedBusFaultCaseCount: busCases.length, selectedCableCount: selected.length, evaluatedComparisonCount: cases.length, excludedImmediateLoadSideCaseCount, excludedCoverage: ['immediate-load-side zero-impedance cases are excluded because their branch histories reuse original bus-fault currents', 'cable near-terminal and conductor interior/midspan faults are not modeled'] } });
  const worstCase = cases.reduce((worst, row) => !worst || row.exposureToAllowanceRatio > worst.exposureToAllowanceRatio ? row : worst, null);
  const result = {
    status: 'evaluated', method: CABLE_FAULT_WITHSTAND_METHOD, request: structuredClone(request),
    modelInputFingerprint: fingerprintStudyValue({ method: CABLE_FAULT_WITHSTAND_METHOD, source: CABLE_FAULT_WITHSTAND_SOURCE, request, cableBindings: buildDesignSynthesisCableFaultWithstandBindings(selected, request), faultEvolutionModelInputFingerprint: faultEvolutionValidation.modelInputFingerprint, history: busCases.map(row => ({ caseId: row.caseId, faultBusId: row.faultBusId, timeRows: row.timeRows.map(timeRow => ({ timeS: timeRow.timeS, branchCurrents: timeRow.branchCurrents })) })) }),
    source: CABLE_FAULT_WITHSTAND_SOURCE,
    cases,
    worstCase: worstCase ? { cableId: worstCase.cableId, cableStockId: worstCase.cableStockId, conductorSize: worstCase.conductorSize, faultCaseId: worstCase.faultCaseId, faultBusId: worstCase.faultBusId, exposureToAllowanceRatio: worstCase.exposureToAllowanceRatio, comparison: worstCase.comparison } : null,
    comparison: cases.every(row => row.comparison === 'pass') ? 'pass' : 'fail',
    coverage: { scope: 'generated-bus-fault-cases-only', status: 'complete-for-selected-scope', allGeneratedCableCount: cables.length, generatedBusFaultCaseCount: busCases.length, selectedCableCount: selected.length, evaluatedComparisonCount: cases.length, selectedCableIds: selected.map(cable => String(cable.id)), excludedImmediateLoadSideCaseCount,
      excludedCoverage: ['immediate-load-side zero-impedance cases are excluded because their branch histories reuse original bus-fault currents', 'cable near-terminal faults are not modeled', 'conductor interior and midspan faults are not modeled'] },
    qualificationStatus: 'unevaluated', protectionAdequacy: 'unevaluated', evidenceStatus: 'supplied-unverified',
    assumptions: { initialConductorTemperatureMaximumC: request.thermal.maximumInitialTemperatureC, methodInitialTemperatureC: 90, finalConductorTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, currentBasis: 'per-phase RMS current in one phase conductor', terminalMethod: 'independently integrate both signed endpoint phasors, then use larger exposure', clearingClaim: 'supplied maximum total-clearing claim applicable to all modeled sources; not independently authenticated' },
    limitations: [
      'This is a conditional single-event adiabatic RMS screening comparison, not a complete cable qualification or protection-adequacy determination.',
      'Only generated bus-fault cases are covered; conductor near-terminal and interior/midspan faults are not modeled.',
      'The supplied maximum total-clearing time and applicability statement are not independently authenticated, and actual device clearing/let-through is not calculated.',
      'A single event starting at or below 90 °C is assumed only with adequate thermal recovery before the event; repeated-event accumulation is not modeled.',
      'DC offset, asymmetrical peak duty, transient heating and protective-device coordination are outside this comparison.',
    ],
    issues: [],
  };
  return request.faultSelection.mode === CONTINUOUS_CABLE_FAULT_SELECTION
    ? extendContinuousCableSpanCoverage(result, { proposal, request, faultStudyValidation, selected, knots }) : result;
}

// This compact reconstruction context is checked against the authoritative
// initial-study model fingerprint on reload. The dense response operator is
// recomputed transiently and never stored in the project document.
export function buildDesignSynthesisCableSpanProposalContext(proposal) {
  if (!object(proposal?.inputs?.original?.supply) || !Array.isArray(proposal?.equipment) || !Array.isArray(proposal?.loads) || !object(proposal?.oneLine)) return null;
  const encode = value => value === undefined ? { $cableSpanUndefined: true }
    : Array.isArray(value) ? value.map(encode)
      : object(value) ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) : value;
  return { encoding: 'cable-span-proposal-context-v1', value: encode({ equipment: proposal.equipment, loads: proposal.loads, transformer: proposal.transformer || null,
    oneLine: proposal.oneLine, inputs: { original: { supply: proposal.inputs.original.supply } } }) };
}

export function restoreDesignSynthesisCableSpanProposalContext(encoded) {
  if (!object(encoded) || encoded.encoding !== 'cable-span-proposal-context-v1' || !object(encoded.value)) return null;
  const decode = value => object(value) && Object.keys(value).length === 1 && value.$cableSpanUndefined === true ? undefined
    : Array.isArray(value) ? value.map(decode)
      : object(value) ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)])) : value;
  return decode(encoded.value);
}

function extendContinuousCableSpanCoverage(busResult, { proposal, request, faultStudyValidation, selected, knots }) {
  const incomplete = (code, message, extraIssues = []) => blocked(request, [issue(code, 'cableFaultWithstand.faultSelection', message), ...extraIssues], {
    coverage: { ...busResult.coverage, scope: 'generated-bus-and-continuous-cable-span-faults', status: 'incomplete', evaluatedComparisonCount: 0 },
    limitations: busResult.limitations.filter(line => !line.startsWith('Only generated bus-fault cases')),
  });
  const built = buildDesignSynthesisFaultNetwork({ proposal, faultStudy: proposal?.faultStudy });
  if (built.status !== 'ready' || built.modelInputFingerprint !== faultStudyValidation?.modelInputFingerprint) return incomplete('CABLE_SPAN_NETWORK_BINDING', 'Continuous cable faults require the exact current canonical network used by the initial fault study.', built.issues || []);
  if (built.network.faultBusIds.length !== built.network.buses.length || built.network.buses.some(bus => !built.network.faultBusIds.includes(bus.id))) return incomplete('CABLE_SPAN_BUS_COVERAGE', 'This scope requires every generated bus fault as well as every generated cable span; a restricted faultBusIds list is incomplete.');
  const pairCount = proposal.cables.length * selected.length;
  const totalCount = busResult.coverage.evaluatedComparisonCount + pairCount;
  if (totalCount > 12000 || totalCount * knots.length > 150000) return incomplete('CABLE_SPAN_OUTPUT_LIMIT', 'The combined bus and continuous cable-span pairs exceed the unchanged comparison or knot-work budget.');
  const { faultBusIds: _faultBusIds, ...network } = built.network;
  const span = evaluateCableSpanFaultEnvelope({ network, faultSpanBranchIds: proposal.cables.map(row => String(row.id)), targetBranchIds: selected.map(row => String(row.id)),
    profiles: proposal.faultEvolution?.profiles, clearingTimeS: request.clearing.maximumTotalClearingTimeS,
    allowancesByBranchId: Object.fromEntries(selected.map(row => [String(row.id), (AREAS_CMIL[row.conductor_size] * 0.0719) ** 2])) });
  if (span.status !== 'evaluated') return incomplete('CABLE_SPAN_COMPARISON_INCOMPLETE', 'At least one continuous cable-span pair could not be completely evaluated; no partial passing coverage is reported.', span.issues.map(row => issue(row.code, `cables.${row.targetBranchId || row.faultSpanId || 'span'}`, JSON.stringify(row))));
  const spanCases = span.targetResults.map(row => {
    const cable = selected.find(item => String(item.id) === row.branchId);
    const terminal = row.from.exposureUpper >= row.to.exposureUpper ? 'from' : 'to';
    const worst = row[terminal];
    return { cableId: row.branchId, cableStockId: cable.cableStockId, conductorSize: cable.conductor_size, conductorAreaCmil: AREAS_CMIL[cable.conductor_size], catalogFingerprint: cable.cableCatalogFingerprint,
      caseKind: 'continuous-cable-span-envelope', faultCaseId: `cable-span-envelope:${row.branchId}`, faultBusId: null,
      faultSpanId: worst.faultSpanId, faultPosition: worst.position, faultPositionInterval: worst.positionInterval,
      maximumTotalClearingTimeS: request.clearing.maximumTotalClearingTimeS,
      fromCurrentSquaredExposureA2S: row.from.exposureUpper, toCurrentSquaredExposureA2S: row.to.exposureUpper,
      currentSquaredExposureA2S: worst.exposureUpper, allowableCurrentSquaredExposureA2S: row.allowableCurrentSquaredExposureA2S,
      controllingTerminal: terminal, exposureToAllowanceRatio: worst.exposureUpper / row.allowableCurrentSquaredExposureA2S,
      comparison: row.comparison, fromEnvelope: row.from, toEnvelope: row.to };
  });
  const cases = [...busResult.cases, ...spanCases];
  const failures = cases.filter(row => row.comparison === 'fail');
  const worst = (failures.length ? failures : cases).reduce((a, b) => !a || b.exposureToAllowanceRatio > a.exposureToAllowanceRatio ? b : a, null);
  return { ...busResult, cases, comparison: failures.length ? 'fail' : 'pass',
    modelInputFingerprint: fingerprintStudyValue({ busModel: busResult.modelInputFingerprint, spanModel: span.modelInputFingerprint }),
    spanValidation: span,
    worstCase: worst ? { cableId: worst.cableId, cableStockId: worst.cableStockId, conductorSize: worst.conductorSize, faultCaseId: worst.faultCaseId, faultBusId: worst.faultBusId,
      exposureToAllowanceRatio: worst.exposureToAllowanceRatio, comparison: worst.comparison,
      ...(worst.caseKind ? { caseKind: worst.caseKind, faultSpanId: worst.faultSpanId, faultPosition: worst.faultPosition, faultPositionInterval: worst.faultPositionInterval } : {}) } : null,
    coverage: { ...busResult.coverage, scope: 'generated-bus-and-continuous-cable-span-faults', evaluatedComparisonCount: totalCount,
      generatedCableSpanCount: proposal.cables.length, evaluatedSpanTargetPairCount: pairCount, representedSpanEnvelopeCount: spanCases.length,
      faultSpanIds: proposal.cables.map(row => String(row.id)), spanCoverage: span.coverage,
      excludedCoverage: ['immediate-load-side device-history surrogate rows are excluded; actual cable-side limiting faults are evaluated separately', 'earth, neutral, armor/sheath faults and repeated-event heating are not modeled'] },
    assumptions: { ...busResult.assumptions, terminalMethod: 'bus terminal histories plus independent from/to half-conductor and other-conductor exposure extrema over every closed cable span' },
    limitations: [...busResult.limitations.filter(line => !line.startsWith('Only generated bus-fault cases')), ...span.limitations,
      'Reported worst locations can have overlapping certified coefficient-model enclosures; possible positions and fault spans remain explicit in the result JSON.'] };
}

export function sameCableFaultWithstandResult(left, right) { return same(left, right); }

export default { CABLE_FAULT_WITHSTAND_METHOD, CABLE_FAULT_WITHSTAND_SOURCE, buildDesignSynthesisCableFaultWithstandBindings, evaluateDesignSynthesisCableFaultWithstand, rebindDesignSynthesisCableFaultWithstandBindings, sameCableFaultWithstandResult, validateDesignSynthesisCableFaultWithstandBindings };
