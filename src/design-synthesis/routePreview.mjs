import { corridorPermission } from './corridorEditor.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const key = value => String(value ?? '').trim();
const rows = value => Array.isArray(value) ? value : [];
const point2 = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const point3 = point => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite);
const near = (a, b) => a.every((value, index) => Math.abs(value - b[index]) <= 1e-7 * Math.max(1, Math.abs(value), Math.abs(b[index])));
const format = value => Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : 'unavailable';
const pointLabel = point => point3(point) ? point.slice(0, 3).map(format).join(' / ') : 'unavailable';

function indexUnique(items, identify) {
  const result = new Map();
  for (const item of items) {
    const id = key(identify(item));
    if (id) result.set(id, result.has(id) ? null : item);
  }
  return result;
}

/** Keep route identity, endpoint matching, and geometric continuity explicit. */
function evaluateRoute(cable, routes, equipment, corridorEdges, corridorNodes) {
  const id = key(cable.id);
  if (!routes.has(id)) return { status: 'missing', segments: [] };
  const route = routes.get(id);
  if (!route) return { status: 'ambiguous', segments: [] };
  if (!key(cable.from) || !key(cable.to) || key(route.from) !== key(cable.from) || key(route.to) !== key(cable.to)) return { status: 'endpoint mismatch', segments: [] };
  if (route.status !== 'routed') return { status: key(route.status) || 'unknown', segments: [] };
  const segments = rows(route.route_segments);
  const from = equipment.get(key(cable.from)); const to = equipment.get(key(cable.to));
  const start = from && [from.x, from.y, from.z]; const end = to && [to.x, to.y, to.z];
  if (!segments.length) {
    if (route.total_length === 0 && cable.lengthFt === 0 && point3(start) && point3(end) && near(start, end)) return { status: 'routed (co-located)', segments: [], point: start, route };
    return { status: 'no route geometry', segments: [] };
  }
  if (segments.some((segment, index) => !point3(segment?.start) || !point3(segment?.end) || (index && !near(segments[index - 1].end.slice(0, 3), segment.start.slice(0, 3))))) return { status: 'invalid or disconnected geometry', segments: [] };
  if (!point3(start) || !point3(end) || !near(start, segments[0].start.slice(0, 3)) || !near(end, segments[segments.length - 1].end.slice(0, 3))) return { status: 'physical endpoint mismatch', segments: [] };
  for (const segment of segments) {
    const length = Math.hypot(...segment.start.slice(0, 3).map((value, index) => value - segment.end[index]));
    if (!Number.isFinite(length) || !Number.isFinite(segment.length) || segment.length < 0 || Math.abs(segment.length - length) > 1e-7 * Math.max(1, length)) return { status: 'segment length mismatch', segments: [] };
    if (segment.type === 'tray') {
      const edge = corridorEdges.get(key(segment.tray_id).toLowerCase());
      const a = edge && corridorNodes.get(key(edge.from).toLowerCase()); const b = edge && corridorNodes.get(key(edge.to).toLowerCase());
      const a3 = a && [a.x, a.y, a.z]; const b3 = b && [b.x, b.y, b.z];
      if (!edge || !['allowed', 'unspecified'].includes(corridorPermission(edge)) || !point3(a3) || !point3(b3) || !((near(a3, segment.start) && near(b3, segment.end)) || (near(b3, segment.start) && near(a3, segment.end)))) return { status: 'unpermitted or mismatched corridor', segments: [] };
    } else if (!['conduit', 'field'].includes(segment.type)) return { status: 'unsupported segment type', segments: [] };
  }
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!Number.isFinite(total) || !Number.isFinite(route.total_length) || !Number.isFinite(cable.lengthFt) || Math.abs(route.total_length - total) > 1e-7 * Math.max(1, total) || Math.abs(cable.lengthFt - total) > 1e-7 * Math.max(1, total)) return { status: 'total length mismatch', segments: [] };
  return { status: 'routed', segments, route };
}

/** Render an equal-scale XY projection of the current generated route records. */
export function renderDesignSynthesisRoutePreview(proposal, selectedId = '') {
  const corridors = proposal?.inputs?.original?.corridors || {};
  const nodes = rows(corridors.nodes).filter(point2);
  const equipment = rows(proposal?.equipment).filter(point2);
  const cables = rows(proposal?.cables);
  const cableIndex = indexUnique(cables, cable => cable?.id);
  const routeList = Array.isArray(proposal?.routeResults) ? proposal.routeResults : rows(proposal?.routeResults?.batchResults);
  const routes = indexUnique(routeList, route => route?.cable || route?.id);
  const equipmentIndex = indexUnique(equipment, item => item?.id);
  const corridorNodes = indexUnique(nodes, node => key(node.id).toLowerCase());
  const corridorEdges = indexUnique(rows(corridors.edges), edge => key(edge?.id).toLowerCase());
  const evaluated = cables.filter(cable => cableIndex.get(key(cable?.id)) === cable).map(cable => ({ cable, ...evaluateRoute(cable, routes, equipmentIndex, corridorEdges, corridorNodes) }));
  const selected = evaluated.find(item => key(item.cable.id) === selectedId);
  const selectedValue = selected ? selectedId : '';
  const options = evaluated.map(item => `<option value="${esc(item.cable.id)}"${key(item.cable.id) === selectedValue ? ' selected' : ''}>${esc(item.cable.id)} · ${esc(item.status)}</option>`).join('');
  const segmentPoints = evaluated.flatMap(item => item.segments.flatMap(segment => [segment.start, segment.end]));
  const points = [...nodes.map(node => [node.x, node.y]), ...equipment.map(item => [item.x, item.y]), ...segmentPoints];
  const head = `<label>Inspect circuit <select data-route-preview-select aria-label="Inspect proposed circuit route"><option value="">All routes</option>${options}</select></label>`;
  if (!points.length) return `${head}<p>No valid physical coordinates are available for the route preview.</p>`;
  const xs = points.map(point => point[0]); const ys = points.map(point => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const dx = maxX - minX; const dy = maxY - minY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return `${head}<p>Coordinate range is too large to render accurately.</p>`;
  const scale = Math.min(dx > 0 ? 460 / dx : Infinity, dy > 0 ? 150 / dy : Infinity);
  const factor = Number.isFinite(scale) ? scale : 1;
  const sx = value => 250 + (value - (minX + dx / 2)) * factor;
  const sy = value => 100 - (value - (minY + dy / 2)) * factor;
  const nodeIndex = corridorNodes;
  const lines = rows(corridors.edges).filter(edge => ['allowed', 'unspecified'].includes(corridorPermission(edge))).map(edge => {
    const a = nodeIndex.get(key(edge.from).toLowerCase()); const b = nodeIndex.get(key(edge.to).toLowerCase());
    return a && b ? `<line x1="${sx(a.x)}" y1="${sy(a.y)}" x2="${sx(b.x)}" y2="${sy(b.y)}" class="synthesis-route-line" data-route-kind="corridor"><title>Permitted corridor ${esc(edge.id)}</title></line>` : '';
  }).join('');
  const visible = selected ? [selected] : evaluated;
  const routeLines = visible.flatMap(item => item.segments.map(segment => {
    const a = segment.start; const b = segment.end;
    const type = ['tray', 'conduit', 'field'].includes(segment.type) ? segment.type : 'route';
    const title = `${key(item.cable.id)} · ${key(segment.type) || 'route'} · ${pointLabel(a)} to ${pointLabel(b)} ft`;
    const attrs = `class="synthesis-route-line synthesis-route-line--${type}" data-route-kind="${type}" data-route-cable="${esc(item.cable.id)}"`;
    if (a[0] === b[0] && a[1] === b[1]) return `<circle cx="${sx(a[0])}" cy="${sy(a[1])}" r="3" fill="none" ${attrs}><title>${esc(title)}</title></circle>`;
    return `<line x1="${sx(a[0])}" y1="${sy(a[1])}" x2="${sx(b[0])}" y2="${sy(b[1])}" ${attrs}><title>${esc(title)}</title></line>`;
  })).join('');
  const dots = equipment.map(item => `<circle cx="${sx(item.x)}" cy="${sy(item.y)}" r="3" class="synthesis-equipment-dot"><title>${esc(item.tag || item.id)}</title></circle>`).join('');
  const coLocated = visible.filter(item => item.point).map(item => `<circle cx="${sx(item.point[0])}" cy="${sy(item.point[1])}" r="6" fill="none" class="synthesis-route-line synthesis-route-line--field" data-route-cable="${esc(item.cable.id)}"><title>${esc(item.cable.id)} · co-located endpoints at ${esc(pointLabel(item.point))} ft</title></circle>`).join('');
  const excluded = evaluated.filter(item => !item.status.startsWith('routed')).length + cables.length - evaluated.length;
  const selectedDetail = selected ? `<p>Route ${esc(selected.cable.id)}: ${esc(selected.status)} · ${esc(selected.cable.from)} → ${esc(selected.cable.to)} · cable length ${esc(format(selected.cable.lengthFt))} ft.</p>${selected.segments.length ? `<div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Segment</th><th>Raceway</th><th>Start x / y / z (ft)</th><th>End x / y / z (ft)</th><th>Length (ft)</th></tr></thead><tbody>${selected.segments.map(segment => `<tr><td>${esc(segment.type || 'route')}</td><td>${esc(segment.raceway_id || segment.tray_id || segment.conduit_id || 'unavailable')}</td><td>${esc(pointLabel(segment.start))}</td><td>${esc(pointLabel(segment.end))}</td><td>${esc(format(segment.length))}</td></tr>`).join('')}</tbody></table></div>` : selected.point ? `<p>Co-located endpoints: ${esc(pointLabel(selected.point))} ft; no route segments were generated.</p>` : '<p>Route geometry is unavailable for this circuit; consult its proposal issues.</p>'}` : '';
  return `${head}<svg class="synthesis-route-preview" viewBox="0 0 500 200" role="img" aria-label="Plan view of proposed routes and permitted corridors">${lines}${routeLines}${dots}${coLocated}</svg><p class="field-hint">Preliminary plan view: x and y share a scale; elevation is not visible on the plan. Allowed corridors are blue, tray routes green, conduit routes purple, and field segments dashed. Overlapping lines do not imply a connection. ${excluded} circuit(s) have missing, blocked, ambiguous, or invalid route geometry and are not drawn.</p>${selectedDetail}`;
}
