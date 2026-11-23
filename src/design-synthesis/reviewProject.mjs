import * as dataStore from '../../dataStore.mjs';
import { getSavedProjectsError, listSavedProjects, writeSavedProject } from '../../projectStorage.js';
import { validateAndNormalizeCanonicalProject } from '../canonicalProject.mjs';
import { generateDesignProposal } from '../../analysis/designSynthesis.mjs';
import { reconcileDesignProposal } from '../../analysis/designProposalReconcile.mjs';
import { applyProjectEquipmentIdentityMap, bindDesignSynthesisProjectEquipmentProposal, validateDesignSynthesisProjectEquipmentAdoption } from '../../analysis/designSynthesisProjectEquipment.mjs';
import { fingerprintStudyValue } from '../../analysis/studyLifecycle.mjs';
import { exactStoredValueEqual } from './deviceEvidence.mjs';
import { packProjectDeviceEvidence } from '../../utils/designSynthesisDeviceEvidenceCodec.mjs';
import { buildDesignSynthesisOneLinePreview } from './oneLinePreview.mjs';
import { buildPreliminaryPanelSchedule } from './preliminaryPanelSchedule.mjs';
import { buildPreliminaryRacewaySchedule } from './preliminaryRacewaySchedule.mjs';
import { compactInputEvidence, compactProposal, currentContext } from './applyProposal.mjs';

const fail = message => ({ ok: false, message });
const key = value => value == null ? '' : String(value).trim();
const marker = (record, collection) => ({ ...record, _designSynthesis: { identity: key(record.id || record.ref || record.tag), collection, source: 'design-synthesis' } });

/** The separate review project is not an authorization to apply or issue. */
export function reviewProjectEligibility(proposal) {
  if (proposal?.status !== 'blocked' || !Array.isArray(proposal.issues) || !Array.isArray(proposal.loads) || !proposal.loads.some(load => load?.motor)) return fail('A generated motor proposal is required.');
  const blockers = proposal.issues.filter(issue => issue?.severity === 'blocking');
  if (!blockers.length || blockers.some(issue => issue.code !== 'MOTOR_PROTECTION_UNRESOLVED')) return fail('Resolve the other blocking proposal issues before creating a review project.');
  const original = proposal.inputs?.original;
  if (!original || !key(proposal.inputSignature)) return fail('The proposal must retain its original input and signature.');
  if (original.projectTrayAdoption || (Array.isArray(original.corridors?.edges) && original.corridors.edges.some(edge => Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray')))) {
    return fail('Review projects cannot yet copy existing-tray inventory safely. Use the preliminary downloads for this proposal.');
  }
  if (!buildPreliminaryPanelSchedule(proposal).ok || !buildPreliminaryRacewaySchedule(proposal).ok || !buildDesignSynthesisOneLinePreview(proposal).ok) return fail('The generated panel, raceway, routes and one-line must be complete and consistent.');
  return { ok: true, message: null };
}

function starterSummary(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    status: 'screening-only', selectedForApply: false, manufacturer: candidate.manufacturer || '',
    contactor: candidate.contactor?.catalogNumber || '', overloadRelay: candidate.overloadRelay?.catalogNumber || '',
    shortCircuitDevice: candidate.shortCircuitController?.catalogNumber || candidate.branchCircuitBreaker?.catalogNumber || '',
  };
}

/** Build a self-contained canonical review snapshot without mutating the active project. */
export function buildReviewProject(proposal, { expectedContext, sourceProject = null } = {}) {
  const eligibility = reviewProjectEligibility(proposal);
  if (!eligibility.ok) return eligibility;
  const context = currentContext();
  if (!expectedContext || !['scenario', 'projectId', 'projectFingerprint'].every(field => Object.prototype.hasOwnProperty.call(expectedContext, field) && expectedContext[field] === context[field])) return fail('The source project or scenario changed. Generate the proposal again.');
  const original = proposal.inputs.original;
  const adoption = proposal.projectEquipmentAdoption || original.projectEquipmentAdoption || null;
  const lastApplied = dataStore.getItem('designSynthesisLastApplied', {}, context.scenario) || {};
  const sourceEquipment = dataStore.getEquipment();
  const sourceLoads = dataStore.getLoads();
  if (adoption) {
    const checked = validateDesignSynthesisProjectEquipmentAdoption({ adoption, rows: original.equipment, equipment: sourceEquipment, loads: sourceLoads, ...context, lastApplied });
    if (!checked.ok) return fail(`The reviewed source equipment changed: ${checked.issues.map(issue => issue.message).join(' ')}`);
  }
  let fresh;
  try {
    fresh = generateDesignProposal(original);
    if (adoption) fresh = bindDesignSynthesisProjectEquipmentProposal(fresh, adoption);
  } catch (error) { return fail(`The proposal could not be reproduced: ${error instanceof Error ? error.message : String(error)}`); }
  if (!exactStoredValueEqual(fresh, proposal) || !exactStoredValueEqual(context, currentContext())) return fail('The proposal or source project changed. Generate the proposal again.');
  const selectedEquipment = new Set((adoption?.pairs || []).map(pair => key(pair.equipmentId)));
  const selectedLoads = new Set((adoption?.pairs || []).map(pair => key(pair.loadId)));
  const mapped = adoption ? applyProjectEquipmentIdentityMap(proposal, adoption) : proposal;
  const compact = compactProposal(mapped);
  const reconciliation = reconcileDesignProposal({
    current: { equipment: sourceEquipment.filter(row => selectedEquipment.has(key(row.id))), loads: sourceLoads.filter(row => selectedLoads.has(key(row.id))) },
    proposal: compact, projectEquipmentAdoption: adoption, lastApplied,
  });
  if (!reconciliation.ok) return fail(`The review copy cannot preserve the source equipment: ${[...reconciliation.errors, ...reconciliation.conflicts].map(issue => issue.message || issue.code).join('; ')}`);
  const starterByCable = new Map((proposal.cables || []).map(cable => [key(cable.id), starterSummary((proposal.motorStarterCandidates?.cases || []).find(item => key(item.motorId) === key(cable.loadId))?.candidate)]));
  const evidence = {};
  const cables = reconciliation.next.cables.map(cable => {
    const summary = starterByCable.get(key(cable.id));
    if (!cable.motor || !summary) return cable;
    const reference = fingerprintStudyValue(summary);
    evidence[reference] = structuredClone(summary);
    return { ...cable, motor: { ...cable.motor, starterCandidateSummary: summary, starterCandidateEvidenceRef: reference } };
  });
  for (const cable of proposal.cables || []) if (cable?.protectiveDevice && typeof cable.protectiveDevice === 'object') evidence[fingerprintStudyValue(cable.protectiveDevice)] = structuredClone(cable.protectiveDevice);
  for (const transformer of [proposal.transformer, ...(proposal.equipment || []).filter(item => item?.type === 'transformer')].filter(Boolean)) {
    for (const field of ['primaryProtectiveDevice', 'secondaryMainDevice']) if (transformer[field] && typeof transformer[field] === 'object') evidence[fingerprintStudyValue(transformer[field])] = structuredClone(transformer[field]);
  }
  const oneLine = structuredClone(compact.oneLine);
  const originalCables = new Map((proposal.cables || []).map(cable => [key(cable.id), cable]));
  const originalComponents = new Map((proposal.oneLine?.sheets || []).flatMap(sheet => sheet.components || []).map(component => [key(component.id), component]));
  const compactConnection = item => {
    const originalCable = originalCables.get(key(item.cableId || item.cable?.id || item.id));
    if (item.cable && originalCable) {
      for (const field of ['motor', 'protectiveDevice', 'protectiveDeviceCandidates']) {
        if (item.cable[field] !== undefined && exactStoredValueEqual(item.cable[field], originalCable[field])) delete item.cable[field];
      }
    }
    return item;
  };
  for (const sheet of oneLine.sheets) {
    sheet.components = (sheet.components || []).map(item => {
      const motor = originalComponents.get(key(item.id))?.physical?.motor;
      return marker({ ...item, ...(motor ? { physical: { ...item.physical, motor: structuredClone(motor) } } : {}), connections: (item.connections || []).map(compactConnection) }, 'oneLine.components');
    });
    sheet.connections = (sheet.connections || []).map(item => marker(compactConnection(item), 'oneLine.connections'));
  }
  const routeResults = { ...compact.routeResults, batchResults: compact.routeResults.batchResults.map(item => marker({ ...item, id: item.id || item.cable }, 'routeResults')) };
  const review = {
    version: 1, status: 'preliminary-review-only', sourceProject: key(sourceProject || context.projectId), inputSignature: proposal.inputSignature,
    unresolvedIssues: proposal.issues.filter(issue => issue.severity === 'blocking').map(issue => ({ code: issue.code, message: issue.message })),
    limitations: ['Motor protection, fault duty, installation and assembly ratings remain unresolved.', 'Full study results and trial histories are not copied; use the original proposal JSON and report for that evidence.', 'Some standalone exports do not carry the preliminary notice.'],
  };
  const snapshot = {
    schemaVersion: 1, meta: { version: 1, scenario: 'base', scenarios: ['base'] },
    equipment: reconciliation.next.equipment, loads: reconciliation.next.loads, panels: reconciliation.next.panels, cables,
    trays: reconciliation.next.trays, conduits: reconciliation.next.conduits, ductbanks: [], cableTypicals: [], mccLineups: [], oneLine,
    settings: { designSynthesisReviewDraft: review, designSynthesisInputSignature: proposal.inputSignature,
      designSynthesisDeviceEvidence: evidence, designSynthesisInputEvidence: compactInputEvidence(proposal.inputEvidence),
      latestRouteResults: routeResults, ...(dataStore.getDesignBasis() ? { designBasis: dataStore.getDesignBasis() } : {}) },
  };
  try { return { ok: true, project: validateAndNormalizeCanonicalProject(snapshot), context, message: null }; }
  catch (error) { return fail(`The review copy failed project validation: ${error instanceof Error ? error.message : String(error)}`); }
}

/** Save a unique new local review project, leaving the active project untouched. */
export function createReviewProject(proposal, options = {}) {
  const result = buildReviewProject(proposal, options);
  if (!result.ok) return result;
  try {
    const error = getSavedProjectsError();
    if (error) return fail('Saved project storage is unavailable. The current project was not changed.');
    const existing = new Set(listSavedProjects().map(name => name.toLocaleLowerCase()));
    const label = key(result.context.projectId).replaceAll(':', '-') || 'Design';
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const stem = `PRELIMINARY REVIEW - ${label} - ${token}`;
    let name = stem;
    for (let index = 2; existing.has(name.toLocaleLowerCase()); index += 1) name = `${stem} (${index})`;
    if (!exactStoredValueEqual(result.context, currentContext())) return fail('The source project changed before the review copy was saved.');
    writeSavedProject(name, packProjectDeviceEvidence(result.project), { replace: true });
    return { ok: true, name, message: null };
  } catch (error) { return fail(`The review copy could not be saved. The current project was not changed. ${error instanceof Error ? error.message : String(error)}`); }
}
