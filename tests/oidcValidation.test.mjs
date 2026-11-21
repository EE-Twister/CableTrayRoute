import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  IdTokenError,
  assertDiscoveryIssuer,
  fetchJsonWithTimeout,
  verifyIdToken,
} from '../src/oidcValidation.mjs';

const ISSUER = 'https://idp.example.com';
const CLIENT = 'client-1';
const NOW = 1_800_000_000_000;
const NOW_SEC = NOW / 1000;

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaJwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-1', use: 'sig', alg: 'RS256' };
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-1', use: 'sig', alg: 'ES256' };
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [rsaJwk, ecJwk] };

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function baseClaims(overrides = {}) {
  return {
    iss: ISSUER, aud: CLIENT, sub: 'user-1', nonce: 'n-1',
    iat: NOW_SEC - 10, exp: NOW_SEC + 600, ...overrides,
  };
}

function sign(claims, { alg = 'RS256', kid = 'rsa-1', privateKey = rsa.privateKey, header } = {}) {
  const head = header ?? { alg, typ: 'JWT', kid };
  const signingInput = `${b64(head)}.${b64(claims)}`;
  let signature;
  if (alg === 'none') return `${signingInput}.`;
  if (alg.startsWith('HS')) {
    signature = crypto.createHmac('sha256', JSON.stringify(rsaJwk)).update(signingInput).digest();
  } else if (alg === 'ES256') {
    signature = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  } else if (alg === 'PS256') {
    signature = crypto.sign('sha256', Buffer.from(signingInput), {
      key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
  } else {
    signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  }
  return `${signingInput}.${signature.toString('base64url')}`;
}

const verify = (token, extra = {}) => verifyIdToken(token, {
  jwks, issuer: ISSUER, audience: CLIENT, nonce: 'n-1', now: NOW, ...extra,
});

function rejects(token, code, extra) {
  assert.throws(() => verify(token, extra), err => err instanceof IdTokenError && err.code === code,
    `expected ${code}`);
}

const pending = [];
const keepAlive = setInterval(() => {}, 1000);
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

console.log('verifyIdToken - accepted tokens');
check('accepts an RS256 token and returns the claims', () => {
  assert.equal(verify(sign(baseClaims())).sub, 'user-1');
});
check('accepts ES256 and PS256 tokens', () => {
  assert.equal(verify(sign(baseClaims(), { alg: 'ES256', kid: 'ec-1', privateKey: ec.privateKey })).sub, 'user-1');
  assert.equal(verify(sign(baseClaims(), { alg: 'PS256' })).sub, 'user-1');
});
check('accepts a single audience list that contains the client', () => {
  assert.equal(verify(sign(baseClaims({ aud: [CLIENT] }))).sub, 'user-1');
});
check('accepts a trailing-slash difference in the issuer', () => {
  assert.equal(verify(sign(baseClaims({ iss: `${ISSUER}/` }))).sub, 'user-1');
});
check('accepts a token with no kid when the key set has one RSA key', () => {
  const token = sign(baseClaims(), { header: { alg: 'RS256', typ: 'JWT' } });
  assert.equal(verify(token).sub, 'user-1');
});
check('allows small clock skew on exp', () => {
  assert.equal(verify(sign(baseClaims({ exp: NOW_SEC - 30 }))).sub, 'user-1');
});

console.log('verifyIdToken - rejected tokens');
check('rejects a token signed by a different key', () => {
  rejects(sign(baseClaims(), { privateKey: other.privateKey }), 'bad_signature');
});
check('rejects a tampered payload', () => {
  const [head, , sig] = sign(baseClaims()).split('.');
  rejects(`${head}.${b64(baseClaims({ sub: 'admin' }))}.${sig}`, 'bad_signature');
});
check('rejects alg none, with or without a signature segment', () => {
  rejects(sign(baseClaims(), { alg: 'none' }), 'malformed');
  const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(baseClaims())}.junk`;
  rejects(forged, 'alg_not_allowed');
});
check('rejects HMAC algorithms (key confusion)', () => {
  rejects(sign(baseClaims(), { alg: 'HS256' }), 'alg_not_allowed');
});
check('rejects an unknown kid', () => {
  rejects(sign(baseClaims(), { kid: 'rotated-away' }), 'key_not_found');
});
check('rejects a missing kid when the key set is ambiguous', () => {
  const twoRsa = { keys: [rsaJwk, { ...other.publicKey.export({ format: 'jwk' }), kid: 'rsa-2' }] };
  rejects(sign(baseClaims(), { header: { alg: 'RS256' } }), 'key_not_found', { jwks: twoRsa });
});
check('rejects the wrong issuer', () => {
  rejects(sign(baseClaims({ iss: 'https://evil.example.com' })), 'bad_issuer');
});
check('rejects the wrong audience', () => {
  rejects(sign(baseClaims({ aud: 'other-client' })), 'bad_audience');
});
check('rejects multiple audiences without a matching azp', () => {
  rejects(sign(baseClaims({ aud: [CLIENT, 'other'] })), 'bad_audience');
  assert.equal(verify(sign(baseClaims({ aud: [CLIENT, 'other'], azp: CLIENT }))).sub, 'user-1');
});
check('rejects an expired token and a token with no exp', () => {
  rejects(sign(baseClaims({ exp: NOW_SEC - 3600 })), 'expired');
  const noExp = baseClaims();
  delete noExp.exp;
  rejects(sign(noExp), 'expired');
});
check('rejects a token issued in the future or not yet valid', () => {
  rejects(sign(baseClaims({ iat: NOW_SEC + 3600 })), 'not_yet_valid');
  rejects(sign(baseClaims({ nbf: NOW_SEC + 3600 })), 'not_yet_valid');
});
check('rejects a nonce mismatch or a missing nonce', () => {
  rejects(sign(baseClaims({ nonce: 'replayed' })), 'bad_nonce');
  const noNonce = baseClaims();
  delete noNonce.nonce;
  rejects(sign(noNonce), 'bad_nonce');
});
check('rejects a missing subject', () => {
  const noSub = baseClaims();
  delete noSub.sub;
  rejects(sign(noSub), 'bad_subject');
});
check('rejects malformed tokens', () => {
  for (const bad of ['', 'a.b', 'a.b.c.d', 'x.y.z', undefined, null, 42]) rejects(bad, 'malformed');
});
check('rejects a key of the wrong type for the algorithm', () => {
  rejects(sign(baseClaims(), { alg: 'ES256', kid: 'rsa-1', privateKey: ec.privateKey }), 'key_not_found');
});

console.log('assertDiscoveryIssuer');
check('accepts a matching issuer, with or without a trailing slash', () => {
  assertDiscoveryIssuer({ issuer: ISSUER }, ISSUER);
  assertDiscoveryIssuer({ issuer: `${ISSUER}/` }, ISSUER);
});
check('rejects a different or missing issuer', () => {
  assert.throws(() => assertDiscoveryIssuer({ issuer: 'https://evil.example.com' }, ISSUER), /does not match/);
  assert.throws(() => assertDiscoveryIssuer({}, ISSUER), /no issuer/);
});

console.log('fetchJsonWithTimeout');
check('returns parsed JSON and rejects on HTTP errors', async () => {
  const ok = await fetchJsonWithTimeout('https://x', { fetchImpl: async () => ({ ok: true, json: async () => ({ a: 1 }) }) });
  assert.deepEqual(ok, { a: 1 });
  await assert.rejects(() => fetchJsonWithTimeout('https://x', { fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
});
check('aborts a request that exceeds the timeout', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  await assert.rejects(() => fetchJsonWithTimeout('https://x', { timeoutMs: 20, fetchImpl: hang }));
});

await Promise.all(pending);
clearInterval(keepAlive);
