/**
 * Substation Physical Layout Generator (Gap #89)
 *
 * Generates a screening-level 2D physical arrangement from a one-line
 * topology: equipment footprints snapped into voltage-level lanes, electrical
 * working clearances per IEEE 1119 / NESC, a perimeter fence, and a
 * ground-grid polygon that can seed the Ground Grid study.
 *
 * Coordinates and dimensions are in feet (US substation practice). The layout
 * is deterministic — the same equipment list always yields the same geometry.
 *
 * References:
 *   IEEE Std 1119 — Guide for Fence Safety Clearances in Electric-Supply Stations.
 *   NESC (IEEE C2) §124 — Working clearances.
 *   IEEE Std 605 — Bus design / substation physical layout practice.
 */

import { toBaseKV } from '../utils/voltage.js';

/** Default aisle gap between adjacent equipment envelopes in a lane (ft). */
export const AISLE_FT = 6;
/** Default site border margin (ft). */
export const MARGIN_FT = 10;
/** Ground grid extends this far beyond the fence (ft). */
export const GROUND_GRID_MARGIN_FT = 3;

/**
 * Equipment footprint library (plan dimensions in feet) keyed by a normalised
 * equipment class. Values are typical screening footprints; refine against
 * vendor GA drawings for final design.
 */
export const EQUIPMENT_FOOTPRINTS = {
  transformer:      { w: 25, h: 22, label: 'Power Transformer' },
  circuit_breaker:  { w: 8,  h: 6,  label: 'Circuit Breaker' },
  disconnect:       { w: 6,  h: 4,  label: 'Disconnect Switch' },
  switchgear:       { w: 30, h: 12, label: 'Switchgear / MCC' },
  capacitor_bank:   { w: 16, h: 12, label: 'Capacitor Bank' },
  reactor:          { w: 12, h: 12, label: 'Reactor' },
  generator:        { w: 30, h: 15, label: 'Generator' },
  motor:            { w: 8,  h: 8,  label: 'Motor' },
  instrument:       { w: 3,  h: 3,  label: 'Instrument Transformer' },
  arrester:         { w: 2,  h: 2,  label: 'Surge Arrester' },
  load:             { w: 8,  h: 6,  label: 'Load' },
  control_building: { w: 40, h: 20, label: 'Control Building' },
  default:          { w: 10, h: 8,  label: 'Equipment' },
};

/**
 * Electrical working-clearance setback by maximum system voltage (kV → ft).
 * Applied as a setback on every side of the footprint (IEEE 1119 / NESC §124).
 */
export const CLEARANCE_TABLE_FT = [
  { kv: 1,   ft: 3 },
  { kv: 15,  ft: 3 },
  { kv: 35,  ft: 4 },
  { kv: 69,  ft: 6 },
  { kv: 115, ft: 8 },
  { kv: 138, ft: 9 },
  { kv: 161, ft: 10 },
  { kv: 230, ft: 13 },
  { kv: 345, ft: 18 },
  { kv: 500, ft: 25 },
];

// ---------------------------------------------------------------------------
// Classification & lookups
// ---------------------------------------------------------------------------

/**
 * Map a component type/subtype string to a footprint class key.
 * @param {string} typeOrSubtype
 * @returns {string} A key of EQUIPMENT_FOOTPRINTS
 */
export function classifyEquipment(typeOrSubtype) {
  const s = String(typeOrSubtype || '').toLowerCase();
  if (/transformer/.test(s) && !/instrument|potential|current|\bct\b|\bpt\b/.test(s)) return 'transformer';
  if (/breaker/.test(s)) return 'circuit_breaker';
  if (/disconnect|switch(?!gear)|isolator/.test(s)) return 'disconnect';
  if (/switchgear|mcc|switchboard|panel/.test(s)) return 'switchgear';
  if (/capacitor/.test(s)) return 'capacitor_bank';
  if (/reactor|inductor/.test(s)) return 'reactor';
  if (/generator|genset/.test(s)) return 'generator';
  if (/motor/.test(s)) return 'motor';
  if (/arrester|surge/.test(s)) return 'arrester';
  if (/\bct\b|\bpt\b|instrument|potential transformer|current transformer|meter/.test(s)) return 'instrument';
  if (/control building|control house|relay house/.test(s)) return 'control_building';
  if (/load|motor_controller/.test(s)) return 'load';
  return 'default';
}

/** Footprint for an equipment class key (falls back to default). */
export function footprintFor(typeKey) {
  return EQUIPMENT_FOOTPRINTS[typeKey] || EQUIPMENT_FOOTPRINTS.default;
}

/** Working-clearance setback (ft) for a system voltage (kV). */
export function clearanceForVoltage(kv) {
  const v = Number(kv) || 0;
  let setback = CLEARANCE_TABLE_FT[0].ft;
  for (const row of CLEARANCE_TABLE_FT) {
    if (v >= row.kv) setback = row.ft;
  }
  return setback;
}

// ---------------------------------------------------------------------------
// One-line extraction
// ---------------------------------------------------------------------------

/** Component types that are not placeable footprints (lanes / connections). */
const NON_PLACEABLE = /^(bus|busbar|cable|line|annotation|dimension|sheet|link|node)$/i;

/**
 * Flatten a one-line model into a placeable equipment list.
 * @param {Object} oneLine - { sheets: [{ components: [...] }] } or { components: [...] }
 * @returns {Array<{id:string, tag:string, type:string, voltageKv:number}>}
 */
export function extractEquipment(oneLine) {
  if (!oneLine || typeof oneLine !== 'object') return [];
  const sheets = Array.isArray(oneLine.sheets) ? oneLine.sheets
    : Array.isArray(oneLine.components) ? [{ components: oneLine.components }]
    : [];
  const out = [];
  for (const sheet of sheets) {
    const comps = Array.isArray(sheet?.components) ? sheet.components : [];
    for (const c of comps) {
      const type = c.subtype || c.type || '';
      if (!type || NON_PLACEABLE.test(String(c.type || '')) || NON_PLACEABLE.test(String(type))) continue;
      const kv = toBaseKV(c.voltage) ?? 0;
      out.push({
        id: c.id || c.ref || c.label || `EQ${out.length + 1}`,
        tag: c.ref || c.label || c.id || `EQ${out.length + 1}`,
        type,
        voltageKv: Number.isFinite(kv) ? kv : 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layout generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic 2D substation layout from an equipment list.
 *
 * @param {Array<{id,tag,type,voltageKv}>} equipment
 * @param {Object} [opts]
 * @param {number} [opts.aisle=AISLE_FT]
 * @param {number} [opts.margin=MARGIN_FT]
 * @returns {SubstationLayout}
 */
export function generateLayout(equipment, opts = {}) {
  const aisle = Number.isFinite(opts.aisle) ? opts.aisle : AISLE_FT;
  const margin = Number.isFinite(opts.margin) ? opts.margin : MARGIN_FT;

  const list = (equipment || []).filter(e => e && e.type);
  // Group by voltage level (descending → HV lane at top).
  const byKv = new Map();
  for (const e of list) {
    const kv = Number(e.voltageKv) || 0;
    if (!byKv.has(kv)) byKv.set(kv, []);
    byKv.get(kv).push(e);
  }
  const voltages = [...byKv.keys()].sort((a, b) => b - a);

  const footprints = [];
  const lanes = [];
  let y = margin;

  for (let laneIdx = 0; laneIdx < voltages.length; laneIdx++) {
    const kv = voltages[laneIdx];
    const items = byKv.get(kv);
    const setback = clearanceForVoltage(kv);
    let x = margin;
    let laneHeight = 0;

    for (const e of items) {
      const key = classifyEquipment(e.type);
      const fp = footprintFor(key);
      const envW = fp.w + 2 * setback;
      const envH = fp.h + 2 * setback;
      footprints.push({
        id: e.id,
        tag: e.tag,
        type: e.type,
        typeKey: key,
        label: fp.label,
        voltageKv: kv,
        lane: laneIdx,
        // footprint sits centred inside its clearance envelope
        x: x + setback,
        y: y + setback,
        w: fp.w,
        h: fp.h,
        envX: x,
        envY: y,
        envW,
        envH,
        setback,
      });
      x += envW + aisle;
      if (envH > laneHeight) laneHeight = envH;
    }

    lanes.push({ voltageKv: kv, y, height: laneHeight, width: Math.max(0, x - aisle - margin), count: items.length });
    y += laneHeight + Math.max(15, setback * 1.5); // inter-lane gap
  }

  // Bounding box of all clearance envelopes.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of footprints) {
    minX = Math.min(minX, f.envX);
    minY = Math.min(minY, f.envY);
    maxX = Math.max(maxX, f.envX + f.envW);
    maxY = Math.max(maxY, f.envY + f.envH);
  }
  if (!footprints.length) { minX = minY = 0; maxX = maxY = 0; }
  const boundingBox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };

  // Fence offset from the highest-voltage clearance, plus a safety margin.
  const maxKv = voltages.length ? voltages[0] : 0;
  const fenceSetback = clearanceForVoltage(maxKv) + 10;
  const fence = {
    x: minX - fenceSetback,
    y: minY - fenceSetback,
    width: boundingBox.width + 2 * fenceSetback,
    height: boundingBox.height + 2 * fenceSetback,
  };

  // Ground-grid polygon extends beyond the fence.
  const g = GROUND_GRID_MARGIN_FT;
  const gx = fence.x - g, gy = fence.y - g;
  const gw = fence.width + 2 * g, gh = fence.height + 2 * g;
  const groundGridPolygon = [
    { x: gx, y: gy },
    { x: gx + gw, y: gy },
    { x: gx + gw, y: gy + gh },
    { x: gx, y: gy + gh },
  ];

  const siteBoundary = {
    width: fence.width + 2 * margin,
    height: fence.height + 2 * margin,
  };

  const warnings = [];
  if (!footprints.length) {
    warnings.push('No placeable equipment found. Add transformers, breakers, switchgear, or other apparatus to the one-line.');
  }
  if (voltages.length > 4) {
    warnings.push(`${voltages.length} distinct voltage levels detected — verify the lane grouping matches the intended bus arrangement.`);
  }
  const unclassified = footprints.filter(f => f.typeKey === 'default').length;
  if (unclassified > 0) {
    warnings.push(`${unclassified} component(s) used a generic footprint — refine the equipment type for an accurate arrangement.`);
  }

  return {
    footprints,
    lanes,
    voltages,
    boundingBox,
    fence,
    siteBoundary,
    groundGridPolygon,
    maxVoltageKv: maxKv,
    equipmentCount: footprints.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the substation layout study. Provide equipment directly, or a one-line
 * model to extract it from.
 *
 * @param {Object} [config]
 * @param {Array} [config.equipment] - Explicit equipment list.
 * @param {Object} [config.oneLine] - One-line model to extract equipment from.
 * @param {Object} [config.opts] - Layout options (aisle, margin).
 * @returns {SubstationLayout & {inputs:Object}}
 */
export function runSubstationLayout(config = {}) {
  let equipment = Array.isArray(config.equipment) ? config.equipment : null;
  if (!equipment && config.oneLine) equipment = extractEquipment(config.oneLine);
  if (!equipment || equipment.length === 0) {
    throw new Error('No equipment available. Provide an equipment list or a one-line diagram with placeable apparatus.');
  }
  const layout = generateLayout(equipment, config.opts || {});
  return { inputs: { equipment, opts: config.opts || {} }, ...layout };
}
