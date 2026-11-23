const text = value => value === null || value === undefined ? '' : String(value);
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : '';
const rows = value => Array.isArray(value) ? value : [];
const key = value => text(value).trim();

// Spreadsheet applications may interpret untrusted identifiers as formulas.
function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let result = text(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(result) || /^[\t\r\n]/u.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

function uniqueBy(items, field) {
  const map = new Map();
  for (const item of rows(items)) {
    const id = key(item?.[field]);
    if (!id) continue;
    map.set(id, map.has(id) ? null : item);
  }
  return map;
}

const part = value => key(value?.catalogNumber || value?.catalog_number || value?.id);

/** Export the generated proposal, never the canonical project or inferred approval. */
export function buildPreliminaryCableSchedule(proposal) {
  const cables = rows(proposal?.cables);
  const ids = cables.map(cable => key(cable?.id));
  if (!cables.length || ids.some(id => !id) || new Set(ids).size !== ids.length) {
    return { ok: false, message: 'A proposal with uniquely identified cable records is required.', csv: null };
  }
  const routeRows = Array.isArray(proposal.routeResults) ? proposal.routeResults : proposal.routeResults?.batchResults;
  const routeByCable = uniqueBy(routeRows, 'cable');
  const conduits = uniqueBy(proposal.conduits, 'id');
  const starters = uniqueBy(proposal.motorStarterCandidates?.cases, 'motorId');
  const headers = [
    'Review basis', 'Proposal status', 'Input signature', 'Cable ID', 'From ID', 'From tag', 'To ID', 'To tag', 'Load ID', 'Load type',
    'Voltage (V)', 'Operating current (A)', 'Conductor count', 'Conductor material', 'Conductor size', 'Screened ampacity (A)', 'Sizing status',
    'Cable length (ft)', 'Cable voltage drop (%)', 'Combined voltage drop (%)', 'Combined voltage drop status',
    'Route status', 'Ordered route segments', 'Alternative endpoint connection', 'Field connection review', 'Endpoint conduit retry', 'Installation coverage', 'Installation status',
    'Protective requirement (A)', 'Cable device candidate', 'Candidate continuous current (A)', 'Standalone interrupting rating (kA)', 'Interrupting rating voltage (V)',
    'Motor contactor candidate', 'Motor overload candidate', 'Motor short-circuit device candidate', 'Protection review status',
  ];
  const result = cables.map(cable => {
    const id = key(cable.id);
    const route = routeByCable.get(id);
    const routeMatches = route && key(cable.from) && key(cable.to) && key(route.from) === key(cable.from) && key(route.to) === key(cable.to);
    const routeStatus = !routeByCable.has(id) ? 'missing' : !route ? 'ambiguous' : !routeMatches ? 'endpoint mismatch' : key(route.status) || 'unknown';
    const segmentText = routeMatches ? rows(route.route_segments).map(segment => {
      const racewayId = key(segment?.raceway_id || segment?.tray_id || segment?.conduit_id);
      const conduit = conduits.get(key(segment?.conduit_id));
      const detail = [key(segment?.type) || 'type unavailable', racewayId || 'ID unavailable', conduit ? [key(conduit.conduit_type), key(conduit.trade_size)].filter(Boolean).join(' ') : '', typeof segment?.length === 'number' && Number.isFinite(segment.length) ? `${segment.length} ft` : 'length unavailable'].filter(Boolean);
      return detail.join(' / ');
    }).join(' → ') : '';
    const device = cable.protectiveDevice;
    const motor = Boolean(cable.motor);
    const starter = motor ? starters.get(key(cable.loadId))?.candidate : null;
    const motorShortCircuitPart = part(starter?.shortCircuitController || starter?.branchCircuitBreaker);
    const alternate = cable.routingDecision?.alternateEndpointAttachments;
    const alternateText = alternate?.status === 'selected'
      ? `${text(alternate.nearestSourceNode)} to ${text(alternate.sourceNode)} (${numeric(alternate.sourceAttachmentFt)} ft); ${text(alternate.nearestDestinationNode)} to ${text(alternate.destinationNode)} (${numeric(alternate.destinationAttachmentFt)} ft)`
      : '';
    const endpointRetry = cable.routingDecision?.endpointInstallationRetry;
    const endpointRetryText = endpointRetry?.status === 'selected'
      ? `${text(endpointRetry.originalConductorSize)} to ${text(endpointRetry.selectedConductorSize)}; ${(endpointRetry.originalIssueCodes || []).join(', ')}`
      : '';
    return [
      'PRELIMINARY SCREENING - NOT APPROVED', proposal.status || 'unknown', proposal.inputSignature || '', id,
      cable.from, cable.from_tag, cable.to, cable.to_tag, cable.loadId, motor ? 'motor' : cable.loadId ? 'nonmotor load' : 'feeder',
      numeric(cable.operating_voltage), numeric(cable.currentA), numeric(cable.conductor_count), cable.conductorMaterial || cable.conductor_material,
      cable.conductor_size || cable.conductorSize, numeric(cable.ampacityA), cable.sizingStatus,
      numeric(cable.lengthFt), numeric(cable.voltageDropPct), numeric(cable.combinedVoltageDropPct), cable.combinedVoltageDropStatus,
      routeStatus, segmentText, alternateText, alternateText ? 'Field permission and obstacles require review' : '', endpointRetryText, cable.installationCoverage?.coverage, cable.installationCoverage?.status,
      numeric(cable.protectiveRequirement?.ampereRatingA), device ? [device.manufacturer || device.vendor, part(device)].filter(Boolean).join(' ') : '',
      numeric(device?.continuousCurrentA), numeric(device?.interruptingRatingKA), numeric(device?.interruptingRatingVoltageVac),
      part(starter?.contactor), part(starter?.overloadRelay), motorShortCircuitPart,
      motor ? 'motor protection unresolved; candidate only' : 'screening only; coordination and assembly SCCR not established',
    ];
  });
  return { ok: true, message: null, csv: `\ufeff${[headers, ...result].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, cableCount: cables.length };
}
