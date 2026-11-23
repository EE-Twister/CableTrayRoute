/**
 * The conduit internal-area table lives in analysis/conduitFill.mjs. Pages import it;
 * the only remaining copy is thermalWorker.js (a classic-script worker that cannot
 * import). This test keeps that copy identical for the types it carries and ensures
 * no other source file re-declares the table.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CONDUIT_INTERNAL_AREA_IN2 } from '../analysis/conduitFill.mjs';
import { CONDUIT_SPECS as thermalSpecs } from '../src/ductbank-route/thermalPrimitives.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(root, file), 'utf8');

const worker = read('thermalWorker.js');
const start = worker.indexOf('const CONDUIT_SPECS');
const open = worker.indexOf('{', start);
let depth = 0;
let end = open;
for (; end < worker.length; end++) {
  if (worker[end] === '{') depth++;
  if (worker[end] === '}' && --depth === 0) break;
}
const workerSpecs = new Function(`return ${worker.slice(open, end + 1)}`)();

assert.ok(Object.keys(workerSpecs).length >= 3, 'worker table should list conduit types');
for (const [type, sizes] of Object.entries(workerSpecs)) {
  assert.deepStrictEqual(sizes, CONDUIT_INTERNAL_AREA_IN2[type], `thermalWorker.js ${type} drifted from analysis/conduitFill.mjs`);
}
for (const [type, sizes] of Object.entries(thermalSpecs)) {
  assert.deepStrictEqual(sizes, CONDUIT_INTERNAL_AREA_IN2[type], `thermalPrimitives ${type} drifted`);
}

for (const file of ['conduitfill.js', 'app.mjs', 'src/racewayschedule.js']) {
  assert.ok(!/"PVC Type EB"\s*:\s*\{/.test(read(file)), `${file} must import the shared conduit table instead of declaring it`);
}
assert.strictEqual(CONDUIT_INTERNAL_AREA_IN2.EMT['1'], 0.864);
console.log('conduit specs single-source tests passed');
