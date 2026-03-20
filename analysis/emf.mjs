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
