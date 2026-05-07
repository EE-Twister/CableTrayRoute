import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  VALID_ACTIONS,
  computeEntryHash,
  buildEntry,
  appendAuditEntry,
  queryAuditLog,
  verifyEntry,
} from '../analysis/auditLog.mjs';

let tmpDir;

async function setup() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-audit-'));
}

async function teardown() {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

await setup();

console.log('Audit Log — VALID_ACTIONS');
check('contains LOGIN', () => assert.ok(VALID_ACTIONS.includes('LOGIN')));
check('contains ROLE_CHANGE', () => assert.ok(VALID_ACTIONS.includes('ROLE_CHANGE')));
check('contains UPDATE', () => assert.ok(VALID_ACTIONS.includes('UPDATE')));

console.log('\nAudit Log — buildEntry');
check('returns id, ts, reqHash', () => {
  const e = buildEntry({ actor: 'alice', action: 'CREATE', entityType: 'project', entityId: 'proj1' });
  assert.ok(typeof e.id === 'string' && e.id.length > 0, 'has id');
  assert.ok(typeof e.ts === 'string' && e.ts.length > 0, 'has ts');
  assert.ok(typeof e.reqHash === 'string' && e.reqHash.length === 64, 'reqHash is 64-char hex');
  assert.equal(e.actor, 'alice');
  assert.equal(e.action, 'CREATE');
  assert.equal(e.entityType, 'project');
  assert.equal(e.entityId, 'proj1');
});

check('diff field stored', () => {
  const diff = [{ op: 'replace', path: '/name', value: 'New' }];
  const e = buildEntry({ actor: 'bob', action: 'UPDATE', diff });
  assert.deepEqual(e.diff, diff);
});

check('null fields default to null', () => {
  const e = buildEntry({ actor: 'bob', action: 'UPDATE' });
  assert.equal(e.entityType, null);
  assert.equal(e.entityId, null);
  assert.equal(e.projectId, null);
  assert.equal(e.diff, null);
});

console.log('\nAudit Log — computeEntryHash');
check('deterministic', () => {
  const params = { id: 'x', actor: 'a', ts: '2026-01-01T00:00:00.000Z', action: 'CREATE', entityId: 'e' };
  assert.equal(computeEntryHash(params), computeEntryHash(params));
});
check('changes when id changes', () => {
  const base = { id: 'x', actor: 'a', ts: '2026-01-01T00:00:00.000Z', action: 'CREATE', entityId: 'e' };
  const h1 = computeEntryHash(base);
  const h2 = computeEntryHash({ ...base, id: 'y' });
  assert.notEqual(h1, h2);
});

console.log('\nAudit Log — verifyEntry');
check('valid entry passes', () => {
  const e = buildEntry({ actor: 'carol', action: 'LOGIN', entityType: 'session', entityId: null });
  assert.ok(verifyEntry(e));
});
check('tampered reqHash fails', () => {
  const e = buildEntry({ actor: 'carol', action: 'LOGIN' });
  const tampered = { ...e, reqHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  assert.ok(!verifyEntry(tampered));
});
check('tampered actor fails', () => {
  const e = buildEntry({ actor: 'carol', action: 'DELETE', entityId: 'p1' });
  const tampered = { ...e, actor: 'mallory' };
  assert.ok(!verifyEntry(tampered));
});
check('null entry returns false', () => {
  assert.ok(!verifyEntry(null));
});
check('entry without reqHash returns false', () => {
  const e = buildEntry({ actor: 'carol', action: 'LOGIN' });
  const { reqHash: _, ...noHash } = e;
  assert.ok(!verifyEntry(noHash));
});

console.log('\nAudit Log — appendAuditEntry');
const logPath = path.join(tmpDir, 'audit.ndjson');

await checkAsync('appends entry to file', async () => {
  const e = await appendAuditEntry(logPath, { actor: 'alice', action: 'CREATE', entityType: 'project', entityId: 'p1' });
  assert.ok(typeof e.id === 'string');
  const content = await fs.readFile(logPath, 'utf-8');
  const parsed = JSON.parse(content.trim());
  assert.equal(parsed.actor, 'alice');
  assert.equal(parsed.action, 'CREATE');
});

await checkAsync('appends multiple entries, each on its own line', async () => {
  await appendAuditEntry(logPath, { actor: 'bob', action: 'UPDATE', entityId: 'p1' });
  await appendAuditEntry(logPath, { actor: 'carol', action: 'DELETE', entityId: 'p2' });
  const lines = (await fs.readFile(logPath, 'utf-8')).trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 3, 'three log lines total');
  assert.ok(lines.every(l => { try { JSON.parse(l); return true; } catch { return false; } }), 'all lines are valid JSON');
});

console.log('\nAudit Log — queryAuditLog');
await checkAsync('returns empty array for non-existent log', async () => {
  const missing = path.join(tmpDir, 'missing.ndjson');
  const result = await queryAuditLog(missing);
  assert.deepEqual(result, []);
});

await checkAsync('filter by actor', async () => {
  const filtered = await queryAuditLog(logPath, { actor: 'bob' });
  assert.ok(filtered.length === 1 && filtered[0].actor === 'bob');
});

await checkAsync('filter by action', async () => {
  const filtered = await queryAuditLog(logPath, { action: 'DELETE' });
  assert.ok(filtered.every(e => e.action === 'DELETE'));
  assert.equal(filtered.length, 1);
});

await checkAsync('filter by entityId', async () => {
  const filtered = await queryAuditLog(logPath, { entityId: 'p1' });
  assert.ok(filtered.length >= 2, 'p1 appears in multiple entries');
});

await checkAsync('limit parameter respected', async () => {
  const filtered = await queryAuditLog(logPath, { limit: 2 });
  assert.ok(filtered.length <= 2);
});

await checkAsync('after filter excludes older entries', async () => {
  const now = Date.now();
  const futureFilter = await queryAuditLog(logPath, { after: now + 60000 });
  assert.equal(futureFilter.length, 0, 'nothing after future timestamp');
});

await checkAsync('before filter excludes newer entries', async () => {
  const pastFilter = await queryAuditLog(logPath, { before: Date.now() - 60000 });
  assert.equal(pastFilter.length, 0, 'nothing before past timestamp');
});

await teardown();
console.log('\nAll audit log tests complete.');
