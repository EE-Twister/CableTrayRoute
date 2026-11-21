import assert from 'node:assert/strict';
import {
  SHARED_SESSION_KEY,
  clearSharedSession,
  fetchSharedProject,
  getSnapshotToken,
  isSharedSessionActive,
  readSharedSession,
  sharedLocalProjectName,
  uploadSharedProject,
  writeSharedSession,
} from '../src/sharedProjectApi.mjs';

const TOKEN = 'ab'.repeat(32);

const pending = [];
function check(name, fn) {
  const report = err => {
    if (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
    else console.log('  ✓', name);
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') pending.push(result.then(() => report(), report));
    else report();
  } catch (err) { report(err); }
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; },
    data,
  };
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

console.log('getSnapshotToken');
check('reads a valid 64-character hex token', () => {
  assert.equal(getSnapshotToken(`?snapshotToken=${TOKEN}`), TOKEN);
  assert.equal(getSnapshotToken(`?x=1&snapshotToken=${TOKEN}&y=2`), TOKEN);
});
check('rejects anything else', () => {
  for (const search of ['', '?snapshotToken=', '?snapshotToken=abc', `?snapshotToken=${TOKEN}zz`,
    `?snapshotToken=${TOKEN.toUpperCase()}`, '?snapshotToken=<script>', '?other=1']) {
    assert.equal(getSnapshotToken(search), null, search);
  }
});

console.log('sharedLocalProjectName');
check('keeps the shared copy under its own name', () => {
  assert.equal(sharedLocalProjectName('plant-1'), 'shared-plant-1');
});

console.log('shared session storage');
check('round-trips a valid session', () => {
  const storage = memoryStorage();
  const session = { token: TOKEN, project: 'plant-1', mode: 'edit', version: '17-abc' };
  assert.equal(writeSharedSession(storage, session), true);
  assert.deepEqual(readSharedSession(storage), session);
  clearSharedSession(storage);
  assert.equal(readSharedSession(storage), null);
});
check('refuses to store or read an invalid session', () => {
  const storage = memoryStorage();
  assert.equal(writeSharedSession(storage, { token: 'short', project: 'p', mode: 'edit', version: null }), false);
  assert.equal(writeSharedSession(storage, { token: TOKEN, project: '../etc', mode: 'edit', version: null }), false);
  assert.equal(writeSharedSession(storage, { token: TOKEN, project: 'p', mode: 'admin', version: null }), false);
  for (const raw of ['not json', '{}', JSON.stringify({ token: TOKEN, project: 'p', mode: 'owner', version: null })]) {
    assert.equal(readSharedSession(memoryStorage({ [SHARED_SESSION_KEY]: raw })), null);
  }
});
check('survives unavailable storage', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(readSharedSession(broken), null);
  assert.equal(writeSharedSession(broken, { token: TOKEN, project: 'p', mode: 'read', version: null }), false);
  clearSharedSession(broken);
});

console.log('isSharedSessionActive');
check('is active for a link in the URL or a remembered session, otherwise not', () => {
  const session = { token: TOKEN, project: 'plant-1', mode: 'read', version: null };
  const withSession = memoryStorage();
  writeSharedSession(withSession, session);
  assert.equal(isSharedSessionActive({ location: { search: `?snapshotToken=${TOKEN}` }, sessionStorage: memoryStorage() }), true);
  assert.equal(isSharedSessionActive({ location: { search: '' }, sessionStorage: withSession }), true);
  assert.equal(isSharedSessionActive({ location: { search: '' }, sessionStorage: memoryStorage() }), false);
  assert.equal(isSharedSessionActive({ location: { search: '?snapshotToken=junk' }, sessionStorage: memoryStorage() }), false);
  assert.equal(isSharedSessionActive(undefined), false);
  assert.equal(isSharedSessionActive({ location: { search: '' }, get sessionStorage() { throw new Error('denied'); } }), false);
});

console.log('fetchSharedProject');
check('returns the project, mode, latest version and data', async () => {
  const calls = [];
  const result = await fetchSharedProject(TOKEN, async url => {
    calls.push(url);
    return jsonResponse(200, {
      snapshot: { project: 'plant-1', mode: 'edit', version: 'old' },
      version: 'latest-1',
      data: { cables: [] },
    });
  });
  assert.deepEqual(calls, [`/shared/${TOKEN}`]);
  assert.deepEqual(result, { ok: true, project: 'plant-1', mode: 'edit', version: 'latest-1', data: { cables: [] } });
});
check('reports not_found for revoked or unknown links', async () => {
  assert.deepEqual(await fetchSharedProject(TOKEN, async () => jsonResponse(404, {})), { ok: false, reason: 'not_found' });
});
check('reports unavailable for network errors, server errors and bad payloads', async () => {
  assert.equal((await fetchSharedProject(TOKEN, async () => { throw new Error('offline'); })).reason, 'unavailable');
  assert.equal((await fetchSharedProject(TOKEN, async () => jsonResponse(500, {}))).reason, 'unavailable');
  const bad = [
    { snapshot: { project: '../x', mode: 'edit' }, data: {} },
    { snapshot: { project: 'p', mode: 'owner' }, data: {} },
    { snapshot: { project: 'p', mode: 'edit' }, data: null },
    {},
  ];
  for (const body of bad) {
    assert.equal((await fetchSharedProject(TOKEN, async () => jsonResponse(200, body))).reason, 'unavailable');
  }
});

console.log('uploadSharedProject');
check('posts data with the base version and returns the new version', async () => {
  let seen;
  const result = await uploadSharedProject({ token: TOKEN, baseVersion: 'v1', data: { a: 1 } }, async (url, init) => {
    seen = { url, init };
    return jsonResponse(200, { version: 'v2', unchanged: false });
  });
  assert.deepEqual(result, { ok: true, version: 'v2' });
  assert.equal(seen.url, `/shared/${TOKEN}`);
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { data: { a: 1 }, baseVersion: 'v1' });
});
check('maps conflict, read-only, missing and failure responses', async () => {
  const run = status => uploadSharedProject({ token: TOKEN, baseVersion: 'v1', data: {} },
    async () => jsonResponse(status, { currentVersion: 'v9' }));
  assert.deepEqual(await run(409), { ok: false, reason: 'conflict', currentVersion: 'v9' });
  assert.deepEqual(await run(403), { ok: false, reason: 'read_only' });
  assert.deepEqual(await run(404), { ok: false, reason: 'not_found' });
  assert.deepEqual(await run(500), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await uploadSharedProject({ token: TOKEN, data: {} }, async () => { throw new Error('x'); }),
    { ok: false, reason: 'unavailable' });
});

await Promise.all(pending);
