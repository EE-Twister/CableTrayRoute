const MIN_POSITIVE = 1e-12;
const CURRENT_MATCH_RELATIVE_TOLERANCE = 1e-12;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function currentsMatch(a, b) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * CURRENT_MATCH_RELATIVE_TOLERANCE;
}

export function normalizeTimeCurrentCurve(curve = []) {
  if (!Array.isArray(curve)) return [];
  return curve
    .map((point, sourceIndex) => ({
      current: finitePositive(point?.current),
      time: finitePositive(point?.time),
      sourceIndex,
    }))
    .filter(point => point.current !== null && point.time !== null)
    .sort((a, b) => (a.current - b.current) || (b.time - a.time));
}

function groupByCurrent(points) {
  const groups = [];
  points.forEach(point => {
    const previous = groups.at(-1);
    if (previous && currentsMatch(previous.current, point.current)) {
      previous.points.push(point);
      previous.lowerTime = Math.min(previous.lowerTime, point.time);
      previous.upperTime = Math.max(previous.upperTime, point.time);
      return;
    }
    groups.push({
      current: point.current,
      lowerTime: point.time,
      upperTime: point.time,
      points: [point],
    });
  });
  return groups;
}

function groupTime(group, boundary) {
  return boundary === 'upper' ? group.upperTime : group.lowerTime;
}

function interpolateLogLog(lower, upper, current) {
  // A duplicate-current group represents a vertical segment. Traveling left
  // to right, the preceding segment enters its upper endpoint and the next
  // segment leaves its lower endpoint. Applying the requested exact-point
  // boundary to both interpolation endpoints would make an instantaneous
  // branch influence currents below its pickup.
  const lowerTime = lower.lowerTime;
  const upperTime = upper.upperTime;
  const currentSpan = Math.log(upper.current) - Math.log(lower.current);
  if (!(currentSpan > 0)) return null;
  const fraction = (Math.log(current) - Math.log(lower.current)) / currentSpan;
  const logTime = Math.log(Math.max(lowerTime, MIN_POSITIVE))
    + fraction * (Math.log(Math.max(upperTime, MIN_POSITIVE)) - Math.log(Math.max(lowerTime, MIN_POSITIVE)));
  return Math.exp(logTime);
}

/**
 * Evaluate a time-current curve without silently extrapolating it.
 *
 * `boundary: 'upper'` selects the longest time at duplicate-current points and
 * is appropriate for total-clearing / conservative arc-duration evaluation.
 * `boundary: 'lower'` selects the shortest time and is appropriate for
 * minimum-melt checks. Near-vertical segments remain intact because only
 * numerically identical current coordinates are grouped.
 */
export function evaluateTimeCurrentCurve(curve, current, options = {}) {
  const requestedCurrent = finitePositive(current);
  const boundary = options.boundary === 'upper' ? 'upper' : 'lower';
  const outOfRange = options.outOfRange === 'clamp' ? 'clamp' : 'reject';
  const points = normalizeTimeCurrentCurve(curve);
  const groups = groupByCurrent(points);
  const domain = groups.length
    ? { minimumCurrent: groups[0].current, maximumCurrent: groups.at(-1).current }
    : { minimumCurrent: null, maximumCurrent: null };

  if (requestedCurrent === null) {
    return { time: null, status: 'invalid-current', boundary, domain, sourcePointCount: points.length };
  }
  if (!groups.length) {
    return { time: null, status: 'empty-curve', boundary, domain, sourcePointCount: 0 };
  }

  const first = groups[0];
  const last = groups.at(-1);
  if (requestedCurrent < first.current && !currentsMatch(requestedCurrent, first.current)) {
    return {
      time: outOfRange === 'clamp' ? groupTime(first, boundary) : null,
      status: outOfRange === 'clamp' ? 'clamped-below-domain' : 'below-domain',
      boundary,
      domain,
      sourcePointCount: points.length,
    };
  }
  if (requestedCurrent > last.current && !currentsMatch(requestedCurrent, last.current)) {
    return {
      time: outOfRange === 'clamp' ? groupTime(last, boundary) : null,
      status: outOfRange === 'clamp' ? 'clamped-above-domain' : 'above-domain',
      boundary,
      domain,
      sourcePointCount: points.length,
    };
  }

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (currentsMatch(requestedCurrent, group.current)) {
      return {
        time: groupTime(group, boundary),
        status: group.points.length > 1 ? 'duplicate-current-boundary' : 'exact',
        boundary,
        domain,
        sourcePointCount: points.length,
        matchingPointCount: group.points.length,
      };
    }
    if (requestedCurrent < group.current && index > 0) {
      const time = interpolateLogLog(groups[index - 1], group, requestedCurrent);
      return {
        time,
        status: time === null ? 'invalid-segment' : 'interpolated',
        boundary,
        domain,
        sourcePointCount: points.length,
      };
    }
  }

  return { time: null, status: 'invalid-segment', boundary, domain, sourcePointCount: points.length };
}
