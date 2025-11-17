import assert from 'node:assert';
import { normalizeCablePhases, formatCablePhases } from '../utils/cablePhases.js';

const original = ['B', 'C'];
const savedValue = formatCablePhases(original);
assert.strictEqual(savedValue, 'B,C', 'phases should serialize as a comma string');
const rehydrated = normalizeCablePhases(savedValue);
assert.deepStrictEqual(rehydrated, original, 'phases should round-trip through save/edit cycle');

console.log('\u2713 cable phases persist through save/edit cycle');
