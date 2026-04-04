/**
 * Combined Seismic + Wind Load Scenario for Cable Tray Supports
 *
 * Orchestrates the three individual analysis modules to produce a unified
 * combined-scenario result for cable tray structural support design:
 *
 *   1. Seismic brace forces    — ASCE 7-22 Chapter 13, §13.3.1
 *   2. Wind forces             — ASCE 7-22 Chapters 26 and 29, §29.4
 *   3. LRFD load combinations  — ASCE 7-22 §2.3.2 (four-combination model)
 *
 * This module uses the §2.3.2 four-combination LRFD model (LC-W1 through LC-S2)
 * from `loadCombinations.mjs`. It is complementary to `structuralLoadCombinations.mjs`,
 * which uses the more detailed §2.3.1/§2.3.6 six-combination model with LRFD/ASD
 * toggle and capacity utilization checks. Use this module when the primary goal is
 * a side-by-side seismic + wind force breakdown with an ASCE 7-22 §2.3.2 envelope.
 *
 * Key references:
 *   ASCE 7-22 §2.3.2    — Basic LRFD load combinations
 *   ASCE 7-22 §13.3.1   — Seismic design force for nonstructural components (Fp)
 *   ASCE 7-22 §13.5.6.1 — Cable tray brace spacing and force distribution
 *   ASCE 7-22 Chapter 26 — Wind loads: general requirements
 *   ASCE 7-22 §29.4     — Wind loads on other structures (open signs, lattice frames)
 *
 * @module seismicWindCombined
 */

import { calcBraceForces } from './seismicBracing.mjs';
import { calcWindForce } from './windLoad.mjs';
import { evaluateLoadCombinations } from './loadCombinations.mjs';

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const VALID_RISK_CATEGORIES = new Set(['I', 'II', 'III', 'IV']);
const VALID_EXPOSURES = new Set(['B', 'C', 'D']);
const VALID_FILL_LEVELS = new Set(['empty', 'partial', 'full']);

/**
 * Validate all required inputs and throw descriptive errors for invalid values.
 *
 * @param {object} params
 * @throws {Error} if any required parameter is missing or out of range
 */
function validateParams(params) {
  const {
    wp_lbs_ft, z_ft, h_ft, spanLength_ft, trayWidth_in,
    sds, sd1, riskCategory,
    windSpeed_mph, windExposure, fillLevel,
    snowLoad_lbs_ft,
  } = params;

  if (!Number.isFinite(wp_lbs_ft) || wp_lbs_ft <= 0) {
    throw new Error('wp_lbs_ft (tray + cable weight per linear foot) must be a positive number.');
  }
  if (!Number.isFinite(z_ft) || z_ft < 0) {
    throw new Error('z_ft (tray attachment height) must be a non-negative number.');
  }
  if (!Number.isFinite(h_ft) || h_ft <= 0) {
    throw new Error('h_ft (average roof/structure height) must be positive.');
  }
  if (z_ft > h_ft) {
    throw new Error('z_ft (attachment height) cannot exceed h_ft (roof height).');
  }
  if (!Number.isFinite(spanLength_ft) || spanLength_ft <= 0) {
    throw new Error('spanLength_ft must be a positive number.');
  }
  if (!Number.isFinite(trayWidth_in) || trayWidth_in <= 0) {
    throw new Error('trayWidth_in must be a positive number.');
  }
  if (!Number.isFinite(sds) || sds < 0) {
    throw new Error('sds must be a non-negative finite number.');
  }
  if (!Number.isFinite(sd1) || sd1 < 0) {
    throw new Error('sd1 must be a non-negative finite number.');
  }
  if (!VALID_RISK_CATEGORIES.has(riskCategory)) {
    throw new Error(`riskCategory must be one of 'I', 'II', 'III', 'IV'. Got: ${riskCategory}`);
  }
  if (!Number.isFinite(windSpeed_mph) || windSpeed_mph < 0) {
    throw new Error('windSpeed_mph must be a non-negative finite number.');
  }
  if (!VALID_EXPOSURES.has(windExposure)) {
    throw new Error(`windExposure must be one of 'B', 'C', 'D'. Got: ${windExposure}`);
  }
  if (!VALID_FILL_LEVELS.has(fillLevel)) {
    throw new Error(`fillLevel must be one of 'empty', 'partial', 'full'. Got: ${fillLevel}`);
  }
  if (snowLoad_lbs_ft !== undefined && snowLoad_lbs_ft !== null) {
    if (!Number.isFinite(snowLoad_lbs_ft) || snowLoad_lbs_ft < 0) {
      throw new Error('snowLoad_lbs_ft must be a non-negative number when provided.');
    }
  }
}

// ---------------------------------------------------------------------------
// Zero-wind detail (indoor / sheltered installations)
// ---------------------------------------------------------------------------

/**
 * Construct a zero-wind detail object when windSpeed_mph = 0.
 * All forces are zero; the wind combinations (LC-W1, LC-W2) will be N/A.
 *
 * @param {object} params - Validated params object
 * @returns {object}
 */
function zeroWindDetail(params) {
  return {
    Kz: 0,
    q_z_psf: 0,
    Cf: 0,
    G: params.G ?? 0.85,
    projectedArea_ft2: 0,
    windForce_lbs: 0,
    windForce_per_ft: 0,
    windPressure_psf: 0,
    note: 'Wind speed = 0: wind load not applied (indoor / sheltered installation). ' +
          'LC-W1 and LC-W2 are not applicable.',
  };
}

// ---------------------------------------------------------------------------
// Main combined calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the combined seismic + wind load scenario for a single cable tray section.
 *
 * @param {object} params
 *
 * — Shared geometry —
 * @param {number}  params.z_ft              Tray attachment height above grade (ft), >= 0
 * @param {number}  params.h_ft              Average roof/structure height above base (ft), > 0
 * @param {number}  params.spanLength_ft     Support span length (ft), > 0
 * @param {number}  params.trayWidth_in      Tray inside width (inches), > 0
 *
 * — Dead load —
 * @param {number}  params.wp_lbs_ft         Tray + cable weight per linear foot (lbs/ft), > 0
 *
 * — Seismic parameters (ASCE 7-22 Chapter 13) —
 * @param {number}  params.sds               Design spectral acceleration, short period (g), >= 0
 * @param {number}  params.sd1               Design spectral acceleration, 1-second period (g), >= 0
 * @param {string}  params.riskCategory      'I' | 'II' | 'III' | 'IV'
 * @param {number}  [params.ip=1.0]          Component importance factor (1.0 or 1.5)
 * @param {number}  [params.ap=1.0]          Component amplification factor
 * @param {number}  [params.rp=2.5]          Component response modification factor
 *
 * — Wind parameters (ASCE 7-22 Chapters 26/29) —
 * @param {number}  params.windSpeed_mph     Basic wind speed V (mph), >= 0 (0 = sheltered/indoor)
 * @param {string}  params.windExposure      'B' | 'C' | 'D'
 * @param {string}  params.fillLevel         'empty' | 'partial' | 'full'
 * @param {number}  [params.K_zt=1.0]        Topographic factor
 * @param {number}  [params.G=0.85]          Gust factor
 *
 * — Snow (optional) —
 * @param {number}  [params.snowLoad_lbs_ft=0] Snow load per linear foot (lbs/ft)
 *
 * @returns {{
 *   wp_lbs_ft: number,
 *   snowLoad_lbs_ft: number,
 *   seismicDetail: object,
 *   windDetail: object,
 *   loadCombinationInputs: {D_lbs_ft, E_lat_lbs_ft, E_v_lbs_ft, W_lbs_ft, S_lbs_ft},
 *   combinations: {LC_W1, LC_W2, LC_S1, LC_S2},
 *   envelope: object|null,
 *   nec: {seismic: object, wind: object, combinations: object},
 * }}
 */
export function calcSeismicWindCombined(params) {
  validateParams(params);

  const {
    wp_lbs_ft, z_ft, h_ft, spanLength_ft, trayWidth_in,
    sds, sd1, riskCategory,
    windSpeed_mph, windExposure, fillLevel,
  } = params;

  const ip  = params.ip  ?? 1.0;
  const ap  = params.ap  ?? 1.0;
  const rp  = params.rp  ?? 2.5;
  const K_zt = params.K_zt ?? 1.0;
  const G    = params.G    ?? 0.85;
  const snowLoad_lbs_ft = params.snowLoad_lbs_ft ?? 0;

  // 1. Seismic brace forces (ASCE 7-22 Chapter 13)
  const seismicDetail = calcBraceForces({
    sds,
    sd1,
    riskCategory,
    wp: wp_lbs_ft,
    z:  z_ft,
    h:  h_ft,
    ap,
    rp,
    ip,
  });

  // 2. Wind force (ASCE 7-22 Chapters 26/29)
  //    windSpeed_mph = 0 is allowed for indoor / sheltered installations.
  const windDetail = windSpeed_mph > 0
    ? calcWindForce({
        V:            windSpeed_mph,
        z_ft,
        exposure:     windExposure,
        trayWidth_in,
        spanLength_ft,
        fillLevel,
        K_zt,
        G,
      })
    : zeroWindDetail({ G });

  // 3. ASCE 7-22 §2.3.2 LRFD load combinations
  const loadCombinationInputs = {
    D_lbs_ft:     wp_lbs_ft,
    E_lat_lbs_ft: seismicDetail.lateralForce,
    E_v_lbs_ft:   seismicDetail.verticalForce,
    W_lbs_ft:     windDetail.windForce_per_ft,
    S_lbs_ft:     snowLoad_lbs_ft,
  };

  const { combinations, envelope } = evaluateLoadCombinations(loadCombinationInputs);

  return {
    wp_lbs_ft,
    snowLoad_lbs_ft,
    seismicDetail,
    windDetail,
    loadCombinationInputs,
    combinations,
    envelope,
    nec: {
      seismic: {
        rule:        'ASCE 7-22 Chapter 13',
        section:     '§13.3.1, §13.5.6',
        description: 'Seismic design force for nonstructural components: ' +
                     'Fp = (0.4·ap·SDS·Wp / (Rp/Ip)) × (1 + 2z/h), ' +
                     'subject to Fp_min = 0.3·SDS·Ip·Wp and Fp_max = 1.6·SDS·Ip·Wp. ' +
                     'Longitudinal force = 0.4 × lateral; vertical = ±0.2·SDS·Ip·Wp.',
      },
      wind: {
        rule:        'ASCE 7-22 Chapters 26 and 29',
        section:     '§26.10-1, §29.4',
        description: 'Wind velocity pressure qz = 0.00256·Kz·Kzt·Ke·V². ' +
                     'Wind force per linear foot = qz·G·Cf·(tray width × span) / span.',
      },
      combinations: {
        rule:        'ASCE 7-22 Section 2.3.2',
        description: 'LRFD load combinations: ' +
                     'LC-W1: 1.2D + 1.6W; ' +
                     'LC-W2: 0.9D + 1.0W; ' +
                     'LC-S1: 1.2D + 1.0E + 0.2S; ' +
                     'LC-S2: 0.9D + 1.0E.',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Batch evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate multiple trays against a common set of site and wind parameters.
 *
 * @param {Array<{tray_id: string, wp_per_ft: number, trayWidth_in?: number}>} trays
 *   Each entry must supply `wp_per_ft` (lbs/ft). An optional `trayWidth_in`
 *   overrides `siteParams.trayWidth_in` for that individual tray.
 *
 * @param {object} siteParams
 *   All calcSeismicWindCombined params except `wp_lbs_ft` and (optionally)
 *   `trayWidth_in` — those come from the tray object. Required fields:
 *   z_ft, h_ft, spanLength_ft, trayWidth_in (fallback), sds, sd1, riskCategory,
 *   windSpeed_mph, windExposure, fillLevel.
 *
 * @returns {Array<{tray_id: string, result: ReturnType<calcSeismicWindCombined>}>}
 */
export function evaluateTraysCombined(trays, siteParams) {
  if (!Array.isArray(trays)) {
    throw new Error('trays must be an array.');
  }

  return trays.map(tray => {
    const tray_id = tray.tray_id || tray.id || '?';
    const result = calcSeismicWindCombined({
      ...siteParams,
      wp_lbs_ft:    tray.wp_per_ft,
      trayWidth_in: tray.trayWidth_in ?? siteParams.trayWidth_in,
    });
    return { tray_id, result };
  });
}
