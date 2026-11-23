/**
 * Regression: tray ids containing '_' (TR_1, TR_2) were treated as one tray
 * because node ownership was parsed from the node id. Field edges between
 * them were skipped, so a 1 ft gap forced a ~50 ft detour.
 * Covers both the module router and the worker copy.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CableRoutingSystem as ModuleRouter } from '../src/routing/cableRoutingSystem.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerCode = readFileSync(join(__dirname, '..', 'routeWorker.js'), 'utf8');
const WorkerRouter = new Function('self', `${workerCode}\nreturn CableRoutingSystem;`)({ postMessage: () => {} });

const tray = (id, sx, ex) => ({
  tray_id: id, start_x: sx, start_y: 0, start_z: 10, end_x: ex, end_y: 0, end_z: 10,
  width: 12, height: 4, num_slots: 1, current_fill: 0
});

function route(Router, ids, gap) {
  const r = new Router({});
  r.addTraySegment(tray(ids[0], 0, 50));
  r.addTraySegment(tray(ids[1], 50 + gap, 100 + gap));
  return r.calculateRoute([0, 0, 0], [100 + gap, 0, 0], 0.5, '');
}

for (const [name, Router] of [['module', ModuleRouter], ['worker', WorkerRouter]]) {
  for (const gap of [1, 3]) {
    const res = route(Router, ['TR_1', 'TR_2'], gap);
    assert.ok(res.success, `${name} gap ${gap}: route should succeed`);
    assert.strictEqual(Math.round(res.field_routed_length), 20 + gap, `${name} gap ${gap}: field length`);
    assert.deepStrictEqual([...res.tray_segments].sort(), ['TR_1', 'TR_2'], `${name} gap ${gap}: both trays used`);
    assert.ok(res.route_segments.every(s => s.tray_id === 'TR_1' || s.tray_id === 'TR_2'), `${name}: segment tray ids are real trays`);
    const sum = res.route_segments.reduce((s, x) => s + x.length, 0);
    assert.ok(Math.abs(sum - res.total_length) < 1e-6, `${name}: total equals segment sum`);
    const hy = route(Router, ['TR-1', 'TR-2'], gap);
    assert.strictEqual(Math.round(hy.total_length), Math.round(res.total_length), `${name}: id style must not change length`);
  }
}
console.log('routing underscore tray id tests passed');
