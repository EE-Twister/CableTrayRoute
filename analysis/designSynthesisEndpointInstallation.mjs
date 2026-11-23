import { conduitInternalArea, evaluateConduitFill } from './conduitFill.mjs';

const EMT_SIZES = Object.freeze(['1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '2-1/2', '3', '3-1/2', '4']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(Number(value)) && Number(value) > 0;
const text = value => String(value ?? '').trim();

function sizeIndex(size) { const raw = text(size).replace(/["']/g, ''); return EMT_SIZES.indexOf(raw); }

export function validateEndpointInstallation(criteria = {}) {
  const value = criteria?.endpointInstallation;
  const issues = [];
  if (value === undefined) return { ok: true, issues: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, issues: [{ code: 'INVALID_ENDPOINT_INSTALLATION', message: 'criteria.endpointInstallation must be an object.', severity: 'blocking', path: 'criteria.endpointInstallation' }] };
  for (const key of Object.keys(value)) if (!['method', 'minimumTradeSize', 'maximumTradeSize'].includes(key)) issues.push({ code: 'UNKNOWN_ENDPOINT_INSTALLATION_FIELD', message: `Unknown endpointInstallation field ${key}.`, severity: 'blocking', path: `criteria.endpointInstallation.${key}` });
  if (value.method !== undefined && value.method !== 'dedicated-emt') issues.push({ code: 'UNSUPPORTED_ENDPOINT_INSTALLATION_METHOD', message: 'Only dedicated-emt endpoint installation is supported.', severity: 'blocking', path: 'criteria.endpointInstallation.method' });
  for (const key of ['minimumTradeSize', 'maximumTradeSize']) if (value[key] !== undefined && sizeIndex(value[key]) < 0) issues.push({ code: 'INVALID_ENDPOINT_CONDUIT_SIZE', message: `${key} must be a supported EMT trade size.`, severity: 'blocking', path: `criteria.endpointInstallation.${key}` });
  if (sizeIndex(value.minimumTradeSize) >= 0 && sizeIndex(value.maximumTradeSize) >= 0 && sizeIndex(value.minimumTradeSize) > sizeIndex(value.maximumTradeSize)) issues.push({ code: 'INVALID_ENDPOINT_CONDUIT_BOUNDS', message: 'minimumTradeSize cannot exceed maximumTradeSize.', severity: 'blocking', path: 'criteria.endpointInstallation' });
  return { ok: issues.length === 0, issues };
}

function cableArea(cable) { const od = Number(cable?.outerDiameterIn || cable?.cable_od || cable?.diameter); return positive(od) ? Math.PI * (od / 2) ** 2 : null; }

export function evaluateEndpointInstallation({ cable, route, criteria = {} } = {}) {
  const validation = validateEndpointInstallation(criteria);
  if (!validation.ok) return { status: 'blocked', coverage: 'incomplete', segments: [], conduits: [], issues: validation.issues, assumptions: [] };
  const fieldSegments = (route?.route_segments || []).filter(segment => (String(segment.type || '').toLowerCase() === 'field' || segment.endpointRole) && Number(segment.length || 0) > 0);
  if (!fieldSegments.length) return { status: 'not-needed', coverage: 'complete', segments: [], conduits: [], issues: [], assumptions: ['No positive-length field or endpoint leg requires a generated endpoint conduit.'] };
  const installation = criteria.endpointInstallation;
  if (!installation?.method) return { status: 'unevaluated', coverage: 'incomplete', segments: fieldSegments.map(segment => ({ segmentId: segment.segmentId || segment.endpointRole || 'field', type: 'field', coverage: 'dedicated-emt', installationStatus: 'unevaluated' })), conduits: [], issues: [{ code: 'ENDPOINT_INSTALLATION_MISSING', message: 'Positive-length endpoint legs require criteria.endpointInstallation.method.', severity: 'blocking' }], assumptions: [] };
  const area = cableArea(cable);
  const physicalCount = Number(cable?.parallel_count ?? cable?.parallelCount ?? cable?.quantity ?? cable?.qty ?? 1);
  if (!Number.isInteger(physicalCount) || physicalCount !== 1) return { status: 'blocked', coverage: 'incomplete', segments: fieldSegments.map(segment => ({ segmentId: segment.segmentId || 'field', type: 'field', coverage: 'dedicated-emt', installationStatus: 'blocked' })), conduits: [], issues: [{ code: 'ENDPOINT_SINGLE_CABLE_REQUIRED', message: 'Dedicated endpoint EMT screening requires exactly one physical MC cable.', severity: 'blocking' }], assumptions: [] };
  if (!area) return { status: 'blocked', coverage: 'incomplete', segments: fieldSegments.map(segment => ({ segmentId: segment.segmentId || segment.endpointRole || 'field', type: 'field', coverage: 'dedicated-emt', installationStatus: 'blocked' })), conduits: [], issues: [{ code: 'ENDPOINT_CABLE_OD_MISSING', message: 'Endpoint conduit sizing requires sourced cable outside diameter.', severity: 'blocking' }], assumptions: [] };
  const min = sizeIndex(installation.minimumTradeSize || EMT_SIZES[0]); const max = sizeIndex(installation.maximumTradeSize || EMT_SIZES.at(-1));
  const sanitizedCable = { id: cable.id, tag: cable.tag, name: cable.name, cable_od: Number(cable.outerDiameterIn || cable.cable_od || cable.diameter), parallel_count: 1 };
  const selectedSize = EMT_SIZES.slice(min, max + 1).find(size => { const evaluation = evaluateConduitFill({ conduit_id: 'screen', conduit_type: 'EMT', trade_size: size }, [sanitizedCable]); return evaluation.fillLimit === 0.53 && evaluation.fillPercent <= evaluation.fillLimit * 100; });
  if (!selectedSize) return { status: 'blocked', coverage: 'incomplete', segments: fieldSegments.map(segment => ({ segmentId: segment.segmentId || segment.endpointRole || 'field', type: 'field', coverage: 'dedicated-emt', installationStatus: 'blocked' })), conduits: [], issues: [{ code: 'ENDPOINT_CONDUIT_CAPACITY_BLOCKED', message: 'No EMT trade size within the requested bounds satisfies the 53% single-cable fill screen.', severity: 'blocking' }], assumptions: [] };
  const conduits = fieldSegments.map((segment, index) => {
    const role = segment.endpointRole || (String(segment.segmentId || '').includes('source') ? 'source' : String(segment.segmentId || '').includes('destination') ? 'destination' : `field-${index + 1}`); const id = `EC-${text(cable.id || cable.tag || 'cable')}-${role}`;
    return { id, conduit_id: id, tag: id, conduit_type: 'EMT', trade_size: selectedSize, start_x: segment.start?.[0], start_y: segment.start?.[1], start_z: segment.start?.[2], end_x: segment.end?.[0], end_y: segment.end?.[1], end_z: segment.end?.[2], cable_ids: [cable.id || cable.tag] };
  });
  const conduitAreaIn2 = conduitInternalArea('EMT', selectedSize); const fillPercent = (area / conduitAreaIn2) * 100;
  return { status: 'evaluated', coverage: 'complete', segments: fieldSegments.map((segment, index) => ({ segmentId: segment.segmentId || segment.endpointRole || `field-${index + 1}`, type: 'field', coverage: 'dedicated-emt', installationStatus: 'evaluated', conduitId: conduits[index].id, conduitType: 'EMT', tradeSize: selectedSize, cableAreaIn2: area, internalAreaIn2: conduitAreaIn2, fillLimit: 0.53, fillPercent })), conduits, issues: [], assumptions: ['One multiconductor MC cable per dedicated EMT conduit; 53% single-cable fill screen.', 'Screen excludes supports, bends, pulling tension, terminations, hazardous-location suitability, and installation clearances.'] };
}

export default { validateEndpointInstallation, evaluateEndpointInstallation };
