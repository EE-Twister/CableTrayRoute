import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalProjectJSON, fingerprintProjectRecord, fingerprintProjectRecordHex, matchesProjectRecordFingerprint } from '../utils/projectRecordFingerprint.mjs';
import { decodeDesignSynthesisFaultScenarioBytes } from '../utils/evidenceBinaryCodec.mjs';

test('canonical ownership digests agree with Node SHA-256 across block boundaries and Unicode', () => {
  for (const length of [0, 1, 54, 55, 56, 63, 64, 65, 127, 128, 1024, 65536]) {
    const value = { b: 'é😀'.repeat(length), a: [length, null, false] };
    const canonical = canonicalProjectJSON(value);
    const digest = fingerprintProjectRecord(value);
    assert.ok(digest.startsWith('sha256u-'));
    assert.deepEqual(Buffer.from(decodeDesignSynthesisFaultScenarioBytes(digest.slice(8), 32)), createHash('sha256').update(canonical, 'utf8').digest());
    assert.equal(fingerprintProjectRecordHex(value), `sha256-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`);
    assert.equal(matchesProjectRecordFingerprint(value, digest), true);
    assert.equal(matchesProjectRecordFingerprint(value, `sha256-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`), true);
    assert.equal(matchesProjectRecordFingerprint(value, 'sha256-invalid'), false);
    assert.equal(fingerprintProjectRecord(value), fingerprintProjectRecord({ a: [length, null, false], b: 'é😀'.repeat(length) }));
  }
  const special = JSON.parse('{"__proto__":{"changed":true},"name":"test"}');
  assert.notEqual(fingerprintProjectRecord(special), fingerprintProjectRecord({ name: 'test' }));
});
