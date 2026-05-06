/**
 * Tests for Role-Based Access Control enforcement in server.mjs.
 *
 * Verifies:
 *  - Each role sees its role in the login response
 *  - Lower-privilege roles are rejected from write endpoints
 *  - Admin endpoints are restricted to admin role
 *  - Role changes are persisted and enforced immediately
 *  - Audit log entries are recorded for mutations
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
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---- Phase 1: create users with default roles, then set roles via file ----

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-rbac-'));
const usersFile = path.join(tmpDir, 'users.json');

// Start server once to create users via signup
{
  const { server, port } = await startServer({
    dataDir: tmpDir,
    rateLimit: { windowMs: 60000, max: 500 },
    enforceHttps: false,
  });
  const base = `http://127.0.0.1:${port}`;
  for (const u of ['admin_user', 'eng_user', 'reviewer_user', 'readonly_user']) {
    await fetch(`${base}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'TestPass123!' }),
    });
  }
  await closeServer(server);
}

// Set roles directly in the persisted file before the real server starts
const rawUsers = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
rawUsers['admin_user'].role = 'admin';
rawUsers['reviewer_user'].role = 'reviewer';
rawUsers['readonly_user'].role = 'read-only';
// eng_user intentionally left without a role field → defaults to 'engineer'
await fs.writeFile(usersFile, JSON.stringify(rawUsers, null, 2));

// ---- Phase 2: start the real server with roles in place ----

const { server, port } = await startServer({
  dataDir: tmpDir,
  rateLimit: { windowMs: 60000, max: 500 },
  enforceHttps: false,
});
const base = `http://127.0.0.1:${port}`;

async function loginAs(username) {
  const r = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'TestPass123!' }),
  });
  return r.json();
}

async function saveProject(session, project, data) {
  return fetch(`${base}/projects/${project}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
      'X-CSRF-Token': session.csrfToken,
    },
    body: JSON.stringify(data),
  });
}

async function getProject(session, project) {
  return fetch(`${base}/projects/${project}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

async function setRole(adminSession, username, role) {
  return fetch(`${base}/api/v1/admin/users/${username}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSession.token}`,
      'X-CSRF-Token': adminSession.csrfToken,
    },
    body: JSON.stringify({ role }),
  });
}

const adminSession = await loginAs('admin_user');
const engSession = await loginAs('eng_user');
const reviewerSession = await loginAs('reviewer_user');
const readonlySession = await loginAs('readonly_user');

console.log('RBAC — Login response includes role');
await check('admin sees role=admin', async () => assert.equal(adminSession.role, 'admin'));
await check('engineer sees role=engineer', async () => assert.equal(engSession.role, 'engineer'));
await check('reviewer sees role=reviewer', async () => assert.equal(reviewerSession.role, 'reviewer'));
await check('read-only sees role=read-only', async () => assert.equal(readonlySession.role, 'read-only'));

console.log('\nRBAC — Project write access');
await check('engineer can save project (200)', async () => {
  const r = await saveProject(engSession, 'engproj', { cables: [] });
  assert.equal(r.status, 200);
});
await check('admin can save project (200)', async () => {
  const r = await saveProject(adminSession, 'adminproj', { cables: [] });
  assert.equal(r.status, 200);
});
await check('reviewer cannot save project (403)', async () => {
  const r = await saveProject(reviewerSession, 'myproj', { cables: [] });
  assert.equal(r.status, 403);
});
await check('read-only cannot save project (403)', async () => {
  const r = await saveProject(readonlySession, 'myproj', { cables: [] });
  assert.equal(r.status, 403);
});

console.log('\nRBAC — Project read access (GET never blocked by role)');
await check('engineer can read own project', async () => {
  const r = await getProject(engSession, 'engproj');
  assert.equal(r.status, 200);
});
await check('reviewer GET is not 403', async () => {
  const r = await getProject(reviewerSession, 'engproj');
  assert.ok(r.status !== 403, `expected not 403, got ${r.status}`);
});
await check('read-only GET is not 403', async () => {
  const r = await getProject(readonlySession, 'engproj');
  assert.ok(r.status !== 403, `expected not 403, got ${r.status}`);
});

console.log('\nRBAC — Admin endpoint access');
await check('admin can list users (200)', async () => {
  const r = await fetch(`${base}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.users));
  assert.ok(body.users.some(u => u.username === 'admin_user'));
});
await check('engineer cannot list users (403)', async () => {
  const r = await fetch(`${base}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${engSession.token}` },
  });
  assert.equal(r.status, 403);
});
await check('unauthenticated cannot list users (401)', async () => {
  const r = await fetch(`${base}/api/v1/admin/users`);
  assert.equal(r.status, 401);
});

console.log('\nRBAC — Admin audit log');
await check('admin can read audit log (200)', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.entries));
  assert.ok(typeof body.total === 'number');
});
await check('engineer cannot read audit log (403)', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log`, {
    headers: { Authorization: `Bearer ${engSession.token}` },
  });
  assert.equal(r.status, 403);
});

console.log('\nRBAC — Role change via PATCH');
await check('admin can promote user to admin (200)', async () => {
  const r = await setRole(adminSession, 'eng_user', 'admin');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.role, 'admin');
});
await check('promoted user sees new role in next login', async () => {
  const freshSession = await loginAs('eng_user');
  assert.equal(freshSession.role, 'admin');
});
await check('promoted user can now access admin endpoint', async () => {
  const freshSession = await loginAs('eng_user');
  const r = await fetch(`${base}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${freshSession.token}` },
  });
  assert.equal(r.status, 200);
});
await check('invalid role is rejected (400)', async () => {
  const r = await setRole(adminSession, 'reviewer_user', 'superuser');
  assert.equal(r.status, 400);
});
await check('non-existent user returns 404', async () => {
  const r = await setRole(adminSession, 'no_such_user', 'engineer');
  assert.equal(r.status, 404);
});
await check('CSRF token required for role change', async () => {
  const r = await fetch(`${base}/api/v1/admin/users/reviewer_user/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSession.token}`,
      // intentionally omit X-CSRF-Token
    },
    body: JSON.stringify({ role: 'engineer' }),
  });
  assert.equal(r.status, 403);
});

console.log('\nRBAC — Audit log content');
await check('LOGIN entries recorded for all users', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log?action=LOGIN`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.entries.length >= 4, `expected ≥4 LOGIN entries, got ${body.entries.length}`);
});
await check('ROLE_CHANGE entry recorded', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log?action=ROLE_CHANGE`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  const body = await r.json();
  assert.ok(body.entries.length >= 1, 'expected ≥1 ROLE_CHANGE entry');
  assert.equal(body.entries[0].entityId, 'eng_user');
});
await check('project mutation entry recorded', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log?entityType=project`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  const body = await r.json();
  assert.ok(body.entries.some(e => ['CREATE', 'UPDATE'].includes(e.action)), 'has project CREATE/UPDATE entry');
});
await check('audit log filter by actor works', async () => {
  const r = await fetch(`${base}/api/v1/admin/audit-log?actor=eng_user`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  const body = await r.json();
  assert.ok(body.entries.every(e => e.actor === 'eng_user'), 'all entries are for eng_user');
});
await check('admin user record has oidc:false for password users', async () => {
  const r = await fetch(`${base}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  const body = await r.json();
  const adminRecord = body.users.find(u => u.username === 'admin_user');
  assert.equal(adminRecord.oidc, false);
  assert.equal(adminRecord.role, 'admin');
});

await closeServer(server);
await fs.rm(tmpDir, { recursive: true, force: true });
console.log('\nAll RBAC tests complete.');
