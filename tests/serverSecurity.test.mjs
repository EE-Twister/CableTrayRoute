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

(async () => {
  await authScenario();
  await rateLimitScenario();
})();

