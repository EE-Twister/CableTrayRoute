import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDesignSynthesisFaultBranchCurrents, resolveDesignSynthesisFaultSourceTerminalCurrents } from '../src/design-synthesis/applyProposal.mjs';

// Independent wire fixture. No production encoder, compressor, floating-point
// writer or decoder helper constructs these expected little-endian streams.
function wire(bytes) {
  const integer = bytes.reduce((sum, byte, index) => sum + (BigInt(byte) << BigInt(index * 8)), 0n);
  return Array.from({ length: Math.ceil(bytes.length * 8 / 15) }, (_, index) =>
    String.fromCharCode(0x100 + Number((integer >> BigInt(index * 15)) & 0x7fffn))).join('');
}
const dictionary = Buffer.from('000000000000e03f000000000000f43f', 'hex'); // .5, 1.25
const sourceBytes = Buffer.from('000000000000e03f000000000000f43f000000000000f87f0000000000000440', 'hex'); // .5, 1.25, quiet NaN, 2.5
const codes16 = Buffer.from([7, 0, 0, 1, 0, 255, 255, 0, 0]); // one eight-byte LZ literal run
const codes32 = Buffer.from([15, 0, 0, 0, 0, 1, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0]);
function record(width = 16, legacy = false) {
  const codes = width === 16 ? codes16 : codes32;
  return {
    branchDutyEncoding: `uint${width}-index-lz77-float64-le-${legacy ? 'base64' : 'utf15'}-v1`,
    branchIds: ['CABLE'], cases: [{ busId: 'FAULT-A' }, { busId: 'FAULT-B' }], branchDutyValueCount: 4,
    ...(legacy ? {
      branchDutyValueDictionaryBase64: dictionary.toString('base64'), branchDutyCodesBase64: codes.toString('base64')
    } : {
      branchDutyValueDictionaryCount: 2, branchDutyValueDictionaryUtf15: wire(dictionary),
      branchDutyCodeByteCount: codes.length, branchDutyCodesUtf15: wire(codes)
    }),
    sourceTerminalSourceIds: ['UTILITY', 'MOTOR'], sourceTerminalValueCount: 4,
    sourceTerminalEncoding: `float64-le-${legacy ? 'base64' : 'utf15'}-v1`,
    ...(legacy ? { sourceTerminalCurrentsBase64: sourceBytes.toString('base64') } : { sourceTerminalCurrentsUtf15: wire(sourceBytes) })
  };
}

for (const width of [16, 32]) test(`${width}-bit UTF15 and legacy records recover exact independent Float64/sentinel fixtures`, () => {
  for (const legacy of [false, true]) {
    const saved = JSON.parse(JSON.stringify(record(width, legacy)));
    assert.deepEqual(resolveDesignSynthesisFaultBranchCurrents(saved, saved.cases[0]), [{ branchId: 'CABLE', fromCurrentKA: 0.5, toCurrentKA: 1.25 }]);
    assert.deepEqual(resolveDesignSynthesisFaultBranchCurrents(saved, saved.cases[1]), [{ branchId: 'CABLE', fromCurrentKA: null, toCurrentKA: 0.5 }]);
    assert.deepEqual(resolveDesignSynthesisFaultSourceTerminalCurrents(saved, saved.cases[0]), [{ sourceId: 'UTILITY', currentKA: 0.5 }, { sourceId: 'MOTOR', currentKA: 1.25 }]);
    assert.deepEqual(resolveDesignSynthesisFaultSourceTerminalCurrents(saved, saved.cases[1]), [{ sourceId: 'UTILITY', currentKA: null }, { sourceId: 'MOTOR', currentKA: 2.5 }]);
  }
});

test('UTF15 branch stream rejects malformed lengths, counts, code units, padding, dictionaries and indexes', () => {
  const mutations = [
    saved => { saved.branchDutyEncoding = 'unknown-format'; },
    saved => { saved.branchDutyValueCount += 1; },
    saved => { saved.branchDutyValueDictionaryCount = -1; },
    saved => { saved.branchDutyValueDictionaryCount = 0.5; },
    saved => { saved.branchDutyValueDictionaryCount = 5; },
    saved => { saved.branchDutyCodeByteCount = 1e9; },
    saved => { saved.branchDutyCodesUtf15 += 'x'; },
    saved => { saved.branchDutyCodesUtf15 = `\u0000${saved.branchDutyCodesUtf15.slice(1)}`; },
    saved => {
      const text = saved.branchDutyCodesUtf15;
      saved.branchDutyCodesUtf15 = text.slice(0, -1) + String.fromCharCode(text.charCodeAt(text.length - 1) + (1 << 12));
    },
    saved => { saved.branchDutyValueDictionaryUtf15 = wire(Buffer.from('000000000000e0bf000000000000f43f', 'hex')); },
    saved => { saved.branchDutyValueDictionaryUtf15 = wire(Buffer.from('000000000000f07f000000000000f43f', 'hex')); },
    saved => { saved.branchDutyCodesUtf15 = wire(Buffer.from([7, 0, 0, 2, 0, 255, 255, 0, 0])); },
    saved => { saved.branchDutyCodeByteCount = 8; saved.branchDutyCodesUtf15 = wire(codes16.subarray(0, 8)); }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const saved = record(); mutate(saved);
    assert.equal(resolveDesignSynthesisFaultBranchCurrents(saved, saved.cases[0]), null, `Malformed branch fixture ${index}`);
  }
});

test('UTF15 source stream rejects malformed bounds and preserves independent missing-current semantics', () => {
  const mutations = [
    saved => { saved.sourceTerminalEncoding = 'unknown-format'; },
    saved => { saved.sourceTerminalValueCount += 1; },
    saved => { saved.sourceTerminalSourceIds = ['UTILITY', 'UTILITY']; },
    saved => { saved.sourceTerminalCurrentsUtf15 += 'x'; },
    saved => { saved.sourceTerminalCurrentsUtf15 = `\u0000${saved.sourceTerminalCurrentsUtf15.slice(1)}`; },
    saved => {
      const text = saved.sourceTerminalCurrentsUtf15;
      saved.sourceTerminalCurrentsUtf15 = text.slice(0, -1) + String.fromCharCode(text.charCodeAt(text.length - 1) + 2);
    },
    saved => { saved.sourceTerminalCurrentsUtf15 = wire(Buffer.from('000000000000e0bf000000000000f43f000000000000f87f0000000000000440', 'hex')); }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const saved = record(); mutate(saved);
    assert.equal(resolveDesignSynthesisFaultSourceTerminalCurrents(saved, saved.cases[0]), null, `Malformed source fixture ${index}`);
  }
});
