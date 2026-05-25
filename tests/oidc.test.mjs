/**
 * Tests for OIDC authorization code flow in server.mjs.
 *
 * Uses a minimal in-process stub IdP (no external dependencies) to simulate:
 *  - Discovery endpoint
 *  - Authorization endpoint
 *  - Token exchange endpoint
 *  - Userinfo endpoint
 *
 * Verifies:
 *  - /auth/oidc/login redirects to IdP when OIDC_ISSUER/OIDC_CLIENT_ID set
 *  - /auth/oidc/login returns 503 when OIDC not configured
 *  - /auth/oidc/callback with valid code performs JIT provisioning and issues session
 *  - /auth/oidc/callback with invalid state returns error redirect
 *  - /auth/oidc/callback with IdP error redirects with error parameter
 *  - JIT-provisioned user defaults to reviewer role
 *  - Second login for same OIDC subject reuses existing account
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server.mjs';

// ---------------------------------------------------------------------------
// Minimal stub IdP
// ---------------------------------------------------------------------------

function createStubIdp() {
  const CODE = 'stub_auth_code_abc123';
  const ACCESS_TOKEN = 'stub_access_token_xyz';
  let capturedCodeVerifier = null;
  let userInfoOverride = null;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Discovery
    if (url.pathname === '/.well-known/openid-configuration') {
      const base = `http://127.0.0.1:${server.address().port}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        userinfo_endpoint: `${base}/userinfo`,
      }));
      return;
    }

    // Authorization — immediate redirect back with code
    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (!redirectUri || !state) {
        res.writeHead(400); res.end('Bad request');
        return;
      }
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', CODE);
      callback.searchParams.set('state', state);
      res.writeHead(302, { Location: callback.toString() });
      res.end();
      return;
    }

    // Token exchange
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        capturedCodeVerifier = params.get('code_verifier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: ACCESS_TOKEN, token_type: 'Bearer' }));
      });
      return;
    }

    // Userinfo
    if (url.pathname === '/userinfo') {
      const info = userInfoOverride ?? {
        sub: 'oidc-sub-user1',
        email: 'user1@example.com',
        name: 'User One',
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
      return;
    }

    res.writeHead(404); res.end('Not found');
  });

  return new Promise(resolve => {
    server.listen(0, () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        issuer: `http://127.0.0.1:${port}`,
        setUserInfo: info => { userInfoOverride = info; },
        resetUserInfo: () => { userInfoOverride = null; },
        getCapturedVerifier: () => capturedCodeVerifier,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startServer(options = {}) {
  const app = await createApp(options);
  return new Promise(resolve => {
    const srv = app.listen(0, () => resolve({ server: srv, port: srv.address().port }));
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

// Follow a single redirect (no further redirects)
async function fetchNoFollow(url, init = {}) {
  return fetch(url, { ...init, redirect: 'manual' });
}
function getCookieHeaderFromSetCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  return setCookieHeader.split(';')[0];
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const idp = await createStubIdp();
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-oidc-'));

console.log('OIDC — /auth/oidc/login without configuration');
{
  const { server, port } = await startServer({
    dataDir: tmpDir,
    rateLimit: { windowMs: 60000, max: 500 },
    enforceHttps: false,
  });
  const base = `http://127.0.0.1:${port}`;

  await check('returns 503 when OIDC_ISSUER not set', async () => {
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    const r = await fetchNoFollow(`${base}/auth/oidc/login`);
    assert.equal(r.status, 503);
  });

  await closeServer(server);
}

console.log('\nOIDC — Full authorization code flow');
const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-oidc2-'));
process.env.OIDC_ISSUER = idp.issuer;
process.env.OIDC_CLIENT_ID = 'test-client';
process.env.OIDC_CLIENT_SECRET = 'test-secret';
process.env.OIDC_REDIRECT_URI = ''; // let server derive it

const { server: appServer, port: appPort } = await startServer({
  dataDir: tmpDir2,
  rateLimit: { windowMs: 60000, max: 500 },
  enforceHttps: false,
});
const appBase = `http://127.0.0.1:${appPort}`;
process.env.OIDC_REDIRECT_URI = `${appBase}/auth/oidc/callback`;

let relayUrl = null;
let capturedState = null;
let oidcCookie = '';

await check('/auth/oidc/login redirects to IdP authorization_endpoint', async () => {
  const r = await fetchNoFollow(`${appBase}/auth/oidc/login`);
  assert.ok([301, 302, 303, 307, 308].includes(r.status), `expected redirect, got ${r.status}`);
  const location = r.headers.get('location');
  assert.ok(location.startsWith(idp.issuer + '/authorize'), `expected redirect to IdP, got ${location}`);
  const locationUrl = new URL(location);
  capturedState = locationUrl.searchParams.get('state');
  assert.ok(capturedState, 'state parameter present');
  assert.equal(locationUrl.searchParams.get('code_challenge_method'), 'S256', 'PKCE S256 used');
  assert.ok(locationUrl.searchParams.get('code_challenge'), 'code_challenge present');
  oidcCookie = getCookieHeaderFromSetCookie(r.headers.get('set-cookie'));
  assert.ok(oidcCookie.startsWith('oidc_state_binding='), 'OIDC binding cookie was set');
});

// Simulate the IdP callback by calling our callback directly with the state from the login step
await check('/auth/oidc/callback with valid code provisions user and redirects to relay', async () => {
  const callbackUrl = `${appBase}/auth/oidc/callback?code=stub_auth_code_abc123&state=${capturedState}`;
  const r = await fetchNoFollow(callbackUrl, { headers: { Cookie: oidcCookie } });
  assert.ok([301, 302, 303, 307, 308].includes(r.status), `expected redirect, got ${r.status}`);
  const location = r.headers.get('location');
  assert.ok(location.includes('oidc-relay.html'), `expected relay redirect, got ${location}`);
  const relayUrlObj = new URL(location, appBase);
  assert.ok(!relayUrlObj.searchParams.get('token'), 'session token must not be relayed via URL');
  assert.ok(relayUrlObj.searchParams.get('csrfToken'), 'csrfToken in relay URL');
  assert.ok(relayUrlObj.searchParams.get('user'), 'user in relay URL');
  assert.equal(relayUrlObj.searchParams.get('role'), 'reviewer', 'JIT user defaults to reviewer role');
  assert.ok(getSetCookieValue(r.headers, 'ctr_auth'), 'ctr_auth cookie set on callback');
  relayUrl = location;
});

await check('PKCE code_verifier was sent to token endpoint', async () => {
  assert.ok(idp.getCapturedVerifier(), 'code_verifier was sent');
  // Verifier must be base64url characters only
  assert.ok(/^[A-Za-z0-9_-]+$/.test(idp.getCapturedVerifier()), 'code_verifier is base64url');
});

// Test JIT provisioning: second login reuses same username
let firstUsername = null;
await check('second OIDC login for same sub reuses existing account', async () => {
  // Get first login's username from relay URL
  const relayParams = new URL(relayUrl, appBase).searchParams;
  firstUsername = relayParams.get('user');
  assert.ok(firstUsername, 'username captured from first login');

  // Perform second login flow
  const r2 = await fetchNoFollow(`${appBase}/auth/oidc/login`);
  const location2 = r2.headers.get('location');
  const state2 = new URL(location2).searchParams.get('state');
  const cookie2 = getCookieHeaderFromSetCookie(r2.headers.get('set-cookie'));
  const r3 = await fetchNoFollow(`${appBase}/auth/oidc/callback?code=stub_auth_code_abc123&state=${state2}`, {
    headers: { Cookie: cookie2 },
  });
  const location3 = r3.headers.get('location');
  const secondUsername = new URL(location3, appBase).searchParams.get('user');
  assert.equal(secondUsername, firstUsername, 'same username on re-login');
});

await check('JIT-provisioned user appears in admin users list', async () => {
  // Promote the provisioned user to admin so they can call the admin API
  const usersFile = path.join(tmpDir2, 'users.json');
  const rawUsers = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
  rawUsers[firstUsername].role = 'admin';
  await fs.writeFile(usersFile, JSON.stringify(rawUsers, null, 2));

  // Restart server to pick up role change
  await closeServer(appServer);
  const { server: srv2, port: p2 } = await startServer({
    dataDir: tmpDir2,
    rateLimit: { windowMs: 60000, max: 500 },
    enforceHttps: false,
  });

  // Login as OIDC user via another flow
  const r1 = await fetchNoFollow(`http://127.0.0.1:${p2}/auth/oidc/login`);
  const st = new URL(r1.headers.get('location')).searchParams.get('state');
  const cookie = getCookieHeaderFromSetCookie(r1.headers.get('set-cookie'));
  const r2 = await fetchNoFollow(`http://127.0.0.1:${p2}/auth/oidc/callback?code=stub_auth_code_abc123&state=${st}`, {
    headers: { Cookie: cookie },
  });
  const authCookieValue = getSetCookieValue(r2.headers, 'ctr_auth');
  assert.ok(authCookieValue, 'ctr_auth cookie issued on callback');

  const adminR = await fetch(`http://127.0.0.1:${p2}/api/v1/admin/users`, {
    headers: { Cookie: `ctr_auth=${authCookieValue}` },
  });
  assert.equal(adminR.status, 200);
  const body = await adminR.json();
  const provisionedUser = body.users.find(u => u.username === firstUsername);
  assert.ok(provisionedUser, 'provisioned user in list');
  assert.equal(provisionedUser.oidc, true, 'OIDC flag is true');

  await closeServer(srv2);
});

console.log('\nOIDC — Error handling');
const tmpDir3 = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-oidc3-'));
const { server: errServer, port: errPort } = await startServer({
  dataDir: tmpDir3,
  rateLimit: { windowMs: 60000, max: 500 },
  enforceHttps: false,
});
const errBase = `http://127.0.0.1:${errPort}`;
process.env.OIDC_REDIRECT_URI = `${errBase}/auth/oidc/callback`;

await check('callback with missing state redirects to login with error', async () => {
  const r = await fetchNoFollow(`${errBase}/auth/oidc/callback?code=abc`);
  assert.ok([301, 302, 303].includes(r.status));
  assert.ok(r.headers.get('location').includes('error='), 'error param in redirect');
});

await check('callback with unknown state redirects to login with error', async () => {
  const r = await fetchNoFollow(`${errBase}/auth/oidc/callback?code=abc&state=not_a_real_state`);
  assert.ok([301, 302, 303].includes(r.status));
  assert.ok(r.headers.get('location').includes('error='), 'error param in redirect');
});

await check('callback without OIDC state cookie is rejected', async () => {
  const login = await fetchNoFollow(`${errBase}/auth/oidc/login`);
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await fetchNoFollow(`${errBase}/auth/oidc/callback?code=stub_auth_code_abc123&state=${state}`);
  assert.ok([301, 302, 303].includes(callback.status));
  assert.ok(callback.headers.get('location').includes('oidc_state_invalid'), 'missing state cookie is rejected');
});

await check('callback with IdP error param redirects to login with error', async () => {
  const r = await fetchNoFollow(`${errBase}/auth/oidc/callback?error=access_denied&state=any`);
  assert.ok([301, 302, 303].includes(r.status));
  assert.ok(r.headers.get('location').includes('error='), 'error param in redirect');
});

await closeServer(errServer);

// Cleanup
await closeServer(idp.server);
await fs.rm(tmpDir, { recursive: true, force: true });
await fs.rm(tmpDir2, { recursive: true, force: true }).catch(() => {});
await fs.rm(tmpDir3, { recursive: true, force: true });
delete process.env.OIDC_ISSUER;
delete process.env.OIDC_CLIENT_ID;
delete process.env.OIDC_CLIENT_SECRET;
delete process.env.OIDC_REDIRECT_URI;

console.log('\nAll OIDC tests complete.');
