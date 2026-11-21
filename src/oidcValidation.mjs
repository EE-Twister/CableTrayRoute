import crypto from 'node:crypto';

const ALGORITHMS = Object.freeze({
  RS256: { hash: 'sha256', kty: 'RSA' },
  RS384: { hash: 'sha384', kty: 'RSA' },
  RS512: { hash: 'sha512', kty: 'RSA' },
  PS256: { hash: 'sha256', kty: 'RSA', pss: true },
  ES256: { hash: 'sha256', kty: 'EC', crv: 'P-256' },
  ES384: { hash: 'sha384', kty: 'EC', crv: 'P-384' },
});

export class IdTokenError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'IdTokenError';
    this.code = code;
  }
}

export function normalizeIssuer(issuer) {
  return String(issuer ?? '').replace(/\/+$/, '');
}

export function assertDiscoveryIssuer(discovery, configuredIssuer) {
  if (!discovery || typeof discovery !== 'object' || typeof discovery.issuer !== 'string') {
    throw new IdTokenError('discovery_invalid', 'OIDC discovery document has no issuer');
  }
  if (normalizeIssuer(discovery.issuer) !== normalizeIssuer(configuredIssuer)) {
    throw new IdTokenError('issuer_mismatch', 'OIDC discovery issuer does not match OIDC_ISSUER');
  }
}

export async function fetchJsonWithTimeout(url, { timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Request to ${url} failed: ${response.status}`);
  return response.json();
}

function decodeJsonSegment(segment, what) {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf-8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new IdTokenError('malformed', `ID token ${what} is not valid`);
  }
}

function selectKey(jwks, header, spec) {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const candidates = keys.filter(key =>
    key && key.kty === spec.kty && (key.use === undefined || key.use === 'sig'));
  if (typeof header.kid === 'string') {
    const match = candidates.find(key => key.kid === header.kid);
    if (!match) throw new IdTokenError('key_not_found', 'No signing key matches the ID token kid');
    return match;
  }
  if (candidates.length === 1) return candidates[0];
  throw new IdTokenError('key_not_found', 'ID token has no kid and the key set is ambiguous');
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Verify an OIDC ID token: signature against the IdP's JWKS (allow-listed
 * asymmetric algorithms only), then iss, aud/azp, exp, nbf, iat, sub and nonce.
 * Throws IdTokenError on any failure; returns the claims on success.
 */
export function verifyIdToken(token, options) {
  const {
    jwks, issuer, audience, nonce, now = Date.now(), clockSkewSec = 60,
  } = options || {};
  if (typeof token !== 'string') throw new IdTokenError('malformed', 'ID token is missing');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => part === '')) {
    throw new IdTokenError('malformed', 'ID token is not a compact JWS');
  }

  const header = decodeJsonSegment(parts[0], 'header');
  const spec = ALGORITHMS[header.alg];
  if (!spec) throw new IdTokenError('alg_not_allowed', `ID token algorithm ${String(header.alg)} is not allowed`);

  const jwk = selectKey(jwks, header, spec);
  if (spec.crv && jwk.crv !== spec.crv) {
    throw new IdTokenError('key_not_found', 'Signing key curve does not match the token algorithm');
  }

  let valid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const keyOptions = spec.kty === 'EC'
      ? { key: publicKey, dsaEncoding: 'ieee-p1363' }
      : spec.pss
        ? { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST }
        : { key: publicKey };
    valid = crypto.verify(
      spec.hash,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      keyOptions,
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new IdTokenError('bad_signature', 'ID token signature is invalid');

  const claims = decodeJsonSegment(parts[1], 'payload');
  const nowSec = Math.floor(now / 1000);

  if (typeof claims.iss !== 'string' || normalizeIssuer(claims.iss) !== normalizeIssuer(issuer)) {
    throw new IdTokenError('bad_issuer', 'ID token issuer does not match');
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) throw new IdTokenError('bad_audience', 'ID token audience does not include this client');
  if (audiences.length > 1 && claims.azp !== audience) {
    throw new IdTokenError('bad_audience', 'ID token has multiple audiences and a different authorized party');
  }
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp + clockSkewSec <= nowSec) {
    throw new IdTokenError('expired', 'ID token is expired or has no expiry');
  }
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - clockSkewSec > nowSec)) {
    throw new IdTokenError('not_yet_valid', 'ID token is not valid yet');
  }
  if (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat - clockSkewSec > nowSec)) {
    throw new IdTokenError('not_yet_valid', 'ID token was issued in the future');
  }
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new IdTokenError('bad_subject', 'ID token has no subject');
  }
  if (nonce !== undefined) {
    if (typeof claims.nonce !== 'string' || !constantTimeEqual(claims.nonce, nonce)) {
      throw new IdTokenError('bad_nonce', 'ID token nonce does not match');
    }
  }
  return claims;
}
