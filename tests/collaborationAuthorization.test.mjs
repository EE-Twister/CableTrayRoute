import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createApp } from '../server.mjs';
import { attachCollaborationServer } from '../src/collaborationServer.mjs';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-collab-authorization-'));
const sockets = [];
let server;
let wss;
let base;
async function start() {
  const app = await createApp({ dataDir, enforceHttps: false, rateLimit: { max: 500, windowMs: 60000 } });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  return app;
}
async function request(url, data, session, method = 'POST') {
  return fetch(base + url, { method, headers: {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.token}`, 'X-CSRF-Token': session.csrfToken } : {}),
  }, body: JSON.stringify(data) });
}
async function login(username) {
  const response = await request('/login', { username, password: 'SecurityFixture123!' });
  assert.equal(response.status, 200);
  return response.json();
}
async function connect(session, legacy = false) {
  let protocols;
  if (legacy) protocols = ['ctr-collab', `auth.${Buffer.from(session.token).toString('base64url')}`, `csrf.${session.csrfToken}`];
  else {
    const response = await fetch(base + '/ws/ticket', { method: 'POST', headers: { Cookie: `ctr_auth=${session.token}`, 'X-CSRF-Token': session.csrfToken } });
    assert.equal(response.status, 200);
    const { ticket } = await response.json();
    protocols = ['ctr-collab', `ticket.${ticket}`];
  }
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws/collab', protocols, { origin: base });
  const messages = [];
  ws.on('message', data => messages.push(JSON.parse(data.toString())));
  ws.on('error', () => {});
  sockets.push(ws);
  await once(ws, 'open');
  return { ws, messages, send: value => ws.send(JSON.stringify(value)) };
}
async function waitFor(client, type) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const index = client.messages.findIndex(message => message.type === type);
    if (index >= 0) return client.messages.splice(index, 1)[0];
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${type}: ${JSON.stringify(client.messages)}`);
}
async function join(client) {
  client.send({ type: 'join', projectId: 'same-project', username: 'forged-victim' });
  await waitFor(client, 'sync');
  return waitFor(client, 'presence');
}
async function setRole(admin, role) {
  const response = await request('/api/v1/admin/users/bob/role', { role }, admin, 'PATCH');
  assert.equal(response.status, 200);
}

try {
  await start();
  for (const username of ['alice', 'bob']) {
    const response = await request('/signup', { username, password: 'SecurityFixture123!' });
    assert.equal(response.status, 201);
  }
  await new Promise(resolve => server.close(resolve));
  const usersPath = path.join(dataDir, 'users.json');
  const users = JSON.parse(await fs.readFile(usersPath, 'utf8'));
  users.alice.role = 'admin';
  await fs.writeFile(usersPath, JSON.stringify(users));
  const app = await start();
  wss = new WebSocketServer({ noServer: true });
  attachCollaborationServer(server, wss, { validateUpgrade: app.get('collabUpgradeValidator') });
  const aliceSession = await login('alice');
  const bobSession = await login('bob');
  const alice = await connect(aliceSession);
  const aliceOther = await connect(aliceSession, true);
  const bob = await connect(bobSession);
  assert.deepEqual((await join(alice)).users, ['alice']);
  await join(aliceOther);
  assert.deepEqual((await join(bob)).users, ['bob']);
  alice.send({ type: 'patch', patch: { secret: 'alice-private' }, username: 'bob' });
  assert.equal((await waitFor(alice, 'ack')).seq, 1);
  const received = await waitFor(aliceOther, 'patch');
  assert.equal(received.username, 'alice');
  assert.equal(received.patch.secret, 'alice-private');
  bob.send({ type: 'ping' });
  await waitFor(bob, 'pong');
  assert.equal(bob.messages.filter(message => message.type === 'patch').length, 0, 'same project name must not cross accounts');
  bob.send({ type: 'patch', projectId: 'same-project', username: 'alice', patch: { injected: true } });
  assert.equal((await waitFor(bob, 'ack')).seq, 1, 'sequence counters are account scoped');
  alice.send({ type: 'ping' });
  await waitFor(alice, 'pong');
  assert.equal(alice.messages.filter(message => message.type === 'patch').length, 0);
  for (const role of ['read-only', 'reviewer']) {
    await setRole(aliceSession, role);
    bob.send({ type: 'patch', patch: { forbidden: role } });
    assert.equal((await waitFor(bob, 'error')).message, 'Insufficient permissions');
  }
  await setRole(aliceSession, 'engineer');
  bob.send({ type: 'patch', patch: { allowed: true } });
  assert.equal((await waitFor(bob, 'ack')).seq, 2, 'role changes apply to the existing socket');
  const closed = once(bob.ws, 'close');
  assert.equal((await request('/logout', {}, bobSession)).status, 200);
  bob.send({ type: 'ping' });
  assert.equal((await closed)[0], 1008, 'revoked session must close the existing socket');
  for (const payload of [null, [], { type: 'join', projectId: {} }, { type: 'join', projectId: 'same-project', username: {} }]) {
    alice.send(payload);
    await waitFor(alice, 'error');
    alice.send({ type: 'ping' });
    await waitFor(alice, 'pong');
  }
  alice.ws.send(Buffer.from('null'));
  await waitFor(alice, 'error');
  alice.ws.send('nu', { fin: false });
  alice.ws.send('ll', { fin: true });
  await waitFor(alice, 'error');
  alice.send({ type: 'ping' });
  await waitFor(alice, 'pong');
  const hugeCurve = Array.from({ length: 100000 }, () => '1:1').join(',');
  const save = await request('/projects/work-limit', { data: { oneLine: { sheets: [{ components: [{ id: 'M', type: 'motor', hp: 100, inertia: 0, load_torque_curve: hugeCurve }] }] } } }, aliceSession);
  assert.equal(save.status, 200);
  const response = await request('/api/v1/projects/work-limit/studies/motor-start', {}, aliceSession);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'MOTOR_START_WORK_LIMIT');
  assert.equal((await fetch(base + '/projects/work-limit', { headers: { Authorization: `Bearer ${aliceSession.token}` } })).status, 200, 'server remains available');
  console.log('✓ real authenticated sockets isolate accounts, ignore forged identity, enforce live roles/revocation, contain malformed messages; motor API rejects CPU trigger');
} finally {
  for (const socket of sockets) socket.terminate();
  if (wss) await new Promise(resolve => wss.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}
