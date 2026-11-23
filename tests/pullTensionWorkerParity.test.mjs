/**
 * routeWorker.js (a classic script) carries a fallback copy of the pull-tension model.
 * It must agree with src/pullCalc.js, including the gravity term on inclined runs.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calcPullTension } from '../src/pullCalc.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'routeWorker.js'), 'utf8');
const workerCalc = new Function('self', `${code}\nreturn calcPullTension;`)({ postMessage: () => {} });

const segs = [
  { type: 'straight', length: 50, rise: 0 },
  { type: 'bend', length: 3 * Math.PI / 2, angle: Math.PI / 2, radius: 3 },
  { type: 'straight', length: 30, rise: 30 },
  { type: 'straight', length: 20, rise: -5 },
];
const props = { weight: 2, mu: 0.35, sizeKcmil: 500, outerDiameterIn: 1.1 };
const a = calcPullTension(segs, props);
const b = workerCalc(segs, props);
for (const key of ['totalTension', 'maxTension', 'maxSidewallPressure']) {
  assert.ok(Math.abs(a[key] - b[key]) < 1e-6, `${key}: module ${a[key]} vs worker ${b[key]}`);
}
assert.ok(a.totalTension > 2 * 0.35 * 100 + 50, 'riser gravity term is included');
console.log('pull tension worker parity tests passed');
