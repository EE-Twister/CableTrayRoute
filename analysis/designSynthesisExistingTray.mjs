import { isFourOOrLarger } from './trayFill.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = value => typeof value === 'string' && Boolean(value.trim());
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const LISTED_WIDTHS = new Set([2, 4, 6, 8, 9, 12, 16, 18, 20, 24, 30, 36]);

/** Validate explicitly supplied occupancy; absence means a proposed new tray. */
export function validateExistingTray(edge, path = 'corridor') {
  if (!Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray')) return { ok: true, supplied: false, cables: [], issues: [] };
  const existing = edge.existingTray;
  const issues = [];
  const add = (code, message, suffix = '') => issues.push({ code, message, path: `${path}.existingTray${suffix}` });
  if (!object(existing)) { add('EXISTING_TRAY_INVALID', 'Existing tray occupancy must be an explicit object.'); return { ok: false, supplied: true, cables: [], issues }; }
  for (const key of Object.keys(existing)) if (!['trayId', 'construction', 'inventoryReference', 'cables'].includes(key)) add('EXISTING_TRAY_UNKNOWN_FIELD', `Unknown existing tray field ${key}.`, `.${key}`);
  if (!nonblank(existing.trayId)) add('EXISTING_TRAY_ID_REQUIRED', 'Existing tray requires an explicit tray ID.', '.trayId');
  if (existing.construction !== 'ladder') add('EXISTING_TRAY_CONSTRUCTION_UNSUPPORTED', 'Only explicitly identified ladder tray construction is supported for this screening.', '.construction');
  if (!nonblank(existing.inventoryReference)) add('EXISTING_TRAY_INVENTORY_REFERENCE_REQUIRED', 'Provide the source for the complete existing cable inventory, including an explicitly empty inventory.', '.inventoryReference');
  if (!LISTED_WIDTHS.has(edge.widthIn)) add('EXISTING_TRAY_WIDTH_UNSUPPORTED', 'Existing tray width must be an exact supported listed width in inches.');
  if (!positive(edge.depthIn)) add('EXISTING_TRAY_DEPTH_REQUIRED', 'Existing tray depth must be a positive finite number in inches.');
  if (!Array.isArray(existing.cables)) add('EXISTING_TRAY_INVENTORY_REQUIRED', 'List every existing cable or provide an explicit empty array.', '.cables');
  const ids = new Set();
  for (const [index, cable] of (Array.isArray(existing.cables) ? existing.cables : []).entries()) {
    const suffix = `.cables[${index}]`;
    if (!object(cable)) { add('EXISTING_CABLE_INVALID', 'Existing cable must be an object.', suffix); continue; }
    for (const key of Object.keys(cable)) if (!['id', 'use', 'conductorSize', 'conductorCount', 'voltageRatingV', 'outsideDiameterIn', 'quantity', 'reference'].includes(key)) add('EXISTING_CABLE_UNKNOWN_FIELD', `Unknown existing cable field ${key}.`, `${suffix}.${key}`);
    const id = nonblank(cable.id) ? cable.id.trim().toLowerCase() : '';
    if (!id || ids.has(id)) add('EXISTING_CABLE_ID_INVALID', 'Existing cable IDs must be nonblank and unique on each tray.', `${suffix}.id`);
    ids.add(id);
    if (!['power', 'lighting'].includes(cable.use)) add('EXISTING_CABLE_USE_UNSUPPORTED', 'Explicit power or lighting cable use is required; control, signal, and unknown uses are not modeled here.', `${suffix}.use`);
    if (!nonblank(cable.conductorSize) || isFourOOrLarger(cable.conductorSize) === null) add('EXISTING_CABLE_SIZE_INVALID', 'Provide a recognized conductor size.', `${suffix}.conductorSize`);
    if (!Number.isInteger(cable.conductorCount) || cable.conductorCount < 2) add('EXISTING_CABLE_COUNT_UNSUPPORTED', 'An explicit multiconductor count of at least two is required.', `${suffix}.conductorCount`);
    if (!positive(cable.voltageRatingV) || cable.voltageRatingV > 2000) add('EXISTING_CABLE_VOLTAGE_UNSUPPORTED', 'An explicit cable voltage rating from above zero through 2000 V is required.', `${suffix}.voltageRatingV`);
    if (!positive(cable.outsideDiameterIn)) add('EXISTING_CABLE_DIAMETER_REQUIRED', 'An explicit positive outside diameter in inches is required.', `${suffix}.outsideDiameterIn`);
    if (!Number.isSafeInteger(cable.quantity) || cable.quantity < 1) add('EXISTING_CABLE_QUANTITY_INVALID', 'Cable quantity must be a positive integer.', `${suffix}.quantity`);
    if (!nonblank(cable.reference)) add('EXISTING_CABLE_REFERENCE_REQUIRED', 'Provide a source for the existing cable dimensions and ratings.', `${suffix}.reference`);
  }
  const cables = issues.length ? [] : existing.cables.map(cable => ({ id: cable.id, conductor_size: cable.conductorSize, conductor_count: cable.conductorCount, cable_rating: cable.voltageRatingV, cable_od: cable.outsideDiameterIn, quantity: cable.quantity }));
  return { ok: issues.length === 0, supplied: true, cables, issues };
}
