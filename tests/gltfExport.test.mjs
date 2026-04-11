/**
 * Unit tests for src/exporters/gltf2.mjs
 *
 * Run:  node tests/gltfExport.test.mjs
 */

import assert from 'assert';
import { exportToGLTF2, packGLB } from '../src/exporters/gltf2.mjs';

// ---------------------------------------------------------------------------
// Minimal test harness (matches project convention)
// ---------------------------------------------------------------------------

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the glTF JSON chunk out of a .glb Uint8Array. */
function readGLBJson(glb) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  assert.strictEqual(dv.getUint32(0, true), 0x46546C67, 'magic should be glTF');
  assert.strictEqual(dv.getUint32(4, true), 2,          'version should be 2');
  const jsonLen = dv.getUint32(12, true);
  const raw     = glb.subarray(20, 20 + jsonLen);
  return JSON.parse(new TextDecoder().decode(raw).trimEnd());
}

/** Build a minimal tray record. */
function makeTray(id, opts = {}) {
  return {
    tray_id:      id,
    start_x:      opts.start_x  ?? 0,
    start_y:      opts.start_y  ?? 0,
    start_z:      opts.start_z  ?? 0,
    end_x:        opts.end_x    ?? 10,
    end_y:        opts.end_y    ?? 0,
    end_z:        opts.end_z    ?? 0,
    width:        opts.width    ?? 24,
    height:       opts.height   ?? 6,
    current_fill: opts.fill     ?? 0,
    maxFill:      opts.maxFill  ?? 100,
    numSlots:     opts.slots    ?? 1,
    raceway_type: opts.type     ?? 'tray',
  };
}

/** Build a minimal cable record. */
function makeCable(label, opts = {}) {
  return {
    label,
    cable_id: label,
    from_tag: opts.from ?? 'MCC-1',
    to_tag:   opts.to   ?? 'PUMP-1',
    start_x: opts.sx ?? 0, start_y: opts.sy ?? 0, start_z: opts.sz ?? 0,
    end_x:   opts.ex ?? 5, end_y:   opts.ey ?? 0, end_z:   opts.ez ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportToGLTF2 — binary structure', () => {

  it('empty input returns a Uint8Array with correct GLB header magic, version, length', () => {
    const glb = exportToGLTF2();
    assert.ok(glb instanceof Uint8Array, 'result should be Uint8Array');
    assert.ok(glb.byteLength >= 12, 'minimum header size');
    const dv = new DataView(glb.buffer, glb.byteOffset);
    assert.strictEqual(dv.getUint32(0, true), 0x46546C67, 'magic glTF');
    assert.strictEqual(dv.getUint32(4, true), 2,           'version 2');
    assert.strictEqual(dv.getUint32(8, true), glb.byteLength, 'length == file size');
  });

  it('total file length in header equals actual Uint8Array byteLength', () => {
    const trays = [makeTray('T1'), makeTray('T2', { start_y: 5, end_y: 15 })];
    const glb   = exportToGLTF2({ trays });
    const dv    = new DataView(glb.buffer, glb.byteOffset);
    assert.strictEqual(dv.getUint32(8, true), glb.byteLength);
  });

  it('all bufferView byteOffsets are 4-byte aligned', () => {
    const trays = [0,1,2,3,4].map(i => makeTray(`T${i}`, { end_x: i + 1 }));
    const json  = readGLBJson(exportToGLTF2({ trays }));
    for (const bv of json.bufferViews) {
      assert.strictEqual(bv.byteOffset % 4, 0, `byteOffset ${bv.byteOffset} not 4-byte aligned`);
    }
  });

});

describe('exportToGLTF2 — JSON content', () => {

  it('asset.version is "2.0" and generator is "CableTrayRoute"', () => {
    const json = readGLBJson(exportToGLTF2());
    assert.strictEqual(json.asset.version, '2.0');
    assert.strictEqual(json.asset.generator, 'CableTrayRoute');
  });

  it('always contains exactly 4 materials with correct names', () => {
    const json = readGLBJson(exportToGLTF2());
    assert.strictEqual(json.materials.length, 4);
    assert.strictEqual(json.materials[0].name, 'fill_low');
    assert.strictEqual(json.materials[1].name, 'fill_medium');
    assert.strictEqual(json.materials[2].name, 'fill_high');
    assert.strictEqual(json.materials[3].name, 'cable_route');
  });

  it('projectName appears in asset.copyright and scene name', () => {
    const json = readGLBJson(exportToGLTF2({ projectName: 'Substation Alpha' }));
    assert.strictEqual(json.asset.copyright, 'Substation Alpha');
    assert.strictEqual(json.scenes[0].name,  'Substation Alpha');
  });

});

describe('exportToGLTF2 — tray geometry', () => {

  it('single X-axis tray produces a node named by tray_id with a TRIANGLES mesh', () => {
    const json = readGLBJson(exportToGLTF2({ trays: [makeTray('TRAY-01')] }));
    const node = json.nodes.find(n => n.name === 'TRAY-01');
    assert.ok(node, 'node TRAY-01 should exist');
    const prim = json.meshes[node.mesh].primitives[0];
    assert.strictEqual(prim.mode, 4, 'mode should be TRIANGLES (4)');
  });

  it('single straight tray segment has 8 vertices and 36 indices', () => {
    const json   = readGLBJson(exportToGLTF2({ trays: [makeTray('T')] }));
    const node   = json.nodes.find(n => n.name === 'T');
    const prim   = json.meshes[node.mesh].primitives[0];
    const posAcc = json.accessors[prim.attributes.POSITION];
    const idxAcc = json.accessors[prim.indices];
    assert.strictEqual(posAcc.count, 8,  '8 vertices for a single box');
    assert.strictEqual(idxAcc.count, 36, '36 indices = 12 triangles');
  });

  it('diagonal tray (X+Y+Z offsets) decomposes into 3 sub-segments = 24 vertices', () => {
    const tray = makeTray('DIAG', { end_x: 5, end_y: 10, end_z: 3 });
    const json = readGLBJson(exportToGLTF2({ trays: [tray] }));
    const node = json.nodes.find(n => n.name === 'DIAG');
    const posAcc = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
    assert.strictEqual(posAcc.count, 24, '3 sub-segments × 8 vertices = 24');
  });

  it('degenerate tray (start == end) still produces 8-vertex mesh without crashing', () => {
    const tray = makeTray('ZERO', { start_x: 5, end_x: 5, start_y: 5, end_y: 5, start_z: 2, end_z: 2 });
    const json = readGLBJson(exportToGLTF2({ trays: [tray] }));
    const node = json.nodes.find(n => n.name === 'ZERO');
    const posAcc = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
    assert.strictEqual(posAcc.count, 8);
  });

  it('multiple trays produce separate named nodes and separate meshes', () => {
    const ids   = ['TRAY-A', 'TRAY-B', 'TRAY-C'];
    const trays = ids.map((id, i) => makeTray(id, { start_x: i * 20, end_x: i * 20 + 10 }));
    const json  = readGLBJson(exportToGLTF2({ trays }));
    for (const id of ids) {
      assert.ok(json.nodes.find(n => n.name === id), `node ${id} should exist`);
    }
    assert.strictEqual(json.meshes.length, 3);
  });

});

describe('exportToGLTF2 — fill heat-map materials', () => {

  it('fill < 40% → material index 0 (grey / fill_low)', () => {
    const json = readGLBJson(exportToGLTF2({ trays: [makeTray('T', { fill: 30, maxFill: 100 })] }));
    const node = json.nodes.find(n => n.name === 'T');
    assert.strictEqual(json.meshes[node.mesh].primitives[0].material, 0);
  });

  it('fill 40–79% → material index 1 (yellow / fill_medium)', () => {
    const json = readGLBJson(exportToGLTF2({ trays: [makeTray('T', { fill: 60, maxFill: 100 })] }));
    const node = json.nodes.find(n => n.name === 'T');
    assert.strictEqual(json.meshes[node.mesh].primitives[0].material, 1);
  });

  it('fill ≥ 80% → material index 2 (red / fill_high)', () => {
    const json = readGLBJson(exportToGLTF2({ trays: [makeTray('T', { fill: 85, maxFill: 100 })] }));
    const node = json.nodes.find(n => n.name === 'T');
    assert.strictEqual(json.meshes[node.mesh].primitives[0].material, 2);
  });

  it('slotFills array is summed for fill percentage', () => {
    const tray = { ...makeTray('S', { maxFill: 100 }), slotFills: [30, 30], numSlots: 2 };
    const json = readGLBJson(exportToGLTF2({ trays: [tray] }));
    const node = json.nodes.find(n => n.name === 'S');
    // sum=60, maxFill=100*2=200 → 30% → fill_low (0)
    assert.strictEqual(json.meshes[node.mesh].primitives[0].material, 0);
    assert.ok(node.extras.fill_pct >= 0);
  });

});

describe('exportToGLTF2 — per-node extras metadata', () => {

  it('tray node extras contain tray_id, fill_pct, width_in, height_in, raceway_type', () => {
    const tray = makeTray('TR-99', { fill: 45, maxFill: 100, width: 24, height: 6, type: 'tray' });
    const json = readGLBJson(exportToGLTF2({ trays: [tray] }));
    const node = json.nodes.find(n => n.name === 'TR-99');
    assert.strictEqual(node.extras.tray_id,      'TR-99');
    assert.ok(Math.abs(node.extras.fill_pct - 45) < 1, 'fill_pct should be ~45');
    assert.strictEqual(node.extras.width_in,     24);
    assert.strictEqual(node.extras.height_in,    6);
    assert.strictEqual(node.extras.raceway_type, 'tray');
  });

});

describe('exportToGLTF2 — cable route geometry', () => {

  it('cable produces a GL_LINES (mode 1) mesh with material index 3', () => {
    const json = readGLBJson(exportToGLTF2({ cables: [makeCable('CABLE-101')] }));
    const node = json.nodes.find(n => n.name === 'CABLE-101');
    assert.ok(node, 'cable node should exist');
    const prim = json.meshes[node.mesh].primitives[0];
    assert.strictEqual(prim.mode,     1, 'GL_LINES');
    assert.strictEqual(prim.material, 3, 'cable_route material');
  });

  it('cable node extras contain cable_id, from_tag, to_tag', () => {
    const cable = makeCable('CBL-202', { from: 'SWGR-1', to: 'MDB-3' });
    const json  = readGLBJson(exportToGLTF2({ cables: [cable] }));
    const node  = json.nodes.find(n => n.name === 'CBL-202');
    assert.strictEqual(node.extras.cable_id, 'CBL-202');
    assert.strictEqual(node.extras.from_tag, 'SWGR-1');
    assert.strictEqual(node.extras.to_tag,   'MDB-3');
  });

  it('cable route accessor has 2 vertices', () => {
    const json   = readGLBJson(exportToGLTF2({ cables: [makeCable('C')] }));
    const node   = json.nodes.find(n => n.name === 'C');
    const posAcc = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
    assert.strictEqual(posAcc.count, 2);
  });

});

describe('exportToGLTF2 — large project', () => {

  it('200 trays export without error and result is under 1 MB', () => {
    const trays = Array.from({ length: 200 }, (_, i) =>
      makeTray(`TRAY-${i}`, { start_x: i * 10, end_x: i * 10 + 8 })
    );
    const glb = exportToGLTF2({ trays, projectName: 'BigProject' });
    assert.ok(glb instanceof Uint8Array);
    assert.ok(glb.byteLength < 1024 * 1024, `file too large: ${glb.byteLength} bytes`);
    const json = readGLBJson(glb);
    assert.strictEqual(json.meshes.length, 200);
  });

});

describe('packGLB', () => {

  it('produces valid GLB header for empty JSON and no BIN', () => {
    const glb = packGLB({ asset: { version: '2.0' } }, new ArrayBuffer(0));
    const dv  = new DataView(glb.buffer, glb.byteOffset);
    assert.strictEqual(dv.getUint32(0, true), 0x46546C67);
    assert.strictEqual(dv.getUint32(4, true), 2);
    assert.strictEqual(dv.getUint32(8, true), glb.byteLength);
  });

  it('JSON chunk length is a multiple of 4', () => {
    const glb      = packGLB({ asset: { version: '2.0' } }, new ArrayBuffer(0));
    const jsonChunk = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
    assert.strictEqual(jsonChunk % 4, 0);
  });

  it('total file size is a multiple of 4 when BIN present (padding)', () => {
    const bin = new ArrayBuffer(7); // not 4-byte aligned
    const glb = packGLB({ asset: { version: '2.0' } }, bin);
    assert.strictEqual(glb.byteLength % 4, 0);
    const dv = new DataView(glb.buffer, glb.byteOffset);
    assert.strictEqual(dv.getUint32(8, true), glb.byteLength);
  });

});
