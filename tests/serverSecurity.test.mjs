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
      resolve({ server, port: address.port });
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

async function httpsRedirectScenario() {
  console.log('server security - HTTPS redirect');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-https-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    tokenTtlMs: 5000,
    rateLimit: { windowMs: 60000, max: 100 },
    enforceHttps: true
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await check('redirects HTTP requests with 308 to preserve POST method', async () => {
      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
        body: JSON.stringify({ username: 'dave', password: 'testpass1' }),
        redirect: 'manual'
      });
      assert.strictEqual(res.status, 308, 'should use 308 (not 301) to preserve POST method');
      const location = res.headers.get('location');
      assert(location && location.startsWith('https://'), 'should redirect to HTTPS');
    });
  } finally {
    await closeServer(server);
  }
}

(async () => {
  await authScenario();
  await rateLimitScenario();
  await sessionRefreshScenario();
  await httpsRedirectScenario();
})();

