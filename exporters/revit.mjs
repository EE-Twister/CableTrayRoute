/**
 * Revit/BIM bidirectional export.
 *
 * Converts CableTrayRoute tray, conduit, and cable data back into the
 * Revit-compatible JSON format that can be re-imported into Revit via a
 * shared-parameter script or the Revit API.
 *
 * The output schema mirrors the field names accepted by the Revit Dynamo
 * scripts typically used with cable tray families:
 *   { trays, conduits, cables, metadata }
 *
 * Round-trip fidelity: data imported with parseRevit (src/importers/revit.mjs)
 * and then exported with exportRevit produces a JSON that parseRevit can
 * re-import without loss.
 */

const VERSION = '1.0';

/**
 * Export tray, conduit, and cable data to Revit-compatible JSON.
 *
 * @param {object} opts
 * @param {Array}  opts.trays    - Tray objects from getTrays()
 * @param {Array}  opts.conduits - Conduit objects from getConduits()
 * @param {Array}  [opts.cables] - Cable objects from getCableSchedule()
 * @param {string} [opts.projectName]
 * @returns {object} Revit-compatible JSON object
 */
export function exportRevit({ trays = [], conduits = [], cables = [], projectName = 'CableTrayRoute Export' } = {}) {
  return {
    metadata: {
      exportVersion: VERSION,
      exportedAt: new Date().toISOString(),
      projectName,
      generator: 'CableTrayRoute',
      totalTrays: trays.length,
      totalConduits: conduits.length,
      totalCables: cables.length,
    },
    trays: trays.map(trayToRevit),
    conduits: conduits.map(conduitToRevit),
    cables: cables.map(cableToRevit),
  };
}

/**
 * Serialize to a JSON string ready for download.
 * @param {object} opts - same as exportRevit
 * @returns {string}
 */
export function exportRevitJSON(opts) {
  return JSON.stringify(exportRevit(opts), null, 2);
}

/**
 * Trigger a browser download of the Revit JSON file.
 * @param {object} opts - same as exportRevit
 * @param {string} [filename]
 */
export function downloadRevitExport(opts, filename = 'revit_export.json') {
  const json = exportRevitJSON(opts);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Internal normalisers
// ---------------------------------------------------------------------------

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function trayToRevit(t) {
  return {
    // Identity
    TrayID: t.id ?? t.tray_id ?? t.tag ?? '',
    Tag: t.tag ?? t.id ?? '',
    // Geometry – use Revit field names so the Dynamo script can read directly
    StartX: num(t.start_x) ?? 0,
    StartY: num(t.start_y) ?? 0,
    StartZ: num(t.start_z) ?? 0,
    EndX: num(t.end_x) ?? 0,
    EndY: num(t.end_y) ?? 0,
    EndZ: num(t.end_z) ?? 0,
    // Section
    Width: num(t.width) ?? null,
    Height: num(t.height ?? t.depth) ?? null,
    TrayType: t.type ?? t.tray_type ?? '',
    // Fill data (informational for Revit)
    FillPercent: num(t.fill_percent ?? t.fill) ?? null,
    Material: t.material ?? '',
    // CableTrayRoute-specific extras preserved for round-trip fidelity
    _ctr: {
      id: t.id,
      tag: t.tag,
      tray_type: t.tray_type ?? t.type,
      width: t.width,
      depth: t.depth,
      allowed_groups: t.allowed_groups,
      notes: t.notes,
    },
  };
}

function conduitToRevit(c) {
  return {
    ConduitID: c.conduit_id ?? c.id ?? c.tag ?? '',
    Tag: c.tag ?? c.conduit_id ?? '',
    ConduitType: c.type ?? c.conduit_type ?? '',
    TradeSize: c.trade_size ?? c.tradeSize ?? c.size ?? '',
    StartX: num(c.start_x) ?? 0,
    StartY: num(c.start_y) ?? 0,
    StartZ: num(c.start_z) ?? 0,
    EndX: num(c.end_x) ?? 0,
    EndY: num(c.end_y) ?? 0,
    EndZ: num(c.end_z) ?? 0,
    FillPercent: num(c.fill_percent ?? c.fill) ?? null,
    _ctr: {
      conduit_id: c.conduit_id,
      type: c.type,
      trade_size: c.trade_size,
      capacity: c.capacity,
    },
  };
}

function cableToRevit(cable) {
  return {
    CableTag: cable.tag ?? cable.cable_tag ?? cable.Tag ?? '',
    CableType: cable.cable_type ?? cable.type ?? '',
    From: cable.from ?? cable.source ?? '',
    To: cable.to ?? cable.destination ?? '',
    Voltage: cable.voltage ?? '',
    ConductorSize: cable.conductor_size ?? cable.size ?? '',
    NumConductors: cable.num_conductors ?? cable.conductors ?? null,
    RouteTrays: Array.isArray(cable.route) ? cable.route.join(', ') : (cable.route ?? ''),
    Length: num(cable.length ?? cable.route_length) ?? null,
    _ctr: {
      tag: cable.tag,
      cable_type: cable.cable_type,
      from: cable.from,
      to: cable.to,
      route: cable.route,
    },
  };
}
