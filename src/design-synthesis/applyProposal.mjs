import * as dataStore from '../../dataStore.mjs';
import { beginProjectMutationBatch, endProjectMutationBatch, captureProjectTransactionSnapshot, restoreProjectTransactionSnapshot, getProjectStorageDiagnostics, getProjectState, setProjectState } from '../../projectStorage.js';
import { getPanelLocationOverrideCandidates as getPanelLocationOverrideCandidatesPure, reconcileDesignProposal } from '../../analysis/designProposalReconcile.mjs';
import { fingerprintStudyValue } from '../../analysis/studyLifecycle.mjs';
import { evaluateEatonConstantCurrentPlot, getEatonCurveResearchFingerprint } from '../../analysis/designSynthesisEatonCurveResearch.mjs';
import { applyProjectEquipmentIdentityMap, bindDesignSynthesisProjectEquipmentProposal, validateDesignSynthesisProjectEquipmentAdoption } from '../../analysis/designSynthesisProjectEquipment.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from '../../analysis/designSynthesisCableCatalog.mjs';
import { normalizeProjectEntities } from '../../analysis/projectIntegration.mjs';
import { encodeBase64, decodeBase64, encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes, compressFaultBytes, decompressFaultBytes } from './faultEvidenceCodec.mjs';
import { isDeviceEvidenceEnvelope } from '../../utils/designSynthesisDeviceEvidenceCodec.mjs';
import { DEVICE_INLINE_FIELDS, DEVICE_SUMMARY_FIELDS, exactStoredValueEqual, resolveReferencedDeviceEvidence } from './deviceEvidence.mjs';
import { fingerprintProjectRecord } from '../../utils/projectRecordFingerprint.mjs';
import { planProjectTrayReconciliation } from '../../analysis/designSynthesisProjectTrayReconcile.mjs';
import { validateProjectTrayReuseBinding } from '../../analysis/designSynthesisProjectTrayReuse.mjs';
import { generateDesignProposal } from '../../analysis/designSynthesis.mjs';
export { encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes, compressFaultBytes, decompressFaultBytes } from './faultEvidenceCodec.mjs';
import { FAULT_EVOLUTION_VALIDATION_KEY, getDesignSynthesisFaultEvolutionContext, packDesignSynthesisFaultEvolutionValidation, resolveDesignSynthesisFaultEvolutionValidation, validateDesignSynthesisFaultEvolutionForPersistence } from './faultEvolutionPersistence.mjs';
import { evaluateDesignSynthesisCableFaultWithstand, sameCableFaultWithstandResult, validateDesignSynthesisCableFaultWithstandRevision } from '../../analysis/designSynthesisCableFaultWithstand.mjs';
export { FAULT_EVOLUTION_VALIDATION_KEY, getDesignSynthesisFaultEvolutionContext, resolveDesignSynthesisFaultEvolutionValidation } from './faultEvolutionPersistence.mjs';
export const CABLE_CATALOG_SOURCE_KEY = 'designSynthesisCableCatalogSource';

const LAST_APPLIED_KEY = 'designSynthesisLastApplied';
const INPUT_SIGNATURE_KEY = 'designSynthesisInputSignature';
const DEVICE_EVIDENCE_KEY = 'designSynthesisDeviceEvidence';
const INPUT_EVIDENCE_KEY = 'designSynthesisInputEvidence';
const LOAD_FLOW_VALIDATION_KEY = 'designSynthesisLoadFlowValidation';
const FAULT_STUDY_VALIDATION_KEY = 'designSynthesisFaultStudyValidation';
const DEVICE_FAULT_VALIDATION_KEY = 'designSynthesisDeviceFaultValidation';
const FAULT_SCENARIO_VALIDATION_KEY = 'designSynthesisFaultScenarioValidation';
const INPUT_EVIDENCE_COMPACT_SCHEMA = 'design-synthesis-input-evidence-v1';
const FAULT_BRANCH_DUTY_ENCODING = 'uint16-index-lz77-float64-le-base64-v1';
const FAULT_BRANCH_DUTY_UTF15_ENCODING = 'uint16-index-lz77-float64-le-utf15-v1';
const FAULT_BRANCH_DUTY_BASE64_ENCODINGS = new Set([
  FAULT_BRANCH_DUTY_ENCODING,
  'uint32-index-lz77-float64-le-base64-v1',
]);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stripMarker(value) {
  const copy = clone(value);
  if (copy && typeof copy === 'object') delete copy._designSynthesis;
  return copy;
}

function snapshotMatches(value, snapshot) {
  if (snapshot && typeof snapshot === 'object' && typeof snapshot.fingerprint === 'string') return fingerprintStudyValue(value) === snapshot.fingerprint;
  return JSON.stringify(value) === JSON.stringify(snapshot);
}

function recordSnapshot(value, collection = null) {
  const snapshot = { fingerprint: fingerprintStudyValue(stripMarker(value)) };
  // Strong baselines let a later project-tray review distinguish prior
  // generated occupancy from owner inventory without trusting a marker or a
  // short fingerprint. Existing projects without this evidence fail closed.
  if (collection === 'cables' || collection === 'trays' || collection === 'routeResults') snapshot.exactFingerprint = fingerprintProjectRecord(stripMarker(value));
  if (collection === 'panels' || (collection === 'equipment' && value?.type === 'panel')) {
    const copy = stripMarker(value);
    delete copy.x; delete copy.y; delete copy.z;
    snapshot.nonLocationFingerprint = fingerprintStudyValue(copy);
  }
  return snapshot;
}
export function compactInputEvidence(evidence) {
  const copy = clone(evidence);
  const records = copy?.records;
  if (!records || !Array.isArray(records.equipment)) return copy;
  const commonValue = key => {
    const counts = new Map();
    for (const record of records.equipment) {
      if (record?.[key] === undefined || record?.[key] === null) continue;
      const serialized = JSON.stringify(record[key]);
      const entry = counts.get(serialized) || { value: record[key], count: 0 };
      entry.count += 1;
      counts.set(serialized, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.count > 1
      ? [...counts.values()].sort((a, b) => b.count - a.count)[0].value
      : undefined;
  };
  const defaults = Object.fromEntries(['classification', 'note'].map(key => [key, commonValue(key)]).filter(([, value]) => value !== undefined));
  const fields = [...new Set(records.equipment.flatMap(record => Object.keys(record?.values || {})))].sort();
  const rows = records.equipment.map(record => {
    const values = fields.map(key => {
      const value = record?.values?.[key];
      if (!value || typeof value !== 'object') return value === undefined ? null : ['primitive', value];
      const extras = Object.fromEntries(Object.entries(value).filter(([name]) => !['value', 'basis', 'source'].includes(name)));
      const present = ['value', 'basis', 'source'].filter(name => Object.prototype.hasOwnProperty.call(value, name)).map(name => name[0]).join('');
      return ['record', value.value, value.basis, value.source, Object.keys(extras).length ? extras : null, present];
    });
    const metadata = Object.fromEntries(Object.entries(record || {}).filter(([key]) => !['id', 'values'].includes(key) && !(key in defaults && record[key] === defaults[key])));
    const absentDefaults = Object.keys(defaults).filter(key => !Object.prototype.hasOwnProperty.call(record || {}, key));
    const row = [record?.id ?? null, values];
    if (Object.keys(metadata).length || absentDefaults.length) row.push({ metadata, absentDefaults });
    return row;
  });
  copy.records.equipment = { schema: INPUT_EVIDENCE_COMPACT_SCHEMA, defaults, fields, rows };
  return copy;
}

function compactTransformerSelectionCandidates(candidates) {
  if (!Array.isArray(candidates)) return undefined;
  return candidates.map(candidate => Object.fromEntries(
    ['profileId', 'catalogNumber', 'ratedKVA', 'requiredKVA', 'loadingPercent', 'eligible', 'approximateTransformerOnlyDropPct', 'reasons']
      .filter(key => candidate?.[key] !== undefined)
      .map(key => [key, clone(candidate[key])])
  ));
}

export function resolveDesignSynthesisInputEvidence(value) {
  const copy = clone(value);
  const packed = copy?.records?.equipment;
  if (packed?.schema !== INPUT_EVIDENCE_COMPACT_SCHEMA || !Array.isArray(packed.fields) || !Array.isArray(packed.rows)) return copy;
  copy.records.equipment = packed.rows.map(row => {
    const [id, values, packedDetails = {}] = row;
    const metadata = packedDetails.metadata || {};
    const absentDefaults = new Set(packedDetails.absentDefaults || []);
    const expandedValues = {};
    packed.fields.forEach((key, index) => {
      const tuple = values?.[index];
      if (tuple === null || tuple === undefined) return;
      if (!Array.isArray(tuple)) { expandedValues[key] = tuple; return; }
      if (tuple[0] === 'primitive') { expandedValues[key] = tuple[1]; return; }
      const [, fieldValue, basis, source, fieldExtras, present] = tuple;
      const flags = typeof present === 'string' ? present : 'vbs';
      expandedValues[key] = { ...(flags.includes('v') ? { value: fieldValue } : {}), ...(flags.includes('b') ? { basis } : {}), ...(flags.includes('s') ? { source } : {}), ...(fieldExtras || {}) };
    });
    const record = { ...packed.defaults, ...metadata, id, values: expandedValues };
    for (const key of absentDefaults) delete record[key];
    return record;
  });
  return copy;
}

function compactLoadFlowValidation(proposal) {
  const study = proposal?.studyValidation || proposal?.loadFlowRevision || proposal?.loadFlowStudy || proposal?.studyRevision?.loadFlow || proposal?.loadFlow;
  if (!study || typeof study !== 'object') return null;
  const compact = {};
  for (const key of ['status', 'outcome', 'method', 'modelRevision', 'converged', 'initialMinimumVoltagePu', 'finalMinimumVoltagePu', 'maxLoadUtilizationPct', 'maxCurrentUtilizationPct', 'sourceKvaIncludingLosses', 'revisionCount', 'conductorChangeCount', 'minimumVoltagePu', 'maxRevisions', 'maxIterations', 'criteria', 'iterations', 'stopReason', 'modelInputFingerprint']) if (study[key] !== undefined) compact[key] = clone(study[key]);
  if (study.final && typeof study.final === 'object') {
    const circuits = Array.isArray(study.final.circuitResults) ? study.final.circuitResults : [];
    const designCurrent = item => Number(item.designCurrentA ?? item.currentA);
    const maxCable = circuits.reduce((max, item) => Number.isFinite(designCurrent(item)) && Number(item.cableAmpacityA) > 0 ? Math.max(max, designCurrent(item) / Number(item.cableAmpacityA) * 100) : max, 0);
    const maxProtection = circuits.reduce((max, item) => Number.isFinite(designCurrent(item)) && Number(item.protectiveContinuousA) > 0 ? Math.max(max, designCurrent(item) / Number(item.protectiveContinuousA) * 100) : max, 0);
    compact.final = { converged: study.final.converged, maxMismatch: study.final.maxMismatch, minimumVoltagePu: study.final.minimumVoltagePu ?? study.final.minVoltagePu, sourceApparentPowerKva: study.final.sourceApparentPowerKva ?? study.final.sourceKva, sourceCapacityKva: study.final.sourceCapacityKva, lossKw: study.final.lossKw, maxDesignCurrentCableUtilizationPct: maxCable || undefined, maxDesignCurrentProtectionUtilizationPct: maxProtection || undefined, busCount: Array.isArray(study.final.busResults || study.final.buses) ? (study.final.busResults || study.final.buses).length : undefined, circuitCount: circuits.length };
    const transformerResults = circuits.filter(item => item.type === 'transformer').map(item => Object.fromEntries(
      ['id', 'primaryCurrentA', 'secondaryCurrentA', 'secondaryMainDesignCurrentA', 'secondaryMainRatingA', 'secondaryMainDutyPass', 'primaryRatedCurrentA', 'secondaryRatedCurrentA', 'primaryUtilization', 'secondaryUtilization', 'ratedKVA', 'maximumLoadingPercent', 'loadingPercent', 'primaryProtectiveDeviceId', 'secondaryMainDeviceId', 'groundFaultStatus', 'asymmetricalInterruptingDutyStatus', 'status']
        .filter(key => item[key] !== undefined)
        .map(key => [key, clone(item[key])])
    ));
    if (transformerResults.length) compact.final.transformerResults = transformerResults;
    if (Array.isArray(study.final.warnings)) compact.finalWarnings = study.final.warnings.slice(0, 50).map(item => typeof item === 'object' ? { code: item.code, message: item.message } : item);
  }
  if (Array.isArray(study.history)) { compact.history = study.history.slice(0, 50).map(item => ({ revision: item.revision, status: item.status, reason: item.reason, maxMismatch: item.maxMismatch, minVoltagePu: item.minVoltagePu, sourceKva: item.sourceKva, transformerProfileId: item.transformerProfileId, selectionCandidates: compactTransformerSelectionCandidates(item.selectionCandidates), conductorChanges: Array.isArray(item.conductorChanges) ? item.conductorChanges.slice(0, 50).map(change => ({ cableId: change.cableId || change.circuitId, from: change.from || change.fromSize, to: change.to || change.toSize })) : undefined, final: item.final ? { converged: item.final.converged, minimumVoltagePu: item.final.minimumVoltagePu ?? item.final.minVoltagePu, sourceApparentPowerKva: item.final.sourceApparentPowerKva ?? item.final.sourceKva, lossKw: item.final.lossKw } : undefined })); if (study.history.length > 50) compact.historyTruncatedCount = study.history.length - 50; }
  for (const key of ['reasons', 'revisionReasons', 'blockingReasons', 'warnings', 'issues', 'conductorChanges']) if (Array.isArray(study[key])) { compact[key] = study[key].slice(0, 50).map(item => typeof item === 'object' ? { code: item.code, message: item.message, reason: item.reason, cableId: item.cableId, from: item.from || item.previousSize, to: item.to || item.conductorSize } : item); if (study[key].length > 50) compact[`${key}TruncatedCount`] = study[key].length - 50; }
  if (study.studyValidation && typeof study.studyValidation === 'object') compact.studyValidation = clone(study.studyValidation);
  return Object.keys(compact).length ? compact : null;
}

function compactFaultStudyValidation(proposal, { byteEncoding = 'base64' } = {}) {
  const study = proposal?.faultStudyValidation;
  if (!study || typeof study !== 'object') return null;
  const currentMagnitude = current => Number.isFinite(current?.magnitude) ? current.magnitude : null;
  const cases = Array.isArray(study.cases) ? study.cases : [];
  const branchIds = [...new Set(cases.flatMap(item => [
    ...(item.branchTerminalCurrents || []).map(row => row.branchId),
    ...(item.zeroImpedanceTieCurrents || []).map(row => row.branchId),
  ]).filter(id => typeof id === 'string' && id.length > 0))].sort();
  const branchDutyValueCount = cases.length * branchIds.length * 2;
  const branchDutyCodeValues = [];
  const branchDutyDictionary = [];
  const branchDutyDictionaryIndex = new Map();
  for (const item of cases) {
    const branchCurrents = new Map([
      ...(item.branchTerminalCurrents || []).map(row => [row.branchId, row]),
      ...(item.zeroImpedanceTieCurrents || []).map(row => [row.branchId, row]),
    ]);
    for (const id of branchIds) {
      const row = branchCurrents.get(id);
      for (const current of [row?.fromCurrentIntoBranchKA, row?.toCurrentIntoBranchKA]) {
        const magnitude = currentMagnitude(current);
        if (magnitude === null) {
          branchDutyCodeValues.push(0xffffffff);
        } else {
          let code = branchDutyDictionaryIndex.get(magnitude);
          if (code === undefined) {
            code = branchDutyDictionary.length;
            branchDutyDictionaryIndex.set(magnitude, code);
            branchDutyDictionary.push(magnitude);
          }
          branchDutyCodeValues.push(code);
        }
      }
    }
  }
  const dictionaryBytes = new Uint8Array(branchDutyDictionary.length * 8);
  const dictionaryView = new DataView(dictionaryBytes.buffer);
  branchDutyDictionary.forEach((value, index) => dictionaryView.setFloat64(index * 8, value, true));
  const use32BitCodes = branchDutyDictionary.length >= 0xffff;
  const branchDutyCodes = use32BitCodes ? Uint32Array.from(branchDutyCodeValues) : Uint16Array.from(branchDutyCodeValues);
  const codeWidth = use32BitCodes ? 4 : 2;
  const codeBytes = new Uint8Array(branchDutyCodes.length * codeWidth);
  const codeView = new DataView(codeBytes.buffer);
  branchDutyCodes.forEach((code, index) => use32BitCodes
    ? codeView.setUint32(index * codeWidth, code, true)
    : codeView.setUint16(index * codeWidth, code, true));
  const branchDutyCodeBytes = compressFaultBytes(codeBytes);
  const sourceTerminalSourceIds = [...new Set(cases.flatMap(item => (item.sourceTerminalCurrents || [])
    .map(row => row.sourceId).filter(id => typeof id === 'string' && id.length > 0)))].sort();
  const sourceTerminalValueCount = cases.length * sourceTerminalSourceIds.length;
  const sourceTerminalBytes = new Uint8Array(sourceTerminalValueCount * 8);
  const sourceTerminalView = new DataView(sourceTerminalBytes.buffer);
  let sourceTerminalOffset = 0;
  for (const item of cases) {
    const terminalCurrents = new Map((item.sourceTerminalCurrents || []).map(row => [row.sourceId, row]));
    for (const sourceId of sourceTerminalSourceIds) {
      const magnitude = currentMagnitude(terminalCurrents.get(sourceId)?.currentKA);
      sourceTerminalView.setFloat64(sourceTerminalOffset, magnitude === null ? Number.NaN : magnitude, true);
      sourceTerminalOffset += 8;
    }
  }
  const useUtf15 = byteEncoding === 'utf15';
  return {
    status: study.status,
    method: study.method,
    scope: study.scope,
    modelInputFingerprint: study.modelInputFingerprint,
    sourceInventory: clone(study.sourceInventory),
    coverage: clone(study.coverage),
    branchIds,
    branchDutyEncoding: useUtf15
      ? (use32BitCodes ? 'uint32-index-lz77-float64-le-utf15-v1' : FAULT_BRANCH_DUTY_UTF15_ENCODING)
      : (use32BitCodes ? 'uint32-index-lz77-float64-le-base64-v1' : FAULT_BRANCH_DUTY_ENCODING),
    branchDutyValueCount,
    ...(useUtf15 ? {
      branchDutyValueDictionaryCount: branchDutyDictionary.length,
      branchDutyValueDictionaryUtf15: encodeDesignSynthesisFaultScenarioBytes(dictionaryBytes),
      branchDutyCodeByteCount: branchDutyCodeBytes.length,
      branchDutyCodesUtf15: encodeDesignSynthesisFaultScenarioBytes(branchDutyCodeBytes),
    } : {
      branchDutyValueDictionaryBase64: encodeBase64(dictionaryBytes),
      branchDutyCodesBase64: encodeBase64(branchDutyCodeBytes),
    }),
    sourceTerminalSourceIds,
    sourceTerminalValueCount,
    sourceTerminalEncoding: useUtf15 ? 'float64-le-utf15-v1' : 'float64-le-base64-v1',
    ...(useUtf15
      ? { sourceTerminalCurrentsUtf15: encodeDesignSynthesisFaultScenarioBytes(sourceTerminalBytes) }
      : { sourceTerminalCurrentsBase64: encodeBase64(sourceTerminalBytes) }),
    input: proposal.faultStudy && typeof proposal.faultStudy === 'object' ? {
      networkBaseMVA: proposal.faultStudy.networkBaseMVA,
      sourceInventory: clone(proposal.faultStudy.sourceInventory),
      sources: clone(proposal.faultStudy.sources),
      ...(proposal.faultStudy.transformerPhase !== undefined ? { transformerPhase: clone(proposal.faultStudy.transformerPhase) } : {}),
      ...(proposal.faultStudy.faultBusIds !== undefined ? { faultBusIds: clone(proposal.faultStudy.faultBusIds) } : {}),
    } : clone(proposal.faultStudy),
    cases: cases.map(item => ({
      busId: item.busId || item.fault?.busId || null,
      status: item.status,
      totalFaultCurrentKA: currentMagnitude(item.fault?.totalFaultCurrentKA),
      sourceContributionsKA: (item.sourceFaultContributions || []).map(row => ({ sourceId: row.sourceId, currentKA: currentMagnitude(row.currentKA) })),
      ...((item.issues || []).length ? { issues: clone(item.issues) } : {}),
    })),
    issues: clone(study.issues || []),
    limitations: clone(study.limitations || []),
  };
}

function compactFaultScenarioValidation(proposal) {
  const validation = proposal?.faultScenarioValidation;
  const inputScenarios = proposal?.faultScenarios;
  if (!validation || validation.status !== 'evaluated' || !Array.isArray(validation.scenarios)
    || !Array.isArray(inputScenarios) || inputScenarios.length < 2 || inputScenarios.length > 4) return null;
  const inputsById = new Map(inputScenarios.map(item => [item?.id, item]));
  const scenarios = [];
  for (const row of validation.scenarios) {
    const input = inputsById.get(row?.id);
    const faultStudy = row?.faultStudyValidation;
    if (!input || typeof input.reference !== 'string' || input.reference !== row.reference
      || row.status !== 'evaluated' || !input.study || faultStudy?.status !== 'evaluated'
      || row.deviceFaultValidation?.status !== 'evaluated'
      || typeof faultStudy.modelInputFingerprint !== 'string' || !faultStudy.modelInputFingerprint) return null;
    const compactFault = compactFaultStudyValidation({ faultStudyValidation: faultStudy, faultStudy: input.study });
    if (!compactFault || compactFault.modelInputFingerprint !== faultStudy.modelInputFingerprint) return null;
    const compactDevice = compactDeviceFaultValidation({
      ...proposal,
      faultStudyValidation: faultStudy,
      faultStudy: input.study,
      deviceFaultValidation: row.deviceFaultValidation,
    }, compactFault);
    if (!compactDevice) return null;
    scenarios.push({
      id: row.id,
      reference: row.reference,
      status: row.status,
      modelInputFingerprint: faultStudy.modelInputFingerprint,
      study: clone(input.study),
      faultStudyValidation: compactFault,
      deviceFaultValidation: compactDevice,
    });
  }
  if (scenarios.length !== inputScenarios.length || new Set(scenarios.map(item => item.id)).size !== scenarios.length) return null;
  const payload = {
    encoding: 'fault-scenarios-packed-v1',
    status: validation.status,
    method: validation.method,
    scope: validation.scope,
    modelInputFingerprint: validation.modelInputFingerprint,
    scenarios,
    busEnvelopes: clone(validation.busEnvelopes || []),
    deviceEnvelopes: clone(validation.deviceEnvelopes || []),
    issues: clone(validation.issues || []),
    coverage: clone(validation.coverage),
    limitations: clone(validation.limitations || []),
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (jsonBytes.length > 2_000_000) throw new Error('Explicit fault-scenario evidence exceeds the 2 MiB packed-storage limit; Apply was blocked to preserve complete evidence.');
  const lzBytes = compressFaultBytes(jsonBytes);
  return {
    encoding: 'fault-scenarios-json-lz77-utf15-v1',
    uncompressedByteLength: jsonBytes.length,
    lzByteLength: lzBytes.length,
    payloadBinaryString: encodeDesignSynthesisFaultScenarioBytes(lzBytes),
    status: payload.status,
    modelInputFingerprint: payload.modelInputFingerprint,
    payloadFingerprint: fingerprintStudyValue(payload),
    scenarioCount: payload.scenarios.length,
    coverage: clone(payload.coverage),
  };
}

/** Expand validated explicit-scenario current evidence from canonical storage. */
export function resolveDesignSynthesisFaultScenarioValidation(saved, inputScenarios = null) {
  try {
    if (!saved || saved.encoding !== 'fault-scenarios-json-lz77-utf15-v1' || saved.status !== 'evaluated'
      || !Number.isSafeInteger(saved.uncompressedByteLength) || saved.uncompressedByteLength < 1 || saved.uncompressedByteLength > 2_000_000
      || !Number.isSafeInteger(saved.lzByteLength) || saved.lzByteLength < 1 || saved.lzByteLength > saved.uncompressedByteLength * 2 + 3
      || !Number.isSafeInteger(saved.scenarioCount) || saved.scenarioCount < 2 || saved.scenarioCount > 4
      || typeof saved.payloadFingerprint !== 'string' || !/^fnv1a-[\da-f]{8}$/i.test(saved.payloadFingerprint)) return null;
    const lzBytes = decodeDesignSynthesisFaultScenarioBytes(saved.payloadBinaryString, saved.lzByteLength);
    if (!lzBytes) return null;
    const jsonBytes = decompressFaultBytes(lzBytes, saved.uncompressedByteLength);
    if (!jsonBytes) return null;
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes)); } catch { return null; }
    if (payload?.encoding !== 'fault-scenarios-packed-v1' || payload.status !== saved.status
      || payload.modelInputFingerprint !== saved.modelInputFingerprint || fingerprintStudyValue(payload) !== saved.payloadFingerprint
      || !Array.isArray(payload.scenarios) || payload.scenarios.length !== saved.scenarioCount
      || JSON.stringify(payload.coverage) !== JSON.stringify(saved.coverage) || !payload.coverage
      || payload.coverage.status !== 'complete' || payload.coverage.scenarioCount !== saved.scenarioCount
      || payload.coverage.verifiedAsExtrema !== false || payload.coverage.scope !== 'supplied-scenarios-only'
      || !Array.isArray(payload.busEnvelopes) || !Array.isArray(payload.deviceEnvelopes)
      || !Array.isArray(payload.issues) || !Array.isArray(payload.limitations)) return null;
    if (new Set(payload.scenarios.map(item => item?.id)).size !== payload.scenarios.length) return null;
    const expectedInputs = inputScenarios || payload.scenarios.map(({ id, reference, study }) => ({ id, reference, study }));
    if (!Array.isArray(expectedInputs) || expectedInputs.length !== payload.scenarios.length
      || expectedInputs.some(item => !item || typeof item.id !== 'string' || !item.id.trim() || typeof item.reference !== 'string' || !item.reference.trim())
      || new Set(expectedInputs.map(item => item.id)).size !== expectedInputs.length) return null;
    if (payload.scenarios.some(item => !item || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.reference !== 'string' || !item.reference.trim() || !item.study || typeof item.study !== 'object'
      || item.status !== 'evaluated' || !item.faultStudyValidation || item.faultStudyValidation.status !== 'evaluated'
      || !Array.isArray(item.faultStudyValidation.cases) || !Array.isArray(item.faultStudyValidation.branchIds)
      || typeof item.modelInputFingerprint !== 'string' || !item.modelInputFingerprint
      || typeof item.faultStudyValidation.modelInputFingerprint !== 'string' || !item.faultStudyValidation.modelInputFingerprint
      || !item.deviceFaultValidation || item.deviceFaultValidation.status !== 'evaluated')) return null;
    const inputById = new Map(expectedInputs.map(item => [item?.id, item]));
    const expanded = [];
    for (const scenario of payload.scenarios) {
      const input = inputById.get(scenario.id);
      if (!input || input.reference !== scenario.reference || JSON.stringify(input.study) !== JSON.stringify(scenario.study)
        || scenario.faultStudyValidation?.modelInputFingerprint !== scenario.modelInputFingerprint
        || scenario.faultStudyValidation?.status !== 'evaluated') return null;
      const fault = clone(scenario.faultStudyValidation);
      for (const item of fault.cases) {
        if (!Number.isFinite(item.totalFaultCurrentKA) || item.totalFaultCurrentKA < 0
          || !Array.isArray(item.sourceContributionsKA)
          || item.sourceContributionsKA.some(row => typeof row.sourceId !== 'string' || !Number.isFinite(row.currentKA) || row.currentKA < 0)) return null;
        const branches = resolveDesignSynthesisFaultBranchCurrents(scenario.faultStudyValidation, item);
        const terminals = resolveDesignSynthesisFaultSourceTerminalCurrents(scenario.faultStudyValidation, item);
        if (!branches || !terminals || branches.some(row => !Number.isFinite(row.fromCurrentKA) || !Number.isFinite(row.toCurrentKA))
          || terminals.some(row => typeof row.sourceId !== 'string' || !Number.isFinite(row.currentKA))) return null;
        item.branchTerminalCurrents = branches.map(row => ({ branchId: row.branchId, fromCurrentIntoBranchKA: { magnitude: row.fromCurrentKA }, toCurrentIntoBranchKA: { magnitude: row.toCurrentKA } }));
        item.sourceTerminalCurrents = terminals.map(row => ({ sourceId: row.sourceId, currentKA: { magnitude: row.currentKA } }));
      }
      const device = scenario.deviceFaultValidation
        ? resolveDesignSynthesisDeviceFaultValidation(scenario.deviceFaultValidation, scenario.faultStudyValidation)
        : null;
      if (!device || !Array.isArray(device.placements) || !device.placements.length) return null;
      expanded.push({ id: scenario.id, reference: scenario.reference, status: scenario.status, study: clone(scenario.study), faultStudyValidation: fault, deviceFaultValidation: device });
    }
    const busEnvelopes = [];
    const busIds = expanded[0].faultStudyValidation.cases.map(item => item.busId);
    if (!busIds.length || expanded.some(row => row.faultStudyValidation.cases.length !== busIds.length
      || row.faultStudyValidation.cases.some((item, index) => item.busId !== busIds[index]))) return null;
    for (const busId of busIds) {
      let minimum = null; let maximum = null;
      for (const row of expanded) {
        const valueKA = row.faultStudyValidation.cases.find(item => item.busId === busId)?.totalFaultCurrentKA;
        if (!Number.isFinite(valueKA) || valueKA < 0) return null;
        if (!minimum || valueKA < minimum.valueKA) minimum = { scenarioId: row.id, valueKA };
        if (!maximum || valueKA > maximum.valueKA) maximum = { scenarioId: row.id, valueKA };
      }
      busEnvelopes.push({ busId, minimum, maximum });
    }
    if (JSON.stringify(busEnvelopes) !== JSON.stringify(payload.busEnvelopes)) return null;
    const deviceIds = expanded[0].deviceFaultValidation.placements.map(item => item.id);
    if (!deviceIds.length || expanded.some(row => row.deviceFaultValidation.placements.length !== deviceIds.length
      || row.deviceFaultValidation.placements.some((item, index) => item.id !== deviceIds[index]))) return null;
    const deviceEnvelopes = deviceIds.map(placementId => {
      const placements = expanded.map(row => row.deviceFaultValidation.placements.find(item => item.id === placementId));
      let lineMinimum = null; let lineMaximum = null; let throughMinimum = null; let throughMaximum = null;
      placements.forEach((item, index) => {
        const lineValue = item.comparisons?.lineTerminalAvailableInitialRms?.valueKA;
        const through = item.comparisons?.maximumThroughDeviceInitialRms;
        if (!Number.isFinite(lineValue) || !Number.isFinite(through?.valueKA)) throw new Error('Incomplete stored device envelope evidence.');
        const scenarioId = expanded[index].id;
        if (!lineMinimum || lineValue < lineMinimum.valueKA) lineMinimum = { scenarioId, valueKA: lineValue };
        if (!lineMaximum || lineValue > lineMaximum.valueKA) lineMaximum = { scenarioId, valueKA: lineValue };
        const candidate = { scenarioId, valueKA: through.valueKA, faultBusId: through.faultBusId, caseKind: through.caseKind };
        if (!throughMinimum || candidate.valueKA < throughMinimum.valueKA) throughMinimum = candidate;
        if (!throughMaximum || candidate.valueKA > throughMaximum.valueKA) throughMaximum = candidate;
      });
      return { placementId, lineTerminalAvailableInitialRms: { minimum: lineMinimum, maximum: lineMaximum }, maximumThroughDeviceInitialRms: { minimum: throughMinimum, maximum: throughMaximum }, protectionStatus: 'not-evaluated' };
    });
    if (JSON.stringify(deviceEnvelopes) !== JSON.stringify(payload.deviceEnvelopes)) return null;
    return { ...clone(payload), scenarios: expanded };
  } catch { return null; }
}

// Keep the canonical device screen small by pointing ordinary currents at the
// already persisted fault-network terminal stream. Only the immediate-load-
// side KCL results and aggregate secondary cut at its own bus need new values.
function compactDeviceFaultValidation(proposal, faultStudy) {
  const screen = proposal?.deviceFaultValidation;
  if (!screen || screen.status !== 'evaluated' || !faultStudy || faultStudy.status !== 'evaluated') return null;
  const cases = Array.isArray(faultStudy.cases) ? faultStudy.cases : [];
  const caseIndexByBus = new Map(cases.map((item, index) => [item.busId, index]));
  const branchIndexById = new Map((faultStudy.branchIds || []).map((id, index) => [id, index]));
  const equipment = new Map((proposal.equipment || []).map(item => [String(item.id || ''), item]));
  const cables = new Map((proposal.cables || []).map(item => [String(item.id || ''), item]));
  const placementRows = [];
  for (const placement of screen.placements || []) {
    const location = placement.proposedLocation || {};
    const busId = String(location.fromBusId || '');
    const ownCaseIndex = caseIndexByBus.get(busId);
    let referenceBranchId = String(location.branchId || '');
    let ownBusException = false;
    if (placement.kind === 'aggregate-secondary-main') {
      const txId = String(placement.id || '').replace(/^secondary-main:/, '');
      referenceBranchId = String(equipment.get(txId)?.id || txId);
      ownBusException = true;
    }
    const branchIndex = branchIndexById.get(referenceBranchId);
    if (!Number.isInteger(ownCaseIndex) || !Number.isInteger(branchIndex)) return null;
    const selectedDevice = placement.kind === 'aggregate-secondary-main'
      ? equipment.get(String(placement.id).replace(/^secondary-main:/, ''))?.secondaryMainDevice
      : cables.get(referenceBranchId)?.protectiveDevice;
    const evidenceRef = selectedDevice && typeof selectedDevice === 'object' ? fingerprintStudyValue(selectedDevice) : null;
    const virtual = (placement.cases || []).find(item => item.kind === 'immediate-load-side-zero-impedance-fault');
    const ownFault = (placement.cases || []).find(item => item.kind === 'generated-bus-fault' && item.faultBusId === busId);
    placementRows.push([
      branchIndex, placement.kind === 'aggregate-secondary-main' ? 1 : 0,
      ownCaseIndex,
      ownBusException ? (ownFault?.throughDeviceCurrentRmsKA ?? null) : null,
      virtual?.throughDeviceCurrentRmsKA ?? null,
      evidenceRef,
    ]);
  }
  if (placementRows.length > 0xffff || (faultStudy.branchIds || []).length > 0xffff || cases.length > 0xffff) return null;
  const refs = new Uint8Array(placementRows.length * 4);
  const refView = new DataView(refs.buffer);
  const evidenceRefs = new Uint8Array(placementRows.length * 4);
  const evidenceRefView = new DataView(evidenceRefs.buffer);
  const flags = new Uint8Array(placementRows.length);
  const aggregateRows = placementRows.filter(row => row[1] === 1);
  const virtuals = new Uint8Array(placementRows.length * 8);
  const virtualView = new DataView(virtuals.buffer);
  const exceptions = new Uint8Array(aggregateRows.length * 8);
  const exceptionView = new DataView(exceptions.buffer);
  let exceptionIndex = 0;
  placementRows.forEach(([branchIndex, aggregate, ownCaseIndex, ownException, virtual, evidenceRef], index) => {
    refView.setUint16(index * 4, branchIndex, true);
    refView.setUint16(index * 4 + 2, ownCaseIndex, true);
    const hash = /^fnv1a-([\da-f]{8})$/i.exec(evidenceRef || '')?.[1];
    if (!hash) throw new Error('Device evidence reference is not a supported immutable fingerprint.');
    evidenceRefView.setUint32(index * 4, Number.parseInt(hash, 16), true);
    flags[index] = aggregate;
    virtualView.setFloat64(index * 8, virtual === null ? Number.NaN : virtual, true);
    if (aggregate) {
      exceptionView.setFloat64(exceptionIndex * 8, ownException === null ? Number.NaN : ownException, true);
      exceptionIndex += 1;
    }
  });
  return {
    encoding: 'device-fault-packed-reference-v1',
    status: 'evaluated',
    modelInputFingerprint: screen.modelInputFingerprint,
    networkModelInputFingerprint: faultStudy.modelInputFingerprint,
    deviceInputFingerprint: screen.deviceInputFingerprint || null,
    curveResearchDatasetFingerprint: screen.curveResearchDatasetFingerprint || null,
    placementCount: placementRows.length,
    placementRefsBase64: encodeBase64(refs),
    placementEvidenceRefsBase64: encodeBase64(evidenceRefs),
    placementKindsBase64: encodeBase64(flags),
    placementVirtualCurrentEncoding: 'float64-le-lz77-base64-v1',
    placementVirtualCurrentsBase64: encodeBase64(compressFaultBytes(virtuals)),
    aggregateExceptionCount: aggregateRows.length,
    aggregateExceptionsBase64: encodeBase64(exceptions),
  };
}

/** Expand compact proposed-device evidence using the saved fault-study stream. */
export function resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy, deviceEvidence = null) {
  if (!saved || saved.encoding !== 'device-fault-packed-reference-v1' || saved.status !== 'evaluated'
    || !Number.isSafeInteger(saved.placementCount) || saved.placementCount < 1 || saved.placementCount > 100_000
    || !Array.isArray(faultStudy?.cases) || !Array.isArray(faultStudy?.branchIds)
    || saved.networkModelInputFingerprint !== faultStudy.modelInputFingerprint) return null;
  const refsBytes = decodeBase64(saved.placementRefsBase64);
  const evidenceRefBytes = decodeBase64(saved.placementEvidenceRefsBase64);
  const kindsBytes = decodeBase64(saved.placementKindsBase64);
  const packedVirtualBytes = decodeBase64(saved.placementVirtualCurrentsBase64);
  const exceptionBytes = decodeBase64(saved.aggregateExceptionsBase64);
  if (!refsBytes || refsBytes.length !== saved.placementCount * 4 || !evidenceRefBytes || evidenceRefBytes.length !== saved.placementCount * 4
    || !kindsBytes || kindsBytes.length !== saved.placementCount
    || saved.placementVirtualCurrentEncoding !== 'float64-le-lz77-base64-v1' || !packedVirtualBytes
    || packedVirtualBytes.length > Math.ceil(saved.placementCount * 16 / 3) * 4 + 4 || !Number.isSafeInteger(saved.aggregateExceptionCount)
    || saved.aggregateExceptionCount < 0 || saved.aggregateExceptionCount > saved.placementCount
    || !exceptionBytes || exceptionBytes.length !== saved.aggregateExceptionCount * 8) return null;
  const refsView = new DataView(refsBytes.buffer, refsBytes.byteOffset, refsBytes.byteLength);
  const evidenceRefView = new DataView(evidenceRefBytes.buffer, evidenceRefBytes.byteOffset, evidenceRefBytes.byteLength);
  const virtualBytes = decompressFaultBytes(packedVirtualBytes, saved.placementCount * 8);
  if (!virtualBytes) return null;
  const virtualView = new DataView(virtualBytes.buffer, virtualBytes.byteOffset, virtualBytes.byteLength);
  const exceptionView = new DataView(exceptionBytes.buffer, exceptionBytes.byteOffset, exceptionBytes.byteLength);
  const evidence = deviceEvidence || dataStore.getItem(DEVICE_EVIDENCE_KEY, {}) || {};
  if (isDeviceEvidenceEnvelope(evidence)) return null;
  const resolvedBranches = new Map();
  for (const row of faultStudy.cases) {
    const branches = resolveDesignSynthesisFaultBranchCurrents(faultStudy, row);
    if (!branches) return null;
    resolvedBranches.set(row.busId, new Map(branches.map(item => [item.branchId, item])));
  }
  const result = [];
  if (kindsBytes.some(value => value !== 0 && value !== 1)) return null;
  const aggregateCount = kindsBytes.reduce((count, value) => count + value, 0);
  if (aggregateCount !== saved.aggregateExceptionCount) return null;
  let exceptionIndex = 0;
  for (let placementIndex = 0; placementIndex < saved.placementCount; placementIndex += 1) {
    const branchIndex = refsView.getUint16(placementIndex * 4, true);
    const ownCaseIndex = refsView.getUint16(placementIndex * 4 + 2, true);
    const aggregateFlag = kindsBytes[placementIndex];
    if (branchIndex >= faultStudy.branchIds.length || ownCaseIndex >= faultStudy.cases.length) return null;
    const evidenceRef = `fnv1a-${evidenceRefView.getUint32(placementIndex * 4, true).toString(16).padStart(8, '0')}`;
    const ownExceptionRaw = aggregateFlag ? exceptionView.getFloat64(exceptionIndex++ * 8, true) : Number.NaN;
    const virtualRaw = virtualView.getFloat64(placementIndex * 8, true);
    const ownException = Number.isFinite(ownExceptionRaw) ? ownExceptionRaw : null;
    const virtualCurrent = Number.isFinite(virtualRaw) ? virtualRaw : null;
    if (aggregateFlag !== 0 && aggregateFlag !== 1) return null;
    const terminalFlag = aggregateFlag;
    const ownFault = faultStudy.cases[ownCaseIndex];
    const branchId = faultStudy.branchIds[branchIndex];
    if (typeof branchId !== 'string' || !branchId.trim() || !ownFault) return null;
    const normalizedBranchId = branchId.toLowerCase();
    const cable = aggregateFlag ? null : dataStore.getCables().find(item => String(item.id || '').toLowerCase() === normalizedBranchId);
    const transformer = aggregateFlag ? dataStore.getEquipment().find(item => String(item.id || '').toLowerCase() === normalizedBranchId) : null;
    const proposedBusId = aggregateFlag ? transformer?.secondaryBusId : cable?.from;
    const device = evidence[evidenceRef] && fingerprintStudyValue(evidence[evidenceRef]) === evidenceRef ? clone(evidence[evidenceRef]) : null;
    const ratingKA = device?.interruptingRatingKA;
    const ratingVoltageVac = device?.interruptingRatingVoltageVac;
    if (!Number.isFinite(ratingKA) || ratingKA <= 0
      || !device
      || !Number.isFinite(ratingVoltageVac) || ratingVoltageVac <= 0
      || String(proposedBusId || '').toLowerCase() !== String(ownFault.busId || '').toLowerCase()
      || (ownException !== null && (!Number.isFinite(ownException) || ownException < 0))
      || (virtualCurrent !== null && (!Number.isFinite(virtualCurrent) || virtualCurrent < 0))) return null;
    const cases = [];
    for (let index = 0; index < faultStudy.cases.length; index += 1) {
      const faultCase = faultStudy.cases[index];
      const busId = faultCase.busId;
      let currentKA;
      if (aggregateFlag && index === ownCaseIndex) currentKA = ownException;
      else {
        const terminals = resolvedBranches.get(busId);
        const terminal = terminals?.get(branchId);
        currentKA = terminalFlag ? terminal?.toCurrentKA : terminal?.fromCurrentKA;
      }
      if (!Number.isFinite(currentKA) || currentKA < 0) return null;
      cases.push({ id: `bus-fault:${busId}`, kind: 'generated-bus-fault', faultBusId: busId, throughDeviceCurrentRmsKA: currentKA, throughDeviceStatus: currentKA > ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded' });
      if (index === ownCaseIndex) {
        if (virtualCurrent === null) return null;
        cases.push({ id: `immediate-load-side-fault:${busId}`, kind: 'immediate-load-side-zero-impedance-fault', faultBusId: busId, throughDeviceCurrentRmsKA: virtualCurrent, throughDeviceStatus: virtualCurrent > ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded' });
      }
    }
    const maximum = cases.reduce((best, item) => !best || item.throughDeviceCurrentRmsKA > best.throughDeviceCurrentRmsKA ? item : best, null);
    const availableKA = ownFault.totalFaultCurrentKA;
    if (!Number.isFinite(availableKA) || !maximum) return null;
    const id = aggregateFlag ? `secondary-main:${branchId}` : `cable:${branchId}`;
    const branchIds = aggregateFlag
      ? dataStore.getCables().filter(item => String(item.from || '').toLowerCase() === String(proposedBusId).toLowerCase() && item._designSynthesis).map(item => String(item.id))
      : undefined;
    const nominalVoltageLLV = aggregateFlag ? transformer?.secondaryVoltageVac ?? null : cable?.operating_voltage ?? null;
    let curveResearch = null;
    if (saved.curveResearchDatasetFingerprint) {
      const freshness = 'saved-study-not-verified-against-current-project';
      const currentDevice = aggregateFlag
        ? resolveDesignSynthesisTransformerDeviceEvidence(transformer, 'secondary', evidence)
        : resolveDesignSynthesisDeviceEvidence(cable, evidence);
      if (saved.curveResearchDatasetFingerprint !== getEatonCurveResearchFingerprint()) {
        curveResearch = { status: 'source-dataset-changed-or-unavailable', plotUpperTimeSeconds: null, freshness };
      } else if (!currentDevice || fingerprintStudyValue(currentDevice) !== evidenceRef) {
        curveResearch = { status: 'saved-device-does-not-match-current-project', plotUpperTimeSeconds: null, freshness };
      } else if (device.evaluatedVoltageVac !== nominalVoltageLLV) {
        curveResearch = { status: 'saved-voltage-does-not-match-current-project', plotUpperTimeSeconds: null, freshness };
      } else if (maximum.throughDeviceCurrentRmsKA <= ratingKA * (1 + 1e-9)) {
        curveResearch = { ...evaluateEatonConstantCurrentPlot({ device, voltageVac: nominalVoltageLLV, currentA: maximum.throughDeviceCurrentRmsKA * 1000 }), freshness };
      }
    }
    result.push({
      id, kind: aggregateFlag ? 'aggregate-secondary-main' : 'cable-source-end', status: 'evaluated', ratingComparable: true,
      device: clone(device),
      deviceEvidenceRef: evidenceRef || null,
      proposedLocation: {
        fromBusId: ownFault.busId,
        branchId,
        ...(aggregateFlag ? { branchIds } : {}),
        terminal: aggregateFlag ? 'secondary-main-cut' : 'from',
        nominalVoltageLLV,
      },
      rating: { currentKA: ratingKA, voltageVac: ratingVoltageVac },
      cases,
      comparisons: {
        lineTerminalAvailableInitialRms: { status: availableKA > ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded', valueKA: availableKA, caseBusId: ownFault.busId, ratingKA, ratingVoltageVac },
        maximumThroughDeviceInitialRms: { status: maximum.throughDeviceCurrentRmsKA > ratingKA * (1 + 1e-9) ? 'exceeds-rating' : 'not-exceeded', valueKA: maximum.throughDeviceCurrentRmsKA, faultBusId: maximum.faultBusId, caseKind: maximum.kind, ratingKA, ratingVoltageVac },
        ...(curveResearch ? { constantCurrentCurveResearch: curveResearch } : {}),
        protectionAdequacy: 'unevaluated',
      },
    });
  }
  return { status: 'evaluated', method: 'design-synthesis-proposed-device-initial-rms-screen-v1', scope: 'initial-symmetrical-rms-only', modelInputFingerprint: saved.modelInputFingerprint, networkModelInputFingerprint: saved.networkModelInputFingerprint, deviceInputFingerprint: saved.deviceInputFingerprint, curveResearchDatasetFingerprint: saved.curveResearchDatasetFingerprint || null, coverage: { status: 'complete' }, placements: result };
}



/** Recover branch terminal-current magnitudes from compact persisted evidence. */
export function resolveDesignSynthesisFaultBranchCurrents(savedStudy, savedCase) {
  const encoding = savedStudy?.branchDutyEncoding;
  const useUtf15 = encoding === FAULT_BRANCH_DUTY_UTF15_ENCODING || encoding === 'uint32-index-lz77-float64-le-utf15-v1';
  const useBase64 = FAULT_BRANCH_DUTY_BASE64_ENCODINGS.has(encoding);
  if (!savedStudy || (!useUtf15 && !useBase64) || !Array.isArray(savedStudy.branchIds) || !Array.isArray(savedStudy.cases)) return null;
  if (savedStudy.branchIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(savedStudy.branchIds).size !== savedStudy.branchIds.length) return null;
  const caseIndex = savedStudy.cases.findIndex(item => item === savedCase || (savedCase?.busId && item?.busId === savedCase.busId));
  if (caseIndex < 0 || caseIndex >= savedStudy.cases.length || (savedStudy.cases[caseIndex] !== savedCase && savedStudy.cases[caseIndex]?.busId !== savedCase?.busId)) return null;
  const expectedValueCount = savedStudy.cases.length * savedStudy.branchIds.length * 2;
  if (savedStudy.branchDutyValueCount !== expectedValueCount || !Number.isSafeInteger(expectedValueCount) || expectedValueCount > 500_000) return null;
  const codeWidth = encoding.startsWith('uint16-') ? 2 : 4;
  const rawCodeBytes = expectedValueCount * codeWidth;
  // In the worst case, token overhead can approach the literal payload size
  // when short matches and literal runs alternate. Two bytes per raw byte is
  // a conservative bound for this format and prevents rejecting valid streams.
  const maxPackedCodeBytes = rawCodeBytes * 2;
  const maxDictionaryBytes = Math.min(expectedValueCount, 0xffff_ffff) * 8;
  let dictionaryBytes;
  let packedCodeBytes;
  if (useUtf15) {
    const dictionaryCount = savedStudy.branchDutyValueDictionaryCount;
    const codeByteCount = savedStudy.branchDutyCodeByteCount;
    if (!Number.isSafeInteger(dictionaryCount) || dictionaryCount < 0 || dictionaryCount > expectedValueCount
      || !Number.isSafeInteger(codeByteCount) || codeByteCount < 0 || codeByteCount > maxPackedCodeBytes
      || typeof savedStudy.branchDutyValueDictionaryUtf15 !== 'string'
      || typeof savedStudy.branchDutyCodesUtf15 !== 'string'
      || savedStudy.branchDutyValueDictionaryUtf15.length !== Math.ceil(dictionaryCount * 8 * 8 / 15)
      || savedStudy.branchDutyCodesUtf15.length !== Math.ceil(codeByteCount * 8 / 15)) return null;
    dictionaryBytes = decodeDesignSynthesisFaultScenarioBytes(savedStudy.branchDutyValueDictionaryUtf15, dictionaryCount * 8);
    packedCodeBytes = decodeDesignSynthesisFaultScenarioBytes(savedStudy.branchDutyCodesUtf15, codeByteCount);
  } else {
    if (typeof savedStudy.branchDutyCodesBase64 !== 'string' || savedStudy.branchDutyCodesBase64.length > Math.ceil(maxPackedCodeBytes / 3) * 4 + 4
      || typeof savedStudy.branchDutyValueDictionaryBase64 !== 'string' || savedStudy.branchDutyValueDictionaryBase64.length > Math.ceil(maxDictionaryBytes / 3) * 4) return null;
    dictionaryBytes = decodeBase64(savedStudy.branchDutyValueDictionaryBase64);
    packedCodeBytes = decodeBase64(savedStudy.branchDutyCodesBase64);
  }
  if (!dictionaryBytes || dictionaryBytes.length % 8 !== 0 || !packedCodeBytes) return null;
  const codeBytes = decompressFaultBytes(packedCodeBytes, expectedValueCount * codeWidth);
  if (!codeBytes) return null;
  const dictionaryView = new DataView(dictionaryBytes.buffer, dictionaryBytes.byteOffset, dictionaryBytes.byteLength);
  const codes = new DataView(codeBytes.buffer, codeBytes.byteOffset, codeBytes.byteLength);
  const dictionaryCount = dictionaryBytes.length / 8;
  if (dictionaryCount > expectedValueCount) return null;
  for (let index = 0; index < dictionaryCount; index += 1) {
    const value = dictionaryView.getFloat64(index * 8, true);
    if (!Number.isFinite(value) || value < 0) return null;
  }
  const caseValueOffset = caseIndex * savedStudy.branchIds.length * 2;
  const missingCode = codeWidth === 2 ? 0xffff : 0xffffffff;
  for (let index = 0; index < expectedValueCount; index += 1) {
    const code = codeWidth === 2 ? codes.getUint16(index * codeWidth, true) : codes.getUint32(index * codeWidth, true);
    if (code !== missingCode && code >= dictionaryCount) return null;
  }
  return savedStudy.branchIds.map((branchId, index) => {
    const fromCode = codeWidth === 2 ? codes.getUint16((caseValueOffset + index * 2) * codeWidth, true) : codes.getUint32((caseValueOffset + index * 2) * codeWidth, true);
    const toCode = codeWidth === 2 ? codes.getUint16((caseValueOffset + index * 2 + 1) * codeWidth, true) : codes.getUint32((caseValueOffset + index * 2 + 1) * codeWidth, true);
    if ((fromCode !== missingCode && fromCode >= dictionaryCount) || (toCode !== missingCode && toCode >= dictionaryCount)) return null;
    const from = fromCode === missingCode ? Number.NaN : dictionaryView.getFloat64(fromCode * 8, true);
    const to = toCode === missingCode ? Number.NaN : dictionaryView.getFloat64(toCode * 8, true);
    return { branchId, fromCurrentKA: Number.isFinite(from) ? from : null, toCurrentKA: Number.isFinite(to) ? to : null };
  });
}

/** Recover exact actual source-terminal current magnitudes from compact evidence. */
export function resolveDesignSynthesisFaultSourceTerminalCurrents(savedStudy, savedCase) {
  const useUtf15 = savedStudy?.sourceTerminalEncoding === 'float64-le-utf15-v1';
  const useBase64 = savedStudy?.sourceTerminalEncoding === 'float64-le-base64-v1';
  if (!savedStudy || (!useUtf15 && !useBase64)
    || !Array.isArray(savedStudy.sourceTerminalSourceIds) || !Array.isArray(savedStudy.cases)) return null;
  const ids = savedStudy.sourceTerminalSourceIds;
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) return null;
  const caseIndex = savedStudy.cases.findIndex(item => item === savedCase || (savedCase?.busId && item?.busId === savedCase.busId));
  if (caseIndex < 0 || (savedStudy.cases[caseIndex] !== savedCase && savedStudy.cases[caseIndex]?.busId !== savedCase?.busId)) return null;
  const expectedCount = savedStudy.cases.length * ids.length;
  if (!Number.isSafeInteger(expectedCount) || expectedCount > 500_000 || savedStudy.sourceTerminalValueCount !== expectedCount) return null;
  let bytes;
  if (useUtf15) {
    const encoded = savedStudy.sourceTerminalCurrentsUtf15;
    if (typeof encoded !== 'string' || encoded.length !== Math.ceil(expectedCount * 8 * 8 / 15)) return null;
    bytes = decodeDesignSynthesisFaultScenarioBytes(encoded, expectedCount * 8);
  } else {
    const encoded = savedStudy.sourceTerminalCurrentsBase64;
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(expectedCount * 8 / 3) * 4) return null;
    bytes = decodeBase64(encoded);
  }
  if (!bytes || bytes.length !== expectedCount * 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = caseIndex * ids.length * 8;
  const currents = ids.map((sourceId, index) => {
    const currentKA = view.getFloat64(offset + index * 8, true);
    if (Number.isFinite(currentKA) && currentKA < 0) return null;
    return { sourceId, currentKA: Number.isFinite(currentKA) ? currentKA : null };
  });
  return currents.some(item => item === null) ? null : currents;
}

function graphComparable(value) {
  const copy = stripMarker(value);
  for (const key of ['projectEntity', 'projectCircuit', 'cableRecord']) delete copy[key];
  return copy;
}

function graphSnapshotMatches(value, snapshot) {
  return snapshotMatches(graphComparable(value), snapshot) || snapshotMatches(stripMarker(value), snapshot);
}

// Generated engine records can contain unselected protective-device candidate
// catalogs that are useful in the proposal report but are not canonical
// project data. Keep the complete selected basis while avoiding one copy per
// cable in the project blob.
function compactGeneratedRecord(value) {
  const copy = clone(value);
  if (!copy || typeof copy !== 'object') return copy;
  delete copy.protectiveDeviceCandidates;
  return copy;
}

function compactCableRecord(value) {
  const copy = compactGeneratedRecord(value);
  if (copy?.protectiveDevice && typeof copy.protectiveDevice === 'object') {
    const full = clone(copy.protectiveDevice);
    const evidenceRef = fingerprintStudyValue(full);
    const inline = {};
    for (const key of DEVICE_INLINE_FIELDS) if (full[key] !== undefined) inline[key] = clone(full[key]);
    for (const key of DEVICE_SUMMARY_FIELDS) if (full[key] !== undefined) inline[key] = clone(full[key]);
    copy.protectiveDevice = inline;
    copy.protectiveDeviceEvidenceRef = evidenceRef;
  }
  return copy;
}

function compactTransformerRecord(value) {
  const copy = compactGeneratedRecord(value);
  if (!copy || typeof copy !== 'object') return copy;
  for (const side of ['primaryProtectiveDevice', 'secondaryMainDevice']) {
    const device = copy[side];
    if (!device || typeof device !== 'object') continue;
    copy[`${side}EvidenceRef`] = fingerprintStudyValue(device);
    const inline = {};
    for (const key of DEVICE_INLINE_FIELDS) if (device[key] !== undefined) inline[key] = clone(device[key]);
    for (const key of DEVICE_SUMMARY_FIELDS) if (device[key] !== undefined) inline[key] = clone(device[key]);
    copy[side] = inline;
  }
  delete copy.primaryProtectiveDeviceCandidates;
  delete copy.secondaryMainCandidates;
  return copy;
}

function compactOneLine(oneLine, canonicalCables = []) {
  if (!oneLine || !Array.isArray(oneLine.sheets)) return oneLine;
  const result = clone(oneLine);
  const normalizedCables = normalizeProjectEntities({ cables: canonicalCables }).cables;
  const cableByIdentity = new Map();
  for (const cable of normalizedCables) {
    for (const identity of [cable.id, cable.circuitId, cable.tag]) {
      if (!identity) continue;
      const key = String(identity);
      const matches = cableByIdentity.get(key) || [];
      matches.push(cable);
      cableByIdentity.set(key, matches);
    }
  }
  const physicalFields = new Set([
    'id', 'tag', 'type', 'x', 'y', 'z', 'kw', 'kva', 'kvar', 'voltage',
    'phases', 'powerFactor', 'currentA', 'duty', 'panelRef', 'source',
    'capacityKva', 'frequencyHz', 'availableFaultCurrentKA', 'description',
    'ratingsBasis',
  ]);
  for (const sheet of result.sheets) {
    if (Array.isArray(sheet.components)) {
      sheet.components = sheet.components.map(component => {
        if (!component?.physical || typeof component.physical !== 'object') return component;
        const physical = {};
        for (const key of physicalFields) if (component.physical[key] !== undefined) physical[key] = component.physical[key];
        return { ...component, physical };
      });
    }
    for (const collection of ['components', 'connections']) {
      if (Array.isArray(sheet[collection])) sheet[collection] = sheet[collection].map(item => {
        const compact = compactGeneratedRecord(item);
        if (collection === 'connections' && compact.cable && typeof compact.cable === 'object') {
          const identities = [compact.circuitId, compact.cableRef, compact.cableId, compact.cable.id, compact.cable.tag]
            .filter(value => value !== undefined && value !== null && String(value).trim());
          const matches = [...new Set(identities.flatMap(value => cableByIdentity.get(String(value)) || []))];
          if (matches.length === 1 && (!compact.circuitId || String(compact.circuitId) === String(matches[0].circuitId || matches[0].id))) {
            const canonical = matches[0];
            compact.circuitId = canonical.circuitId || canonical.id;
            const retainedCableFields = {};
            for (const [key, value] of Object.entries(compact.cable)) {
              if (canonical[key] === undefined || !exactStoredValueEqual(value, canonical[key])) {
                retainedCableFields[key] = value;
              }
            }
            if (Object.keys(retainedCableFields).length) compact.cable = retainedCableFields;
            else delete compact.cable;
          }
        }
        delete compact.projectEntity;
        delete compact.cableRecord;
        delete compact.projectCircuit;
        // One-line rows are derived projections; keep their stable identity
        // and electrical summary without cloning the cable's source package.
        for (const key of ['sourceDocuments', 'fieldSources', 'fieldStatus', 'curve', 'curveProfiles', 'evidence']) delete compact[key];
        return compact;
      });
    }
  }
  return result;
}

export function compactProposal(proposal) {
  const result = { ...proposal };
  for (const key of ['equipment', 'panels', 'loads', 'cables', 'trays', 'conduits']) {
    if (Array.isArray(result[key])) result[key] = result[key].map(record => key === 'cables' ? compactCableRecord(record) : (key === 'equipment' && record?.type === 'transformer' ? compactTransformerRecord(record) : compactGeneratedRecord(record)));
  }
  if (result.transformer) {
    result.transformer = compactTransformerRecord(result.transformer);
    delete result.transformer.sourceDocuments;
    delete result.transformer.candidates;
    delete result.transformer.primaryMainCandidates;
  }
  if (result.report?.transformer) {
    result.report = { ...result.report };
    delete result.report.transformer;
  }
  if (result.oneLine) result.oneLine = compactOneLine(result.oneLine, result.cables);
  const compactRoute = route => {
    const copy = clone(route);
    // The canonical cable record retains full installation coverage. Route
    // results keep the geometry and decision summary used by route consumers,
    // but do not persist a second copy of each coverage segment.
    delete copy.installationCoverage;
    // Route thermal evidence is retained on the canonical cable. Avoid a
    // second per-route copy in the derived latest-route-results setting.
    delete copy.thermalAssessment;
    if (copy.routingDecision && typeof copy.routingDecision === 'object') {
      const decision = copy.routingDecision;
      const examinedAlternativeCount = Array.isArray(decision.examinedAlternatives)
        ? decision.examinedAlternatives.length
        : (Number.isFinite(decision.examinedAlternatives) ? decision.examinedAlternatives : undefined);
      copy.routingDecision = {
        status: decision.status,
        reason: decision.reason,
        selectedPath: decision.selectedPath,
        selectedConductorSize: decision.selectedConductorSize,
        selectedLengthFt: decision.selectedLengthFt,
        shortestPath: decision.shortestPath,
        shortestLengthFt: decision.shortestLengthFt,
        shortestRejectedReason: decision.shortestRejectedReason,
        ...(decision.capacityAwareMethod !== undefined ? { capacityAwareMethod: decision.capacityAwareMethod } : {}),
        ...(decision.capacityExcludedEdgeIds !== undefined ? { capacityExcludedEdgeIds: decision.capacityExcludedEdgeIds } : {}),
        ...(decision.alternateEndpointAttachments !== undefined ? { alternateEndpointAttachments: decision.alternateEndpointAttachments } : {}),
        ...(decision.endpointInstallationRetry !== undefined ? { endpointInstallationRetry: decision.endpointInstallationRetry } : {}),
        searchedCandidateCount: decision.searchedCandidateCount,
        ...(examinedAlternativeCount === undefined ? {} : { examinedAlternatives: examinedAlternativeCount }),
      };
    }
    return copy;
  };
  if (Array.isArray(result.routeResults)) result.routeResults = result.routeResults.map(compactRoute);
  else if (Array.isArray(result.routeResults?.batchResults)) result.routeResults = { ...result.routeResults, batchResults: result.routeResults.batchResults.map(compactRoute) };
  return result;
}

function proposalSignature(proposal) {
  return proposal?.inputSignature || proposal?.inputs?.signature || proposal?.inputs?.inputSignature || null;
}

function currentSignature() {
  return dataStore.getProjectInputFingerprint?.() || null;
}

export function currentContext() {
  const meta = dataStore.getProjectMeta?.() || {};
  const browserHasNamedProject = typeof window === 'undefined' || dataStore.hasNamedProjectContext?.() !== false;
  const browserProjectId = globalThis.window?.currentProjectId || globalThis.currentProjectId || null;
  const metadataProjectId = meta.id || meta.projectId || null;
  const candidate = browserHasNamedProject
    ? (browserProjectId || metadataProjectId || (typeof window === 'undefined' ? meta.name || null : null))
    : null;
  const projectId = candidate && !/^untitled$/i.test(String(candidate).trim()) ? candidate : null;
  return { scenario: dataStore.getCurrentScenario?.() || null, projectId, projectFingerprint: currentSignature() };
}

function currentCollections() {
  return {
    equipment: dataStore.getEquipment(),
    panels: dataStore.getPanels(),
    loads: dataStore.getLoads(),
    cables: dataStore.getCables(),
    conduits: dataStore.getConduits(),
    trays: dataStore.getTrays(),
  };
}

/** Return safe current panel-location candidates for the active project. */
function getPanelLocationOverrideCandidates(options = null) {
  if (options && (options.current || options.lastApplied)) return getPanelLocationOverrideCandidatesPure(options);
  const scenario = dataStore.getCurrentScenario?.() || null;
  return getPanelLocationOverrideCandidatesPure({
    current: currentCollections(),
    lastApplied: dataStore.getItem(LAST_APPLIED_KEY, {}, scenario) || {},
  });
}

function racewayAliasSet(record) {
  return [...new Set(['id', 'tag', 'tray_id', 'trayId', 'conduit_id', 'conduitId', 'raceway_id', 'racewayId'].map(key => String(record?.[key] ?? '').trim()).filter(Boolean))];
}

/** Return a read-only preview of the exact merge that apply would perform. */
export function previewDesignProposal(proposal, options = {}) {
  const signature = proposalSignature(proposal);
  const context = currentContext();
  const activeScenario = context.scenario;
  const expectedScenario = options.scenario || proposal?.inputs?.scenario || proposal?.scenario;
  const errors = [];
  if (!proposal || !['proposal', 'blocked'].includes(proposal.status)) errors.push({ code: 'invalid_proposal_status', message: 'Proposal status must be proposal or blocked.' });
  if (!proposal?.schemaVersion || !/^1(?:\.|$)/.test(String(proposal.schemaVersion))) errors.push({ code: 'unsupported_schema_version', message: 'Unsupported design proposal schema version.' });
  for (const key of ['equipment', 'loads', 'panels', 'cables', 'trays', 'conduits']) {
    if (proposal && Object.prototype.hasOwnProperty.call(proposal, key) && !Array.isArray(proposal[key])) errors.push({ code: 'invalid_collection', collection: key });
  }
  if (proposal?.status === 'blocked') errors.push({ code: 'proposal_blocked', message: 'Blocked proposals cannot be applied.' });
  if (proposal?.status === 'proposal' && Array.isArray(proposal.issues) && proposal.issues.some(issue => issue?.severity === 'blocking')) errors.push({ code: 'proposal_has_blocking_issues', message: 'Proposals with blocking issues cannot be applied.' });
  const originalCorridorEdges = proposal?.inputs?.original?.corridors?.edges;
  const hasExistingTray = (Array.isArray(originalCorridorEdges) && originalCorridorEdges.some(edge => Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray')))
    || (Array.isArray(proposal?.trays) && proposal.trays.some(tray => tray?.existingTrayScreen !== undefined));
  const scheduleRows = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const oneLineSheets = Array.isArray(proposal?.oneLine?.sheets) ? proposal.oneLine.sheets : [];
  const claimsCatalog = connection => connection?.cable?.cableCatalogFingerprint !== undefined || connection?.cable?.cableStockId !== undefined;
  const claimsCableCatalog = scheduleRows.some(cable => cable?.cableCatalogFingerprint !== undefined || cable?.cableStockId !== undefined)
    || oneLineSheets.some(sheet => {
      const connections = Array.isArray(sheet?.connections) ? sheet.connections : [];
      const components = Array.isArray(sheet?.components) ? sheet.components : [];
      return [...connections, ...components.flatMap(component => Array.isArray(component?.connections) ? component.connections : [])].some(claimsCatalog);
    });
  if ((proposal?.cableCatalogSource !== undefined || claimsCableCatalog) && !validateDesignSynthesisCableCatalogSource(proposal)) errors.push({ code: 'cable_catalog_evidence_inconsistent', message: 'The frozen cable source identity, stock rows, geometry, construction ratings, or One-Line projection do not match the current archived catalog.' });
  if (proposal?.cableFaultWithstand !== undefined || proposal?.cableFaultWithstandValidation !== undefined) {
    const fresh = evaluateDesignSynthesisCableFaultWithstand({ request: proposal?.cableFaultWithstand, proposal, faultEvolutionValidation: proposal?.faultEvolutionValidation });
    if (fresh.status !== 'evaluated' || fresh.comparison !== 'pass' || !sameCableFaultWithstandResult(fresh, proposal?.cableFaultWithstandValidation)) {
      errors.push({ code: 'cable_fault_withstand_evidence_inconsistent', message: 'The requested cable fault-withstand comparison is incomplete, failing, stale, or structurally different from fresh recomputation. Apply is blocked.' });
    }
    if (!validateDesignSynthesisCableFaultWithstandRevision(proposal?.cableFaultWithstandRevision, proposal)) {
      errors.push({ code: 'cable_fault_revision_trace_inconsistent', message: 'Automatic conductor-trial history is missing, stale, or structurally inconsistent with the final cable, source-history, request, and thermal result. Apply is blocked.' });
    }
  }
  const hasCorePayload = ['equipment', 'loads', 'panels', 'cables', 'trays', 'conduits'].some(key => Array.isArray(proposal?.[key]) && proposal[key].length)
    || Array.isArray(proposal?.oneLine?.sheets) || proposal?.routeResults !== undefined;
  if (proposal?.status === 'proposal' && !hasCorePayload) errors.push({ code: 'empty_proposal', message: 'Proposal contains no generated canonical records or derived artifacts.' });
  if (expectedScenario && activeScenario && expectedScenario !== activeScenario) errors.push({ code: 'stale_scenario', expected: expectedScenario, actual: activeScenario });
  if (!signature) errors.push({ code: 'missing_input_signature', message: 'Proposal must include an immutable draft input signature.' });
  if (options.inputSignature && signature !== options.inputSignature) errors.push({ code: 'stale_input_signature', expected: options.inputSignature, actual: signature });
  if (options.expectedContext) {
    for (const key of ['scenario', 'projectId', 'projectFingerprint']) {
      if (!Object.prototype.hasOwnProperty.call(options.expectedContext, key) || context[key] !== options.expectedContext[key]) errors.push({ code: 'stale_project_context', field: key, expected: options.expectedContext[key], actual: context[key] });
    }
  }
  if (typeof window !== 'undefined' && !context.projectId) errors.push({ code: 'project_required', message: 'Create or open a named project before applying generated design records.' });
  const sourceCollections = currentCollections();
  const lastApplied = dataStore.getItem(LAST_APPLIED_KEY, {}, activeScenario) || {};
  const projectEquipmentAdoption = proposal?.projectEquipmentAdoption || proposal?.inputs?.original?.projectEquipmentAdoption || null;
  let normalizedProposal = compactProposal(proposal || {});
  let projectTrayReconciliation = null;
  const projectTraySource = { projectId: context.projectId, scenario: activeScenario, trays: sourceCollections.trays,
    cables: sourceCollections.cables, routeResults: dataStore.getItem('latestRouteResults', null, activeScenario), lastApplied };
  if (proposal?.inputs?.original?.projectTrayAdoption) {
    projectTrayReconciliation = planProjectTrayReconciliation({ proposal, ...projectTraySource });
    if (projectTrayReconciliation.ok) {
      const ownerIds = new Set(projectTrayReconciliation.ownerTrayIds);
      normalizedProposal.trays = normalizedProposal.trays.filter(row => !ownerIds.has(String(row?.id ?? '').trim().toLowerCase()));
    }
    else errors.push(...projectTrayReconciliation.issues);
  }
  if (hasExistingTray) {
    const original = proposal?.inputs?.original;
    const basis = validateProjectTrayReuseBinding(original);
    let reproduced = false;
    if (projectTrayReconciliation?.ok && basis.ok) {
      try {
        let fresh = generateDesignProposal(original, { projectTraySource });
        if (projectEquipmentAdoption) fresh = bindDesignSynthesisProjectEquipmentProposal(fresh, projectEquipmentAdoption);
        reproduced = fresh.status === 'proposal' && exactStoredValueEqual(fresh, proposal);
      } catch { reproduced = false; }
    }
    if (!projectTrayReconciliation?.ok || !basis.ok || !reproduced) {
      errors.push({ code: 'existing_tray_reconciliation_unresolved', message: 'Existing tray reuse requires a current owner-tray reconciliation, referenced thermal and installation basis, and an exactly reproducible preliminary proposal.' });
      errors.push(...basis.issues);
      if (projectTrayReconciliation?.ok && basis.ok && !reproduced) errors.push({ code: 'project_tray_proposal_not_reproducible', message: 'The proposal does not match a fresh generation against the current reviewed project records.' });
    }
  }
  if (projectEquipmentAdoption) {
    const adoptionValidation = validateDesignSynthesisProjectEquipmentAdoption({
      adoption: projectEquipmentAdoption,
      rows: proposal?.inputs?.original?.equipment || [],
      equipment: sourceCollections.equipment,
      loads: sourceCollections.loads,
      projectId: context.projectId,
      scenario: context.scenario,
      projectFingerprint: context.projectFingerprint,
      lastApplied,
    });
    errors.push(...adoptionValidation.issues);
    normalizedProposal = applyProjectEquipmentIdentityMap(normalizedProposal, projectEquipmentAdoption);
  }
  const reconciliation = reconcileDesignProposal({ current: sourceCollections, proposal: normalizedProposal, lastApplied, projectEquipmentAdoption });
  try {
    if (normalizedProposal?.oneLine && Array.isArray(normalizedProposal.oneLine.sheets)) mergeCurrentOneLine(activeScenario, normalizedProposal.oneLine, lastApplied);
    if (proposal?.routeResults !== undefined) {
      const existingRoutes = dataStore.getItem('latestRouteResults', {}, activeScenario) || {};
      const currentRows = Array.isArray(existingRoutes) ? existingRoutes : existingRoutes.batchResults;
      mergeRouteResults(currentRows, normalizedProposal.routeResults, lastApplied.records?.routeResults || {});
    }
  } catch (error) {
    errors.push({ code: 'derived_record_conflict', message: error instanceof Error ? error.message : String(error) });
  }
  reconciliation.errors.push(...errors);
  const collections = currentCollections();
  const trayAliases = new Set([...(normalizedProposal.trays || []), ...(collections.trays || [])].flatMap(racewayAliasSet));
  // A generated endpoint conduit may already be persisted while a user edits a
  // tray identity.  Compare both the incoming and persisted generated records so
  // the shared route-scene namespace cannot become ambiguous between applies.
  const generatedConduits = [
    ...(normalizedProposal.conduits || []),
    ...(collections.conduits || []),
  ];
  for (const conduit of generatedConduits) {
    if ([...racewayAliasSet(conduit)].some(alias => trayAliases.has(alias))) reconciliation.errors.push({ code: 'raceway_alias_collision', message: `Generated endpoint conduit aliases collide with tray identity: ${conduit.id || conduit.conduit_id}.` });
  }
  const conduitIdentityAliases = new Set(generatedConduits.flatMap(racewayAliasSet).flatMap(alias => [alias, alias.toLowerCase()]));
  for (const tray of [...(normalizedProposal.trays || []), ...(collections.trays || [])]) {
    const explicitTrayIds = [tray?.tray_id, tray?.trayId].map(value => String(value ?? '').trim()).filter(Boolean);
    if (explicitTrayIds.some(alias => conduitIdentityAliases.has(alias) || conduitIdentityAliases.has(alias.toLowerCase()))) {
      reconciliation.errors.push({ code: 'raceway_alias_collision', message: `Tray identity collides with generated endpoint conduit: ${explicitTrayIds.join(', ')}.` });
    }
  }
  reconciliation.ok = reconciliation.errors.length === 0 && reconciliation.conflicts.length === 0;
  return { ...reconciliation, proposal: normalizedProposal, signature, activeScenario, expectedScenario, context, projectTrayReconciliation };
}

function mergeRouteResults(current, generated, oldSnapshots = {}) {
  generated = Array.isArray(generated) ? generated : generated?.batchResults;
  if (!Array.isArray(generated)) return current;
  const currentRows = Array.isArray(current) ? current : [];
  const byId = new Map(currentRows.map((row, index) => [String(row?.id || row?.cable || row?.ref || ''), { row, index }]));
  const next = currentRows.map(clone);
  const seen = new Set();
  for (const row of generated) {
    const id = String(row?.id || row?.cable || row?.ref || '');
    if (!id || seen.has(id)) throw new Error(`Invalid or duplicate route result identity: ${id || '(missing)'}`);
    seen.add(id);
    const prior = byId.get(id);
    const marked = { ...clone(row), _designSynthesis: { ...(row._designSynthesis || {}), identity: id, collection: 'routeResults', source: 'design-synthesis' } };
    if (prior) {
      const priorMarker = prior.row?._designSynthesis;
      if (!priorMarker) throw new Error(`User route result collision: ${id}`);
      if (!oldSnapshots[id] || !snapshotMatches(stripMarker(prior.row), oldSnapshots[id])) throw new Error(`Generated route result was manually changed: ${id}`);
      next[prior.index] = marked;
    } else next.push(marked);
  }
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const row = next[index];
    const id = String(row?.id || row?.cable || row?.ref || '');
    if (!row?._designSynthesis || seen.has(id)) continue;
    const snapshot = oldSnapshots[id];
    if (!snapshot) continue;
    if (!snapshotMatches(stripMarker(row), snapshot)) throw new Error(`Obsolete generated route result was manually changed: ${id}`);
    next.splice(index, 1);
  }
  return next;
}

function graphIdentity(value, kind) {
  return String(value?.id || value?.ref || value?.tag || (kind === 'connection' ? `${value?.source || value?.from || ''}->${value?.target || value?.to || ''}` : ''));
}

function sheetIdentity(value) {
  const raw = String(value?.id || value?.name || '').trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sheetMatches(candidate, source) {
  const candidateId = String(candidate?.id || '').trim();
  const sourceId = String(source?.id || '').trim();
  if (candidateId && sourceId && candidateId === sourceId) return true;
  const candidateName = String(candidate?.name || '').trim();
  const sourceName = String(source?.name || '').trim();
  if (candidateName && sourceName && candidateName === sourceName) return true;
  const candidateKey = sheetIdentity(candidate);
  const sourceKey = sheetIdentity(source);
  return Boolean(candidateKey && sourceKey && candidateKey === sourceKey);
}

function mergeGraphItems(existing, incoming, kind, snapshots = {}) {
  const current = Array.isArray(existing) ? existing.map(clone) : [];
  const byId = new Map();
  const seen = new Set();
  current.forEach((item, index) => {
    const id = graphIdentity(item, kind);
    if (!id || seen.has(id)) throw new Error(`Duplicate current one-line ${kind} identity: ${id || '(missing)'}`);
    seen.add(id); byId.set(id, { item, index });
  });
  const incomingIds = new Set();
  for (const source of Array.isArray(incoming) ? incoming : []) {
    const normalizedSource = kind === 'connection' && source?.cable?.id
      ? {
        ...source,
        id: String(source.id || source.cable.id).toLowerCase(),
        cableId: String(source.cableId || source.cable.id).toLowerCase(),
        cableRef: String(source.cableRef || source.cable.id).toLowerCase(),
        cable: { ...source.cable, id: String(source.cable.id).toLowerCase() },
      }
      : source;
    const id = graphIdentity(normalizedSource, kind);
    if (!id || incomingIds.has(id)) throw new Error(`Duplicate proposal one-line ${kind} identity: ${id || '(missing)'}`);
    incomingIds.add(id);
    const prior = byId.get(id);
    const marked = { ...clone(normalizedSource), _designSynthesis: { ...(normalizedSource._designSynthesis || {}), identity: id, collection: `oneLine.${kind}`, source: 'design-synthesis' } };
    if (!prior) { current.push(marked); continue; }
    if (!prior.item._designSynthesis) throw new Error(`User one-line ${kind} collision: ${id}`);
    const snapshot = snapshots[id];
    if (!snapshot || !graphSnapshotMatches(prior.item, snapshot)) throw new Error(`Generated one-line ${kind} was manually changed: ${id}`);
    current[prior.index] = marked;
  }
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const item = current[index];
    const id = graphIdentity(item, kind);
    if (!item?._designSynthesis || incomingIds.has(id)) continue;
    const snapshot = snapshots[id];
    if (!snapshot) continue;
    if (!graphSnapshotMatches(item, snapshot)) throw new Error(`Obsolete generated one-line ${kind} was manually changed: ${id}`);
    current.splice(index, 1);
  }
  return current;
}

function mergeOneLine(current, proposal, priorSnapshots = {}) {
  const next = clone(current && Array.isArray(current.sheets) ? current : { activeSheet: 0, sheets: [] });
  const sourceSheets = proposal.sheets || [];
  const proposalKeys = new Set();
  for (const sourceSheet of sourceSheets) {
    const key = sheetIdentity(sourceSheet) || `exact:${String(sourceSheet.id || sourceSheet.name || '')}`;
    if (proposalKeys.has(key)) throw new Error(`Duplicate proposal one-line sheet identity: ${key}`);
    proposalKeys.add(key);
  }
  const currentKeys = new Set();
  for (const sheet of next.sheets) {
    const key = sheetIdentity(sheet);
    if (!key) continue;
    if (currentKeys.has(key)) throw new Error(`Ambiguous current one-line sheet identity: ${key}`);
    currentKeys.add(key);
  }
  for (const sourceSheet of sourceSheets) {
    const sheetId = sheetIdentity(sourceSheet) || `sheet-${next.sheets.length + 1}`;
    const matches = next.sheets.filter(sheet => sheetMatches(sheet, sourceSheet));
    if (matches.length > 1) throw new Error(`Ambiguous current one-line sheet match: ${sheetId}`);
    let target = matches[0];
    if (!target) {
      target = { ...clone(sourceSheet), components: [], connections: [] };
      next.sheets.push(target);
    }
    const rawSheetId = String(sourceSheet.id || sourceSheet.name || '');
    const legacySaved = Object.entries(priorSnapshots).find(([key]) => sheetIdentity({ id: key }) === sheetId)?.[1];
    const saved = priorSnapshots[sheetId] || priorSnapshots[rawSheetId] || legacySaved || {};
    target.components = mergeGraphItems(target.components, sourceSheet.components, 'component', saved.components || {});
    target.connections = mergeGraphItems(target.connections, sourceSheet.connections, 'connection', saved.connections || {});
  }
  return next;
}

function mergeCurrentOneLine(scenario, proposal, lastApplied = {}) {
  // Compare the raw stored diagram when this proposal has a raw baseline.
  // getOneLine() hydrates schedule entities onto its read-only view, so edits
  // to owner fields can change that view without changing the saved diagram.
  // Legacy snapshots retain their prior view-based comparison until the next
  // successful Apply writes the raw baseline.
  const hasRawBaseline = lastApplied.oneLineStored && typeof lastApplied.oneLineStored === 'object';
  const current = hasRawBaseline
    ? (dataStore.getScenarioSnapshot?.(scenario)?.oneLine || { activeSheet: 0, sheets: [] })
    : dataStore.getOneLine(scenario);
  const snapshots = hasRawBaseline ? lastApplied.oneLineStored : lastApplied.oneLine || {};
  return mergeOneLine(current, proposal, snapshots);
}

export function validateDesignSynthesisCableCatalogSource(proposal) {
  try {
    if (fingerprintStudyValue(proposal?.cableCatalogSource) !== fingerprintStudyValue(SOUTHWIRE_MC_SOURCE)
      || !Array.isArray(proposal?.cables) || !proposal.cables.length) return false;
    const matchesSourceCable = (cable, { requirePhysicalBasis = false } = {}) => {
      const size = String(cable?.conductor_size || cable?.conductorSize || '');
      const source = SOURCED_MC_R_X[size];
      if (['conductor_size', 'conductorSize', 'size'].some(field => cable?.[field] !== undefined && String(cable[field]).trim() !== size)) return false;
      if (!source || !(String(cable.cableStockId || '') === source.stockId
        && String(cable.cableCatalogFingerprint || '') === SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT
        && cable.r_ohm_per_kft === source.r
        && cable.x_ohm_per_kft === source.x)) return false;
      for (const field of ['source', 'impedanceBasis']) {
        if (cable[field] !== undefined && String(cable[field]) !== source.source) return false;
      }
      for (const field of ['conductorMaterial', 'conductor_material']) {
        if (cable[field] !== undefined && !['cu', 'copper'].includes(String(cable[field]).trim().toLowerCase())) return false;
      }
      if (requirePhysicalBasis && (cable.outerDiameterIn !== source.od || cable.cable_od !== source.od
        || cable.conductor_count !== 3 || cable.cable_rating !== 600)) return false;
      for (const field of ['outerDiameterIn', 'cable_od', 'diameter']) {
        if (cable[field] !== undefined && cable[field] !== source.od) return false;
      }
      for (const field of ['conductor_count', 'conductors', 'conductors_per_cable']) {
        if (cable[field] !== undefined && cable[field] !== 3) return false;
      }
      for (const field of ['cable_rating', 'cableRating']) {
        if (cable[field] !== undefined && cable[field] !== 600) return false;
      }
      for (const field of ['constructionSource', 'construction_source', 'cableConstructionSource']) {
        if (cable[field] !== undefined && ![SOUTHWIRE_MC_SOURCE.sourceId, SOUTHWIRE_MC_SOURCE.revision].includes(cable[field])) return false;
      }
      return true;
    };
    if (!proposal.cables.every(cable => matchesSourceCable(cable, { requirePhysicalBasis: true }))) return false;

    const schedulesByIdentity = new Map();
    for (const cable of proposal.cables) {
      for (const identity of [cable?.id, cable?.tag].filter(value => value !== undefined && value !== null).map(String)) {
        schedulesByIdentity.set(identity, cable);
      }
    }
    const embedded = [];
    for (const sheet of proposal?.oneLine?.sheets || []) {
      for (const connection of [...(sheet?.connections || []), ...(sheet?.components || []).flatMap(component => component?.connections || [])]) {
        const identity = String(connection?.cableRef || connection?.cableId || connection?.cable?.id || connection?.cable?.tag || '');
        if (connection?.cable && (schedulesByIdentity.has(identity) || connection.cable.cableStockId !== undefined || connection.cable.cableCatalogFingerprint !== undefined)) embedded.push(connection);
      }
    }
    return embedded.every(connection => {
      const cable = connection.cable;
      const scheduled = schedulesByIdentity.get(String(connection.cableRef || connection.cableId || cable.id || cable.tag || ''))
        || schedulesByIdentity.get(String(cable.id || cable.tag || ''));
      return Boolean(scheduled && matchesSourceCable(cable)
        && cable.cableStockId === scheduled.cableStockId
        && cable.cableCatalogFingerprint === scheduled.cableCatalogFingerprint
        && cable.r_ohm_per_kft === scheduled.r_ohm_per_kft
        && cable.x_ohm_per_kft === scheduled.x_ohm_per_kft
        && cable.conductor_size === scheduled.conductor_size);
    });
  } catch { return false; }
}

/** Apply one proposal as one undoable canonical project mutation. */
export function applyDesignProposal(proposal, options = {}) {
  const captured = options.previewContext || options.expectedContext;
  if (!captured || !['scenario', 'projectId', 'projectFingerprint'].every(key => Object.prototype.hasOwnProperty.call(captured, key))) return { applied: false, errors: [{ code: 'missing_preview_context', message: 'Apply requires the complete context captured by previewDesignProposal.' }], conflicts: [] };
  const preview = previewDesignProposal(proposal, { ...options, expectedContext: captured });
  if (!preview.ok) return { applied: false, ...preview };
  const faultScenarioRequested = proposal?.faultScenarios !== undefined || proposal?.faultScenarioValidation !== undefined;
  let faultScenarioValidation = null;
  if (faultScenarioRequested) {
    try { faultScenarioValidation = compactFaultScenarioValidation(proposal); }
    catch (error) {
      return { applied: false, ...preview, errors: [...preview.errors, { code: 'fault_scenario_persistence_failed', message: error instanceof Error ? error.message : String(error) }] };
    }
    if (!faultScenarioValidation) return { applied: false, ...preview, errors: [...preview.errors, { code: 'fault_scenario_evidence_incomplete', message: 'Explicit fault-scenario evidence could not be packed completely; Apply was blocked to preserve the requested study.' }] };
  }
  const faultEvolutionRequested = proposal?.faultEvolution !== undefined || proposal?.faultEvolutionValidation !== undefined || proposal?.cableFaultWithstand !== undefined || proposal?.cableFaultWithstandValidation !== undefined;
  const faultEvolutionEvaluated = proposal?.faultEvolutionValidation?.status === 'evaluated';
  if (faultEvolutionRequested && !faultEvolutionEvaluated) {
    return { applied: false, ...preview, errors: [...preview.errors, { code: 'fault_evolution_evidence_incomplete', message: 'A requested fault-history or cable fault-withstand comparison has no complete evaluated result; Apply was blocked rather than silently dropping the requested study.' }] };
  }
  if (faultEvolutionEvaluated && !validateDesignSynthesisFaultEvolutionForPersistence(proposal)) {
    return { applied: false, ...preview, errors: [...preview.errors, { code: 'fault_evolution_evidence_inconsistent', message: 'Supplied-source history evidence failed fresh recomputation or integrity checks; Apply was blocked to preserve complete evidence.' }] };
  }
  const scenario = preview.activeScenario;
  const snapshot = { ...preview.snapshot, proposalId: proposal.id || proposal.proposalId || null, inputSignature: preview.signature, scenario, appliedAt: new Date().toISOString(), ...(proposal.distributionBaseline ? { distributionBaseline: clone(proposal.distributionBaseline) } : {}), ...(proposal.routingRetry ? { routingRetry: clone(proposal.routingRetry) } : {}) };
  if (preview.projectTrayReconciliation?.ok && proposal?.inputs?.original?.projectTrayReuseBinding) {
    const original = proposal.inputs.original;
    snapshot.projectTrayReuse = {
      status: 'preliminary-user-references-not-independently-verified',
      adoption: clone(original.projectTrayAdoption),
      binding: clone(original.projectTrayReuseBinding),
      thermalEdges: original.corridors.edges.filter(edge => Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray')).map(edge => ({ id: edge.id, thermal: clone(edge.thermal) })),
    };
  }
  const transaction = captureProjectTransactionSnapshot();
  beginProjectMutationBatch();
  let ended = false;
  try {
    // Merge the diagram against the stored/view state before canonical
    // collection setters enrich its project references. Otherwise a panel or
    // load recomputation makes an untouched generated node look manually
    // edited during the same apply.
    const mergedOneLine = preview.proposal.oneLine && Array.isArray(preview.proposal.oneLine.sheets)
      ? mergeCurrentOneLine(scenario, preview.proposal.oneLine, dataStore.getItem(LAST_APPLIED_KEY, {}, scenario) || {})
      : null;
    const collectionUpdates = {};
    for (const key of ['equipment', 'panels', 'loads', 'cables']) {
      if (Array.isArray(preview.proposal[key])) collectionUpdates[key] = preview.next[key];
    }
    if (Object.keys(collectionUpdates).length) dataStore.setProjectEntityCollections(collectionUpdates);
    if (Array.isArray(preview.proposal.trays)) dataStore.setTrays(preview.next.trays);
    if (Array.isArray(preview.proposal.conduits)) dataStore.setConduits(preview.next.conduits);
    if (mergedOneLine) dataStore.setOneLine(mergedOneLine, scenario, { captureRevision: false });
    if (preview.proposal.routeResults !== undefined) {
      const existingRoutes = dataStore.getItem('latestRouteResults', {}, scenario) || {};
      const currentRows = Array.isArray(existingRoutes) ? existingRoutes : existingRoutes.batchResults;
      const priorApplied = dataStore.getItem(LAST_APPLIED_KEY, {}, scenario) || {};
      const priorRoutes = priorApplied.records?.routeResults || {};
      const mergedRows = mergeRouteResults(currentRows, preview.proposal.routeResults, priorRoutes);
      dataStore.setItem('latestRouteResults', Array.isArray(existingRoutes) ? mergedRows : { ...existingRoutes, batchResults: mergedRows }, scenario);
    }
    if (Array.isArray(proposal.cables)) {
      const evidence = dataStore.getItem(DEVICE_EVIDENCE_KEY, {}, scenario) || {};
      if (isDeviceEvidenceEnvelope(evidence)) throw new Error('Device evidence is corrupted or uses an unsupported encoding; Apply was rolled back.');
      for (const cable of proposal.cables) {
        const selected = cable?.protectiveDevice;
        if (selected && typeof selected === 'object') evidence[fingerprintStudyValue(selected)] = clone(selected);
      }
      const transformerRecords = [proposal.transformer, ...(proposal.equipment || []).filter(record => record?.type === 'transformer')].filter(Boolean);
      for (const transformer of transformerRecords) for (const field of ['primaryProtectiveDevice', 'secondaryMainDevice']) {
        const selected = transformer[field];
        if (selected && typeof selected === 'object') evidence[fingerprintStudyValue(selected)] = clone(selected);
      }
      dataStore.setItem(DEVICE_EVIDENCE_KEY, evidence, scenario);
      const savedEvidence = dataStore.getItem(DEVICE_EVIDENCE_KEY, {}, scenario);
      if (isDeviceEvidenceEnvelope(savedEvidence) || !exactStoredValueEqual(savedEvidence, evidence)) {
        throw new Error('Device evidence could not be stored without loss; Apply was rolled back.');
      }
    }
    if (faultScenarioValidation && !resolveDesignSynthesisFaultScenarioValidation(faultScenarioValidation, proposal.faultScenarios)) {
      throw new Error('Explicit fault-scenario evidence failed integrity validation; Apply was rolled back.');
    }
    if (proposal.inputEvidence) dataStore.setItem(INPUT_EVIDENCE_KEY, compactInputEvidence(proposal.inputEvidence), scenario);
    const loadFlowValidation = compactLoadFlowValidation(proposal);
    if (loadFlowValidation) dataStore.setItem(LOAD_FLOW_VALIDATION_KEY, loadFlowValidation, scenario);
    else dataStore.removeItem(LOAD_FLOW_VALIDATION_KEY, scenario);
    if (faultScenarioValidation?.status === 'evaluated') {
      dataStore.setItem(FAULT_SCENARIO_VALIDATION_KEY, faultScenarioValidation, scenario);
      dataStore.removeItem(FAULT_STUDY_VALIDATION_KEY, scenario);
      dataStore.removeItem(DEVICE_FAULT_VALIDATION_KEY, scenario);
    } else {
      dataStore.removeItem(FAULT_SCENARIO_VALIDATION_KEY, scenario);
      const faultStudyValidation = compactFaultStudyValidation(proposal, { byteEncoding: 'utf15' });
      if (faultStudyValidation?.status === 'evaluated') dataStore.setItem(FAULT_STUDY_VALIDATION_KEY, faultStudyValidation, scenario);
      else dataStore.removeItem(FAULT_STUDY_VALIDATION_KEY, scenario);
      const deviceFaultValidation = compactDeviceFaultValidation(proposal, faultStudyValidation);
      if (deviceFaultValidation?.status === 'evaluated') dataStore.setItem(DEVICE_FAULT_VALIDATION_KEY, deviceFaultValidation, scenario);
      else dataStore.removeItem(DEVICE_FAULT_VALIDATION_KEY, scenario);
    }
    const persisted = { equipment: dataStore.getEquipment(), panels: dataStore.getPanels(), loads: dataStore.getLoads(), cables: dataStore.getCables(), trays: dataStore.getTrays(), conduits: dataStore.getConduits() };
    for (const key of Object.keys(persisted)) {
      const owned = new Set(Object.keys(preview.snapshot.records?.[key] || {}));
      snapshot.records[key] = Object.fromEntries(persisted[key]
        .filter(record => owned.has(String(record._designSynthesis?.identity || record.id || record.ref || record.tag)))
        .map(record => [String(record._designSynthesis?.identity || record.id || record.ref || record.tag), recordSnapshot(record, key)]));
    }
    if (preview.proposal.routeResults !== undefined) {
      const savedRoutes = dataStore.getItem('latestRouteResults', {}, scenario) || {};
      const rows = Array.isArray(savedRoutes) ? savedRoutes : savedRoutes.batchResults;
      snapshot.records.routeResults = Object.fromEntries((rows || [])
        .filter(row => row?._designSynthesis)
        .map(row => [String(row._designSynthesis?.identity || row.id || row.cable || row.ref), recordSnapshot(row, 'routeResults')]));
    }
    if (preview.proposal.oneLine !== undefined) {
      snapshot.oneLine = {};
      for (const sheet of dataStore.getOneLine(scenario).sheets || []) {
        const sheetId = String(sheet.id || sheet.name || '');
        snapshot.oneLine[sheetId] = {
          components: Object.fromEntries((sheet.components || []).filter(item => item?._designSynthesis).map(item => [graphIdentity(item, 'component'), recordSnapshot(graphComparable(item))])),
          connections: Object.fromEntries((sheet.connections || []).filter(item => item?._designSynthesis).map(item => [graphIdentity(item, 'connection'), recordSnapshot(graphComparable(item))])),
        };
      }
      snapshot.oneLineStored = {};
      const storedDiagram = dataStore.getScenarioSnapshot?.(scenario)?.oneLine || { sheets: [] };
      for (const sheet of storedDiagram.sheets || []) {
        const sheetId = String(sheet.id || sheet.name || '');
        snapshot.oneLineStored[sheetId] = {
          components: Object.fromEntries((sheet.components || []).filter(item => item?._designSynthesis).map(item => [graphIdentity(item, 'component'), recordSnapshot(graphComparable(item))])),
          connections: Object.fromEntries((sheet.connections || []).filter(item => item?._designSynthesis).map(item => [graphIdentity(item, 'connection'), recordSnapshot(graphComparable(item))])),
        };
      }
    }
    dataStore.setItem(LAST_APPLIED_KEY, snapshot, scenario);
    if (proposal?.cableCatalogSource !== undefined) dataStore.setItem(CABLE_CATALOG_SOURCE_KEY, clone(proposal.cableCatalogSource), scenario);
    else if (Array.isArray(preview.proposal.cables)) dataStore.removeItem(CABLE_CATALOG_SOURCE_KEY, scenario);
    if (preview.signature) dataStore.setItem(INPUT_SIGNATURE_KEY, preview.signature, scenario);
    // Keep the project-name synchronization performed by saveProject inside
    // this mutation batch. Otherwise an Apply can create a second undo entry
    // when metadata names the project but canonical project state has no name.
    if (preview.context.projectId) {
      const projectState = getProjectState();
      if (projectState?.name !== preview.context.projectId) setProjectState({ ...projectState, name: preview.context.projectId });
    }
    if (faultEvolutionRequested) {
      if (faultEvolutionEvaluated) {
        const context = getDesignSynthesisFaultEvolutionContext();
        const saved = packDesignSynthesisFaultEvolutionValidation(proposal, context);
        if (!saved || !resolveDesignSynthesisFaultEvolutionValidation(saved, context, {
          canonicalCables: dataStore.getCables(),
          cableCatalogSource: dataStore.getItem(CABLE_CATALOG_SOURCE_KEY, null, scenario),
          faultStudyValidation: dataStore.getItem(FAULT_STUDY_VALIDATION_KEY, null, scenario),
        })) throw new Error('Supplied-source history could not be packed and bound to the final canonical project context; Apply was rolled back.');
        dataStore.setItem(FAULT_EVOLUTION_VALIDATION_KEY, saved, scenario);
      } else dataStore.removeItem(FAULT_EVOLUTION_VALIDATION_KEY, scenario);
    } else dataStore.removeItem(FAULT_EVOLUTION_VALIDATION_KEY, scenario);
    endProjectMutationBatch();
    ended = true;
    // The authoritative CTR_PROJECT_V1 write is deferred until the batch is
    // committed, so inspect durability only after endProjectMutationBatch.
    const diagnostics = getProjectStorageDiagnostics?.();
    if (diagnostics && (diagnostics.persistentStorageAvailable === false || diagnostics.storageWriteBlocked === true)) {
      throw new Error('Project persistence is unavailable; generated design was rolled back.');
    }
    // Navigation reloads the active named project from its saved snapshot.
    // Keep that governed snapshot in lockstep with the canonical mutation so
    // a successful apply cannot be replaced by the pre-apply project on the
    // next page.
    if (typeof window !== 'undefined' && preview.context.projectId && typeof dataStore.saveProject === 'function' && !dataStore.saveProject(preview.context.projectId, scenario)) {
      throw new Error('Active project snapshot could not be saved; generated design was rolled back.');
    }
  } catch (error) {
    if (!ended) endProjectMutationBatch();
    const rollbackSucceeded = restoreProjectTransactionSnapshot(transaction);
    const failureMessage = error instanceof Error ? error.message : String(error);
    const failureSummary = failureMessage.replace(/\s*;?\s*generated design was rolled back\.?$/i, '').trim();
    const reportedMessage = rollbackSucceeded
      ? failureMessage
      : `${failureSummary ? `${failureSummary}; ` : ''}rollback is incomplete because storage values could not be restored. Further storage writes remain blocked.`;
    return {
      applied: false,
      ...preview,
      errors: [
        ...preview.errors,
        { code: 'apply_failed', message: reportedMessage },
        ...(rollbackSucceeded ? [] : [{ code: 'rollback_incomplete', message: 'Some local or session storage values could not be restored; storage remains blocked.' }]),
      ],
    };
  } finally {
    if (!ended) endProjectMutationBatch();
  }
  return { applied: true, ...preview, snapshot };
}

export function resolveDesignSynthesisDeviceEvidence(cable, evidence = null, scenario = null) {
  const ref = cable?.protectiveDeviceEvidenceRef;
  const map = evidence || dataStore.getItem(DEVICE_EVIDENCE_KEY, {}, scenario || undefined) || {};
  return resolveReferencedDeviceEvidence(ref, cable?.protectiveDevice, map);
}

export function resolveDesignSynthesisTransformerDeviceEvidence(transformer, side, evidence = null, scenario = null) {
  const field = side === 'primary' ? 'primaryProtectiveDevice' : side === 'secondary' ? 'secondaryMainDevice' : null;
  if (!field) return null;
  const ref = transformer?.[`${field}EvidenceRef`];
  const map = evidence || dataStore.getItem(DEVICE_EVIDENCE_KEY, {}, scenario || undefined) || {};
  return resolveReferencedDeviceEvidence(ref, transformer?.[field], map);
}

export { LAST_APPLIED_KEY, INPUT_SIGNATURE_KEY, DEVICE_EVIDENCE_KEY, INPUT_EVIDENCE_KEY, LOAD_FLOW_VALIDATION_KEY, FAULT_STUDY_VALIDATION_KEY, DEVICE_FAULT_VALIDATION_KEY, FAULT_SCENARIO_VALIDATION_KEY, getPanelLocationOverrideCandidates };
