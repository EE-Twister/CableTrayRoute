export const CUSTOM_CURVE_DEFAULT_AXES = Object.freeze({
  currentMin: 10,
  currentMax: 10000,
  timeMin: 0.01,
  timeMax: 100
});

export const CUSTOM_CURVE_DEFAULT_BOUNDS = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });

export function formatCustomCurveValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(3);
}

export function clampCustomCurveValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function generateCustomCurveLogGrid(min, max) {
  if (!(Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min)) {
    return { major: [], minor: [] };
  }
  const major = [];
  const minor = [];
  const minExp = Math.floor(Math.log10(min));
  const maxExp = Math.ceil(Math.log10(max));
  for (let exp = minExp; exp <= maxExp; exp++) {
    for (let digit = 1; digit < 10; digit += 1) {
      const value = digit * 10 ** exp;
      if (value < min || value > max) continue;
      if (digit === 1) major.push(value);
      else minor.push(value);
    }
  }
  return {
    major: Array.from(new Set(major)).sort((a, b) => a - b),
    minor: Array.from(new Set(minor)).sort((a, b) => a - b)
  };
}

export function readCustomCurveAxes(axisInputs, axes = {}) {
  const values = { ...CUSTOM_CURVE_DEFAULT_AXES, ...axes };
  let valid = true;
  Object.keys(CUSTOM_CURVE_DEFAULT_AXES).forEach(key => {
    const input = axisInputs?.[key];
    if (!input) return;
    const parsed = Number(input.value);
    if (Number.isFinite(parsed) && parsed > 0) values[key] = parsed;
    else valid = false;
  });
  if (!(values.currentMin > 0 && values.currentMax > values.currentMin)) valid = false;
  if (!(values.timeMin > 0 && values.timeMax > values.timeMin)) valid = false;
  return { values, valid };
}

export function readCustomCurveBounds(boundInputs, bounds = {}) {
  const values = { ...CUSTOM_CURVE_DEFAULT_BOUNDS, ...bounds };
  Object.keys(CUSTOM_CURVE_DEFAULT_BOUNDS).forEach(key => {
    const input = boundInputs?.[key];
    if (!input) return;
    const parsed = Number(input.value);
    if (Number.isFinite(parsed) && parsed >= 0) values[key] = parsed;
  });
  return values;
}

export function computeCustomCurvePlotMetrics({ canvas, axisValues, axisValid, bounds }) {
  if (!canvas) {
    return {
      axisValues,
      axisValid,
      bounds,
      width: 0,
      height: 0,
      plotLeft: 0,
      plotTop: 0,
      plotWidth: 0,
      plotHeight: 0
    };
  }
  const width = canvas.width || 720;
  const height = canvas.height || 480;
  const left = clampCustomCurveValue(bounds.left, 0, width - 40);
  const right = clampCustomCurveValue(bounds.right, 0, width - left - 20);
  const top = clampCustomCurveValue(bounds.top, 0, height - 40);
  const bottom = clampCustomCurveValue(bounds.bottom, 0, height - top - 20);
  return {
    axisValues,
    axisValid,
    bounds: { left, right, top, bottom },
    width,
    height,
    plotLeft: left,
    plotTop: top,
    plotWidth: Math.max(width - left - right, 40),
    plotHeight: Math.max(height - top - bottom, 40)
  };
}

export function customCurveDataToPixel(point, metrics) {
  if (!metrics || !metrics.axisValid) return null;
  const axis = metrics.axisValues || {};
  const currentMin = Number(axis.currentMin);
  const currentMax = Number(axis.currentMax);
  const timeMin = Number(axis.timeMin);
  const timeMax = Number(axis.timeMax);
  if (!(currentMin > 0 && currentMax > currentMin && timeMin > 0 && timeMax > timeMin)) return null;
  const current = Number(point.current);
  const time = Number(point.time);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(time) || time <= 0) return null;
  const currentRange = Math.log(currentMax / currentMin);
  const timeRange = Math.log(timeMin / timeMax);
  if (!Number.isFinite(currentRange) || currentRange <= 0) return null;
  if (!Number.isFinite(timeRange) || timeRange >= 0) return null;
  const normalizedX = clampCustomCurveValue(Math.log(current / currentMin) / currentRange, 0, 1);
  const normalizedY = clampCustomCurveValue(Math.log(time / timeMax) / timeRange, 0, 1);
  return {
    x: metrics.plotLeft + normalizedX * metrics.plotWidth,
    y: metrics.plotTop + normalizedY * metrics.plotHeight
  };
}

export function customCurvePixelToData(x, y, metrics) {
  if (!metrics || !metrics.axisValid) return null;
  const axis = metrics.axisValues || {};
  const currentMin = Number(axis.currentMin);
  const currentMax = Number(axis.currentMax);
  const timeMin = Number(axis.timeMin);
  const timeMax = Number(axis.timeMax);
  if (!(currentMin > 0 && currentMax > currentMin && timeMin > 0 && timeMax > timeMin)) return null;
  const currentRange = Math.log(currentMax / currentMin);
  const timeRange = Math.log(timeMin / timeMax);
  if (!Number.isFinite(currentRange) || currentRange <= 0) return null;
  if (!Number.isFinite(timeRange) || timeRange >= 0) return null;
  const normalizedX = clampCustomCurveValue((x - metrics.plotLeft) / metrics.plotWidth, 0, 1);
  const normalizedY = clampCustomCurveValue((y - metrics.plotTop) / metrics.plotHeight, 0, 1);
  return {
    current: currentMin * Math.exp(currentRange * normalizedX),
    time: timeMax * Math.exp(timeRange * normalizedY)
  };
}
