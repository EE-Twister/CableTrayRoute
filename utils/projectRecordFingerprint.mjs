// A relative ESM path also works when a browser imports the unbundled source.
// Production builds bundle this dependency into their entry points.
import { sha256 } from '../node_modules/@noble/hashes/sha2.js';
import { encodeDesignSynthesisFaultScenarioBytes } from './evidenceBinaryCodec.mjs';

// Match project JSON persistence while sorting keys without assigning names
// such as __proto__ to a newly created object.
export function canonicalProjectJSON(value) {
  const persisted = JSON.parse(JSON.stringify(value));
  function serialize(item) {
    if (Array.isArray(item)) return `[${item.map(serialize).join(',')}]`;
    if (item && typeof item === 'object') return `{${Object.keys(item).sort().map(name => `${JSON.stringify(name)}:${serialize(item[name])}`).join(',')}}`;
    return JSON.stringify(item);
  }
  return serialize(persisted);
}

// Synchronous hashing is needed by the atomic synchronous Apply transaction.
export function fingerprintProjectRecord(value) {
  return `sha256u-${encodeDesignSynthesisFaultScenarioBytes(sha256(new TextEncoder().encode(canonicalProjectJSON(value))))}`;
}

export function fingerprintProjectRecordHex(value) {
  const bytes = sha256(new TextEncoder().encode(canonicalProjectJSON(value)));
  return `sha256-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function matchesProjectRecordFingerprint(value, stored) {
  const bytes = sha256(new TextEncoder().encode(canonicalProjectJSON(value)));
  if (typeof stored === 'string' && stored.startsWith('sha256-')) {
    return stored === `sha256-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return stored === `sha256u-${encodeDesignSynthesisFaultScenarioBytes(bytes)}`;
}
