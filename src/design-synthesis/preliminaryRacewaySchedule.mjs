const rows = value => Array.isArray(value) ? value : [];
const key = value => value == null ? '' : String(value).trim();
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : '';

function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let result = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(result) || /^[\t\r\n]/u.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

const fail = () => ({ ok: false, message: 'A complete, unambiguous generated raceway and cable-route projection is required.', csv: null });

/** Export a traceable raceway projection for review without changing project data. */
export function buildPreliminaryRacewaySchedule(proposal) {
  if (!proposal || !Array.isArray(proposal.trays) || !Array.isArray(proposal.conduits)
    || !Array.isArray(proposal.cables) || !Array.isArray(proposal.routeResults?.batchResults)
    || !['proposal', 'blocked'].includes(proposal.status) || !key(proposal.inputSignature)) return fail();
  const raceways = new Map();
  for (const [kind, items] of [['tray', proposal.trays], ['conduit', proposal.conduits]]) {
    for (const item of items) {
      const id = key(item?.id);
      if (!id || raceways.has(id)) return fail();
      raceways.set(id, { kind, item, assignments: new Set(), length: null });
    }
  }
  if (!raceways.size || !proposal.cables.length) return fail();
  const cableById = new Map();
  for (const cable of proposal.cables) {
    const id = key(cable?.id);
    if (!id || cableById.has(id)) return fail();
    cableById.set(id, cable);
  }
  const seen = new Set();
  for (const route of proposal.routeResults.batchResults) {
    const id = key(route?.cable);
    const cable = cableById.get(id);
    if (!cable || seen.has(id) || route.status !== 'routed' || !Array.isArray(route.route_segments)
      || !key(route.from) || !key(route.to) || key(route.from) !== key(cable.from) || key(route.to) !== key(cable.to)
      || number(route.total_length) === '' || route.total_length < 0) return fail();
    seen.add(id);
    let routeLength = 0;
    for (const segment of route.route_segments) {
      const kind = key(segment?.type).toLowerCase();
      const racewayId = key(segment?.raceway_id);
      const entry = raceways.get(racewayId);
      const alias = kind === 'tray' ? key(segment?.tray_id) : kind === 'conduit' ? key(segment?.conduit_id) : '';
      const length = number(segment?.length);
      if (!entry || entry.kind !== kind || alias !== racewayId || length === '' || length < 0) return fail();
      const endpoints = [segment.start, segment.end];
      const fixed = [['start_x', 'start_y', 'start_z'], ['end_x', 'end_y', 'end_z']].map(fields => fields.map(field => number(entry.item[field])));
      const samePoint = (a, b) => Array.isArray(a) && a.length === 3 && a.every((v, i) => number(v) !== '' && b[i] !== '' && Math.abs(v - b[i]) <= 1e-8 * Math.max(1, Math.abs(v), Math.abs(b[i])));
      if (!(samePoint(endpoints[0], fixed[0]) && samePoint(endpoints[1], fixed[1]))
        && !(samePoint(endpoints[0], fixed[1]) && samePoint(endpoints[1], fixed[0]))) return fail();
      if (entry.length !== null && Math.abs(entry.length - length) > 1e-8 * Math.max(1, entry.length, length)) return fail();
      entry.length = length;
      entry.assignments.add(id);
      routeLength += length;
    }
    if (Math.abs(route.total_length - routeLength) > 1e-8 * Math.max(1, route.total_length, routeLength)) return fail();
  }
  if (seen.size !== cableById.size || [...raceways.values()].some(entry => !entry.assignments.size)) return fail();
  const evaluations = new Map();
  for (const evaluation of rows(proposal.racewayEvaluations)) {
    const id = key(evaluation?.racewayId);
    if (!id || evaluations.has(id)) return fail();
    evaluations.set(id, evaluation);
  }
  const conduitEvidence = new Map();
  for (const coverage of rows(proposal.installationCoverage)) {
    for (const segment of rows(coverage?.segments)) {
      const id = key(segment?.conduitId);
      if (!id) continue;
      if (conduitEvidence.has(id)) return fail();
      conduitEvidence.set(id, { ...segment, cableId: key(coverage.cableId) });
    }
  }
  const headers = ['Review basis', 'Proposal status', 'Input signature', 'Raceway ID', 'Raceway type', 'Construction', 'Trade size', 'Width (in)', 'Depth (in)', 'Route length (ft)', 'Start X (ft)', 'Start Y (ft)', 'Start Z (ft)', 'End X (ft)', 'End Y (ft)', 'End Z (ft)', 'Assigned generated cable count', 'Assigned generated cable IDs', 'Fill screening status', 'Tray limit utilization (%)', 'Conduit area fill (%)', 'Existing cable count', 'Existing inventory reference', 'Review limitations'];
  const output = [];
  for (const [id, entry] of raceways) {
    const { item, kind, assignments } = entry;
    const evaluation = kind === 'tray' ? evaluations.get(id) : conduitEvidence.get(id);
    if (kind === 'conduit' && evaluation && (!assignments.has(evaluation.cableId) || assignments.size !== 1)) return fail();
    const coords = ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'].map(field => number(item[field]));
    if (coords.some(value => value === '')) return fail();
    output.push(['PRELIMINARY SCREENING - NOT APPROVED', proposal.status || 'unknown', proposal.inputSignature || '', id, kind,
      kind === 'tray' ? item.construction || item.tray_type : item.conduit_type, item.trade_size, number(item.inside_width ?? item.width), number(item.usable_inside_depth ?? item.depth), entry.length,
      ...coords, assignments.size, JSON.stringify([...assignments].sort()), kind === 'tray' ? evaluation?.status || 'not evaluated' : evaluation?.installationStatus || 'not evaluated',
      kind === 'tray' ? number(evaluation?.utilizationPercent) : '', kind === 'conduit' ? number(evaluation?.fillPercent) : '', number(item.existingTrayScreen?.existingCableCount), item.existingTrayScreen?.inventoryReference,
      'Screening only; verify field routing, installation, thermal interaction and protection']);
  }
  return { ok: true, message: null, csv: `\ufeff${[headers, ...output].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, racewayCount: output.length };
}
