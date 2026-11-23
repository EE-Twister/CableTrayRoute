import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const { encodeDesignSynthesisFaultScenarioBytes: encode, decodeDesignSynthesisFaultScenarioBytes: decode } = await import('../src/design-synthesis/applyProposal.mjs');

test('UTF-15 storage wire format matches an independent whole-integer bit decomposition', () => {
  for (let length = 0; length <= 63; length += 1) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 149 + length * 31) & 255);
    const integer = bytes.reduce((sum, byte, index) => sum + (BigInt(byte) << BigInt(index * 8)), 0n);
    const expected = Array.from({ length: Math.ceil(length * 8 / 15) }, (_, index) => (
      0x100 + Number((integer >> BigInt(index * 15)) & 0x7fffn)
    ));
    const actual = encode(bytes);
    assert.deepEqual([...actual].map(character => character.charCodeAt(0)), expected);
    assert.deepEqual(decode(String.fromCharCode(...expected), length), bytes);
    assert.equal(JSON.parse(JSON.stringify(actual)), actual);
  }
});

test('known little-endian payloads and nonzero trailing bits cannot silently decode differently', () => {
  assert.equal(encode(Uint8Array.of(0xff)), String.fromCharCode(0x1ff));
  assert.equal(encode(Uint8Array.of(0xff, 0xff)), String.fromCharCode(0x80ff, 0x101));
  assert.deepEqual(decode(String.fromCharCode(0x80ff, 0x101), 2), Uint8Array.of(0xff, 0xff));
  assert.equal(decode(String.fromCharCode(0x80ff, 0x103), 2), null);
  for (const illegal of [0, 0xff, 0x8100, 0xd800, 0xffff]) {
    assert.equal(decode(String.fromCharCode(illegal), 1), null);
  }
});
