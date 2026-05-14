function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(finite(value) * factor) / factor;
}

function pointFromArray(point) {
  if (!Array.isArray(point) || point.length < 3) return null;
  const values = point.map(value => Number(value));
  if (!values.every(Number.isFinite)) return null;
  return {
    xFt: values[0],
    yFt: values[1],
    zFt: values[2]
  };
}

function traceForIndex(pull, index) {
  return (pull.tension_trace || []).find(trace => trace.index === index) || null;
}

function statusForTension(trace, pull) {
  if (!trace) return 'ok';
  const maxTension = finite(pull.max_tension_lbs, 0);
  const maxSidewall = finite(pull.max_sidewall_pressure, 0);
  if (maxTension && trace.tensionOut >= maxTension * 0.9) return 'warn';
  if (maxSidewall && trace.sidewallPressure >= maxSidewall * 0.9) return 'warn';
  return 'ok';
}

export function buildPullRouteVisualModel(pull = {}) {
  const routeSteps = Array.isArray(pull.route_steps) ? pull.route_steps : [];
  const segments = [];
  const markers = [];
  const callouts = [];
  const warnings = [];
  let exactSegments = 0;

  routeSteps.forEach((step, index) => {
    const start = pointFromArray(step.start);
    const end = pointFromArray(step.end);
    if (!start || !end) return;
    exactSegments++;
    const trace = traceForIndex(pull, index);
    const status = statusForTension(trace, pull);
    segments.push({
      id: `pull-${pull.pull_number}-segment-${index}`,
      kind: 'pull-route',
      className: `pull-route-segment pull-route-segment--${String(step.type || 'field').toLowerCase()}`,
      status,
      label: `${step.step}. ${step.type} ${step.id || ''} ${round(step.length)} ft`,
      start,
      end,
      tensionOut: trace ? round(trace.tensionOut, 1) : null,
      sidewallPressure: trace ? round(trace.sidewallPressure, 1) : null
    });
    callouts.push({
      point: {
        xFt: (start.xFt + end.xFt) / 2,
        yFt: (start.yFt + end.yFt) / 2,
        zFt: (start.zFt + end.zFt) / 2 + 1.2
      },
      label: trace
        ? `${round(step.length)} ft / ${round(trace.tensionOut, 1)} lb`
        : `${round(step.length)} ft`
    });
  });

  if (routeSteps.length && exactSegments !== routeSteps.length) {
    warnings.push('Coordinate data is missing for one or more route segments. Re-export route_data.xlsx after this upgrade for exact 3D pull visuals.');
  }
  if (!routeSteps.length) {
    warnings.push('No route steps are available for this pull.');
  }

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  if (firstSegment) {
    markers.push({
      id: `pull-${pull.pull_number}-start`,
      kind: 'endpoint',
      shape: 'square',
      status: 'ok',
      point: firstSegment.start,
      label: 'Start'
    });
  }
  if (lastSegment) {
    markers.push({
      id: `pull-${pull.pull_number}-end`,
      kind: 'endpoint',
      shape: 'square',
      status: 'ok',
      point: lastSegment.end,
      label: 'End'
    });
  }

  return {
    title: `Pull ${pull.pull_number || ''} isometric route`,
    description: 'Isometric pull route generated from route segment start and end coordinates.',
    segments,
    markers,
    callouts,
    warnings,
    hasCoordinates: routeSteps.length > 0 && exactSegments === routeSteps.length,
    summary: {
      pullNumber: pull.pull_number,
      cableCount: pull.cable_count || 0,
      cableType: pull.cable_type || '',
      totalLengthFt: pull.total_length_ft || 0,
      estimatedTensionLbs: pull.estimated_tension_lbs || 0,
      maxSidewallPressure: pull.max_sidewall_pressure || 0,
      exactSegments,
      segmentCount: routeSteps.length
    }
  };
}
