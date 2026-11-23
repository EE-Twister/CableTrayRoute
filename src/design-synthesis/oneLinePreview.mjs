const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const key = value => String(value ?? '').trim();
const number = value => typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '—';
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Wrap without removing identifiers; titles alone are not visible in exports.
function wrap(value, maximum) {
  const words = String(value ?? '').trim().split(/\s+/u).filter(Boolean);
  const lines = []; let current = '';
  for (const word of words) {
    let remaining = Array.from(word);
    while (remaining.length > maximum) {
      if (current) { lines.push(current); current = ''; }
      lines.push(remaining.slice(0, maximum).join(''));
      remaining = remaining.slice(maximum);
    }
    const next = remaining.join('');
    if (!next) continue;
    if (current && Array.from(`${current} ${next}`).length > maximum) { lines.push(current); current = next; }
    else current = current ? `${current} ${next}` : next;
  }
  if (current) lines.push(current);
  return lines;
}

function edgeLabel(proposal, edge) {
  const cable = edge.cable;
  if (!cable) return { title: edge.terminal, rows: [edge.terminal] };
  const device = cable.protectiveDevice;
  const branch = cable.motor?.branchBreakerCandidate;
  const cases = Array.isArray(proposal.motorStarterCandidates?.cases) ? proposal.motorStarterCandidates.cases : [];
  const starter = cable.motor ? cases.find(item => key(item.motorId) === key(cable.loadId))?.candidate : null;
  const starterParts = [starter?.contactor?.catalogNumber, starter?.overloadRelay?.catalogNumber, starter?.shortCircuitController?.catalogNumber || starter?.branchCircuitBreaker?.catalogNumber].filter(Boolean);
  const protection = cable.motor ? 'Motor protection unresolved'
    : device ? `Device candidate ${device.manufacturer || device.vendor || ''} ${device.catalogNumber || device.id || ''}`.trim() : 'Device requirement only';
  const starterLabel = starterParts.length ? `Starter candidate ${starterParts.join(' + ')}` : branch?.catalogNumber ? `Breaker candidate ${branch.catalogNumber}` : '';
  const label = `${key(cable.id)} · ${cable.conductor_size || cable.conductorSize || 'size not available'}`;
  const rows = [label];
  if (positive(cable.lengthFt)) rows.push(`Cable length: ${number(cable.lengthFt)} ft`);
  rows.push(protection);
  if (cable.motor) {
    if (starter?.contactor?.catalogNumber) rows.push(`Contactor candidate: ${starter.contactor.catalogNumber}`);
    if (starter?.overloadRelay?.catalogNumber) rows.push(`Overload candidate: ${starter.overloadRelay.catalogNumber}`);
    if (starter?.shortCircuitController?.catalogNumber) rows.push(`Controller candidate: ${starter.shortCircuitController.catalogNumber}`);
    if (starter?.branchCircuitBreaker?.catalogNumber) rows.push(`Breaker candidate: ${starter.branchCircuitBreaker.catalogNumber}`);
    else if (branch?.catalogNumber) rows.push(`Breaker candidate: ${branch.catalogNumber}`);
    const deviceId = device?.catalogNumber || device?.id;
    if (deviceId && ![starter?.shortCircuitController?.catalogNumber, starter?.branchCircuitBreaker?.catalogNumber, branch?.catalogNumber].includes(deviceId)) rows.push(`Device candidate: ${device.manufacturer || device.vendor || ''} ${deviceId}`.trim());
  } else if (!device && positive(cable.protectiveRequirement?.ampereRatingA)) rows.push(`Required current: ${number(cable.protectiveRequirement.ampereRatingA)} A`);
  if (device && positive(device.continuousCurrentA)) rows.push(`Device continuous rating: ${number(device.continuousCurrentA)} A`);
  if (device && positive(device.interruptingRatingKA) && positive(device.interruptingRatingVoltageVac)) rows.push(`Standalone interrupting: ${number(device.interruptingRatingKA)} kA at ${number(device.interruptingRatingVoltageVac)} V`);
  return { title: `${label}; ${protection}${starterLabel ? `; ${starterLabel}` : ''}`, rows: rows.flatMap(row => wrap(row, 30)) };
}

/** Build a review drawing from the generated connectivity. Incomplete,
 * ambiguous, or non-radial topology is not silently drawn as a complete design. */
export function buildDesignSynthesisOneLinePreview(proposal) {
  const sheets = proposal?.oneLine?.sheets;
  const fail = message => ({ ok: false, message, svg: null });
  if (!Array.isArray(sheets) || sheets.length !== 1 || !Array.isArray(sheets[0]?.components) || !Array.isArray(sheets[0]?.connections)) return fail('A single generated one-line sheet with components and connections is required.');
  const components = sheets[0].components;
  const nodes = new Map();
  for (const component of components) {
    const id = key(component?.id);
    if (!id || nodes.has(id) || !key(component?.type)) return fail('The generated one-line contains a missing or duplicate component identity or type.');
    nodes.set(id, component);
  }
  const loadIds = Array.isArray(proposal.loads) ? proposal.loads.map(load => key(load?.id)) : [];
  if (!Array.isArray(proposal.loads) || new Set(loadIds).size !== loadIds.length || components.filter(component => component.type === 'load').length !== loadIds.length || loadIds.some(id => !nodes.has(id) || nodes.get(id).type !== 'load')) return fail('The generated one-line does not represent every proposed load exactly once.');
  const sources = components.filter(item => item.type === 'utility_source');
  if (sources.length !== 1) return fail('The generated one-line requires exactly one source.');
  const cables = new Map();
  if (!Array.isArray(proposal.cables)) return fail('The generated cable records are missing.');
  for (const cable of proposal.cables) {
    const id = key(cable?.id);
    if (!id || cables.has(id)) return fail('The generated cable records contain a missing or duplicate identity.');
    cables.set(id, cable);
  }
  const edges = [];
  const representedCables = new Set();
  for (const connection of sheets[0].connections) {
    const id = key(connection?.cableId || connection?.id);
    const from = key(connection?.from); const to = key(connection?.to);
    const cable = cables.get(id);
    if (!cable || representedCables.has(id) || !nodes.has(from) || !nodes.has(to) || key(cable.from) !== from || key(cable.to) !== to) return fail('Generated cable connectivity is missing, duplicated, or inconsistent with the one-line.');
    representedCables.add(id);
    edges.push({ from, to, cable });
  }
  if (representedCables.size !== cables.size) return fail('The one-line does not represent every generated cable.');
  for (const transformer of components.filter(item => item.type === 'transformer')) {
    const primary = key(transformer.physical?.primaryBusId); const secondary = key(transformer.physical?.secondaryBusId);
    const terminals = transformer.connections;
    if (!primary || !secondary || primary === secondary || !nodes.has(primary) || !nodes.has(secondary) || !Array.isArray(terminals) || terminals.length !== 2
      || !terminals.some(row => row?.sourcePort === 0 && key(row.target) === primary) || !terminals.some(row => row?.sourcePort === 1 && key(row.target) === secondary)) return fail('A transformer has incomplete or inconsistent primary and secondary terminals.');
    edges.push({ from: primary, to: key(transformer.id), terminal: 'primary winding' }, { from: key(transformer.id), to: secondary, terminal: 'secondary winding' });
  }
  const children = new Map([...nodes.keys()].map(id => [id, []]));
  const incoming = new Map();
  for (const edge of edges) {
    if (edge.from === edge.to || incoming.has(edge.to)) return fail('The generated one-line is not a directed radial network.');
    incoming.set(edge.to, edge);
    children.get(edge.from).push(edge);
  }
  const sourceId = key(sources[0].id);
  if (incoming.has(sourceId)) return fail('The generated source has an incoming connection.');
  const visited = new Set(); const order = [];
  function walk(id, depth) {
    if (visited.has(id)) return false;
    visited.add(id); order.push({ id, depth });
    for (const edge of children.get(id)) if (!walk(edge.to, depth + 1)) return false;
    return true;
  }
  if (!walk(sourceId, 0) || visited.size !== nodes.size) return fail('The generated one-line contains a cycle or source-disconnected equipment.');

  const edgeLabels = new Map(edges.map(edge => [edge, edgeLabel(proposal, edge)]));
  const nodeLabels = new Map(order.map(({ id }) => {
    const node = nodes.get(id); const physical = node.physical || {};
    const kind = node.type === 'load' && physical.motor ? 'motor load' : String(node.type).replaceAll('_', ' ');
    const rating = node.type === 'transformer' ? `${number(node.volts_primary)} / ${number(node.volts_secondary)} V · ${number(node.kva)} kVA` : `${number(node.voltage)} V${node.type === 'load' ? ` · ${number(node.kw)} kW` : ''}`;
    return [id, { title: `${node.tag || id} (${id}); ${kind}; ${rating}`, tagRows: wrap(node.tag || id, 16), detailRows: wrap(`${kind} · ${rating}`, 22) }];
  }));
  const xStep = 570; const boxWidth = 230;
  const boxHeight = Math.max(58, ...[...nodeLabels.values()].map(item => (item.tagRows.length + item.detailRows.length) * 16 + 18));
  const maxEdgeRows = Math.max(1, ...[...edgeLabels.values()].map(item => item.rows.length));
  const rowStep = Math.max(120, maxEdgeRows * 14 + boxHeight + 20);
  const firstRowY = Math.max(135, 95 + maxEdgeRows * 14 + boxHeight / 2);
  const positions = new Map(); let leaf = 0;
  function place(id, depth) {
    const next = children.get(id);
    const y = next.length ? next.map(edge => place(edge.to, depth + 1)).reduce((sum, value) => sum + value, 0) / next.length : firstRowY + leaf++ * rowStep;
    positions.set(id, { x: 25 + depth * xStep, y });
    return y;
  }
  place(sourceId, 0);
  const width = Math.max(1000, Math.max(...order.map(item => positions.get(item.id).x)) + boxWidth + 30);
  const height = Math.max(240, firstRowY + boxHeight / 2 + 35 + Math.max(0, leaf - 1) * rowStep);
  const lines = edges.map(edge => {
    const parent = positions.get(edge.from); const child = positions.get(edge.to); const midX = parent.x + boxWidth + 18;
    const label = edgeLabels.get(edge);
    const rows = label.rows.map((row, index) => `<text x="${midX + 5}" y="${child.y - 12 - (label.rows.length - index - 1) * 14}" font-size="11">${escapeXml(row)}</text>`).join('');
    return `<g${edge.cable ? ` data-cable-id="${escapeXml(edge.cable.id)}"` : ''}><title>${escapeXml(label.title)}</title><path d="M ${parent.x + boxWidth} ${parent.y} H ${midX} V ${child.y} H ${child.x}" fill="none" stroke="#31465b" stroke-width="2"/>${rows}</g>`;
  }).join('');
  const boxes = order.map(({ id }) => {
    const pos = positions.get(id); const label = nodeLabels.get(id);
    const all = [...label.tagRows.map(row => ({ row, tag: true })), ...label.detailRows.map(row => ({ row, tag: false }))];
    const textRows = all.map((item, index) => `<text x="${pos.x + 8}" y="${pos.y - (all.length - 1) * 8 + index * 16 + 4}" font-size="${item.tag ? 14 : 11}"${item.tag ? ' font-weight="bold"' : ''}>${escapeXml(item.row)}</text>`).join('');
    return `<g data-node-id="${escapeXml(id)}"><title>${escapeXml(label.title)}</title><rect x="${pos.x}" y="${pos.y - boxHeight / 2}" width="${boxWidth}" height="${boxHeight}" rx="4" fill="#fff" stroke="#18334b" stroke-width="2"/>${textRows}</g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="preview-title preview-desc" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title id="preview-title">Preliminary generated one-line</title><desc id="preview-desc">Generated radial topology for review. Protection and installation are not approved.</desc><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial, sans-serif" fill="#172a3b"><text x="25" y="26" font-size="17" font-weight="bold">PRELIMINARY ONE-LINE — ${escapeXml(String(proposal.status || 'unknown').toUpperCase())}</text><text x="25" y="48" font-size="12">Screening only. Device candidates and protection are not approved; verify design and installation.</text><text x="25" y="66" font-size="11">Generated connectivity; conductor and device labels are proposals, not installed records.</text>${lines}${boxes}</g></svg>`;
  return { ok: true, message: null, svg, nodeCount: nodes.size, cableCount: cables.size };
}
