import assert from 'assert';
import { applyLiveReadings, createLivePollingController, evaluateLiveAlarms, exportLiveTrendCsv, formatLiveReading, formatLiveAlarmRule, getLiveReadingAgeSeconds, getLiveTrendMetrics, getLiveTrendSeries, isLiveReadingStale, normalizeLiveTagConfig, parseLiveAlarmRule, summarizeLiveTrend } from '../analysis/liveTagAdapter.mjs';

const config = normalizeLiveTagConfig({ endpoint: 'https://telemetry.test/api', intervalSeconds: 1, mappings: [{ componentId: 'BUS-1', tag: 'sub.bus.1' }] });
assert.strictEqual(config.intervalSeconds, 5);
assert.strictEqual(config.staleAfterSeconds, 30);
assert.strictEqual(config.transport, 'http');
assert.strictEqual(config.reconnect, true);
assert.strictEqual(normalizeLiveTagConfig({ transport: 'websocket' }).transport, 'websocket');
assert.deepStrictEqual(normalizeLiveTagConfig({ reconnectInitialSeconds: 0, reconnectMaxSeconds: 0 }), {
  endpoint: '', transport: 'http', intervalSeconds: 30, staleAfterSeconds: 60, reconnect: true, reconnectInitialSeconds: 1, reconnectMaxSeconds: 1, operatorMode: false, mappings: [], alarms: []
});
const applied = applyLiveReadings({}, { readings: [{ tag: 'sub.bus.1', values: { kv: 13.8, kw: 2450, status: 'closed' }, timestamp: '2026-07-31T00:00:00Z' }] }, config);
assert.strictEqual(applied['BUS-1'].values.kv, 13.8);
assert.strictEqual(applied['BUS-1'].values.status, 'closed');
assert.strictEqual(applied['BUS-1'].trend.length, 1);
assert.match(formatLiveReading(applied['BUS-1'].values), /13.8 kV/);
assert.strictEqual(getLiveReadingAgeSeconds({ timestamp: '2026-07-31T11:59:00Z' }, { now: Date.parse('2026-07-31T12:00:00Z') }), 60);
assert.strictEqual(isLiveReadingStale({ timestamp: '2026-07-31T11:58:59Z' }, { now: Date.parse('2026-07-31T12:00:00Z'), staleAfterSeconds: 60 }), true);
assert.strictEqual(isLiveReadingStale({ timestamp: '2026-07-31T11:59:01Z' }, { now: Date.parse('2026-07-31T12:00:00Z'), staleAfterSeconds: 60 }), false);
assert.deepStrictEqual(parseLiveAlarmRule('BUS.1.kv=12.5..14.5'), { componentId: 'BUS.1', metric: 'kv', low: 12.5, high: 14.5 });
assert.strictEqual(parseLiveAlarmRule('BUS-1.kv=..'), null);
assert.strictEqual(formatLiveAlarmRule({ componentId: 'BUS-1', metric: 'amps', high: 800 }), 'BUS-1.amps=..800');
assert.deepStrictEqual(normalizeLiveTagConfig({ alarms: ['BUS-1.kv=12.5..14.5', 'bad rule'] }).alarms, [{ componentId: 'BUS-1', metric: 'kv', low: 12.5, high: 14.5 }]);
assert.deepStrictEqual(evaluateLiveAlarms({ 'BUS-1': { values: { kv: 14.7, amps: 650 } }, 'LOAD-1': { values: { kw: 42 } } }, { alarms: ['BUS-1.kv=12.5..14.5', 'BUS-1.amps=..600', 'LOAD-1.kw=50..'] }).map(alarm => ({ componentId: alarm.componentId, metric: alarm.metric, direction: alarm.direction, threshold: alarm.threshold })), [
  { componentId: 'BUS-1', metric: 'amps', direction: 'high', threshold: 600 },
  { componentId: 'BUS-1', metric: 'kv', direction: 'high', threshold: 14.5 },
  { componentId: 'LOAD-1', metric: 'kw', direction: 'low', threshold: 50 },
]);
const trendNow = Date.parse('2026-07-31T12:00:00Z');
const trendReading = {
  trend: [
    { timestamp: '2026-07-30T11:59:59Z', kw: 100 },
    { timestamp: '2026-07-31T10:00:00Z', kw: 120, kv: 13.8 },
    { timestamp: '2026-07-31T11:00:00Z', kw: 140, kv: 13.7 },
  ]
};
assert.deepStrictEqual(getLiveTrendMetrics(trendReading), ['kv', 'kw']);
const kwSeries = getLiveTrendSeries(trendReading, 'kw', { now: trendNow });
assert.deepStrictEqual(kwSeries.map(point => point.value), [120, 140]);
assert.deepStrictEqual(summarizeLiveTrend(kwSeries), { minimum: 120, maximum: 140, average: 130, latest: 140, count: 2 });
assert.strictEqual(exportLiveTrendCsv(kwSeries, 'kW'), 'timestamp,kW\r\n2026-07-31T10:00:00.000Z,120\r\n2026-07-31T11:00:00.000Z,140');
let delivered = false;
const controller = createLivePollingController({
  fetchFn: async () => ({ ok: true, json: async () => ({ readings: [{ tag: 'sub.bus.1', values: { kv: 13.7 } }] }) }),
  onReadings: payload => { delivered = payload.readings.length === 1; }
});
await controller.poll(config);
assert.strictEqual(delivered, true);
let socketStatus = '';
let socketPayload = null;
class FakeWebSocket {
  constructor(url) { this.url = url; queueMicrotask(() => this.onopen?.()); }
  close() { this.closed = true; }
  emit(payload) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
const socketController = createLivePollingController({
  WebSocketCtor: FakeWebSocket,
  onReadings: payload => { socketPayload = payload; },
  onStatus: status => { socketStatus = status; }
});
socketController.start({ endpoint: 'wss://telemetry.test/stream', transport: 'websocket' });
await new Promise(resolve => setTimeout(resolve, 0));
assert.strictEqual(socketController.status, 'connected');
assert.strictEqual(socketStatus, 'connected');
socketController.stop();
assert.strictEqual(socketController.status, 'stopped');
let unavailableStatus = '';
const unavailableController = createLivePollingController({ WebSocketCtor: null, onStatus: status => { unavailableStatus = status; } });
unavailableController.start({ endpoint: 'wss://telemetry.test/stream', transport: 'websocket' });
assert.strictEqual(unavailableController.running, false);
assert.strictEqual(unavailableStatus, 'error');
const reconnectTimers = [];
class ReconnectingWebSocket {
  static instances = [];
  constructor(url) { this.url = url; ReconnectingWebSocket.instances.push(this); }
  close() { this.closed = true; }
  emitClose() { this.onclose?.(); }
}
const reconnectController = createLivePollingController({
  WebSocketCtor: ReconnectingWebSocket,
  setTimeoutFn(callback, delay) { const timer = { callback, delay, cleared: false }; reconnectTimers.push(timer); return timer; },
  clearTimeoutFn(timer) { timer.cleared = true; }
});
reconnectController.start({ endpoint: 'wss://telemetry.test/stream', transport: 'websocket', reconnectInitialSeconds: 2, reconnectMaxSeconds: 4 });
ReconnectingWebSocket.instances[0].emitClose();
assert.strictEqual(reconnectController.status, 'reconnecting');
assert.strictEqual(reconnectTimers[0].delay, 2000);
reconnectTimers[0].callback();
assert.strictEqual(ReconnectingWebSocket.instances.length, 2);
ReconnectingWebSocket.instances[1].emitClose();
assert.strictEqual(reconnectTimers[1].delay, 4000);
reconnectController.stop();
assert.strictEqual(reconnectTimers[1].cleared, true);
console.log('live tag adapter tests passed');
