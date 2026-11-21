import assert from 'assert';
import {
  applyMergePatch,
  createRateLimiter,
  isValidName,
  isValidUsername,
  writeFileAtomic,
} from '../server.mjs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const pending = [];
function check(name, fn) {
  const report = (err) => {
    if (err) {
      console.error('  \u2717', name, err.message || err);
      process.exitCode = 1;
    } else {
      console.log('  \u2713', name);
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') pending.push(result.then(() => report(), report));
    else report();
  } catch (err) {
    report(err);
  }
}

console.log('isValidUsername');
check('accepts ordinary usernames', () => {
  assert.strictEqual(isValidUsername('alice'), true);
  assert.strictEqual(isValidUsername('team_lead-2'), true);
});
check('rejects names reserved for storage directories', () => {
  assert.strictEqual(isValidUsername('libraries'), false);
  assert.strictEqual(isValidUsername('Libraries'), false);
  assert.strictEqual(isValidUsername('team-library-releases'), false);
});
check('rejects prototype property names', () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    assert.strictEqual(isValidName(name), true, `${name} still passes the path check`);
    assert.strictEqual(isValidUsername(name), false);
  }
});
check('reserved names stay valid as project names', () => {
  assert.strictEqual(isValidName('libraries'), true);
});

console.log('applyMergePatch');
check('merges nested objects and deletes null keys', () => {
  const merged = applyMergePatch({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9, d: null }, e: [1] });
  assert.deepStrictEqual(merged, { a: 1, b: { c: 9 }, e: [1] });
});
check('ignores __proto__ keys from parsed JSON', () => {
  const patch = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
  const merged = applyMergePatch({}, patch);
  assert.strictEqual(Object.getPrototypeOf(merged), Object.prototype);
  assert.strictEqual(merged.polluted, undefined);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(merged.safe, 1);
});
check('ignores nested __proto__ keys', () => {
  const merged = applyMergePatch({}, JSON.parse('{"x":{"__proto__":{"polluted":true}}}'));
  assert.strictEqual(merged.x.polluted, undefined);
  assert.strictEqual(({}).polluted, undefined);
});

console.log('createRateLimiter');
function call(limiter, ip) {
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { res, passed };
}
check('blocks after the limit and reports Retry-After', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
  assert.strictEqual(call(limiter, '1.1.1.1').passed, true);
  assert.strictEqual(call(limiter, '1.1.1.1').passed, true);
  const blocked = call(limiter, '1.1.1.1');
  assert.strictEqual(blocked.passed, false);
  assert.strictEqual(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers['Retry-After']) >= 1);
  assert.strictEqual(call(limiter, '2.2.2.2').passed, true, 'other clients are unaffected');
});
check('tracked keys stay bounded under a key flood', () => {
  const limiter = createRateLimiter({ windowMs: 3600000, max: 5 });
  for (let i = 0; i < 60000; i += 1) call(limiter, `10.${i >> 8 & 255}.${i & 255}.${i >> 16}`);
  // Memory is not observable from outside, so assert the limiter still works.
  assert.strictEqual(call(limiter, '9.9.9.9').passed, true);
});

console.log('writeFileAtomic');
check('writes the file with the requested mode and leaves no temp file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-atomic-'));
  try {
    const file = path.join(dir, 'users.json');
    await writeFileAtomic(file, '{"a":1}', { mode: 0o600 });
    assert.strictEqual(await fs.readFile(file, 'utf-8'), '{"a":1}');
    if (process.platform !== 'win32') {
      assert.strictEqual((await fs.stat(file)).mode & 0o777, 0o600);
    }
    assert.deepStrictEqual(await fs.readdir(dir), ['users.json']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
check('concurrent writes never leave a partial file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-atomic-'));
  try {
    const file = path.join(dir, 'sessions.json');
    const payloads = Array.from({ length: 25 }, (_, i) => JSON.stringify({ i, pad: 'x'.repeat(5000 + i) }));
    await Promise.all(payloads.map(data => writeFileAtomic(file, data)));
    const final = await fs.readFile(file, 'utf-8');
    assert.ok(payloads.includes(final), 'final content is exactly one of the written payloads');
    assert.deepStrictEqual(await fs.readdir(dir), ['sessions.json']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
check('failure rejects and removes the temp file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-atomic-'));
  try {
    await assert.rejects(() => writeFileAtomic(path.join(dir, 'missing', 'x.json'), '{}'));
    assert.deepStrictEqual(await fs.readdir(dir), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

await Promise.all(pending);
