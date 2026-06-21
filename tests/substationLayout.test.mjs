import assert from 'node:assert/strict';
import {
  AISLE_FT,
  MARGIN_FT,
  EQUIPMENT_FOOTPRINTS,
  CLEARANCE_TABLE_FT,
  classifyEquipment,
  footprintFor,
  clearanceForVoltage,
  extractEquipment,
  generateLayout,
  runSubstationLayout,
} from '../analysis/substationLayout.mjs';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);

// Axis-aligned rectangle overlap with a small tolerance for shared edges.
function rectsOverlap(a, b) {
  const eps = 1e-6;
  return a.envX < b.envX + b.envW - eps &&
         a.envX + a.envW > b.envX + eps &&
         a.envY < b.envY + b.envH - eps &&
         a.envY + a.envH > b.envY + eps;
}

const FIXTURE = [
  { id: 'T1', tag: 'TX-1', type: 'transformer', voltageKv: 138 },
  { id: 'B1', tag: 'CB-1', type: 'circuit_breaker', voltageKv: 138 },
  { id: 'D1', tag: 'DS-1', type: 'disconnect_switch', voltageKv: 138 },
  { id: 'B2', tag: 'CB-2', type: 'circuit_breaker', voltageKv: 13.8 },
  { id: 'SG', tag: 'SWGR-1', type: 'switchgear', voltageKv: 13.8 },
  { id: 'C1', tag: 'CAP-1', type: 'capacitor_bank', voltageKv: 13.8 },
];

// ---------------------------------------------------------------------------
// Constants & tables
// ---------------------------------------------------------------------------
(function testTables() {
  assert.ok(AISLE_FT > 0 && MARGIN_FT > 0);
  assert.ok(EQUIPMENT_FOOTPRINTS.transformer.w > 0);
  assert.ok(CLEARANCE_TABLE_FT.length >= 5);
  // Clearance table sorted by voltage ascending
  for (let i = 1; i < CLEARANCE_TABLE_FT.length; i++) {
    assert.ok(CLEARANCE_TABLE_FT[i].kv > CLEARANCE_TABLE_FT[i - 1].kv, 'clearance table sorted by kv');
    assert.ok(CLEARANCE_TABLE_FT[i].ft >= CLEARANCE_TABLE_FT[i - 1].ft, 'clearance non-decreasing with kv');
  }
})();

// ---------------------------------------------------------------------------
// classifyEquipment
// ---------------------------------------------------------------------------
(function testClassify() {
  assert.equal(classifyEquipment('Power Transformer'), 'transformer');
  assert.equal(classifyEquipment('circuit_breaker'), 'circuit_breaker');
  assert.equal(classifyEquipment('disconnect_switch'), 'disconnect');
  assert.equal(classifyEquipment('switchgear'), 'switchgear');
  assert.equal(classifyEquipment('shunt_capacitor_bank'), 'capacitor_bank');
  assert.equal(classifyEquipment('surge_arrester'), 'arrester');
  assert.equal(classifyEquipment('current transformer'), 'instrument');
  // Instrument transformer must NOT be classed as a power transformer
  assert.notEqual(classifyEquipment('current transformer'), 'transformer');
  assert.equal(classifyEquipment('something_unknown'), 'default');
})();

// ---------------------------------------------------------------------------
// clearanceForVoltage
// ---------------------------------------------------------------------------
(function testClearance() {
  assert.equal(clearanceForVoltage(13.8), 3, '13.8 kV → 3 ft');
  assert.equal(clearanceForVoltage(138), 9, '138 kV → 9 ft');
  assert.equal(clearanceForVoltage(230), 13, '230 kV → 13 ft');
  assert.ok(clearanceForVoltage(500) >= clearanceForVoltage(230), 'monotonic with voltage');
  assert.equal(clearanceForVoltage(1000), 25, 'above table max → max setback');
  assert.equal(clearanceForVoltage(0), 3, 'zero → minimum setback');
})();

// ---------------------------------------------------------------------------
// footprintFor
// ---------------------------------------------------------------------------
(function testFootprint() {
  assert.equal(footprintFor('transformer').w, EQUIPMENT_FOOTPRINTS.transformer.w);
  assert.deepEqual(footprintFor('nonexistent'), EQUIPMENT_FOOTPRINTS.default, 'unknown → default footprint');
})();

// ---------------------------------------------------------------------------
// generateLayout — geometry, lanes, clearances, non-overlap
// ---------------------------------------------------------------------------
(function testLayout() {
  const layout = generateLayout(FIXTURE);
  assert.equal(layout.equipmentCount, 6, 'all six placed');
  assert.equal(layout.voltages.length, 2, 'two voltage lanes');
  assert.deepEqual(layout.voltages, [138, 13.8], 'HV lane first (descending)');

  // Each footprint sits inside its clearance envelope by exactly the setback
  for (const f of layout.footprints) {
    approx(f.x - f.envX, f.setback, 1e-9, `${f.tag} footprint inset by setback`);
    approx(f.envW - f.w, 2 * f.setback, 1e-9, `${f.tag} envelope width = footprint + 2·setback`);
    assert.equal(f.setback, clearanceForVoltage(f.voltageKv), `${f.tag} setback matches its voltage`);
  }

  // No two clearance envelopes overlap
  for (let i = 0; i < layout.footprints.length; i++) {
    for (let j = i + 1; j < layout.footprints.length; j++) {
      assert.ok(!rectsOverlap(layout.footprints[i], layout.footprints[j]),
        `${layout.footprints[i].tag} and ${layout.footprints[j].tag} envelopes must not overlap`);
    }
  }

  // Bounding box encloses every footprint envelope
  const bb = layout.boundingBox;
  for (const f of layout.footprints) {
    assert.ok(f.envX >= bb.minX - 1e-9 && f.envX + f.envW <= bb.maxX + 1e-9, `${f.tag} within bbox X`);
    assert.ok(f.envY >= bb.minY - 1e-9 && f.envY + f.envH <= bb.maxY + 1e-9, `${f.tag} within bbox Y`);
  }

  // Fence encloses the bounding box; ground grid encloses the fence
  assert.ok(layout.fence.x < bb.minX && layout.fence.y < bb.minY, 'fence outside bbox');
  assert.ok(layout.fence.x + layout.fence.width > bb.maxX, 'fence right of bbox');
  const gp = layout.groundGridPolygon;
  const gMinX = Math.min(...gp.map(p => p.x)), gMaxX = Math.max(...gp.map(p => p.x));
  assert.ok(gMinX < layout.fence.x && gMaxX > layout.fence.x + layout.fence.width, 'ground grid outside fence');
  assert.equal(gp.length, 4, 'ground grid polygon is a rectangle');
})();

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
(function testDeterminism() {
  const a = generateLayout(FIXTURE);
  const b = generateLayout(FIXTURE);
  assert.deepEqual(a.footprints, b.footprints, 'identical input → identical layout');
})();

// ---------------------------------------------------------------------------
// HV lane uses larger clearances than LV lane
// ---------------------------------------------------------------------------
(function testLaneClearance() {
  const layout = generateLayout(FIXTURE);
  const hv = layout.footprints.find(f => f.voltageKv === 138);
  const lv = layout.footprints.find(f => f.voltageKv === 13.8);
  assert.ok(hv.setback > lv.setback, 'HV equipment has larger working clearance');
  // HV lane is above the LV lane
  assert.ok(layout.lanes[0].y < layout.lanes[1].y, 'HV lane above LV lane');
})();

// ---------------------------------------------------------------------------
// extractEquipment from a one-line model
// ---------------------------------------------------------------------------
(function testExtract() {
  const oneLine = {
    sheets: [{
      components: [
        { id: 'X1', ref: 'TX-1', type: 'transformer', subtype: 'two_winding', voltage: '138 kV' },
        { id: 'X2', ref: 'CB-1', type: 'breaker', subtype: 'circuit_breaker', voltage: '13.8 kV' },
        { id: 'BUS1', ref: 'BUS-A', type: 'bus', subtype: 'Bus', voltage: '13.8 kV' }, // not placeable
        { id: 'L1', type: 'cable', voltage: '13.8 kV' }, // not placeable
      ],
    }],
  };
  const eq = extractEquipment(oneLine);
  assert.equal(eq.length, 2, 'bus and cable excluded; two placeable items');
  approx(eq[0].voltageKv, 138, 1e-6, 'voltage parsed to kV');
  assert.equal(eq[0].tag, 'TX-1');
  // Legacy flat components array also supported
  assert.equal(extractEquipment({ components: oneLine.sheets[0].components }).length, 2, 'flat array supported');
  assert.deepEqual(extractEquipment(null), [], 'null model → empty');
})();

// ---------------------------------------------------------------------------
// runSubstationLayout
// ---------------------------------------------------------------------------
(function testRun() {
  const r = runSubstationLayout({ equipment: FIXTURE });
  assert.equal(r.equipmentCount, 6);
  assert.ok(r.inputs.equipment.length === 6, 'inputs preserved');

  // From a one-line model
  const r2 = runSubstationLayout({
    oneLine: { components: [
      { id: 'T', ref: 'TX', type: 'transformer', voltage: '69 kV' },
      { id: 'B', ref: 'CB', type: 'breaker', voltage: '69 kV' },
    ] },
  });
  assert.equal(r2.equipmentCount, 2, 'derived from one-line');

  assert.throws(() => runSubstationLayout({ equipment: [] }), /No equipment/i, 'empty equipment rejected');
  assert.throws(() => runSubstationLayout({}), /No equipment/i, 'no input rejected');
})();

console.log('substationLayout.test.mjs — all assertions passed');
