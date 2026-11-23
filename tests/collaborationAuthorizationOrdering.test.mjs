import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachCollaborationServer } from '../src/collaborationServer.mjs';

class Socket extends EventEmitter {
  readyState = 1;
  messages = [];
  send(data) { this.messages.push(JSON.parse(data)); }
  receive(data) { this.emit('message', Buffer.from(JSON.stringify(data))); }
  close(code) { this.closeCode = code; this.readyState = 3; this.emit('close'); }
}
const http = new EventEmitter();
const wss = new EventEmitter();
attachCollaborationServer(http, wss, { validateUpgrade: () => true });
let subscriberActive = true;
function connect(subscriber = false) {
  const ws = new Socket();
  const identity = { username: 'owner', async authorize() {
    await new Promise(resolve => setTimeout(resolve, 1));
    return (!subscriber || subscriberActive) ? { canWrite: true } : null;
  } };
  wss.emit('connection', ws, { collaborationIdentity: identity });
  return ws;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
const a = connect();
const b = connect(true);
a.receive({ type: 'join', projectId: 'P' });
b.receive({ type: 'join', projectId: 'P' });
await settle();
a.messages = [];
b.messages = [];
// Both frames arrive before asynchronous session authorization completes.
a.receive({ type: 'patch', patch: { value: 'A' } });
b.receive({ type: 'patch', patch: { value: 'B' } });
await settle();
assert.deepEqual(a.messages.filter(message => message.seq).map(message => message.seq), [1, 2]);
assert.deepEqual(b.messages.filter(message => message.seq).map(message => message.seq), [1, 2]);
assert.deepEqual(b.messages.map(message => message.type), ['patch', 'ack']);
// A room switch must not create a second outbound queue that overtakes a patch.
a.receive({ type: 'patch', patch: { value: 'old-room' } });
b.receive({ type: 'join', projectId: 'Q' });
await settle();
const bLast = b.messages.filter(message => message.type === 'patch' || message.type === 'sync').slice(-2);
assert.deepEqual(bLast.map(message => message.type), ['patch', 'sync']);
// Revoked idle recipients may not receive a subsequent owner's patch.
b.receive({ type: 'join', projectId: 'P' });
await settle();
b.messages = [];
subscriberActive = false;
a.receive({ type: 'patch', patch: { secret: 'not-for-revoked-session' } });
await settle();
assert.equal(b.closeCode, 1008);
assert.equal(b.messages.length, 0);
console.log('✓ asynchronous authorization preserves patch/ack/room-switch order and rejects revoked idle recipients');
