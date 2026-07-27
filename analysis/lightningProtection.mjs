/**
 * Lightning & Surge Protection Coordination (Gap #86)
 *
 * Screening-level lightning protection informed by IEC 62305:2024
 * (structural LPS) and IEEE 998-2026 (substation shielding), plus
 * medium/high-voltage surge-arrester screening per IEEE C62.22 /
 * IEC 60099-5:2018.
 *
 * Workflow:
 *   1. Lightning ground strike-point density from a direct value or a legacy
 *      keraunic-level screening estimate.
 *   2. Equivalent collection area Ad of the structure (screening geometry).
 *   3. Expected direct strikes Nd = Ng · Ad · Cd · 1e-6  (per year).
 *   4. Required Lightning Protection Level (LPL) from the protection-efficiency
 *      table (IEC 61024-1 / 62305): E = 1 − Nc/Nd.
 *   5. Rolling-sphere radius for the LPL and single-mast protective radius
 *      (electrogeometric model, IEEE 998 / IEC 62305-3:2024 Annex D).
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

/** Screening location factor Cd retained from the legacy simplified method. */
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

/** IEEE C62.22 / IEC 60099-5 arrester screening is not for low-voltage SPDs. */
export const MIN_ARRESTER_SYSTEM_KV = 1;

export const STRUCTURE_SHAPES = Object.freeze({
  rectangle: 'Rectangular',
  circle: 'Circular / cylindrical',
  custom: 'Custom footprint',
});

// ---------------------------------------------------------------------------
// Ground flash density and collection area
// ---------------------------------------------------------------------------

/**
 * Legacy screening estimate of ground flash density from keraunic level.
 * Prefer a directly supplied lightning ground strike-point density for
 * IEC 62305-2:2024 work.
 * @param {number} thunderstormDays - Td (days/yr)
 * @returns {number} Ng (flashes/km²/yr)
 */
export function groundFlashDensity(thunderstormDays) {
  if (!(thunderstormDays > 0)) return 0;
  return 0.04 * Math.pow(thunderstormDays, 1.25);
}

/**
 * Equivalent collection area of an isolated rectangular structure for this
 * screening: Ad = L·W + 2·(3H)(L+W) + π·(3H)²  (m²).
 * @param {number} length - L (m)
 * @param {number} width - W (m)
 * @param {number} height - H (m)
 * @returns {number} Collection area (m²)
 */
export function collectionArea(length, width, height) {
  const L = length, W = width, H = height;
  return collectionAreaFromFootprint(L * W, 2 * (L + W), H);
}

/**
 * Equivalent collection area from a plan footprint and its perimeter.
 * This is the area of the footprint expanded horizontally by 3H:
 * Ad = Af + (3H)P + pi(3H)^2.
 * @param {number} footprintAreaM2 - Plan area Af (m2)
 * @param {number} perimeterM - Plan perimeter P (m)
 * @param {number} heightM - Structure height H (m)
 * @returns {number} Collection area (m2)
 */
export function collectionAreaFromFootprint(footprintAreaM2, perimeterM, heightM) {
  return footprintAreaM2 + 3 * heightM * perimeterM + Math.PI * Math.pow(3 * heightM, 2);
}

/**
 * Resolve the plan geometry used by collection-area, down-conductor, and
 * centered single-mast coverage checks.
 * @param {Object} config
 * @returns {{shape:string,label:string,areaM2:number,perimeterM:number,spanXM:number,spanYM:number,requiredCoverageRadiusM:number}}
 */
export function resolveFootprintGeometry(config = {}) {
  const shape = Object.hasOwn(STRUCTURE_SHAPES, config.structureShape)
    ? config.structureShape
    : 'rectangle';

  if (shape === 'circle') {
    const diameter = Number(config.diameter);
    if (!(diameter > 0)) {
      throw new Error('Enter a positive structure diameter.');
    }
    const radius = diameter / 2;
    return {
      shape,
      label: STRUCTURE_SHAPES[shape],
      areaM2: Math.PI * radius * radius,
      perimeterM: Math.PI * diameter,
      spanXM: diameter,
      spanYM: diameter,
      requiredCoverageRadiusM: radius,
    };
  }

  if (shape === 'custom') {
    const areaM2 = Number(config.footprintArea);
    const perimeterM = Number(config.footprintPerimeter);
    const requiredCoverageRadiusM = Number(config.farthestPointRadius);
    if (!(areaM2 > 0) || !(perimeterM > 0)) {
      throw new Error('Enter a positive custom footprint area and perimeter.');
    }
    const maximumAreaForPerimeter = perimeterM * perimeterM / (4 * Math.PI);
    if (areaM2 > maximumAreaForPerimeter * 1.001) {
      throw new Error('Custom footprint area is too large for the entered perimeter.');
    }
    const equivalentRadius = Math.sqrt(areaM2 / Math.PI);
    if (!(requiredCoverageRadiusM >= equivalentRadius)) {
      throw new Error('Farthest protected point is too small for the entered footprint area.');
    }
    return {
      shape,
      label: STRUCTURE_SHAPES[shape],
      areaM2,
      perimeterM,
      spanXM: requiredCoverageRadiusM * 2,
      spanYM: requiredCoverageRadiusM * 2,
      requiredCoverageRadiusM,
    };
  }

  const length = Number(config.length);
  const width = Number(config.width);
  if (!(length > 0) || !(width > 0)) {
    throw new Error('Enter positive structure length and width.');
  }
  return {
    shape,
    label: STRUCTURE_SHAPES[shape],
    areaM2: length * width,
    perimeterM: 2 * (length + width),
    spanXM: length,
    spanYM: width,
    requiredCoverageRadiusM: Math.hypot(length / 2, width / 2),
  };
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
 * Recommend the least-restrictive LPL whose declared interception probability
 * meets the required screening efficiency E = 1 − Nc/Nd.
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
  const level = ['IV', 'III', 'II', 'I']
    .find(key => LPL_TABLE[key].interception >= efficiency) || 'I';
  const capability = LPL_TABLE[level].interception;
  const note = efficiency > capability
    ? `LPL ${level} alone does not meet the ${Math.round(efficiency * 1000) / 10}% required efficiency; add risk-reduction measures.`
    : `LPL ${level} meets the screening efficiency requirement.`;
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
 * by the rolling-sphere method (IEEE 998 / IEC 62305-3:2024 Annex D):
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
  if (!(systemKvLL > 0)) {
    throw new Error('System voltage must be positive.');
  }
  if (systemKvLL <= MIN_ARRESTER_SYSTEM_KV) {
    return {
      applicable: false,
      scope: 'low-voltage',
      mcov: null,
      ratedRequired: null,
      ratedStandard: null,
      note: 'Use a low-voltage SPD selection workflow; IEEE C62.22 and IEC 60099-5 arrester screening applies above 1 kV.',
    };
  }
  const mcov = arresterMCOV(systemKvLL, grounding);
  const ratedRequired = mcov / 0.8;
  const ratedStandard = STANDARD_ARRESTER_KV.find(v => v >= ratedRequired) ?? null;
  return {
    applicable: true,
    scope: 'medium-high-voltage',
    mcov,
    ratedRequired,
    ratedStandard,
    note: 'Preliminary rating only; verify maximum system voltage, temporary overvoltage duty, insulation coordination, and manufacturer data.',
  };
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the lightning & surge protection screening study.
 *
 * @param {Object} config
 * @param {'rectangle'|'circle'|'custom'} [config.structureShape='rectangle'].
 * @param {number} [config.thunderstormDays] - Keraunic level Td (days/yr).
 * @param {number} [config.groundFlashDensity] - Ng directly (overrides Td).
 * @param {number} [config.length] - Rectangular structure length L (m).
 * @param {number} [config.width] - Rectangular structure width W (m).
 * @param {number} [config.diameter] - Circular structure diameter (m).
 * @param {number} [config.footprintArea] - Custom plan area (m2).
 * @param {number} [config.footprintPerimeter] - Custom plan perimeter (m).
 * @param {number} [config.farthestPointRadius] - Custom farthest protected plan point from the centered mast (m).
 * @param {number} config.height - Structure height H (m).
 * @param {string} [config.location='isolated'] - Location factor key.
 * @param {number} [config.tolerableFrequency=DEFAULT_NC] - Nc (per year).
 * @param {number} [config.protectedHeight=0] - Equipment height to protect (m).
 * @param {number} [config.airTerminalHeight=config.height] - Mast or air-terminal tip height above grade (m).
 * @param {string} [config.downConductorMaterial='copper'].
 * @param {number} [config.systemKvLL] - Surge-arrester system voltage (kV), optional.
 * @param {'solid'|'ungrounded'} [config.grounding='solid'].
 * @returns {LightningResult}
 */
export function runLightningProtection(config = {}) {
  const H = Number(config.height);
  if (!(H > 0)) {
    throw new Error('Enter a positive structure height.');
  }
  const footprint = resolveFootprintGeometry(config);
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

  const area = collectionAreaFromFootprint(footprint.areaM2, footprint.perimeterM, H);
  const nd = expectedStrikes(ng, area, cd);
  const lpl = recommendLPL(nd, nc);

  const level = lpl.required ? LPL_TABLE[lpl.level] : null;
  const protectedHeight = Number.isFinite(config.protectedHeight) ? config.protectedHeight : 0;
  const airTerminalHeight = Number.isFinite(config.airTerminalHeight) ? Number(config.airTerminalHeight) : H;
  if (!(airTerminalHeight > 0)) {
    throw new Error('Enter a positive mast or air-terminal tip height.');
  }
  if (airTerminalHeight < H) {
    throw new Error('Mast or air-terminal tip height must be at least the structure height.');
  }
  const mastProtectiveRadius = level
    ? singleMastRadius(airTerminalHeight, protectedHeight, level.radius)
    : null;
  const coverageMargin = level
    ? mastProtectiveRadius - footprint.requiredCoverageRadiusM
    : null;
  const coverageComplete = level
    ? coverageMargin >= 0
    : null;
  const minStrikeCurrent = level ? level.iMin : null;
  const minStrikeDistance = level ? strikingDistance(minStrikeCurrent) : null;

  // Down-conductors
  const perimeter = footprint.perimeterM;
  const downCount = level ? downConductorCount(perimeter, level.downSpacing) : 0;
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
    warnings.push('The entered mast or air-terminal tip height does not protect equipment at the specified height — add taller masts or overhead shield wires.');
  } else if (lpl.required && !coverageComplete) {
    warnings.push(`A centered single mast reaches ${mastProtectiveRadius.toFixed(2)} m at the protected height, short of the ${footprint.requiredCoverageRadiusM.toFixed(2)} m farthest footprint point — use a taller or multi-terminal arrangement.`);
  }
  if (lpl.efficiency > 0.99) {
    warnings.push('Required protection efficiency exceeds 0.99 — combine LPL I air termination with surge protective devices and equipotential bonding.');
  }
  if (arrester && !arrester.applicable) {
    warnings.push(arrester.note);
  } else if (arrester && arrester.ratedStandard == null) {
    warnings.push('System voltage exceeds the standard arrester table — consult the manufacturer for a custom rating.');
  }
  if (footprint.shape === 'custom') {
    warnings.push('Custom-footprint collection area uses the entered plan area and perimeter; the plan outline is schematic and must be checked against survey geometry.');
  }

  return {
    inputs: {
      thunderstormDays: Number.isFinite(config.thunderstormDays) ? Number(config.thunderstormDays) : undefined,
      groundFlashDensity: Number.isFinite(config.groundFlashDensity) ? Number(config.groundFlashDensity) : undefined,
      structureShape: footprint.shape,
      length: footprint.shape === 'rectangle' ? Number(config.length) : undefined,
      width: footprint.shape === 'rectangle' ? Number(config.width) : undefined,
      diameter: footprint.shape === 'circle' ? Number(config.diameter) : undefined,
      footprintArea: footprint.shape === 'custom' ? footprint.areaM2 : undefined,
      footprintPerimeter: footprint.shape === 'custom' ? footprint.perimeterM : undefined,
      farthestPointRadius: footprint.shape === 'custom' ? footprint.requiredCoverageRadiusM : undefined,
      height: H,
      location: config.location || 'isolated',
      tolerableFrequency: nc,
      protectedHeight,
      airTerminalHeight,
      downConductorMaterial: material,
      systemKvLL: config.systemKvLL,
      grounding: config.grounding,
    },
    groundFlashDensity: ng,
    locationFactor: cd,
    footprint,
    footprintAreaM2: footprint.areaM2,
    collectionAreaM2: area,
    expectedStrikesPerYear: nd,
    tolerableFrequency: nc,
    lpl,
    rollingSphereRadius: level?.radius ?? null,
    minStrikeCurrentKa: minStrikeCurrent,
    minStrikeDistanceM: minStrikeDistance,
    mastProtectiveRadiusM: mastProtectiveRadius,
    requiredCoverageRadiusM: footprint.requiredCoverageRadiusM,
    coverageMarginM: coverageMargin,
    coverageComplete,
    perimeterM: perimeter,
    downConductorCount: downCount,
    downConductorMaterial: material,
    downConductorMinAreaMm2: downMinArea,
    arrester,
    warnings,
  };
}
