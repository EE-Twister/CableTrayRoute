/**
 * Tests for the public REST API v1 endpoints in server.mjs.
 *
 * Verifies:
 *   - Unauthenticated requests to /api/v1 return 401
 *   - GET /api/v1/projects/:project/cables returns cables array
 *   - GET /api/v1/projects/:project/trays returns trays array
 *   - Study POST endpoints return expected result fields
 *   - Unknown project returns 404
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
    const result = await fn();
    console.log('  \u2713', name);
    return result;
  } catch (err) {
    console.error('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('REST API v1');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-restapi-'));
  const { server, port } = await startServer({
    dataDir: tmpDir,
    rateLimit: { windowMs: 60000, max: 200 },
    enforceHttps: false,
  });
  const base = `http://127.0.0.1:${port}`;

  // Helper: sign up + log in, return { token, csrfToken }
  async function login(username = 'apiuser', password = 'TestPass123!') {
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
    return res.json();
  }

  // Helper: save a project for the user (creates storage so subsequent reads succeed)
  async function saveProject(token, csrfToken, project, data) {
    return fetch(`${base}/projects/${project}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Csrf-Token': csrfToken,
      },
      body: JSON.stringify({ data }),
    });
  }

  try {
    // -----------------------------------------------------------------------
    await check('unauthenticated GET /api/v1/... returns 401', async () => {
      const res = await fetch(`${base}/api/v1/projects/myproject/cables`);
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error, 'Should include an error field');
    });

    await check('unauthenticated POST /api/v1/.../studies/short-circuit returns 401', async () => {
      const res = await fetch(`${base}/api/v1/projects/myproject/studies/short-circuit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.strictEqual(res.status, 401);
    });

    // -----------------------------------------------------------------------
    const { token, csrfToken } = await login();

    await check('GET /api/v1/projects/:project/cables returns 404 for unknown project', async () => {
      const res = await fetch(`${base}/api/v1/projects/nonexistent/cables`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 404);
    });

    // -----------------------------------------------------------------------
    // Create a project with cables and trays
    const projectData = {
      cables: [
        { name: 'C1', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG' },
        { name: 'C2', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG' },
      ],
      raceways: [
        { tray_id: 'T1', inside_width: 12, start_x: 0, start_y: 0, start_z: 10,
          end_x: 20, end_y: 0, end_z: 10 },
      ],
      oneLine: { sheets: [] },
    };

    await saveProject(token, csrfToken, 'test-project', projectData);

    await check('GET /api/v1/projects/:project/cables returns cables array', async () => {
      const res = await fetch(`${base}/api/v1/projects/test-project/cables`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.cables), 'cables should be an array');
      assert.strictEqual(body.cables.length, 2, 'Should have 2 cables');
      assert.strictEqual(body.count, 2);
    });

    await check('GET /api/v1/projects/:project/trays returns trays array', async () => {
      const res = await fetch(`${base}/api/v1/projects/test-project/trays`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.trays), 'trays should be an array');
      assert.strictEqual(body.trays.length, 1, 'Should have 1 tray');
      assert.strictEqual(body.count, 1);
    });

    await check('POST /api/v1/projects/:project/studies/short-circuit returns result', async () => {
      const res = await fetch(`${base}/api/v1/projects/test-project/studies/short-circuit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Object.prototype.hasOwnProperty.call(body, 'shortCircuit'),
        'Response should have shortCircuit field');
    });

    await check('POST /api/v1/projects/:project/studies/motor-start returns result', async () => {
      const res = await fetch(`${base}/api/v1/projects/test-project/studies/motor-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      // The server uses motorStartCalc.mjs (no d3 dependency) when available.
      // In all cases, the response must contain a motorStart field.
      assert.ok(Object.prototype.hasOwnProperty.call(body, 'motorStart'),
        `Response should have motorStart field. Got: ${JSON.stringify(Object.keys(body))}`);
    });

    await check('POST /api/v1/projects/:project/studies/voltage-drop returns result', async () => {
      const res = await fetch(`${base}/api/v1/projects/test-project/studies/voltage-drop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Object.prototype.hasOwnProperty.call(body, 'voltageDrop'),
        'Response should have voltageDrop field');
    });

    await check('GET /api/v1/projects/:project/cables returns empty array for project with no cables', async () => {
      // Save a project with raceways but no cables (non-empty body so the store writes to disk)
      const saveRes = await saveProject(token, csrfToken, 'empty-cables', { raceways: [] });
      const saveBody = await saveRes.json();
      assert.ok(saveRes.status === 200 || saveRes.status === 201,
        `saveProject should succeed, got ${saveRes.status}: ${JSON.stringify(saveBody)}`);
      const res = await fetch(`${base}/api/v1/projects/empty-cables/cables`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.deepStrictEqual(body.cables, []);
      assert.strictEqual(body.count, 0);
    });

  } finally {
    await closeServer(server);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

await runTests();
