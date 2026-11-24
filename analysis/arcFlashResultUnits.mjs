// Saved arc-flash results use millimetres for `boundary` and `workingDistance`,
// matching analysis/arcFlash.mjs and every display, label, and report
// consumer. Legacy or hand-authored results may carry a `boundaryUnit` or a
// `workingDistanceIn` field instead; these helpers convert them to the engine
// shape and flag results whose boundary cannot be physically consistent.

export const ARC_FLASH_DEFAULT_WORKING_DISTANCE_MM = 455;
export const ARC_FLASH_BOUNDARY_ENERGY_THRESHOLD_CAL_CM2 = 1.2;
// IEEE 1584-2018 interpolates incident energy and arc-flash boundary
// separately between its 600 V, 2.7 kV, and 14.3 kV models, so a correct
// 0.6-15 kV result just above 1.2 cal/cm² can place the boundary up to ~4%
// inside the working distance (engine sweep minimum: 0.958). Allow 10% before
// flagging; a boundary recorded in inches but read as mm is ~25x too short.
export const ARC_FLASH_BOUNDARY_WORKING_DISTANCE_TOLERANCE = 0.9;
export const ARC_FLASH_BOUNDARY_INSIDE_WORKING_DISTANCE_REASON = 'Arc-flash boundary is shorter than the working distance while incident energy exceeds 1.2 cal/cm²; check boundary units.';

const MM_PER_INCH = 25.4;

const LENGTH_UNIT_TO_MM = new Map([
  ['mm', 1], ['millimeter', 1], ['millimeters', 1], ['millimetre', 1], ['millimetres', 1],
  ['cm', 10], ['centimeter', 10], ['centimeters', 10], ['centimetre', 10], ['centimetres', 10],
  ['m', 1000], ['meter', 1000], ['meters', 1000], ['metre', 1000], ['metres', 1000],
  ['in', MM_PER_INCH], ['inch', MM_PER_INCH], ['inches', MM_PER_INCH],
  ['ft', 304.8], ['foot', 304.8], ['feet', 304.8]
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}

function unitToken(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
}

function resolveWorkingDistanceMm(entry) {
  const explicit = toFiniteNumber(entry.workingDistance);
  if (explicit !== null && explicit > 0) return explicit;
  const calculated = toFiniteNumber(entry.calculationInputs?.workingDistanceMM);
  if (calculated !== null && calculated > 0) return calculated;
  const inches = toFiniteNumber(entry.workingDistanceIn);
  if (inches !== null && inches > 0) return inches * MM_PER_INCH;
  return ARC_FLASH_DEFAULT_WORKING_DISTANCE_MM;
}

/**
 * Convert one saved arc-flash location to millimetres. Returns the input
 * object when nothing changes so repeated migrations are idempotent and do
 * not create spurious undo diffs. Unknown units are left in place so the
 * plausibility check can withhold the result instead of guessing.
 */
export function normalizeArcFlashResultEntry(entry) {
  if (!isPlainObject(entry)) return entry;
  let next = entry;
  const ensureCopy = () => {
    if (next === entry) next = { ...entry };
    return next;
  };
  const unit = unitToken(entry.boundaryUnit);
  const factor = LENGTH_UNIT_TO_MM.get(unit);
  if (factor !== undefined) {
    const boundary = toFiniteNumber(entry.boundary);
    const copy = ensureCopy();
    if (boundary !== null) copy.boundary = roundToTenth(boundary * factor);
    delete copy.boundaryUnit;
  }
  const workingDistance = toFiniteNumber(entry.workingDistance);
  const workingDistanceIn = toFiniteNumber(entry.workingDistanceIn);
  if ((workingDistance === null || workingDistance <= 0) && workingDistanceIn !== null && workingDistanceIn > 0) {
    ensureCopy().workingDistance = roundToTenth(workingDistanceIn * MM_PER_INCH);
  }
  return next;
}

/** Normalize every location in an arc-flash result map keyed by component id. */
export function normalizeArcFlashResultUnits(results) {
  if (!isPlainObject(results)) return results;
  let next = results;
  Object.entries(results).forEach(([id, entry]) => {
    if (id.startsWith('_')) return;
    const normalized = normalizeArcFlashResultEntry(entry);
    if (normalized === entry) return;
    if (next === results) next = { ...results };
    next[id] = normalized;
  });
  return next;
}

/** Normalize the arcFlash block of a saved study-results map. */
export function normalizeStudyResultsArcFlashUnits(studyResults) {
  if (!isPlainObject(studyResults) || !isPlainObject(studyResults.arcFlash)) return studyResults;
  const arcFlash = normalizeArcFlashResultUnits(studyResults.arcFlash);
  return arcFlash === studyResults.arcFlash ? studyResults : { ...studyResults, arcFlash };
}

/**
 * Screen a saved arc-flash location for a boundary that cannot be correct.
 * The arc-flash boundary is the distance at which incident energy falls to
 * 1.2 cal/cm², so when the energy at the working distance exceeds that value
 * the boundary must lie beyond the working distance. A boundary more than the
 * interpolation tolerance shorter than that almost always means the value was
 * recorded in inches or feet but read as mm.
 * @returns {{ plausible: boolean, code: string|null, reason: string }}
 */
export function assessArcFlashResultPlausibility(entry) {
  const ok = { plausible: true, code: null, reason: '' };
  if (!isPlainObject(entry)) return ok;
  const unit = unitToken(entry.boundaryUnit);
  if (unit && LENGTH_UNIT_TO_MM.get(unit) !== 1) {
    return {
      plausible: false,
      code: 'boundary-unit-not-mm',
      reason: `Arc-flash boundary is recorded in "${String(entry.boundaryUnit).trim()}" rather than mm; re-import the project or rerun the study before relying on it.`
    };
  }
  const energy = toFiniteNumber(entry.incidentEnergy);
  const boundary = toFiniteNumber(entry.boundary);
  if (energy === null || boundary === null || !(energy > ARC_FLASH_BOUNDARY_ENERGY_THRESHOLD_CAL_CM2)) return ok;
  if (boundary < resolveWorkingDistanceMm(entry) * ARC_FLASH_BOUNDARY_WORKING_DISTANCE_TOLERANCE) {
    return {
      plausible: false,
      code: 'boundary-inside-working-distance',
      reason: ARC_FLASH_BOUNDARY_INSIDE_WORKING_DISTANCE_REASON
    };
  }
  return ok;
}
