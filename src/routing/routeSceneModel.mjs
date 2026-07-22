const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const dimension = String(value ?? '').trim().replace(/["”]/g, '');
  const mixedFraction = dimension.match(/^(-?\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const sign = Number(mixedFraction[1]) < 0 ? -1 : 1;
    const whole = Math.abs(Number(mixedFraction[1]));
    const denominator = Number(mixedFraction[3]);
    if (denominator) return sign * (whole + (Number(mixedFraction[2]) / denominator));
  }
  const fraction = dimension.match(/^(-?\d+)\/(\d+)$/);
  if (fraction && Number(fraction[2])) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = Number.parseFloat(dimension);
  return Number.isFinite(decimal) ? decimal : fallback;
};

const normalizePoint = point => {
  if (!Array.isArray(point) || point.length < 3) return null;
  const normalized = point.slice(0, 3).map(value => finiteNumber(value, NaN));
  return normalized.every(Number.isFinite) ? normalized : null;
};

const pointFromRecord = (record, prefix) => normalizePoint([
  record?.[`${prefix}_x`],
  record?.[`${prefix}_y`],
  record?.[`${prefix}_z`]
]);

const normalizePath = (record = {}) => {
  const supplied = Array.isArray(record.path)
    ? record.path
    : Array.isArray(record.outline)
      ? record.outline
      : [];
  const path = supplied.map(normalizePoint).filter(Boolean);
  if (path.length >= 2) return path;
  const start = pointFromRecord(record, 'start');
  const end = pointFromRecord(record, 'end');
  return start && end ? [start, end] : [];
};

const normalizeRacewayKind = value => {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'conduit') return 'conduit';
  if (kind === 'ductbank' || kind === 'duct bank') return 'ductbank';
  return 'tray';
};

const normalizeCableGroup = value => String(value || '').trim().toUpperCase();

const racewayIdentifier = (record = {}, fallback = '') => String(
  record.tray_id
    || record.conduit_id
    || record.ductbank_id
    || record.tag
    || record.id
    || fallback
).trim();

const racewayUtilization = raceway => {
  const explicit = finiteNumber(raceway.utilizationPct ?? raceway.utilization_pct, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const fill = Array.isArray(raceway.slotFills)
    ? raceway.slotFills.reduce((sum, value) => sum + finiteNumber(value), 0)
    : finiteNumber(raceway.current_fill);
  const maximum = finiteNumber(raceway.maxFill ?? raceway.max_fill)
    * Math.max(1, finiteNumber(raceway.numSlots ?? raceway.num_slots, 1));
  return maximum > 0 ? Math.max(0, Math.min(100, (fill / maximum) * 100)) : 0;
};

const normalizeRaceway = (record = {}, fallbackId = '') => {
  const kind = normalizeRacewayKind(record.raceway_type || record.kind || record.type);
  const id = racewayIdentifier(record, fallbackId);
  return {
    id,
    kind,
    parentId: kind === 'conduit'
      ? String(record.ductbankTag || record.ductbank_tag || record.parentId || '').trim()
      : '',
    path: normalizePath(record),
    widthIn: finiteNumber(record.width ?? record.inside_width, kind === 'ductbank' ? 24 : 12),
    heightIn: finiteNumber(record.height ?? record.tray_depth, kind === 'ductbank' ? 24 : 4),
    diameterIn: finiteNumber(record.diameter ?? record.trade_size ?? (kind === 'conduit' ? record.width : 0), kind === 'conduit' ? 1 : 0),
    material: String(record.material || record.conduit_material || record.conduit_type || record.type || '').trim(),
    shape: String(record.shape || 'STR').trim(),
    allowedGroup: normalizeCableGroup(
      record.allowed_cable_group
        || record.allowedCableGroup
        || record.voltage_class
        || record.voltageClass
        || record.cable_class
        || record.cableClass
    ),
    utilizationPct: racewayUtilization(record),
    source: record
  };
};

const normalizeDuctbanks = ductbanks => {
  const raceways = [];
  (Array.isArray(ductbanks) ? ductbanks : []).forEach((ductbank, index) => {
    const ductbankId = racewayIdentifier(ductbank, `DUCTBANK-${index + 1}`);
    const conduits = Array.isArray(ductbank.conduits) ? ductbank.conduits : [];
    const columnCount = Math.max(1, ...conduits.map(conduit => finiteNumber(conduit.column ?? conduit.col, 1)));
    const rowCount = Math.max(1, ...conduits.map(conduit => finiteNumber(conduit.row, 1)));
    const largestDiameter = Math.max(1, ...conduits.map(conduit => finiteNumber(conduit.diameter ?? conduit.trade_size, 1)));
    const pitchIn = Math.max(largestDiameter + 3, finiteNumber(ductbank.conduit_spacing ?? ductbank.spacing, 0));
    const conduitGroups = [...new Set(conduits.map(conduit => normalizeCableGroup(
      conduit.allowed_cable_group || conduit.allowedCableGroup || conduit.voltage_class || conduit.voltageClass
    )).filter(Boolean))];
    const ductbankGroup = normalizeCableGroup(
      ductbank.allowed_cable_group || ductbank.allowedCableGroup || ductbank.voltage_class || ductbank.voltageClass
    ) || (conduitGroups.length === 1 ? conduitGroups[0] : '');
    const inferredWidth = Math.max(18, columnCount * pitchIn + 6);
    const inferredHeight = Math.max(18, rowCount * pitchIn + 6);
    let envelopePath = normalizePath(ductbank);
    const outline = Array.isArray(ductbank.outline) ? ductbank.outline.map(normalizePoint).filter(Boolean) : [];
    const closedOutline = outline.length > 3 && outline[0].every((value, axis) => (
      Math.abs(value - outline.at(-1)[axis]) < 1e-6
    ));
    if (closedOutline) {
      const xs = outline.map(point => point[0]);
      const ys = outline.map(point => point[1]);
      const zs = outline.map(point => point[2]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const centerZ = zs.reduce((sum, value) => sum + value, 0) / zs.length;
      envelopePath = (maxX - minX) >= (maxY - minY)
        ? [[minX, centerY, centerZ], [maxX, centerY, centerZ]]
        : [[centerX, minY, centerZ], [centerX, maxY, centerZ]];
    }
    const envelope = normalizeRaceway({
      ...ductbank,
      tray_id: ductbankId,
      width: ductbank.width ?? ductbank.inside_width ?? inferredWidth,
      height: ductbank.height ?? ductbank.depth ?? inferredHeight,
      path: envelopePath,
      allowed_cable_group: ductbankGroup,
      raceway_type: 'ductbank'
    }, ductbankId);
    raceways.push(envelope);
    conduits.forEach((conduit, conduitIndex) => {
      const conduitId = racewayIdentifier(conduit, `${ductbankId}-C${conduitIndex + 1}`);
      const suppliedPath = normalizePath(conduit);
      const envelopePath = envelope.path;
      const sharesEnvelopeCenterline = suppliedPath.length === envelopePath.length
        && suppliedPath.every((point, pointIndex) => point.every((value, axis) => (
          Math.abs(value - envelopePath[pointIndex][axis]) < 1e-6
        )));
      const shouldInferPlacement = suppliedPath.length < 2 || sharesEnvelopeCenterline;
      const column = Math.max(1, finiteNumber(conduit.column ?? conduit.col, (conduitIndex % columnCount) + 1));
      const row = Math.max(1, finiteNumber(conduit.row, Math.floor(conduitIndex / columnCount) + 1));
      const lateralOffsetFt = ((column - 1) - ((columnCount - 1) / 2)) * pitchIn / 12;
      const verticalOffsetFt = (((rowCount - 1) / 2) - (row - 1)) * pitchIn / 12;
      const offsetPath = shouldInferPlacement && envelopePath.length >= 2
        ? envelopePath.map((point, pointIndex) => {
          const adjacent = pointIndex < envelopePath.length - 1
            ? envelopePath[pointIndex + 1]
            : envelopePath[pointIndex - 1];
          const dx = adjacent[0] - point[0];
          const dy = adjacent[1] - point[1];
          const horizontalLength = Math.hypot(dx, dy);
          const lateral = horizontalLength > 1e-6 ? [-dy / horizontalLength, dx / horizontalLength] : [1, 0];
          return [
            point[0] + lateral[0] * lateralOffsetFt,
            point[1] + lateral[1] * lateralOffsetFt,
            point[2] + verticalOffsetFt
          ];
        })
        : suppliedPath;
      raceways.push(normalizeRaceway({
        ...conduit,
        tray_id: conduit.tag || conduit.tray_id || conduit.conduit_id || conduit.id || conduitId,
        conduit_id: conduit.conduit_id || conduit.id || conduitId,
        ductbankTag: ductbankId,
        raceway_type: 'conduit',
        path: offsetPath
      }));
      raceways.at(-1).geometrySource = shouldInferPlacement ? 'inferred-arrangement' : 'supplied';
      raceways.at(-1).arrangement = { row, column, rowCount, columnCount };
    });
  });
  return raceways;
};

const segmentLength = segment => {
  const explicit = finiteNumber(segment?.length, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const start = normalizePoint(segment?.start);
  const end = normalizePoint(segment?.end);
  if (!start || !end) return 0;
  return Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
};

const normalizedDirection = segment => {
  const start = normalizePoint(segment?.start);
  const end = normalizePoint(segment?.end);
  if (!start || !end) return null;
  const direction = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(...direction);
  return length > 1e-6 ? direction.map(value => value / length) : null;
};

const directionsDiffer = (first, second) => {
  if (!first || !second) return false;
  const dot = Math.abs(first[0] * second[0] + first[1] * second[1] + first[2] * second[2]);
  return dot < 0.999;
};

const containmentForSegment = (segment, racewayMap) => {
  if (String(segment?.type || '').toLowerCase() === 'field') return 'field';
  const racewayId = String(segment?.raceway_id || segment?.tray_id || segment?.conduit_id || '').trim();
  const raceway = racewayMap.get(racewayId);
  if (raceway?.kind === 'conduit' && raceway.parentId) return 'ductbank';
  if (raceway?.kind) return raceway.kind;
  if (segment?.ductbankTag) return 'ductbank';
  if (segment?.conduit_id) return 'conduit';
  return 'tray';
};

export function buildRouteMetrics(route = {}, raceways = []) {
  const racewayMap = new Map(raceways.map(raceway => [raceway.id, raceway]));
  const rawSegments = route.route_segments || route.segments || [];
  const metrics = {
    total: 0,
    tray: 0,
    conduit: 0,
    ductbank: 0,
    field: 0,
    bends: 0,
    segmentCount: rawSegments.length,
    racewayCount: 0,
    maxUtilizationPct: 0
  };
  metrics.utilizationKnown = false;
  const usedRaceways = new Set();
  let previousDirection = null;
  rawSegments.forEach(segment => {
    const length = segmentLength(segment);
    const containment = containmentForSegment(segment, racewayMap);
    metrics.total += length;
    metrics[containment] += length;
    const direction = normalizedDirection(segment);
    if (directionsDiffer(previousDirection, direction)) metrics.bends += 1;
    if (direction) previousDirection = direction;
    const racewayId = String(segment.raceway_id || segment.tray_id || segment.conduit_id || '').trim();
    if (racewayId && containment !== 'field') {
      usedRaceways.add(racewayId);
      metrics.maxUtilizationPct = Math.max(
        metrics.maxUtilizationPct,
        racewayMap.get(racewayId)?.utilizationPct || 0
      );
      const source = racewayMap.get(racewayId)?.source || {};
      if (source.maxFill != null || source.max_fill != null || source.utilizationPct != null || source.utilization_pct != null) {
        metrics.utilizationKnown = true;
      }
    }
  });
  metrics.racewayCount = usedRaceways.size;
  metrics.inRacewayPct = metrics.total > 0
    ? ((metrics.total - metrics.field) / metrics.total) * 100
    : 0;
  return metrics;
}

export function buildRouteDecisionScore(route = {}, raceways = []) {
  const metrics = buildRouteMetrics(route, raceways);
  const segments = route.route_segments || route.segments || [];
  const first = segments.find(segment => normalizePoint(segment.start));
  const last = [...segments].reverse().find(segment => normalizePoint(segment.end));
  const straightLength = first && last
    ? segmentLength({ start: first.start, end: last.end })
    : 0;
  const length = metrics.total > 0 ? Math.min(100, (straightLength / metrics.total) * 100) : 0;
  const containment = metrics.inRacewayPct;
  const capacity = metrics.utilizationKnown ? Math.max(0, 100 - metrics.maxUtilizationPct) : 75;
  const bends = Math.max(0, 100 - metrics.bends * 8);
  const overall = Math.round(length * 0.3 + containment * 0.3 + capacity * 0.25 + bends * 0.15);
  return {
    overall,
    length,
    containment,
    capacity,
    bends,
    straightLength,
    metrics,
    grade: overall >= 85 ? 'Excellent' : overall >= 70 ? 'Good' : overall >= 55 ? 'Review' : 'High attention'
  };
}

export function buildRouteSceneModel({ raceways = [], ductbanks = [], routes = [] } = {}) {
  const normalized = [];
  const seen = new Map();
  const addRaceway = raceway => {
    if (!raceway.id || raceway.path.length < 2) return;
    if (seen.has(raceway.id)) {
      const existing = normalized[seen.get(raceway.id)];
      existing.utilizationPct = Math.max(existing.utilizationPct, raceway.utilizationPct);
      if (!existing.material && raceway.material) existing.material = raceway.material;
      if (!existing.allowedGroup && raceway.allowedGroup) existing.allowedGroup = raceway.allowedGroup;
      return;
    }
    seen.set(raceway.id, normalized.length);
    normalized.push(raceway);
  };
  normalizeDuctbanks(ductbanks).forEach(addRaceway);
  (Array.isArray(raceways) ? raceways : []).forEach((raceway, index) => {
    addRaceway(normalizeRaceway(raceway, `RACEWAY-${index + 1}`));
  });
  const racewayMap = new Map(normalized.map(raceway => [raceway.id, raceway]));
  const normalizedRoutes = (Array.isArray(routes) ? routes : []).map((route, routeIndex) => {
    const segments = (route.route_segments || route.segments || [])
      .map(segment => {
        const start = normalizePoint(segment.start);
        const end = normalizePoint(segment.end);
        if (!start || !end) return null;
        const racewayId = String(segment.raceway_id || segment.tray_id || segment.conduit_id || '').trim();
        const raceway = racewayMap.get(racewayId);
        const sourcePath = raceway ? normalizePath(raceway.source) : [];
        const offset = raceway?.geometrySource === 'inferred-arrangement' && sourcePath.length && raceway.path.length
          ? raceway.path[0].map((value, axis) => value - sourcePath[0][axis])
          : [0, 0, 0];
        return {
          ...segment,
          start,
          end,
          racewayId,
          containmentType: containmentForSegment(segment, racewayMap),
          length: segmentLength(segment),
          displayStart: start.map((value, axis) => value + offset[axis]),
          displayEnd: end.map((value, axis) => value + offset[axis])
        };
      })
      .filter(segment => segment && segment.length > 0.000001);
    const normalizedRoute = {
      ...route,
      index: routeIndex,
      id: String(route.id || route.cable || route.label || `ROUTE-${routeIndex + 1}`),
      label: String(route.label || route.cable || `Route ${routeIndex + 1}`),
      allowedGroup: normalizeCableGroup(
        route.allowed_cable_group || route.allowedCableGroup || route.voltage_class || route.voltageClass
      ),
      segments
    };
    normalizedRoute.metrics = buildRouteMetrics({ segments }, normalized);
    return normalizedRoute;
  });
  return {
    raceways: normalized,
    racewayMap,
    routes: normalizedRoutes
  };
}

export { containmentForSegment, normalizePoint, segmentLength };
