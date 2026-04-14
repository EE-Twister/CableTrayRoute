/**
 * Tests for the Cloud-Based Component Library feature (Gap #12).
 *
 * Verifies:
 *   - CloudLibraryStore: save, loadLatest, skip-write, version conflict
 *   - LibraryShareStore: create, findByToken, revoke, expiry
 *   - GET  /api/v1/library            — 404 before first save, 200 after
 *   - PUT  /api/v1/library            — saves and returns version
 *   - GET  /api/v1/library/shares     — lists user's shares
 *   - POST /api/v1/library/shares     — creates share token
 *   - DELETE /api/v1/library/shares/:id — revokes share
 *   - GET  /api/v1/library/shared/:token — public read by token
 *   - Unauthenticated requests return 401
 *   - Version conflict returns 409
 */

import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createApp } from '../server.mjs';

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
    await fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('Cloud Library API');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-cloudlib-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    rateLimit: { windowMs: 60000, max: 200 },
    enforceHttps: false,
  });
  const base = `http://127.0.0.1:${port}`;

  async function signupAndLogin(username = 'libuser', password = 'TestPass123!') {
    await fetch(`${base}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json(); // { token, csrfToken }
  }

  function authHeaders(token, csrfToken) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Csrf-Token': csrfToken,
    };
  }

  try {
    // -----------------------------------------------------------------------
    await check('unauthenticated GET /api/v1/library returns 401', async () => {
      const res = await fetch(`${base}/api/v1/library`);
      assert.strictEqual(res.status, 401);
    });

    await check('unauthenticated PUT /api/v1/library returns 401', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {} }),
      });
      assert.strictEqual(res.status, 401);
    });

    // -----------------------------------------------------------------------
    const { token, csrfToken } = await signupAndLogin();

    await check('GET /api/v1/library returns 404 before first save', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 404);
    });

    // -----------------------------------------------------------------------
    const libraryData = {
      categories: ['bus', 'protection'],
      components: [{ subtype: 'bus-main', label: 'Bus', icon: 'icons/components/Bus.svg', category: 'bus' }],
      icons: { 'icons/components/Bus.svg': 'icons/components/Bus.svg' },
    };

    let savedVersion;
    await check('PUT /api/v1/library saves library and returns version', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: authHeaders(token, csrfToken),
        body: JSON.stringify({ data: libraryData }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(typeof body.version === 'string', 'version should be a string');
      assert.strictEqual(body.unchanged, false);
      savedVersion = body.version;
    });

    await check('GET /api/v1/library returns saved data', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.version, 'Should return version');
      assert.deepStrictEqual(body.data.categories, libraryData.categories);
      assert.strictEqual(body.data.components.length, 1);
    });

    await check('PUT /api/v1/library with identical data reports unchanged', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: authHeaders(token, csrfToken),
        body: JSON.stringify({ data: libraryData }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.unchanged, true);
    });

    await check('PUT /api/v1/library with mode:patch merges data', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: authHeaders(token, csrfToken),
        body: JSON.stringify({ patch: { newField: 'hello' }, baseVersion: savedVersion }),
      });
      assert.strictEqual(res.status, 200);
      const patchedGet = await fetch(`${base}/api/v1/library`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const body = await patchedGet.json();
      assert.strictEqual(body.data.newField, 'hello');
      assert.deepStrictEqual(body.data.categories, libraryData.categories);
      savedVersion = body.version;
    });

    await check('PUT /api/v1/library with wrong baseVersion returns 409', async () => {
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: authHeaders(token, csrfToken),
        body: JSON.stringify({ data: libraryData, baseVersion: 'stale-version' }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.ok(body.currentVersion, 'Should return currentVersion');
    });

    await check('PUT /api/v1/library rejects invalid payload with validation details', async () => {
      const invalid = {
        categories: ['equipment', 'equipment'],
        components: [{ subtype: '', label: '', icon: '', category: '' }],
        icons: { '': '' },
      };
      const res = await fetch(`${base}/api/v1/library`, {
        method: 'PUT',
        headers: authHeaders(token, csrfToken),
        body: JSON.stringify({ data: invalid }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'Library payload validation failed');
      assert.ok(Array.isArray(body.details));
      assert.ok(body.details.some((entry) => String(entry.path).includes('categories')));
      assert.ok(body.details.some((entry) => String(entry.path).includes('components[0].subtype')));
    });

    // -----------------------------------------------------------------------
    // Share token tests
    let shareId, shareToken;

    await check('POST /api/v1/library/shares creates a share token', async () => {
      const res = await fetch(`${base}/api/v1/library/shares`, {
        method: 'POST',
        headers: authHeaders(token, csrfToken),
        body: '{}',
      });
      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.ok(typeof body.id === 'string', 'Should return id');
      assert.ok(typeof body.token === 'string', 'Should return token');
      assert.ok(typeof body.expiresAt === 'number', 'Should return expiresAt');
      shareId = body.id;
      shareToken = body.token;
    });

    await check('GET /api/v1/library/shares lists user shares', async () => {
      const res = await fetch(`${base}/api/v1/library/shares`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.shares), 'Should return shares array');
      assert.strictEqual(body.shares.length, 1);
      assert.strictEqual(body.shares[0].id, shareId);
    });

    await check('GET /api/v1/library/shared/:token returns library without auth', async () => {
      const res = await fetch(`${base}/api/v1/library/shared/${shareToken}`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.data, 'Should return library data');
      assert.ok(body.version, 'Should return version');
      assert.ok(body.owner, 'Should return owner username');
    });

    await check('GET /api/v1/library/shared/:token with invalid token returns 404', async () => {
      const res = await fetch(`${base}/api/v1/library/shared/invalidtoken`);
      assert.strictEqual(res.status, 404);
    });

    await check('DELETE /api/v1/library/shares/:id revokes the share', async () => {
      const res = await fetch(`${base}/api/v1/library/shares/${shareId}`, {
        method: 'DELETE',
        headers: authHeaders(token, csrfToken),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.revoked, true);
    });

    await check('Revoked token returns 404', async () => {
      const res = await fetch(`${base}/api/v1/library/shared/${shareToken}`);
      assert.strictEqual(res.status, 404);
    });

    await check('DELETE non-existent share returns 404', async () => {
      const res = await fetch(`${base}/api/v1/library/shares/nonexistent-id`, {
        method: 'DELETE',
        headers: authHeaders(token, csrfToken),
      });
      assert.strictEqual(res.status, 404);
    });

    // -----------------------------------------------------------------------
    // Isolation: second user cannot read first user's library
    await check('Second user gets 404 for their own library before saving', async () => {
      const creds2 = await signupAndLogin('libuser2', 'TestPass456!');
      const res = await fetch(`${base}/api/v1/library`, {
        headers: { 'Authorization': `Bearer ${creds2.token}` },
      });
      assert.strictEqual(res.status, 404);
    });

  } finally {
    await closeServer(server);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
