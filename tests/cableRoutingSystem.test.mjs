import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CableRoutingSystem, MinHeap } from '../src/routing/cableRoutingSystem.mjs';

const tray = (overrides = {}) => ({
    tray_id: 'TR-1',
    start_x: 0,
    start_y: 0,
    start_z: 0,
    end_x: 100,
    end_y: 0,
    end_z: 0,
    width: 12,
    height: 4,
    current_fill: 0,
    allowed_cable_group: 'LV',
    raceway_type: 'tray',
    ...overrides
});

describe('cable routing system extraction', () => {
    it('retains priority-queue ordering used by Dijkstra routing', () => {
        const heap = new MinHeap();
        heap.push('third', 3);
        heap.push('first', 1);
        heap.push('second', 2);
        assert.deepEqual([heap.pop(), heap.pop(), heap.pop()], ['first', 'second', 'third']);
        assert.equal(heap.isEmpty(), true);
    });

    it('preserves route geometry and status for a tray with field endpoints', () => {
        const debugCalls = [];
        let now = 100;
        const system = new CableRoutingSystem({
            fillLimit: 0.4,
            proximityThreshold: 72,
            fieldPenalty: 3,
            clock: () => now += 5,
            debugLog: (...args) => debugCalls.push(args)
        });
        system.addTraySegment(tray());
        system.prepareBaseGraph();

        const result = system.calculateRoute([-5, 0, 0], [105, 0, 0], 1, 'LV');

        assert.equal(result.success, true);
        assert.equal(result.total_length, 110);
        assert.equal(result.field_routed_length, 10);
        assert.deepEqual(result.tray_segments, ['TR-1']);
        assert.deepEqual(result.route_segments.map(segment => ({
            type: segment.type,
            start: segment.start,
            end: segment.end,
            length: segment.length,
            tray_id: segment.tray_id
        })), [
            { type: 'field', start: [-5, 0, 0], end: [0, 0, 0], length: 5, tray_id: 'TR-1' },
            { type: 'tray', start: [0, 0, 0], end: [100, 0, 0], length: 100, tray_id: 'TR-1' },
            { type: 'field', start: [100, 0, 0], end: [105, 0, 0], length: 5, tray_id: 'proj' }
        ]);
        assert.equal(debugCalls.length, 1);
        assert.match(debugCalls[0][0], /Route -5,0,0 -> 105,0,0 \(5\.0ms\)/);
    });

    it('retains per-slot fill allocation and group capacity rules', () => {
        const system = new CableRoutingSystem({ fillLimit: 0.4 });
        system.addTraySegment(tray({
            num_slots: 2,
            slot_groups: { 0: 'LV', 1: 'HV' },
            current_fill: 8
        }));
        const stored = system.trays.get('TR-1');

        assert.deepEqual(stored.slotFills, [4, 4]);
        assert.equal(system._findSlotForCable(stored, 'HV'), 1);
        assert.equal(system._findSlotForCable(stored, 'CONTROL'), -1);
        system.updateTrayFill(['TR-1'], 2, 'HV');
        assert.deepEqual(stored.slotFills, [4, 6]);
        assert.equal(system.getTrayUtilization()['TR-1'].slots[1].group, 'HV');
    });

    it('injects warnings instead of depending on browser or console globals', () => {
        const warnings = [];
        const system = new CableRoutingSystem({
            includeDuctbankOutlines: false,
            warningLog: message => warnings.push(message)
        });
        system.addTraySegment(tray({ tray_id: 'DB-1', raceway_type: 'ductbank', conduit_id: '' }));
        system.prepareBaseGraph();

        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /1 ductbank segment\(s\) without conduit_id; ignored\./);
        assert.deepEqual(system.baseGraph.nodes, {});
    });
});
