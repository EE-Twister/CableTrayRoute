/**
 * Tests for src/collaboration.js — CollabClient and renderPresenceBar.
 *
 * Uses a minimal WebSocket mock so tests run in Node without a browser.
 * Verifies:
 *   - CollabClient connects and sends a join message on open
 *   - Presence events propagate correctly
 *   - Remote patch events propagate correctly
 *   - sendPatch broadcasts the patch
 *   - Intentional disconnect sends leave and closes socket
 *   - renderPresenceBar renders chips and handles edge cases
 */
import assert from 'assert';

// ---------------------------------------------------------------------------
// Minimal DOM / browser stubs (must be set BEFORE module import)
// ---------------------------------------------------------------------------

const WS_OPEN   = 1;
const WS_CLOSING = 2;
const WS_CLOSED  = 3;

class MockWebSocket {
  static OPEN    = WS_OPEN;
  static CLOSING = WS_CLOSING;
  static CLOSED  = WS_CLOSED;
  static _instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = WS_OPEN;
    this.sent = [];
    this._listeners = {};
    MockWebSocket._instances.push(this);
  }

  addEventListener(ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
  }

  send(data) { this.sent.push(JSON.parse(data)); }

  close() {
    this.readyState = WS_CLOSED;
    this._emit('close', {});
  }

  _emit(ev, payload = {}) {
    (this._listeners[ev] || []).forEach(fn => fn(payload));
  }

  _message(data) {
    const ev = { data: JSON.stringify(data) };
    (this._listeners['message'] || []).forEach(fn => fn(ev));
  }
}

// Browser globals required by collaboration.js
globalThis.window   = {};
globalThis.location = { protocol: 'http:', host: 'localhost:3000' };
globalThis.WebSocket = MockWebSocket;

// Import AFTER stubs are in place
const { CollabClient, renderPresenceBar } = await import('../src/collaboration.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

function itAsync(name, fn) {
  return fn().then(
    () => console.log('  \u2713', name),
    err => { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
  );
}

function reset() { MockWebSocket._instances = []; }

function makeClient(opts = {}) {
  return new CollabClient({ projectId: opts.projectId || 'proj-1', username: opts.username || 'alice' });
}

function connectAndOpen(client) {
  client.connect();
  const ws = MockWebSocket._instances.at(-1);
  ws._emit('open');
  return ws;
}

// ---------------------------------------------------------------------------
describe('CollabClient — connect & join', () => {
  it('creates a WebSocket and sends join on open', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    assert.ok(ws, 'WebSocket instance must exist');
    assert.ok(ws.sent.some(m => m.type === 'join' && m.projectId === 'proj-1' && m.username === 'alice'));
  });

  it('second connect() call is a no-op while already open', () => {
    reset();
    const client = makeClient();
    connectAndOpen(client);
    client.connect(); // should not create a second socket
    assert.strictEqual(MockWebSocket._instances.length, 1);
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — presence', () => {
  it('fires presence event with the user list from server', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);

    let received = null;
    client.onPresence(users => { received = users; });
    ws._message({ type: 'presence', users: ['alice', 'bob'] });

    assert.deepStrictEqual(received, ['alice', 'bob']);
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — remote patch', () => {
  it('fires remotePatch with sender and patch payload', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);

    let detail = null;
    client.onRemotePatch(d => { detail = d; });
    ws._message({ type: 'patch', username: 'bob', patch: { cables: [] } });

    assert.ok(detail, 'detail must be set');
    assert.strictEqual(detail.username, 'bob');
    assert.deepStrictEqual(detail.patch, { cables: [] });
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — sendPatch', () => {
  it('sends a patch message when connected', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    client.sendPatch({ cables: [{ id: 'C1' }] });
    const msg = ws.sent.find(m => m.type === 'patch');
    assert.ok(msg, 'patch message must be sent');
    assert.deepStrictEqual(msg.patch, { cables: [{ id: 'C1' }] });
  });

  it('does nothing when not yet connected', () => {
    reset();
    const client = makeClient();
    // Never call connect() — sendPatch should silently no-op
    assert.doesNotThrow(() => client.sendPatch({ cables: [] }));
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — disconnect', () => {
  it('sends leave message and closes the socket', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    client.disconnect();
    assert.ok(ws.sent.some(m => m.type === 'leave'), 'leave message must be sent');
    assert.strictEqual(ws.readyState, WS_CLOSED);
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — connected getter', () => {
  it('returns true when socket is open', () => {
    reset();
    const client = makeClient();
    connectAndOpen(client);
    assert.strictEqual(client.connected, true);
  });

  it('returns false after disconnect', () => {
    reset();
    const client = makeClient();
    connectAndOpen(client);
    client.disconnect();
    assert.strictEqual(client.connected, false);
  });
});

// ---------------------------------------------------------------------------
describe('renderPresenceBar', () => {
  // Minimal element factory
  function makeEl() {
    const el = { textContent: '', className: '', _attrs: {} };
    el.setAttribute = (k, v) => { el._attrs[k] = v; };
    return el;
  }

  it('renders one chip per user', () => {
    const chips = [];
    const container = {
      innerHTML: '',
      setAttribute() {},
      appendChild(el) { chips.push(el); },
    };
    const origDoc = globalThis.document;
    globalThis.document = { createElement: () => makeEl() };

    renderPresenceBar(container, ['alice', 'bob'], 'alice');

    globalThis.document = origDoc;
    assert.strictEqual(chips.length, 2);
    assert.ok(chips[0].textContent.includes('alice'));
    assert.ok(chips[1].textContent.includes('bob'));
  });

  it('marks the current user with "(you)"', () => {
    const chips = [];
    const container = { innerHTML: '', setAttribute() {}, appendChild(el) { chips.push(el); } };
    const origDoc = globalThis.document;
    globalThis.document = { createElement: () => makeEl() };

    renderPresenceBar(container, ['alice'], 'alice');

    globalThis.document = origDoc;
    assert.ok(chips[0].textContent.includes('(you)'));
  });

  it('clears innerHTML for empty user list', () => {
    let cleared = false;
    const container = {
      get innerHTML() { return ''; },
      set innerHTML(v) { if (v === '') cleared = true; },
      setAttribute() {},
    };
    renderPresenceBar(container, [], 'alice');
    assert.ok(cleared, 'innerHTML should be cleared');
  });

  it('handles null container without throwing', () => {
    assert.doesNotThrow(() => renderPresenceBar(null, ['alice'], 'alice'));
  });
});

// ---------------------------------------------------------------------------
describe('CollabClient — sequence numbers & conflict detection', () => {
  it('includes baseSeq in sendPatch message', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    // Simulate server sync on join
    ws._message({ type: 'sync', seq: 5 });
    client.sendPatch({ cables: [] });
    const patchMsg = ws.sent.find(m => m.type === 'patch');
    assert.ok(patchMsg, 'patch message must be sent');
    assert.strictEqual(patchMsg.baseSeq, 5, 'baseSeq must reflect last known seq');
  });

  it('updates lastSeq on sync message', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    ws._message({ type: 'sync', seq: 10 });
    // Send a patch — baseSeq should now be 10
    client.sendPatch({ foo: 1 });
    const patchMsg = ws.sent.find(m => m.type === 'patch');
    assert.strictEqual(patchMsg.baseSeq, 10);
  });

  it('updates lastSeq on ack message', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    ws._message({ type: 'ack', seq: 3 });
    client.sendPatch({ bar: 2 });
    const patchMsg = ws.sent.find(m => m.type === 'patch');
    assert.strictEqual(patchMsg.baseSeq, 3);
  });

  it('fires conflict event when incoming seq has a gap', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    // Start at seq 2
    ws._message({ type: 'sync', seq: 2 });

    let conflict = null;
    client.onConflict(d => { conflict = d; });

    // Next expected seq is 3 but we receive seq 5 — gap of 2
    ws._message({ type: 'patch', username: 'bob', patch: { cables: [] }, seq: 5 });
    assert.ok(conflict, 'conflict event must fire');
    assert.strictEqual(conflict.username, 'bob');
    assert.strictEqual(conflict.gap, 2);
  });

  it('does not fire conflict when seq is consecutive', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    ws._message({ type: 'sync', seq: 0 });

    let conflict = null;
    client.onConflict(d => { conflict = d; });

    ws._message({ type: 'patch', username: 'bob', patch: { x: 1 }, seq: 1 });
    assert.strictEqual(conflict, null, 'no conflict for consecutive seq');
  });

  it('includes seq in remotePatch event detail', () => {
    reset();
    const client = makeClient();
    const ws = connectAndOpen(client);
    ws._message({ type: 'sync', seq: 0 });

    let detail = null;
    client.onRemotePatch(d => { detail = d; });
    ws._message({ type: 'patch', username: 'carol', patch: { y: 2 }, seq: 1 });
    assert.ok(detail);
    assert.strictEqual(detail.seq, 1);
  });
});
