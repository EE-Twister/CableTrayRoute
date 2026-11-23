import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVICE_EVIDENCE_ENCODING, isDeviceEvidenceEnvelope, packDeviceEvidence, unpackDeviceEvidence } from '../utils/designSynthesisDeviceEvidenceCodec.mjs';
import { compressFaultBytes, encodeDesignSynthesisFaultScenarioBytes } from '../utils/evidenceBinaryCodec.mjs';
import { repairMojibakeDeep } from '../src/textEncoding.js';

function sample() {
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`fnv1a-${String(index).padStart(8, '0')}`, {
    id: `device-${index}`, voltage: index % 2 ? 208 : 480, manufacturer: 'Eaton',
    sources: Array.from({ length: 5 }, (_, source) => ({ url: `https://example.org/catalog/${source}`, description: 'Shared source evidence including Ω and café 🧰'.repeat(8) })),
    nullable: null, values: [0, 0.125, 1e-18, 1e12],
  }]));
}

test('repetitive evidence packs losslessly and survives project text repair', () => {
  const original = sample();
  const packed = packDeviceEvidence(original);
  assert.equal(packed.encoding, DEVICE_EVIDENCE_ENCODING);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(original).length / 2);
  assert.deepEqual(unpackDeviceEvidence(packed), original);
  assert.deepEqual(unpackDeviceEvidence(JSON.parse(JSON.stringify(packed))), original);
  assert.deepEqual(repairMojibakeDeep(packed), packed);
});

test('legacy, unknown and damaged envelopes are preserved rather than guessed', () => {
  const legacy = sample();
  assert.equal(unpackDeviceEvidence(legacy), legacy);
  const packed = packDeviceEvidence(legacy);
  const missingEncoding = { ...packed }; delete missingEncoding.encoding;
  const damaged = [
    { ...packed, payload: packed.payload.slice(1) },
    { ...packed, uncompressedByteLength: 1_000_001 },
    { ...packed, compressedByteLength: -1 },
    { ...packed, payloadFingerprint: 'fnv1a-00000000' },
    { ...packed, extra: 'unexpected' },
    missingEncoding,
    { ...packed, encoding: 'damaged-marker' },
    { ...packed, encoding: 'design-synthesis-device-evidence-future-v2' },
  ];
  for (const item of damaged) {
    assert.ok(isDeviceEvidenceEnvelope(item));
    assert.equal(unpackDeviceEvidence(item), item);
    assert.equal(packDeviceEvidence(item), item);
  }
  const bytes = Uint8Array.from([255]);
  const compressed = compressFaultBytes(bytes);
  const invalidUtf8 = { encoding: DEVICE_EVIDENCE_ENCODING, uncompressedByteLength: 1,
    compressedByteLength: compressed.length, payload: encodeDesignSynthesisFaultScenarioBytes(compressed), payloadFingerprint: 'fnv1a-00000000' };
  assert.equal(unpackDeviceEvidence(invalidUtf8), invalidUtf8);
});

test('packing does not alter values that JSON cannot represent exactly', () => {
  for (const special of [-0, Number.NaN, Infinity, undefined, new Date('2026-01-01T00:00:00Z')]) {
    const value = { first: special, repeated: 'long evidence '.repeat(100) };
    assert.equal(packDeviceEvidence(value), value);
  }
  const sparse = []; sparse[2] = 'value';
  const withSparseArray = { sparse, repeated: 'long evidence '.repeat(100) };
  assert.equal(packDeviceEvidence(withSparseArray), withSparseArray);
});

test('input larger than the codec work bound stays in its original form', () => {
  const large = { repeated: 'x'.repeat(1_000_001) };
  assert.equal(packDeviceEvidence(large), large);
});
