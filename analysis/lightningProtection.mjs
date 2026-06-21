/**
 * Lightning & Surge Protection Coordination (Gap #86)
 *
 * Screening-level lightning protection per IEC 62305 (structural LPS) and
 * IEEE 998 (substation shielding), plus surge-arrester MCOV selection per
 * IEEE C62.22 / IEC 60099-5.
 *
 * Workflow:
 *   1. Ground flash density Ng from keraunic level (thunderstorm days) or direct.
 *   2. Equivalent collection area Ad of the structure (IEC 62305-2 Annex A).
 *   3. Expected direct strikes Nd = Ng · Ad · Cd · 1e-6  (per year).
 *   4. Required Lightning Protection Level (LPL) from the protection-efficiency
 *      table (IEC 61024-1 / 62305): E = 1 − Nc/Nd.
 *   5. Rolling-sphere radius for the LPL and single-mast protective radius
 *      (electrogeometric model, IEEE 998 / IEC 62305-3 Annex A).
 *   6. Down-conductor count and minimum cross-section (IEC 62305-3).
 *   7. Surge-arrester continuous operating voltage (MCOV) and rated voltage.
 *
 * Units: metres, kA, kV, m²; areas in m², frequencies per year.
 *
 * References:
 *   IEC 62305-1/-2/-3 — Protection against lightning.
 *   IEEE Std 998 — Guide for Direct Lightning Stroke Shielding of Substations.
 *   IEEE Std C62.22 / IEC 60099-5 — Application of surge arresters.
 */

/** Tolerable risk default — acceptable strike frequency Nc (per year). */
export const DEFAULT_NC = 1e-3;

/**
 * Lightning Protection Levels (IEC 62305). Rolling-sphere radius (m),
 * minimum peak current captured Imin (kA), down-conductor spacing (m),
 * and the interception probability of the rolling sphere.
 */
export const LPL_TABLE = {
  I:   { label: 'I',   radius: 20, iMin: 3,  downSpacing: 10, interception: 0.99 },
  II:  { label: 'II',  radius: 30, iMin: 5,  downSpacing: 10, interception: 0.97 },
  III: { label: 'III', radius: 45, iMin: 10, downSpacing: 15, interception: 0.91 },
  IV:  { label: 'IV',  radius: 60, iMin: 16, downSpacing: 20, interception: 0.84 },
};

/** Minimum down-conductor cross-section by material (mm²), IEC 62305-3 Table 6. */
export const DOWN_CONDUCTOR_MIN_MM2 = { copper: 16, aluminum: 25, steel: 50 };

/** Location factor Cd (IEC 62305-2 Table A.1). */
export const LOCATION_FACTORS = {
  surroundedTaller: 0.25,  // object surrounded by taller objects
  surroundedEqual: 0.5,    // surrounded by equal/shorter objects
  isolated: 1.0,           // isolated, no nearby objects
  hilltop: 2.0,            // isolated on a hilltop or knoll
};

/** Standard surge-arrester duty-cycle voltage ratings (kV rms). */
export const STANDARD_ARRESTER_KV = [
  3, 6, 9, 10, 12, 15, 18, 21, 24, 27, 30, 36, 39, 45, 48, 54, 60, 72, 90, 96,
  108, 120, 144, 168, 180, 192, 228, 240, 258, 276, 294, 312, 396, 420, 444, 468, 540, 576,
];

// ---------------------------------------------------------------------------
// Ground flash density and collection area
// ---------------------------------------------------------------------------

/**
 * Ground flash density Ng from keraunic level (thunderstorm-days per year).
 * IEEE 998 / IEC 62305: Ng ≈ 0.04 · Td^1.25  (flashes/km²/yr).
 * @param {number} thunderstormDays - Td (days/yr)
 * @returns {number} Ng (flashes/km²/yr)
 */
export function groundFlashDensity(thunderstormDays) {
  if (!(thunderstormDays > 0)) return 0;
  return 0.04 * Math.pow(thunderstormDays, 1.25);
}

/**
 * Equivalent collection area of an isolated rectangular structure
 * (IEC 62305-2 Annex A): Ad = L·W + 2·(3H)(L+W) + π·(3H)²  (m²).
 * @param {number} length - L (m)
 * @param {number} width - W (m)
 * @param {number} height - H (m)
 * @returns {number} Collection area (m²)
 */
export function collectionArea(length, width, height) {
  const L = length, W = width, H = height;
  return L * W + 2 * (3 * H) * (L + W) + Math.PI * Math.pow(3 * H, 2);
}

/**
 * Expected number of direct strikes to the structure per year.
 * Nd = Ng · Ad · Cd · 1e-6  (Ng per km²; Ad in m² → 1e-6 converts m²→km²).
 * @param {number} ng - Ground flash density (per km²/yr)
 * @param {number} areaM2 - Collection area (m²)
 * @param {number} [cd=1] - Location factor
 * @returns {number} Strikes per year
 */
export function expectedStrikes(ng, areaM2, cd = 1) {
  return ng * areaM2 * cd * 1e-6;
}

// ---------------------------------------------------------------------------
// Protection level selection
// ---------------------------------------------------------------------------

/**
 * Recommend an LPL from the protection-efficiency table (IEC 61024-1 / 62305):
 * required efficiency E = 1 − Nc/Nd, mapped to a class.
 *   E > 0.98 → I, > 0.95 → II, > 0.90 → III, > 0.80 → IV, else none required.
 *
 * @param {number} nd - Expected strikes per year
 * @param {number} [nc=DEFAULT_NC] - Tolerable strike frequency per year
 * @returns {{required:boolean, efficiency:number, level:(string|null), note:string}}
 */
export function recommendLPL(nd, nc = DEFAULT_NC) {
  if (!(nd > nc)) {
    return { required: false, efficiency: 0, level: null, note: 'Nd ≤ Nc — a dedicated LPS is not required (verify bonding and SPDs).' };
  }
  const efficiency = 1 - nc / nd;
  let level, note;
  if (efficiency > 0.98) { level = 'I'; note = efficiency > 0.99 ? 'LPL I with additional risk-reduction measures may be needed (E > 0.99).' : 'LPL I required.'; }
  else if (efficiency > 0.95) { level = 'II'; note = 'LPL II required.'; }
  else if (efficiency > 0.90) { level = 'III'; note = 'LPL III required.'; }
  else if (efficiency > 0.80) { level = 'IV'; note = 'LPL IV required.'; }
  else { level = 'IV'; note = 'LPL IV is sufficient (low required efficiency).'; }
  return { required: true, efficiency, level, note };
}

// ---------------------------------------------------------------------------
// Rolling sphere / electrogeometric model
// ---------------------------------------------------------------------------

/**
 * Striking distance for a given peak current (IEEE 998): r = 10·I^0.65 (m).
 * @param {number} currentKa - Peak stroke current (kA)
 * @returns {number} Striking distance (m)
 */
export function strikingDistance(currentKa) {
  return 10 * Math.pow(currentKa, 0.65);
}

/**
 * Protective radius of a single vertical mast at a protected-object height,
 * by the rolling-sphere method (IEEE 998 / IEC 62305-3 Annex A):
 *   rp = √(h(2R − h)) − √(hx(2R − hx)),  with h, hx ≤ R.
 * Heights above R are capped at R (no additional protection from a sphere
 * that rolls under the tip).
 *
 * @param {number} mastHeight - Mast/air-terminal height h (m)
 * @param {number} protectedHeight - Protected object height hx (m)
 * @param {number} sphereRadius - Rolling-sphere radius R (m)
 * @returns {number} Protective radius at the object height (m), ≥ 0
 */
export function singleMastRadius(mastHeight, protectedHeight, sphereRadius) {
  const R = sphereRadius;
  const h = Math.min(mastHeight, R);
  const hx = Math.min(Math.max(protectedHeight, 0), R);
  if (hx >= h) return 0;
  const rp = Math.sqrt(h * (2 * R - h)) - Math.sqrt(hx * (2 * R - hx));
  return Math.max(0, rp);
}

// ---------------------------------------------------------------------------
// Down-conductors
// ---------------------------------------------------------------------------

/**
 * Number of down-conductors around a structure perimeter (IEC 62305-3),
 * minimum two, spaced no further apart than the class spacing.
 * @param {number} perimeterM - Structure perimeter (m)
 * @param {number} spacingM - Maximum down-conductor spacing for the class (m)
 * @returns {number}
 */
export function downConductorCount(perimeterM, spacingM) {
  if (!(perimeterM > 0) || !(spacingM > 0)) return 2;
  return Math.max(2, Math.ceil(perimeterM / spacingM));
}

// ---------------------------------------------------------------------------
// Surge arrester selection
// ---------------------------------------------------------------------------

/**
 * Minimum arrester continuous operating voltage (MCOV / Uc) for a system,
 * IEEE C62.22 / IEC 60099-5.
 *   Effectively/solidly grounded: Uc ≥ 1.05 · VLL / √3
 *   Ungrounded / resonant-grounded: Uc ≥ 1.05 · VLL
 * @param {number} systemKvLL - Nominal system line-to-line voltage (kV)
 * @param {'solid'|'ungrounded'} grounding
 * @returns {number} Minimum MCOV (kV)
 */
export function arresterMCOV(systemKvLL, grounding) {
  const factor = grounding === 'ungrounded' ? 1.0 : 1 / Math.sqrt(3);
  return 1.05 * systemKvLL * factor;
}

/**
 * Recommend a standard arrester duty-cycle rating for a system.
 * Rated voltage Ur ≈ MCOV / 0.8; the nearest standard rating ≥ Ur is chosen.
 * @param {number} systemKvLL - Nominal system L-L voltage (kV)
 * @param {'solid'|'ungrounded'} grounding
 * @returns {{mcov:number, ratedRequired:number, ratedStandard:(number|null)}}
 */
export function recommendArrester(systemKvLL, grounding) {
  const mcov = arresterMCOV(systemKvLL, grounding);
  const ratedRequired = mcov / 0.8;
  const ratedStandard = STANDARD_ARRESTER_KV.find(v => v >= ratedRequired) ?? null;
  return { mcov, ratedRequired, ratedStandard };
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the lightning & surge protection screening study.
 *
 * @param {Object} config
 * @param {number} [config.thunderstormDays] - Keraunic level Td (days/yr).
 * @param {number} [config.groundFlashDensity] - Ng directly (overrides Td).
 * @param {number} config.length - Structure length L (m).
 * @param {number} config.width - Structure width W (m).
 * @param {number} config.height - Structure height H (m).
 * @param {string} [config.location='isolated'] - Location factor key.
 * @param {number} [config.tolerableFrequency=DEFAULT_NC] - Nc (per year).
 * @param {number} [config.protectedHeight=0] - Equipment height to protect (m).
 * @param {string} [config.downConductorMaterial='copper'].
 * @param {number} [config.systemKvLL] - Surge-arrester system voltage (kV), optional.
 * @param {'solid'|'ungrounded'} [config.grounding='solid'].
 * @returns {LightningResult}
 */
export function runLightningProtection(config = {}) {
  const L = Number(config.length), W = Number(config.width), H = Number(config.height);
  if (!(L > 0) || !(W > 0) || !(H > 0)) {
    throw new Error('Enter positive structure length, width, and height.');
  }
  const ng = Number.isFinite(config.groundFlashDensity) && config.groundFlashDensity > 0
    ? config.groundFlashDensity
    : groundFlashDensity(Number(config.thunderstormDays));
  if (!(ng > 0)) {
    throw new Error('Provide a positive ground flash density or thunderstorm-day count.');
  }
  const cd = LOCATION_FACTORS[config.location] ?? LOCATION_FACTORS.isolated;
  const nc = Number.isFinite(config.tolerableFrequency) && config.tolerableFrequency > 0
    ? config.tolerableFrequency
    : DEFAULT_NC;

  const area = collectionArea(L, W, H);
  const nd = expectedStrikes(ng, area, cd);
  const lpl = recommendLPL(nd, nc);

  // Geometry for the recommended (or LPL III default) level.
  const levelKey = lpl.level || 'III';
  const level = LPL_TABLE[levelKey];
  const protectedHeight = Number.isFinite(config.protectedHeight) ? config.protectedHeight : 0;
  const mastProtectiveRadius = singleMastRadius(H, protectedHeight, level.radius);
  const minStrikeCurrent = level.iMin;
  const minStrikeDistance = strikingDistance(minStrikeCurrent);

  // Down-conductors
  const perimeter = 2 * (L + W);
  const downCount = downConductorCount(perimeter, level.downSpacing);
  const material = DOWN_CONDUCTOR_MIN_MM2[config.downConductorMaterial] ? config.downConductorMaterial : 'copper';
  const downMinArea = DOWN_CONDUCTOR_MIN_MM2[material];

  // Surge arrester (optional)
  let arrester = null;
  if (Number.isFinite(config.systemKvLL) && config.systemKvLL > 0) {
    arrester = recommendArrester(config.systemKvLL, config.grounding === 'ungrounded' ? 'ungrounded' : 'solid');
    arrester.systemKvLL = config.systemKvLL;
    arrester.grounding = config.grounding === 'ungrounded' ? 'ungrounded' : 'solid';
  }

  const warnings = [];
  if (lpl.required) {
    warnings.push(`Direct strikes Nd = ${nd.toExponential(2)}/yr exceed the tolerable ${nc.toExponential(2)}/yr — install an LPS class ${lpl.level} (${lpl.note}).`);
  }
  if (lpl.required && mastProtectiveRadius <= 0) {
    warnings.push('A single mast at the structure height does not protect equipment at the specified height — add taller masts or overhead shield wires.');
  }
  if (lpl.efficiency > 0.99) {
    warnings.push('Required protection efficiency exceeds 0.99 — combine LPL I air termination with surge protective devices and equipotential bonding.');
  }
  if (arrester && arrester.ratedStandard == null) {
    warnings.push('System voltage exceeds the standard arrester table — consult the manufacturer for a custom rating.');
  }

  return {
    inputs: { length: L, width: W, height: H, location: config.location || 'isolated', tolerableFrequency: nc, protectedHeight, downConductorMaterial: material, systemKvLL: config.systemKvLL, grounding: config.grounding },
    groundFlashDensity: ng,
    locationFactor: cd,
    collectionAreaM2: area,
    expectedStrikesPerYear: nd,
    tolerableFrequency: nc,
    lpl,
    rollingSphereRadius: level.radius,
    minStrikeCurrentKa: minStrikeCurrent,
    minStrikeDistanceM: minStrikeDistance,
    mastProtectiveRadiusM: mastProtectiveRadius,
    perimeterM: perimeter,
    downConductorCount: downCount,
    downConductorMaterial: material,
    downConductorMinAreaMm2: downMinArea,
    arrester,
    warnings,
  };
}
