/**
 * Organization-wide approved component-library releases.
 *
 * The first phase creates users, then assigns an admin role in the persisted
 * deployment data before testing the running server. This mirrors deployment
 * bootstrap and keeps the authorization checks end-to-end.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

async function startServer(options = {}) {
  const app = await createApp(options);
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function closeServer(server) {
  await new Promise(resolve => server.close(resolve));
}

async function check(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (error) {
    console.error('  ✗', name);
    console.error(error);
    process.exitCode = 1;
  }
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-team-library-'));
const serverOptions = {
  dataDir: tmpDir,
  rateLimit: { windowMs: 60000, max: 500 },
  enforceHttps: false,
};

try {
  {
    const { server, port } = await startServer(serverOptions);
    const base = `http://127.0.0.1:${port}`;
    for (const username of ['library_admin', 'library_engineer']) {
      const response = await fetch(`${base}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'TestPass123!' }),
      });
      assert.equal(response.status, 201);
    }
    await closeServer(server);
  }

  const usersFile = path.join(tmpDir, 'users.json');
  const users = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
  users.library_admin.role = 'admin';
  await fs.writeFile(usersFile, JSON.stringify(users, null, 2));

  const { server, port } = await startServer(serverOptions);
  const base = `http://127.0.0.1:${port}`;
  const loginAs = async username => {
    const response = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'TestPass123!' }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const headersFor = session => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.token}`,
    'X-Csrf-Token': session.csrfToken,
  });
  const admin = await loginAs('library_admin');
  const engineer = await loginAs('library_engineer');
  const libraryData = {
    categories: ['equipment'],
    components: [{
      subtype: 'bus-main',
      label: 'Approved main bus',
      category: 'equipment',
      icon: 'icons/components/Bus.svg',
      ports: 2,
      schema: {},
    }],
    icons: { 'icons/components/Bus.svg': 'icons/components/Bus.svg' },
  };

  try {
    console.log('Team Library API');
    await check('requires authentication to read the approved team library', async () => {
      const response = await fetch(`${base}/api/v1/team-library`);
      assert.equal(response.status, 401);
    });

    await check('returns 404 before an admin publishes a release', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        headers: { Authorization: `Bearer ${engineer.token}` },
      });
      assert.equal(response.status, 404);
    });

    await check('prevents engineers from publishing an organization release', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(engineer),
        body: JSON.stringify({ data: libraryData, releaseNotes: 'Attempted release' }),
      });
      assert.equal(response.status, 403);
    });

    let releaseVersion;
    await check('allows an admin to publish a validated immutable release', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(admin),
        body: JSON.stringify({ data: libraryData, releaseNotes: 'Initial approved release' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.version, /^\d{13}-[a-f0-9]{8}$/);
      assert.equal(body.publishedBy, 'library_admin');
      assert.equal(body.releaseNotes, 'Initial approved release');
      assert.equal(body.unchanged, false);
      releaseVersion = body.version;
    });

    await check('allows all signed-in users to load the approved release', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        headers: { Authorization: `Bearer ${engineer.token}` },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.version, releaseVersion);
      assert.deepEqual(body.data, libraryData);
    });

    await check('lists release metadata without leaking component payloads', async () => {
      const response = await fetch(`${base}/api/v1/team-library/releases`, {
        headers: { Authorization: `Bearer ${engineer.token}` },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.releases.length, 1);
      assert.equal(body.releases[0].version, releaseVersion);
      assert.equal(Object.hasOwn(body.releases[0], 'data'), false);
    });

    await check('reports unchanged when the approved contents are republished', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(admin),
        body: JSON.stringify({ data: libraryData, baseVersion: releaseVersion, releaseNotes: 'Review only' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.version, releaseVersion);
      assert.equal(body.unchanged, true);
    });

    await check('detects a stale team-release version before publishing', async () => {
      const response = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(admin),
        body: JSON.stringify({ data: libraryData, baseVersion: 'stale-release', releaseNotes: '' }),
      });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.currentVersion, releaseVersion);
    });

    await check('validates component data and release-note length on publish', async () => {
      const longNotesResponse = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(admin),
        body: JSON.stringify({ data: { categories: [], components: [], icons: {} }, releaseNotes: 'x'.repeat(501) }),
      });
      assert.equal(longNotesResponse.status, 400);
      const invalidPayloadResponse = await fetch(`${base}/api/v1/team-library`, {
        method: 'PUT',
        headers: headersFor(admin),
        body: JSON.stringify({
          data: { categories: ['equipment'], components: [{ subtype: '', label: '', icon: '' }], icons: {} },
          releaseNotes: '',
        }),
      });
      assert.equal(invalidPayloadResponse.status, 400);
    });
  } finally {
    await closeServer(server);
  }
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true });
}
