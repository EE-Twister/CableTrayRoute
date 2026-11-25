// @ts-check
// View settings for the One-Line canvas: the option tables behind the
// datablock, drawing-mode, overlay, operating-state, and palette menus, and
// the sanitiser for stored datablock attribute lists. Pure data and helpers;
// oneline.js owns reading and writing the stored settings.

export const MAX_VIEW_ATTRIBUTE_COUNT = 250;
export const MAX_VIEW_ATTRIBUTE_LENGTH = 128;

/**
 * True when a stored setting names one of the options in a label table.
 * @param {Record<string, string>} labels
 * @param {unknown} value
 * @returns {boolean}
 */
export function isKnownOption(labels, value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value);
}

/**
 * A stored datablock attribute key, trimmed; '' when it is not a usable key.
 * @param {unknown} key
 * @returns {string}
 */
export function sanitizeViewAttributeKey(key) {
  if (typeof key !== 'string') return '';
  const normalized = key.trim();
  if (!normalized || normalized.length > MAX_VIEW_ATTRIBUTE_LENGTH) return '';
  return normalized;
}

/**
 * Stored datablock attribute keys, de-duplicated, capped, and sorted.
 * @param {unknown} keys
 * @returns {string[]}
 */
export function sanitizeViewAttributeList(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const normalized = [];
  for (const key of keys) {
    const safeKey = sanitizeViewAttributeKey(key);
    if (!safeKey || seen.has(safeKey)) continue;
    seen.add(safeKey);
    normalized.push(safeKey);
    if (normalized.length >= MAX_VIEW_ATTRIBUTE_COUNT) break;
  }
  normalized.sort();
  return normalized;
}

export const datablockFormatPresets = Object.freeze({
  off: [],
  engineering: [
    'voltage',
    'volts',
    'rated_voltage_kv',
    'baseKV',
    'kV',
    'bus_rating_a',
    'rating_a',
    'frame_a',
    'rated_kva',
    'kva',
    'rated_hp',
    'hp',
    'kw',
    'kvar',
    'load.kw',
    'load.kvar',
    'percent_z',
    'impedance_z_percent',
    'tap_percent',
    'shortCircuit.threePhaseKA',
    'voltage_mag'
  ],
  nameplate: ['voltage', 'volts', 'rating_a', 'kva', 'hp', 'percent_z', 'manufacturer', 'model'],
  study: ['voltage_mag', 'shortCircuit.threePhaseKA', 'shortCircuit.asymKA', 'arcFlash.incidentEnergy', 'arcFlash.ppeCategory', 'reliability.availability'],
  protection: ['rating_a', 'frame_a', 'interrupt_rating_ka', 'short_circuit_rating_ka', 'clearing_time', 'shortCircuit.threePhaseKA', 'arcFlash.incidentEnergy'],
  report: ['amp_trip', 'voltage_ratio', 'winding'],
  cable: ['voltage', 'length', 'cable_type', 'conductor_size', 'conductor_material', 'short_circuit_rating_ka']
});
export const datablockFormatLabels = Object.freeze({
  off: 'Off',
  engineering: 'Engineering Labels',
  nameplate: 'Nameplate',
  study: 'Studies',
  protection: 'Protection',
  report: 'Report Annotations',
  cable: 'Cable',
  custom: 'Custom'
});
export const datablockDensityLabels = Object.freeze({
  compact: 'Compact',
  expanded: 'Expanded'
});
export const drawingModeLabels = Object.freeze({
  edit: 'Edit',
  engineeringPrint: 'Engineering Print'
});

export const dataStateOverlayLabels = Object.freeze({
  none: 'None',
  review: 'Data Quality',
  validation: 'Validation',
  loadFlow: 'Load Flow',
  faultDuty: 'Fault Duty',
  arcFlash: 'Arc Flash',
  operating: 'Operating State'
});

export const operatingStateLabels = Object.freeze({
  normal: 'Normal',
  emergency: 'Emergency',
  maintenance: 'Maintenance',
  switching: 'Switching',
  alternate: 'Alternate'
});

export const paletteCategoryFilters = Object.freeze({
  common: 'Common',
  all: 'All',
  sources: 'Sources',
  equipment: 'Equipment',
  protection: 'Protection',
  load: 'Loads',
  cable: 'Cables',
  annotations: 'Annotations'
});
