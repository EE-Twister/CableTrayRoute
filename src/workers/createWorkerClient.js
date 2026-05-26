/**
 * createWorkerClient — id-correlated promise wrapper for Web Workers.
 *
 * Each call assigns a monotonically increasing id and stores its resolver in a
 * pending map. The worker echoes the id in its reply so multiple in-flight
 * requests never collide. If the Worker constructor throws (e.g. the runtime
 * has no Worker, or the URL is blocked), the client transparently falls back
 * to running the analysis on the calling thread via the supplied fallback map.
 *
 * Usage (see groundGridClient.js for a concrete instantiation):
 *
 *   const client = createWorkerClient({
 *     workerUrl: 'groundGridWorker.js',
 *     workerType: 'module',
 *     operations: ['analyzeGroundGrid', 'analyzeIrregularGrid'],
 *     fallback: { analyzeGroundGrid, analyzeIrregularGrid },
 *   });
 *   const result = await client.call('analyzeGroundGrid', [params]);
 */

const DEFAULT_VERSION = '1';

function resolveWorkerUrl(workerUrl) {
  if (typeof window !== 'undefined' && window.CTR_VERSION) {
    const sep = workerUrl.includes('?') ? '&' : '?';
    return `${workerUrl}${sep}v=${encodeURIComponent(window.CTR_VERSION || DEFAULT_VERSION)}`;
  }
  return workerUrl;
}

export function createWorkerClient({
  workerUrl,
  workerType = 'module',
  operations = [],
  fallback = {},
  WorkerCtor,
} = {}) {
  if (!workerUrl) throw new Error('createWorkerClient: workerUrl is required');

  const Ctor = WorkerCtor
    || (typeof Worker !== 'undefined' ? Worker : null);

  let worker = null;
  let usingFallback = false;
  let nextId = 1;
  const pending = new Map();

  function rejectAll(err) {
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
  }

  function onMessage(event) {
    const data = event && event.data;
    if (!data || typeof data.id !== 'number') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.type === 'error') {
      entry.reject(new Error(data.error || 'Worker error'));
    } else {
      entry.resolve(data.result);
    }
  }

  function onError(event) {
    const message = (event && (event.message || event.reason)) || 'Worker crashed';
    rejectAll(new Error(message));
    if (worker) {
      try { worker.terminate(); } catch (_) { /* ignore */ }
    }
    worker = null;
    usingFallback = true;
  }

  function ensureWorker() {
    if (usingFallback) return null;
    if (worker) return worker;
    if (!Ctor) {
      usingFallback = true;
      return null;
    }
    try {
      const opts = workerType ? { type: workerType } : undefined;
      worker = new Ctor(resolveWorkerUrl(workerUrl), opts);
    } catch (err) {
      console.warn(`[workerClient] failed to construct worker for ${workerUrl}, using fallback:`, err);
      usingFallback = true;
      worker = null;
      return null;
    }
    worker.onmessage = onMessage;
    worker.onerror = onError;
    if (typeof worker.onmessageerror !== 'undefined') {
      worker.onmessageerror = onError;
    }
    return worker;
  }

  async function call(op, args = []) {
    if (operations.length && !operations.includes(op)) {
      throw new Error(`Unknown worker operation: ${op}`);
    }
    const w = ensureWorker();
    if (!w) {
      const fn = fallback[op];
      if (typeof fn !== 'function') {
        throw new Error(`No worker or fallback available for ${op}`);
      }
      return fn(...args);
    }
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        w.postMessage({ id, op, args });
      } catch (err) {
        pending.delete(id);
        reject(err);
      }
    });
  }

  function terminate() {
    if (worker) {
      try { worker.terminate(); } catch (_) { /* ignore */ }
    }
    worker = null;
    rejectAll(new Error('Worker terminated'));
  }

  function isUsingFallback() {
    return usingFallback;
  }

  return { call, terminate, isUsingFallback };
}

/**
 * Build the message-handler half of a worker. Mirrors thermalWorker.js's
 * `self.onmessage = e => { ... }` shape but dispatches by op name into a
 * map of pure analysis functions and tags each reply with the request id.
 *
 * Usage inside a worker file:
 *
 *   import { handleWorkerMessage } from './src/workers/createWorkerClient.js';
 *   import { analyzeGroundGrid } from './analysis/groundGrid.mjs';
 *   handleWorkerMessage(self, { analyzeGroundGrid });
 */
export function handleWorkerMessage(scope, handlers) {
  if (!scope || typeof scope.postMessage !== 'function') {
    throw new Error('handleWorkerMessage: scope must expose postMessage');
  }
  scope.onmessage = event => {
    const data = event && event.data;
    if (!data || typeof data.id !== 'number') return;
    const { id, op, args } = data;
    const handler = handlers[op];
    if (typeof handler !== 'function') {
      scope.postMessage({ id, type: 'error', error: `Unknown op: ${op}` });
      return;
    }
    try {
      const result = handler(...(args || []));
      Promise.resolve(result).then(
        value => scope.postMessage({ id, type: 'result', result: value }),
        err => scope.postMessage({ id, type: 'error', error: err && err.message || String(err) }),
      );
    } catch (err) {
      scope.postMessage({ id, type: 'error', error: err && err.message || String(err) });
    }
  };
}
