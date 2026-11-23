import assert from 'node:assert/strict';
import { applyCanonicalCableEdit, mergeCanonicalCableRoutes, removeCanonicalCable } from '../src/routing/canonicalCableRouteMerge.mjs';

const canonical = [{ id: 'c1', tag: 'C-1', from_tag: 'SRC', to_tag: 'LOAD', start_x: 1, custom: 'kept' }, { id: 'c2', tag: 'C-2', custom: 'retain' }];
const routed = [{ id: 'c1', name: 'C-1', start: [1, 2, 3], route_segments: [{ length: 5 }], voltage_drop_pct: '1.25' }];
const merged = mergeCanonicalCableRoutes(canonical, routed);
assert.deepEqual(merged[0], { ...canonical[0], route_segments: routed[0].route_segments, voltage_drop_pct: '1.25' });
assert.equal(merged[0].name, undefined);
assert.deepEqual(mergeCanonicalCableRoutes(canonical, [routed[0]]), [merged[0], canonical[1]]);

const addition = mergeCanonicalCableRoutes(canonical, [{ id: 'c3', name: 'C-3', start_tag: 'SRC3', end_tag: 'LOAD3', start: [0, 0, 0], end: [3, 4, 0], custom: 'keep' }]);
assert.deepEqual(addition[2], { id: 'c3', custom: 'keep', tag: 'C-3', from_tag: 'SRC3', to_tag: 'LOAD3', start_x: 0, start_y: 0, start_z: 0, end_x: 3, end_y: 4, end_z: 0 });
assert.deepEqual(mergeCanonicalCableRoutes(canonical, [{ id: 'c3', name: 'C-3' }], { allowAdd: false }), canonical);

const conflict = mergeCanonicalCableRoutes([{ id: 'c1', tag: 'C-1' }, { id: 'c2', tag: 'C-1' }], [{ id: 'c2', name: 'C-1', route_segments: [] }]);
assert.equal(conflict[0].route_segments, undefined);
assert.deepEqual(conflict[1].route_segments, []);

const legacyAlias = mergeCanonicalCableRoutes([{ id: 'c1', tag: 'C-1', custom: 'keep' }], [{ name: 'C-1', route_segments: ['legacy'] }]);
assert.deepEqual(legacyAlias[0], { id: 'c1', tag: 'C-1', custom: 'keep', route_segments: ['legacy'] });

const engineeringAddition = mergeCanonicalCableRoutes([], [{
    id: 'manual-1', name: 'MANUAL-1', conductor_size: '500 kcmil', insulation: 'XLPE', load_amps: 42,
    start_tag: 'SRC', end_tag: 'DST', start: [1, 2, 3], end: [4, 5, 6], route_segments: [],
}]);
assert.deepEqual(engineeringAddition[0], {
    id: 'manual-1', tag: 'MANUAL-1', conductor_size: '500 kcmil', insulation: 'XLPE', load_amps: 42,
    from_tag: 'SRC', to_tag: 'DST', start_x: 1, start_y: 2, start_z: 3, end_x: 4, end_y: 5, end_z: 6,
    route_segments: [],
});

const original = [{ id: 'deleted-1', tag: 'DELETED' }];
assert.deepEqual(mergeCanonicalCableRoutes([], [{ id: 'deleted-1', name: 'DELETED', route_segments: [] }], { originalCables: original }), []);
assert.equal(mergeCanonicalCableRoutes([], [{ id: 'new-1', name: 'NEW', conductor_size: '1/0' }], { originalCables: original })[0].conductor_size, '1/0');

const editedCanonical = [{ id: 'edit-1', tag: 'EDIT-1', conductor_size: '500 kcmil', custom: 'retain', locked: false }];
const editedCable = { id: 'edit-1', name: 'EDIT-1', conductor_size: '1/0', manual_path: 'TR-1>TR-2', locked: true };
assert.deepEqual(applyCanonicalCableEdit(editedCanonical, editedCable, { field: 'manual_path', value: editedCable.manual_path }), [{ ...editedCanonical[0], manual_path: 'TR-1>TR-2' }]);
assert.deepEqual(applyCanonicalCableEdit(editedCanonical, editedCable, { field: 'locked', value: true }), [{ ...editedCanonical[0], locked: true }]);
assert.deepEqual(applyCanonicalCableEdit(editedCanonical, editedCable, { field: 'start', coordinate: 1, value: 12 }), [{ ...editedCanonical[0], start_y: 12 }]);
assert.equal(applyCanonicalCableEdit([{ tag: 'OLD' }], { id: 'new-id', name: 'OLD' }, { field: 'locked', value: true })[0].locked, true);
assert.deepEqual(applyCanonicalCableEdit([{ tag: 'OLD', custom: 'retain' }], { name: 'RENAMED' }, { field: 'name', value: 'RENAMED', previousCable: { name: 'OLD' } }), [{ tag: 'RENAMED', custom: 'retain' }]);
assert.equal(mergeCanonicalCableRoutes([], [{ id: 'generated', name: 'DELETED', route_segments: [] }], { originalCables: [{ tag: 'DELETED' }] }).length, 0);
assert.equal(mergeCanonicalCableRoutes([], [{ id: 'new-id', name: 'SAME-TAG', route_segments: [] }], { originalCables: [{ id: 'old-id', tag: 'SAME-TAG' }] }).length, 1);
assert.deepEqual(removeCanonicalCable([{ id: 'edit-1', tag: 'EDIT-1', custom: 'retain' }, { id: 'keep', tag: 'KEEP' }], { id: 'edit-1', name: 'EDIT-1' }), [{ id: 'keep', tag: 'KEEP' }]);
assert.deepEqual(removeCanonicalCable([{ id: 'edit-1', tag: 'EDIT-1' }], { id: 'missing', name: 'EDIT-1' }), [{ id: 'edit-1', tag: 'EDIT-1' }]);
console.log('✓ canonical cable merge preserves IDs, aliases, unknown fields, and unmatched records');
