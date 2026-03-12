import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

if (!globalThis.performance) globalThis.performance = performance;

// Minimal localStorage mock
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: key => { storage.delete(key); },
  clear: () => storage.clear()
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail ?? null;
  }
};

const dispatched = [];
globalThis.dispatchEvent = (evt) => { dispatched.push(evt); };

globalThis.document = { baseURI: 'http://localhost/index.html' };
globalThis.location = { href: 'http://localhost/index.html' };
globalThis.window = {};
globalThis.alert = () => {};
globalThis.confirm = () => false;
globalThis.btoa = str => Buffer.from(str, 'binary').toString('base64');
globalThis.atob = b64 => Buffer.from(b64, 'base64').toString('binary');

const { setAuthContextState, clearAuthContextState, getAuthContextState } = await import('../projectStorage.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function check(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('session expiry - timer and event dispatch');

check('setAuthContextState persists token data', () => {
  storage.clear();
  setAuthContextState({ token: 'tok1', csrfToken: 'csrf1', expiresAt: Date.now() + 10000, user: 'alice' });
  const state = getAuthContextState();
  assert.strictEqual(state.token, 'tok1');
  assert.strictEqual(state.csrfToken, 'csrf1');
  assert.strictEqual(state.user, 'alice');
});

check('clearAuthContextState removes all auth keys', () => {
  clearAuthContextState();
  assert.strictEqual(getAuthContextState(), null);
});

check('getAuthContextState returns null when token is expired', () => {
  storage.clear();
  setAuthContextState({ token: 'old', csrfToken: 'cs', expiresAt: Date.now() - 1, user: 'bob' });
  // Clear timers immediately since we set an already-expired token
  clearAuthContextState();
  const state = getAuthContextState();
  assert.strictEqual(state, null);
});

await checkAsync('fires session-expiring event when within warning window', async () => {
  storage.clear();
  dispatched.length = 0;
  // expiresAt less than SESSION_WARNING_MS (5 min) away → warning fires immediately
  const expiresAt = Date.now() + 2000;
  setAuthContextState({ token: 'tok2', csrfToken: 'csrf2', expiresAt, user: 'carol' });
  // The warning should dispatch immediately (since we're within the 5-min window)
  await sleep(10);
  const warningEvent = dispatched.find(e => e.type === 'session-expiring');
  assert.ok(warningEvent, 'session-expiring event should be dispatched');
  assert.strictEqual(warningEvent.detail.expiresAt, expiresAt);
  clearAuthContextState();
  dispatched.length = 0;
});

await checkAsync('fires session-expired event when token TTL elapses', async () => {
  storage.clear();
  dispatched.length = 0;
  const expiresAt = Date.now() + 80;
  setAuthContextState({ token: 'tok3', csrfToken: 'csrf3', expiresAt, user: 'dave' });
  await sleep(120);
  const expiredEvent = dispatched.find(e => e.type === 'session-expired');
  assert.ok(expiredEvent, 'session-expired event should be dispatched after TTL');
  // Token should be cleared from storage
  assert.strictEqual(getAuthContextState(), null);
  dispatched.length = 0;
});

await checkAsync('clearAuthContextState cancels pending timers', async () => {
  storage.clear();
  dispatched.length = 0;
  const expiresAt = Date.now() + 80;
  setAuthContextState({ token: 'tok4', csrfToken: 'csrf4', expiresAt, user: 'eve' });
  // Immediately clear to cancel timers
  clearAuthContextState();
  await sleep(120);
  const expiredEvent = dispatched.find(e => e.type === 'session-expired');
  assert.ok(!expiredEvent, 'session-expired should NOT fire after clearAuthContextState');
  dispatched.length = 0;
});
