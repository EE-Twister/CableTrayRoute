/**
 * Magnetic Field / EMF Analysis Module
 *
 * Calculates magnetic flux density (in µT) from cable configurations
 * per the Biot–Savart law for infinite straight conductors.
 *
 * References:
 *   IEC 62110:2009 — AC power systems, measurement of magnetic fields
 *   ICNIRP 2010 Guidelines — Exposure limits for static magnetic fields
 *   ICNIRP 1998 / 2010 — Power frequency (50/60 Hz) reference levels
 *   IEEE C95.6-2002 — IEEE Standard for Safety Levels with Respect to Human Exposure
 *   WHO Environmental Health Criteria 238 (2007) — Extremely Low Frequency Fields
 */

/** Permeability of free space (H/m) */
const MU0 = 4 * Math.PI * 1e-7;

/**
 * ICNIRP 2010 reference levels for 50 Hz magnetic flux density.
 * Units: µT (microtesla)
 */
export const ICNIRP_LIMITS = {
  occupational_50hz: 1000,  // µT — occupational exposure (50 Hz)
  general_public_50hz: 200,  // µT — general public (50 Hz)
  occupational_60hz: 1000,  // µT — occupational exposure (60 Hz)
  general_public_60hz: 200,  // µT — general public (60 Hz)
};

/**
 * Calculate the magnetic flux density (in µT) at a perpendicular distance `d` (m)
 * from a single infinite straight conductor carrying current `I` (A, RMS).
 *
 * B = (µ₀ / 2π) × (I / d)
 *
 * @param {number} currentA - RMS current in amperes
 * @param {number} distanceM - Perpendicular distance from conductor axis in metres
 * @returns {number} Magnetic flux density in µT
 */
export function fieldFromSingleConductor(currentA, distanceM) {
  if (distanceM <= 0) throw new Error('Distance must be positive');
  // Convert T → µT (× 1e6)
  return (MU0 / (2 * Math.PI)) * (Math.abs(currentA) / distanceM) * 1e6;
}

/**
 * Calculate the resultant magnetic flux density from multiple parallel conductors
 * arranged in a cable tray at given (x, y) positions relative to the measurement point.
 *
 * Uses vector superposition in the 2-D cross-section plane.
 *
 * Each conductor entry:
 *   { x: number, y: number, currentA: number, phaseAngleDeg: number }
 *   x, y — position offset of conductor from tray centreline (metres)
 *   currentA — RMS current (A)
 *   phaseAngleDeg — phase angle (0°, 120°, 240° for 3-phase; 0/180 for single-phase return)
 *
 * @param {Array<{x:number,y:number,currentA:number,phaseAngleDeg:number}>} conductors
 * @param {{ x: number, y: number }} measurePoint - position of measurement point (metres)
 * @returns {{ bPeak_uT: number, bRms_uT: number }} Peak and RMS flux density in µT
 */
export function fieldFromConductorArray(conductors, measurePoint) {
  // Compute time-domain peak by sampling phase from 0 to 2π
  // Each conductor contributes a sinusoidal field component
  let bxMax = 0, byMax = 0;
  let bxRmsSum = 0, byRmsSum = 0;

  // Vector superposition at the measurement point
  // For each conductor i: Bx_i(t) = B_i × cos(θ_i + ωt) × (dy_i/d_i)
  //                        By_i(t) = B_i × cos(θ_i + ωt) × (-dx_i/d_i)
  const components = conductors.map(cond => {
    const dx = measurePoint.x - cond.x;
    const dy = measurePoint.y - cond.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1e-6) return null;
    const Bmag = fieldFromSingleConductor(cond.currentA, d);
    const theta = (cond.phaseAngleDeg ?? 0) * Math.PI / 180;
    // Direction perpendicular to the vector from conductor to point (rotated 90°)
    const ux = dy / d;
    const uy = -dx / d;
    return { Bmag, theta, ux, uy };
  }).filter(Boolean);

  // Compute peak field by scanning one cycle (360 samples)
  let peakB = 0;
  let bxRss = 0, byRss = 0;
  for (let s = 0; s < 360; s++) {
    const wt = (s / 360) * 2 * Math.PI;
    let bx = 0, by = 0;
    components.forEach(c => {
      const inst = c.Bmag * Math.cos(c.theta + wt);
      bx += inst * c.ux;
      by += inst * c.uy;
    });
    const b = Math.sqrt(bx * bx + by * by);
    if (b > peakB) peakB = b;
  }

  // RMS: for each component, B_rms = B_mag / sqrt(2)
  // Total B_rms = RSS of all component RMS values (approximate for uncorrelated phases)
  components.forEach(c => {
    const bRmsComp = c.Bmag / Math.SQRT2;
    bxRss += bRmsComp * bRmsComp * c.ux * c.ux;
    byRss += bRmsComp * bRmsComp * c.uy * c.uy;
  });
  const bRms = Math.sqrt(bxRss + byRss);

  return { bPeak_uT: peakB, bRms_uT: bRms };
}

/**
 * Build a standard 3-phase conductor layout for a cable tray cross-section.
 *
 * Cables are assumed to rest on the tray floor in a single layer, evenly spaced.
 * Phase A = 0°, Phase B = 120°, Phase C = 240°.
 *
 * @param {number} currentA - Load current per phase (A)
 * @param {number} nCables - Number of 3-phase cable sets
 * @param {number} trayWidthM - Tray inside width in metres
 * @param {number} cableOdM - Cable outside diameter in metres
 * @returns {Array} Conductor array for fieldFromConductorArray()
 */
export function buildThreePhaseConductors(currentA, nCables, trayWidthM, cableOdM) {
  const conductors = [];
  const spacingM = nCables > 1 ? (trayWidthM - cableOdM) / (nCables - 1) : 0;
  for (let i = 0; i < nCables; i++) {
    const xBase = nCables > 1 ? -trayWidthM / 2 + cableOdM / 2 + i * spacingM : 0;
    // Three phases for each cable set
    conductors.push({ x: xBase, y: 0, currentA, phaseAngleDeg: 0 });    // Phase A
    conductors.push({ x: xBase, y: 0, currentA, phaseAngleDeg: 120 });  // Phase B
    conductors.push({ x: xBase, y: 0, currentA, phaseAngleDeg: 240 });  // Phase C
  }
  return conductors;
}

/**
 * Evaluate field profile across a range of distances from the tray edge.
 *
 * @param {Array} conductors - Conductor array
 * @param {number} trayWidthM - Half-width offset for measurement point (m)
 * @param {Array<number>} distancesM - Array of perpendicular distances from tray edge (m)
 * @returns {Array<{distanceM, bPeak_uT, bRms_uT}>}
 */
export function fieldProfile(conductors, trayWidthM, distancesM) {
  return distancesM.map(d => {
    const measurePoint = { x: trayWidthM / 2 + d, y: 0.6 }; // 0.6 m above tray floor (body height)
    try {
      const { bPeak_uT, bRms_uT } = fieldFromConductorArray(conductors, measurePoint);
      return { distanceM: d, bPeak_uT, bRms_uT };
    } catch {
      return { distanceM: d, bPeak_uT: 0, bRms_uT: 0 };
    }
  });
}

/**
 * Check compliance against ICNIRP limits.
 *
 * @param {number} bRms_uT - RMS magnetic flux density in µT
 * @param {number} frequencyHz - Power frequency (50 or 60)
 * @returns {{ occupational: {pass, limit, ratio}, generalPublic: {pass, limit, ratio} }}
 */
export function checkCompliance(bRms_uT, frequencyHz = 60) {
  const occLimit = frequencyHz === 50 ? ICNIRP_LIMITS.occupational_50hz : ICNIRP_LIMITS.occupational_60hz;
  const gpLimit = frequencyHz === 50 ? ICNIRP_LIMITS.general_public_50hz : ICNIRP_LIMITS.general_public_60hz;

  return {
    occupational: {
      pass: bRms_uT <= occLimit,
      limit: occLimit,
      ratio: bRms_uT / occLimit,
      label: 'ICNIRP Occupational',
    },
    generalPublic: {
      pass: bRms_uT <= gpLimit,
      limit: gpLimit,
      ratio: bRms_uT / gpLimit,
      label: 'ICNIRP General Public',
    },
  };
}

export const EMF_EXPOSURE_VERSION = 'emf-exposure-v1';

const GEOMETRY_MODES = new Set(['tray', 'ductbank', 'directBurial', 'freeAir', 'custom']);
const EXPOSURE_BASES = new Set(['icnirpPublic', 'icnirpOccupational', 'ieeeC95', 'custom']);
const SHIELDING_MODES = new Set(['none', 'ferromagnetic', 'sheath', 'screeningFactor']);
const REPORT_PRESETS = new Set(['summary', 'criteria', 'fullStudy']);
const PHASE_SEQUENCES = new Set(['ABC', 'ACB', 'explicit']);

const DEFAULT_PROFILE_DISTANCES_M = [0.3, 0.6, 1, 2, 3, 5];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function finiteNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function positiveNumber(value, fallback, label) {
  const num = finiteNumber(value, fallback);
  if (num == null || num <= 0) throw new Error(`${label} must be greater than zero`);
  return num;
}

function nonNegativeNumber(value, fallback, label) {
  const num = finiteNumber(value, fallback);
  if (num == null || num < 0) throw new Error(`${label} must be zero or greater`);
  return num;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, places = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function pickEnum(value, allowed, fallback, label) {
  const normalized = stringValue(value, fallback);
  if (!allowed.has(normalized)) {
    throw new Error(`${label} must be one of: ${[...allowed].join(', ')}`);
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function phaseAnglesFor(sequence = 'ABC') {
  if (sequence === 'ACB') return [0, 120, -120];
  return [0, -120, 120];
}

function limitForBasis(studyCase = {}) {
  if (studyCase.exposureBasis === 'custom') {
    return {
      label: 'Custom project limit',
      limit_uT: studyCase.customLimit_uT,
    };
  }
  if (studyCase.exposureBasis === 'icnirpOccupational') {
    return {
      label: 'ICNIRP occupational',
      limit_uT: studyCase.frequencyHz === 50 ? ICNIRP_LIMITS.occupational_50hz : ICNIRP_LIMITS.occupational_60hz,
    };
  }
  if (studyCase.exposureBasis === 'ieeeC95') {
    return {
      label: 'IEEE C95 screening reference',
      limit_uT: 904,
    };
  }
  return {
    label: 'ICNIRP public',
    limit_uT: studyCase.frequencyHz === 50 ? ICNIRP_LIMITS.general_public_50hz : ICNIRP_LIMITS.general_public_60hz,
  };
}

function statusFromUtilization(utilizationPct, warningMarginPct) {
  if (!Number.isFinite(utilizationPct)) return 'missingData';
  if (utilizationPct > 100) return 'fail';
  if (utilizationPct >= warningMarginPct) return 'warn';
  return 'pass';
}

function recommendationForStatus(status, row = {}) {
  if (status === 'fail') return 'Reduce current, increase distance/depth, revise phase grouping, or add verified shielding before release.';
  if (status === 'warn') return 'Confirm measurement basis and review distance, phasing, loading, and shielding assumptions.';
  if (status === 'missingData') return 'Complete geometry, current, and exposure-limit inputs before relying on the result.';
  if (row.validationStatus === 'mismatch') return 'Compare measured and calculated field assumptions and update the model or measurement record.';
  return 'No exposure action required for this screening row.';
}

function fieldFromShieldedConductorArray(conductors, measurePoint) {
  let peakB = 0;
  let sumB2 = 0;
  const components = conductors.map(cond => {
    const dx = measurePoint.x - cond.x;
    const dy = measurePoint.y - cond.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1e-6) return null;
    const Bmag = fieldFromSingleConductor(cond.currentA, d) * clamp(finiteNumber(cond.shieldingFactor, 1), 0, 1);
    const theta = (cond.phaseAngleDeg ?? 0) * Math.PI / 180;
    return { Bmag, theta, ux: dy / d, uy: -dx / d };
  }).filter(Boolean);

  for (let s = 0; s < 360; s++) {
    const wt = (s / 360) * 2 * Math.PI;
    let bx = 0;
    let by = 0;
    components.forEach(c => {
      const inst = c.Bmag * Math.cos(c.theta + wt);
      bx += inst * c.ux;
      by += inst * c.uy;
    });
    const b = Math.sqrt(bx * bx + by * by);
    peakB = Math.max(peakB, b);
    sumB2 += b * b;
  }

  return { bPeak_uT: peakB, bRms_uT: Math.sqrt(sumB2 / 360) };
}

export function normalizeEmfStudyCase(input = {}) {
  const raw = asObject(input);
  const frequencyHz = positiveNumber(raw.frequencyHz ?? raw.frequency ?? 60, 60, 'Frequency');
  const exposureBasis = pickEnum(raw.exposureBasis ?? raw.limitBasis, EXPOSURE_BASES, 'icnirpPublic', 'Exposure basis');
  const geometryMode = pickEnum(raw.geometryMode, GEOMETRY_MODES, 'tray', 'Geometry mode');
  const shieldingMode = pickEnum(raw.shieldingMode, SHIELDING_MODES, 'none', 'Shielding mode');
  const reportPreset = pickEnum(raw.reportPreset, REPORT_PRESETS, 'summary', 'Report preset');
  const phaseSequence = pickEnum(raw.phaseSequence ?? raw.phaseSequenceBasis, PHASE_SEQUENCES, 'ABC', 'Phase sequence');
  const customLimit_uT = exposureBasis === 'custom'
    ? positiveNumber(raw.customLimit_uT ?? raw.customLimit ?? raw.limit_uT, 200, 'Custom exposure limit')
    : finiteNumber(raw.customLimit_uT ?? raw.customLimit ?? raw.limit_uT, null);
  const shieldingFactor = shieldingMode === 'none'
    ? 1
    : clamp(positiveNumber(raw.shieldingFactor ?? raw.ferromagneticSheathFactor ?? 0.85, 0.85, 'Shielding factor'), 0.01, 1);
  const warningMarginPct = clamp(positiveNumber(raw.warningMarginPct ?? 80, 80, 'Warning margin'), 1, 100);
  const validationTolerancePct = clamp(positiveNumber(raw.validationTolerancePct ?? 25, 25, 'Validation tolerance'), 1, 200);

  return {
    id: stringValue(raw.id, 'emf-case-1'),
    name: stringValue(raw.name ?? raw.caseName, 'EMF Exposure Study Case'),
    frequencyHz,
    exposureBasis,
    exposureLabel: limitForBasis({ exposureBasis, frequencyHz, customLimit_uT }).label,
    customLimit_uT,
    geometryMode,
    profileHeightM: nonNegativeNumber(raw.profileHeightM ?? raw.profileHeight ?? 0.6, 0.6, 'Profile height'),
    groundReferenceM: finiteNumber(raw.groundReferenceM ?? raw.groundReference ?? 0, 0),
    phaseSequence,
    shieldingMode,
    shieldingFactor,
    reportPreset,
    warningMarginPct,
    validationTolerancePct,
    notes: stringValue(raw.notes ?? raw.reviewNotes),
  };
}

export function normalizeEmfCircuitRows(rows = [], options = {}) {
  const studyCase = normalizeEmfStudyCase(options.studyCase || options);
  const sourceRows = asArray(rows);
  return sourceRows.map((row, index) => {
    const raw = asObject(row);
    const missingFields = [];
    const defaultedFields = [];
    const geometryMode = pickEnum(raw.geometryMode, GEOMETRY_MODES, studyCase.geometryMode, `Circuit ${index + 1} geometry mode`);
    const currentA = finiteNumber(raw.currentA ?? raw.loadCurrentA ?? raw.phaseCurrentA, null);
    if (currentA == null) missingFields.push('currentA');
    if (currentA != null && currentA < 0) throw new Error(`Circuit ${index + 1} current must be zero or greater`);
    const phaseSpacingM = finiteNumber(raw.phaseSpacingM ?? raw.spacingM, null);
    const trayWidthM = nonNegativeNumber(raw.trayWidthM ?? raw.trayWidth ?? 0.3048, 0.3048, `Circuit ${index + 1} tray width`);
    const conductorOdM = positiveNumber(raw.conductorOdM ?? raw.cableOdM ?? 0.0254, 0.0254, `Circuit ${index + 1} conductor OD`);
    const nParallelSets = Math.max(1, Math.round(positiveNumber(raw.nParallelSets ?? raw.nCables ?? 1, 1, `Circuit ${index + 1} parallel sets`)));
    if (phaseSpacingM == null) defaultedFields.push('phaseSpacingM');
    const depthM = geometryMode === 'ductbank' || geometryMode === 'directBurial'
      ? positiveNumber(raw.depthM ?? raw.burialDepthM ?? 0.9, 0.9, `Circuit ${index + 1} depth`)
      : nonNegativeNumber(raw.depthM ?? raw.burialDepthM ?? 0, 0, `Circuit ${index + 1} depth`);
    const elevationM = geometryMode === 'ductbank' || geometryMode === 'directBurial'
      ? -depthM
      : finiteNumber(raw.elevationM ?? raw.yM ?? 0, 0);
    if ((geometryMode === 'ductbank' || geometryMode === 'directBurial') && raw.depthM == null && raw.burialDepthM == null) {
      defaultedFields.push('depthM');
    }
    const phaseCurrentsA = asArray(raw.phaseCurrentsA).map(value => finiteNumber(value, null)).slice(0, 3);
    const phaseAnglesDeg = asArray(raw.phaseAnglesDeg).map(value => finiteNumber(value, null)).slice(0, 3);
    const phaseSequence = pickEnum(raw.phaseSequence ?? studyCase.phaseSequence, PHASE_SEQUENCES, studyCase.phaseSequence, `Circuit ${index + 1} phase sequence`);
    const shieldingFactor = clamp(finiteNumber(raw.shieldingFactor, studyCase.shieldingFactor), 0, 1);
    const status = missingFields.length ? 'missingData' : 'ready';
    return {
      id: stringValue(raw.id, `emf-circuit-${index + 1}`),
      tag: stringValue(raw.tag ?? raw.circuitTag ?? raw.label, `Circuit ${index + 1}`),
      enabled: raw.enabled !== false,
      geometryMode,
      xM: finiteNumber(raw.xM ?? raw.centerXM, 0),
      yM: elevationM,
      trayWidthM,
      phaseSpacingM: phaseSpacingM ?? Math.max(conductorOdM * 1.2, 0.05),
      conductorOdM,
      depthM,
      elevationM,
      currentA: currentA ?? 0,
      phaseCurrentsA,
      phaseAnglesDeg,
      phaseSequence,
      nParallelSets,
      grouping: stringValue(raw.grouping ?? raw.conductorGrouping, 'flat'),
      trayRef: stringValue(raw.trayRef ?? raw.trayId ?? raw.racewayRef),
      ductbankRef: stringValue(raw.ductbankRef),
      shieldingFactor,
      notes: stringValue(raw.notes),
      missingFields,
      defaultedFields,
      status,
    };
  });
}

export function buildEmfConductorGeometry({ studyCase: inputStudyCase = {}, circuitRows = [] } = {}) {
  const studyCase = normalizeEmfStudyCase(inputStudyCase);
  const rows = normalizeEmfCircuitRows(circuitRows, { studyCase });
  const conductors = [];
  rows.filter(row => row.enabled && row.status !== 'missingData').forEach(row => {
    const phaseAngles = row.phaseAnglesDeg.length === 3 && row.phaseAnglesDeg.every(Number.isFinite)
      ? row.phaseAnglesDeg
      : phaseAnglesFor(row.phaseSequence);
    const currents = row.phaseCurrentsA.length === 3 && row.phaseCurrentsA.every(Number.isFinite)
      ? row.phaseCurrentsA
      : [row.currentA, row.currentA, row.currentA];
    for (let setIndex = 0; setIndex < row.nParallelSets; setIndex++) {
      const setOffset = row.nParallelSets > 1
        ? -row.trayWidthM / 2 + (row.trayWidthM / Math.max(1, row.nParallelSets - 1)) * setIndex
        : 0;
      const coords = [
        { phase: 'A', x: -row.phaseSpacingM + setOffset, y: 0 },
        { phase: 'B', x: setOffset, y: 0 },
        { phase: 'C', x: row.phaseSpacingM + setOffset, y: 0 },
      ];
      coords.forEach((coord, phaseIndex) => {
        conductors.push({
          id: `${row.id}-${coord.phase}-${setIndex + 1}`,
          circuitId: row.id,
          circuitTag: row.tag,
          phase: coord.phase,
          set: setIndex + 1,
          x: round(row.xM + coord.x, 5),
          y: round(row.yM + coord.y, 5),
          currentA: currents[phaseIndex] ?? row.currentA,
          phaseAngleDeg: phaseAngles[phaseIndex] ?? 0,
          shieldingFactor: row.shieldingFactor,
          geometryMode: row.geometryMode,
        });
      });
    }
  });
  return {
    conductors,
    circuitRows: rows,
    bounds: conductors.length ? {
      minX: round(Math.min(...conductors.map(c => c.x)), 5),
      maxX: round(Math.max(...conductors.map(c => c.x)), 5),
      minY: round(Math.min(...conductors.map(c => c.y)), 5),
      maxY: round(Math.max(...conductors.map(c => c.y)), 5),
    } : null,
  };
}

export function normalizeEmfMeasurementPoints(rows = [], options = {}) {
  const studyCase = normalizeEmfStudyCase(options.studyCase || options);
  const sourceRows = asArray(rows).length ? asArray(rows) : [
    { id: 'profile-1m', label: '1 m profile point', xM: 1, yM: studyCase.profileHeightM },
  ];
  return sourceRows.map((row, index) => {
    const raw = asObject(row);
    const xM = finiteNumber(raw.xM ?? raw.distanceM, null);
    const yM = finiteNumber(raw.yM ?? raw.heightM ?? studyCase.profileHeightM, null);
    if (xM == null || yM == null) throw new Error(`Measurement point ${index + 1} requires numeric xM/distanceM and yM/heightM`);
    return {
      id: stringValue(raw.id, `emf-point-${index + 1}`),
      label: stringValue(raw.label ?? raw.name, `Point ${index + 1}`),
      xM,
      yM,
      exposureCategory: stringValue(raw.exposureCategory ?? raw.category, studyCase.exposureBasis),
      notes: stringValue(raw.notes),
    };
  });
}

export function normalizeEmfValidationRows(rows = [], options = {}) {
  const tolerancePct = normalizeEmfStudyCase(options.studyCase || options).validationTolerancePct;
  return asArray(rows).map((row, index) => {
    const raw = asObject(row);
    const measuredB_uT = finiteNumber(raw.measuredB_uT ?? raw.measured ?? raw.field_uT, null);
    if (measuredB_uT != null && measuredB_uT < 0) throw new Error(`Validation row ${index + 1} measured field must be zero or greater`);
    return {
      id: stringValue(raw.id, `emf-validation-${index + 1}`),
      pointId: stringValue(raw.pointId ?? raw.measurementPointId),
      label: stringValue(raw.label ?? raw.name, `Validation ${index + 1}`),
      measuredB_uT,
      calculatedB_uT: finiteNumber(raw.calculatedB_uT, null),
      tolerancePct: positiveNumber(raw.tolerancePct ?? tolerancePct, tolerancePct, `Validation row ${index + 1} tolerance`),
      source: stringValue(raw.source ?? raw.instrument ?? raw.measuredBy),
      notes: stringValue(raw.notes),
      status: measuredB_uT == null ? 'missingData' : 'pending',
    };
  });
}

export function evaluateEmfExposureCase(context = {}, options = {}) {
  const studyCase = normalizeEmfStudyCase(context.studyCase || context.case || options.studyCase || {});
  const circuitRows = normalizeEmfCircuitRows(context.circuitRows || context.circuits || [], { studyCase });
  const measurementPoints = normalizeEmfMeasurementPoints(context.measurementPoints || context.points || [], { studyCase });
  const geometry = buildEmfConductorGeometry({ studyCase, circuitRows });
  const limit = limitForBasis(studyCase);
  const warningRows = [];

  circuitRows.forEach(row => {
    if (row.missingFields.length) {
      warningRows.push({
        code: 'missing-circuit-data',
        severity: 'missingData',
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} is missing ${row.missingFields.join(', ')}.`,
        recommendation: 'Complete current and geometry inputs before relying on the EMF result.',
      });
    }
    if (row.defaultedFields.length) {
      warningRows.push({
        code: 'defaulted-circuit-data',
        severity: 'review',
        sourceId: row.id,
        sourceTag: row.tag,
        message: `${row.tag} uses defaulted ${row.defaultedFields.join(', ')} values.`,
        recommendation: 'Confirm defaulted EMF geometry assumptions before report release.',
      });
    }
  });
  if (!geometry.conductors.length) {
    warningRows.push({
      code: 'no-active-conductors',
      severity: 'missingData',
      message: 'No active conductor geometry was available for EMF evaluation.',
      recommendation: 'Add at least one circuit row with current and geometry data.',
    });
  }
  if (studyCase.shieldingMode !== 'none') {
    warningRows.push({
      code: 'shielding-screening',
      severity: 'review',
      message: `${studyCase.shieldingMode} shielding is applied as a deterministic screening factor.`,
      recommendation: 'Verify shielding, sheath, ferromagnetic, or enclosure effects with project-specific measurement or detailed modeling.',
    });
  }

  const fieldRows = measurementPoints.map(point => {
    const result = geometry.conductors.length
      ? fieldFromShieldedConductorArray(geometry.conductors, { x: point.xM, y: point.yM })
      : { bPeak_uT: 0, bRms_uT: 0 };
    const utilizationPct = limit.limit_uT > 0 ? (result.bRms_uT / limit.limit_uT) * 100 : null;
    const status = statusFromUtilization(utilizationPct, studyCase.warningMarginPct);
    if (status === 'fail' || status === 'warn') {
      warningRows.push({
        code: status === 'fail' ? 'exposure-limit-fail' : 'high-exposure-utilization',
        severity: status,
        sourceId: point.id,
        sourceTag: point.label,
        message: `${point.label} is at ${round(utilizationPct, 1)}% of ${limit.label}.`,
        recommendation: recommendationForStatus(status),
      });
    }
    return {
      id: point.id,
      pointId: point.id,
      label: point.label,
      xM: round(point.xM, 4),
      yM: round(point.yM, 4),
      bPeak_uT: round(result.bPeak_uT, 4),
      bRms_uT: round(result.bRms_uT, 4),
      limitLabel: limit.label,
      limit_uT: limit.limit_uT,
      utilizationPct: round(utilizationPct, 2),
      status,
      recommendation: recommendationForStatus(status),
      notes: point.notes,
    };
  });

  const distances = asArray(context.profileDistancesM || studyCase.profileDistancesM).length
    ? asArray(context.profileDistancesM || studyCase.profileDistancesM).map(d => positiveNumber(d, 1, 'Profile distance'))
    : DEFAULT_PROFILE_DISTANCES_M;
  const profileRows = distances.map((distanceM, index) => {
    const xM = distanceM;
    const result = geometry.conductors.length
      ? fieldFromShieldedConductorArray(geometry.conductors, { x: xM, y: studyCase.profileHeightM })
      : { bPeak_uT: 0, bRms_uT: 0 };
    const utilizationPct = limit.limit_uT > 0 ? (result.bRms_uT / limit.limit_uT) * 100 : null;
    const status = statusFromUtilization(utilizationPct, studyCase.warningMarginPct);
    return {
      id: `profile-${index + 1}`,
      distanceM: round(distanceM, 4),
      heightM: round(studyCase.profileHeightM, 4),
      bPeak_uT: round(result.bPeak_uT, 4),
      bRms_uT: round(result.bRms_uT, 4),
      limit_uT: limit.limit_uT,
      utilizationPct: round(utilizationPct, 2),
      status,
    };
  });

  const validationRows = normalizeEmfValidationRows(context.validationRows || context.validation || [], { studyCase }).map(row => {
    const matched = fieldRows.find(field => field.pointId === row.pointId || field.id === row.pointId || field.label === row.label);
    const calculatedB_uT = row.calculatedB_uT ?? matched?.bRms_uT ?? null;
    const diffPct = row.measuredB_uT != null && calculatedB_uT != null && calculatedB_uT > 0
      ? Math.abs(row.measuredB_uT - calculatedB_uT) / calculatedB_uT * 100
      : null;
    const status = row.measuredB_uT == null || calculatedB_uT == null
      ? 'missingData'
      : diffPct > row.tolerancePct ? 'warn' : 'pass';
    if (status !== 'pass') {
      warningRows.push({
        code: status === 'warn' ? 'validation-mismatch' : 'missing-validation-data',
        severity: status,
        sourceId: row.id,
        sourceTag: row.label,
        message: status === 'warn'
          ? `${row.label} measured/calculated mismatch is ${round(diffPct, 1)}%.`
          : `${row.label} validation row is missing measured or calculated field data.`,
        recommendation: 'Review measurement location, loading, phasing, shielding, and instrument basis.',
      });
    }
    return {
      ...row,
      calculatedB_uT: round(calculatedB_uT, 4),
      differencePct: round(diffPct, 2),
      status,
      recommendation: status === 'pass' ? 'Measured and calculated values are within tolerance.' : 'Review measured/calculated basis before release.',
    };
  });

  const mitigationRows = [
    ...fieldRows.filter(row => row.status === 'fail' || row.status === 'warn').map(row => ({
      id: `mitigation-${row.id}`,
      sourceId: row.id,
      label: row.label,
      status: row.status,
      strategy: 'distance-depth-phasing',
      recommendation: row.recommendation,
      assumption: 'Screening mitigation only; verify final layout and exposure assessment.',
    })),
    ...(studyCase.shieldingMode !== 'none' ? [{
      id: 'mitigation-shielding-review',
      sourceId: studyCase.id,
      label: 'Shielding assumption',
      status: 'review',
      strategy: 'shielding-validation',
      recommendation: 'Validate ferromagnetic, sheath, or enclosure shielding factor with measured data or detailed modeling.',
      assumption: 'Applied as a scalar field reduction in this screening package.',
    }] : []),
  ];

  const statusCounts = fieldRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const summary = {
    circuitCount: circuitRows.length,
    activeCircuitCount: circuitRows.filter(row => row.enabled).length,
    conductorCount: geometry.conductors.length,
    measurementPointCount: measurementPoints.length,
    profilePointCount: profileRows.length,
    validationCount: validationRows.length,
    pass: statusCounts.pass || 0,
    warn: statusCounts.warn || 0,
    fail: statusCounts.fail || 0,
    missingData: (statusCounts.missingData || 0) + circuitRows.filter(row => row.status === 'missingData').length,
    maxBRms_uT: round(Math.max(0, ...fieldRows.map(row => row.bRms_uT || 0)), 4),
    maxUtilizationPct: round(Math.max(0, ...fieldRows.map(row => row.utilizationPct || 0)), 2),
    validationMismatchCount: validationRows.filter(row => row.status === 'warn').length,
    warningCount: warningRows.length,
  };

  return {
    studyCase,
    circuitRows,
    conductorGeometry: geometry,
    measurementPoints,
    fieldRows,
    profileRows,
    validationRows,
    mitigationRows,
    warningRows,
    assumptions: [
      'Magnetic fields are calculated with infinite straight-conductor Biot-Savart screening equations.',
      'Shielding, sheath, ferromagnetic, and depth effects are deterministic screening modifiers, not finite-element modeling.',
      'Final public or occupational exposure assessment requires project-specific standards review and field validation where applicable.',
    ],
    summary,
  };
}

export function buildEmfExposurePackage(context = {}) {
  const evaluation = evaluateEmfExposureCase(context);
  return {
    version: EMF_EXPOSURE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: stringValue(context.projectName, 'Untitled Project'),
    ...evaluation,
  };
}

export function renderEmfExposureHTML(pkg = {}) {
  const summary = asObject(pkg.summary);
  const fieldRows = asArray(pkg.fieldRows);
  const validationRows = asArray(pkg.validationRows);
  const warningRows = asArray(pkg.warningRows);
  const mitigationRows = asArray(pkg.mitigationRows);
  const rowClass = status => status === 'fail' ? 'result-fail' : status === 'warn' ? 'result-warn' : status === 'missingData' ? 'result-warn' : 'result-ok';
  const tableRows = (rows, cells) => rows.map(row => `<tr class="${rowClass(row.status || row.severity)}">${cells(row)}</tr>`).join('');
  return `
<section class="report-section" id="rpt-emf-exposure">
  <h2>EMF Exposure Study Basis</h2>
  <p class="meta">${escapeHtml(pkg.projectName || 'Untitled Project')} - ${escapeHtml(pkg.studyCase?.name || 'EMF Exposure Study Case')}</p>
  <p>${escapeHtml(summary.measurementPointCount || 0)} measurement point(s), ${escapeHtml(summary.conductorCount || 0)} conductor(s), max field ${escapeHtml(summary.maxBRms_uT ?? 'n/a')} uT, max utilization ${escapeHtml(summary.maxUtilizationPct ?? 'n/a')}%.</p>
  <table>
    <thead><tr><th>Point</th><th>Location (m)</th><th>B RMS (uT)</th><th>Limit</th><th>Utilization</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${tableRows(fieldRows, row => `
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.xM)}, ${escapeHtml(row.yM)}</td>
      <td>${escapeHtml(row.bRms_uT)}</td>
      <td>${escapeHtml(row.limitLabel)} (${escapeHtml(row.limit_uT)} uT)</td>
      <td>${escapeHtml(row.utilizationPct)}%</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.recommendation)}</td>`) || '<tr><td colspan="7">No EMF field rows.</td></tr>'}</tbody>
  </table>
  ${validationRows.length ? `<h3>Measured Field Validation</h3>
  <table>
    <thead><tr><th>Validation</th><th>Measured (uT)</th><th>Calculated (uT)</th><th>Difference</th><th>Status</th><th>Source</th></tr></thead>
    <tbody>${tableRows(validationRows, row => `
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.measuredB_uT ?? 'n/a')}</td>
      <td>${escapeHtml(row.calculatedB_uT ?? 'n/a')}</td>
      <td>${escapeHtml(row.differencePct ?? 'n/a')}%</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.source)}</td>`)}</tbody>
  </table>` : ''}
  ${mitigationRows.length ? `<h3>Mitigation Notes</h3>
  <ul>${mitigationRows.map(row => `<li><strong>${escapeHtml(row.label)}</strong>: ${escapeHtml(row.recommendation)}</li>`).join('')}</ul>` : ''}
  ${warningRows.length ? `<h3>Warnings</h3>
  <table>
    <thead><tr><th>Code</th><th>Source</th><th>Severity</th><th>Message</th><th>Recommendation</th></tr></thead>
    <tbody>${warningRows.map(row => `<tr class="${rowClass(row.severity)}">
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.sourceTag || row.sourceId || '')}</td>
      <td>${escapeHtml(row.severity)}</td>
      <td>${escapeHtml(row.message)}</td>
      <td>${escapeHtml(row.recommendation)}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}
  <h3>Assumptions</h3>
  <ul>${asArray(pkg.assumptions).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`;
}
