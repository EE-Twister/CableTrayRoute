/**
 * Bus Duct / Cable Bus Sizing & Voltage Drop — Gap #96
 *
 * Pure calculation helpers for busway (bus duct) ampacity, voltage drop, and
 * IEEE 605 mechanical bus stress. No DOM access; persistence is handled by the
 * page JS layer (busdust.js).
 *
 * Standards:
 *   NEC 368       Bus Duct (Busways) — general installation and ampacity
 *   NEC 368.12    Busway installation — orientation derating
 *   NEC 215.2(A)  Feeder conductor size — 3% voltage drop recommendation
 *   IEEE 605-2008 IEEE Guide for Bus Design in Air Insulated Substations
 *                 — mechanical stress on conductors under fault current
 *
 * Ampacity data source: indicative ratings based on typical Al/Cu busway
 * manufacturer tables (Siemens Sentron, GE, Eaton) — not manufacturer-specific.
 * Final designs must be verified against the selected manufacturer's published
 * ratings.
 */

// ---------------------------------------------------------------------------
// Standard busway ratings
// ---------------------------------------------------------------------------

/**
 * Standard busway ampere ratings available in the market.
 * Manufacturer lines typically offer all of these in both Al and Cu.
 */
export const STANDARD_BUSWAY_RATINGS = Object.freeze([
  800, 1000, 1200, 1350, 1600, 2000, 2500, 3000, 4000, 5000,
]);

/**
 * Indicative busway resistance and reactance per foot at 60 Hz.
 *
 * Values represent typical mid-range figures for plug-in (feeder) busway.
 * - resistance (mΩ/ft): AC resistance including skin-effect at rated current
 * - reactance  (mΩ/ft): 60 Hz inductive reactance (phase-to-phase spacing ~4–6 in)
 *
 * Source: representative data interpolated from GE Spectra/Siemens BT/Eaton
 * Speed-D published performance tables.
 */
export const BUSWAY_LIBRARY = Object.freeze({
  //  rating    Cu_R    Cu_X    Al_R    Al_X   weight_lb_per_ft
  800:  { Cu: { r: 0.210, x: 0.060 }, Al: { r: 0.320, x: 0.065 }, weightLbPerFt: 6.5  },
  1000: { Cu: { r: 0.175, x: 0.055 }, Al: { r: 0.265, x: 0.060 }, weightLbPerFt: 7.8  },
  1200: { Cu: { r: 0.150, x: 0.050 }, Al: { r: 0.230, x: 0.055 }, weightLbPerFt: 9.2  },
  1350: { Cu: { r: 0.135, x: 0.048 }, Al: { r: 0.205, x: 0.052 }, weightLbPerFt: 10.1 },
  1600: { Cu: { r: 0.115, x: 0.045 }, Al: { r: 0.175, x: 0.050 }, weightLbPerFt: 11.8 },
  2000: { Cu: { r: 0.095, x: 0.042 }, Al: { r: 0.145, x: 0.046 }, weightLbPerFt: 14.0 },
  2500: { Cu: { r: 0.078, x: 0.040 }, Al: { r: 0.118, x: 0.043 }, weightLbPerFt: 17.2 },
  3000: { Cu: { r: 0.065, x: 0.038 }, Al: { r: 0.098, x: 0.041 }, weightLbPerFt: 20.5 },
  4000: { Cu: { r: 0.050, x: 0.036 }, Al: { r: 0.075, x: 0.039 }, weightLbPerFt: 26.0 },
  5000: { Cu: { r: 0.040, x: 0.034 }, Al: { r: 0.060, x: 0.037 }, weightLbPerFt: 32.0 },
});

// ---------------------------------------------------------------------------
// NEC 368 orientation derating
// ---------------------------------------------------------------------------

/**
 * NEC 368.12 installation limitation factors.
 *
 * Horizontal (flat) installation is the rated condition (factor 1.0).
 * Vertical runs shed convective heat more efficiently; edge-on (vertical flanges
 * facing up/down) concentrates heat in the conductor stack.
 *
 * Typical manufacturer derating for non-horizontal runs:
 *   vertical (edge-on): 0.80 — conductors stacked vertically, worst air path
 *   vertical (flat):    1.00 — conductors side-by-side, acceptable airflow
 *   horizontal (flat):  1.00 — standard rated condition
 *
 * Several manufacturers use 0.80 for any vertical/edge-on installation and
 * allow 1.00 for vertical flat (conductors in a row). We apply the more
 * conservative industry practice.
 */
export const ORIENTATION_DERATING = Object.freeze({
  horizontal: 1.00,
  vertical:   1.00,
  edgeon:     0.80,
});

/**
 * Return the NEC 368.12 orientation derating factor.
 *
 * @param {'horizontal'|'vertical'|'edgeon'} orientation
 * @returns {number}  Derating factor (0 < factor ≤ 1.0)
 */
export function necOrientationDerating(orientation) {
  const key = String(orientation || 'horizontal').toLowerCase().replace(/[^a-z]/g, '');
  return ORIENTATION_DERATING[key] ?? ORIENTATION_DERATING.horizontal;
}

// ---------------------------------------------------------------------------
// Ambient temperature correction
// ---------------------------------------------------------------------------

/**
 * NEC 310.15(B)(1)(a) ambient temperature correction factors for 75°C–rated
 * busway conductors (copper or aluminium, typical insulation class).
 *
 * Busway manufacturers generally publish ampacity at 40°C ambient; many also
 * publish derating tables to 50°C. We use the NEC 310.15 formula as a proxy
 * for installations in other ambient environments:
 *
 *   K = √((T_c − T_a) / (T_c − 40))
 *
 * where T_c = conductor temperature rating (75°C typical for busway
 * insulation), T_a = ambient temperature.
 */

/**
 * Calculate the ambient temperature correction factor for a 75°C-rated busway.
 *
 * @param {number} ambientC  Ambient temperature (°C). Default 40°C matches
 *                           typical manufacturer rated conditions → factor 1.0.
 * @returns {number}  Correction factor (clamped to 0.01–1.20).
 */
export function ambientTempCorrectionFactor(ambientC) {
  const t_c = 75;    // conductor temperature rating (°C)
  const t_ref = 40;  // manufacturer reference ambient (°C)
  const t_a = parseFloat(ambientC);
  if (!Number.isFinite(t_a)) return 1.0;
  if (t_a >= t_c) return 0.01; // near/above conductor limit — essentially zero ampacity
  const factor = Math.sqrt((t_c - t_a) / (t_c - t_ref));
  return Math.max(0.01, Math.min(1.20, round4(factor)));
}

// ---------------------------------------------------------------------------
// Stacking / proximity derating
// ---------------------------------------------------------------------------

/**
 * NEC 368 stacking derating: when two or more busway runs are installed in
 * proximity (stacked directly above each other with ≤ 6 in separation), mutual
 * heating reduces the effective ampacity of each run.
 *
 * Typical manufacturer guidance (Siemens / Eaton):
 *   1 run  : 1.00
 *   2 runs : 0.80
 *   3 runs : 0.70
 *   4+ runs: 0.65
 */
export const STACKING_DERATING = Object.freeze({
  1: 1.00,
  2: 0.80,
  3: 0.70,
  4: 0.65,
});

/**
 * Return the stacking derating factor for N stacked runs.
 *
 * @param {number} stackedRuns  Number of busway runs installed in close proximity.
 * @returns {number}
 */
export function stackingDerating(stackedRuns) {
  const n = Math.max(1, Math.round(Number(stackedRuns) || 1));
  return STACKING_DERATING[Math.min(n, 4)] ?? STACKING_DERATING[4];
}

// ---------------------------------------------------------------------------
// Combined derating and ampacity
// ---------------------------------------------------------------------------

/**
 * Apply NEC 368 combined derating to busway base ampacity.
 *
 * Factors applied in sequence:
 *   1. Orientation derating (NEC 368.12)
 *   2. Ambient temperature correction (based on NEC 310.15(B)(1)(a) formula)
 *   3. Stacking derating (proximity of parallel busway runs)
 *
 * @param {number} baseAmpacity  Manufacturer rated ampacity at 40°C, horizontal.
 * @param {object} opts
 * @param {'horizontal'|'vertical'|'edgeon'} [opts.orientation='horizontal']
 * @param {number} [opts.ambientC=40]
 * @param {number} [opts.stackedRuns=1]
 * @returns {{
 *   deratedAmpacity: number,
 *   orientationFactor: number,
 *   ambientFactor: number,
 *   stackingFactor: number,
 *   combinedFactor: number
 * }}
 */
export function necAmpacityDerating(baseAmpacity, opts = {}) {
  const { orientation = 'horizontal', ambientC = 40, stackedRuns = 1 } = opts;

  const oFactor = necOrientationDerating(orientation);
  const aFactor = ambientTempCorrectionFactor(ambientC);
  const sFactor = stackingDerating(stackedRuns);
  const combined = round4(oFactor * aFactor * sFactor);
  const derated  = round4(parseFloat(baseAmpacity) * combined);

  return {
    deratedAmpacity: derated,
    orientationFactor: oFactor,
    ambientFactor: aFactor,
    stackingFactor: sFactor,
    combinedFactor: combined,
  };
}

// ---------------------------------------------------------------------------
// Voltage drop
// ---------------------------------------------------------------------------

/**
 * Calculate per-phase voltage drop along a busway run.
 *
 * Formula (IEC / NEMA standard impedance method):
 *   VD = I × L × (R × cos φ + X × sin φ)  [single-phase, multiply by 2 for loop]
 *   VD = √3 × I × L × (R × cos φ + X × sin φ)  [three-phase line-to-neutral drop]
 *
 * The function returns line-to-neutral VD in volts; multiply by √3 for
 * three-phase line-to-line drop.
 *
 * @param {object} params
 * @param {number} params.currentA       Load current (A)
 * @param {number} params.rMohmPerFt     Busway resistance (mΩ/ft)
 * @param {number} params.xMohmPerFt     Busway reactance (mΩ/ft)
 * @param {number} params.lengthFt       Run length (ft)
 * @param {number} [params.pf=0.85]      Load power factor (0–1)
 * @param {number} [params.phases=3]     Number of phases (1 or 3)
 * @param {number} params.systemVoltageV System voltage line-to-line (V)
 * @returns {{
 *   vdLineToNeutralV: number,
 *   vdLineToLineV: number,
 *   vdPercent: number,
 *   passNec: boolean,
 *   necThresholdPct: number,
 *   rOhmTotal: number,
 *   xOhmTotal: number
 * }}
 */
export function voltageDropBusDuct(params) {
  const {
    currentA,
    rMohmPerFt,
    xMohmPerFt,
    lengthFt,
    pf         = 0.85,
    phases     = 3,
    systemVoltageV,
  } = params;

  const I   = parseFloat(currentA)       || 0;
  const R1  = parseFloat(rMohmPerFt)     || 0;
  const X1  = parseFloat(xMohmPerFt)     || 0;
  const L   = parseFloat(lengthFt)       || 0;
  const PF  = Math.min(1, Math.max(0, parseFloat(pf) || 0.85));
  const Vll = parseFloat(systemVoltageV) || 480;

  // Total impedance over run length (Ω)
  const rOhmTotal = round4((R1 * L) / 1000);  // mΩ/ft × ft / 1000 = Ω
  const xOhmTotal = round4((X1 * L) / 1000);

  const sinPhi = Math.sqrt(Math.max(0, 1 - PF * PF));
  const zDrop  = rOhmTotal * PF + xOhmTotal * sinPhi;  // effective impedance (Ω)

  let vdLineToNeutralV;
  if (phases === 1) {
    // Single-phase: two conductors carry the current (forward + return)
    vdLineToNeutralV = round4(I * 2 * zDrop);
  } else {
    // Three-phase: line-to-neutral drop
    vdLineToNeutralV = round4(I * zDrop);
  }

  const vdLineToLineV = round4(vdLineToNeutralV * Math.sqrt(3));
  const vdPercent     = round4((vdLineToLineV / Vll) * 100);

  const NEC_VD_PCT = 3;  // NEC 215.2(A)(4) feeders: 3% recommendation
  const passNec    = vdPercent <= NEC_VD_PCT;

  return {
    vdLineToNeutralV,
    vdLineToLineV,
    vdPercent,
    passNec,
    necThresholdPct: NEC_VD_PCT,
    rOhmTotal,
    xOhmTotal,
  };
}

// ---------------------------------------------------------------------------
// IEEE 605 mechanical bus stress
// ---------------------------------------------------------------------------

/**
 * IEEE 605-2008 §5.2 — Electromagnetic force on a bus conductor during a
 * three-phase fault.
 *
 * The maximum force per unit length on any conductor in a flat three-phase bus
 * arrangement occurs on the outer conductors:
 *
 *   F/L = (√3 / 2) × μ₀/2π × I_peak² / d
 *       ≈ 5.396 × 10⁻⁷ × I_peak² / d   (SI units — N/m, A, m)
 *
 * Converting to lbf/ft with I in amps (RMS symmetrical) and d in inches,
 * the industry standard simplified form is:
 *
 *   F/L [lbf/ft] = 5.4 × 10⁻⁷ × I_A² / d_in
 *
 * In terms of kA (since fault studies report I in kA):
 *
 *   F/L [lbf/ft] = 5.4 × 10⁻⁷ × (I_kA × 1000)² / d_in
 *               = 0.54 × I_kA² / d_in
 *
 * Source: GE Bus Bar Design Guide; IEEE 605-2008 §5.2; Eaton Bus Duct
 * Catalog application note on short-circuit stress.
 *
 * @param {number} faultCurrentKA  Symmetrical RMS fault current (kA)
 * @param {number} conductorSpacingIn  Centre-to-centre conductor spacing (in)
 * @returns {number}  Maximum electromagnetic force per foot of bus (lbf/ft)
 */
export function busStressForcePerFt(faultCurrentKA, conductorSpacingIn) {
  const I = parseFloat(faultCurrentKA)    || 0;
  const d = parseFloat(conductorSpacingIn)|| 0;
  if (d <= 0) return 0;
  // F/L [lbf/ft] = 5.4×10⁻⁷ × (I_kA×1000)² / d_in = 0.54 × I_kA² / d_in
  return round4(0.54 * I * I / d);
}

/**
 * IEEE 605-2008 §5.3 — Maximum allowable span between supports based on
 * conductor mechanical rating.
 *
 * The maximum support span (ft) is derived from the allowable bending stress:
 *
 *   M_allow = S_y × Z   (ft-lbf per support span, assuming simply supported)
 *
 * For a uniformly loaded beam:
 *   M_max = F/L × L² / 8   →   L = √(8 × S_y × Z / (F/L))
 *
 * where:
 *   S_y  = yield stress of conductor material (psi)
 *   Z    = section modulus of conductor cross-section (in³)
 *   F/L  = force per unit length (lbf/ft)
 *
 * @param {number} forcePerFt      Electromagnetic force per foot (lbf/ft)
 * @param {number} allowableStressPsi   Allowable bending stress (psi)
 *                                      Cu: 10 000 psi (ASTM B187 half-hard)
 *                                      Al: 6 000 psi (ASTM B273 6101-T63)
 * @param {number} sectionModulusIn3  Section modulus Z of conductor bar (in³)
 * @returns {number}  Maximum support span (ft). Returns Infinity if force is 0.
 */
export function maxSupportSpan(forcePerFt, allowableStressPsi, sectionModulusIn3) {
  const F = parseFloat(forcePerFt)        || 0;
  const Sy = parseFloat(allowableStressPsi)|| 0;
  const Z  = parseFloat(sectionModulusIn3) || 0;
  if (F <= 0) return Infinity;
  if (Sy <= 0 || Z <= 0) return 0;
  // Convert stress × section modulus to ft-lbf per linear foot of span:
  //   M_allow [in-lbf] = Sy × Z  →  [ft-lbf] = Sy × Z / 12
  //   max span L [ft]  = √(8 × Sy × Z / 12 / F)
  return round4(Math.sqrt((8 * Sy * Z / 12) / F));
}

/**
 * Allowable bending stress by conductor material (psi).
 * Values per IEEE 605-2008 Table 1.
 */
export const ALLOWABLE_STRESS_PSI = Object.freeze({
  Cu: 10000,  // ASTM B187 hard-drawn copper bus bar, half-hard
  Al:  6000,  // ASTM B273 6101-T63 aluminium alloy bus bar
});

/**
 * Typical section modulus Z (in³) for common rectangular bus bar cross-sections.
 * Z = b × h² / 6 for bending about the strong axis (h = vertical dimension).
 * All busway manufacturers publish exact Z values in their product data.
 *
 * These representative values are for a single-conductor bar of the
 * cross-section typical of each current rating:
 */
export const TYPICAL_SECTION_MODULUS = Object.freeze({
  //  rating   Z_in3_Cu  Z_in3_Al
  800:  { Cu: 0.25, Al: 0.30 },
  1000: { Cu: 0.30, Al: 0.36 },
  1200: { Cu: 0.35, Al: 0.42 },
  1350: { Cu: 0.40, Al: 0.48 },
  1600: { Cu: 0.48, Al: 0.58 },
  2000: { Cu: 0.58, Al: 0.70 },
  2500: { Cu: 0.72, Al: 0.87 },
  3000: { Cu: 0.88, Al: 1.06 },
  4000: { Cu: 1.15, Al: 1.38 },
  5000: { Cu: 1.44, Al: 1.73 },
});

// ---------------------------------------------------------------------------
// Standard busway selection
// ---------------------------------------------------------------------------

/**
 * Select the smallest standard busway rating ≥ the required derated ampacity.
 *
 * @param {number} requiredAmps  Required continuous current (A), already derated.
 * @returns {{ rating: number, adequate: boolean }}
 *   adequate = true if a standard size was found; false if requirement exceeds
 *   the largest available standard size.
 */
export function selectStandardBusway(requiredAmps) {
  const req = parseFloat(requiredAmps) || 0;
  const match = STANDARD_BUSWAY_RATINGS.find(r => r >= req);
  if (match !== undefined) {
    return { rating: match, adequate: true };
  }
  return { rating: STANDARD_BUSWAY_RATINGS[STANDARD_BUSWAY_RATINGS.length - 1], adequate: false };
}

// ---------------------------------------------------------------------------
// Master run function
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BusDuctInputs
 * @property {string}  [label]              Run identifier
 * @property {number}  systemVoltageV       System line-to-line voltage (V)
 * @property {1|3}     [phases=3]           Number of phases
 * @property {number}  [frequency=60]       System frequency (Hz) — informational
 * @property {string}  [material='Al']      Conductor material: 'Al' or 'Cu'
 * @property {number}  currentA             Design load current (A)
 * @property {number}  lengthFt             Busway run length (ft)
 * @property {'horizontal'|'vertical'|'edgeon'} [orientation='horizontal']
 * @property {number}  [ambientC=40]        Ambient temperature (°C)
 * @property {number}  [stackedRuns=1]      Number of adjacent parallel busway runs
 * @property {number}  faultCurrentKA       Available fault current (kA)
 * @property {number}  [conductorSpacingIn=6]  Phase conductor spacing (in)
 * @property {number}  [supportSpanFt=10]   Installed support span (ft)
 */

/**
 * Run the full bus duct sizing study for one busway run.
 *
 * @param {BusDuctInputs} inputs
 * @returns {{
 *   label: string,
 *   ampacity: object,
 *   selectedBusway: object,
 *   voltageDrop: object,
 *   faultStress: object,
 *   warnings: string[],
 *   errors: string[],
 *   valid: boolean
 * }}
 */
export function runBusDuctStudy(inputs) {
  const {
    label             = 'Bus Duct Run',
    systemVoltageV    = 480,
    phases            = 3,
    frequency         = 60,
    material          = 'Al',
    currentA,
    lengthFt,
    orientation       = 'horizontal',
    ambientC          = 40,
    stackedRuns       = 1,
    faultCurrentKA,
    conductorSpacingIn = 6,
    supportSpanFt      = 10,
  } = inputs || {};

  const errors   = [];
  const warnings = [];

  // Input validation
  const I  = parseFloat(currentA)      || 0;
  const L  = parseFloat(lengthFt)      || 0;
  const Vc = parseFloat(systemVoltageV)|| 480;
  const Ik = parseFloat(faultCurrentKA)|| 0;

  if (I  <= 0) errors.push('Load current must be greater than zero.');
  if (L  <= 0) errors.push('Run length must be greater than zero.');
  if (Vc <= 0) errors.push('System voltage must be greater than zero.');
  if (Ik <= 0) errors.push('Fault current must be greater than zero.');

  if (errors.length > 0) {
    return { label, valid: false, errors, warnings, ampacity: null, selectedBusway: null, voltageDrop: null, faultStress: null };
  }

  const mat = (String(material || 'Al').toUpperCase() === 'CU') ? 'Cu' : 'Al';

  // 1. Select the smallest standard busway that meets load current
  const prelimSelected = selectStandardBusway(I);
  const rating         = prelimSelected.rating;
  const libEntry       = BUSWAY_LIBRARY[rating] || BUSWAY_LIBRARY[800];
  const baseAmpacity   = rating;  // nominal rating = base ampacity

  // 2. Apply derating
  const derating = necAmpacityDerating(baseAmpacity, { orientation, ambientC, stackedRuns: parseFloat(stackedRuns) || 1 });

  // Re-select if derating reduces below load
  let finalRating = rating;
  if (derating.deratedAmpacity < I) {
    const upsized = selectStandardBusway(I / derating.combinedFactor);
    finalRating = upsized.rating;
    warnings.push(
      `Initial ${rating} A selection derated to ${round2(derating.deratedAmpacity)} A — upsized to ${finalRating} A.`
    );
  }

  const finalLibEntry  = BUSWAY_LIBRARY[finalRating] || libEntry;
  const finalBase      = finalRating;
  const finalDerating  = necAmpacityDerating(finalBase, { orientation, ambientC, stackedRuns: parseFloat(stackedRuns) || 1 });
  const finalDerated   = finalDerating.deratedAmpacity;
  const utilization    = round2((I / finalDerated) * 100);

  if (utilization > 100) {
    warnings.push(`Busway utilization ${utilization}% exceeds 100%. Specify a larger rating.`);
  } else if (utilization > 80) {
    warnings.push(`Busway utilization ${utilization}% is above 80%. Consider upsizing for future load growth.`);
  }

  const ampacityResult = {
    requestedCurrentA:   I,
    baseAmpacity:        finalBase,
    deratedAmpacity:     finalDerated,
    utilizationPct:      utilization,
    orientationFactor:   finalDerating.orientationFactor,
    ambientFactor:       finalDerating.ambientFactor,
    stackingFactor:      finalDerating.stackingFactor,
    combinedFactor:      finalDerating.combinedFactor,
  };

  const selectedBuswayResult = {
    rating: finalRating,
    adequate: finalRating <= STANDARD_BUSWAY_RATINGS[STANDARD_BUSWAY_RATINGS.length - 1],
    material: mat,
    rMohmPerFt: finalLibEntry[mat]?.r ?? finalLibEntry.Al.r,
    xMohmPerFt: finalLibEntry[mat]?.x ?? finalLibEntry.Al.x,
    weightLbPerFt: finalLibEntry.weightLbPerFt,
  };

  // 3. Voltage drop
  const vdResult = voltageDropBusDuct({
    currentA: I,
    rMohmPerFt: selectedBuswayResult.rMohmPerFt,
    xMohmPerFt: selectedBuswayResult.xMohmPerFt,
    lengthFt: L,
    pf: 0.85,
    phases: parseInt(phases) === 1 ? 1 : 3,
    systemVoltageV: Vc,
  });

  if (!vdResult.passNec) {
    warnings.push(
      `Voltage drop ${vdResult.vdPercent}% exceeds NEC 215.2(A)(4) recommendation of ${vdResult.necThresholdPct}%. ` +
      `Consider a shorter run, higher-rated busway, or intermediate sub-feed.`
    );
  }

  // 4. Fault stress
  const forcePerFt    = busStressForcePerFt(Ik, parseFloat(conductorSpacingIn) || 6);
  const Sy            = ALLOWABLE_STRESS_PSI[mat];
  const ZEntry        = TYPICAL_SECTION_MODULUS[finalRating] || TYPICAL_SECTION_MODULUS[800];
  const Z             = ZEntry[mat];
  const maxSpan       = maxSupportSpan(forcePerFt, Sy, Z);
  const actualSpan    = parseFloat(supportSpanFt) || 10;
  const spanPass      = actualSpan <= maxSpan;

  if (!spanPass) {
    warnings.push(
      `Support span ${actualSpan} ft exceeds IEEE 605 maximum ${round2(maxSpan)} ft for ` +
      `${finalRating} A ${mat} busway at ${Ik} kA fault. Reduce span or increase section modulus.`
    );
  }

  const faultStressResult = {
    faultCurrentKA:       Ik,
    conductorSpacingIn:   parseFloat(conductorSpacingIn) || 6,
    forcePerFt,
    allowableStressPsi:   Sy,
    sectionModulusIn3:    Z,
    maxSupportSpanFt:     round2(maxSpan === Infinity ? 9999 : maxSpan),
    installedSpanFt:      actualSpan,
    spanPass,
  };

  return {
    label,
    valid: true,
    errors,
    warnings,
    ampacity:      ampacityResult,
    selectedBusway: selectedBuswayResult,
    voltageDrop:   vdResult,
    faultStress:   faultStressResult,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
