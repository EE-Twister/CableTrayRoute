import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { createApp } from '../server.mjs';

const scrypt = promisify(crypto.scrypt);

async function startServer(options) {
  const app = await createApp(options);
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({ server, port: address.port, app });
    });
  });
}

async function closeServer(server) {
  await new Promise(resolve => server.close(resolve));
}

async function check(name, fn) {
  try {
    const result = await fn();
    console.log('  \u2713', name);
    return result;
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
    throw err;
  }
}

async function authScenario() {
  console.log('server security - hashing, CSRF, and expiry');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-auth-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 250,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'alice';
    const password = 'Sup3rSecret!';

    await check('allows signup with credential hashing', async () => {
      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      assert.strictEqual(res.status, 201);
      const users = JSON.parse(await fs.readFile(path.join(tmpDir, 'users.json'), 'utf-8'));
      assert(users[username]);
      const stored = users[username].password;
      assert.notStrictEqual(stored, password);
      const parts = stored.split(':');
      assert.strictEqual(parts[0], 'scrypt');
      const [, salt, key] = parts;
      const derived = await scrypt(password, salt, 64);
      assert(crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived)));
    });

    const session = await check('issues bearer tokens with CSRF secrets', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.token);
      assert(payload.csrfToken);
      assert(payload.expiresAt > Date.now());
      const sessions = JSON.parse(await fs.readFile(path.join(tmpDir, 'sessions.json'), 'utf-8'));
      assert(sessions[payload.token]);
      assert.strictEqual(sessions[payload.token].username, username);
      assert(sessions[payload.token].expiresAt > Date.now());
      return payload;
    });

    await check('rejects project writes without CSRF header', async () => {
      const res = await fetch(`${baseUrl}/projects/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ value: 1 })
      });
      assert.strictEqual(res.status, 403);
    });


    const snapshot = await check('creates read-only and editable snapshot links with metadata', async () => {
      await fetch(`${baseUrl}/projects/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ value: 1 })
      });
      const readRes = await fetch(`${baseUrl}/projects/test/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ mode: 'read' })
      });
      assert.strictEqual(readRes.status, 201);
      const readPayload = await readRes.json();
      assert.strictEqual(readPayload.mode, 'read');
      assert(readPayload.token);
      assert(readPayload.id);
      assert(readPayload.expiresAt > Date.now());

      const editRes = await fetch(`${baseUrl}/projects/test/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ mode: 'edit' })
      });
      assert.strictEqual(editRes.status, 201);
      const editPayload = await editRes.json();
      assert.strictEqual(editPayload.mode, 'edit');

      const listRes = await fetch(`${baseUrl}/projects/test/snapshots`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });
      assert.strictEqual(listRes.status, 200);
      const listPayload = await listRes.json();
      assert(Array.isArray(listPayload.snapshots));
      assert(listPayload.snapshots.length >= 2);
      return { read: readPayload, edit: editPayload };
    });

    await check('enforces read-only snapshot constraints for token routes', async () => {
      const readFetch = await fetch(`${baseUrl}/shared/${snapshot.read.token}`);
      assert.strictEqual(readFetch.status, 200);
      const readData = await readFetch.json();
      assert.strictEqual(readData.snapshot.mode, 'read');

      const writeAttempt = await fetch(`${baseUrl}/shared/${snapshot.read.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 7 })
      });
      assert.strictEqual(writeAttempt.status, 403);
    });

    await check('allows editable snapshot updates and revocation', async () => {
      const writeAttempt = await fetch(`${baseUrl}/shared/${snapshot.edit.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 9 })
      });
      assert.strictEqual(writeAttempt.status, 200);

      const revokeRes = await fetch(`${baseUrl}/projects/test/snapshots/${snapshot.edit.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        }
      });
      assert.strictEqual(revokeRes.status, 204);

      const afterRevoke = await fetch(`${baseUrl}/shared/${snapshot.edit.token}`);
      assert.strictEqual(afterRevoke.status, 404);
    });

    await check('allows project writes with CSRF header', async () => {
      const res = await fetch(`${baseUrl}/projects/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ value: 2 })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.version);
    });

    const firstVersion = await check('stores initial version metadata for incremental updates', async () => {
      const res = await fetch(`${baseUrl}/projects/incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ data: { counters: { a: 1, b: 2 }, note: 'base' } })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.version);
      assert.strictEqual(payload.unchanged, false);
      return payload.version;
    });

    const patchedVersion = await check('applies merge patch updates incrementally', async () => {
      const res = await fetch(`${baseUrl}/projects/incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({
          baseVersion: firstVersion,
          patch: { counters: { b: 3 }, added: true }
        })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.version);
      assert.notStrictEqual(payload.version, firstVersion);

      const read = await fetch(`${baseUrl}/projects/incremental`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(read.status, 200);
      const loaded = await read.json();
      assert.deepStrictEqual(loaded.data, { counters: { a: 1, b: 3 }, note: 'base', added: true });
      return payload.version;
    });

    await check('rejects incremental updates with stale baseVersion', async () => {
      const res = await fetch(`${baseUrl}/projects/incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({
          baseVersion: firstVersion,
          patch: { stale: true }
        })
      });
      assert.strictEqual(res.status, 409);
      const payload = await res.json();
      assert.strictEqual(payload.error, 'Version conflict');
      assert.strictEqual(payload.currentVersion, patchedVersion);
    });

    await check('skips writes when payload is unchanged and emits timing metrics', async () => {
      const res = await fetch(`${baseUrl}/projects/incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ patch: {} })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert.strictEqual(payload.unchanged, true);
      const timing = res.headers.get('server-timing') || '';
      assert.match(timing, /project\.persist;dur=/);
      assert.match(timing, /project\.write;dur=/);

      const getRes = await fetch(`${baseUrl}/projects/incremental`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(getRes.status, 200);
      const getTiming = getRes.headers.get('server-timing') || '';
      assert.match(getTiming, /project\.read;dur=/);
      assert.match(getTiming, /project\.parse;dur=/);
    });

    await check('serves stored project data before expiry', async () => {
      const res = await fetch(`${baseUrl}/projects/test`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.data);
      assert.strictEqual(payload.data.value, 2);
    });

    await new Promise(resolve => setTimeout(resolve, 300));

    await check('invalidates expired sessions', async () => {
      const res = await fetch(`${baseUrl}/projects/test`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(res.status, 401);
    });
  } finally {
    await closeServer(server);
  }
}

async function rateLimitScenario() {
  console.log('server security - rate limiting');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-rate-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 2000,
    rateLimit: { windowMs: 500, max: 2 },
    enforceHttps: false
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'bob';
    const password = 'Another$ecret1';

    await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    assert.strictEqual(loginRes.status, 200);
    const session = await loginRes.json();

    await check('enforces request ceilings per window', async () => {
      const headers = { Authorization: `Bearer ${session.token}` };
      const first = await fetch(`${baseUrl}/projects/demo`, { headers });
      const second = await fetch(`${baseUrl}/projects/demo`, { headers });
      assert.strictEqual(first.status, 404);
      assert.strictEqual(second.status, 404);
      const limited = await fetch(`${baseUrl}/projects/demo`, { headers });
      assert.strictEqual(limited.status, 429);
    });

    await check('rate limits WebSocket ticket minting', async () => {
      const headers = {
        Authorization: `Bearer ${session.token}`,
        'X-CSRF-Token': session.csrfToken,
      };
      const first = await fetch(`${baseUrl}/ws/ticket`, { method: 'POST', headers });
      const second = await fetch(`${baseUrl}/ws/ticket`, { method: 'POST', headers });
      assert.strictEqual(first.status, 200);
      assert.strictEqual(second.status, 200);
      const limited = await fetch(`${baseUrl}/ws/ticket`, { method: 'POST', headers });
      assert.strictEqual(limited.status, 429);
    });
  } finally {
    await closeServer(server);
  }
}

async function sessionRefreshScenario() {
  console.log('server security - session refresh');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-refresh-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 5000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'carol';
    const password = 'Refr3sh!Pass';

    await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const session = await loginRes.json();

    const refreshed = await check('issues a new token and csrfToken on refresh', async () => {
      const res = await fetch(`${baseUrl}/session/refresh`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        }
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.token, 'new token missing');
      assert(payload.csrfToken, 'new csrfToken missing');
      assert(payload.expiresAt > Date.now(), 'expiresAt should be in the future');
      assert.notStrictEqual(payload.token, session.token, 'new token should differ from old');
      return payload;
    });

    await check('old token is invalidated after refresh', async () => {
      const res = await fetch(`${baseUrl}/projects/test`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(res.status, 401, 'old token should be rejected');
    });

    await check('new token grants access to protected resources', async () => {
      const res = await fetch(`${baseUrl}/projects/refreshed-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshed.token}`,
          'X-CSRF-Token': refreshed.csrfToken
        },
        body: JSON.stringify({ data: { v: 1 } })
      });
      assert.strictEqual(res.status, 200);
    });

    await check('rejects refresh with missing CSRF token', async () => {
      // Login again to get a fresh session
      const loginRes2 = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const session2 = await loginRes2.json();
      const res = await fetch(`${baseUrl}/session/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session2.token}` }
      });
      assert.strictEqual(res.status, 403);
    });

    await check('rejects refresh with invalid bearer token', async () => {
      const res = await fetch(`${baseUrl}/session/refresh`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalidtoken',
          'X-CSRF-Token': 'aaaa'
        }
      });
      assert.strictEqual(res.status, 401);
    });
  } finally {
    await closeServer(server);
  }
}

async function passwordChangeScenario() {
  console.log('server security - password changes');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-password-change-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 5000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'erin';
    const password = 'ChangeMe!123';
    const newPassword = 'Changed!456';

    await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const session = await loginRes.json();

    const rotated = await check('rotates token and csrfToken after password change', async () => {
      const res = await fetch(`${baseUrl}/account/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ currentPassword: password, newPassword })
      });
      assert.strictEqual(res.status, 200);
      const payload = await res.json();
      assert(payload.token, 'new token missing');
      assert(payload.csrfToken, 'new csrfToken missing');
      assert.notStrictEqual(payload.token, session.token, 'new token should differ from old');
      assert.notStrictEqual(payload.csrfToken, session.csrfToken, 'new csrfToken should differ from old');
      return payload;
    });

    await check('rejects the pre-change token after password change', async () => {
      const res = await fetch(`${baseUrl}/projects/demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ data: { stale: true } })
      });
      assert.strictEqual(res.status, 401);
    });

    await check('accepts the rotated token after password change', async () => {
      const res = await fetch(`${baseUrl}/projects/demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rotated.token}`,
          'X-CSRF-Token': rotated.csrfToken
        },
        body: JSON.stringify({ data: { fresh: true } })
      });
      assert.strictEqual(res.status, 200);
    });

    await check('allows login with the new password only', async () => {
      const oldLogin = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      assert.strictEqual(oldLogin.status, 401);

      const newLogin = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: newPassword })
      });
      assert.strictEqual(newLogin.status, 200);
    });
  } finally {
    await closeServer(server);
  }
}

async function httpsRedirectScenario() {
  console.log('server security - HTTPS redirect');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-https-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 5000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: true,
    httpsRedirectHost: 'app.example.test'
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await check('returns JSON error for API requests over HTTP (avoids cross-origin CORS issues)', async () => {
      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
        body: JSON.stringify({ username: 'dave', password: 'testpass1' }),
        redirect: 'manual'
      });
      assert.strictEqual(res.status, 400, 'API requests should get JSON error, not a redirect');
      const body = await res.json();
      assert.strictEqual(body.error, 'HTTPS required');
    });

    await check('redirects non-API HTTP requests with 308 to preserve method', async () => {
      const res = await fetch(`${baseUrl}/login.html`, {
        method: 'GET',
        headers: { host: 'attacker.example.test' },
        redirect: 'manual'
      });
      assert.strictEqual(res.status, 308, 'navigation requests should use 308 redirect');
      const location = res.headers.get('location');
      assert.strictEqual(location, 'https://app.example.test/login.html', 'should redirect to configured HTTPS host');
    });
  } finally {
    await closeServer(server);
  }
}

async function accountLifecycleScenario() {
  console.log('server security - account lifecycle endpoints');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-account-life-'));
  const usersFile = path.join(tmpDir, 'users.json');
  const username = 'lifecycle';
  const adminUsername = 'life_admin';
  const password = 'LifeCycle!123';

  {
    const { server, port } = await startServer({
      dataDir: tmpDir,
      tokenTtlMs: 5000,
      rateLimit: { windowMs: 60000, max: 100 },
      enforceHttps: false
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    for (const user of [username, adminUsername]) {
      await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password })
      });
    }
    await closeServer(server);
  }

  const rawUsers = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
  rawUsers[adminUsername].role = 'admin';
  await fs.writeFile(usersFile, JSON.stringify(rawUsers, null, 2));

  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 5000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const session = await loginRes.json();
    const adminLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password })
    });
    const adminSession = await adminLoginRes.json();

    await check('lists current account sessions without exposing tokens', async () => {
      const res = await fetch(`${baseUrl}/account/sessions`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.sessions.length, 1);
      assert.strictEqual(body.sessions[0].current, true);
      assert.ok(body.sessions[0].id, 'hashed session id missing');
      assert.strictEqual(body.sessions[0].token, undefined);
    });

    await check('requires CSRF before submitting account deletion request', async () => {
      const res = await fetch(`${baseUrl}/account/deletion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ confirmation: 'DELETE' })
      });
      assert.strictEqual(res.status, 403);
    });

    await check('persists account deletion request after confirmation', async () => {
      const res = await fetch(`${baseUrl}/account/deletion-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ confirmation: 'DELETE' })
      });
      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.request.username, username);
      assert.strictEqual(body.request.status, 'requested');
    });

    await check('returns account deletion request status', async () => {
      const res = await fetch(`${baseUrl}/account/deletion-request`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.request.username, username);
      assert.strictEqual(body.request.status, 'requested');
    });

    await check('admin can list account deletion requests', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/account-deletion-requests`, {
        headers: { Authorization: `Bearer ${adminSession.token}` }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.requests.length, 1);
      assert.strictEqual(body.requests[0].username, username);
      assert.strictEqual(body.requests[0].status, 'requested');
    });

    await check('admin deletion request status update requires CSRF', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/account-deletion-requests/${username}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSession.token}`
        },
        body: JSON.stringify({ status: 'reviewing' })
      });
      assert.strictEqual(res.status, 403);
    });

    await check('admin can update account deletion request status', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/account-deletion-requests/${username}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSession.token}`,
          'X-CSRF-Token': adminSession.csrfToken
        },
        body: JSON.stringify({ status: 'reviewing' })
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.request.status, 'reviewing');
    });

    await check('signs out all local account sessions', async () => {
      const res = await fetch(`${baseUrl}/account/signout-all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': session.csrfToken
        }
      });
      assert.strictEqual(res.status, 200);
      const followUp = await fetch(`${baseUrl}/account/sessions`, {
        headers: { Authorization: `Bearer ${session.token}` }
      });
      assert.strictEqual(followUp.status, 401);
    });
  } finally {
    await closeServer(server);
  }
}

function getSetCookieValue(headers, cookieName) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const entry of list) {
    const first = entry.split(';')[0];
    const [name, ...rest] = first.split('=');
    if (name === cookieName) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function getSetCookieAttributes(headers, cookieName) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const entry of list) {
    const [first, ...attrs] = entry.split(';').map(s => s.trim());
    const [name] = first.split('=');
    if (name === cookieName) return attrs.map(a => a.toLowerCase());
  }
  return null;
}

async function cookieAuthScenario() {
  console.log('server security - HttpOnly auth cookie');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-cookie-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 60_000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false,
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'cookieuser';
    const password = 'C00kieMonster!';

    await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    let session;
    let authCookie;
    await check('/login sets HttpOnly ctr_auth cookie', async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      assert.strictEqual(res.status, 200);
      session = await res.json();
      authCookie = getSetCookieValue(res.headers, 'ctr_auth');
      assert(authCookie, 'ctr_auth cookie set');
      assert.strictEqual(authCookie, session.token, 'cookie carries the session token');
      const attrs = getSetCookieAttributes(res.headers, 'ctr_auth');
      assert(attrs.includes('httponly'), 'HttpOnly flag set');
      assert(attrs.some(a => a === 'samesite=lax'), 'SameSite=Lax set');
      assert(attrs.some(a => a.startsWith('path=/')), 'Path=/ set');
    });

    await check('cookie auth grants access without Authorization header', async () => {
      const res = await fetch(`${baseUrl}/projects/cookieproj`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `ctr_auth=${authCookie}`,
          'X-CSRF-Token': session.csrfToken,
        },
        body: JSON.stringify({ data: { v: 1 } }),
      });
      assert.strictEqual(res.status, 200, 'cookie-authenticated write succeeds');
    });

    await check('cookie auth still requires CSRF token on writes', async () => {
      const res = await fetch(`${baseUrl}/projects/cookieproj`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `ctr_auth=${authCookie}`,
        },
        body: JSON.stringify({ data: { v: 2 } }),
      });
      assert.strictEqual(res.status, 403, 'missing CSRF rejected even with cookie');
    });

    await check('Authorization header still works during deprecation window', async () => {
      const res = await fetch(`${baseUrl}/projects/cookieproj`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      assert.strictEqual(res.status, 200, 'bearer header still accepted');
    });

    await check('/logout revokes session and clears cookie', async () => {
      const res = await fetch(`${baseUrl}/logout`, {
        method: 'POST',
        headers: {
          Cookie: `ctr_auth=${authCookie}`,
          'X-CSRF-Token': session.csrfToken,
        },
      });
      assert.strictEqual(res.status, 200);
      const cleared = getSetCookieAttributes(res.headers, 'ctr_auth');
      assert(cleared, 'cookie cleared on logout');
      assert(cleared.some(a => a === 'max-age=0'), 'cookie cleared with Max-Age=0');

      const followUp = await fetch(`${baseUrl}/projects/cookieproj`, {
        headers: { Cookie: `ctr_auth=${authCookie}` },
      });
      assert.strictEqual(followUp.status, 401, 'revoked session rejected');

      const headerFollowUp = await fetch(`${baseUrl}/projects/cookieproj`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      assert.strictEqual(headerFollowUp.status, 401, 'header path also rejected after logout');
    });
  } finally {
    await closeServer(server);
  }
}

async function wsTicketScenario() {
  console.log('server security - WebSocket ticket endpoint');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-wsticket-'));
  const { server, port, app } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 60_000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: false,
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const username = 'wsuser';
    const password = 'WsTicket!42';

    await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const session = await loginRes.json();
    const authCookie = getSetCookieValue(loginRes.headers, 'ctr_auth');

    await check('/ws/ticket requires authentication', async () => {
      const res = await fetch(`${baseUrl}/ws/ticket`, { method: 'POST' });
      assert.strictEqual(res.status, 401);
    });

    await check('/ws/ticket requires CSRF token', async () => {
      const res = await fetch(`${baseUrl}/ws/ticket`, {
        method: 'POST',
        headers: { Cookie: `ctr_auth=${authCookie}` },
      });
      assert.strictEqual(res.status, 403);
    });

    let ticket;
    await check('/ws/ticket issues a short-lived ticket', async () => {
      const res = await fetch(`${baseUrl}/ws/ticket`, {
        method: 'POST',
        headers: {
          Cookie: `ctr_auth=${authCookie}`,
          'X-CSRF-Token': session.csrfToken,
        },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert(body.ticket && /^[0-9a-f]+$/.test(body.ticket), 'ticket is hex-encoded');
      assert(body.expiresAt > Date.now(), 'ticket has future expiry');
      assert(body.expiresAt < Date.now() + 60_000, 'ticket TTL is short (< 60s)');
      ticket = body.ticket;
    });

    await check('upgrade validator accepts ticket subprotocol (single-use)', async () => {
      const validate = app.get('collabUpgradeValidator');
      assert(typeof validate === 'function', 'validator registered');
      const ok = await validate({
        headers: {
          origin: baseUrl,
          host: `127.0.0.1:${port}`,
          'sec-websocket-protocol': `ctr-collab, ticket.${ticket}`,
        },
      });
      assert.strictEqual(ok, true, 'first use accepted');
      const replay = await validate({
        headers: {
          origin: baseUrl,
          host: `127.0.0.1:${port}`,
          'sec-websocket-protocol': `ctr-collab, ticket.${ticket}`,
        },
      });
      assert.strictEqual(replay, false, 'ticket is single-use');
    });

    await check('upgrade validator rejects bogus ticket', async () => {
      const validate = app.get('collabUpgradeValidator');
      const ok = await validate({
        headers: {
          origin: baseUrl,
          host: `127.0.0.1:${port}`,
          'sec-websocket-protocol': 'ctr-collab, ticket.deadbeefdeadbeef',
        },
      });
      assert.strictEqual(ok, false);
    });

    await check('/ws/ticket caps outstanding tickets per session', async () => {
      const issued = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await fetch(`${baseUrl}/ws/ticket`, {
          method: 'POST',
          headers: {
            Cookie: `ctr_auth=${authCookie}`,
            'X-CSRF-Token': session.csrfToken,
          },
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        issued.push(body.ticket);
      }

      const validate = app.get('collabUpgradeValidator');
      const oldest = await validate({
        headers: {
          origin: baseUrl,
          host: `127.0.0.1:${port}`,
          'sec-websocket-protocol': `ctr-collab, ticket.${issued[0]}`,
        },
      });
      const newest = await validate({
        headers: {
          origin: baseUrl,
          host: `127.0.0.1:${port}`,
          'sec-websocket-protocol': `ctr-collab, ticket.${issued.at(-1)}`,
        },
      });
      assert.strictEqual(oldest, false, 'oldest outstanding ticket was evicted');
      assert.strictEqual(newest, true, 'newer ticket remains usable');
    });
  } finally {
    await closeServer(server);
  }
}

(async () => {
  await authScenario();
  await rateLimitScenario();
  await sessionRefreshScenario();
  await passwordChangeScenario();
  await accountLifecycleScenario();
  await httpsRedirectScenario();
  await cookieAuthScenario();
  await wsTicketScenario();
})();
