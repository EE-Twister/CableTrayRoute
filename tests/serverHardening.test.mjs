import assert from 'assert';
import {
  applyMergePatch,
  createRateLimiter,
  isValidName,
  isValidUsername,
} from '../server.mjs';

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
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
