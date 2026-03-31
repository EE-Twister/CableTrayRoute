/**
 * Tests for multi-slot per-slot fill tracking in CableRoutingSystem.
 *
 * Covers:
 *   1. addTraySegment parses slot_groups JSON into a Map correctly
 *   2. _findSlotForCable routes to the correct group-matched slot
 *   3. updateTrayFill increments only the matching slot's fill
 *   4. Routing works when one slot is full but another has capacity
 *   5. Backward compatibility: num_slots=1 behaves identically to old code
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, '..', 'routeWorker.js'), 'utf8');
const sandbox = { console, self: { postMessage: () => {} }, globalThis };
createContext(sandbox);
runInContext(code + '\nthis.CableRoutingSystem = CableRoutingSystem;', sandbox);
const { CableRoutingSystem } = sandbox;

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// Helper — build a minimal tray object
// ---------------------------------------------------------------------------
function makeTray(id, opts = {}) {
  return {
    tray_id: id,
    width:  opts.width  ?? 12,   // inches
    height: opts.height ?? 4,    // inches
    num_slots:   opts.num_slots   ?? 1,
    slot_groups: opts.slot_groups ?? null,
    allowed_cable_group: opts.allowed_cable_group ?? '',
  };
}

// ---------------------------------------------------------------------------
// 1. addTraySegment — slot_groups parsing
// ---------------------------------------------------------------------------
describe('addTraySegment() — slot_groups parsing', () => {
  it('creates a Map with correct group assignments from JSON string', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    const tray = sys.trays.get('T1');
    assert.ok(tray, 'Tray T1 should be registered');
    assert.strictEqual(tray.numSlots, 2);
    assert.strictEqual(tray.slotGroups.size, 2);
    assert.strictEqual(tray.slotGroups.get(0), 'power');
    assert.strictEqual(tray.slotGroups.get(1), 'instrument');
  });

  it('creates an empty Map when slot_groups is null', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T2', { num_slots: 2, slot_groups: null }));
    const tray = sys.trays.get('T2');
    assert.strictEqual(tray.slotGroups.size, 0);
  });

  it('initialises slotFills array with correct length', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T3', { num_slots: 3 }));
    const tray = sys.trays.get('T3');
    assert.strictEqual(tray.slotFills.length, 3);
    assert.ok(tray.slotFills.every(v => v === 0), 'All slot fills should start at 0');
  });

  it('computes maxFill per slot (not for the whole tray)', () => {
    // 12" × 4" = 48 in²; 2 slots → 24 in² each; 40 % limit → 9.6 in² per slot
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T4', { num_slots: 2 }));
    const tray = sys.trays.get('T4');
    assert.ok(Math.abs(tray.maxFill - 9.6) < 0.001,
      `Expected maxFill 9.6, got ${tray.maxFill}`);
  });
});

// ---------------------------------------------------------------------------
// 2. _findSlotForCable — slot selection
// ---------------------------------------------------------------------------
describe('_findSlotForCable() — slot selection', () => {
  it('routes a cable to the matching group slot', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    const tray = sys.trays.get('T1');
    assert.strictEqual(sys._findSlotForCable(tray, 'power'),      0);
    assert.strictEqual(sys._findSlotForCable(tray, 'instrument'),  1);
  });

  it('returns -1 when no slot matches the cable group', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    const tray = sys.trays.get('T1');
    assert.strictEqual(sys._findSlotForCable(tray, 'signal'), -1);
  });

  it('returns the least-full slot when no slot_groups mapping exists', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', { num_slots: 2 }));
    const tray = sys.trays.get('T1');
    // Manually fill slot 0 so slot 1 has more capacity
    tray.slotFills[0] = 5;
    assert.strictEqual(sys._findSlotForCable(tray, 'anything'), 1,
      'Should pick the least-full slot when no group mapping');
  });
});

// ---------------------------------------------------------------------------
// 3. updateTrayFill — per-slot accounting
// ---------------------------------------------------------------------------
describe('updateTrayFill() — per-slot accounting', () => {
  it('increments only the matching slot fill', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    sys.updateTrayFill(['T1'], 3, 'power');
    const tray = sys.trays.get('T1');
    assert.strictEqual(tray.slotFills[0], 3, 'Slot 0 (power) should have 3 sq in');
    assert.strictEqual(tray.slotFills[1], 0, 'Slot 1 (instrument) should be unchanged');
  });

  it('increments the correct slot for second group', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    sys.updateTrayFill(['T1'], 2, 'instrument');
    const tray = sys.trays.get('T1');
    assert.strictEqual(tray.slotFills[0], 0);
    assert.strictEqual(tray.slotFills[1], 2);
  });

  it('does not change fills when group has no matching slot', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    sys.updateTrayFill(['T1'], 5, 'signal');
    const tray = sys.trays.get('T1');
    assert.strictEqual(tray.slotFills[0], 0);
    assert.strictEqual(tray.slotFills[1], 0);
  });
});

// ---------------------------------------------------------------------------
// 4. _trayHasCapacityForCable — slot fill and capacity
// ---------------------------------------------------------------------------
describe('_trayHasCapacityForCable() — slot fill and capacity', () => {
  it('returns true when matching slot has enough capacity', () => {
    // 12" × 4" / 2 slots = 24 in²; 40 % = 9.6 in²
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    const tray = sys.trays.get('T1');
    assert.ok(sys._trayHasCapacityForCable(tray, 5, 'power'),
      'Slot 0 (power) should have capacity for 5 in²');
  });

  it('returns false when matching slot is full', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    // Fill slot 0 (power) to its limit (9.6 in²)
    sys.updateTrayFill(['T1'], 9.6, 'power');
    const tray = sys.trays.get('T1');
    assert.ok(!sys._trayHasCapacityForCable(tray, 1, 'power'),
      'Slot 0 should be full');
    // Slot 1 (instrument) should still have capacity
    assert.ok(sys._trayHasCapacityForCable(tray, 1, 'instrument'),
      'Slot 1 (instrument) should still have capacity');
  });

  it('returns false when cable group has no matching slot', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    const tray = sys.trays.get('T1');
    assert.ok(!sys._trayHasCapacityForCable(tray, 1, 'signal'),
      'Should return false when no slot matches the group');
  });
});

// ---------------------------------------------------------------------------
// 5. Backward compatibility — num_slots=1
// ---------------------------------------------------------------------------
describe('Backward compatibility (num_slots=1)', () => {
  it('single-slot tray behaves identically to prior code', () => {
    // 12" × 4" = 48 in²; 40 % limit = 19.2 in²
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1'));  // default num_slots=1
    const tray = sys.trays.get('T1');
    assert.strictEqual(tray.numSlots, 1);
    assert.strictEqual(tray.slotFills.length, 1);
    assert.ok(Math.abs(tray.maxFill - 19.2) < 0.001,
      `Expected maxFill 19.2, got ${tray.maxFill}`);

    // Fill with a cable
    sys.updateTrayFill(['T1'], 10, '');
    assert.strictEqual(tray.slotFills[0], 10);
    assert.ok(sys._trayHasCapacityForCable(tray, 9, ''),
      'Should have 9.2 remaining capacity');
    assert.ok(!sys._trayHasCapacityForCable(tray, 10, ''),
      'Should not fit 10 in² when only 9.2 remains');
  });

  it('getTrayUtilization returns correct total fill for single-slot tray', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1'));
    sys.updateTrayFill(['T1'], 10, '');
    const util = sys.getTrayUtilization();
    assert.ok(util.T1, 'T1 should be in utilization report');
    assert.strictEqual(util.T1.current_fill, 10);
    assert.ok(util.T1.slots.length === 1);
    assert.strictEqual(util.T1.slots[0].current_fill, 10);
  });

  it('getTrayUtilization includes per-slot detail for multi-slot tray', () => {
    const sys = new CableRoutingSystem({ fillLimit: 0.4 });
    sys.addTraySegment(makeTray('T1', {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    }));
    sys.updateTrayFill(['T1'], 3, 'power');
    sys.updateTrayFill(['T1'], 5, 'instrument');
    const util = sys.getTrayUtilization();
    assert.strictEqual(util.T1.current_fill, 8, 'Total fill should be sum of slots');
    assert.strictEqual(util.T1.slots.length, 2);
    assert.strictEqual(util.T1.slots[0].current_fill, 3);
    assert.strictEqual(util.T1.slots[1].current_fill, 5);
    assert.strictEqual(util.T1.slots[0].group, 'power');
    assert.strictEqual(util.T1.slots[1].group, 'instrument');
  });
});
