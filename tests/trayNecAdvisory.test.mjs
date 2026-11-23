import assert from 'assert';
import { getTrayNecAdvisories } from '../src/routing/trayNecAdvisory.mjs';

// 12 in x 4 in ladder tray at 40% planning fill = 19.2 in², Table 392.22(A)(1) allows 14.0 in².
const deep = { tray_id: 'T1', width: 12, height: 4, tray_type: 'ladder' };
let adv = getTrayNecAdvisories([deep], 40);
assert.strictEqual(adv.length, 1);
assert.ok(Math.abs(adv[0].planningArea - 19.2) < 1e-9);
assert.strictEqual(adv[0].necArea, 14.0);

// Shallow tray: 12 x 2 x 40% = 9.6 in² <= 14.0, no advisory.
assert.strictEqual(getTrayNecAdvisories([{ tray_id: 'T2', width: 12, height: 2 }], 40).length, 0);
// Solid bottom has the smaller 11.0 in² allowance: 12 x 2 x 0.5 = 12 > 11.
assert.strictEqual(getTrayNecAdvisories([{ tray_id: 'T3', width: 12, height: 2, tray_type: 'solid' }], 50).length, 1);
// Width not in the table: nothing to compare against.
assert.strictEqual(getTrayNecAdvisories([{ tray_id: 'T4', width: 14, height: 6 }], 40).length, 0);

import { buildRoutingReadiness } from '../src/routing/routingReadinessModel.mjs';
const r = buildRoutingReadiness({ trayData: [{ ...deep, raceway_type: 'tray' }], cableList: [] });
assert.ok(r.warnings.some(w => w.includes('Table 392.22(A)(1)')));
console.log('tray NEC advisory tests passed');
