/**
 * Simple parser for Revit/IFC exports that extracts tray and conduit
 * geometry. The goal is not to support the full schemas but to pull out
 * basic start/end coordinates used by the app. The function accepts
 * either a JSON object/string or raw IFC STEP text.
 *
 * Returned geometry objects use the field names already consumed by the
 * data store (start_x, start_y, ...).
 *
 * @param {string|object} input - IFC STEP text or Revit JSON.
 * @returns {{trays:Array, conduits:Array}}
 */
export function parseRevit(input) {
  if (typeof input === "string") {
    // Try JSON first – many exporters can emit JSON directly.
    try {
      const obj = JSON.parse(input);
      return parseRevitJSON(obj);
    } catch (err) {
      console.debug('[revit] Input is not JSON, attempting IFC STEP parse:', err.message);
      return parseIFC(input);
    }
  }
  // Already an object – assume JSON structure
  return parseRevitJSON(input);
}

/**
 * Parse a Revit style JSON export. The exporter format is not
 * standardized so we try a few common field names.
 * @param {any} obj
 */
function parseRevitJSON(obj) {
  if (!obj || typeof obj !== "object") return { trays: [], conduits: [] };
  const trays = [];
  const conduits = [];

  const traySrc =
    obj.trays || obj.Trays || obj.cableTrays || obj.CableTrays || [];
  for (const t of traySrc) {
    trays.push(normalizeTray(t));
  }

  const conduitSrc =
    obj.conduits ||
    obj.Conduits ||
    obj.cableConduits ||
    obj.ConduitSegments ||
    [];
  for (const c of conduitSrc) {
    conduits.push(normalizeConduit(c));
  }

  return { trays, conduits };
}

function num(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTray(t = {}) {
  return {
    id: t.id || t.tag || t.tray_id || t.TrayID || t.name || t.Tag || "",
    start_x: num(t.start_x ?? t.sx ?? t.x1 ?? t.StartX ?? t.start?.x),
    start_y: num(t.start_y ?? t.sy ?? t.y1 ?? t.StartY ?? t.start?.y),
    start_z: num(t.start_z ?? t.sz ?? t.z1 ?? t.StartZ ?? t.start?.z),
    end_x: num(t.end_x ?? t.ex ?? t.x2 ?? t.EndX ?? t.end?.x),
    end_y: num(t.end_y ?? t.ey ?? t.y2 ?? t.EndY ?? t.end?.y),
    end_z: num(t.end_z ?? t.ez ?? t.z2 ?? t.EndZ ?? t.end?.z),
    width: num(t.width ?? t.w ?? t.Width ?? t.size_x),
    height: num(t.height ?? t.h ?? t.Height ?? t.size_y),
  };
}

function normalizeConduit(c = {}) {
  return {
    conduit_id: c.conduit_id || c.id || c.tag || c.ConduitID || "",
    type: c.type || c.conduit_type || c.Type || "",
    trade_size: c.trade_size || c.tradeSize || c.size || c.TradeSize || "",
    start_x: num(c.start_x ?? c.sx ?? c.x1 ?? c.start?.x),
    start_y: num(c.start_y ?? c.sy ?? c.y1 ?? c.start?.y),
    start_z: num(c.start_z ?? c.sz ?? c.z1 ?? c.start?.z),
    end_x: num(c.end_x ?? c.ex ?? c.x2 ?? c.end?.x),
    end_y: num(c.end_y ?? c.ey ?? c.y2 ?? c.end?.y),
    end_z: num(c.end_z ?? c.ez ?? c.z2 ?? c.end?.z),
    capacity: num(c.capacity ?? c.fill),
  };
}

/**
 * Extremely small IFC STEP parser. It looks for entities that contain an
 * `IFCPOLYLINE` with two points – the start and end of a segment. If the
 * entity name includes `CABLECARRIER` it is treated as a tray; otherwise
 * it is treated as a conduit segment.
 *
 * Supports two formats:
 *   1. Inline simplified: #N=IFCCABLECARRIERSEGMENTIFCPOLYLINE((x,y,z),(x,y,z))
 *   2. Referenced-entity (IFC4 proper): separate IFCCARTESIANPOINT / IFCPOLYLINE /
 *      IFCCABLECARRIERSEGMENT entities linked by entity references (#N).
 *
 * This is a best‑effort helper and is not meant to cover the entire IFC
 * specification, but it is sufficient for small test files and demos.
 *
 * @param {string} text
 */
function parseIFC(text) {
  const trays = [];
  const conduits = [];

  // --- Pass 1: inline simplified format (existing behaviour) ---
  const segRegex =
    /#\d+=IFC([^;]*?)SEGMENT[^;]*?IFCPOLYLINE\(\(([^)]+)\),\(([^)]+)\)\)/gi;
  let match;
  let i = 0;
  while ((match = segRegex.exec(text))) {
    const kind = match[1] || "";
    const start = match[2].split(",").map((v) => parseFloat(v));
    const end = match[3].split(",").map((v) => parseFloat(v));
    const seg = {
      id: `SEG-${i++}`,
      start_x: start[0],
      start_y: start[1],
      start_z: start[2],
      end_x: end[0],
      end_y: end[1],
      end_z: end[2],
    };
    if (/CABLECARRIER/i.test(kind)) trays.push(seg);
    else conduits.push(seg);
  }

  // If inline format found something, return it
  if (trays.length > 0 || conduits.length > 0) return { trays, conduits };

  // --- Pass 2: referenced-entity IFC4 format ---
  // Build a map from entity id → parsed content for CartesianPoint and Polyline
  const cartesianPoints = new Map(); // entityId → [x, y, z]
  const polylines = new Map();       // entityId → [pt1Id, pt2Id]

  // Parse IFCCARTESIANPOINT(( x, y, z ));
  const ptRegex = /#(\d+)=IFCCARTESIANPOINT\(\(([^)]+)\)\)/gi;
  let ptMatch;
  while ((ptMatch = ptRegex.exec(text))) {
    const coords = ptMatch[2].split(",").map(v => parseFloat(v.trim()));
    cartesianPoints.set(ptMatch[1], coords);
  }

  // Parse IFCPOLYLINE(( #id1, #id2 ));
  const plRegex = /#(\d+)=IFCPOLYLINE\(\(([^)]+)\)\)/gi;
  let plMatch;
  while ((plMatch = plRegex.exec(text))) {
    const refs = plMatch[2].match(/#(\d+)/g)?.map(r => r.slice(1)) || [];
    if (refs.length >= 2) polylines.set(plMatch[1], refs);
  }

  // Parse IFCCABLECARRIERSEGMENT entries and trace geometry via shape references
  // Format: #N=IFCCABLECARRIERSEGMENT('guid',#owner,'name',...,#placement,#repMap,...,.TYPE.);
  const segEntityRegex = /#\d+=IFCCABLECARRIERSEGMENT\(([^;]+)\);/gi;
  let segEMatch;
  let j = 0;
  while ((segEMatch = segEntityRegex.exec(text))) {
    const body = segEMatch[1];
    // Extract the name (3rd positional argument, single-quoted)
    const nameMatch = body.match(/'([^']*)'/g);
    const segName = nameMatch && nameMatch[1] ? nameMatch[1].replace(/'/g, '') : `SEG-${j}`;
    // Determine type: .CABLETRAY. or .CONDUIT.
    const isTray = /\.CABLETRAY\./i.test(body);

    // Find the first IFCPOLYLINE entity referenced anywhere in this segment's geometry chain.
    // Rather than fully tracing the shape graph, we find the polyline closest before this segment.
    // Strategy: find the polyline that was defined most recently before this segment entry.
    const segOffset = segEMatch.index;
    let bestPolyId = null;
    for (const pid of polylines.keys()) {
      const pidMatch = text.indexOf(`#${pid}=IFCPOLYLINE`);
      if (pidMatch < segOffset) bestPolyId = pid;
    }

    if (bestPolyId) {
      const ptIds = polylines.get(bestPolyId);
      const pt1 = cartesianPoints.get(ptIds[0]) || [0, 0, 0];
      const pt2 = cartesianPoints.get(ptIds[1]) || [0, 0, 0];
      const seg = {
        id: segName || `SEG-${j}`,
        start_x: pt1[0],
        start_y: pt1[1],
        start_z: pt1[2],
        end_x: pt2[0],
        end_y: pt2[1],
        end_z: pt2[2],
      };
      if (isTray) trays.push(seg);
      else conduits.push(seg);
    }
    j++;
  }

  return { trays, conduits };
}

