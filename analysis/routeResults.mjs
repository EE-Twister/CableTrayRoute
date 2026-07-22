function text(value) {
  return String(value ?? '').trim();
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function firstValue(record, fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (value !== null && value !== undefined && text(value)) return value;
  }
  return '';
}

function point(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const normalized = value.slice(0, 3).map(Number);
  return normalized.every(Number.isFinite) ? normalized : null;
}

function formatPoint(value) {
  const normalized = point(value);
  return normalized ? `(${normalized.map(number => Number(number.toFixed(2))).join(', ')})` : '';
}

export function routeResultTag(result = {}) {
  return firstValue(result, ['cable', 'tag', 'name', 'id', 'cable_tag', 'cableId']);
}

export function cableRouteTag(cable = {}) {
  return firstValue(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'cable_tag', 'ref']);
}

function routeRows(source) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== 'object') return [];
  for (const key of ['batchResults', 'routeResults', 'latestRouteData', 'results']) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function segmentRacewayId(segment = {}) {
  const id = firstValue(segment, ['tray_id', 'trayId', 'raceway_id', 'racewayId', 'id']);
  return /^(field route|n\/a)$/i.test(text(id)) ? '' : text(id);
}

function normalizeSegmentType(segment = {}, racewayId = '') {
  const raw = text(segment.type || segment.segment_type || segment.raceway_type).toLowerCase();
  if (raw === 'field' || /field route/i.test(text(segment.tray_id))) return 'field';
  if (raw.includes('conduit') || segment.conduit_id || segment.conduitId) return 'conduit';
  if (raw.includes('ductbank') || segment.ductbankTag || segment.ductbank_tag) return 'ductbank';
  if (raw.includes('tray')) return 'tray';
  if (raw && raw !== 'raceway') return raw;
  return racewayId ? 'raceway' : 'field';
}

export function normalizeRouteSegment(segment = {}, index = 0) {
  const racewayId = segmentRacewayId(segment);
  const conduitId = text(firstValue(segment, ['conduit_id', 'conduitId']));
  const ductbankTag = text(firstValue(segment, ['ductbankTag', 'ductbank_tag', 'ductbank_id', 'ductbankId']));
  const start = point(segment.start);
  const end = point(segment.end);
  const type = normalizeSegmentType(segment, racewayId);
  const directLength = finiteNumber(firstValue(segment, ['length', 'length_ft', 'lengthFt']), NaN);
  const geometryLength = start && end
    ? Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2])
    : 0;
  const length = Number.isFinite(directLength) ? directLength : geometryLength;
  const trayId = text(firstValue(segment, ['tray_id', 'trayId'])) || (type === 'tray' ? racewayId : '');

  return {
    ...segment,
    segment: finiteNumber(segment.segment, index + 1),
    type,
    tray_id: type === 'field' ? 'Field Route' : trayId || racewayId,
    raceway_id: racewayId || trayId,
    conduit_id: conduitId,
    ductbankTag,
    start,
    end,
    from: text(segment.from) || formatPoint(start),
    to: text(segment.to) || formatPoint(end),
    length,
    raceway: text(segment.raceway),
  };
}

export function routeResultSucceeded(result = {}) {
  const status = text(result.status);
  if (/fail|error|not routed|x failed/i.test(status)) return false;
  const totalLength = finiteNumber(result.total_length ?? result.totalLength ?? result.length, 0);
  return totalLength > 0
    || Array.isArray(result.breakdown) && result.breakdown.length > 0
    || Array.isArray(result.route_segments) && result.route_segments.length > 0
    || /routed/i.test(status);
}

export function normalizeRouteResult(result = {}, index = 0) {
  const routeSegmentsSource = Array.isArray(result.route_segments) && result.route_segments.length
    ? result.route_segments
    : Array.isArray(result.tray_segments) && result.tray_segments.length
      ? result.tray_segments
      : Array.isArray(result.breakdown)
        ? result.breakdown
        : [];
  const routeSegments = routeSegmentsSource.map(normalizeRouteSegment);
  const breakdownSource = Array.isArray(result.breakdown) && result.breakdown.length
    ? result.breakdown
    : routeSegments;
  const breakdown = breakdownSource.map(normalizeRouteSegment);
  const totalLength = finiteNumber(
    result.total_length ?? result.totalLength ?? result.length,
    routeSegments.reduce((sum, segment) => sum + finiteNumber(segment.length), 0)
  );
  const fieldLength = finiteNumber(
    result.field_length ?? result.fieldLength,
    routeSegments.filter(segment => segment.type === 'field').reduce((sum, segment) => sum + finiteNumber(segment.length), 0)
  );
  const racewaySegments = routeSegments.filter(segment => segment.type !== 'field');

  return {
    ...result,
    cable: text(routeResultTag(result)) || `Route ${index + 1}`,
    status: text(result.status) || (routeSegments.length ? 'Routed' : 'Not routed'),
    mode: text(result.mode || result.route_mode) || 'Saved',
    total_length: totalLength,
    field_length: fieldLength,
    tray_segments_count: finiteNumber(result.tray_segments_count, racewaySegments.length),
    segments_count: finiteNumber(result.segments_count, routeSegments.length),
    tray_segments: Array.isArray(result.tray_segments) && result.tray_segments.length
      ? result.tray_segments.map(normalizeRouteSegment)
      : racewaySegments,
    route_segments: routeSegments,
    breakdown,
    exclusions: Array.isArray(result.exclusions) ? result.exclusions : [],
  };
}

export function normalizeRouteResults(source) {
  return routeRows(source)
    .filter(row => row && typeof row === 'object')
    .map(normalizeRouteResult);
}

export function routedCableNamesFromResults(source) {
  const names = new Set();
  normalizeRouteResults(source)
    .filter(routeResultSucceeded)
    .forEach(result => {
      const tag = routeResultTag(result);
      if (tag) names.add(text(tag));
    });
  return names;
}

function pushCable(map, racewayId, cable) {
  if (!racewayId || !cable) return;
  if (!map[racewayId]) map[racewayId] = [];
  const tag = text(cableRouteTag(cable));
  const conduitId = text(cable.conduit_id || cable.conduitId);
  const exists = map[racewayId].some(existing => {
    const existingTag = text(cableRouteTag(existing));
    const existingConduitId = text(existing.conduit_id || existing.conduitId);
    return existingTag === tag && existingConduitId === conduitId;
  });
  if (!exists) map[racewayId].push(cable);
}

export function buildTrayCableMapFromRouteResults(source, cables = [], existingMap = {}) {
  const map = {};
  if (existingMap && typeof existingMap === 'object' && !Array.isArray(existingMap)) {
    Object.entries(existingMap).forEach(([racewayId, rows]) => {
      map[racewayId] = Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];
    });
  }
  const cableByTag = new Map(
    (Array.isArray(cables) ? cables : [])
      .map(cable => [text(cableRouteTag(cable)).toLowerCase(), cable])
      .filter(([tag]) => tag)
  );

  normalizeRouteResults(source).filter(routeResultSucceeded).forEach(result => {
    const tag = text(routeResultTag(result));
    const cable = cableByTag.get(tag.toLowerCase()) || { name: tag, tag };
    result.route_segments.forEach(segment => {
      if (segment.type === 'field') return;
      const racewayId = text(segment.tray_id || segment.ductbankTag || segment.raceway_id || segment.conduit_id);
      const entry = segment.conduit_id ? { ...cable, conduit_id: segment.conduit_id } : cable;
      pushCable(map, racewayId, entry);
    });
  });
  return map;
}

export function normalizeRouteResultState(source, { cables = [] } = {}) {
  const record = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const screeningCatalog = record.screeningCatalog && typeof record.screeningCatalog === 'object'
    ? record.screeningCatalog
    : {};
  const screeningRecords = record.screeningRecords && typeof record.screeningRecords === 'object'
    ? record.screeningRecords
    : {};
  const hydratedSource = {
    ...record,
    batchResults: routeRows(source).map(result => {
      const screeningEntries = screeningCatalog[result?.screening_ref];
      const exclusions = Array.isArray(screeningEntries)
        ? screeningEntries.map(entry => (
          typeof entry === 'string' ? screeningRecords[entry] : entry
        )).filter(Boolean)
        : null;
      return exclusions
        ? { ...result, exclusions }
        : result;
    })
  };
  const batchResults = normalizeRouteResults(hydratedSource);
  const trayCableMap = buildTrayCableMapFromRouteResults(hydratedSource, cables, record.trayCableMap);
  return {
    ...record,
    schemaVersion: finiteNumber(record.schemaVersion, 1),
    batchResults,
    trayCableMap,
    routedCableNames: Array.from(routedCableNamesFromResults(batchResults)),
  };
}
