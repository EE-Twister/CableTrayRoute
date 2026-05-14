const DEFAULT_TOLERANCE_FT = 2;
const DEFAULT_BEND_SPACING_FT = 8;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(finite(value) * factor) / factor;
}

function normalizePoint(value = {}, fallback = {}) {
  return {
    xFt: round(finite(value.xFt ?? value.x ?? value[0], fallback.xFt ?? fallback.x ?? fallback[0] ?? 0)),
    yFt: round(finite(value.yFt ?? value.y ?? value[1], fallback.yFt ?? fallback.y ?? fallback[1] ?? 0)),
    zFt: round(finite(value.zFt ?? value.z ?? value[2], fallback.zFt ?? fallback.z ?? fallback[2] ?? 0))
  };
}

function addPoint(point, direction, distance) {
  return {
    xFt: round(point.xFt + direction.x * distance),
    yFt: round(point.yFt + direction.y * distance),
    zFt: round(point.zFt + direction.z * distance)
  };
}

function addVector(point, vector) {
  return {
    xFt: round(point.xFt + vector.x),
    yFt: round(point.yFt + vector.y),
    zFt: round(point.zFt + vector.z)
  };
}

function distance(a, b) {
  return Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt, a.zFt - b.zFt);
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function headingVector(headingDeg) {
  const radians = (finite(headingDeg) * Math.PI) / 180;
  return normalizeVector({
    x: Math.cos(radians),
    y: Math.sin(radians),
    z: 0
  });
}

function rotateHorizontal(direction, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return normalizeVector({
    x: direction.x * Math.cos(radians) - direction.y * Math.sin(radians),
    y: direction.x * Math.sin(radians) + direction.y * Math.cos(radians),
    z: direction.z
  });
}

function perpendicular(direction, sign = 1) {
  return normalizeVector({
    x: -direction.y * sign,
    y: direction.x * sign,
    z: 0
  });
}

function directionSign(direction) {
  return direction === 'left' || direction === 'rise' ? 1 : -1;
}

function defaultEndForRun(start, headingDeg, runResult = {}) {
  const bendSpan = (runResult.bends || []).reduce((sum, bend) => {
    const spanIn = Math.max(finite(bend.markSpacing), finite(bend.run), finite(bend.dimension), 12);
    return sum + Math.max(DEFAULT_BEND_SPACING_FT, spanIn / 12);
  }, DEFAULT_BEND_SPACING_FT);
  return addPoint(start, headingVector(headingDeg), Math.max(20, bendSpan + 12));
}

export function defaultBendStationFt(bend, index) {
  const spanIn = Math.max(finite(bend?.markSpacing), finite(bend?.run), finite(bend?.dimension), 12);
  return round((index + 1) * DEFAULT_BEND_SPACING_FT + (spanIn / 24));
}

export function normalizeConduitRunLayout(runInput = {}, runResult = {}, index = 0) {
  const rawLayout = runInput.layout || {};
  const headingDeg = round(finite(rawLayout.headingDeg, 0));
  const start = normalizePoint(rawLayout.start, { xFt: 0, yFt: index * 14, zFt: 0 });
  const end = normalizePoint(rawLayout.end, defaultEndForRun(start, headingDeg, runResult));
  return {
    start,
    end,
    headingDeg,
    endToleranceFt: round(Math.max(0, finite(rawLayout.endToleranceFt, DEFAULT_TOLERANCE_FT)))
  };
}

export function normalizeBendLayout(bendInput = {}, bendResult = {}, index = 0) {
  const rawLayout = bendInput.layout || {};
  const plane = rawLayout.plane === 'vertical' ? 'vertical' : 'horizontal';
  const directionOptions = plane === 'vertical' ? ['rise', 'drop'] : ['left', 'right'];
  const fallbackDirection = plane === 'vertical' ? 'rise' : 'left';
  const direction = directionOptions.includes(rawLayout.direction) ? rawLayout.direction : fallbackDirection;
  return {
    stationFt: round(Math.max(0, finite(rawLayout.stationFt, defaultBendStationFt(bendResult, index)))),
    plane,
    direction
  };
}

function bendLabel(bend) {
  if (!bend) return 'Bend';
  if (bend.type === '90') return '90 deg';
  if (bend.type === 'offset') return `${bend.degrees || ''} deg offset`;
  if (bend.type === 'kick') return `${bend.degrees || ''} deg kick`;
  if (bend.type === 'saddle') return '3-bend saddle';
  return bend.type || 'Bend';
}

function offsetVector(layout, direction, amountFt) {
  const sign = directionSign(layout.direction);
  if (layout.plane === 'vertical') {
    return { x: 0, y: 0, z: amountFt * sign };
  }
  const perp = perpendicular(direction, sign);
  return { x: perp.x * amountFt, y: perp.y * amountFt, z: 0 };
}

function bendSpanFt(bend, minimum = 1) {
  return Math.max(minimum, finite(bend.markSpacing || bend.run || bend.dimension, 12) / 12);
}

function routeLineResidual(current, direction, end) {
  const vector = {
    x: end.xFt - current.xFt,
    y: end.yFt - current.yFt,
    z: end.zFt - current.zFt
  };
  const along = vector.x * direction.x + vector.y * direction.y + vector.z * direction.z;
  const projected = addPoint(current, direction, along);
  return {
    along,
    residualFt: round(distance(projected, end))
  };
}

export function buildConduitRunVisualPath(runResult = {}, runInput = {}, index = 0) {
  const layout = normalizeConduitRunLayout(runInput, runResult, index);
  const segments = [];
  const markers = [];
  const callouts = [];
  const warnings = [];
  let current = { ...layout.start };
  let direction = headingVector(layout.headingDeg);
  let stationCursor = 0;
  let segmentIndex = 0;

  const bendPairs = (runResult.bends || []).map((bend, bendIndex) => ({
    bend,
    input: (runInput.bends || [])[bendIndex] || {},
    layout: normalizeBendLayout((runInput.bends || [])[bendIndex] || {}, bend, bendIndex),
    bendIndex
  })).sort((a, b) => a.layout.stationFt - b.layout.stationFt || a.bendIndex - b.bendIndex);

  for (const pair of bendPairs) {
    const targetStation = pair.layout.stationFt;
    if (targetStation < stationCursor) {
      warnings.push(`${runResult.label || `Run ${index + 1}`}: bend ${pair.bendIndex + 1} station overlaps the prior bend geometry.`);
    }
    const straightDistance = Math.max(0, targetStation - stationCursor);
    if (straightDistance > 0) {
      const next = addPoint(current, direction, straightDistance);
      segments.push({
        id: `run-${index}-segment-${segmentIndex++}`,
        kind: 'run',
        label: `${runResult.label || `Run ${index + 1}`} straight ${round(straightDistance)} ft`,
        start: current,
        end: next,
        status: runResult.nec358_24Pass === false ? 'warn' : 'ok'
      });
      current = next;
      stationCursor += straightDistance;
    }

    const markerId = `run-${index}-bend-${pair.bendIndex}`;
    markers.push({
      id: markerId,
      kind: 'bend',
      shape: pair.bend.type === 'saddle' ? 'diamond' : 'circle',
      status: runResult.nec358_24Pass === false ? 'warn' : 'ok',
      point: current,
      label: `B${pair.bendIndex + 1}`
    });
    callouts.push({
      point: addVector(current, { x: 0, y: 0, z: 1.6 }),
      label: `${bendLabel(pair.bend)} @ ${round(pair.layout.stationFt)} ft`
    });

    if (pair.bend.type === 'offset') {
      const span = bendSpanFt(pair.bend);
      const shift = offsetVector(pair.layout, direction, finite(pair.bend.dimension) / 12);
      const mid = addVector(addPoint(current, direction, span / 2), { x: shift.x / 2, y: shift.y / 2, z: shift.z / 2 });
      const end = addVector(addPoint(current, direction, span), shift);
      segments.push({
        id: `${markerId}-offset-a`,
        kind: 'bend',
        label: `${runResult.label || `Run ${index + 1}`} offset bend`,
        start: current,
        end: mid,
        status: 'active'
      }, {
        id: `${markerId}-offset-b`,
        kind: 'bend',
        label: `${runResult.label || `Run ${index + 1}`} offset return`,
        start: mid,
        end,
        status: 'active'
      });
      current = end;
      stationCursor = Math.max(stationCursor, targetStation) + span;
    } else if (pair.bend.type === 'saddle') {
      const span = bendSpanFt(pair.bend, 2);
      const shift = offsetVector(pair.layout, direction, finite(pair.bend.dimension) / 12);
      const p1 = addVector(addPoint(current, direction, span / 4), shift);
      const p2 = addVector(addPoint(current, direction, span / 2), shift);
      const p3 = addPoint(current, direction, span);
      segments.push({
        id: `${markerId}-saddle-a`,
        kind: 'bend',
        label: 'Saddle rise',
        start: current,
        end: p1,
        status: 'active'
      }, {
        id: `${markerId}-saddle-b`,
        kind: 'bend',
        label: 'Saddle crown',
        start: p1,
        end: p2,
        status: 'active'
      }, {
        id: `${markerId}-saddle-c`,
        kind: 'bend',
        label: 'Saddle return',
        start: p2,
        end: p3,
        status: 'active'
      });
      current = p3;
      stationCursor = Math.max(stationCursor, targetStation) + span;
    } else {
      const angle = finite(pair.bend.degrees, pair.bend.type === '90' ? 90 : finite(pair.input.angle, 30));
      if (pair.layout.plane === 'vertical') {
        const sign = directionSign(pair.layout.direction);
        const horizontal = Math.cos((angle * Math.PI) / 180);
        const vertical = Math.sin((angle * Math.PI) / 180) * sign;
        direction = normalizeVector({ x: direction.x * horizontal, y: direction.y * horizontal, z: vertical });
      } else {
        direction = rotateHorizontal(direction, angle * directionSign(pair.layout.direction));
      }
      stationCursor = Math.max(stationCursor, targetStation);
    }
  }

  const alignment = routeLineResidual(current, direction, layout.end);
  const endpointStatus = alignment.residualFt > layout.endToleranceFt || alignment.along < -layout.endToleranceFt
    ? 'warn'
    : 'ok';
  if (endpointStatus === 'warn') {
    warnings.push(`${runResult.label || `Run ${index + 1}`}: modeled path misses the entered end point by ${alignment.residualFt} ft.`);
  }
  segments.push({
    id: `run-${index}-segment-${segmentIndex++}`,
    kind: 'run',
    label: `${runResult.label || `Run ${index + 1}`} final leg`,
    start: current,
    end: layout.end,
    status: endpointStatus
  });
  markers.unshift({
    id: `run-${index}-start`,
    kind: 'endpoint',
    shape: 'square',
    status: 'ok',
    point: layout.start,
    label: 'Start'
  });
  markers.push({
    id: `run-${index}-end`,
    kind: 'endpoint',
    shape: 'square',
    status: endpointStatus,
    point: layout.end,
    label: 'End'
  });

  return {
    layout,
    segments,
    markers,
    callouts,
    warnings,
    computedEnd: current,
    endpointResidualFt: alignment.residualFt
  };
}

export function normalizePullBoxPosition(input = {}, index = 0) {
  return normalizePoint(input.position, {
    xFt: 8 + index * 8,
    yFt: -8,
    zFt: 0
  });
}

export function buildConduitBendVisualModel(result = {}) {
  const inputs = result._inputs || {};
  const model = {
    title: 'Conduit bend isometric layout',
    description: 'Isometric conduit run, bend, and pull-box layout generated from physical layout fields.',
    segments: [],
    markers: [],
    callouts: [],
    warnings: [],
    summary: {
      runs: (result.runs || []).length,
      bends: (result.runs || []).reduce((sum, run) => sum + (run.bends || []).length, 0),
      pullBoxes: (result.pullBoxResults || []).length,
      hasWarnings: false
    }
  };

  (result.runs || []).forEach((run, index) => {
    const runInput = (inputs.runs || [])[index] || {};
    const path = buildConduitRunVisualPath(run, runInput, index);
    model.segments.push(...path.segments);
    model.markers.push(...path.markers);
    model.callouts.push(...path.callouts);
    model.warnings.push(...path.warnings);
  });

  (inputs.pullBoxes || []).forEach((pullBox, index) => {
    const resultBox = (result.pullBoxResults || [])[index] || {};
    const point = normalizePullBoxPosition(pullBox, index);
    model.markers.push({
      id: `pullbox-${index}`,
      kind: 'pullbox',
      shape: 'diamond',
      status: resultBox.error || resultBox.standardBox?.adequate === false ? 'warn' : 'ok',
      point,
      label: pullBox.label || resultBox.label || `PB${index + 1}`
    });
    model.callouts.push({
      point: addVector(point, { x: 0, y: 0, z: 1.3 }),
      label: pullBox.wallAName || pullBox.wallBName
        ? `${pullBox.wallAName || 'Wall A'} / ${pullBox.wallBName || 'Wall B'}`
        : resultBox.pullType || pullBox.pullType || 'Pull point'
    });
  });

  model.summary.hasWarnings = model.warnings.length > 0
    || (result.runs || []).some(run => run.nec358_24Pass === false)
    || (result.pullBoxResults || []).some(box => box.error || box.standardBox?.adequate === false);
  return model;
}
