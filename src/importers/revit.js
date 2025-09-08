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
function parseRevit(input) {
  if (typeof input === "string") {
    // Try JSON first – many exporters can emit JSON directly.
    try {
      const obj = JSON.parse(input);
      return parseRevitJSON(obj);
    } catch {
      // Treat as IFC STEP text
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
 * This is a best‑effort helper and is not meant to cover the entire IFC
 * specification, but it is sufficient for small test files and demos.
 *
 * @param {string} text
 */
function parseIFC(text) {
  const trays = [];
  const conduits = [];
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
  return { trays, conduits };
}

module.exports = { parseRevit };
