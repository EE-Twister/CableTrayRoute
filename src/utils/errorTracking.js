/**
 * Client-side error tracking.
 *
 * Captures uncaught exceptions and unhandled promise rejections then
 * forwards them to POST /api/errors so they are visible in server logs.
 *
 * Design goals:
 *  - Zero dependencies, tiny footprint.
 *  - Client-side rate limiting: at most MAX_ERRORS_PER_SESSION unique
 *    errors are reported per page session to avoid flooding.
 *  - Network errors while reporting are swallowed silently.
 *  - Never throws; cannot break the host page.
 */

const MAX_ERRORS_PER_SESSION = 20;
const ENDPOINT = '/api/errors';

let reported = 0;
const seen = new Set();

/**
 * Serialize an Error or arbitrary thrown value to a plain object.
 * @param {unknown} err
 * @returns {{ message: string, stack: string|null, name: string }}
 */
function serializeError(err) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack ?? null };
  }
  try {
    return { name: 'UnknownError', message: String(err), stack: null };
  } catch {
    return { name: 'UnknownError', message: '(unserializable)', stack: null };
  }
}

/**
 * Deduplicate by a simple key so the same crash loop doesn't generate
 * thousands of identical reports.
 * @param {string} message
 * @param {string|null|undefined} source
 * @param {number|null|undefined} lineno
 * @returns {boolean} true if this error has already been seen
 */
function isDuplicate(message, source, lineno) {
  const key = `${message}|${source ?? ''}|${lineno ?? ''}`;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/**
 * POST the error payload to the server. Failures are intentionally ignored.
 * @param {object} payload
 */
function send(payload) {
  if (reported >= MAX_ERRORS_PER_SESSION) return;
  reported += 1;

  const body = JSON.stringify({
    ...payload,
    page: globalThis.location?.pathname ?? '',
    userAgent: globalThis.navigator?.userAgent ?? '',
    timestamp: new Date().toISOString(),
  });

  // Prefer sendBeacon (fire-and-forget, survives navigation) when available.
  if (typeof globalThis.navigator?.sendBeacon === 'function') {
    globalThis.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    return;
  }

  // Fall back to fetch (best-effort, no await — intentional).
  globalThis.fetch?.(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // keepalive allows the request to outlive the page.
    keepalive: true,
  }).catch(() => { /* swallow network errors */ });
}

/**
 * Handle a window.onerror event.
 * @type {OnErrorEventHandler}
 */
function onError(message, source, lineno, colno, error) {
  const msg = typeof message === 'string' ? message : String(message);
  if (isDuplicate(msg, source, lineno)) return;
  const serialized = error ? serializeError(error) : { name: 'Error', message: msg, stack: null };
  send({ type: 'uncaught', source: source ?? null, lineno: lineno ?? null, colno: colno ?? null, error: serialized });
}

/**
 * Handle an unhandledrejection event.
 * @param {PromiseRejectionEvent} event
 */
function onUnhandledRejection(event) {
  const serialized = serializeError(event.reason);
  if (isDuplicate(serialized.message, null, null)) return;
  send({ type: 'unhandledrejection', error: serialized });
}

/**
 * Attach global error listeners. Safe to call multiple times (idempotent via
 * the `installed` guard).
 */
let installed = false;
export function installErrorTracking() {
  if (installed || typeof globalThis.addEventListener !== 'function') return;
  installed = true;

  const prevOnError = globalThis.onerror;
  globalThis.onerror = function (message, source, lineno, colno, error) {
    onError(message, source, lineno, colno, error);
    // Preserve any previously installed handler.
    if (typeof prevOnError === 'function') {
      return prevOnError.call(this, message, source, lineno, colno, error);
    }
    return false; // don't suppress the default console output
  };

  globalThis.addEventListener('unhandledrejection', onUnhandledRejection);
}
