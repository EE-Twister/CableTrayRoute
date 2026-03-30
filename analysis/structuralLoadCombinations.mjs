/**
 * Structural Load Combinations for Cable Tray Supports (ASCE 7-22)
 *
 * Combines seismic forces (from analysis/seismicBracing.mjs) and wind forces
 * (from analysis/windLoad.mjs) per ASCE 7-22 Section 2.3 (LRFD) and Section 2.4
 * (ASD) to determine the governing combined load demand on cable tray supports.
 *
 * ASCE 7-22 references:
 *  §2.3.1  — Basic LRFD load combinations
 *  §2.3.6  — LRFD combinations including seismic load effect E
 *  §2.4.1  — Basic ASD load combinations
 *  §12.4.2 — Seismic load effect E = E_h ± E_v, where E_v = 0.2·S_DS·D
 *
 * @module structuralLoadCombinations
 */

import { calcBraceForces } from './seismicBracing.mjs';
import { calcWindForce } from './windLoad.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireFinitePositive(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number (got ${value}).`);
  }
}

function requireFiniteAbove(value, min, name) {
  if (!Number.isFinite(value) || value <= min) {
    throw new Error(`${name} must be > ${min} (got ${value}).`);
  }
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')} (got ${JSON.stringify(value)}).`);
  }
}

// ---------------------------------------------------------------------------
// LRFD Load Combination Definitions (ASCE 7-22 §2.3.1 and §2.3.6)
// ---------------------------------------------------------------------------

/**
 * Build LRFD combination rows given scalar load effect values.
 * Cable trays carry no floor live load (L = 0) and no snow load (S = 0).
 *
 * Vertical sign convention: positive = downward (compression on support).
 * Lateral sign convention: positive = horizontally away from structure.
 *
 * @param {number} D   Dead load per unit length (lbs/ft)
 * @param {number} W   Lateral wind force per unit length (lbs/ft)
 * @param {number} Eh  Lateral seismic force per unit length (lbs/ft) — E_h
 * @param {number} Ev  Vertical seismic effect per unit length (lbs/ft) — 0.2·S_DS·D
 * @returns {Array<{id,label,standard,verticalDemand,lateralDemand}>}
 */
function buildLrfdCombinations(D, W, Eh, Ev) {
  // §2.3.1 Combinations 1–6 (with L=0, S=0, Lr=0):
  //   1: 1.4D
  //   2: 1.2D + 1.6L  → 1.2D  (L=0)
  //   3: 1.2D + 1.0W + 1.0L  → 1.2D + 1.0W
  //   4: 0.9D + 1.0W  (governs uplift vs wind)
  // §2.3.6 Combinations with seismic (E = Eh ± Ev):
  //   5: (1.2 + 0.2·SDS)·D + Eh = 1.2D + Ev + Eh
  //   6: (0.9 − 0.2·SDS)·D + Eh = 0.9D − Ev + Eh
  return [
    {
      id: 'LC-1',
      label: '1.4D',
      standard: 'ASCE 7-22 §2.3.1 Combo 1',
      verticalDemand: 1.4 * D,
      lateralDemand: 0,
    },
    {
      id: 'LC-2',
      label: '1.2D (gravity, L = 0)',
      standard: 'ASCE 7-22 §2.3.1 Combo 2',
      verticalDemand: 1.2 * D,
      lateralDemand: 0,
    },
    {
      id: 'LC-3',
      label: '1.2D + 1.0W',
      standard: 'ASCE 7-22 §2.3.1 Combo 3',
      verticalDemand: 1.2 * D,
      lateralDemand: 1.0 * W,
    },
    {
      id: 'LC-4',
      label: '0.9D + 1.0W (wind uplift check)',
      standard: 'ASCE 7-22 §2.3.1 Combo 4',
      verticalDemand: 0.9 * D,
      lateralDemand: 1.0 * W,
    },
    {
      id: 'LC-5',
      label: '(1.2 + 0.2·S\u1D05\u209B)D + 1.0E\u2095 (seismic down)',
      standard: 'ASCE 7-22 §2.3.6 Combo 5',
      verticalDemand: 1.2 * D + Ev,
      lateralDemand: 1.0 * Eh,
    },
    {
      id: 'LC-6',
      label: '(0.9 \u2212 0.2·S\u1D05\u209B)D + 1.0E\u2095 (seismic uplift)',
      standard: 'ASCE 7-22 §2.3.6 Combo 6',
      verticalDemand: 0.9 * D - Ev,
      lateralDemand: 1.0 * Eh,
    },
  ];
}

// ---------------------------------------------------------------------------
// ASD Load Combination Definitions (ASCE 7-22 §2.4.1 and §2.4.5)
// ---------------------------------------------------------------------------

/**
 * Build ASD combination rows (cable tray only, L = S = 0).
 *
 * @param {number} D   Dead load (lbs/ft)
 * @param {number} W   Lateral wind force (lbs/ft)
 * @param {number} Eh  Lateral seismic force (lbs/ft)
 * @param {number} Ev  Vertical seismic effect 0.2·S_DS·D (lbs/ft)
 */
function buildAsdCombinations(D, W, Eh, Ev) {
  // §2.4.1 Basic combinations (with L=S=0):
  //   1: D
  //   2: D + 0.6W
  //   3: 0.6D + 0.6W  (uplift check)
  // §2.4.5 Seismic:
  //   4: D + 0.7E = D + 0.7Eh + 0.7Ev
  //   5: (0.6 − 0.14·SDS)D + 0.7Eh  (uplift: use (0.6D − 0.7Ev))
  // Note: 0.14·SDS·D = 0.7 × 0.2·SDS·D = 0.7·Ev
  return [
    {
      id: 'ASD-1',
      label: 'D',
      standard: 'ASCE 7-22 §2.4.1 Combo 1',
      verticalDemand: D,
      lateralDemand: 0,
    },
    {
      id: 'ASD-2',
      label: 'D + 0.6W',
      standard: 'ASCE 7-22 §2.4.1 Combo 2',
      verticalDemand: D,
      lateralDemand: 0.6 * W,
    },
    {
      id: 'ASD-3',
      label: '0.6D + 0.6W (uplift check)',
      standard: 'ASCE 7-22 §2.4.1 Combo 3',
      verticalDemand: 0.6 * D,
      lateralDemand: 0.6 * W,
    },
    {
      id: 'ASD-4',
      label: 'D + 0.7E\u2095 (seismic down)',
      standard: 'ASCE 7-22 §2.4.5 Combo 4',
      verticalDemand: D + 0.7 * Ev,
      lateralDemand: 0.7 * Eh,
    },
    {
      id: 'ASD-5',
      label: '(0.6 \u2212 0.14·S\u1D05\u209B)D + 0.7E\u2095 (seismic uplift)',
      standard: 'ASCE 7-22 §2.4.5 Combo 5',
      verticalDemand: 0.6 * D - 0.7 * Ev,
      lateralDemand: 0.7 * Eh,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Calculate ASCE 7-22 structural load combinations for a cable tray support.
 *
 * Internally calls `calcBraceForces` (seismicBracing.mjs) and `calcWindForce`
 * (windLoad.mjs), then evaluates each load combination to find the governing
 * vertical and lateral demands.
 *
 * @param {object} params
 * @param {number} params.trayWeight_lbs_ft       - Tray self-weight (lbs/ft), ≥ 0
 * @param {number} params.cableWeight_lbs_ft      - Cable load (lbs/ft), ≥ 0
 * @param {number} params.windSpeed_mph           - Basic wind speed V (mph), > 0
 * @param {string} params.windExposure            - Terrain exposure: 'B', 'C', or 'D'
 * @param {number} [params.windK_zt=1.0]          - Topographic factor K_zt
 * @param {number} [params.windG=0.85]            - Gust factor G
 * @param {number} params.sds                     - S_DS design spectral accel (g), ≥ 0
 * @param {number} params.sd1                     - S_D1 design spectral accel (g), ≥ 0
 * @param {string} params.riskCategory            - 'I', 'II', 'III', or 'IV'
 * @param {number} [params.ip=1.0]                - Component importance factor
 * @param {number} params.height_ft               - Tray height above grade z (ft), > 0
 * @param {number} params.buildingHeight_ft       - Avg roof height h (ft), > 0
 * @param {number} params.trayWidth_in            - Tray inside width (in), > 0
 * @param {number} params.spanLength_ft           - Support span length (ft), > 0
 * @param {string} [params.fillLevel='partial']   - 'empty', 'partial', or 'full'
 * @param {number} [params.verticalCapacity_lbs_ft] - Optional vertical support capacity
 * @param {number} [params.lateralCapacity_lbs_ft]  - Optional lateral support capacity
 * @param {string} [params.designMethod='LRFD']   - 'LRFD' or 'ASD'
 *
 * @returns {{
 *   deadLoad_lbs_ft: number,
 *   windLateral_lbs_ft: number,
 *   seismicLateral_lbs_ft: number,
 *   seismicVertical_lbs_ft: number,
 *   windResult: object,
 *   seismicResult: object,
 *   loadCombinations: Array,
 *   governingVertical: object,
 *   governingLateral: object,
 *   capacityCheck: object,
 * }}
 */
export function calcStructuralCombinations(params) {
  // ---- Validate inputs ----
  const {
    trayWeight_lbs_ft,
    cableWeight_lbs_ft,
    windSpeed_mph,
    windExposure,
    windK_zt = 1.0,
    windG = 0.85,
    sds,
    sd1,
    riskCategory,
    ip = 1.0,
    height_ft,
    buildingHeight_ft,
    trayWidth_in,
    spanLength_ft,
    fillLevel = 'partial',
    verticalCapacity_lbs_ft,
    lateralCapacity_lbs_ft,
    designMethod = 'LRFD',
  } = params;

  requireFinitePositive(trayWeight_lbs_ft, 'trayWeight_lbs_ft');
  requireFinitePositive(cableWeight_lbs_ft, 'cableWeight_lbs_ft');
  requireFiniteAbove(windSpeed_mph, 0, 'windSpeed_mph');
  requireEnum(windExposure, ['B', 'C', 'D'], 'windExposure');
  requireFinitePositive(sds, 'sds');
  requireFinitePositive(sd1, 'sd1');
  requireEnum(riskCategory, ['I', 'II', 'III', 'IV'], 'riskCategory');
  requireFiniteAbove(height_ft, 0, 'height_ft');
  requireFiniteAbove(buildingHeight_ft, 0, 'buildingHeight_ft');
  requireFiniteAbove(trayWidth_in, 0, 'trayWidth_in');
  requireFiniteAbove(spanLength_ft, 0, 'spanLength_ft');
  requireEnum(fillLevel, ['empty', 'partial', 'full'], 'fillLevel');
  requireEnum(designMethod, ['LRFD', 'ASD'], 'designMethod');

  // ---- Dead load ----
  const D = trayWeight_lbs_ft + cableWeight_lbs_ft;

  // ---- Wind load ----
  const windResult = calcWindForce({
    V: windSpeed_mph,
    z_ft: height_ft,
    exposure: windExposure,
    trayWidth_in,
    spanLength_ft,
    fillLevel,
    K_zt: windK_zt,
    G: windG,
  });
  const W = windResult.windForce_per_ft;

  // ---- Seismic load ----
  // wp = total operating weight per unit length for seismic force calculation
  const seismicResult = calcBraceForces({
    sds,
    sd1,
    riskCategory,
    wp: D,
    z: height_ft,
    h: buildingHeight_ft,
    traySpan: spanLength_ft,
    ip,
  });
  const Eh = seismicResult.lateralForce;   // horizontal seismic demand (lbs/ft)

  // Vertical seismic effect per ASCE 7-22 §12.4.2.2: E_v = 0.2·S_DS·D
  const Ev = 0.2 * sds * D;

  // ---- Build load combinations ----
  const rawCombinations = designMethod === 'LRFD'
    ? buildLrfdCombinations(D, W, Eh, Ev)
    : buildAsdCombinations(D, W, Eh, Ev);

  // ---- Find governing combinations ----
  let maxVertical = -Infinity;
  let maxLateral = -Infinity;
  rawCombinations.forEach(lc => {
    if (lc.verticalDemand > maxVertical) maxVertical = lc.verticalDemand;
    if (lc.lateralDemand > maxLateral) maxLateral = lc.lateralDemand;
  });

  const loadCombinations = rawCombinations.map(lc => ({
    ...lc,
    verticalDemand_lbs_ft: Math.round(lc.verticalDemand * 100) / 100,
    lateralDemand_lbs_ft: Math.round(lc.lateralDemand * 100) / 100,
    governingVertical: lc.verticalDemand === maxVertical,
    governingLateral: lc.lateralDemand === maxLateral,
  }));

  const govVerticalLC = loadCombinations.find(lc => lc.governingVertical);
  const govLateralLC = loadCombinations.find(lc => lc.governingLateral);

  // ---- Capacity check ----
  const hasVertCap = Number.isFinite(verticalCapacity_lbs_ft) && verticalCapacity_lbs_ft > 0;
  const hasLatCap = Number.isFinite(lateralCapacity_lbs_ft) && lateralCapacity_lbs_ft > 0;

  const capacityCheck = {
    verticalUtilization: hasVertCap
      ? Math.round((govVerticalLC.verticalDemand_lbs_ft / verticalCapacity_lbs_ft) * 1000) / 1000
      : null,
    lateralUtilization: hasLatCap
      ? Math.round((govLateralLC.lateralDemand_lbs_ft / lateralCapacity_lbs_ft) * 1000) / 1000
      : null,
    verticalAdequate: hasVertCap
      ? govVerticalLC.verticalDemand_lbs_ft <= verticalCapacity_lbs_ft
      : null,
    lateralAdequate: hasLatCap
      ? govLateralLC.lateralDemand_lbs_ft <= lateralCapacity_lbs_ft
      : null,
  };

  return {
    deadLoad_lbs_ft: Math.round(D * 100) / 100,
    windLateral_lbs_ft: Math.round(W * 100) / 100,
    seismicLateral_lbs_ft: Math.round(Eh * 100) / 100,
    seismicVertical_lbs_ft: Math.round(Ev * 100) / 100,
    windResult,
    seismicResult,
    loadCombinations,
    governingVertical: {
      id: govVerticalLC.id,
      label: govVerticalLC.label,
      demand_lbs_ft: govVerticalLC.verticalDemand_lbs_ft,
    },
    governingLateral: {
      id: govLateralLC.id,
      label: govLateralLC.label,
      demand_lbs_ft: govLateralLC.lateralDemand_lbs_ft,
    },
    capacityCheck,
  };
}
