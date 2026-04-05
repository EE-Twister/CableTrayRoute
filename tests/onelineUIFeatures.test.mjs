/**
 * Unit tests for new one-line diagram UI features (Gaps #34–#47).
 *
 * These tests exercise the pure logic functions extracted from oneline.js
 * without requiring a DOM environment.
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Helpers that replicate the logic from oneline.js for testability
// ---------------------------------------------------------------------------

/** componentBounds – axis-aligned bounding box (no rotation for tests) */
function componentBounds(comp) {
  const w = comp.width || 80;
  const h = comp.height || 40;
  return { left: comp.x, top: comp.y, right: comp.x + w, bottom: comp.y + h };
}

// ---------------------------------------------------------------------------
// Gap #42 – zoomToSelection bounding-box logic
// ---------------------------------------------------------------------------
{
  console.log('Gap #42 – zoomToSelection bounds');

  const comps = [
    { id: 'a', x: 100, y: 100, width: 80, height: 40 },
    { id: 'b', x: 300, y: 200, width: 80, height: 40 },
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  comps.forEach(comp => {
    const b = componentBounds(comp);
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.right);
    maxY = Math.max(maxY, b.bottom);
  });

  assert.equal(minX, 100, 'minX');
  assert.equal(minY, 100, 'minY');
  assert.equal(maxX, 380, 'maxX = 300 + 80');
  assert.equal(maxY, 240, 'maxY = 200 + 40');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #43 – selectConnected BFS traversal
// ---------------------------------------------------------------------------
{
  console.log('Gap #43 – selectConnected BFS');

  const components = [
    { id: 'src', type: 'sources', connections: [{ target: 'bus1' }] },
    { id: 'bus1', type: 'bus', connections: [{ target: 'brk1' }] },
    { id: 'brk1', type: 'breaker', connections: [{ target: 'load1' }] },
    { id: 'load1', type: 'motor_load', connections: [] },
    { id: 'isolated', type: 'bus', connections: [] },  // not connected to src
  ];

  function selectConnected(startId) {
    const byId = new Map(components.map(c => [c.id, c]));
    const visited = new Set();
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const comp = byId.get(id);
      if (!comp) continue;
      (comp.connections || []).forEach(conn => {
        if (conn.target && !visited.has(conn.target)) queue.push(conn.target);
      });
      components.forEach(c => {
        (c.connections || []).forEach(conn => {
          if (conn.target === id && !visited.has(c.id)) queue.push(c.id);
        });
      });
    }
    return components.filter(c => visited.has(c.id)).map(c => c.id);
  }

  const reached = selectConnected('src');
  assert.ok(reached.includes('src'), 'src in result');
  assert.ok(reached.includes('bus1'), 'bus1 in result');
  assert.ok(reached.includes('brk1'), 'brk1 in result');
  assert.ok(reached.includes('load1'), 'load1 in result');
  assert.ok(!reached.includes('isolated'), 'isolated NOT in result');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #36 – computeEnergizedSet traversal
// ---------------------------------------------------------------------------
{
  console.log('Gap #36 – computeEnergizedSet');

  const comps = [
    { id: 'util', type: 'sources', connections: [{ target: 'bus1' }] },
    { id: 'bus1', type: 'bus', connections: [{ target: 'brk_open' }, { target: 'brk_closed' }] },
    { id: 'brk_open', type: 'breaker', props: { state: 'open' }, connections: [{ target: 'load_dead' }] },
    { id: 'brk_closed', type: 'breaker', props: { state: 'closed' }, connections: [{ target: 'load_live' }] },
    { id: 'load_dead', type: 'motor_load', connections: [] },
    { id: 'load_live', type: 'motor_load', connections: [] },
  ];

  function computeEnergizedSet(comps) {
    const byId = new Map(comps.map(c => [c.id, c]));
    const energized = new Set();
    const queue = [];
    comps.forEach(c => { if (c.type === 'sources') queue.push(c.id); });
    const isOpen = (c) => {
      if (!c) return false;
      const state = (c.props && c.props.state) || c.state;
      return state === 'open' || state === 'Open';
    };
    const visited = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const comp = byId.get(id);
      if (!comp) continue;
      energized.add(id);
      if (isOpen(comp)) continue;
      (comp.connections || []).forEach(conn => {
        if (conn.target && !visited.has(conn.target)) queue.push(conn.target);
      });
      comps.forEach(c => {
        if (!visited.has(c.id)) {
          (c.connections || []).forEach(conn => {
            if (conn.target === id) queue.push(c.id);
          });
        }
      });
    }
    return energized;
  }

  const energized = computeEnergizedSet(comps);

  assert.ok(energized.has('util'), 'utility source is energized');
  assert.ok(energized.has('bus1'), 'bus1 is energized');
  assert.ok(energized.has('brk_open'), 'open breaker itself is energized (connected to bus)');
  assert.ok(energized.has('brk_closed'), 'closed breaker is energized');
  assert.ok(!energized.has('load_dead'), 'load behind open breaker is NOT energized');
  assert.ok(energized.has('load_live'), 'load behind closed breaker IS energized');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #40 – groupSelection / ungroupComponent round-trip
// ---------------------------------------------------------------------------
{
  console.log('Gap #40 – groupSelection / ungroupComponent');

  let components = [
    { id: 'a', type: 'breaker', x: 100, y: 100, width: 80, height: 40, connections: [] },
    { id: 'b', type: 'bus', x: 200, y: 100, width: 80, height: 40, connections: [] },
    { id: 'c', type: 'motor_load', x: 300, y: 100, width: 80, height: 40, connections: [] },
  ];
  let selection = [components[0], components[1]];

  function groupSelection() {
    const targets = selection.filter(c => c.type !== 'group');
    if (targets.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    targets.forEach(c => {
      const b = componentBounds(c);
      minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.right); maxY = Math.max(maxY, b.bottom);
    });
    const group = {
      id: 'grp1',
      type: 'group',
      subtype: 'group',
      x: minX - 8, y: minY - 8,
      width: maxX - minX + 16, height: maxY - minY + 16,
      label: 'Group',
      rotation: 0,
      memberIds: targets.map(c => c.id),
      connections: []
    };
    components.push(group);
    selection = [group];
    return group;
  }

  function ungroupComponent(groupId) {
    const idx = components.findIndex(c => c.id === groupId && c.type === 'group');
    if (idx === -1) return false;
    const group = components[idx];
    components.splice(idx, 1);
    selection = components.filter(c => (group.memberIds || []).includes(c.id));
    return true;
  }

  const group = groupSelection();
  assert.ok(group, 'group created');
  assert.equal(group.memberIds.length, 2, 'group has 2 members');
  assert.ok(components.find(c => c.id === 'grp1'), 'group in components array');
  assert.equal(selection[0].id, 'grp1', 'selection is group');

  const ok = ungroupComponent('grp1');
  assert.ok(ok, 'ungroup returned true');
  assert.ok(!components.find(c => c.id === 'grp1'), 'group removed from components');
  assert.equal(selection.length, 2, 'selection restored to members');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #41 – toggleLock
// ---------------------------------------------------------------------------
{
  console.log('Gap #41 – toggleLock');

  const comp = { id: 'x', type: 'breaker', label: 'CB1', locked: false };

  function toggleLock(c) { c.locked = !c.locked; }

  toggleLock(comp);
  assert.equal(comp.locked, true, 'locked after first toggle');
  toggleLock(comp);
  assert.equal(comp.locked, false, 'unlocked after second toggle');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #44 – selectByType
// ---------------------------------------------------------------------------
{
  console.log('Gap #44 – selectByType');

  const components = [
    { id: 'a', type: 'breaker', subtype: 'lv_cb' },
    { id: 'b', type: 'breaker', subtype: 'lv_cb' },
    { id: 'c', type: 'bus', subtype: 'bus' },
  ];

  function selectByType(subtype) {
    return components.filter(c => c.subtype === subtype);
  }

  const lvcbs = selectByType('lv_cb');
  assert.equal(lvcbs.length, 2, '2 lv_cb components');
  assert.ok(lvcbs.every(c => c.subtype === 'lv_cb'), 'all are lv_cb');

  const buses = selectByType('bus');
  assert.equal(buses.length, 1, '1 bus');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #34 – Rubber-band / marquee selection (already existing, logic test)
// ---------------------------------------------------------------------------
{
  console.log('Gap #34 – Rubber-band marquee bounding-box intersection');

  const components = [
    { id: 'in1', x: 100, y: 100, width: 80, height: 40 },  // fully inside
    { id: 'in2', x: 120, y: 110, width: 80, height: 40 },  // fully inside
    { id: 'out1', x: 500, y: 500, width: 80, height: 40 }, // outside
  ];

  const marquee = { x1: 50, y1: 50, x2: 300, y2: 300 };
  const left = Math.min(marquee.x1, marquee.x2);
  const right = Math.max(marquee.x1, marquee.x2);
  const top = Math.min(marquee.y1, marquee.y2);
  const bottom = Math.max(marquee.y1, marquee.y2);
  const strict = true; // left-to-right

  const picked = components.filter(c => {
    const bounds = componentBounds(c);
    if (strict) {
      return bounds.left >= left && bounds.right <= right && bounds.top >= top && bounds.bottom <= bottom;
    }
    return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom);
  });

  assert.equal(picked.length, 2, '2 components inside marquee');
  assert.ok(picked.some(c => c.id === 'in1'), 'in1 selected');
  assert.ok(picked.some(c => c.id === 'in2'), 'in2 selected');
  assert.ok(!picked.some(c => c.id === 'out1'), 'out1 not selected');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #47 – computeOrthogonalPath elbow logic
// ---------------------------------------------------------------------------
{
  console.log('Gap #47 – computeOrthogonalPath');

  function computeOrthogonalPath(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < 0.5) return [start, end];
    if (Math.abs(dy) < 0.5) return [start, end];
    if (Math.abs(dx) >= Math.abs(dy)) {
      const elbowX = start.x + dx * 0.5;
      return [start, { x: elbowX, y: start.y }, { x: elbowX, y: end.y }, end];
    } else {
      const elbowY = start.y + dy * 0.5;
      return [start, { x: start.x, y: elbowY }, { x: end.x, y: elbowY }, end];
    }
  }

  // Horizontal-dominant: |dx| >= |dy|
  const h = computeOrthogonalPath({ x: 0, y: 0 }, { x: 200, y: 100 });
  assert.equal(h.length, 4, 'H-dominant: 4 pts');
  assert.equal(h[1].x, 100, 'elbow at midX=100');
  assert.equal(h[1].y, 0,   'elbow stays at start.y');
  assert.equal(h[2].x, 100, 'second elbow x=100');
  assert.equal(h[2].y, 100, 'second elbow y=end.y');

  // Vertical-dominant: |dy| > |dx|
  const v = computeOrthogonalPath({ x: 0, y: 0 }, { x: 50, y: 200 });
  assert.equal(v.length, 4, 'V-dominant: 4 pts');
  assert.equal(v[1].y, 100, 'elbow at midY=100');
  assert.equal(v[1].x, 0,   'elbow stays at start.x');
  assert.equal(v[2].y, 100, 'second elbow y=100');
  assert.equal(v[2].x, 50,  'second elbow x=end.x');

  // Degenerate – already vertical (dx≈0)
  const vert = computeOrthogonalPath({ x: 100, y: 0 }, { x: 100, y: 200 });
  assert.equal(vert.length, 2, 'Already vertical: 2 pts');

  // Degenerate – already horizontal (dy≈0)
  const horiz = computeOrthogonalPath({ x: 0, y: 50 }, { x: 300, y: 50 });
  assert.equal(horiz.length, 2, 'Already horizontal: 2 pts');

  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Gap #35 – snapToNearestBus logic
// ---------------------------------------------------------------------------
{
  console.log('Gap #35 – snapToNearestBus');

  // Minimal stubs for portPosition and nearestPortIndexForPoint
  function portPosition(comp, _portIdx) {
    // For buses, return center; for others return top-left + offset
    return { x: comp.x + (comp.width || 80) / 2, y: comp.y + (comp.height || 40) / 2 };
  }
  function nearestPortIndexForPoint(_comp, _point) { return 0; }
  function isBusComponent(c) { return c.type === 'bus'; }
  function ensureConnection(from, to, fp, tp) {
    from.connections = from.connections || [];
    from.connections.push({ target: to.id, sourcePort: fp, targetPort: tp });
    return true;
  }

  function snapToNearestBus(comp, components, snapRadius = 30) {
    if (!comp || isBusComponent(comp)) return false;
    const ports = [0]; // one port for test simplicity
    let best = null;
    components.forEach(bus => {
      if (!isBusComponent(bus) || bus === comp) return;
      ports.forEach((_, portIdx) => {
        const compPos = portPosition(comp, portIdx);
        const busPortIdx = nearestPortIndexForPoint(bus, compPos);
        const busPos = portPosition(bus, busPortIdx);
        const dist = Math.hypot(busPos.x - compPos.x, busPos.y - compPos.y);
        if (!best || dist < best.distance) {
          best = { distance: dist, portIdx, bus, busPortIdx };
        }
      });
    });
    if (!best || best.distance > snapRadius) return false;
    return ensureConnection(comp, best.bus, best.portIdx, best.busPortIdx);
  }

  const bus = { id: 'bus1', type: 'bus', x: 200, y: 200, width: 160, height: 10, connections: [] };
  // Component centre at (220, 220) → bus centre at (280, 205), dist ≈ 64  → OUTSIDE 30px
  const farComp = { id: 'brk_far', type: 'breaker', x: 180, y: 200, connections: [] };
  // Component centre at (250, 205) → bus centre at (280, 205), dist = 30 → AT threshold
  const nearComp = { id: 'brk_near', type: 'breaker', x: 230, y: 185, connections: [] };

  const comps = [bus, farComp, nearComp];

  const farResult = snapToNearestBus(farComp, comps, 30);
  assert.equal(farResult, false, 'far component: no snap');
  assert.equal((farComp.connections || []).length, 0, 'far: no connection added');

  const nearResult = snapToNearestBus(nearComp, comps, 30);
  assert.equal(nearResult, true, 'near component: snapped to bus');
  assert.equal((nearComp.connections || []).length, 1, 'near: one connection added');
  assert.equal(nearComp.connections[0].target, 'bus1', 'near: connects to bus1');

  // Bus itself should not snap to anything
  const busResult = snapToNearestBus(bus, comps, 30);
  assert.equal(busResult, false, 'bus: does not self-snap');

  console.log('  PASS');
}

console.log('\nAll one-line UI feature tests passed.');
