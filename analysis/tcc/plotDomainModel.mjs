function pushCurveRangeValues(curve, currents, times) {
  (Array.isArray(curve) ? curve : []).forEach(point => {
    if (Number.isFinite(point.current) && point.current > 0) currents.push(point.current);
    if (Number.isFinite(point.time) && point.time > 0) times.push(point.time);
  });
}

export function collectPlotRangeValues({
  preset,
  devicePlots,
  overlays,
  faultCurrentA,
  allCurrents,
  allTimes,
  defaultInrushDuration,
}) {
  const currents = [];
  const times = [];
  const includeDeviceCurves = entries => entries.forEach(entry => {
    pushCurveRangeValues(entry.scaled?.curve, currents, times);
    pushCurveRangeValues(entry.scaled?.minCurve, currents, times);
    pushCurveRangeValues(entry.scaled?.maxCurve, currents, times);
  });
  const includeOverlays = entries => entries.forEach(entry => {
    if (entry.kind === 'inrush') {
      if (entry.current > 0) currents.push(entry.current);
      const duration = entry.normalizedDuration ?? entry.duration ?? defaultInrushDuration;
      if (duration > 0) times.push(duration);
    } else {
      pushCurveRangeValues(entry.curve, currents, times);
    }
  });

  if (preset === 'coordination') {
    includeDeviceCurves(devicePlots);
    if (faultCurrentA > 0) currents.push(faultCurrentA);
  } else if (preset === 'motorStart') {
    includeDeviceCurves(devicePlots);
    includeOverlays(overlays.filter(entry => entry.kind === 'motorStart' || entry.kind === 'motorThermal'));
  } else if (preset === 'transformerInrush') {
    includeDeviceCurves(devicePlots);
    includeOverlays(overlays.filter(entry => entry.kind === 'inrush' || entry.kind === 'transformerDamage'));
  } else if (preset === 'faultCurrent' && faultCurrentA > 0) {
    includeDeviceCurves(devicePlots);
    currents.push(faultCurrentA / 4, faultCurrentA, faultCurrentA * 4);
    times.push(0.001, 0.01, 0.1, 1, 10);
  }

  return {
    currents: currents.length ? currents : allCurrents,
    times: times.length ? times : allTimes,
  };
}

export function resolvePlotDomainsModel(options) {
  const { preset, faultCurrentA } = options;
  const { currents, times } = collectPlotRangeValues(options);
  const minCurrent = Math.min(...currents) || 1;
  const maxCurrent = Math.max(...currents) || minCurrent * 10;
  const minTime = Math.min(...times) || 0.01;
  const maxTime = Math.max(...times) || minTime * 10;
  let currentDomain = [Math.max(minCurrent / 1.5, 0.01), Math.max(maxCurrent * 1.5, minCurrent * 1.2)];
  let timeDomain = [Math.max(minTime / 1.5, 0.001), Math.max(maxTime * 1.3, minTime * 2)];

  if (preset === 'faultCurrent' && faultCurrentA > 0) {
    currentDomain = [Math.max(faultCurrentA / 5, 0.01), Math.max(faultCurrentA * 5, faultCurrentA + 1)];
    timeDomain = [0.001, Math.max(10, maxTime * 1.2)];
  } else if (preset === 'motorStart') {
    timeDomain[0] = Math.min(timeDomain[0], 0.01);
    timeDomain[1] = Math.max(timeDomain[1], 30);
  } else if (preset === 'transformerInrush') {
    timeDomain[0] = Math.min(timeDomain[0], 0.001);
    timeDomain[1] = Math.max(timeDomain[1], 2);
  }

  return { currentDomain, timeDomain };
}
