import * as dataStore from '../../dataStore.mjs';
import { getCurrentScenarioNameState, getProjectState } from '../../projectStorage.js';
import { hashProjectInputs } from '../../analysis/projectIntegration.mjs';
import { fingerprintStudyValue } from '../../analysis/studyLifecycle.mjs';
import { evaluateDesignSynthesisFaultEvolution } from '../../analysis/designSynthesisFaultEvolution.mjs';
import { buildDesignSynthesisCableFaultWithstandBindings, buildDesignSynthesisCableSpanProposalContext, CONTINUOUS_CABLE_FAULT_SELECTION, evaluateDesignSynthesisCableFaultWithstand, rebindDesignSynthesisCableFaultWithstandBindings, restoreDesignSynthesisCableSpanProposalContext, sameCableFaultWithstandResult, validateDesignSynthesisCableFaultWithstandRevision } from '../../analysis/designSynthesisCableFaultWithstand.mjs';
import { compressFaultBytes, decompressFaultBytes, encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes } from './faultEvidenceCodec.mjs';

export const FAULT_EVOLUTION_VALIDATION_KEY = 'designSynthesisFaultEvolutionValidation';
export const FAULT_STUDY_VALIDATION_KEY = 'designSynthesisFaultStudyValidation';
export const DEVICE_FAULT_VALIDATION_KEY = 'designSynthesisDeviceFaultValidation';
export const DEVICE_EVIDENCE_KEY = 'designSynthesisDeviceEvidence';

const ENCODING = 'fault-evolution-json-lz77-utf15-v1';
const PAYLOAD_ENCODING = 'fault-evolution-packed-v1';
const MAX_JSON_BYTES = 12_000_000;
const MAX_COMPRESSED_BYTES = 1_500_000;
const NEGATIVE_ZERO_MARKER = '$faultEvolutionNegativeZero';

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validContext(value) {
  return object(value) && value.schema === 'fault-evolution-context-v1'
    && typeof value.projectId === 'string' && !!value.projectId.trim()
    && typeof value.scenario === 'string' && !!value.scenario.trim()
    && typeof value.projectInputFingerprint === 'string' && !!value.projectInputFingerprint
    && typeof value.faultStudyFingerprint === 'string' && !!value.faultStudyFingerprint
    && typeof value.deviceFaultFingerprint === 'string' && !!value.deviceFaultFingerprint
    && typeof value.deviceEvidenceFingerprint === 'string' && !!value.deviceEvidenceFingerprint;
}
function clone(value) { return structuredClone(value); }
function stringifyLossless(value) {
  return JSON.stringify(value, (_key, entry) => Object.is(entry, -0) ? { [NEGATIVE_ZERO_MARKER]: true } : entry);
}
function parseLossless(value) {
  return JSON.parse(value, (_key, entry) => object(entry) && Object.keys(entry).length === 1 && entry[NEGATIVE_ZERO_MARKER] === true ? -0 : entry);
}

export function stableFaultEvolutionProjectSnapshot(snapshot) {
  if (!object(snapshot)) return null;
  const stable = clone(snapshot);
  if (object(stable.projectMeta)) delete stable.projectMeta.updatedAt;
  if (object(stable.oneLine)) delete stable.oneLine.activeSheet;
  return stable;
}

export function buildDesignSynthesisFaultEvolutionContext({ snapshot, projectId, scenario, faultStudyValidation, deviceFaultValidation, deviceEvidence } = {}) {
  const stableSnapshot = stableFaultEvolutionProjectSnapshot(snapshot);
  if (!stableSnapshot || typeof projectId !== 'string' || !projectId.trim() || typeof scenario !== 'string' || !scenario.trim()
    || !object(faultStudyValidation) || !object(deviceFaultValidation) || !object(deviceEvidence)) return null;
  return {
    schema: 'fault-evolution-context-v1',
    projectId,
    scenario,
    projectInputFingerprint: hashProjectInputs(stableSnapshot),
    faultStudyFingerprint: fingerprintStudyValue(faultStudyValidation),
    deviceFaultFingerprint: fingerprintStudyValue(deviceFaultValidation),
    deviceEvidenceFingerprint: fingerprintStudyValue(deviceEvidence),
  };
}

export function getDesignSynthesisFaultEvolutionContext() {
  try {
    const scenario = getCurrentScenarioNameState();
    const snapshot = dataStore.getProjectInputSnapshot();
    const meta = dataStore.getProjectMeta?.() || {};
    const browserHasNamedProject = typeof window === 'undefined' || dataStore.hasNamedProjectContext?.() !== false;
    const browserProjectId = globalThis.window?.currentProjectId || globalThis.currentProjectId || null;
    const metadataProjectId = meta.id || meta.projectId || null;
    const candidate = browserHasNamedProject
      ? (browserProjectId || metadataProjectId || (typeof window === 'undefined' ? meta.name || getProjectState()?.name || null : null))
      : null;
    const projectId = candidate && !/^untitled$/i.test(String(candidate).trim()) ? String(candidate).trim() : '';
    return buildDesignSynthesisFaultEvolutionContext({
      snapshot,
      projectId,
      scenario,
      faultStudyValidation: dataStore.getItem(FAULT_STUDY_VALIDATION_KEY, null, scenario),
      deviceFaultValidation: dataStore.getItem(DEVICE_FAULT_VALIDATION_KEY, null, scenario),
      deviceEvidence: dataStore.getItem(DEVICE_EVIDENCE_KEY, {}, scenario),
    });
  } catch { return null; }
}

export function validateDesignSynthesisFaultEvolutionForPersistence(proposal) {
  const result = proposal?.faultEvolutionValidation;
  if (!object(result) || result.status !== 'evaluated' || result.protectionAdequacy !== 'unevaluated'
    || result.coverage?.status !== 'complete' || !Array.isArray(result.faultCases) || !result.faultCases.length
    || !Array.isArray(result.deviceHistories) || !result.deviceHistories.length
    || typeof result.modelInputFingerprint !== 'string' || !result.modelInputFingerprint
    || !object(proposal.faultStudy) || !object(proposal.faultEvolution)
    || proposal.faultStudyValidation?.status !== 'evaluated' || proposal.deviceFaultValidation?.status !== 'evaluated') return false;
  try {
    const fresh = evaluateDesignSynthesisFaultEvolution({
      proposal,
      faultStudy: proposal.faultStudy,
      faultEvolution: proposal.faultEvolution,
      faultStudyValidation: proposal.faultStudyValidation,
      deviceFaultValidation: proposal.deviceFaultValidation,
    });
    if (fresh?.status !== 'evaluated' || fresh.modelInputFingerprint !== result.modelInputFingerprint || fingerprintStudyValue(fresh) !== fingerprintStudyValue(result)) return false;
    if (proposal.cableFaultWithstand === undefined && proposal.cableFaultWithstandValidation === undefined) return proposal.cableFaultWithstandRevision === undefined;
    const screen = evaluateDesignSynthesisCableFaultWithstand({ request: proposal.cableFaultWithstand, proposal: { ...proposal, faultEvolutionValidation: fresh }, faultEvolutionValidation: fresh });
    return screen.status === 'evaluated' && screen.comparison === 'pass'
      && sameCableFaultWithstandResult(screen, proposal.cableFaultWithstandValidation)
      && validateDesignSynthesisCableFaultWithstandRevision(proposal.cableFaultWithstandRevision, { ...proposal, faultEvolutionValidation: fresh });
  } catch { return false; }
}

export function packDesignSynthesisFaultEvolutionValidation(proposal, context) {
  try {
    const result = proposal?.faultEvolutionValidation;
    if (!validateDesignSynthesisFaultEvolutionForPersistence(proposal) || !validContext(context)) return null;
    const payload = {
      encoding: PAYLOAD_ENCODING,
      context: clone(context),
      faultStudy: clone(proposal.faultStudy),
      faultEvolution: clone(proposal.faultEvolution),
      faultEvolutionValidation: clone(result),
    };
    if (proposal.cableFaultWithstand !== undefined) {
      const bindings = buildDesignSynthesisCableFaultWithstandBindings(proposal.cables, proposal.cableFaultWithstand, { allCables: true });
      if (!bindings || proposal.cableFaultWithstandValidation?.status !== 'evaluated' || proposal.cableFaultWithstandValidation?.comparison !== 'pass') return null;
      payload.cableFaultWithstand = clone(proposal.cableFaultWithstand);
      payload.cableFaultWithstandValidation = clone(proposal.cableFaultWithstandValidation);
      payload.cableFaultWithstandBindings = clone(bindings);
      payload.cableFaultWithstandRevision = clone(proposal.cableFaultWithstandRevision);
      if (proposal.cableFaultWithstand.faultSelection?.mode === CONTINUOUS_CABLE_FAULT_SELECTION) {
        payload.cableSpanProposalContext = buildDesignSynthesisCableSpanProposalContext(proposal);
        if (!payload.cableSpanProposalContext) return null;
      }
    }
    const jsonBytes = new TextEncoder().encode(stringifyLossless(payload));
    if (!jsonBytes.length || jsonBytes.length > MAX_JSON_BYTES) return null;
    const compressed = compressFaultBytes(jsonBytes);
    if (!compressed?.length || compressed.length > MAX_COMPRESSED_BYTES) return null;
    return {
      encoding: ENCODING,
      status: 'evaluated',
      uncompressedByteLength: jsonBytes.length,
      lzByteLength: compressed.length,
      payloadBinaryString: encodeDesignSynthesisFaultScenarioBytes(compressed),
      payloadFingerprint: fingerprintStudyValue(payload),
      contextFingerprint: fingerprintStudyValue(context),
      modelInputFingerprint: result.modelInputFingerprint,
      faultCaseCount: result.faultCases.length,
      deviceHistoryCount: result.deviceHistories.length,
      timeKnotCount: Array.isArray(result.timeKnotsS) ? result.timeKnotsS.length : 0,
    };
  } catch { return null; }
}

export function resolveDesignSynthesisFaultEvolutionValidation(saved, context, { canonicalCables, cableCatalogSource, faultStudyValidation } = {}) {
  try {
    if (!object(saved) || saved.encoding !== ENCODING || saved.status !== 'evaluated'
      || !validContext(context)
      || !Number.isSafeInteger(saved.uncompressedByteLength) || saved.uncompressedByteLength < 1 || saved.uncompressedByteLength > MAX_JSON_BYTES
      || !Number.isSafeInteger(saved.lzByteLength) || saved.lzByteLength < 1 || saved.lzByteLength > MAX_COMPRESSED_BYTES
      || typeof saved.payloadFingerprint !== 'string' || typeof saved.contextFingerprint !== 'string'
      || typeof saved.modelInputFingerprint !== 'string' || !Number.isSafeInteger(saved.faultCaseCount) || saved.faultCaseCount < 1
      || !Number.isSafeInteger(saved.deviceHistoryCount) || saved.deviceHistoryCount < 1
      || !Number.isSafeInteger(saved.timeKnotCount) || saved.timeKnotCount < 2
      || saved.contextFingerprint !== fingerprintStudyValue(context)) return null;
    const compressed = decodeDesignSynthesisFaultScenarioBytes(saved.payloadBinaryString, saved.lzByteLength);
    if (!compressed) return null;
    const bytes = decompressFaultBytes(compressed, saved.uncompressedByteLength);
    if (!bytes) return null;
    const payload = parseLossless(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const result = payload?.faultEvolutionValidation;
    if (payload?.encoding !== PAYLOAD_ENCODING || fingerprintStudyValue(payload) !== saved.payloadFingerprint
      || fingerprintStudyValue(payload.context) !== saved.contextFingerprint
      || fingerprintStudyValue(payload.context) !== fingerprintStudyValue(context)
      || result?.status !== 'evaluated' || result.protectionAdequacy !== 'unevaluated'
      || result.modelInputFingerprint !== saved.modelInputFingerprint
      || result.faultCases?.length !== saved.faultCaseCount || result.deviceHistories?.length !== saved.deviceHistoryCount
      || result.timeKnotsS?.length !== saved.timeKnotCount
      || !object(payload.faultStudy) || !object(payload.faultEvolution)) return null;
    const resolved = { faultStudy: clone(payload.faultStudy), faultEvolution: clone(payload.faultEvolution), faultEvolutionValidation: clone(result) };
    if (payload.cableFaultWithstand !== undefined || payload.cableFaultWithstandValidation !== undefined || payload.cableFaultWithstandBindings !== undefined || payload.cableFaultWithstandRevision !== undefined) {
      const selectedCables = rebindDesignSynthesisCableFaultWithstandBindings(payload.cableFaultWithstandBindings, canonicalCables);
      if (!object(cableCatalogSource) || !selectedCables) return null;
      const continuous = payload.cableFaultWithstand?.faultSelection?.mode === CONTINUOUS_CABLE_FAULT_SELECTION;
      const spanContext = continuous ? restoreDesignSynthesisCableSpanProposalContext(payload.cableSpanProposalContext) : null;
      if (continuous && !spanContext) return null;
      const screen = evaluateDesignSynthesisCableFaultWithstand({ request: payload.cableFaultWithstand,
        proposal: { ...(continuous ? spanContext : {}), cables: selectedCables, cableCatalogSource,
          faultStudy: payload.faultStudy, faultEvolution: continuous ? payload.faultEvolution : { horizonS: result.timeKnotsS.at(-1) } }, faultStudyValidation, faultEvolutionValidation: result });
      if (screen.status !== 'evaluated' || screen.comparison !== 'pass' || !sameCableFaultWithstandResult(screen, payload.cableFaultWithstandValidation)) return null;
      const revisionProposal = { cables: selectedCables, cableCatalogSource, faultStudyValidation, faultEvolutionValidation: result,
        cableFaultWithstand: payload.cableFaultWithstand, cableFaultWithstandValidation: screen };
      if (payload.cableFaultWithstandRevision !== undefined) {
        const finalBinding = payload.cableFaultWithstandRevision?.finalBinding;
        const budgetBasis = finalBinding?.revisionBudgetBasis;
        if (finalBinding?.designCriteria !== null && !object(finalBinding?.designCriteria)) return null;
        if (!object(budgetBasis) || !Number.isSafeInteger(budgetBasis.effectiveMaximum) || budgetBasis.effectiveMaximum < 0 || budgetBasis.effectiveMaximum > 64
          || (budgetBasis.configuredMaximum !== null && (!Number.isSafeInteger(budgetBasis.configuredMaximum) || budgetBasis.configuredMaximum !== budgetBasis.effectiveMaximum))) return null;
        revisionProposal.feederLoadBindings = finalBinding.feederLoadBindings;
        revisionProposal.inputs = { original: finalBinding.designCriteria === null ? {} : { criteria: clone(finalBinding.designCriteria) } };
        if (!validateDesignSynthesisCableFaultWithstandRevision(payload.cableFaultWithstandRevision, revisionProposal)) return null;
      }
      resolved.cableFaultWithstand = clone(payload.cableFaultWithstand);
      resolved.cableFaultWithstandValidation = clone(screen);
      if (payload.cableFaultWithstandRevision !== undefined) resolved.cableFaultWithstandRevision = clone(payload.cableFaultWithstandRevision);
    }
    return resolved;
  } catch { return null; }
}

export default {
  FAULT_EVOLUTION_VALIDATION_KEY,
  buildDesignSynthesisFaultEvolutionContext,
  getDesignSynthesisFaultEvolutionContext,
  packDesignSynthesisFaultEvolutionValidation,
  resolveDesignSynthesisFaultEvolutionValidation,
};
