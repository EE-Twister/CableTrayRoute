const finite = value => typeof value === 'number' && Number.isFinite(value);

function validateAxis(axis, name) {
  if (!axis || !finite(axis.log10ValuePerPoint) || Number(axis.log10ValuePerPoint) === 0
    || !finite(axis.log10ValueIntercept)) {
    throw new TypeError(`${name} axis requires a finite nonzero log10ValuePerPoint and finite log10ValueIntercept`);
  }
}

function coordinateForValue(axis, value) {
  return (Math.log10(value) - axis.log10ValueIntercept) / axis.log10ValuePerPoint;
}

function valueForCoordinate(axis, coordinate) {
  return 10 ** (axis.log10ValuePerPoint * coordinate + axis.log10ValueIntercept);
}

function validateRun(run, index) {
  if (!run || !Array.isArray(run.points) || run.points.length < 2
    || run.points.length > 10000 || typeof run.componentId !== 'string' || !run.componentId.trim()
    || !finite(run.strokeWidthPt) || run.strokeWidthPt < 0
    || !run.points.every(point => finite(point?.xPt) && finite(point?.yPt))) {
    throw new TypeError(`run ${index} requires at least two finite PDF points and a nonnegative strokeWidthPt`);
  }
}

function mergeIntervals(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  sorted.forEach(([start, end]) => {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  });
  return merged;
}

function coveredByUnion(intervals, minimum, maximum) {
  if (minimum === maximum) return intervals.some(([start, end]) => start <= minimum && minimum <= end);
  let cursor = minimum;
  for (const [start, end] of intervals) {
    if (end < cursor) continue;
    if (start > cursor) return false;
    cursor = Math.max(cursor, end);
    if (cursor >= maximum) return true;
  }
  return cursor >= maximum;
}

function segmentIntersections(a, b, xMinimum, xMaximum) {
  const dx = b.xPt - a.xPt;
  if (Math.abs(dx) < 1e-12) {
    return a.xPt >= xMinimum && a.xPt <= xMaximum ? [a.yPt, b.yPt] : [];
  }
  const low = Math.max(Math.min(a.xPt, b.xPt), xMinimum);
  const high = Math.min(Math.max(a.xPt, b.xPt), xMaximum);
  if (low > high) return [];
  const yAt = x => a.yPt + ((x - a.xPt) / dx) * (b.yPt - a.yPt);
  return [yAt(low), yAt(high)];
}

/**
 * Evaluate source polyline runs at a constant RMS current. Inputs use PDF-point
 * coordinates and calibrated log axes. Disconnected runs are never joined.
 * Returns a conservative (longest) time bound or an explicit unavailable status.
 */
export function evaluateSourceBoundCurve({
  runs,
  xAxis,
  yAxis,
  chartBounds,
  currentA,
  voltage,
  supportedVoltages,
  uncertainty = {},
}) {
  validateAxis(xAxis, 'x');
  validateAxis(yAxis, 'y');
  if (!chartBounds || !['xMinPt', 'xMaxPt', 'yMinPt', 'yMaxPt'].every(key => finite(chartBounds[key]))
    || chartBounds.xMaxPt <= chartBounds.xMinPt || chartBounds.yMaxPt <= chartBounds.yMinPt) {
    throw new TypeError('chartBounds requires increasing finite xMinPt, xMaxPt, yMinPt, and yMaxPt');
  }
  if (!Array.isArray(runs) || !runs.length) throw new TypeError('runs must be a nonempty array');
  if (runs.length > 1000 || runs.reduce((sum, run) => sum + (Array.isArray(run?.points) ? run.points.length : 0), 0) > 100000) {
    throw new TypeError('source geometry exceeds bounded evaluation limits');
  }
  runs.forEach(validateRun);
  if (runs.some(run => run.points.some(point => point.xPt < chartBounds.xMinPt - 1e-7 || point.xPt > chartBounds.xMaxPt + 1e-7
    || point.yPt < chartBounds.yMinPt - 1e-7 || point.yPt > chartBounds.yMaxPt + 1e-7))) {
    throw new TypeError('source points must lie within the plotted chart bounds');
  }
  const { flattenPt = 0, gridXPt = 0, gridYPt = 0 } = uncertainty;
  if (![flattenPt, gridXPt, gridYPt].every(value => finite(value) && Number(value) >= 0)) {
    throw new TypeError('uncertainty values must be finite and nonnegative');
  }
  if (!Array.isArray(supportedVoltages) || !supportedVoltages.length) {
    throw new TypeError('supportedVoltages must explicitly list eligible voltages');
  }
  const provenance = runs.map(run => run.componentId);
  const base = { timeSeconds: null, currentA: finite(currentA) ? currentA : null, voltage, provenance,
    resultBasis: 'graphical-plot-reading-only; not manufacturer-approved electrical clearing data' };
  if (!finite(currentA) || Number(currentA) <= 0) return { ...base, status: 'invalid-current' };
  if (!supportedVoltages.includes(voltage)) return { ...base, status: 'unsupported-voltage' };

  const center = coordinateForValue(xAxis, Number(currentA));
  if (!finite(center)) return { ...base, status: 'invalid-axis-transform' };
  const inputUncertainty = flattenPt + gridXPt;
  const requiredMinimum = center - inputUncertainty;
  const requiredMaximum = center + inputUncertainty;
  if (requiredMinimum < chartBounds.xMinPt || requiredMaximum > chartBounds.xMaxPt) {
    return { ...base, status: 'outside-chart-boundary', currentCoordinatePt: center,
      requiredCoordinateBandPt: [requiredMinimum, requiredMaximum] };
  }
  const maximumXPadding = Math.max(...runs.map(run => run.strokeWidthPt / 2 + flattenPt + gridXPt));
  const evaluatedMinimum = requiredMinimum - maximumXPadding;
  const evaluatedMaximum = requiredMaximum + maximumXPadding;
  if (evaluatedMinimum < chartBounds.xMinPt || evaluatedMaximum > chartBounds.xMaxPt) {
    return { ...base, status: 'outside-chart-boundary', currentCoordinatePt: center,
      evaluatedCoordinateBandPt: [evaluatedMinimum, evaluatedMaximum] };
  }
  const centerlineDomains = mergeIntervals(runs.map(run => {
    const xs = run.points.map(point => point.xPt);
    return [Math.min(...xs), Math.max(...xs)];
  }));
  if (!coveredByUnion(centerlineDomains, evaluatedMinimum, evaluatedMaximum)) {
    return { ...base, status: 'outside-or-gap', currentCoordinatePt: center,
      requiredCoordinateBandPt: [requiredMinimum, requiredMaximum],
      evaluatedCoordinateBandPt: [evaluatedMinimum, evaluatedMaximum], eligibleDomainUnionPt: centerlineDomains };
  }

  let longestTime = null;
  let limiting = null;
  const componentResults = [];
  for (const run of runs) {
    const halfStroke = run.strokeWidthPt / 2;
    const xPadding = halfStroke + flattenPt + gridXPt;
    const yPadding = halfStroke + flattenPt + gridYPt;
    const xMinimum = requiredMinimum - xPadding;
    const xMaximum = requiredMaximum + xPadding;
    const runXMinimum = Math.min(...run.points.map(point => point.xPt));
    const runXMaximum = Math.max(...run.points.map(point => point.xPt));
    if (runXMaximum < xMinimum || runXMinimum > xMaximum) continue;
    let minimumY = null;
    let maximumY = null;
    let limitingY = null;
    let limitingSegmentIndex = null;
    for (let index = 1; index < run.points.length; index += 1) {
      const ys = segmentIntersections(run.points[index - 1], run.points[index], xMinimum, xMaximum);
      ys.forEach(y => {
        if (minimumY === null || y < minimumY) minimumY = y;
        if (maximumY === null || y > maximumY) maximumY = y;
        if (limitingY === null || (yAxis.log10ValuePerPoint > 0 ? y > limitingY : y < limitingY)) {
          limitingY = y;
          limitingSegmentIndex = index - 1;
        }
      });
    }
    if (minimumY === null) continue;
    if (minimumY - yPadding <= chartBounds.yMinPt || maximumY + yPadding >= chartBounds.yMaxPt) {
      return { ...base, status: 'outside-chart-boundary', currentCoordinatePt: center,
        componentId: run.componentId ?? null, segmentIndex: limitingSegmentIndex };
    }
    const conservativeY = yAxis.log10ValuePerPoint > 0 ? maximumY + yPadding : minimumY - yPadding;
    const time = valueForCoordinate(yAxis, conservativeY);
    if (!finite(time) || time <= 0) return { ...base, status: 'invalid-axis-transform', currentCoordinatePt: center,
      componentId: run.componentId ?? null, segmentIndex: limitingSegmentIndex };
    const result = { componentId: run.componentId ?? null, segmentIndex: limitingSegmentIndex, timeSeconds: time };
    componentResults.push(result);
    if (longestTime === null || time > longestTime) {
      longestTime = time;
      limiting = result;
    }
  }
  if (longestTime === null) return { ...base, status: 'no-intersection', currentCoordinatePt: center };
  return { ...base, timeSeconds: longestTime, status: 'evaluated-graphical-conservative-envelope',
    currentCoordinatePt: center, requiredCoordinateBandPt: [requiredMinimum, requiredMaximum],
    evaluatedCoordinateBandPt: [evaluatedMinimum, evaluatedMaximum],
    limitingComponentId: limiting.componentId, limitingSegmentIndex: limiting.segmentIndex, componentResults };
}
