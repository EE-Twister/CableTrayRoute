/**
 * Wind Load Analysis for Outdoor Cable Tray Installations
 * Per ASCE 7-22 Chapter 26 (Wind Loads — General Requirements) and
 * Chapter 29 (Wind Loads on Other Structures and Building Appurtenances)
 *
 * Calculates design wind pressure on exposed cable trays and the resulting
 * lateral wind force per span. Used for outdoor petrochemical, utility,
 * and industrial tray installations.
 *
 * Methodology:
 *   Velocity pressure at height z:
 *     q_z = 0.00256 × K_z × K_zt × K_e × V²   (lbs/ft²)
 *
 *   Design wind force on tray (projected area method, ASCE 7-22 §29.4):
 *     F = q_z × G × C_f × A_f
 *
 *   where:
 *     K_z  = velocity pressure exposure coefficient (ASCE 7-22 Table 26.10-1)
 *     K_zt = topographic factor (1.0 flat terrain, up to 3.0 hillcrest)
 *     K_e  = ground elevation factor (1.0 at sea level — conservative default)
 *     V    = basic wind speed (mph), from ASCE 7-22 Fig. 26.5-1A/B/C
 *     G    = gust factor (0.85 for rigid structures per ASCE 7-22 §26.11)
 *     C_f  = force coefficient for open-framed / attached structure
 *     A_f  = projected area exposed to wind (tray width × span, ft²)
 *
 * Force coefficient C_f for cable trays (ASCE 7-22 §29.4.1, similar to
 * solid freestanding walls / signboards):
 *   Empty tray  → C_f ≈ 1.3  (open ladder tray; wind passes through sides)
 *   Filled tray → C_f ≈ 2.0  (solid-fill tray; acts like a flat plate)
 *
 * References:
 *   ASCE 7-22  — Minimum Design Loads and Associated Criteria for Buildings and
 *                Other Structures, Chapters 26 and 29
 *   ASCE 7-22 Table 26.10-1 — Velocity pressure exposure coefficients K_z
 *   NEMA VE 1-2017           — Metallic Cable Tray Systems (structural properties)
 *   NEMA VE 2-2006           — Cable Tray Installation Guidelines
 */

// ---------------------------------------------------------------------------
// Velocity pressure exposure coefficient K_z (ASCE 7-22 Table 26.10-1)
// ---------------------------------------------------------------------------

/**
 * Compute K_z using power-law interpolation per ASCE 7-22 Table 26.10-1.
 *
 * For heights between 15 ft and 500 ft:
 *   K_z = 2.01 × (z / z_g)^(2/α)
 * For z < 15 ft, use z = 15 ft (minimum per ASCE 7-22 Table 26.10-1 note).
 *
 * Exposure category parameters (ASCE 7-22 Table 26.11-1):
 *   B: α = 7.0,  z_g = 1200 ft
 *   C: α = 9.5,  z_g = 900 ft
 *   D: α = 11.5, z_g = 700 ft
 *
 * @param {number} z_ft  – Height above ground (ft); minimum 15 ft applied
 * @param {'B'|'C'|'D'} exposure
 * @returns {number} K_z (dimensionless)
 */
export function calcKz(z_ft, exposure) {
  const params = {
    B: { alpha: 7.0,  zg: 1200 },
    C: { alpha: 9.5,  zg: 900  },
    D: { alpha: 11.5, zg: 700  },
  };
  const { alpha, zg } = params[exposure] || params['C'];
  const z = Math.max(z_ft, 15);  // ASCE 7-22 Table 26.10-1 minimum
  return 2.01 * Math.pow(z / zg, 2 / alpha);
}

// ---------------------------------------------------------------------------
// Velocity pressure q_z
// ---------------------------------------------------------------------------

/**
 * Velocity pressure at height z per ASCE 7-22 Eq. 26.10-1.
 *
 * @param {object} params
 * @param {number} params.V          – Basic wind speed (mph)
 * @param {number} params.z_ft       – Height above ground (ft)
 * @param {'B'|'C'|'D'} params.exposure
 * @param {number} [params.K_zt=1.0] – Topographic factor (1.0 flat, >1.0 hill/ridge)
 * @param {number} [params.K_e=1.0]  – Ground elevation factor (conservative = 1.0)
 * @returns {number} q_z in lbs/ft²
 */
export function calcVelocityPressure(params) {
  const { V, z_ft, exposure } = params;
  const K_zt = params.K_zt ?? 1.0;
  const K_e  = params.K_e  ?? 1.0;

  if (!Number.isFinite(V) || V <= 0) throw new Error('Basic wind speed V must be positive (mph)');
  if (!Number.isFinite(z_ft) || z_ft < 0) throw new Error('Height z must be non-negative (ft)');
  if (!['B', 'C', 'D'].includes(exposure)) throw new Error("Exposure must be 'B', 'C', or 'D'");

  const Kz = calcKz(z_ft, exposure);
  return 0.00256 * Kz * K_zt * K_e * V * V;
}

// ---------------------------------------------------------------------------
// Force coefficient C_f for cable trays
// ---------------------------------------------------------------------------

// Labels and normalizers are exported so UI pages can share the same
// assumptions used by the calculation engine.
export const TRAY_CONSTRUCTION_LABELS = {
  ladder: 'Ladder / open rung',
  ventilated: 'Ventilated / wire basket',
  'solid-bottom': 'Solid bottom',
};

export const COVER_CONDITION_LABELS = {
  none: 'No cover',
  ventilated: 'Ventilated cover',
  solid: 'Solid cover / hood',
};

export const FILL_LEVEL_LABELS = {
  empty: 'Empty',
  partial: 'Partially filled',
  full: 'Fully filled',
};

const BASE_FILL_CF = {
  empty: 1.3,
  partial: 1.6,
  full: 2.0,
};

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, '-');
}

export function normalizeFillLevel(value, fallback = 'partial') {
  const token = normalizeToken(value);
  if (token.includes('empty') || token === '0' || token === 'none') return 'empty';
  if (token.includes('full') || token.includes('filled') || token === '100') return 'full';
  if (token.includes('partial') || token.includes('partially')) return 'partial';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return 'empty';
    if (numeric >= 100) return 'full';
    return 'partial';
  }
  return Object.prototype.hasOwnProperty.call(FILL_LEVEL_LABELS, fallback) ? fallback : 'partial';
}

export function normalizeTrayConstruction(value, fallback = 'ladder') {
  const token = normalizeToken(value);
  if (token.includes('solid')) return 'solid-bottom';
  if (
    token.includes('wire') ||
    token.includes('basket') ||
    token.includes('vent') ||
    token.includes('mesh') ||
    token.includes('perforated') ||
    token.includes('trough')
  ) {
    return 'ventilated';
  }
  if (token.includes('ladder') || token.includes('rung') || token.includes('open')) return 'ladder';
  return Object.prototype.hasOwnProperty.call(TRAY_CONSTRUCTION_LABELS, fallback) ? fallback : 'ladder';
}

export function normalizeCoverCondition(value, fallback = 'none') {
  const token = normalizeToken(value);
  if (
    !token ||
    token === 'none' ||
    token === 'no' ||
    token === 'no-cover' ||
    token === 'uncovered' ||
    token === 'open'
  ) {
    return 'none';
  }
  if (token.includes('vent') || token.includes('louver') || token.includes('perforated')) return 'ventilated';
  if (token.includes('solid') || token.includes('hood') || token.includes('cover') || token === 'yes') return 'solid';
  return Object.prototype.hasOwnProperty.call(COVER_CONDITION_LABELS, fallback) ? fallback : 'none';
}

function optionalPositiveNumber(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

export function trayForceCf(fillLevel, options = {}) {
  return trayWindProfile({ ...options, fillLevel }).Cf;
}

export function trayWindProfile(params = {}) {
  const trayConstruction = normalizeTrayConstruction(
    params.trayConstruction ?? params.construction ?? params.trayType,
  );
  const fillLevel = normalizeFillLevel(params.fillLevel);
  const coverCondition = normalizeCoverCondition(params.coverCondition ?? params.cover);
  const override = optionalPositiveNumber(
    params.forceCoefficientOverride ?? params.CfOverride,
    'Force coefficient override',
  );

  let Cf = BASE_FILL_CF[fillLevel] ?? BASE_FILL_CF.partial;
  const basis = [FILL_LEVEL_LABELS[fillLevel]];

  if (trayConstruction === 'solid-bottom') {
    Cf = Math.max(Cf, 2.0);
    basis.push('solid-bottom tray');
  } else if (trayConstruction === 'ventilated') {
    basis.push('ventilated tray');
  } else {
    basis.push('open ladder tray');
  }

  if (coverCondition === 'solid') {
    Cf = Math.max(Cf, 2.0);
    basis.push('solid cover');
  } else if (coverCondition === 'ventilated') {
    Cf = Math.max(Cf, 1.6);
    basis.push('ventilated cover');
  } else {
    basis.push('no cover');
  }

  if (override !== null) {
    Cf = override;
    basis.push('engineer override');
  }

  return {
    Cf,
    trayConstruction,
    trayConstructionLabel: TRAY_CONSTRUCTION_LABELS[trayConstruction],
    fillLevel,
    fillLevelLabel: FILL_LEVEL_LABELS[fillLevel],
    coverCondition,
    coverConditionLabel: COVER_CONDITION_LABELS[coverCondition],
    forceCoefficientSource: basis.join(', '),
  };
}

// ---------------------------------------------------------------------------
// Design wind force on a cable tray span
// ---------------------------------------------------------------------------

/**
 * Calculate the design wind force on a cable tray span.
 *
 * @param {object} params
 * @param {number} params.V             – Basic wind speed (mph)
 * @param {number} params.z_ft          – Tray installation height above grade (ft)
 * @param {'B'|'C'|'D'} params.exposure – Terrain exposure category
 * @param {number} params.trayWidth_in  – Tray inside width (inches)
 * @param {number} params.spanLength_ft – Support span length (ft)
 * @param {'empty'|'partial'|'full'} params.fillLevel – Tray fill level
 * @param {'ladder'|'ventilated'|'solid-bottom'} [params.trayConstruction] – Tray construction
 * @param {'none'|'ventilated'|'solid'} [params.coverCondition] – Cover condition
 * @param {number} [params.forceCoefficientOverride] – Optional engineer-entered C_f
 * @param {number} [params.projectedAreaFactor=1.0] – Optional exposed-area multiplier
 * @param {number} [params.K_zt=1.0]   – Topographic factor
 * @param {number} [params.G=0.85]     – Gust factor (0.85 rigid per ASCE 7-22)
 * @returns {{
 *   Kz:              number,  // Velocity pressure exposure coefficient
 *   q_z_psf:         number,  // Velocity pressure (lbs/ft²)
 *   Cf:              number,  // Force coefficient
 *   G:               number,  // Gust factor
 *   baseProjectedArea_ft2: number, // Width x span before factor (ft²)
 *   projectedAreaFactor: number,
 *   projectedArea_ft2: number, // Tray projected area (ft²)
 *   windForce_lbs:   number,  // Total wind force per span (lbs)
 *   windForce_per_ft: number, // Wind force per linear foot of tray (lbs/ft)
 *   windPressure_psf: number, // Effective wind pressure on tray face (lbs/ft²)
 * }}
 */
export function calcWindForce(params) {
  const {
    V, z_ft, exposure, trayWidth_in, spanLength_ft,
  } = params;
  const G   = params.G   ?? 0.85;
  const windProfile = trayWindProfile(params);
  const Cf = windProfile.Cf;
  const projectedAreaFactor = optionalPositiveNumber(
    params.projectedAreaFactor ?? 1.0,
    'Projected area factor',
  ) ?? 1.0;

  if (!Number.isFinite(trayWidth_in) || trayWidth_in <= 0) {
    throw new Error('Tray width must be a positive number (inches)');
  }
  if (!Number.isFinite(spanLength_ft) || spanLength_ft <= 0) {
    throw new Error('Span length must be a positive number (ft)');
  }

  const trayWidth_ft = trayWidth_in / 12;
  const baseProjectedArea_ft2 = trayWidth_ft * spanLength_ft;
  const projectedArea_ft2 = baseProjectedArea_ft2 * projectedAreaFactor;

  const q_z_psf = calcVelocityPressure({ V, z_ft, exposure, K_zt: params.K_zt, K_e: params.K_e });
  const Kz      = calcKz(z_ft, exposure);

  const windForce_lbs    = q_z_psf * G * Cf * projectedArea_ft2;
  const windForce_per_ft = windForce_lbs / spanLength_ft;
  const windPressure_psf = q_z_psf * G * Cf;

  return {
    Kz:               Math.round(Kz * 10000) / 10000,
    q_z_psf:          Math.round(q_z_psf * 100) / 100,
    Cf,
    G,
    ...windProfile,
    baseProjectedArea_ft2: Math.round(baseProjectedArea_ft2 * 100) / 100,
    projectedAreaFactor,
    projectedArea_ft2: Math.round(projectedArea_ft2 * 100) / 100,
    windForce_lbs:    Math.round(windForce_lbs * 10) / 10,
    windForce_per_ft: Math.round(windForce_per_ft * 10) / 10,
    windPressure_psf: Math.round(windPressure_psf * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// NEMA load class capacity check
// ---------------------------------------------------------------------------

/**
 * NEMA VE 1-2017 cable tray load classes and their approximate safe uniform
 * distributed loads (lbs per linear foot of tray).
 *
 * These are approximate values; actual capacity depends on tray width, span,
 * and manufacturer. Use manufacturer load tables for design.
 *
 * Load class definitions (NEMA VE 1-2017 Table 1):
 *   8A  = 50 lbs/ft   at 8 ft span
 *   8B  = 75 lbs/ft   at 8 ft span
 *   8C  = 100 lbs/ft  at 8 ft span
 *   12A = 50 lbs/ft   at 12 ft span
 *   12B = 75 lbs/ft   at 12 ft span
 *   12C = 100 lbs/ft  at 12 ft span
 *   16A = 50 lbs/ft   at 16 ft span
 *   16B = 75 lbs/ft   at 16 ft span
 *   16C = 100 lbs/ft  at 16 ft span
 *   20A = 50 lbs/ft   at 20 ft span
 *   20B = 75 lbs/ft   at 20 ft span
 *   20C = 100 lbs/ft  at 20 ft span
 */
export const NEMA_LOAD_CLASSES = {
  '8A':  { designLoad_lbs_ft: 50,  referenceSpan_ft: 8  },
  '8B':  { designLoad_lbs_ft: 75,  referenceSpan_ft: 8  },
  '8C':  { designLoad_lbs_ft: 100, referenceSpan_ft: 8  },
  '12A': { designLoad_lbs_ft: 50,  referenceSpan_ft: 12 },
  '12B': { designLoad_lbs_ft: 75,  referenceSpan_ft: 12 },
  '12C': { designLoad_lbs_ft: 100, referenceSpan_ft: 12 },
  '16A': { designLoad_lbs_ft: 50,  referenceSpan_ft: 16 },
  '16B': { designLoad_lbs_ft: 75,  referenceSpan_ft: 16 },
  '16C': { designLoad_lbs_ft: 100, referenceSpan_ft: 16 },
  '20A': { designLoad_lbs_ft: 50,  referenceSpan_ft: 20 },
  '20B': { designLoad_lbs_ft: 75,  referenceSpan_ft: 20 },
  '20C': { designLoad_lbs_ft: 100, referenceSpan_ft: 20 },
};

/**
 * Check whether the total load (cable weight + wind) stays within the
 * NEMA load class capacity. Wind load acts laterally but for a simplified
 * combined check the horizontal and vertical loads are compared to capacity.
 *
 * @param {object} params
 * @param {number} params.cableWeight_lbs_ft – Vertical cable load (lbs/ft)
 * @param {number} params.windForce_per_ft   – Lateral wind force (lbs/ft)
 * @param {string} params.nemaClass          – NEMA load class (e.g. '12B')
 * @param {number} params.spanLength_ft
 * @returns {{
 *   verticalCapacity_lbs_ft: number,
 *   verticalLoad_lbs_ft:     number,
 *   lateralLoad_lbs_ft:      number,
 *   verticalUtilization:     number,  // 0..1+ (>1 = over capacity)
 *   overCapacity:            boolean,
 *   note:                    string,
 * }}
 */
export function checkNemaCapacity(params) {
  const { cableWeight_lbs_ft, windForce_per_ft, nemaClass, spanLength_ft } = params;
  const cls = NEMA_LOAD_CLASSES[nemaClass];
  if (!cls) {
    return {
      verticalCapacity_lbs_ft: null,
      verticalLoad_lbs_ft: cableWeight_lbs_ft,
      lateralLoad_lbs_ft: windForce_per_ft,
      verticalUtilization: null,
      overCapacity: false,
      note: `Unknown NEMA class '${nemaClass}'. Verify capacity with manufacturer data.`,
    };
  }

  // With the L/100 deflection limit, wL³ is constant. Normalize the class
  // working load from its reference span to the entered span.
  const spanRatio = cls.referenceSpan_ft / spanLength_ft;
  const scaledCapacity = cls.designLoad_lbs_ft * Math.pow(spanRatio, 3);
  const utilization = cableWeight_lbs_ft / scaledCapacity;

  return {
    verticalCapacity_lbs_ft: Math.round(scaledCapacity * 10) / 10,
    verticalLoad_lbs_ft:     Math.round(cableWeight_lbs_ft * 10) / 10,
    lateralLoad_lbs_ft:      Math.round(windForce_per_ft * 10) / 10,
    verticalUtilization:     Math.round(utilization * 1000) / 1000,
    overCapacity:            utilization > 1.0,
    note: utilization > 1.0
      ? `Vertical load exceeds NEMA ${nemaClass} capacity at ${spanLength_ft} ft span. ` +
        `Reduce span or upgrade tray class.`
      : `Vertical load is within NEMA ${nemaClass} capacity (${(utilization * 100).toFixed(1)}% utilized).`,
  };
}
