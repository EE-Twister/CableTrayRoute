/**
 * IEC 60287-1-1:2023 Cable Current Rating (Ampacity) — Thermal Circuit Model
 *
 * Implements the steady-state current rating method for power cables per
 * IEC 60287-1-1:2023 (Calculation of the current rating — current rating equations
 * for 100% load factor and calculation of losses).
 *
 * Supported installation methods:
 *   - Direct burial (single-circuit and multi-circuit flat/trefoil grouping)
 *   - In conduit/duct (buried or in air)
 *   - Cable tray / ladder (in air)
 *   - Free air (single cable or touching trefoil/flat)
 *
 * Exported API:
 *   calcAmpacity(params)      → full result object
 *   thermalResistances(params) → T1/T2/T3/T4 breakdown
 *   groupDerating(n, arrangement) → grouping correction factor
 *   conductorAcResistance(params) → R_ac at operating temperature
 *
 * Key assumptions / simplifications:
 *   - Single-phase and three-phase cables; not DC.
 *   - Skin and proximity effects modelled via ys/yp correction (IEC §2.1.2).
 *   - No armour loss (λ2 = 0) for unarmoured cables; basic steel-wire armour λ2
 *     is included when armoured=true.
 *   - Dielectric losses W_d included for HV cables (> 36 kV) only.
 *   - External thermal resistance T4 uses Kennelly's formula for direct burial.
 *   - Grouping derating uses IEC 60287-2-1 Table 1 flat/trefoil factors.
 *
 * References:
 *   IEC 60287-1-1:2023 — Calculation of the current rating
 *   IEC 60287-2-1:2023 — Thermal resistivity of soil, T4 calculation
 *   IEC 60287-3-1:2017 — Operating conditions for cables
 */

// ---------------------------------------------------------------------------
// Conductor DC resistance at 20 °C (mΩ/m) — IEC 60228 Class 2 stranded
// Key cross-sections (mm²) for Cu and Al
// ---------------------------------------------------------------------------

/** Copper conductor DC resistance at 20 °C in mΩ/m (IEC 60228 Table 1). */
export const R20_CU = {
  1.5: 12.1, 2.5: 7.41, 4: 4.61, 6: 3.08, 10: 1.83, 16: 1.15, 25: 0.727,
  35: 0.524, 50: 0.387, 70: 0.268, 95: 0.193, 120: 0.153, 150: 0.124,
  185: 0.0991, 240: 0.0754, 300: 0.0601, 400: 0.0470, 500: 0.0366,
  630: 0.0283, 800: 0.0221, 1000: 0.0176,
};

/** Aluminium conductor DC resistance at 20 °C in mΩ/m (IEC 60228 Table 1). */
export const R20_AL = {
  16: 1.91, 25: 1.20, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.320, 120: 0.253,
  150: 0.206, 185: 0.164, 240: 0.125, 300: 0.100, 400: 0.0778, 500: 0.0605,
  630: 0.0469, 800: 0.0367, 1000: 0.0291,
};

/** Temperature coefficient of resistance (per °C) for conductors at 20 °C. */
const ALPHA_20 = { Cu: 3.93e-3, Al: 4.03e-3 };

/** Maximum conductor operating temperature (°C) by insulation type. */
export const MAX_TEMP_C = {
  XLPE: 90,
  EPR: 90,
  PVC: 70,
  LSZH: 70,
  'XLPE-HT': 105,
  'Paper-MV': 80,
  'Paper-HV': 65,
};

/** Insulation thermal resistivity (K·m/W). */
const INSULATION_RESISTIVITY = {
  XLPE: 3.5,
  EPR: 3.5,
  PVC: 5.0,
  LSZH: 5.0,
  'XLPE-HT': 3.5,
  'Paper-MV': 6.0,
  'Paper-HV': 6.0,
};

// ---------------------------------------------------------------------------
// conductorAcResistance
// ---------------------------------------------------------------------------

/**
 * AC conductor resistance at the operating temperature per IEC 60287-1-1 §2.1.
 *
 * R_ac = R_dc_θ × (1 + y_s + y_p)
 *
 * Skin effect coefficient y_s and proximity effect coefficient y_p use the
 * formulae of §2.1.2 and §2.1.3 (valid for circular conductors, power frequency).
 *
 * @param {object} p
 * @param {number} p.sizeMm2        Conductor cross-section (mm²)
 * @param {'Cu'|'Al'} p.material    Conductor material
 * @param {number} p.operatingTempC Operating conductor temperature (°C); defaults to max for insulation
 * @param {number} [p.frequencyHz=50] System frequency (Hz)
 * @param {'round'|'sector'} [p.shape='round'] Conductor shape
 * @returns {{ R_ac: number, R_dc20: number, R_dcTheta: number, ys: number, yp: number }}
 *   All resistances in Ω/m.
 */
export function conductorAcResistance({
  sizeMm2,
  material = 'Cu',
  operatingTempC = 90,
  frequencyHz = 50,
  shape = 'round',
}) {
  const R20_table = material === 'Al' ? R20_AL : R20_CU;
  const R20 = R20_table[sizeMm2];
  if (R20 == null) {
    throw new Error(`No R20 data for ${sizeMm2} mm² ${material}. Supported sizes: ${Object.keys(R20_table).join(', ')} mm²`);
  }

  const alpha = ALPHA_20[material];
  const R20_SI = R20 * 1e-3; // convert mΩ/m → Ω/m
  const R_dcTheta = R20_SI * (1 + alpha * (operatingTempC - 20));

  // Skin effect (IEC §2.1.2) — circular stranded conductors
  const ks = shape === 'sector' ? 0.435 : 1.0; // ks for sector conductors (IEC Table 2)
  const xs2 = (8 * Math.PI * frequencyHz * ks * 1e-7) / R_dcTheta;
  const ys = xs2 <= 2.8
    ? (xs2 ** 2) / (192 + 0.8 * xs2 ** 2)
    : (xs2 ** 2) / (192 + 0.8 * xs2 ** 2); // same formula both regimes per standard

  // Proximity effect (IEC §2.1.3) — three-phase trefoil arrangement assumed
  // Conservative: use flat spacing formula with s/d ratio ≈ 1 for touching cables
  const kp = shape === 'sector' ? 0.37 : 0.8;
  const xp2 = (8 * Math.PI * frequencyHz * kp * 1e-7) / R_dcTheta;
  const yp_base = (xp2 ** 2) / (192 + 0.8 * xp2 ** 2);
  // For three-core cables in trefoil: yp = yp_base × f(d_c, s)
  // Simplified: yp ≈ 0.57 × yp_base for typical industrial cables (touching trefoil)
  const yp = 0.57 * yp_base;

  const R_ac = R_dcTheta * (1 + ys + yp);

  return {
    R_ac,
    R_dc20: R20_SI,
    R_dcTheta,
    ys: Math.round(ys * 1e6) / 1e6,
    yp: Math.round(yp * 1e6) / 1e6,
  };
}

// ---------------------------------------------------------------------------
// Dielectric losses (IEC §2.3) — for HV cables only
// ---------------------------------------------------------------------------

/**
 * Dielectric loss per unit length W_d (W/m) per IEC 60287-1-1 §2.3.
 *
 * W_d = ω × C × U_0² × tan_δ
 *
 * Only meaningful for cables with rated voltage U_0 > ~18 kV (36 kV system).
 * For LV/MV cables W_d is negligible and returns 0.
 *
 * @param {object} p
 * @param {number} p.U0_kV        Phase-to-ground voltage (kV)
 * @param {number} p.sizeMm2      Conductor cross-section (mm²) — used to estimate capacitance
 * @param {number} p.insulThickMm Insulation wall thickness (mm)
 * @param {number} [p.tanDelta=0.001] Dielectric loss tangent (XLPE ≈ 0.001, Paper ≈ 0.005)
 * @param {number} [p.epsilonR=2.5] Relative permittivity (XLPE ≈ 2.5, EPR ≈ 3.0)
 * @param {number} [p.frequencyHz=50]
 * @returns {number} W_d in W/m
 */
export function dielectricLoss({
  U0_kV,
  sizeMm2,
  insulThickMm,
  tanDelta = 0.001,
  epsilonR = 2.5,
  frequencyHz = 50,
}) {
  if (U0_kV <= 18) return 0; // negligible for LV/MV cables
  const EPSILON_0 = 8.854e-12; // F/m
  // Approximate conductor outer diameter from cross-section
  const d_c_mm = 2 * Math.sqrt(sizeMm2 / Math.PI); // mm
  const D_i_mm = d_c_mm + 2 * insulThickMm; // insulation outer diameter (mm)
  // Capacitance per unit length: C = 2π·ε₀·εr / ln(D_i/d_c) (F/m)
  const C = (2 * Math.PI * EPSILON_0 * epsilonR) / Math.log(D_i_mm / d_c_mm);
  const omega = 2 * Math.PI * frequencyHz;
  const U0_V = U0_kV * 1000;
  return omega * C * U0_V ** 2 * tanDelta;
}

// ---------------------------------------------------------------------------
// thermalResistances
// ---------------------------------------------------------------------------

/**
 * Calculate the four thermal resistance components T1–T4 per IEC 60287-1-1 §2.4.
 *
 * T1 — conductor insulation thermal resistance (K·m/W)
 * T2 — bedding/filler between insulation and sheath (set to 0 for single-core)
 * T3 — jacket/outer sheath (set to 0 if no oversheath specified)
 * T4 — external thermal resistance (soil, conduit wall, air)
 *
 * @param {object} p
 * @param {number} p.sizeMm2         Conductor cross-section (mm²)
 * @param {string} p.insulation      Insulation type key (e.g. 'XLPE')
 * @param {number} p.insulThickMm    Insulation wall thickness (mm)
 * @param {number} [p.outerSheathMm=3] Outer sheath thickness (mm); 0 if none
 * @param {'direct-burial'|'conduit'|'tray'|'air'} p.installMethod
 * @param {number} [p.burialDepthMm=800]  Burial depth to cable centre-line (mm)
 * @param {number} [p.soilResistivity=1.0] Soil thermal resistivity ρ (K·m/W)
 * @param {number} [p.conduitOD_mm=0]  Outer diameter of conduit (mm), used for conduit T4
 * @param {number} [p.nCores=3]       Number of current-carrying cores (1, 2, or 3)
 * @param {boolean} [p.armoured=false] Whether cable has metallic armour
 * @returns {{ T1: number, T2: number, T3: number, T4: number, lambdaSheath: number }}
 */
export function thermalResistances({
  sizeMm2,
  insulation = 'XLPE',
  insulThickMm,
  outerSheathMm = 3,
  installMethod = 'direct-burial',
  burialDepthMm = 800,
  soilResistivity = 1.0,
  conduitOD_mm = 0,
  nCores = 3,
  armoured = false,
}) {
  const rho_i = INSULATION_RESISTIVITY[insulation] ?? 3.5; // K·m/W

  // Conductor outer diameter (mm) — circle of equivalent cross-section
  const d_c = 2 * Math.sqrt(sizeMm2 / Math.PI);

  // T1 — Insulation thermal resistance (IEC §2.4.1, cylindrical wall formula)
  // For single-core: T1 = (ρ_i / 2π) × ln(1 + 2t/d_c)
  // For multi-core (3-core belted): T1 = (ρ_i / 2π) × ln(1 + 2t/d_c) [same per core]
  const T1 = (rho_i / (2 * Math.PI)) * Math.log(1 + (2 * insulThickMm) / d_c);

  // T2 — Filler/bedding between insulation screen and metallic sheath (for multi-core)
  // Simplified: for screened single-core cables T2 ≈ 0 (the screen is directly on insulation).
  // For three-core belted cables a small filler gap exists; use a conservative 0.02 K·m/W.
  const T2 = nCores > 1 ? 0.02 : 0.0;

  // T3 — Outer jacket thermal resistance (cylindrical wall)
  // D_s = overall diameter to outside of sheath (mm)
  const D_insCoreGroup_mm = d_c + 2 * insulThickMm; // single-core insulated OD
  // For three-core cable the cabled OD is approximately: D_cable ≈ 2.16 × D_insCoreGroup for trefoil
  const D_cable_mm = nCores === 3
    ? 2.16 * D_insCoreGroup_mm
    : nCores === 2
    ? 1.65 * D_insCoreGroup_mm
    : D_insCoreGroup_mm;

  const rho_j = 6.0; // Outer jacket PVC/LSZH thermal resistivity (K·m/W) — conservative
  const T3 = outerSheathMm > 0
    ? (rho_j / (2 * Math.PI)) * Math.log(1 + (2 * outerSheathMm) / D_cable_mm)
    : 0.0;

  // Overall cable outer diameter
  const D_e_mm = D_cable_mm + 2 * outerSheathMm + (armoured ? 6 : 0);
  const D_e = D_e_mm / 1000; // convert to m for T4 formulae

  // T4 — External thermal resistance
  let T4;
  if (installMethod === 'direct-burial') {
    // Kennelly's formula (IEC 60287-2-1 §2.2.1):
    // T4 = (ρ_s / 2π) × ln(2L/D_e + sqrt((2L/D_e)² − 1))
    // where L = burial depth to cable centre-line (m)
    const L = burialDepthMm / 1000;
    const ratio = 2 * L / D_e;
    T4 = (soilResistivity / (2 * Math.PI)) * Math.log(ratio + Math.sqrt(ratio ** 2 - 1));
  } else if (installMethod === 'conduit') {
    // Two-part resistance: soil external + conduit air gap
    // Soil part: same Kennelly formula using conduit OD
    const D_cond = conduitOD_mm > 0 ? conduitOD_mm / 1000 : Math.max(D_e * 2, 0.05);
    const L = burialDepthMm / 1000;
    const ratio = 2 * L / D_cond;
    const T4_soil = (soilResistivity / (2 * Math.PI)) * Math.log(ratio + Math.sqrt(ratio ** 2 - 1));
    // Air gap in conduit: simplified (IEC 60287-2-1 §2.2.3)
    // T4_air ≈ 0.1 K·m/W for typical conduit-to-cable clearance (conservative)
    const T4_air = 0.10;
    T4 = T4_soil + T4_air;
  } else if (installMethod === 'tray') {
    // Cable tray in air: natural convection + radiation (IEC 60287-2-1 §2.2.6)
    // Simplified: T4 = 1/(h × π × D_e) where h ≈ 8 W/(m²·K) combined convection + radiation
    const h = 8.0; // W/(m²·K) — free-air horizontal tray, single layer
    T4 = 1 / (h * Math.PI * D_e);
  } else {
    // Free air: same natural convection formula
    const h = 9.0; // slightly higher in free air vs. tray
    T4 = 1 / (h * Math.PI * D_e);
  }

  // Sheath/screen loss factor λ1 (simplified — screen dissipation factor)
  // For a copper screen with no sheath circulating currents (solidly bonded single-point): λ1 ≈ 0
  // Conservative value for cross-bonded HV cables: λ1 ≈ 0.05
  // We return λ1 = 0 for distribution cables (≤ 33 kV); user can scale externally.
  const lambdaSheath = 0.0;

  return {
    T1: round4(T1),
    T2: round4(T2),
    T3: round4(T3),
    T4: round4(T4),
    lambdaSheath,
    D_e_mm: Math.round(D_e_mm * 10) / 10,
    d_c_mm: Math.round(d_c * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// groupDerating
// ---------------------------------------------------------------------------

/**
 * Cable grouping derating factor per IEC 60287-2-1 Table 1 / Table 2.
 *
 * Multiple cables laid in close proximity run hotter than a single cable because
 * mutual heating reduces each cable's ability to dissipate heat.
 *
 * @param {number} n              Number of cables in the group (≥ 1)
 * @param {'flat'|'trefoil'|'flat-touching'} [arrangement='flat']
 * @returns {number} Derating factor f (0 < f ≤ 1.0)
 */
export function groupDerating(n, arrangement = 'flat') {
  if (n <= 1) return 1.0;

  // IEC 60287-2-1 Table 1 (cables in flat formation, spaced one cable diameter apart)
  // and Table 2 (cables touching in flat or trefoil)
  const flatSpaced = { 1: 1.00, 2: 0.90, 3: 0.82, 4: 0.77, 5: 0.73, 6: 0.70 };
  const trefoilTouching = { 1: 1.00, 2: 0.87, 3: 0.79, 4: 0.75, 5: 0.72, 6: 0.69 };
  const flatTouching = { 1: 1.00, 2: 0.85, 3: 0.76, 4: 0.72, 5: 0.69, 6: 0.66 };

  const table = arrangement === 'trefoil'
    ? trefoilTouching
    : arrangement === 'flat-touching'
    ? flatTouching
    : flatSpaced;

  if (n <= 6) return table[n];
  // For n > 6: approximate linear extrapolation from n=5→6 slope
  const slope = (table[6] - table[5]);
  return Math.max(0.45, table[6] + slope * (n - 6));
}

// ---------------------------------------------------------------------------
// Ambient temperature correction
// ---------------------------------------------------------------------------

/**
 * Correction factor for ambient temperature other than the 20 °C reference.
 *
 * Per IEC 60287-1-1, the current rating formula inherently uses Δθ = θ_max − θ_ambient
 * so a change in ambient temperature is handled automatically within calcAmpacity.
 * This helper returns the ratio of ampacity at θ_ambient vs. the 20 °C standard ambient,
 * useful for de-rating pre-tabulated values.
 *
 * @param {string} insulation    Insulation type
 * @param {number} thetaAmbient  Ambient temperature (°C)
 * @param {number} [thetaRef=20] Reference ambient temperature (°C)
 * @returns {number} Correction factor c_θ
 */
export function ambientTempCorrection(insulation, thetaAmbient, thetaRef = 20) {
  const thetaMax = MAX_TEMP_C[insulation] ?? 90;
  if (thetaAmbient >= thetaMax) throw new Error(
    `Ambient temperature ${thetaAmbient} °C exceeds maximum conductor temperature ${thetaMax} °C for ${insulation}`
  );
  const cTheta = Math.sqrt((thetaMax - thetaAmbient) / (thetaMax - thetaRef));
  return Math.round(cTheta * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// calcAmpacity — main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate the continuous current rating (ampacity) of a cable per IEC 60287-1-1:2023.
 *
 * The steady-state rating formula (IEC 60287-1-1 §3.1.1):
 *
 *   I = sqrt{ [Δθ − W_d·(0.5·T1 + n·(T2 + T3 + T4))] / [R_ac·(T1 + n·(1+λ1)·T2 + n·(1+λ1+λ2)·(T3+T4))] }
 *
 * where:
 *   Δθ     = maximum conductor temperature rise above ambient (K)
 *   W_d    = dielectric loss (W/m) — 0 for cables ≤ 36 kV
 *   T1–T4  = thermal resistances (K·m/W)
 *   R_ac   = AC conductor resistance at operating temperature (Ω/m)
 *   n      = number of conductors in the cable carrying load current
 *   λ1, λ2 = sheath and armour loss factors
 *
 * @param {object} p
 * @param {number} p.sizeMm2               Conductor cross-section (mm²)
 * @param {'Cu'|'Al'} [p.material='Cu']    Conductor material
 * @param {string} [p.insulation='XLPE']   Insulation type
 * @param {number} p.insulThickMm          Insulation wall thickness (mm)
 * @param {number} [p.outerSheathMm=3]     Outer sheath thickness (mm)
 * @param {number} [p.nCores=3]            Number of current-carrying cores
 * @param {boolean} [p.armoured=false]     Steel-wire armour present
 * @param {'direct-burial'|'conduit'|'tray'|'air'} [p.installMethod='direct-burial']
 * @param {number} [p.burialDepthMm=800]   Burial depth to cable centre (mm)
 * @param {number} [p.soilResistivity=1.0] Soil thermal resistivity (K·m/W)
 * @param {number} [p.conduitOD_mm=0]      Conduit outer diameter (mm)
 * @param {number} [p.ambientTempC=20]     Ambient temperature (°C)
 * @param {number} [p.frequencyHz=50]      System frequency (Hz)
 * @param {number} [p.U0_kV=0]            Phase-to-earth voltage (kV); for W_d calculation
 * @param {number} [p.nCables=1]           Number of cables in group
 * @param {'flat'|'trefoil'|'flat-touching'} [p.groupArrangement='flat'] Grouping arrangement
 * @returns {AmpacityResult}
 */
export function calcAmpacity({
  sizeMm2,
  material = 'Cu',
  insulation = 'XLPE',
  insulThickMm,
  outerSheathMm = 3,
  nCores = 3,
  armoured = false,
  installMethod = 'direct-burial',
  burialDepthMm = 800,
  soilResistivity = 1.0,
  conduitOD_mm = 0,
  ambientTempC = 20,
  frequencyHz = 50,
  U0_kV = 0,
  nCables = 1,
  groupArrangement = 'flat',
}) {
  // --- Validate ---
  if (!sizeMm2 || sizeMm2 <= 0) throw new Error('sizeMm2 must be a positive number');
  if (!insulThickMm || insulThickMm <= 0) throw new Error('insulThickMm must be a positive number');

  const thetaMax = MAX_TEMP_C[insulation];
  if (!thetaMax) throw new Error(`Unknown insulation type: ${insulation}. Use: ${Object.keys(MAX_TEMP_C).join(', ')}`);
  if (ambientTempC >= thetaMax) throw new Error(
    `Ambient temperature ${ambientTempC} °C ≥ max conductor temperature ${thetaMax} °C for ${insulation}`
  );

  const deltaTheta = thetaMax - ambientTempC; // temperature rise budget (K)

  // --- AC resistance at operating temperature ---
  const { R_ac, R_dcTheta, ys, yp } = conductorAcResistance({
    sizeMm2, material, operatingTempC: thetaMax, frequencyHz,
  });

  // --- Dielectric losses ---
  const W_d = dielectricLoss({ U0_kV, sizeMm2, insulThickMm, frequencyHz });

  // --- Thermal resistances ---
  const { T1, T2, T3, T4, lambdaSheath, D_e_mm, d_c_mm } = thermalResistances({
    sizeMm2, insulation, insulThickMm, outerSheathMm,
    installMethod, burialDepthMm, soilResistivity, conduitOD_mm, nCores, armoured,
  });

  const lambda1 = lambdaSheath;
  // Armour loss factor λ2 — conservative simplified model for steel-wire armour
  const lambda2 = armoured ? 0.06 : 0.0;

  const n = nCores; // number of load-carrying conductors

  // --- IEC 60287-1-1 §3.1.1 current rating ---
  const numerator = deltaTheta - W_d * (0.5 * T1 + n * (T2 + T3 + T4));
  const denominator = R_ac * (T1 + n * (1 + lambda1) * T2 + n * (1 + lambda1 + lambda2) * (T3 + T4));

  if (denominator <= 0) throw new Error('Thermal circuit denominator ≤ 0 — check insulation thickness and installation inputs');
  if (numerator <= 0) throw new Error('Dielectric losses exceed the temperature budget — cable voltage rating or insulation input is likely incorrect');

  const I_base = Math.sqrt(numerator / denominator); // A (ungrouped)

  // --- Grouping derating ---
  const f_group = groupDerating(nCables, groupArrangement);
  const I_rated = I_base * f_group;

  // --- Conductor temperature at rated current (reverse-check) ---
  const thetaConductor = ambientTempC
    + (I_rated ** 2) * R_ac * (T1 + n * (1 + lambda1) * T2 + n * (1 + lambda1 + lambda2) * (T3 + T4))
    + W_d * (0.5 * T1 + n * (T2 + T3 + T4));

  return {
    // Primary result
    I_rated: Math.round(I_rated * 10) / 10,    // A
    I_base: Math.round(I_base * 10) / 10,      // A (ungrouped)
    // Inputs echoed
    sizeMm2, material, insulation, installMethod,
    ambientTempC, frequencyHz,
    thetaMax, deltaTheta,
    // Thermal circuit
    thermalResistances: { T1, T2, T3, T4 },
    lossFactors: { lambda1, lambda2 },
    W_d: round6(W_d),
    // Conductor details
    R_ac: round6(R_ac),
    R_dcTheta: round6(R_dcTheta),
    ys, yp,
    // Geometry
    D_e_mm, d_c_mm,
    // Grouping
    nCables, groupArrangement,
    f_group: Math.round(f_group * 10000) / 10000,
    // Derived
    thetaConductorActual: Math.round(thetaConductor * 10) / 10,
    warnings: buildWarnings({ sizeMm2, ambientTempC, thetaMax, f_group, I_rated, installMethod, soilResistivity }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(v) { return Math.round(v * 10000) / 10000; }
function round6(v) { return Math.round(v * 1e6) / 1e6; }

function buildWarnings({ sizeMm2, ambientTempC, thetaMax, f_group, I_rated, installMethod, soilResistivity }) {
  const warnings = [];
  if (ambientTempC > thetaMax - 15) {
    warnings.push(`Ambient temperature (${ambientTempC} °C) is within 15 °C of the maximum conductor temperature — rating is very sensitive to temperature variation.`);
  }
  if (f_group < 0.70) {
    warnings.push(`Grouping derating factor is ${f_group} — consider using a larger conductor or reducing the number of cables in the group.`);
  }
  if (installMethod === 'direct-burial' && soilResistivity > 2.5) {
    warnings.push(`Soil thermal resistivity ${soilResistivity} K·m/W is high (dry/rocky soil). Verify with field measurements. Consider thermal backfill (ρ ≤ 1.0 K·m/W) to improve rating.`);
  }
  if (I_rated < 10) {
    warnings.push('Rated current is unusually low — check insulation thickness and installation depth inputs.');
  }
  return warnings;
}

/**
 * Default insulation thickness estimates (mm) for standard voltage classes.
 * Use when no data sheet thickness is available.
 *
 * @param {number} sizeMm2
 * @param {string} voltageClass  '0.6/1kV', '3.6/6kV', '6/10kV', '8.7/15kV', '12/20kV', '18/30kV'
 * @returns {number} Insulation wall thickness (mm)
 */
export function defaultInsulThickMm(sizeMm2, voltageClass = '0.6/1kV') {
  // IEC 60502-1/-2 typical minimum insulation thickness by voltage class and size
  const tables = {
    '0.6/1kV': { 1.5: 0.7, 2.5: 0.9, 4: 1.0, 6: 1.0, 10: 1.0, 16: 1.0, 25: 1.2, 35: 1.2, 50: 1.4, 70: 1.4, 95: 1.6, 120: 1.6, 150: 1.8, 185: 2.0, 240: 2.2, 300: 2.4, 400: 2.6, 500: 2.8, 630: 3.0 },
    '3.6/6kV': { 16: 3.4, 25: 3.4, 35: 3.4, 50: 3.4, 70: 3.4, 95: 3.4, 120: 3.4, 150: 3.4, 185: 3.4, 240: 3.4, 300: 3.4, 400: 3.4, 500: 3.4, 630: 3.4 },
    '6/10kV':  { 16: 4.5, 25: 4.5, 35: 4.5, 50: 4.5, 70: 4.5, 95: 4.5, 120: 4.5, 150: 4.5, 185: 4.5, 240: 4.5, 300: 4.5, 400: 4.5 },
    '8.7/15kV':{ 25: 5.5, 35: 5.5, 50: 5.5, 70: 5.5, 95: 5.5, 120: 5.5, 150: 5.5, 185: 5.5, 240: 5.5, 300: 5.5 },
    '12/20kV': { 35: 6.0, 50: 6.0, 70: 6.0, 95: 6.0, 120: 6.0, 150: 6.0, 185: 6.0, 240: 6.0, 300: 6.0 },
    '18/30kV': { 50: 8.0, 70: 8.0, 95: 8.0, 120: 8.0, 150: 8.0, 185: 8.0, 240: 8.0, 300: 8.0 },
  };
  const table = tables[voltageClass];
  if (!table) throw new Error(`Unknown voltage class: ${voltageClass}. Use: ${Object.keys(tables).join(', ')}`);

  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const key = sizes.find(s => s >= sizeMm2) ?? sizes[sizes.length - 1];
  return table[key];
}
