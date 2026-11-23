import { canonicalProjectJSON, fingerprintProjectRecordHex, matchesProjectRecordFingerprint } from '../utils/projectRecordFingerprint.mjs';
import { validateExistingTray } from './designSynthesisExistingTray.mjs';

const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLowerCase();
const obj = value => value && typeof value === 'object' && !Array.isArray(value);
const meaningful = value => value !== undefined && value !== null && clean(value) !== '';
const objectReuseEvidence = value => obj(value) && (typeof value.thermalReference === 'string' && value.thermalReference.trim() || typeof value.installationReference === 'string' && value.installationReference.trim() || value.coverageConfirmed === true);
const issue = (code, message) => ({ code, message });
const fingerprint = fingerprintProjectRecordHex;
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
}
function numericAlias(record, fields, fallback = null) {
  const values = fields.filter(field => meaningful(record?.[field])).map(field => number(record[field]));
  if (!values.length) return fallback;
  return values.some(value => value === null || value !== values[0]) ? null : values[0];
}
function textAlias(record, fields) {
  const values = fields.filter(field => meaningful(record?.[field])).map(field => clean(record[field]));
  return values.length && values.every(value => key(value) === key(values[0])) ? values[0] : '';
}
function tokens(value) {
  if (!meaningful(value)) return [];
  let values = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('[')) { try { values = JSON.parse(text); } catch { return null; } }
    else values = text.split(/[,;|>\n]+/);
  }
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string' && typeof item !== 'number')) return null;
  return [...new Set(values.map(key).filter(Boolean))].sort();
}
function assignments(cable) {
  const values = ['raceway_ids', 'racewayIds', 'raceway_id', 'racewayId', 'raceway', 'tray_id', 'trayId'].filter(field => meaningful(cable?.[field])).map(field => tokens(cable[field]));
  if (values.some(value => value === null)) return null;
  if (values.length > 1 && JSON.stringify(values[0]) !== JSON.stringify(values[1])) return null;
  return values[0] || [];
}
function cableAliases(cable) { return [...new Set([cable?.id, cable?.tag, cable?.name, cable?.cable_id, cable?.cableId].map(key).filter(Boolean))]; }
function trayAliases(tray) { return [...new Set([tray?.tray_id, tray?.id, tray?.ref, tray?.tag].map(key).filter(Boolean))]; }
function routeRows(results) { return Array.isArray(results) ? results : Array.isArray(results?.batchResults) ? results.batchResults : []; }
function ownerInventory({ trays, cables, routeResults, lastApplied, replaceGenerated }) {
  const issues = [];
  const ownerAliases = new Set(cables.filter(row => !row?._designSynthesis).flatMap(cableAliases));
  for (const cable of cables.filter(row => row?._designSynthesis)) {
    if (cableAliases(cable).some(alias => ownerAliases.has(alias))) issues.push(issue('PROJECT_TRAY_GENERATED_ID_COLLISION', 'A generated cable shares an identity with an owner cable; resolve which physical cable is present before reviewing occupancy.'));
  }
  const ownerTrayAliases = new Set(trays.filter(row => !row?._designSynthesis).flatMap(trayAliases));
  for (const tray of trays.filter(row => row?._designSynthesis)) {
    if (trayAliases(tray).some(alias => ownerTrayAliases.has(alias))) issues.push(issue('PROJECT_TRAY_GENERATED_ID_COLLISION', 'A generated tray shares an identity with an owner tray; resolve which physical tray is present before review.'));
  }
  const filterOwned = (rows, collection) => {
    const seen = new Set();
    return rows.filter(row => {
      if (!row?._designSynthesis) return true;
      const marker = row._designSynthesis;
      const identity = clean(marker.identity);
      const recordId = clean(collection === 'cables' || collection === 'trays' ? (row.id || row.ref || row.tag || row.tray_id) : (row.id || row.cable || row.ref));
      if (replaceGenerated !== true) return true;
      const snapshot = lastApplied?.records?.[collection]?.[identity];
      const unmarked = { ...row }; delete unmarked._designSynthesis;
      const duplicate = seen.has(key(identity)); seen.add(key(identity));
      if (!identity || !recordId || key(identity) !== key(recordId) || duplicate || marker.collection !== collection || marker.source !== 'design-synthesis'
        || !obj(snapshot) || !matchesProjectRecordFingerprint(unmarked, snapshot.exactFingerprint)) {
        issues.push(issue('PROJECT_TRAY_GENERATED_OWNERSHIP_UNPROVEN', `Generated ${collection} record ${identity || '(missing identity)'} lacks an unchanged SHA-256 Apply baseline. Resolve the record or reapply the previous design before reviewing tray occupancy.`));
        return true;
      }
      return false;
    });
  };
  const ownerCables = filterOwned(cables, 'cables');
  const ownerTrays = filterOwned(trays, 'trays');
  const ownerRoutes = filterOwned(routeRows(routeResults), 'routeResults');
  let normalizedRoutes;
  if (Array.isArray(routeResults)) normalizedRoutes = ownerRoutes.length ? ownerRoutes : null;
  else if (obj(routeResults)) {
    normalizedRoutes = { ...routeResults };
    if (ownerRoutes.length) normalizedRoutes.batchResults = ownerRoutes;
    else delete normalizedRoutes.batchResults;
    if (!Object.keys(normalizedRoutes).length) normalizedRoutes = null;
  } else normalizedRoutes = routeResults;
  return { trays: ownerTrays, cables: ownerCables, routeResults: normalizedRoutes, issues };
}
function mappedCable(cable, reference) {
  const use = key(textAlias(cable, ['cable_type', 'cableType', 'use']));
  return {
    id: clean(cable.tag || cable.name || cable.cable_id || cable.id), use,
    conductorSize: textAlias(cable, ['conductor_size', 'conductorSize']),
    conductorCount: numericAlias(cable, ['conductor_count', 'conductorCount', 'conductors', 'conductors_per_cable']),
    voltageRatingV: numericAlias(cable, ['cable_rating', 'voltage_rating', 'rated_voltage']),
    outsideDiameterIn: numericAlias(cable, ['cable_od', 'cableOD', 'outside_diameter', 'outsideDiameter', 'outsideDiameterIn', 'outerDiameterIn', 'diameter', 'od', 'OD']),
    quantity: numericAlias(cable, ['parallel_count', 'parallelCount', 'quantity', 'qty'], 1),
    reference,
  };
}

/** Build a reviewable draft without mutating any project collection. */
export function buildProjectTrayHandoff({ trays = [], cables = [], routeResults = null, lastApplied = {}, selectedTrayIds = [], projectId, scenario, inventoryReference, acknowledgements = {}, reuseEvidence = {} } = {}) {
  const issues = [], nodes = [], edges = [];
  if (!Array.isArray(trays) || !Array.isArray(cables) || !Array.isArray(selectedTrayIds)) return { ok: false, issues: [issue('PROJECT_TRAY_INPUT_INVALID', 'Project trays, cables, and selected identities must be arrays.')] };
  if (routeResults != null && !Array.isArray(routeResults) && (!obj(routeResults) || (routeResults.batchResults !== undefined && !Array.isArray(routeResults.batchResults)))) issues.push(issue('PROJECT_TRAY_ROUTE_DATA_INVALID', 'Saved route results are malformed; resolve them before tray review.'));
  if (routeRows(routeResults).some(route => !obj(route) || (route.route_segments !== undefined && !Array.isArray(route.route_segments)))) issues.push(issue('PROJECT_TRAY_ROUTE_DATA_INVALID', 'A saved route or its segment list is malformed.'));
  const inventory = ownerInventory({ trays, cables, routeResults, lastApplied, replaceGenerated: acknowledgements.replaceGenerated });
  trays = inventory.trays; cables = inventory.cables; routeResults = inventory.routeResults;
  issues.push(...inventory.issues);
  if (!clean(projectId) || !clean(scenario)) issues.push(issue('PROJECT_TRAY_CONTEXT_REQUIRED', 'Open a named project and active scenario before reviewing trays.'));
  if (acknowledgements.units !== true || acknowledgements.inventory !== true || acknowledgements.permission !== true) issues.push(issue('PROJECT_TRAY_ACKNOWLEDGEMENT_REQUIRED', 'Confirm feet/inches, complete assigned-cable inventory, and permission to consider each selected corridor.'));
  if (!clean(inventoryReference)) issues.push(issue('PROJECT_TRAY_REFERENCE_REQUIRED', 'Provide the source for the inventory and cable dimensions and ratings.'));
  const chosen = [...new Set(selectedTrayIds.map(key).filter(Boolean))].sort();
  if (!chosen.length) issues.push(issue('PROJECT_TRAY_SELECTION_REQUIRED', 'Select at least one project tray.'));
  const aliases = new Map();
  cables.forEach((cable, index) => cableAliases(cable).forEach(alias => { const list = aliases.get(alias) || []; if (!list.includes(index)) list.push(index); aliases.set(alias, list); }));
  const assignmentsByCable = cables.map(assignments);
  if (assignmentsByCable.some(value => value === null)) issues.push(issue('PROJECT_TRAY_ASSIGNMENT_INVALID', 'A cable has malformed or conflicting raceway assignment fields. Resolve them before review.'));
  const coordinateNodes = new Map();
  const nodeFor = point => {
    const identity = JSON.stringify(point);
    if (!coordinateNodes.has(identity)) { const id = `PROJECT-NODE-${String(coordinateNodes.size + 1).padStart(3, '0')}`; coordinateNodes.set(identity, id); nodes.push({ id, x: point[0], y: point[1], z: point[2] }); }
    return coordinateNodes.get(identity);
  };
  for (const selected of chosen) {
    const matches = trays.filter(tray => key(tray?.tray_id) === selected);
    if (matches.length !== 1) { issues.push(issue('PROJECT_TRAY_ID_AMBIGUOUS', `Tray ${selected} is missing or has a duplicate ID.`)); continue; }
    const tray = matches[0];
    if (tray._designSynthesis) { issues.push(issue('PROJECT_TRAY_OWNER_RECORD_REQUIRED', `Tray ${clean(tray.tray_id)} is a generated proposal record, not an owner tray record; establish the existing tray inventory separately.`)); continue; }
    const selectedAliases = trayAliases(tray);
    if (trays.some(other => other !== tray && trayAliases(other).some(alias => selectedAliases.includes(alias)))) { issues.push(issue('PROJECT_TRAY_ID_AMBIGUOUS', `Tray ${clean(tray.tray_id)} shares an identity alias with another tray.`)); continue; }
    const start = ['start_x', 'start_y', 'start_z'].map(field => number(tray[field]));
    const end = ['end_x', 'end_y', 'end_z'].map(field => number(tray[field]));
    const inconsistentPoint = (field, expected) => tray[field] !== undefined && (!Array.isArray(tray[field]) || tray[field].length !== 3 || tray[field].some((value, index) => number(value) === null || number(value) !== expected[index]));
    if ([...start, ...end].some(value => value === null) || start.every((value, index) => value === end[index]) || inconsistentPoint('start', start) || inconsistentPoint('end', end)) { issues.push(issue('PROJECT_TRAY_GEOMETRY_INVALID', `Tray ${clean(tray.tray_id)} requires distinct, consistent finite start and end coordinates.`)); continue; }
    const constructions = ['tray_type', 'trayType', 'construction'].filter(field => meaningful(tray[field])).map(field => clean(tray[field]));
    if (!constructions.length || constructions.some(value => !/^ladder(?:\b|\s|\()/i.test(value))) { issues.push(issue('PROJECT_TRAY_CONSTRUCTION_UNSUPPORTED', `Tray ${clean(tray.tray_id)} must explicitly be ladder construction.`)); continue; }
    const group = key(tray.allowed_cable_group);
    if (group && !['power', 'lighting'].includes(group)) { issues.push(issue('PROJECT_TRAY_GROUP_UNSUPPORTED', `Tray ${clean(tray.tray_id)} has a non-power cable group.`)); continue; }
    const assignedIndexes = new Set();
    assignmentsByCable.forEach((ids, index) => { if (ids?.some(id => selectedAliases.includes(id))) assignedIndexes.add(index); });
    for (const route of routeRows(routeResults)) {
      if (!Array.isArray(route?.route_segments)) continue;
      const matching = route.route_segments.filter(segment => selectedAliases.includes(key(segment?.tray_id || segment?.raceway_id || segment?.edgeId)));
      if (!matching.length) continue;
      if (matching.some(segment => key(segment?.type || segment?.kind) !== 'tray')) { issues.push(issue('PROJECT_TRAY_ROUTE_ASSIGNMENT_CONFLICT', `A saved segment referencing tray ${clean(tray.tray_id)} has an ambiguous type.`)); continue; }
      const candidates = aliases.get(key(route.cable || route.cableId || route.id)) || [];
      if (candidates.length !== 1 || !assignedIndexes.has(candidates[0])) issues.push(issue('PROJECT_TRAY_ROUTE_ASSIGNMENT_CONFLICT', `A saved route through tray ${clean(tray.tray_id)} lacks a matching unique canonical cable assignment.`));
    }
    const mapped = [...assignedIndexes].map(index => mappedCable(cables[index], clean(inventoryReference)));
    for (const index of assignedIndexes) if (cableAliases(cables[index]).some(alias => aliases.get(alias).length > 1)) issues.push(issue('PROJECT_TRAY_CABLE_ID_AMBIGUOUS', `A cable assigned to tray ${clean(tray.tray_id)} has an ambiguous identity.`));
    const edge = { id: clean(tray.tray_id), from: nodeFor(start), to: nodeFor(end), widthIn: numericAlias(tray, ['inside_width', 'widthIn']), depthIn: numericAlias(tray, ['tray_depth', 'depthIn']), permitted: false, existingTray: { trayId: clean(tray.tray_id), construction: 'ladder', inventoryReference: clean(inventoryReference), cables: mapped } };
    issues.push(...validateExistingTray(edge, `tray.${edge.id}`).issues);
    edges.push(edge);
  }
  const corridors = { nodes, edges };
  const sourceFingerprint = fingerprint({ trays, cables, routeResults });
  const corridorsFingerprint = fingerprint(corridors);
  const adoption = { schemaVersion: 'project-trays-v2', projectId: clean(projectId), scenario: clean(scenario), selectedTrayIds: chosen, inventoryReference: clean(inventoryReference), acknowledgements: { units: acknowledgements.units === true, inventory: acknowledgements.inventory === true, permission: acknowledgements.permission === true, replaceGenerated: acknowledgements.replaceGenerated === true }, ...(objectReuseEvidence(reuseEvidence) ? { reuseEvidence: { thermalReference: typeof reuseEvidence.thermalReference === 'string' ? reuseEvidence.thermalReference.trim() : '', installationReference: typeof reuseEvidence.installationReference === 'string' ? reuseEvidence.installationReference.trim() : '', coverageConfirmed: reuseEvidence.coverageConfirmed === true } } : {}), sourceFingerprint, corridorsFingerprint };
  adoption.bindingFingerprint = fingerprint(adoption);
  return { ok: issues.length === 0, issues, corridors, adoption };
}

/** Recheck source data and copied geometry; permission may be explicitly changed. */
export function validateProjectTrayHandoff({ adoption, corridors, ...source } = {}) {
  if (!obj(adoption) || adoption.schemaVersion !== 'project-trays-v2' || !Array.isArray(adoption.selectedTrayIds)) return { ok: false, issues: [issue('PROJECT_TRAY_BINDING_INVALID', 'Reviewed project tray binding is missing or outdated; review the project trays again.')] };
  const unsigned = { ...adoption }; delete unsigned.bindingFingerprint;
  if (fingerprint(unsigned) !== adoption.bindingFingerprint) return { ok: false, issues: [issue('PROJECT_TRAY_BINDING_INVALID', 'Reviewed project tray binding was changed.')] };
  const rebuilt = buildProjectTrayHandoff({ ...source, selectedTrayIds: adoption.selectedTrayIds, inventoryReference: adoption.inventoryReference, acknowledgements: adoption.acknowledgements, reuseEvidence: adoption.reuseEvidence });
  if (!rebuilt.ok) return rebuilt;
  const issues = [];
  if (rebuilt.adoption.projectId !== adoption.projectId || rebuilt.adoption.scenario !== adoption.scenario || rebuilt.adoption.sourceFingerprint !== adoption.sourceFingerprint || rebuilt.adoption.corridorsFingerprint !== adoption.corridorsFingerprint) issues.push(issue('PROJECT_TRAY_SOURCE_CHANGED', 'Project trays, cable assignments, route results, or context changed; review project trays again.'));
  const currentNodes = Array.isArray(corridors?.nodes) ? corridors.nodes : [];
  const currentEdges = Array.isArray(corridors?.edges) ? corridors.edges : [];
  for (const expected of rebuilt.corridors.nodes) {
    const matches = currentNodes.filter(node => key(node?.id) === key(expected.id));
    if (matches.length !== 1 || canonicalProjectJSON(matches[0]) !== canonicalProjectJSON(expected)) issues.push(issue('PROJECT_TRAY_GEOMETRY_CHANGED', `Reviewed node ${expected.id} was changed or removed.`));
  }
  for (const expected of rebuilt.corridors.edges) {
    const matches = currentEdges.filter(edge => key(edge?.id) === key(expected.id));
    if (matches.length !== 1) { issues.push(issue('PROJECT_TRAY_GEOMETRY_CHANGED', `Reviewed tray edge ${expected.id} was changed or removed.`)); continue; }
    const actual = { ...matches[0] }; delete actual.permitted; delete actual.allowed; delete actual.thermal;
    const baseline = { ...expected }; delete baseline.permitted;
    if (canonicalProjectJSON(actual) !== canonicalProjectJSON(baseline)) issues.push(issue('PROJECT_TRAY_GEOMETRY_CHANGED', `Reviewed tray edge ${expected.id} geometry or inventory was changed.`));
  }
  return { ok: issues.length === 0, issues };
}
