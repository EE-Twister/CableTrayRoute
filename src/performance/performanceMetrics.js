const STORE_KEY = '__CTR_PERFORMANCE__';
const EVENT_NAME = 'ctr:performance-measure';
const MAX_RETAINED_MEASUREMENTS = 200;

function clockNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getStore() {
  if (typeof window === 'undefined') return null;
  if (!window[STORE_KEY]) {
    window[STORE_KEY] = { measurements: [] };
  }
  return window[STORE_KEY];
}

export function recordPerformanceMeasurement(name, durationMs, detail = {}) {
  const measurement = {
    name,
    durationMs: Number(durationMs),
    recordedAt: Date.now(),
    detail: { ...detail },
  };
  const store = getStore();
  if (store) {
    store.measurements.push(measurement);
    if (store.measurements.length > MAX_RETAINED_MEASUREMENTS) {
      store.measurements.splice(0, store.measurements.length - MAX_RETAINED_MEASUREMENTS);
    }
  }
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: measurement }));
  }
  return measurement;
}

export function startPerformanceMeasurement(name, detail = {}) {
  const startedAt = clockNow();
  let completed = false;
  return (completionDetail = {}) => {
    if (completed) return null;
    completed = true;
    return recordPerformanceMeasurement(name, clockNow() - startedAt, {
      ...detail,
      ...completionDetail,
    });
  };
}

export function recordStartupMeasurement(detail = {}) {
  return recordPerformanceMeasurement(
    'ctr.startup',
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0,
    detail,
  );
}

export function getPerformanceMeasurements(name = '') {
  const measurements = getStore()?.measurements || [];
  return name ? measurements.filter(measurement => measurement.name === name) : [...measurements];
}
