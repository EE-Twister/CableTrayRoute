import { validateProjectTrayHandoff } from './designSynthesisProjectTrays.mjs';
import { evaluateDesignSynthesisRaceways } from './designSynthesisRaceways.mjs';
import { canonicalProjectJSON } from '../utils/projectRecordFingerprint.mjs';

const key = value => String(value ?? '').trim().toLowerCase();
const same = (left, right) => {
  if (left === undefined || right === undefined) return left === right;
  try { return canonicalProjectJSON(left) === canonicalProjectJSON(right); } catch { return false; }
};

/** Build a read-only owner-tray merge plan. This does not authorize Apply. */
export function planProjectTrayReconciliation({ proposal, projectId, scenario, trays, cables, routeResults, lastApplied } = {}) {
  const input = proposal?.inputs?.original;
  const adoption = input?.projectTrayAdoption;
  let validation;
  try { validation = validateProjectTrayHandoff({ adoption, corridors: input?.corridors, projectId, scenario, trays, cables, routeResults, lastApplied }); }
  catch { return { ok: false, issues: [{ code: 'PROJECT_TRAY_BINDING_INVALID', message: 'Project tray review cannot be reconstructed from the supplied records.' }], ownerTrayIds: [] }; }
  if (!validation.ok) return { ok: false, issues: validation.issues, ownerTrayIds: [] };
  const issues = [];
  const selected = new Set(adoption.selectedTrayIds.map(key));
  const edges = Array.isArray(input?.corridors?.edges) ? input.corridors.edges : [];
  for (const edge of edges.filter(row => Object.prototype.hasOwnProperty.call(row || {}, 'existingTray'))) {
    if (!selected.has(key(edge.id)) || key(edge.id) !== key(edge.existingTray?.trayId)) issues.push({ code: 'PROJECT_TRAY_UNREVIEWED_EDGE', message: `Existing tray edge ${edge.id || '(missing)'} was not included in the project tray review.` });
  }
  if (!Array.isArray(proposal?.cables) || !Array.isArray(proposal?.trays) || !Array.isArray(proposal?.conduits)
    || !Array.isArray(proposal?.racewayEvaluations) || !Array.isArray(proposal?.installationCoverage)
    || !Array.isArray(proposal?.routeResults?.batchResults)) return { ok: false, issues: [...issues, { code: 'PROJECT_TRAY_PROPOSAL_INVALID', message: 'Proposal is missing its complete cable, route, and raceway screening results.' }], ownerTrayIds: [] };
  const cableIds = proposal.cables.map(row => key(row?.id || row?.tag || row?.name));
  const routeIds = proposal.routeResults.batchResults.map(row => key(row?.cable || row?.cableId || row?.id));
  if (cableIds.some(id => !id) || new Set(cableIds).size !== cableIds.length || routeIds.some(id => !id)
    || new Set(routeIds).size !== routeIds.length || cableIds.length !== routeIds.length || cableIds.some(id => !routeIds.includes(id))) {
    issues.push({ code: 'PROJECT_TRAY_ROUTE_IDENTITY_INVALID', message: 'Every generated cable must have one uniquely identified route before tray reconciliation.' });
  }
  const edgeById = new Map(edges.map(edge => [key(edge?.id), edge]));
  const nodeById = new Map((Array.isArray(input?.corridors?.nodes) ? input.corridors.nodes : []).map(node => [key(node?.id), node]));
  const point = node => [Number(node?.x), Number(node?.y), Number(node?.z)];
  const matchesPoint = (actual, expected) => Array.isArray(actual) && actual.length === 3 && expected.every(Number.isFinite)
    && actual.every((value, index) => typeof value === 'number' && Number.isFinite(value) && value === expected[index]);
  for (const route of proposal.routeResults.batchResults) {
    const cable = proposal.cables.find(row => key(row?.id || row?.tag || row?.name) === key(route?.cable || route?.cableId || route?.id));
    const segments = Array.isArray(route?.route_segments) ? route.route_segments : [];
    const traySegments = segments.filter(segment => key(segment?.type || segment?.kind) === 'tray');
    const path = traySegments.map(segment => key(segment.tray_id || segment.raceway_id || segment.edgeId));
    if (!cable || route.status !== 'routed' || !Array.isArray(route.route_segments)
      || !Array.isArray(route.routingDecision?.selectedPath) || !Array.isArray(cable.routingDecision?.selectedPath)
      || !same(path, route.routingDecision.selectedPath.map(key)) || !same(path, cable.routingDecision.selectedPath.map(key))) {
      issues.push({ code: 'PROJECT_TRAY_ROUTE_PATH_INCONSISTENT', message: `Cable ${route?.cable || '(missing)'} route segments do not match its generated path.` });
    }
    for (const segment of traySegments) {
      const aliases = [segment.tray_id, segment.raceway_id, segment.edgeId].filter(value => value !== undefined && value !== null && String(value).trim());
      const edge = edgeById.get(key(aliases[0]));
      const start = point(nodeById.get(key(edge?.from))), end = point(nodeById.get(key(edge?.to)));
      const geometryMatches = (matchesPoint(segment.start, start) && matchesPoint(segment.end, end)) || (matchesPoint(segment.start, end) && matchesPoint(segment.end, start));
      const length = Math.hypot(...start.map((value, index) => value - end[index]));
      if (!edge || !aliases.length || aliases.some(value => key(value) !== key(aliases[0])) || !geometryMatches
        || typeof segment.length !== 'number' || !Number.isFinite(segment.length) || Math.abs(segment.length - length) > 1e-8 * Math.max(1, length)) {
        issues.push({ code: 'PROJECT_TRAY_ROUTE_GEOMETRY_INCONSISTENT', message: `Cable ${route?.cable || '(missing)'} has a tray segment that does not match the reviewed corridor geometry.` });
      }
    }
  }
  let fresh;
  try { fresh = evaluateDesignSynthesisRaceways({ corridors: input.corridors, cables: proposal.cables, routeResults: proposal.routeResults, criteria: input.criteria }); }
  catch { fresh = null; }
  if (!fresh || fresh.status !== 'proposal' || !fresh.installationComplete || !same(fresh.trays, proposal.trays)
    || !same(fresh.conduits, proposal.conduits) || !same(fresh.evaluations, proposal.racewayEvaluations)
    || !same(fresh.installationCoverage, proposal.installationCoverage)
    || fresh.cables.some((row, index) => !same(row.raceway_ids, proposal.cables[index].raceway_ids) || !same(row.installationCoverage, proposal.cables[index].installationCoverage))) {
    issues.push({ code: 'PROJECT_TRAY_RACEWAY_EVIDENCE_INCONSISTENT', message: 'Generated routes, tray fill, endpoint installation, or cable assignments do not match fresh screening.' });
  }
  const ownerTrayIds = [];
  const newTrays = [];
  for (const row of proposal.trays) {
    if (!row?.existingTrayScreen) { newTrays.push(row); continue; }
    const identity = key(row.existingTrayScreen.trayId);
    const matchingOwners = trays.filter(tray => key(tray?.tray_id) === identity);
    if (!selected.has(identity) || key(row.id) !== identity || key(row.tray_id) !== identity || key(row.edgeId) !== identity
      || matchingOwners.length !== 1 || matchingOwners[0]._designSynthesis || ownerTrayIds.includes(identity)) {
      issues.push({ code: 'PROJECT_TRAY_OWNER_IDENTITY_INVALID', message: `Screened tray ${row.id || '(missing)'} does not identify exactly one reviewed owner tray.` });
      continue;
    }
    ownerTrayIds.push(identity);
  }
  return { ok: issues.length === 0, issues, ownerTrayIds, newTrays };
}
