function finite(value, fallback = Number.NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parsePoint(row, prefix) {
  const x = finite(row[`${prefix}_x`]);
  const y = finite(row[`${prefix}_y`]);
  const z = finite(row[`${prefix}_z`]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
}

function normalizeHeaderValue(row, keys, fallback = '') {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return fallback;
}

function parseConduitElementId(raw) {
  const text = String(raw || '');
  if (!text.includes(':')) return { ductbankTag: '', conduit_id: text };
  const [ductbankTag, ...rest] = text.split(':');
  return {
    ductbankTag,
    conduit_id: rest.join(':')
  };
}

function normalizeSegment(row) {
  const elementType = String(normalizeHeaderValue(row, ['element_type', 'Element Type', 'type'], 'tray')).trim().toLowerCase();
  const elementId = String(normalizeHeaderValue(row, ['element_id', 'Element ID', 'Raceway ID', 'raceway_id'], '')).trim();
  const start = parsePoint(row, 'start');
  const end = parsePoint(row, 'end');
  const segment = {
    length: finite(normalizeHeaderValue(row, ['length', 'Length (ft)', 'Length'], 0), 0),
    start,
    end,
    coordinateStatus: start && end ? 'exact' : 'missing'
  };

  if (elementType === 'conduit') {
    const parsed = parseConduitElementId(elementId);
    segment.tray_id = '';
    segment.conduit_id = parsed.conduit_id;
    segment.ductbankTag = parsed.ductbankTag;
  } else if (elementType === 'ductbank') {
    segment.tray_id = '';
    segment.ductbankTag = elementId;
  } else if (elementType === 'field') {
    segment.tray_id = 'Field Route';
  } else {
    segment.tray_id = elementId || 'N/A';
  }
  return segment;
}

export function parsePullRouteRows(segmentRows = [], summaryRows = []) {
  const byTag = new Map();
  segmentRows.forEach((row) => {
    const tag = String(normalizeHeaderValue(row, ['cable_tag', 'Cable', 'Cable Tag', 'cable'], '')).trim();
    if (!tag) return;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(row);
  });

  const summaryMap = new Map(summaryRows.map(row => [
    String(normalizeHeaderValue(row, ['cable_tag', 'Cable Tag', 'cable'], '')).trim(),
    row
  ]));

  return Array.from(byTag.entries()).map(([tag, rows]) => {
    const sortedRows = [...rows].sort((a, b) => {
      const aOrder = finite(normalizeHeaderValue(a, ['segment_order', 'Segment Order', 'segment'], 0), 0);
      const bOrder = finite(normalizeHeaderValue(b, ['segment_order', 'Segment Order', 'segment'], 0), 0);
      return aOrder - bOrder;
    });
    const breakdown = sortedRows.map(normalizeSegment);
    const summary = summaryMap.get(tag) || {};
    const totalLength = finite(normalizeHeaderValue(summary, ['total_length', 'Total Length (ft)', 'total_length_ft'], Number.NaN));
    return {
      cable: tag,
      status: 'Routed',
      breakdown,
      route_segments: breakdown.map(segment => ({
        ...segment,
        type: segment.conduit_id ? 'conduit' : segment.tray_id === 'Field Route' ? 'field' : 'tray'
      })),
      total_length: Number.isFinite(totalLength)
        ? totalLength
        : breakdown.reduce((sum, segment) => sum + (finite(segment.length, 0) || 0), 0)
    };
  });
}
