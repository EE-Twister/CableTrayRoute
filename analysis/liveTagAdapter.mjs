/** Browser-safe, read-only live-tag adapter helpers. */

const MAX_TREND_POINTS = 1440;
export const LIVE_TREND_WINDOW_MS = 24 * 60 * 60 * 1000;

function text(value) { return String(value ?? '').trim(); }

function csvCell(value) {
  const cell = String(value ?? '');
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || text(value) === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLiveAlarmRule(rule = {}) {
  const componentId = text(rule.componentId);
  const metric = text(rule.metric);
  const low = finiteOrNull(rule.low);
  const high = finiteOrNull(rule.high);
  if (!componentId || !metric || (low === null && high === null) || (low !== null && high !== null && low > high)) return null;
  return { componentId, metric, low, high };
}

export function parseLiveAlarmRule(value) {
  const [target, range, ...extra] = text(value).split('=');
  if (!target || !range || extra.length) return null;
  const separator = target.lastIndexOf('.');
  if (separator < 1 || separator === target.length - 1) return null;
  const [lowValue, highValue, ...extraBounds] = range.split('..');
  if (extraBounds.length) return null;
  return normalizeLiveAlarmRule({
    componentId: target.slice(0, separator),
    metric: target.slice(separator + 1),
    low: text(lowValue) ? lowValue : null,
    high: text(highValue) ? highValue : null,
  });
}

export function formatLiveAlarmRule(rule = {}) {
  const normalized = normalizeLiveAlarmRule(rule);
  if (!normalized) return '';
  return `${normalized.componentId}.${normalized.metric}=${normalized.low ?? ''}..${normalized.high ?? ''}`;
}

export function normalizeLiveTagConfig(config = {}) {
  const intervalSeconds = Number(config.intervalSeconds);
  const reconnectInitialSeconds = Number(config.reconnectInitialSeconds);
  const reconnectMaxSeconds = Number(config.reconnectMaxSeconds);
  const staleAfterSeconds = Number(config.staleAfterSeconds);
  const transport = text(config.transport).toLowerCase() === 'websocket' ? 'websocket' : 'http';
  const normalizedIntervalSeconds = Number.isFinite(intervalSeconds) ? Math.min(3600, Math.max(5, intervalSeconds)) : 30;
  const normalizedReconnectInitialSeconds = Number.isFinite(reconnectInitialSeconds) ? Math.min(300, Math.max(1, reconnectInitialSeconds)) : 5;
  return {
    endpoint: text(config.endpoint),
    transport,
    intervalSeconds: normalizedIntervalSeconds,
    staleAfterSeconds: Number.isFinite(staleAfterSeconds) ? Math.min(86400, Math.max(5, staleAfterSeconds)) : Math.max(30, normalizedIntervalSeconds * 2),
    reconnect: config.reconnect !== false,
    reconnectInitialSeconds: normalizedReconnectInitialSeconds,
    reconnectMaxSeconds: Number.isFinite(reconnectMaxSeconds) ? Math.min(3600, Math.max(normalizedReconnectInitialSeconds, reconnectMaxSeconds)) : 60,
    operatorMode: Boolean(config.operatorMode),
    mappings: Array.isArray(config.mappings) ? config.mappings.map(mapping => ({
      componentId: text(mapping?.componentId), tag: text(mapping?.tag || mapping?.componentId),
    })).filter(mapping => mapping.componentId && mapping.tag) : [],
    alarms: Array.isArray(config.alarms) ? config.alarms.map(rule => typeof rule === 'string' ? parseLiveAlarmRule(rule) : normalizeLiveAlarmRule(rule)).filter(Boolean) : [],
  };
}

export function normalizeLivePayload(payload = {}) {
  const readings = Array.isArray(payload) ? payload : (Array.isArray(payload?.readings) ? payload.readings : []);
  return readings.map(reading => ({
    tag: text(reading?.tag || reading?.id || reading?.componentId),
    values: reading?.values && typeof reading.values === 'object' ? reading.values : reading,
    timestamp: text(reading?.timestamp) || new Date().toISOString(),
  })).filter(reading => reading.tag);
}

export function applyLiveReadings(previous = {}, payload, config = {}) {
  const normalized = normalizeLiveTagConfig(config);
  const mappingByTag = new Map(normalized.mappings.map(mapping => [mapping.tag, mapping.componentId]));
  const next = { ...previous };
  normalizeLivePayload(payload).forEach(reading => {
    const componentId = mappingByTag.get(reading.tag) || reading.values.componentId || reading.tag;
    if (!componentId) return;
    const prior = next[componentId] || { values: {}, trend: [] };
    const values = Object.fromEntries(Object.entries(reading.values || {}).filter(([key, value]) => key !== 'tag' && key !== 'id' && key !== 'componentId' && (Number.isFinite(Number(value)) || (key === 'status' && typeof value === 'string' && value.trim()))));
    const point = { timestamp: reading.timestamp, ...values };
    next[componentId] = { values: { ...prior.values, ...values }, timestamp: reading.timestamp, trend: [...(prior.trend || []), point].slice(-MAX_TREND_POINTS) };
  });
  return next;
}

export function formatLiveReading(values = {}) {
  const labels = [['kw', 'kW'], ['kvar', 'kVAR'], ['kv', 'kV'], ['voltage', 'V'], ['amps', 'A'], ['status', '']];
  const lines = labels.flatMap(([key, unit]) => values[key] === undefined ? [] : [`${values[key]}${unit ? ` ${unit}` : ''}`]);
  return lines.slice(0, 3).join(' · ');
}

export function getLiveReadingAgeSeconds(reading = {}, { now = Date.now() } = {}) {
  const timestamp = Date.parse(reading?.timestamp);
  const reference = Number(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return null;
  return Math.max(0, (reference - timestamp) / 1000);
}

export function isLiveReadingStale(reading = {}, { now = Date.now(), staleAfterSeconds = 60 } = {}) {
  if (!reading || typeof reading !== 'object') return false;
  const ageSeconds = getLiveReadingAgeSeconds(reading, { now });
  if (ageSeconds === null) return true;
  const threshold = Number(staleAfterSeconds);
  return ageSeconds > (Number.isFinite(threshold) && threshold > 0 ? threshold : 60);
}

export function evaluateLiveAlarms(readings = {}, config = {}) {
  const alarms = normalizeLiveTagConfig(config).alarms;
  return alarms.flatMap(rule => {
    const value = finiteOrNull(readings?.[rule.componentId]?.values?.[rule.metric]);
    if (value === null) return [];
    if (rule.low !== null && value < rule.low) {
      return [{ ...rule, value, direction: 'low', threshold: rule.low, message: `${rule.componentId} ${rule.metric} is below ${rule.low} (${value}).` }];
    }
    if (rule.high !== null && value > rule.high) {
      return [{ ...rule, value, direction: 'high', threshold: rule.high, message: `${rule.componentId} ${rule.metric} is above ${rule.high} (${value}).` }];
    }
    return [];
  }).sort((left, right) => left.componentId.localeCompare(right.componentId) || left.metric.localeCompare(right.metric));
}

export function getLiveTrendMetrics(reading = {}) {
  const metrics = new Set();
  (reading?.trend || []).forEach(point => {
    Object.entries(point || {}).forEach(([key, value]) => {
      if (key !== 'timestamp' && Number.isFinite(Number(value))) metrics.add(key);
    });
  });
  return Array.from(metrics).sort();
}

export function getLiveTrendSeries(reading = {}, metric, { now = Date.now(), windowMs = LIVE_TREND_WINDOW_MS } = {}) {
  const end = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const start = end - Math.max(0, Number(windowMs) || 0);
  return (reading?.trend || []).map(point => ({ timestamp: Date.parse(point?.timestamp), value: Number(point?.[metric]) }))
    .filter(point => Number.isFinite(point.timestamp) && point.timestamp >= start && point.timestamp <= end && Number.isFinite(point.value))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function summarizeLiveTrend(series = []) {
  if (!series.length) return null;
  const values = series.map(point => point.value);
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((total, value) => total + value, 0) / values.length,
    latest: values.at(-1),
    count: values.length,
  };
}

export function exportLiveTrendCsv(series = [], metric = 'value') {
  const column = text(metric) || 'value';
  const rows = (Array.isArray(series) ? series : []).filter(point => Number.isFinite(point?.timestamp) && Number.isFinite(point?.value));
  return [`timestamp,${csvCell(column)}`, ...rows.map(point => `${new Date(point.timestamp).toISOString()},${point.value}`)].join('\r\n');
}

export function createLivePollingController({ fetchFn = fetch, WebSocketCtor = globalThis.WebSocket, setIntervalFn = setInterval, clearIntervalFn = clearInterval, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, onReadings = () => {}, onError = () => {}, onStatus = () => {} } = {}) {
  let timer = null;
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let activeConfig = null;
  let running = false;
  let status = 'stopped';
  const setStatus = next => { status = next; onStatus(status); };
  const clearReconnect = () => {
    if (reconnectTimer !== null) clearTimeoutFn(reconnectTimer);
    reconnectTimer = null;
  };
  const scheduleReconnect = normalized => {
    if (!running || !normalized?.reconnect || reconnectTimer !== null) return;
    const delaySeconds = Math.min(normalized.reconnectMaxSeconds, normalized.reconnectInitialSeconds * (2 ** reconnectAttempts));
    reconnectAttempts += 1;
    setStatus('reconnecting');
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      if (running) connectWebSocket(normalized);
    }, delaySeconds * 1000);
  };
  const connectWebSocket = normalized => {
    if (typeof WebSocketCtor !== 'function') {
      onError(new Error('WebSocket is not available in this browser'));
      running = false;
      setStatus('error');
      return;
    }
    setStatus(reconnectAttempts ? 'reconnecting' : 'connecting');
    try {
      const nextSocket = new WebSocketCtor(normalized.endpoint);
      socket = nextSocket;
      nextSocket.onopen = () => {
        if (!running || socket !== nextSocket) return;
        reconnectAttempts = 0;
        setStatus('connected');
      };
      nextSocket.onmessage = event => {
        try { onReadings(JSON.parse(event.data), normalized); } catch { onError(new Error('Telemetry WebSocket sent invalid JSON')); }
      };
      nextSocket.onerror = () => {
        if (!running || socket !== nextSocket) return;
        onError(new Error('Telemetry WebSocket connection failed'));
        setStatus('error');
        try { nextSocket.close(); } catch { /* Browser closes failed sockets automatically. */ }
        scheduleReconnect(normalized);
      };
      nextSocket.onclose = () => {
        if (socket === nextSocket) socket = null;
        if (!running) return;
        setStatus('disconnected');
        scheduleReconnect(normalized);
      };
    } catch (error) {
      onError(error);
      setStatus('error');
      scheduleReconnect(normalized);
    }
  };
  async function poll(config) {
    const normalized = normalizeLiveTagConfig(config);
    if (!normalized.endpoint) return null;
    try {
      const response = await fetchFn(normalized.endpoint, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`Telemetry endpoint returned HTTP ${response.status}`);
      const payload = await response.json();
      onReadings(payload, normalized);
      if (running) setStatus('connected');
      return payload;
    } catch (error) {
      onError(error);
      if (running) setStatus('error');
      return null;
    }
  }
  return {
    start(config) {
      this.stop(); running = true;
      const normalized = normalizeLiveTagConfig(config);
      if (normalized.transport !== 'websocket') {
        activeConfig = null;
        setStatus('connecting');
        poll(normalized).then(payload => { if (running && payload) setStatus('connected'); });
        timer = setIntervalFn(() => poll(normalized), normalized.intervalSeconds * 1000);
        return;
      }
      activeConfig = normalized;
      connectWebSocket(normalized);
    },
    stop() {
      if (timer) clearIntervalFn(timer);
      timer = null;
      clearReconnect();
      if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); }
      socket = null;
      activeConfig = null;
      reconnectAttempts = 0;
      running = false;
      setStatus('stopped');
    },
    poll,
    get running() { return running; },
    get status() { return status; }
  };
}
