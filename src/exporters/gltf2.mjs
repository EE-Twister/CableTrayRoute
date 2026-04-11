/**
 * glTF 2.0 binary exporter (.glb) for cable tray geometry.
 *
 * Generates solid rectangular-prism meshes for every cable tray segment and
 * polyline traces for cable routes.  The output can be imported into:
 *   - Autodesk Navisworks (File > Append, select glTF/GLB)
 *   - Autodesk BIM 360 / Construction Cloud (Model viewer)
 *   - Bentley ProjectWise / iTwin Viewer
 *   - Any glTF 2.0 conformant viewer (Babylon.js sandbox, three.js, etc.)
 *
 * Geometry matches the meshForSegment / trayMesh logic in app.mjs —
 * each tray is decomposed into axis-aligned rectangular prisms.
 * Fill-based heat-map coloring is carried over as glTF PBR materials.
 *
 * No external npm dependencies — implemented with standard JS typed arrays
 * (Float32Array, Uint16Array, DataView) only.
 *
 * @module src/exporters/gltf2
 */

// ---------------------------------------------------------------------------
// glTF binary constants
// ---------------------------------------------------------------------------

const GLTF_MAGIC   = 0x46546C67; // 'glTF'
const GLTF_VERSION = 2;
const CHUNK_JSON   = 0x4E4F534A; // 'JSON'
const CHUNK_BIN    = 0x004E4942; // 'BIN\0'

// Component type codes (glTF spec Table 3)
const COMPONENT_FLOAT  = 5126;
const COMPONENT_USHORT = 5123;

// Buffer target codes
const TARGET_ARRAY_BUFFER         = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

// Primitive modes
const MODE_TRIANGLES = 4;
const MODE_LINES     = 1;

// ---------------------------------------------------------------------------
// Box geometry
// ---------------------------------------------------------------------------

/**
 * Triangle index list (36 indices = 12 triangles) for an 8-vertex box.
 * Vertex layout (matches meshForSegment in app.mjs):
 *   v0..v3 = start-cap corners  (CCW order when viewed from outside)
 *   v4..v7 = end-cap   corners  (same XY/XZ/YZ position, shifted along axis)
 *
 * Materials are marked doubleSided so winding order is non-critical, but the
 * ordering below produces correct outward-facing normals for a Z-up scene.
 */
const BOX_INDICES = new Uint16Array([
  0, 1, 2,  0, 2, 3,   // start cap
  4, 6, 5,  4, 7, 6,   // end cap   (reversed so normal faces outward)
  0, 4, 7,  0, 7, 3,   // side A
  1, 5, 6,  1, 6, 2,   // side B
  0, 1, 5,  0, 5, 4,   // side C
  3, 2, 6,  3, 6, 7,   // side D
]);
const BOX_INDEX_COUNT = BOX_INDICES.length; // 36

/**
 * Compute the 8 vertices of a rectangular prism for one axis-aligned segment.
 * Replicates meshForSegment() from app.mjs exactly.
 *
 * @param {number[]} s     - [x, y, z] start point
 * @param {number[]} e     - [x, y, z] end point
 * @param {object}   tray  - { width, height } in inches (divided by 12 → feet)
 * @returns {Float32Array} 24 floats — 8 vertices × (x, y, z)
 */
function boxVerts(s, e, tray) {
  const w  = num(tray.width)  / 12;   // inches → feet
  const h  = num(tray.height) / 12;
  const [sx, sy, sz] = s;
  const [ex, ey, ez] = e;
  let v;
  if (sx !== ex) {
    const y1 = sy - w / 2, y2 = sy + w / 2;
    const z1 = sz - h / 2, z2 = sz + h / 2;
    v = [sx,y1,z1, sx,y2,z1, sx,y2,z2, sx,y1,z2,
         ex,y1,z1, ex,y2,z1, ex,y2,z2, ex,y1,z2];
  } else if (sy !== ey) {
    const x1 = sx - w / 2, x2 = sx + w / 2;
    const z1 = sz - h / 2, z2 = sz + h / 2;
    v = [x1,sy,z1, x2,sy,z1, x2,sy,z2, x1,sy,z2,
         x1,ey,z1, x2,ey,z1, x2,ey,z2, x1,ey,z2];
  } else {
    const x1 = sx - w / 2, x2 = sx + w / 2;
    const y1 = sy - h / 2, y2 = sy + h / 2;
    v = [x1,y1,sz, x2,y1,sz, x2,y2,sz, x1,y2,sz,
         x1,y1,ez, x2,y1,ez, x2,y2,ez, x1,y2,ez];
  }
  return new Float32Array(v);
}

/**
 * Decompose a tray's straight-line path into axis-aligned sub-segments.
 * Replicates trayMesh() from app.mjs.
 *
 * @param {object} tray
 * @returns {Array<[number[], number[]]>}
 */
function traySubSegments(tray) {
  const start = [num(tray.start_x), num(tray.start_y), num(tray.start_z)];
  const end   = [num(tray.end_x),   num(tray.end_y),   num(tray.end_z)];
  const segs  = [];
  let cur     = start.slice();
  if (cur[0] !== end[0]) { const nxt = [end[0], cur[1], cur[2]]; segs.push([cur, nxt]); cur = nxt; }
  if (cur[1] !== end[1]) { const nxt = [cur[0], end[1], cur[2]]; segs.push([cur, nxt]); cur = nxt; }
  if (cur[2] !== end[2]) { const nxt = [cur[0], cur[1], end[2]]; segs.push([cur, nxt]); cur = nxt; }
  if (segs.length === 0) segs.push([start, end]);
  return segs;
}

// ---------------------------------------------------------------------------
// Material index helpers
// ---------------------------------------------------------------------------

/**
 * Map a fill percentage (0–100) to one of three fill heat-map materials:
 *   0 = grey  (< 40%)
 *   1 = yellow (40–80%)
 *   2 = red   (≥ 80%)
 *
 * @param {number} pct
 * @returns {number} material index (0–2)
 */
function fillMatIdx(pct) {
  if (pct >= 80) return 2;
  if (pct >= 40) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TrayRecord
 * @property {string}  [tray_id]
 * @property {number}  [start_x]
 * @property {number}  [start_y]
 * @property {number}  [start_z]
 * @property {number}  [end_x]
 * @property {number}  [end_y]
 * @property {number}  [end_z]
 * @property {number}  [width]         inches
 * @property {number}  [height]        inches
 * @property {number}  [current_fill]
 * @property {number}  [maxFill]
 * @property {number}  [numSlots]
 * @property {number[]}[slotFills]
 * @property {string}  [raceway_type]
 */

/**
 * @typedef {object} CableRecord
 * @property {string}  [label]
 * @property {string}  [cable_id]
 * @property {string}  [from_tag]
 * @property {string}  [to_tag]
 * @property {number}  [start_x]
 * @property {number}  [start_y]
 * @property {number}  [start_z]
 * @property {number}  [end_x]
 * @property {number}  [end_y]
 * @property {number}  [end_z]
 * @property {number[]}[startPoint]    alternative: [x, y, z]
 * @property {number[]}[endPoint]      alternative: [x, y, z]
 */

/**
 * Export tray and cable data to a glTF 2.0 binary (.glb) buffer.
 *
 * Each tray becomes a named glTF node with solid prism geometry and a
 * fill-based PBR material.  Cable routes are rendered as LINES primitives.
 * Per-element metadata (tray_id, fill_pct, width_mm, height_mm) is stored
 * in node.extras and is accessible in Navisworks via the Properties panel.
 *
 * Coordinate system: matches the application's Z-up convention (X-East,
 * Y-North, Z-Up) without axis remapping.  Units are the same as the source
 * data (typically feet for x/y/z; inches for width/height which are divided
 * by 12 internally).
 *
 * @param {object}       opts
 * @param {TrayRecord[]} [opts.trays=[]]       - cable tray / conduit / ductbank records
 * @param {CableRecord[]}[opts.cables=[]]      - cable route records (optional)
 * @param {string}       [opts.projectName='CableTrayRoute Export']
 * @returns {Uint8Array} .glb file contents ready for download or streaming
 */
export function exportToGLTF2({
  trays       = [],
  cables      = [],
  projectName = 'CableTrayRoute Export',
} = {}) {

  // ── 1. Compute per-tray geometry ─────────────────────────────────────────
  const trayItems = trays.map((tray, ti) => {
    const segs     = traySubSegments(tray);
    const allVerts = [];
    const allIdx   = [];

    for (const [s, e] of segs) {
      const offset = allVerts.length / 3; // vertex index offset for this sub-segment
      const verts  = boxVerts(s, e, tray);
      for (let i = 0; i < verts.length; i++) allVerts.push(verts[i]);
      for (let i = 0; i < BOX_INDEX_COUNT; i++) allIdx.push(BOX_INDICES[i] + offset);
    }

    const totalFill = Array.isArray(tray.slotFills)
      ? tray.slotFills.reduce((a, b) => a + b, 0)
      : num(tray.current_fill);
    const maxFill = num(tray.maxFill) * (num(tray.numSlots) || 1);
    const fillPct = maxFill > 0 ? (totalFill / maxFill) * 100 : 0;

    return {
      tray,
      fillPct,
      matIdx:  fillMatIdx(fillPct),
      verts:   new Float32Array(allVerts),
      indices: new Uint16Array(allIdx),
    };
  });

  // ── 2. Compute per-cable geometry (GL_LINES) ─────────────────────────────
  const cableItems = cables.map((cable, ci) => {
    const sx = num(cable.start_x  ?? cable.startPoint?.[0]);
    const sy = num(cable.start_y  ?? cable.startPoint?.[1]);
    const sz = num(cable.start_z  ?? cable.startPoint?.[2]);
    const ex = num(cable.end_x    ?? cable.endPoint?.[0]);
    const ey = num(cable.end_y    ?? cable.endPoint?.[1]);
    const ez = num(cable.end_z    ?? cable.endPoint?.[2]);
    return {
      cable,
      verts:   new Float32Array([sx, sy, sz, ex, ey, ez]),
      indices: new Uint16Array([0, 1]),
    };
  });

  // ── 3. Lay out the binary buffer ─────────────────────────────────────────
  // All bufferViews for POSITION data must be 4-byte aligned (Float32 = 4).
  // Index bufferViews require 2-byte alignment; we pad to 4 for safety.

  const allItems = [...trayItems, ...cableItems];
  const layout   = [];
  let   bOffset  = 0;

  for (const item of allItems) {
    // Align to 4 bytes before each position block
    bOffset = align4(bOffset);
    const posOff = bOffset;
    bOffset += item.verts.byteLength;

    bOffset = align4(bOffset);
    const idxOff = bOffset;
    bOffset += item.indices.byteLength;
    bOffset = align4(bOffset); // ensure next block is aligned

    layout.push({
      posOff, posBytes: item.verts.byteLength,
      idxOff, idxBytes: item.indices.byteLength,
      vertCount: item.verts.length / 3,
      idxCount:  item.indices.length,
    });
  }
  const totalBinBytes = bOffset;

  // Build the flat binary buffer
  const binBuf  = new ArrayBuffer(totalBinBytes);
  const binU8   = new Uint8Array(binBuf);
  for (let i = 0; i < allItems.length; i++) {
    binU8.set(new Uint8Array(allItems[i].verts.buffer),   layout[i].posOff);
    binU8.set(new Uint8Array(allItems[i].indices.buffer), layout[i].idxOff);
  }

  // ── 4. Build glTF JSON ───────────────────────────────────────────────────
  const bufferViews = [];
  const accessors   = [];
  const meshes      = [];
  const nodes       = [];
  const childNodes  = [];

  // Three fill heat-map materials + one for cable routes
  const materials = [
    {
      name: 'fill_low',
      doubleSided: true,
      alphaMode: 'BLEND',
      pbrMetallicRoughness: { baseColorFactor: [0.70, 0.70, 0.70, 0.90], metallicFactor: 0.1, roughnessFactor: 0.8 },
    },
    {
      name: 'fill_medium',
      doubleSided: true,
      alphaMode: 'BLEND',
      pbrMetallicRoughness: { baseColorFactor: [1.00, 0.75, 0.00, 0.90], metallicFactor: 0.1, roughnessFactor: 0.8 },
    },
    {
      name: 'fill_high',
      doubleSided: true,
      alphaMode: 'BLEND',
      pbrMetallicRoughness: { baseColorFactor: [0.85, 0.10, 0.10, 0.90], metallicFactor: 0.1, roughnessFactor: 0.8 },
    },
    {
      name: 'cable_route',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [0.20, 0.45, 0.90, 1.00] },
    },
  ];

  // Tray nodes
  for (let i = 0; i < trayItems.length; i++) {
    const item = trayItems[i];
    const lay  = layout[i];
    const posV = addBufferView(bufferViews, 0, lay.posOff, lay.posBytes, TARGET_ARRAY_BUFFER);
    const idxV = addBufferView(bufferViews, 0, lay.idxOff, lay.idxBytes, TARGET_ELEMENT_ARRAY_BUFFER);
    const posA = addAccessor(accessors, posV, COMPONENT_FLOAT,  'VEC3',   lay.vertCount, false);
    const idxA = addAccessor(accessors, idxV, COMPONENT_USHORT, 'SCALAR', lay.idxCount,  false);

    const meshIdx = meshes.length;
    meshes.push({
      name:       item.tray.tray_id || `tray_${i}`,
      primitives: [{ attributes: { POSITION: posA }, indices: idxA, mode: MODE_TRIANGLES, material: item.matIdx }],
    });
    const nodeIdx = nodes.length;
    childNodes.push(nodeIdx);
    nodes.push({
      name: item.tray.tray_id || `TRAY_${i}`,
      mesh: meshIdx,
      extras: {
        tray_id:      item.tray.tray_id      || '',
        fill_pct:     +item.fillPct.toFixed(1),
        width_in:     num(item.tray.width),
        height_in:    num(item.tray.height),
        raceway_type: item.tray.raceway_type || 'tray',
      },
    });
  }

  // Cable nodes
  for (let ci = 0; ci < cableItems.length; ci++) {
    const item = cableItems[ci];
    const gi   = trayItems.length + ci;
    const lay  = layout[gi];
    const posV = addBufferView(bufferViews, 0, lay.posOff, lay.posBytes, TARGET_ARRAY_BUFFER);
    const idxV = addBufferView(bufferViews, 0, lay.idxOff, lay.idxBytes, TARGET_ELEMENT_ARRAY_BUFFER);
    const posA = addAccessor(accessors, posV, COMPONENT_FLOAT,  'VEC3',   lay.vertCount, false);
    const idxA = addAccessor(accessors, idxV, COMPONENT_USHORT, 'SCALAR', lay.idxCount,  false);

    const meshIdx = meshes.length;
    meshes.push({
      name:       item.cable.label || `cable_${ci}`,
      primitives: [{ attributes: { POSITION: posA }, indices: idxA, mode: MODE_LINES, material: 3 }],
    });
    const nodeIdx = nodes.length;
    childNodes.push(nodeIdx);
    nodes.push({
      name: item.cable.label || `CABLE_${ci}`,
      mesh: meshIdx,
      extras: {
        cable_id: item.cable.cable_id || item.cable.label || '',
        from_tag: item.cable.from_tag || '',
        to_tag:   item.cable.to_tag   || '',
      },
    });
  }

  // Root grouping node
  const rootIdx = nodes.length;
  nodes.push({ name: projectName, children: childNodes });

  const gltfJson = {
    asset: { version: '2.0', generator: 'CableTrayRoute', copyright: projectName },
    scene: 0,
    scenes:      [{ name: projectName, nodes: [rootIdx] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers:     [{ byteLength: totalBinBytes }],
  };

  // ── 5. Pack into .glb ────────────────────────────────────────────────────
  return packGLB(gltfJson, binBuf);
}

// ---------------------------------------------------------------------------
// GLB packing
// ---------------------------------------------------------------------------

/**
 * Pack a glTF JSON descriptor and a binary buffer into a .glb (GLB) file.
 *
 * @param {object}      json   - glTF 2.0 JSON descriptor
 * @param {ArrayBuffer} binBuf - raw geometry buffer (may have byteLength 0)
 * @returns {Uint8Array} complete .glb contents
 */
export function packGLB(json, binBuf) {
  const encoder  = typeof TextEncoder !== 'undefined'
    ? new TextEncoder()
    : { encode: (s) => Buffer.from(s, 'utf8') };  // Node.js fallback

  const jsonBytes = encoder.encode(JSON.stringify(json));
  const jsonPad   = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = jsonBytes.length + jsonPad;

  const binU8   = new Uint8Array(binBuf);
  const hasBin  = binU8.length > 0;
  const binPad  = hasBin ? (4 - (binU8.length % 4)) % 4 : 0;
  const binChunk = binU8.length + binPad;

  const totalLen = 12                          // GLB header
    + 8 + jsonChunk                            // JSON chunk header + data
    + (hasBin ? 8 + binChunk : 0);            // BIN  chunk header + data

  const out = new ArrayBuffer(totalLen);
  const dv  = new DataView(out);
  let p = 0;

  // Header
  dv.setUint32(p, GLTF_MAGIC,   true); p += 4;
  dv.setUint32(p, GLTF_VERSION, true); p += 4;
  dv.setUint32(p, totalLen,     true); p += 4;

  // JSON chunk
  dv.setUint32(p, jsonChunk, true); p += 4;
  dv.setUint32(p, CHUNK_JSON, true); p += 4;
  new Uint8Array(out, p, jsonBytes.length).set(jsonBytes);
  // Pad with ASCII space (0x20) as required by spec
  for (let i = 0; i < jsonPad; i++) dv.setUint8(p + jsonBytes.length + i, 0x20);
  p += jsonChunk;

  // BIN chunk
  if (hasBin) {
    dv.setUint32(p, binChunk, true); p += 4;
    dv.setUint32(p, CHUNK_BIN, true); p += 4;
    new Uint8Array(out, p, binU8.length).set(binU8);
    // Pad with zeros
    for (let i = 0; i < binPad; i++) dv.setUint8(p + binU8.length + i, 0x00);
    p += binChunk;
  }

  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// glTF JSON builder helpers
// ---------------------------------------------------------------------------

function addBufferView(views, buffer, byteOffset, byteLength, target) {
  const idx = views.length;
  views.push({ buffer, byteOffset, byteLength, target });
  return idx;
}

function addAccessor(accessors, bufferView, componentType, type, count, normalized) {
  const idx = accessors.length;
  accessors.push({ bufferView, byteOffset: 0, componentType, type, count, normalized });
  return idx;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Coerce value to finite number, defaulting to 0. */
function num(v) {
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : 0;
}

/** Round up to the next 4-byte boundary. */
function align4(n) {
  return n % 4 === 0 ? n : n + (4 - (n % 4));
}
