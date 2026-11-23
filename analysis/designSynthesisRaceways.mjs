import { evaluateTrayFill } from './trayFill.mjs';
import { evaluateEndpointInstallation } from './designSynthesisEndpointInstallation.mjs';
import { SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOUTHWIRE_SPEC45301_SOURCE, SOURCED_MC_R_X } from './designSynthesisCableCatalog.mjs';
import { validateExistingTray } from './designSynthesisExistingTray.mjs';

export const SOUTHWIRE_SPEC45301 = Object.freeze({
  source: SOUTHWIRE_SPEC45301_SOURCE.revision,
  url: SOUTHWIRE_SPEC45301_SOURCE.productUrl,
  sourcePdfUrl: SOUTHWIRE_SPEC45301_SOURCE.sourceUrl,
  sourcePdfSha256: SOUTHWIRE_SPEC45301_SOURCE.sha256,
  accessedOn: SOUTHWIRE_SPEC45301_SOURCE.accessedOn,
  catalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT,
  outsideDiameterIn: Object.freeze(Object.fromEntries(Object.entries(SOURCED_MC_R_X).map(([size, row]) => [size, row.od]))),
  stock: Object.freeze(Object.fromEntries(Object.entries(SOURCED_MC_R_X).map(([size, row]) => [size, row.stockId]))),
  conductorCount: 3,
  cableRating: 600,
});
const WIDTHS = [2, 4, 6, 8, 12, 18, 24, 30, 36];
const text = value => String(value ?? '').trim();
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const cableId = cable => text(cable?.id || cable?.tag || cable?.name);
function enrichCable(cable, catalog) {
  const size = text(cable.conductor_size || cable.conductorSize || cable.size);
  const explicitOd = positive(cable.outerDiameterIn || cable.cable_od || cable.diameter);
  const od = explicitOd || positive(catalog.outsideDiameterIn?.[size]);
  const sourced = Boolean(size && catalog.outsideDiameterIn?.[size]);
  const count = positive(cable.conductor_count || cable.conductors || cable.conductors_per_cable) || (sourced ? positive(catalog.conductorCount) : null);
  const rating = positive(cable.cable_rating || cable.voltage_rating || cable.rated_voltage) || (sourced ? positive(catalog.cableRating) : null);
  const result = { ...cable, conductor_count: count || cable.conductor_count, conductor_size: size, conductor_material: cable.conductor_material || cable.conductorMaterial || 'cu', cable_rating: rating || cable.cable_rating };
  if (od) { result.outerDiameterIn = od; result.cable_od = od; }
  if (!explicitOd && size && catalog.outsideDiameterIn?.[size]) {
    result.cableConstructionSource = catalog.source;
    result.cableStockId = result.cableStockId || catalog.stock?.[size] || null;
    result.cableCatalogFingerprint = result.cableCatalogFingerprint || catalog.catalogFingerprint || null;
  }
  return { cable: result, missing: [...(!od ? ['outside diameter'] : []), ...(!count ? ['conductor count'] : []), ...(!rating ? ['cable rating'] : []), ...(!size ? ['conductor size'] : [])] };
}

/**
 * Check whether already-reserved sourced cables plus one candidate cable fit
 * on a corridor's largest listed ladder tray width. Routing uses this only as
 * a feasibility filter; the final raceway evaluator still selects the actual
 * smallest fitting listed width for the complete route assignment.
 */
export function evaluateCorridorTrayCapacity({ edge = {}, cables = [], candidateSize, catalog = SOUTHWIRE_SPEC45301 } = {}) {
  const widthLimit = positive(edge.widthIn || edge.width || edge.inside_width);
  const depth = positive(edge.depthIn || edge.depth || edge.tray_depth);
  const existing = validateExistingTray(edge);
  const width = existing.supplied ? widthLimit : WIDTHS.filter(value => value <= (widthLimit || 0)).at(-1);
  if (!existing.ok || !width || !depth || !candidateSize || !catalog.outsideDiameterIn?.[candidateSize]) {
    return { status: 'blocked', widthIn: width || null, reason: 'incomplete-corridor-or-cable-capacity-input' };
  }
  const candidate = {
    id: `capacity-probe-${candidateSize}`,
    conductor_size: candidateSize,
    conductor_count: catalog.conductorCount,
    cable_rating: catalog.cableRating,
    outerDiameterIn: catalog.outsideDiameterIn[candidateSize],
    cable_od: catalog.outsideDiameterIn[candidateSize],
  };
  const tray = { id: String(edge.id || ''), tray_id: String(edge.id || ''), tray_type: 'ladder', construction: 'ladder', width, inside_width: width, depth, usable_inside_depth: depth };
  const knownCables = cables.map(cable => enrichCable(cable, catalog).cable);
  const evaluation = evaluateTrayFill(tray, [...existing.cables, ...knownCables, candidate]);
  return { status: evaluation.status === 'pass' ? 'pass' : 'blocked', widthIn: width, evaluation, reason: evaluation.status === 'pass' ? null : 'shared-tray-capacity' };
}
function coordinates(nodes, id) {
  const key = String(id ?? '').trim().toLowerCase();
  const matches = (nodes || []).filter(item => String(item?.id ?? '').trim().toLowerCase() === key);
  const node = key && matches.length === 1 ? matches[0] : null;
  const point = node ? [Number(node.x), Number(node.y), Number(node.z)] : null;
  return point && point.every(Number.isFinite) ? point : null;
}
function routeRows(routeResults) { return Array.isArray(routeResults) ? routeResults : routeResults?.batchResults || []; }

/** Evaluate explicit generated tray route segments using corridor edge geometry. */
export function evaluateDesignSynthesisRaceways({ corridors = {}, cables = [], routeResults = [], criteria = {}, catalog = SOUTHWIRE_SPEC45301 } = {}) {
  const issues = [], enriched = cables.map(cable => enrichCable(cable, catalog)), nextCables = enriched.map(item => item.cable);
  enriched.forEach((item, index) => { if (item.missing.length) issues.push({ code: 'RACEWAY-CABLE-MISSING-DATA', severity: 'blocking', cable: cableId(nextCables[index]) || index, missing: item.missing }); });
  const nodes = corridors.nodes || [], edges = new Map((corridors.edges || []).map(edge => [String(edge.id), edge])), groups = new Map(), routedIds = new Set();
  nextCables.forEach(cable => { cable.raceway_ids = []; });
  for (const row of routeRows(routeResults)) {
    const cable = nextCables.find(item => cableId(item) === text(row.cable || row.cableId || row.id));
    if (!cable) continue;
    if (row.status === 'routed' || row.status === 'pass' || row.status === 'ok') routedIds.add(cableId(cable));
    const seenEdges = new Set();
    for (const segment of row.route_segments || row.routeSegments || []) {
      const kind = text(segment.type || segment.kind).toLowerCase();
      if (kind && kind !== 'tray') continue;
      const edgeId = text(segment.tray_id || segment.raceway_id || segment.edgeId);
      if (!edgeId) continue;
      if (!edges.has(edgeId)) { issues.push({ code: 'RACEWAY-EDGE-MISSING', severity: 'blocking', racewayId: edgeId, cable: cableId(cable) }); continue; }
      if (!seenEdges.has(edgeId)) { seenEdges.add(edgeId); (groups.get(edgeId) || groups.set(edgeId, []).get(edgeId)).push(cable); }
    }
  }
  const trays = [], evaluations = [], conduits = [], installationCoverage = [];
  for (const [edgeId, group] of groups) {
    const edge = edges.get(edgeId), widthLimit = positive(edge?.widthIn || edge?.width || edge?.inside_width), depth = positive(edge?.depthIn || edge?.depth || edge?.tray_depth);
    if (!edge || edge.permitted === false || edge.allowed === false) { issues.push({ code: 'RACEWAY-EDGE-UNSUPPORTED', severity: 'blocking', racewayId: edgeId }); continue; }
    if (!widthLimit || !depth) { issues.push({ code: 'RACEWAY-GEOMETRY-BLOCKED', severity: 'blocking', racewayId: edgeId }); continue; }
    const existing = validateExistingTray(edge, `corridors.edges.${edgeId}`);
    if (!existing.ok) { issues.push(...existing.issues.map(item => ({ ...item, severity: 'blocking', racewayId: edgeId }))); continue; }
    const existingIds = new Set(existing.cables.map(cable => text(cable.id).toLowerCase()));
    if (group.some(cable => [cable.id, cable.tag, cable.name].some(id => text(id) && existingIds.has(text(id).toLowerCase())))) {
      issues.push({ code: 'EXISTING_CABLE_ID_CONFLICT', severity: 'blocking', racewayId: edgeId, message: 'An existing cable identity matches a generated cable; resolve whether these are the same physical cable before evaluating tray fill.' });
      continue;
    }
    let selected = null;
    for (const width of (existing.supplied ? [widthLimit] : WIDTHS.filter(value => value <= widthLimit))) { const tray = { id: edgeId, tray_id: edgeId, edgeId, tray_type: 'ladder', construction: 'ladder', width, inside_width: width, depth, usable_inside_depth: depth }; const evaluation = evaluateTrayFill(tray, [...existing.cables, ...group]); if (evaluation.status === 'pass') { selected = { tray, evaluation }; break; } }
    if (!selected) { issues.push({ code: 'RACEWAY-CAPACITY-BLOCKED', severity: 'blocking', racewayId: edgeId, availableWidthIn: widthLimit }); continue; }
    const start = coordinates(nodes, edge.from), end = coordinates(nodes, edge.to);
    if (!start || !end || start.every((value, index) => value === end[index])) { issues.push({ code: 'RACEWAY-GEOMETRY-BLOCKED', severity: 'blocking', racewayId: edgeId }); continue; }
    Object.assign(selected.tray, { start, end, start_x: start[0], start_y: start[1], start_z: start[2], end_x: end[0], end_y: end[1], end_z: end[2] });
    if (existing.supplied) selected.tray.existingTrayScreen = { trayId: edge.existingTray.trayId, inventoryReference: edge.existingTray.inventoryReference, existingCableCount: existing.cables.reduce((sum, cable) => sum + cable.quantity, 0), reuseStatus: 'screening-only-not-applicable' };
    trays.push(selected.tray); evaluations.push({ racewayId: edgeId, ...selected.evaluation }); group.forEach(cable => { cable.raceway_ids = [...new Set([...(cable.raceway_ids || []), edgeId])]; });
  }
  for (const row of routeRows(routeResults)) {
    const cable = nextCables.find(item => cableId(item) === text(row.cable || row.cableId || row.id));
    if (!cable) continue;
    const endpoint = evaluateEndpointInstallation({ cable, route: row, criteria });
    installationCoverage.push({ cableId: cableId(cable), status: endpoint.status, coverage: endpoint.coverage, segments: endpoint.segments, issues: endpoint.issues });
    conduits.push(...endpoint.conduits);
    cable.raceway_ids = [...new Set([...(cable.raceway_ids || []), ...endpoint.conduits.map(conduit => conduit.id)])];
    issues.push(...endpoint.issues.map(item => ({ ...item, cable: cableId(cable) })));
  }
  const coverageByCable = new Map(installationCoverage.map(item => [item.cableId, item]));
  for (const row of routeRows(routeResults)) {
    const cable = nextCables.find(item => cableId(item) === text(row.cable || row.cableId || row.id));
    if (!cable) continue;
    const id = cableId(cable); const entry = coverageByCable.get(id) || { cableId: id, status: 'unevaluated', coverage: 'incomplete', segments: [], issues: [] };
    // Older direct evaluator callers omit route status; preserve their
    // established geometry-only behavior while treating an explicit blocked
    // route as unevaluated installation coverage.
    const routeIsUsable = row.status === undefined || ['routed', 'pass', 'ok'].includes(text(row.status).toLowerCase());
    const existing = new Set(entry.segments.map(segment => segment.segmentId));
    for (const segment of row.route_segments || row.routeSegments || []) {
      const kind = text(segment.type || segment.kind).toLowerCase(); if (kind !== 'tray') continue;
      const segmentId = text(segment.tray_id || segment.raceway_id || segment.edgeId); if (existing.has(segmentId)) continue;
      const evaluation = evaluations.find(item => String(item.racewayId) === segmentId);
      entry.segments.push({ segmentId, type: 'tray', coverage: 'tray', installationStatus: evaluation?.status === 'pass' ? 'evaluated' : 'blocked', racewayId: segmentId });
    }
    if (!(row.route_segments || row.routeSegments || []).length && row.status === 'routed' && Number(row.total_length || row.lengthFt || 0) === 0) entry.segments.push({ segmentId: 'point', type: 'point', coverage: 'none', installationStatus: 'not-needed' });
    entry.status = routeIsUsable && entry.segments.length && entry.segments.every(segment => ['evaluated', 'not-needed'].includes(segment.installationStatus))
      ? 'evaluated'
      : (entry.segments.length ? 'blocked' : 'unevaluated');
    entry.coverage = entry.status === 'evaluated' ? 'complete' : 'incomplete'; coverageByCable.set(id, entry);
  }
  installationCoverage.splice(0, installationCoverage.length, ...coverageByCable.values());
  nextCables.forEach(cable => {
    const coverage = coverageByCable.get(cableId(cable)) || { cableId: cableId(cable), status: 'unevaluated', coverage: 'incomplete', segments: [], issues: [] };
    // Keep cable records compact because they are persisted with every project
    // snapshot. Detailed fill evidence remains in the proposal-level coverage.
    cable.installationCoverage = {
      cableId: coverage.cableId,
      status: coverage.status,
      coverage: coverage.coverage,
      segments: (coverage.segments || []).map(segment => {
        const compact = { segmentId: segment.segmentId, coverage: segment.coverage, installationStatus: segment.installationStatus };
        if (segment.conduitId) { compact.conduitId = segment.conduitId; compact.conduitType = segment.conduitType || 'EMT'; compact.tradeSize = segment.tradeSize || null; }
        return compact;
      }),
    };
  });
  nextCables.forEach(cable => { if ((!Array.isArray(cable.raceway_ids) || !cable.raceway_ids.length) && !routedIds.has(cableId(cable))) issues.push({ code: 'RACEWAY-ASSIGNMENT-MISSING', severity: 'blocking', cable: cableId(cable) }); });
  const installationComplete = installationCoverage.length === nextCables.length && installationCoverage.every(item => ['evaluated', 'not-needed'].includes(item.status) && item.segments.every(segment => ['evaluated', 'not-needed'].includes(segment.installationStatus)));
  return { status: issues.some(issue => issue.severity === 'blocking') ? 'blocked' : 'proposal', trays, conduits, cables: nextCables, evaluations, installationCoverage, installationComplete, issues, source: catalog, assignedCableCount: nextCables.filter(cable => cable.raceway_ids?.length).length };
}
