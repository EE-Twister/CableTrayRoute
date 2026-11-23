import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { compressFaultBytes, decompressFaultBytes, encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes } from './evidenceBinaryCodec.mjs';

export const DEVICE_EVIDENCE_STORAGE_KEY = 'designSynthesisDeviceEvidence';
export const COMPACT_SYNTHESIS_KEYS = Object.freeze([DEVICE_EVIDENCE_STORAGE_KEY, 'designSynthesisLastApplied', 'designSynthesisInputEvidence']);
export const isCompactSynthesisKey = key => COMPACT_SYNTHESIS_KEYS.includes(key);
export const DEVICE_EVIDENCE_ENCODING = 'design-synthesis-device-evidence-lz77-utf15-v1';
const ENCODING_PREFIX = 'design-synthesis-device-evidence-';
// Never use compression to bypass the existing 2.5 MiB per-scenario entry
// threshold. The additional byte bound limits synchronous codec work.
const MAX_ORIGINAL_CHARACTERS = 2.5 * 1024 * 1024;
const MAX_CODEC_BYTES = 1_000_000;
const ENVELOPE_KEYS = ['compressedByteLength', 'encoding', 'payload', 'payloadFingerprint', 'uncompressedByteLength'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isDeviceEvidenceEnvelope(value) {
  return plain(value) && ((typeof value.encoding === 'string' && value.encoding.startsWith(ENCODING_PREFIX))
    || ['payload', 'payloadFingerprint', 'compressedByteLength', 'uncompressedByteLength'].every(key => Object.prototype.hasOwnProperty.call(value, key)));
}

function sameJsonValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) && ![Object.prototype, null].includes(Object.getPrototypeOf(left))) return false;
  const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]));
}

/** Preserve legacy maps and non-JSON values when packing would change them. */
export function packDeviceEvidence(value) {
  if (!plain(value) || isDeviceEvidenceEnvelope(value)) return value;
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > MAX_ORIGINAL_CHARACTERS || !sameJsonValue(value, JSON.parse(json))) return value;
    const bytes = new TextEncoder().encode(json);
    if (!bytes.length || bytes.length > MAX_CODEC_BYTES) return value;
    const compressed = compressFaultBytes(bytes);
    if (!compressed.length || compressed.length > MAX_CODEC_BYTES) return value;
    const result = { encoding: DEVICE_EVIDENCE_ENCODING, uncompressedByteLength: bytes.length,
      compressedByteLength: compressed.length, payload: encodeDesignSynthesisFaultScenarioBytes(compressed),
      payloadFingerprint: fingerprintStudyValue(value) };
    return JSON.stringify(result).length < json.length ? result : value;
  } catch {
    // Existing storage behavior handles unsupported values; do not transform or
    // discard them as a side effect of an optional compression attempt.
    return value;
  }
}

/** Invalid or future envelopes remain intact so callers can report and preserve them. */
export function unpackDeviceEvidence(value) {
  if (!isDeviceEvidenceEnvelope(value) || value.encoding !== DEVICE_EVIDENCE_ENCODING) return value;
  try {
    const keys = Object.keys(value).sort();
    if (keys.length !== ENVELOPE_KEYS.length || !keys.every((key, index) => key === ENVELOPE_KEYS[index])
        || !Number.isSafeInteger(value.uncompressedByteLength) || value.uncompressedByteLength < 1 || value.uncompressedByteLength > MAX_CODEC_BYTES
        || !Number.isSafeInteger(value.compressedByteLength) || value.compressedByteLength < 1 || value.compressedByteLength > MAX_CODEC_BYTES
        || typeof value.payloadFingerprint !== 'string') return value;
    const compressed = decodeDesignSynthesisFaultScenarioBytes(value.payload, value.compressedByteLength);
    if (!compressed) return value;
    const bytes = decompressFaultBytes(compressed, value.uncompressedByteLength);
    if (!bytes) return value;
    const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!plain(decoded) || isDeviceEvidenceEnvelope(decoded) || fingerprintStudyValue(decoded) !== value.payloadFingerprint) return value;
    return decoded;
  } catch {
    return value;
  }
}

export function packProjectDeviceEvidence(project) {
  const settings = project?.settings;
  if (!plain(project) || !plain(settings)) return project;
  const next = { ...settings };
  for (const key of COMPACT_SYNTHESIS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) next[key] = packDeviceEvidence(settings[key]);
  }
  return { ...project, settings: next };
}

export function unpackProjectDeviceEvidence(project) {
  const settings = project?.settings;
  if (!plain(project) || !plain(settings)) return project;
  const next = { ...settings };
  for (const key of COMPACT_SYNTHESIS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) next[key] = unpackDeviceEvidence(settings[key]);
  }
  return { ...project, settings: next };
}
