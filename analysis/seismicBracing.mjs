/**
 * Cable Tray Seismic Bracing Calculator
 * Nonstructural component seismic force — ASCE 7 Chapter 13 and IBC §1613.
 *
 * IMPORTANT — edition: The component force equation implemented here is the
 * ASCE 7-16 §13.3.1 form (the equation used in ASCE 7-05/-10/-16). ASCE 7-22
 * §13.3.1 replaced it with a revised equation that introduces Hf, Rμ, Car and
 * Rpo and drops ap/Rp; that 2022 equation is NOT implemented here. Results
 * therefore reflect ASCE 7-16, which remains widely adopted by jurisdictions.
 *
 * Methodology:
 *   The design seismic force for a nonstructural component (ASCE 7-16 §13.3.1):
 *
 *     Fp = (0.4 × ap × SDS × Wp) / (Rp / Ip) × (1 + 2z/h)
 *
 *   Subject to the limits:
 *     Fp_min = 0.3 × SDS × Ip × Wp
 *     Fp_max = 1.6 × SDS × Ip × Wp
 *
 *   For cable trays (ASCE 7-16 Table 13.6-1, Electrical components):
 *     ap = 1.0  (component amplification factor)
 *     Rp = 2.5  (component response modification factor)
 *
 *   Brace forces:
 *     Lateral (transverse):    Fp_lateral    = Fp × Wp
 *     Longitudinal:            Fp_long       = 0.4 × Fp × Wp   (ASCE 7 §13.5.6.1)
 *     Vertical:                Fv            = ±0.2 × SDS × Wp  (ASCE 7 §12.4.2.2,
 *                                                                no Ip on Ev)
 *
 *   Maximum brace spacing:
 *     SDC A/B: bracing not required
 *     SDC C–F: lateral at ≤ 12 ft, longitudinal at ≤ 40 ft
 *     NOTE: The 12 ft / 40 ft spacings are NEMA VE 2 trapeze-support guidance
 *     values, not literal ASCE 7 §13.5.6.1 limits. ASCE 7 prescribes the design
 *     force and connection requirements; verify spacing with the support
 *     manufacturer and the AHJ.
 *
 * References:
 *   ASCE 7-16 — Minimum Design Loads and Associated Criteria for Buildings and
 *               Other Structures, Chapter 13 (force equation implemented here)
 *   IBC 2021  — §1613 Earthquake Loads
 *   NEMA VE 2  — Cable Tray Installation Guidelines (seismic / spacing guidance)
 */

/**
 * Seismic design category (SDC) table per ASCE 7-16 Tables 11.6-1 & 11.6-2.
 *
 * Occupancy (Risk) Category mapping to SDC for a given SDS (short-period) value.
 * Returns the more severe of the two tables (SDS and SD1 results combined by caller).
 *
 * @param {number} sds   – Design spectral acceleration at short period (g)
 * @param {'I'|'II'|'III'|'IV'} riskCategory
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'}
 */
export function sdcFromSds(sds, riskCategory) {
  if (riskCategory === 'I' || riskCategory === 'II' || riskCategory === 'III') {
    if (sds < 0.167) return 'A';
    if (sds < 0.33)  return 'B';
    if (sds < 0.50)  return 'C';
    return 'D';
  }
  // Risk Category IV
  if (sds < 0.167) return 'A';
  if (sds < 0.33)  return 'C';
  return 'D';
}

/**
 * Seismic Design Category from SD1 (ASCE 7 Table 11.6-2), with a conservative
 * extension to E/F.
 *
 * ASSUMPTION: ASCE 7 Table 11.6-2 only assigns categories A–D (its top band is
 * SD1 ≥ 0.20 → D). Categories E and F are formally triggered by §11.6 when the
 * mapped 1-second spectral acceleration S1 ≥ 0.75 (E for Risk I–III, F for Risk
 * IV). This tool collects SD1 but not S1, so it uses the conservative SD1
 * thresholds below (≥ 0.30 → E, ≥ 0.50 → F) as a stand-in for the S1 rule. This
 * errs toward requiring bracing; for a code-of-record determination, evaluate
 * S1 directly per §11.6.
 *
 * @param {number} sd1   – Design spectral acceleration at 1-second period (g)
 * @param {'I'|'II'|'III'|'IV'} riskCategory
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'}
 */
export function sdcFromSd1(sd1, riskCategory) {
  if (riskCategory === 'I' || riskCategory === 'II' || riskCategory === 'III') {
    if (sd1 < 0.067) return 'A';
    if (sd1 < 0.133) return 'B';
    if (sd1 < 0.20)  return 'C';
    if (sd1 < 0.30)  return 'D';   // Table 11.6-2 tops out at D (SD1 ≥ 0.20)
    if (sd1 < 0.50)  return 'E';   // conservative proxy for S1 ≥ 0.75 (§11.6)
    return 'F';                    // conservative proxy for very high seismicity
  }
  // Risk Category IV
  if (sd1 < 0.067) return 'A';
  if (sd1 < 0.133) return 'C';
  if (sd1 < 0.20)  return 'D';
  if (sd1 < 0.30)  return 'D';
  if (sd1 < 0.50)  return 'E'; // conservative proxy for S1 ≥ 0.75 (§11.6)
  return 'F';
}

const SDC_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Determine the governing Seismic Design Category as the more severe of the
 * SDS-based and SD1-based categories (ASCE 7-16 §11.6).
 *
 * @param {number} sds
 * @param {number} sd1
 * @param {'I'|'II'|'III'|'IV'} riskCategory
 * @returns {'A'|'B'|'C'|'D'|'E'|'F'}
 */
export function calcSeismicDesignCategory(sds, sd1, riskCategory) {
  const a = sdcFromSds(sds, riskCategory);
  const b = sdcFromSd1(sd1, riskCategory);
  return SDC_ORDER.indexOf(a) >= SDC_ORDER.indexOf(b) ? a : b;
}

/**
 * Screening brace-spacing guidance based on NEMA VE 2 installation practice.
 * These values are not literal ASCE 7 maximum-spacing requirements.
 *
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} sdc
 * @returns {{ lateral: number|null, longitudinal: number|null, required: boolean }}
 *   Spacings in feet; null indicates no requirement.
 */
export function maxBraceSpacing(sdc) {
  if (sdc === 'A' || sdc === 'B') {
    return { lateral: null, longitudinal: null, required: false };
  }
  // SDC C–F: lateral bracing at ≤ 12 ft, longitudinal at ≤ 40 ft
  return { lateral: 12, longitudinal: 40, required: true };
}

/**
 * ASCE 7-16 §13.3.1 component seismic force.
 *
 * @param {object} params
 * @param {number} params.sds        – Design spectral acceleration at short period (g)
 * @param {number} params.wp         – Component operating weight per linear foot (lbs/ft)
 * @param {number} params.z          – Height of attachment point above grade/base (ft)
 * @param {number} params.h          – Average roof height above base (ft)
 * @param {number} [params.ap=1.0]   – Component amplification factor
 * @param {number} [params.rp=2.5]   – Component response modification factor
 * @param {number} [params.ip=1.0]   – Component importance factor (1.0 or 1.5)
 * @returns {{
 *   fp:         number,  // Design seismic force per unit weight (g), applied
 *   fpMin:      number,  // Minimum Fp (g)
 *   fpMax:      number,  // Maximum Fp (g)
 *   heightFactor: number, // (1 + 2z/h) height amplification
 * }}
 */
export function calcComponentForceFactor(params) {
  const { sds, z, h } = params;
  const ap = params.ap ?? 1.0;
  const rp = params.rp ?? 2.5;
  const ip = params.ip ?? 1.0;

  if (!Number.isFinite(sds) || sds < 0) throw new Error('sds must be a non-negative number');
  if (!Number.isFinite(z) || z < 0)   throw new Error('z must be non-negative');
  if (!Number.isFinite(h) || h <= 0)  throw new Error('h must be positive');
  if (z > h) throw new Error('Attachment height z cannot exceed roof height h');

  const heightFactor = 1 + 2 * (z / h);
  const fp    = (0.4 * ap * sds / (rp / ip)) * heightFactor;
  const fpMin = 0.3 * sds * ip;
  const fpMax = 1.6 * sds * ip;

  return {
    fp:           Math.round(Math.min(Math.max(fp, fpMin), fpMax) * 1e6) / 1e6,
    fpMin:        Math.round(fpMin * 1e6) / 1e6,
    fpMax:        Math.round(fpMax * 1e6) / 1e6,
    heightFactor: Math.round(heightFactor * 1000) / 1000,
  };
}

/**
 * Calculate seismic brace forces for a cable tray section.
 *
 * @param {object} params
 * @param {number} params.sds          – Design spectral acceleration at short period (g)
 * @param {number} params.sd1          – Design spectral acceleration at 1-second period (g)
 * @param {'I'|'II'|'III'|'IV'} params.riskCategory
 * @param {number} params.wp           – Tray + cable weight per linear foot of tray (lbs/ft)
 * @param {number} params.z            – Height of tray attachment above grade (ft)
 * @param {number} params.h            – Average roof/structure height above grade (ft)
 * @param {number} [params.traySpan]   – Support span being evaluated (ft); used for total Wp
 * @param {number} [params.ap=1.0]
 * @param {number} [params.rp=2.5]
 * @param {number} [params.ip=1.0]
 * @returns {{
 *   sdc:               string,  // Seismic Design Category
 *   fpFactor:          number,  // Fp/Wp ratio (dimensionless g)
 *   wpPerFt:           number,  // lbs/ft
 *   lateralForce:      number,  // lbs per linear foot of tray
 *   longitudinalForce: number,  // lbs per linear foot (= 0.4 × lateral per ASCE 7)
 *   verticalForce:     number,  // lbs per linear foot (±0.2 × SDS × Wp)
 *   maxLateralSpacing: number|null,  // ft
 *   maxLongSpacing:    number|null,  // ft
 *   bracingRequired:   boolean,
 *   recommendation:    string,
 * }}
 */
export function calcBraceForces(params) {
  const { sds, sd1, riskCategory, wp, z, h } = params;
  const ip = params.ip ?? 1.0;
  if (!Number.isFinite(wp) || wp <= 0) {
    throw new Error('wp must be a finite positive number (lbs/ft).');
  }

  const sdc = calcSeismicDesignCategory(sds, sd1, riskCategory);
  const spacing = maxBraceSpacing(sdc);

  if (!spacing.required) {
    return {
      sdc,
      fpFactor:          0,
      wpPerFt:           wp,
      lateralForce:      0,
      longitudinalForce: 0,
      verticalForce:     Math.round(0.2 * sds * wp * 100) / 100,
      maxLateralSpacing: null,
      maxLongSpacing:    null,
      bracingRequired:   false,
      recommendation:
        `SDC ${sdc}: Seismic bracing of cable trays is not required by ASCE 7 for ` +
        `this Seismic Design Category and Risk Category. Verify with local AHJ.`,
    };
  }

  const { fp } = calcComponentForceFactor({ sds, z, h, ap: params.ap, rp: params.rp, ip });
  const lateralForce      = Math.round(fp * wp * 100) / 100;    // lbs/ft
  const longitudinalForce = Math.round(0.4 * fp * wp * 100) / 100;  // ASCE 7 §13.5.6.1
  // Vertical seismic load effect Ev = 0.2·SDS·D (ASCE 7 §12.4.2.2). The
  // importance factor Ip is NOT applied to Ev — it only scales the horizontal
  // component force Fp. Matches the no-bracing branch above.
  const verticalForce     = Math.round(0.2 * sds * wp * 100) / 100;

  const rec =
    `SDC ${sdc}: Lateral bracing required at ≤ ${spacing.lateral} ft, ` +
    `longitudinal at ≤ ${spacing.longitudinal} ft. ` +
    `Lateral force = ${lateralForce.toFixed(2)} lbs/ft, ` +
    `longitudinal = ${longitudinalForce.toFixed(2)} lbs/ft, ` +
    `vertical = ±${verticalForce.toFixed(2)} lbs/ft (per ASCE 7-16 §13.3.1 & §13.5.6).`;

  return {
    sdc,
    fpFactor:          fp,
    wpPerFt:           wp,
    lateralForce,
    longitudinalForce,
    verticalForce,
    maxLateralSpacing:  spacing.lateral,
    maxLongSpacing:     spacing.longitudinal,
    bracingRequired:    true,
    recommendation:     rec,
  };
}

/**
 * Evaluate seismic bracing for multiple trays at once.
 *
 * @param {Array<{tray_id: string, wp_per_ft: number}>} trays
 * @param {object} siteParams  – { sds, sd1, riskCategory, z, h, ip? }
 * @returns {Array<{ tray_id: string, result: ReturnType<calcBraceForces> }>}
 */
export function evaluateTraysBracing(trays, siteParams) {
  return trays.map(tray => ({
    tray_id: tray.tray_id || tray.id || '?',
    result:  calcBraceForces({ ...siteParams, wp: tray.wp_per_ft }),
  }));
}
