import { evaluateTimeCurrentCurve, normalizeTimeCurrentCurve } from '../timeCurrentCurve.mjs';

function protectiveCheckCurve(entry, mode) {
  if (!entry?.scaled) return [];
  if (mode === 'rideThrough') {
    return entry.scaled.minCurve?.length ? entry.scaled.minCurve : (entry.scaled.curve || []);
  }
  return entry.scaled.maxCurve?.length ? entry.scaled.maxCurve : (entry.scaled.curve || []);
}

function reviewConstraint(overlay, entry, reason, curve = [], extra = {}) {
  const points = normalizeTimeCurrentCurve(curve);
  const domain = points.length
    ? { minimumCurrentA: points[0].current, maximumCurrentA: points.at(-1).current }
    : { minimumCurrentA: null, maximumCurrentA: null };
  return {
    kind: extra.kind || (overlay?.kind === 'inrush' || overlay?.kind === 'motorStart' ? 'rideThrough' : 'damageLimit'),
    status: 'review',
    screeningStatus: 'unknown',
    reason,
    comparison: extra.comparison || null,
    curveBoundary: extra.curveBoundary || null,
    coverage: {
      status: 'incomplete',
      ...domain,
      requiredCurrentRangeA: extra.requiredCurrentRangeA ?? (Number.isFinite(extra.current) ? { minimumCurrentA: extra.current, maximumCurrentA: extra.current } : null),
      availableCurrentRangeA: extra.availableCurrentRangeA ?? (domain.minimumCurrentA === null ? null : domain),
      evaluatedCurrentRangeA: null,
      intervalsEvaluated: 0
    },
    overlay,
    entry: entry || null,
    current: extra.current ?? null,
    duration: extra.duration ?? null,
    tripTime: null,
    margin: null,
    ...(extra.point ? { point: extra.point } : {}),
    ...(extra.limitingComparison ? { limitingComparison: extra.limitingComparison } : {})
  };
}

function validCurve(points) {
  return Array.isArray(points) && points.length > 0 && points.every(point => (
    typeof point?.current === 'number' && Number.isFinite(point.current) && point.current > 0
    && typeof point?.time === 'number' && Number.isFinite(point.time) && point.time > 0
  ));
}

function groupCurve(points) {
  const normalized = normalizeTimeCurrentCurve(points);
  const groups = [];
  normalized.forEach(point => {
    const previous = groups.at(-1);
    const scale = Math.max(Math.abs(previous?.current || 0), Math.abs(point.current), 1);
    if (previous && Math.abs(previous.current - point.current) <= scale * 1e-12) {
      previous.lowerTime = Math.min(previous.lowerTime, point.time);
      previous.upperTime = Math.max(previous.upperTime, point.time);
    } else {
      groups.push({ current: point.current, lowerTime: point.time, upperTime: point.time });
    }
  });
  return groups;
}

function segmentAt(groups, current) {
  for (let index = 1; index < groups.length; index += 1) {
    const lower = groups[index - 1];
    const upper = groups[index];
    if (current > lower.current && current < upper.current) {
      const x0 = Math.log(lower.current);
      const x1 = Math.log(upper.current);
      const y0 = Math.log(lower.lowerTime);
      const y1 = Math.log(upper.upperTime);
      const slope = (y1 - y0) / (x1 - x0);
      return { slope, intercept: y0 - slope * x0 };
    }
  }
  return null;
}

function comparisonAt(current, damageCurve, protectiveCurve) {
  const damage = evaluateTimeCurrentCurve(damageCurve, current, { boundary: 'lower', outOfRange: 'reject' });
  const protective = evaluateTimeCurrentCurve(protectiveCurve, current, { boundary: 'upper', outOfRange: 'reject' });
  if (!Number.isFinite(damage.time) || !Number.isFinite(protective.time)) return null;
  return {
    currentA: current,
    damageLimitTimeS: damage.time,
    protectiveUpperTimeS: protective.time,
    marginS: damage.time - protective.time
  };
}

function evaluateContinuousDamage(damageCurve, protectiveCurve) {
  const damageGroups = groupCurve(damageCurve);
  const protectiveGroups = groupCurve(protectiveCurve);
  if (!damageGroups.length || !protectiveGroups.length) return { status: 'incomplete', reason: 'curve-comparison-incomplete' };

  const minimumCurrentA = damageGroups[0].current;
  const maximumCurrentA = damageGroups.at(-1).current;
  if (minimumCurrentA < protectiveGroups[0].current || maximumCurrentA > protectiveGroups.at(-1).current) {
    return {
      status: 'incomplete',
      reason: 'curve-domain-incomplete',
      requiredCurrentRangeA: { minimumCurrentA, maximumCurrentA },
      availableCurrentRangeA: { minimumCurrentA: protectiveGroups[0].current, maximumCurrentA: protectiveGroups.at(-1).current }
    };
  }

  const knots = [...new Set([
    minimumCurrentA,
    maximumCurrentA,
    ...damageGroups.map(group => group.current).filter(current => current > minimumCurrentA && current < maximumCurrentA),
    ...protectiveGroups.map(group => group.current).filter(current => current > minimumCurrentA && current < maximumCurrentA)
  ])].sort((a, b) => a - b);
  const candidates = new Map();
  const addCandidate = current => {
    if (!(Number.isFinite(current) && current >= minimumCurrentA && current <= maximumCurrentA)) return;
    const result = comparisonAt(current, damageCurve, protectiveCurve);
    if (result) candidates.set(current, result);
  };
  knots.forEach(addCandidate);

  for (let index = 1; index < knots.length; index += 1) {
    const lowerCurrent = knots[index - 1];
    const upperCurrent = knots[index];
    const midpoint = Math.sqrt(lowerCurrent * upperCurrent);
    const damageSegment = segmentAt(damageGroups, midpoint);
    const protectiveSegment = segmentAt(protectiveGroups, midpoint);
    if (!damageSegment || !protectiveSegment) return { status: 'incomplete', reason: 'curve-comparison-incomplete' };
    const { slope: damageSlope, intercept: damageIntercept } = damageSegment;
    const { slope: protectiveSlope, intercept: protectiveIntercept } = protectiveSegment;
    if (damageSlope * protectiveSlope <= 0 || damageSlope === protectiveSlope) continue;
    const logRatio = Math.log(protectiveSlope / damageSlope) + protectiveIntercept - damageIntercept;
    if (!Number.isFinite(logRatio)) continue;
    const criticalLogCurrent = logRatio / (damageSlope - protectiveSlope);
    const criticalCurrent = Math.exp(criticalLogCurrent);
    if (criticalCurrent > lowerCurrent && criticalCurrent < upperCurrent) addCandidate(criticalCurrent);
  }

  const values = [...candidates.values()];
  if (!values.length) return { status: 'incomplete', reason: 'curve-comparison-incomplete' };
  const worst = values.reduce((minimum, item) => !minimum || item.marginS < minimum.marginS ? item : minimum, null);
  return {
    status: 'complete',
    minimumCurrentA,
    maximumCurrentA,
    availableCurrentRangeA: { minimumCurrentA: protectiveGroups[0].current, maximumCurrentA: protectiveGroups.at(-1).current },
    evaluatedCurrentRangeA: { minimumCurrentA, maximumCurrentA },
    intervalsEvaluated: Math.max(0, knots.length - 1),
    candidateCount: values.length,
    limitingComparison: worst
  };
}

export function evaluateRideThroughConstraint(overlay, protectiveEntry) {
  const current = overlay?.current ?? overlay?.lockedRotor;
  const duration = overlay?.normalizedDuration ?? overlay?.duration ?? overlay?.startTime;
  const entry = Array.isArray(protectiveEntry) ? protectiveEntry[0] : protectiveEntry;
  const curve = protectiveCheckCurve(entry, 'rideThrough');
  const extra = { kind: 'rideThrough', comparison: 'minimum-trip-vs-start-duration', curveBoundary: 'lower', current, duration };
  if (!(typeof current === 'number' && Number.isFinite(current) && current > 0
    && typeof duration === 'number' && Number.isFinite(duration) && duration > 0)) {
    return reviewConstraint(overlay, entry, 'invalid-constraint-input', curve, extra);
  }
  if (!entry) return reviewConstraint(overlay, null, 'associated-device-missing', curve, extra);
  if (!validCurve(curve)) return reviewConstraint(overlay, entry, 'empty-protective-curve', curve, extra);
  const evaluated = evaluateTimeCurrentCurve(curve, current, { boundary: 'lower', outOfRange: 'reject' });
  if (!Number.isFinite(evaluated.time)) return reviewConstraint(overlay, entry, 'curve-domain-incomplete', curve, extra);
  const tripTime = evaluated.time;
  const margin = tripTime - duration;
  return {
    kind: 'rideThrough',
    status: margin > 0 ? 'ok' : 'warning',
    screeningStatus: 'evaluated',
    comparison: extra.comparison,
    curveBoundary: extra.curveBoundary,
    coverage: {
      status: 'complete',
      minimumCurrentA: evaluated.domain.minimumCurrent,
      maximumCurrentA: evaluated.domain.maximumCurrent,
      requiredCurrentRangeA: { minimumCurrentA: current, maximumCurrentA: current },
      availableCurrentRangeA: { minimumCurrentA: evaluated.domain.minimumCurrent, maximumCurrentA: evaluated.domain.maximumCurrent },
      evaluatedCurrentRangeA: { minimumCurrentA: current, maximumCurrentA: current },
      intervalsEvaluated: 0
    },
    overlay,
    current,
    duration,
    entry,
    tripTime,
    margin
  };
}

export function evaluateDamageLimitConstraint(overlay, protectiveEntry) {
  const entry = Array.isArray(protectiveEntry) ? protectiveEntry[0] : protectiveEntry;
  const protectiveCurve = protectiveCheckCurve(entry, 'damage');
  const damageCurve = overlay?.curve;
  const damageGroups = validCurve(damageCurve) ? groupCurve(damageCurve) : [];
  const requiredCurrentRangeA = damageGroups.length
    ? { minimumCurrentA: damageGroups[0].current, maximumCurrentA: damageGroups.at(-1).current }
    : null;
  const extra = { kind: 'damageLimit', comparison: 'damage-limit-vs-upper-protective-curve', curveBoundary: 'upper' };
  if (!validCurve(damageCurve)) return reviewConstraint(overlay, entry, 'invalid-constraint-input', protectiveCurve, extra);
  if (!entry) return reviewConstraint(overlay, null, 'associated-device-missing', protectiveCurve, { ...extra, requiredCurrentRangeA });
  if (!validCurve(protectiveCurve)) return reviewConstraint(overlay, entry, 'empty-protective-curve', protectiveCurve, { ...extra, requiredCurrentRangeA });
  const comparison = evaluateContinuousDamage(damageCurve, protectiveCurve);
  if (comparison.status !== 'complete') return reviewConstraint(overlay, entry, comparison.reason, protectiveCurve, {
    ...extra,
    requiredCurrentRangeA: comparison.requiredCurrentRangeA,
    availableCurrentRangeA: comparison.availableCurrentRangeA
  });
  const limitingComparison = comparison.limitingComparison;
  const point = damageCurve.find(item => item.current === limitingComparison.currentA && item.time === limitingComparison.damageLimitTimeS)
    || { current: limitingComparison.currentA, time: limitingComparison.damageLimitTimeS };
  const margin = limitingComparison.marginS;
  return {
    kind: 'damageLimit',
    status: margin >= 0 ? 'ok' : 'warning',
    screeningStatus: 'evaluated',
    comparison: extra.comparison,
    curveBoundary: extra.curveBoundary,
    coverage: {
      status: 'complete',
      minimumCurrentA: comparison.minimumCurrentA,
      maximumCurrentA: comparison.maximumCurrentA,
      requiredCurrentRangeA: comparison.evaluatedCurrentRangeA,
      availableCurrentRangeA: comparison.availableCurrentRangeA,
      evaluatedCurrentRangeA: comparison.evaluatedCurrentRangeA,
      intervalsEvaluated: comparison.intervalsEvaluated,
      candidateCount: comparison.candidateCount
    },
    overlay,
    entry,
    tripTime: limitingComparison.protectiveUpperTimeS,
    margin,
    point,
    limitingComparison,
    limitation: 'Curve semantics and device operation/clearing applicability are not established by this comparison.'
  };
}
