/** Validate and apply explicit design-synthesis placement overrides. */

const ALLOWED_OVERRIDE_FIELDS = new Set(['x', 'y', 'z', 'note']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function issue(code, message, path) {
  return { code, message, severity: 'blocking', path };
}

export function validatePanelLocationOverrides(overrides, options = {}) {
  const issues = [];
  if (overrides === undefined) return { ok: true, issues, normalized: {} };
  if (!object(overrides)) {
    return { ok: false, issues: [issue('INVALID_OVERRIDES', 'overrides must be an object.', 'overrides')], normalized: {} };
  }
  const topLevelFields = Object.keys(overrides);
  for (const field of topLevelFields) {
    if (field !== 'panelLocations') issues.push(issue('UNKNOWN_OVERRIDE_FIELD', `Unknown override field ${field}.`, `overrides.${field}`));
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, 'panelLocations')) return { ok: issues.length === 0, issues, normalized: {} };
  const panelLocations = overrides.panelLocations;
  if (!object(panelLocations)) {
    issues.push(issue('INVALID_PANEL_LOCATIONS', 'overrides.panelLocations must be an object keyed by panel id.', 'overrides.panelLocations'));
    return { ok: false, issues, normalized: {} };
  }
  const normalized = {};
  const seen = new Map();
  const known = options.knownPanelIds instanceof Set
    ? new Set([...options.knownPanelIds].map(id => String(id).toLowerCase()))
    : null;
  for (const [rawId, location] of Object.entries(panelLocations)) {
    const path = `overrides.panelLocations.${rawId}`;
    const id = String(rawId).trim();
    const key = id.toLowerCase();
    if (!id) { issues.push(issue('INVALID_PANEL_OVERRIDE_ID', 'Panel override id must be a non-empty string.', path)); continue; }
    if (seen.has(key)) issues.push(issue('DUPLICATE_PANEL_OVERRIDE_ID', `Panel override id ${rawId} duplicates ${seen.get(key)} case-insensitively.`, path));
    else seen.set(key, rawId);
    if (known && !known.has(key)) issues.push(issue('UNKNOWN_PANEL_OVERRIDE_ID', `Panel override references unknown generated panel ${rawId}.`, path));
    if (!object(location)) { issues.push(issue('INVALID_PANEL_LOCATION', 'Panel location override must be an object.', path)); continue; }
    for (const field of Object.keys(location)) if (!ALLOWED_OVERRIDE_FIELDS.has(field)) issues.push(issue('UNKNOWN_PANEL_LOCATION_FIELD', `Unknown panel location field ${field}.`, `${path}.${field}`));
    for (const axis of ['x', 'y', 'z']) if (!finiteCoordinate(location[axis])) issues.push(issue('INVALID_PANEL_LOCATION_COORDINATE', `Panel location ${axis} must be a finite number in feet.`, `${path}.${axis}`));
    if (location.note !== undefined && typeof location.note !== 'string') issues.push(issue('INVALID_PANEL_LOCATION_NOTE', 'Panel location note must be a string.', `${path}.note`));
    normalized[key] = { panelId: id, x: location.x, y: location.y, z: location.z, ...(location.note === undefined ? {} : { note: location.note }) };
  }
  return { ok: issues.length === 0, issues, normalized };
}

export function applyPanelLocationOverride(panel, automaticLocation, override) {
  const automatic = { x: automaticLocation.x, y: automaticLocation.y, z: automaticLocation.z };
  if (!override) return { effectiveLocation: automatic, metadata: null, status: 'evaluated' };
  const effectiveLocation = { x: override.x, y: override.y, z: override.z };
  const metadata = { ...effectiveLocation, ...(override.note === undefined ? {} : { note: override.note }) };
  return { effectiveLocation, metadata, status: 'evaluated' };
}

export default { validatePanelLocationOverrides, applyPanelLocationOverride };
