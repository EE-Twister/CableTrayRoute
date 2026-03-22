/**
 * Unit tests for attachCollaborationServer() in server.mjs.
 *
 * Uses minimal mock objects for http.Server and WebSocketServer so the tests
 * run in Node without starting a real network server.
 *
 * Verifies:
 *   - upgrade requests to /ws/collab are forwarded to the WSS
 *   - upgrade requests to other paths are rejected (socket destroyed)
 *   - join message creates a room, sends sync, and broadcasts presence
 *   - ping message is answered with pong
 *   - patch is relayed to other clients with an incremented seq, not back to sender
 *   - leave removes the client and broadcasts updated presence
 *   - close event removes the client from the room
 *   - patch before join returns an error message
 */

import assert from 'assert';
import { attachCollaborationServer } from '../src/collaborationServer.mjs';

// ---------------------------------------------------------------------------
// Minimal mock implementations
// ---------------------------------------------------------------------------

const WS_OPEN = 1;
const WS_CLOSED = 3;

class MockWs {
  constructor() {
    this.readyState = WS_OPEN;
    this.sent = [];
    this._listeners = {};
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  on(ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
  }
  _emit(ev, payload) {
    (this._listeners[ev] || []).forEach(fn => fn(payload));
  }
  _receive(obj) {
    this._emit('message', Buffer.from(JSON.stringify(obj)));
  }
  close() {
    this.readyState = WS_CLOSED;
    this._emit('close');
  }
  lastSent() { return this.sent[this.sent.length - 1]; }
  sentOfType(type) { return this.sent.filter(m => m.type === type); }
}

class MockWss {
  constructor() {
    this._handlers = {};
    this._connectionHandler = null;
  }
  on(ev, fn) {
    if (ev === 'connection') this._connectionHandler = fn;
    (this._handlers[ev] = this._handlers[ev] || []).push(fn);
  }
  emit(ev, ...args) {
    (this._handlers[ev] || []).forEach(fn => fn(...args));
  }
  handleUpgrade(request, socket, head, cb) {
    // Immediately invoke callback with a new MockWs
    const ws = new MockWs();
    cb(ws);
    return ws;
  }
}

class MockHttpServer {
  constructor() {
    this._listeners = {};
  }
  on(ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
  }
  _emit(ev, ...args) {
    (this._listeners[ev] || []).forEach(fn => fn(...args));
  }
}

function makeRequest(url) {
  return { url };
}
function makeSocket() {
  return { destroy: () => { this._destroyed = true; }, _destroyed: false };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function setupServer() {
  const httpServer = new MockHttpServer();
  const wss = new MockWss();
  attachCollaborationServer(httpServer, wss);
  return { httpServer, wss };
}

/** Simulate a client connecting via WebSocket */
function connectClient(httpServer, wss) {
  const socket = { destroy() { this.destroyed = true; } };
  const req = makeRequest('http://localhost/ws/collab');
  let capturedWs;
  const origHandleUpgrade = wss.handleUpgrade.bind(wss);
  wss.handleUpgrade = (request, sock, head, cb) => {
    capturedWs = origHandleUpgrade(request, sock, head, cb);
    return capturedWs;
  };
  httpServer._emit('upgrade', req, socket, Buffer.alloc(0));
  // The ws is the one created by MockWss.handleUpgrade and passed to wss connection handler
  // Because handleUpgrade calls cb(ws) and wss.emit('connection', ws, req) is called,
  // we need to capture it via the connection event
  // Actually our MockWss.handleUpgrade invokes cb(ws) which triggers wss.emit('connection',...),
  // so let's grab the last sent ws from the connection event indirectly.
  return capturedWs;
}

/** Open a client and join a project */
function joinClient(httpServer, wss, projectId, username) {
  const ws = connectClient(httpServer, wss);
  ws._receive({ type: 'join', projectId, username });
  return ws;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('attachCollaborationServer — upgrade routing', () => {
  it('forwards /ws/collab upgrades to wss.handleUpgrade', () => {
    const { httpServer, wss } = setupServer();
    let upgraded = false;
    const origHandleUpgrade = wss.handleUpgrade.bind(wss);
    wss.handleUpgrade = (req, socket, head, cb) => {
      upgraded = true;
      origHandleUpgrade(req, socket, head, cb);
    };
    const socket = { destroy() {} };
    httpServer._emit('upgrade', makeRequest('http://localhost/ws/collab'), socket, Buffer.alloc(0));
    assert.ok(upgraded, 'handleUpgrade should be called for /ws/collab');
  });

  it('destroys socket for non-collab paths', () => {
    const { httpServer } = setupServer();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    httpServer._emit('upgrade', makeRequest('http://localhost/other'), socket, Buffer.alloc(0));
    assert.ok(socket.destroyed, 'socket should be destroyed for non-collab path');
  });
});

describe('attachCollaborationServer — ping/pong', () => {
  it('responds to ping with pong', () => {
    const { httpServer, wss } = setupServer();
    const ws = connectClient(httpServer, wss);
    ws._receive({ type: 'ping' });
    assert.deepStrictEqual(ws.lastSent(), { type: 'pong' });
  });
});

describe('attachCollaborationServer — join', () => {
  it('sends sync message on join', () => {
    const { httpServer, wss } = setupServer();
    const ws = joinClient(httpServer, wss, 'proj1', 'alice');
    const sync = ws.sentOfType('sync');
    assert.ok(sync.length >= 1, 'should receive a sync message');
    assert.strictEqual(sync[0].seq, 0, 'initial seq should be 0');
  });

  it('broadcasts presence with joined user after join', () => {
    const { httpServer, wss } = setupServer();
    const ws = joinClient(httpServer, wss, 'proj1', 'alice');
    const presence = ws.sentOfType('presence');
    assert.ok(presence.length >= 1, 'should receive presence broadcast');
    assert.ok(presence[0].users.includes('alice'), 'presence should include alice');
  });

  it('broadcasts updated presence to existing members when second user joins', () => {
    const { httpServer, wss } = setupServer();
    const alice = joinClient(httpServer, wss, 'proj1', 'alice');
    const prevCount = alice.sent.length;
    joinClient(httpServer, wss, 'proj1', 'bob');
    const newPresence = alice.sent.slice(prevCount).filter(m => m.type === 'presence');
    assert.ok(newPresence.length >= 1, 'alice should receive presence update when bob joins');
    assert.ok(newPresence[0].users.includes('bob'), 'presence should include bob');
    assert.ok(newPresence[0].users.includes('alice'), 'presence should still include alice');
  });
});

describe('attachCollaborationServer — patch broadcast', () => {
  it('relays patch to other clients with seq, not back to sender', () => {
    const { httpServer, wss } = setupServer();
    const alice = joinClient(httpServer, wss, 'proj1', 'alice');
    const bob   = joinClient(httpServer, wss, 'proj1', 'bob');

    alice._receive({ type: 'patch', projectId: 'proj1', username: 'alice', patch: { key: 'val' } });

    // Bob should receive the patch
    const bobPatches = bob.sentOfType('patch');
    assert.strictEqual(bobPatches.length, 1);
    assert.deepStrictEqual(bobPatches[0].patch, { key: 'val' });
    assert.strictEqual(bobPatches[0].username, 'alice');
    assert.strictEqual(bobPatches[0].seq, 1, 'first patch should have seq 1');

    // Alice should NOT receive the patch back, but should get an ack
    const alicePatches = alice.sentOfType('patch');
    assert.strictEqual(alicePatches.length, 0, 'sender should not receive own patch');
    const aliceAcks = alice.sentOfType('ack');
    assert.strictEqual(aliceAcks.length, 1, 'sender should receive an ack');
    assert.strictEqual(aliceAcks[0].seq, 1);
  });

  it('increments seq for each successive patch', () => {
    const { httpServer, wss } = setupServer();
    const alice = joinClient(httpServer, wss, 'proj1', 'alice');
    const bob   = joinClient(httpServer, wss, 'proj1', 'bob');

    alice._receive({ type: 'patch', projectId: 'proj1', username: 'alice', patch: { a: 1 } });
    alice._receive({ type: 'patch', projectId: 'proj1', username: 'alice', patch: { b: 2 } });

    const bobPatches = bob.sentOfType('patch');
    assert.strictEqual(bobPatches[0].seq, 1);
    assert.strictEqual(bobPatches[1].seq, 2);
  });

  it('returns error if patch is sent before join', () => {
    const { httpServer, wss } = setupServer();
    const ws = connectClient(httpServer, wss);
    ws._receive({ type: 'patch', projectId: 'proj1', patch: { x: 1 } });
    const errors = ws.sentOfType('error');
    assert.ok(errors.length >= 1, 'should receive error message');
  });
});

describe('attachCollaborationServer — leave', () => {
  it('removes client and broadcasts updated presence on leave', () => {
    const { httpServer, wss } = setupServer();
    const alice = joinClient(httpServer, wss, 'proj1', 'alice');
    const bob   = joinClient(httpServer, wss, 'proj1', 'bob');

    const alicePrevCount = alice.sent.length;
    bob._receive({ type: 'leave', projectId: 'proj1', username: 'bob' });

    const alicePresence = alice.sent.slice(alicePrevCount).filter(m => m.type === 'presence');
    assert.ok(alicePresence.length >= 1, 'alice should receive presence update after bob leaves');
    assert.ok(!alicePresence[0].users.includes('bob'), 'bob should no longer be in presence');
  });
});

describe('attachCollaborationServer — close event', () => {
  it('removes client from room on ws close', () => {
    const { httpServer, wss } = setupServer();
    const alice = joinClient(httpServer, wss, 'proj1', 'alice');
    const bob   = joinClient(httpServer, wss, 'proj1', 'bob');

    const alicePrevCount = alice.sent.length;
    bob.close();

    const alicePresence = alice.sent.slice(alicePrevCount).filter(m => m.type === 'presence');
    assert.ok(alicePresence.length >= 1, 'alice should receive presence update after bob closes');
    assert.ok(!alicePresence[0].users.includes('bob'), 'bob should be absent after close');
  });
});

describe('attachCollaborationServer — invalid JSON', () => {
  it('sends error for malformed JSON', () => {
    const { httpServer, wss } = setupServer();
    const ws = connectClient(httpServer, wss);
    ws._emit('message', Buffer.from('not json'));
    const errors = ws.sentOfType('error');
    assert.ok(errors.length >= 1, 'should return error for invalid JSON');
  });
});
