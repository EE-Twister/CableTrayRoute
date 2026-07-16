/**
 * BESS Hazard / Thermal Runaway Screening — Gap #91
 *
 * Pure calculation module. No DOM access; persistence is handled by the page
 * JS layer (bessHazard.js).
 *
 * References:
 *   NFPA 855  Installation requirements and the project-specific HMA process
 *   NFPA 68   Deflagration vent design methods and applicability limits
 *   UL 9540A  Test method used to obtain installation-specific fire and gas data
 *
 * Module overview
 * ───────────────
 * 1. separationDistance()   — advisory distance used to flag layouts for review
 * 2. propagationTiming()    — generic sensitivity estimate, not a UL 9540A result
 * 3. deflagrationVentArea() — preliminary equation screening using assumed gas data
 * 4. hmaSummary()           — review flags; never a code-compliance determination
 * 5. runBessHazardStudy()   — Unified entry point; validates inputs, returns structured result
 *
 * Disclaimer: These generic assumptions cannot establish NFPA 855 compliance or
 * replace UL 9540A test data. Final separation, propagation, gas, ventilation,
 * deflagration, suppression, and HMA decisions require the listed system's test
 * reports, the adopted code edition, a qualified engineer, and AHJ review.
 */

// ---------------------------------------------------------------------------
// Chemistry parameters
// ---------------------------------------------------------------------------

/**
 * Battery chemistry parameters for thermal-runaway and deflagration modeling.
 *
 * kG_barMs:       Deflagration index K_G [bar·m/s] for typical off-gas composition
 *                 used only as generic screening assumptions.
 * pMax_bar:       Maximum pressure in an unvented enclosure during deflagration [bar]
 *                 used only as generic screening assumptions.
 * propagBase_min: Base cell-to-adjacent-cell thermal runaway propagation time [min]
 *                 at 25°C ambient, used only for sensitivity screening.
 */
export const CHEMISTRY_PARAMS = Object.freeze({
  LFP:         { name: 'LiFePO₄ (LFP)',   kG_barMs: 50,  pMax_bar: 4.0, propagBase_min: 20 },
  NMC:         { name: 'NMC (NiMnCo)',     kG_barMs: 120, pMax_bar: 5.5, propagBase_min: 8  },
  NCA:         { name: 'NCA (NiCoAl)',     kG_barMs: 200, pMax_bar: 6.5, propagBase_min: 4  },
  'lead-acid': { name: 'Lead-Acid (VRLA)', kG_barMs: 450, pMax_bar: 6.9, propagBase_min: 30 },
  NiCd:        { name: 'NiCd',             kG_barMs: 400, pMax_bar: 6.5, propagBase_min: 15 },
});

// ---------------------------------------------------------------------------
// Advisory separation screening defaults
// ---------------------------------------------------------------------------

/**
 * Advisory layout-screening distances. These are deliberately not represented
 * as NFPA 855 minimums: required separation depends on the installation type,
 * adopted code edition, listings, UL 9540A results, fire protection features,
 * and AHJ-approved alternatives.
 *
 * Keyed by exposure type. Each array is evaluated in order; the first entry
 * whose maxKwh ≥ system rated capacity is used.
 *
 * Screening values in metres:
 *   property_line   : 0.9 m (3 ft) for ≤ 50 kWh; 1.5 m (5 ft) for > 50 kWh
 *   occupied_building: 1.5 m (5 ft) for ≤ 50 kWh; 3.0 m (10 ft) for > 50 kWh
 *   ignition_source : 0.9 m (3 ft) for all capacities
 */
export const SCREENING_SEPARATION_DEFAULTS = Object.freeze({
  property_line: [
    { maxKwh: 50,       minDistM: 0.9 },
    { maxKwh: Infinity, minDistM: 1.5 },
  ],
  occupied_building: [
    { maxKwh: 50,       minDistM: 1.5 },
    { maxKwh: Infinity, minDistM: 3.0 },
  ],
  ignition_source: [
    { maxKwh: Infinity, minDistM: 0.9 },
  ],
});

// Backward-compatible export name for saved studies and external imports.
export const SEPARATION_TABLE = SCREENING_SEPARATION_DEFAULTS;

export const EXPOSURE_TYPES = Object.freeze([
  { value: 'property_line',    label: 'Property Line' },
  { value: 'occupied_building', label: 'Occupied Building' },
  { value: 'ignition_source',  label: 'Ignition / Electrical Source' },
]);

// ---------------------------------------------------------------------------
// 1. Advisory separation-distance screening
// ---------------------------------------------------------------------------

/**
 * Return the advisory screening distance for a given exposure type and system
 * rated energy capacity. The result is not a code-required clearance.
 *
 * @param {'property_line'|'occupied_building'|'ignition_source'} exposureType
 * @param {number} ratedKwh — total ESS rated energy capacity (kWh)
 * @returns {{ minDistM: number, minDistFt: number, basis: string, requiresProjectSpecificBasis: boolean }}
 */
export function separationDistance(exposureType, ratedKwh) {
  const table = SCREENING_SEPARATION_DEFAULTS[exposureType];
  if (!table) throw new RangeError(`Unknown exposure type: ${exposureType}`);
  const entry = table.find(e => ratedKwh <= e.maxKwh);
  const minDistM = entry ? entry.minDistM : table[table.length - 1].minDistM;
  return {
    minDistM,
    minDistFt: +(minDistM * 3.28084).toFixed(1),
    basis: 'advisory-screening-default',
    requiresProjectSpecificBasis: true,
  };
}

/**
 * Compare exposure distances with advisory screening defaults. A result never
 * constitutes a compliance pass or fail.
 *
 * @param {number} ratedKwh — total system rated energy (kWh)
 * @param {Array<{label: string, type: string, actualDistM: number}>} exposures
 * @returns {Array<{label, type, actualDistM, actualDistFt, minDistM, minDistFt, margin, pass, meetsScreeningDistance, status}>}
 */
export function checkSeparations(ratedKwh, exposures = []) {
  return exposures.map(exp => {
    const { minDistM, minDistFt } = separationDistance(exp.type, ratedKwh);
    const meetsScreeningDistance = exp.actualDistM >= minDistM;
    const margin = +(exp.actualDistM - minDistM).toFixed(2);
    return {
      label:       exp.label || exp.type,
      type:        exp.type,
      actualDistM: +exp.actualDistM.toFixed(2),
      actualDistFt: +(exp.actualDistM * 3.28084).toFixed(1),
      minDistM,
      minDistFt,
      margin,
      pass: null,
      meetsScreeningDistance,
      status: meetsScreeningDistance ? 'review' : 'screening-alert',
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Generic thermal-runaway propagation sensitivity estimate
// ---------------------------------------------------------------------------

/**
 * Ambient temperature correction factor for propagation timing.
 *
 * Based on Arrhenius kinetics: reaction rate approximately doubles every 10°C.
 * Higher ambient → faster propagation (lower factor = less time).
 *
 * @param {number} ambientC — ambient temperature [°C]
 * @returns {number} multiplicative factor (< 1 for T > 25°C, > 1 for T < 25°C)
 */
export function propagationAmbientFactor(ambientC) {
  return Math.pow(2, -(ambientC - 25) / 10);
}

/**
 * Estimate thermal runaway propagation timing through a BESS rack using a
 * simplified lumped thermal-mass model. UL 9540A is a test method; these
 * calculated values are not UL 9540A test results.
 *
 * Returns timing milestones:
 *   cellToCell_min  : time for runaway to reach an adjacent cell
 *   cellToModule_min: time for a cell runaway to cascade to full module
 *   moduleToRack_min: time from first module ignition to full rack involvement
 *
 * @param {{
 *   chemistry: string,
 *   cellsPerModule: number,
 *   modulesPerRack: number,
 *   ambientC: number,
 * }} rack
 * @returns {{ cellToCell_min, cellToModule_min, moduleToRack_min, warnings: string[] }}
 */
export function propagationTiming({ chemistry, cellsPerModule, modulesPerRack, ambientC = 25 }) {
  const params = CHEMISTRY_PARAMS[chemistry];
  if (!params) throw new RangeError(`Unknown chemistry: ${chemistry}`);

  const warnings = [
    'Generic propagation assumptions cannot replace UL 9540A test data for the listed cell, module, unit, and installation configuration.',
  ];
  const tempFactor = propagationAmbientFactor(ambientC);

  const cellToCell_min = +(params.propagBase_min * tempFactor).toFixed(1);

  // Module propagation: governed by number of inter-cell thermal barriers.
  // Time scales logarithmically with cell count (more cells → first barriers
  // reached sooner, but full module takes longer). Conservative estimate uses
  // linear scaling with a 0.7 barrier effectiveness discount.
  const cellToModule_min = +(cellToCell_min * cellsPerModule * 0.7).toFixed(1);

  // Rack propagation: similar inter-module barrier effect, reduced effectiveness
  // for rack-level propagation (0.5 factor — rack enclosure concentrates heat).
  const moduleToRack_min = +(cellToModule_min * modulesPerRack * 0.5).toFixed(1);

  if (ambientC > 40) {
    warnings.push(`Ambient temperature ${ambientC}°C is above 40°C — verify the listed equipment temperature limits and project cooling design.`);
  }
  if (cellToCell_min < 5) {
    warnings.push(`The generic model estimates rapid cell-to-cell propagation (${cellToCell_min} min) for ${chemistry}; review tested barriers and suppression performance.`);
  }

  return {
    cellToCell_min,
    cellToModule_min,
    moduleToRack_min,
    basis: 'generic-screening-estimate',
    requiresUl9540aData: true,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 3. Deflagration vent area — NFPA 68 §7.4.3
// ---------------------------------------------------------------------------

/**
 * Calculate a preliminary deflagration-vent screening area for a BESS room
 * using a Bartknecht-form correlation.
 *
 * The correlation is derived from experimental data for compact enclosures
 * (length/width ≤ 3) with centrally-located ignition and uniform turbulence.
 * It is applicable when P_stat < 0.1 bar and K_G ≤ 550 bar·m/s.
 *
 * A_v = (P_stat^(-0.5682) × K_G^0.5922 × V^0.6672 × P_max^0.1723) / 1640
 *
 * where the constant 1640 reconciles SI units (bar, m) to produce A_v in m².
 *
 * @param {{
 *   volumeM3:   number,  — room volume [m³]
 *   pstatKpa:   number,  — vent opening (static activation) pressure [kPa], typically 3–10 kPa
 *   chemistry:  string,  — battery chemistry key (determines K_G and P_max)
 * }} room
 * @returns {{
 *   ventAreaM2:   number,  — screening vent area [m²]
 *   ventAreaFt2:  number,  — screening vent area [ft²]
 *   kG_barMs:     number,  — deflagration index used
 *   pMax_bar:     number,  — max unvented pressure used
 *   pStat_bar:    number,  — vent opening pressure [bar]
 *   warnings:     string[],
 * }}
 */
export function deflagrationVentArea({ volumeM3, pstatKpa = 5, chemistry = 'LFP' }) {
  const params = CHEMISTRY_PARAMS[chemistry];
  if (!params) throw new RangeError(`Unknown chemistry: ${chemistry}`);

  const warnings = [
    'Chemistry-wide K_G and P_max values are screening assumptions; use project-specific gas test data and a qualified NFPA 68 design for final vent sizing.',
  ];
  const pStat_bar = pstatKpa / 100;         // kPa → bar
  const kG = params.kG_barMs;
  const pMax = params.pMax_bar;

  // Applicability range check for the screening correlation.
  if (pStat_bar > 0.1) warnings.push(`P_stat (${pstatKpa} kPa) exceeds the 10 kPa Bartknecht correlation applicability limit; result is extrapolated.`);
  if (kG > 550)        warnings.push(`K_G (${kG} bar·m/s) exceeds the 550 bar·m/s correlation limit.`);

  // Bartknecht-form screening correlation.
  const ventAreaM2 = (
    Math.pow(pStat_bar, -0.5682) *
    Math.pow(kG, 0.5922) *
    Math.pow(volumeM3, 0.6672) *
    Math.pow(pMax, 0.1723)
  ) / 1640;

  const ventAreaFt2 = +(ventAreaM2 * 10.7639).toFixed(2);

  return {
    ventAreaM2:  +ventAreaM2.toFixed(3),
    ventAreaFt2,
    kG_barMs:    kG,
    pMax_bar:    pMax,
    pStat_bar:   +pStat_bar.toFixed(4),
    basis:       'generic-screening-estimate',
    requiresGasTestData: true,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 4. Engineering-review summary
// ---------------------------------------------------------------------------

/**
 * Aggregate engineering-review summary.
 *
 * The diagnostic comparisons help prioritize review, but the function always
 * returns `review`; it cannot approve an HMA or determine code compliance.
 *
 * @param {{
 *   separationChecks:  ReturnType<checkSeparations>,
 *   propagation:       ReturnType<propagationTiming>,
 *   ventArea:          ReturnType<deflagrationVentArea>,
 *   providedVentAreaM2: number,
 *   ratedKwh:          number,
 *   chemistry:         string,
 * }} args
 * @returns {{
 *   status:        'review',
 *   requiresEngineeringReview: true,
 *   separationOk:  null,
 *   ventOk:        null,
 *   propagationOk: null,
 *   issues:        string[],
 * }}
 */
export function hmaSummary({ separationChecks, propagation, ventArea, providedVentAreaM2, ratedKwh, chemistry }) {
  const issues = [];
  let meetsScreeningSeparation = true;
  let meetsScreeningVentArea = null;
  const meetsScreeningPropagationThreshold = propagation.moduleToRack_min >= 30;

  issues.push(
    'Engineering review required: this screening does not establish NFPA 855 compliance, an approved HMA, or UL 9540A performance.'
  );

  // Separation failures
  for (const check of separationChecks) {
    if (!check.meetsScreeningDistance) {
      meetsScreeningSeparation = false;
      issues.push(`Separation to ${check.label}: ${check.actualDistM} m is below the ${check.minDistM} m advisory screening distance; establish the project-specific requirement with the AHJ.`);
    } else if (check.margin < 0.3) {
      issues.push(`Separation to ${check.label}: only ${check.margin} m above the advisory screening distance; verify the project-specific clearance.`);
    }
  }

  // Vent area
  if (typeof providedVentAreaM2 === 'number' && providedVentAreaM2 >= 0) {
    meetsScreeningVentArea = providedVentAreaM2 >= ventArea.ventAreaM2;
    if (providedVentAreaM2 < ventArea.ventAreaM2) {
      issues.push(
        `Deflagration vent: ${providedVentAreaM2.toFixed(2)} m² provided, ` +
        `${ventArea.ventAreaM2} m² from the preliminary screening equation. Obtain project gas data and complete the NFPA 68 design.`
      );
    }
  }

  if (!meetsScreeningPropagationThreshold) {
    issues.push(
      `Module-to-rack propagation time (${propagation.moduleToRack_min} min) is less than ` +
      `the 30 min screening threshold; review UL 9540A results, suppression, and inter-module barriers.`
    );
  }

  // Collect propagation warnings
  for (const w of propagation.warnings) {
    if (!issues.includes(w)) issues.push(w);
  }
  for (const w of ventArea.warnings) {
    if (!issues.includes(w)) issues.push(w);
  }

  return {
    status: 'review',
    requiresEngineeringReview: true,
    separationOk: null,
    ventOk: null,
    propagationOk: null,
    meetsScreeningSeparation,
    meetsScreeningVentArea,
    meetsScreeningPropagationThreshold,
    issues,
  };
}

// ---------------------------------------------------------------------------
// 5. Unified study runner
// ---------------------------------------------------------------------------

/**
 * Validate study inputs, run all screening calculations, and return a structured result.
 *
 * @param {{
 *   ratedKwh:           number,   — total ESS rated energy (kWh)
 *   chemistry:          string,   — battery chemistry key
 *   cellsPerModule:     number,
 *   modulesPerRack:     number,
 *   ambientC:           number,   — ambient temperature (°C)
 *   volumeM3:           number,   — room volume (m³)
 *   pstatKpa:           number,   — vent opening pressure (kPa)
 *   providedVentAreaM2: number,   — installed vent area (m²); use 0 if unvented
 *   exposures: Array<{label: string, type: string, actualDistM: number}>,
 * }} inputs
 * @returns {{ valid: boolean, errors: string[], ...results }}
 */
export function runBessHazardStudy(inputs) {
  const errors = [];

  if (!inputs || typeof inputs !== 'object') return { valid: false, errors: ['No inputs provided.'] };

  const {
    ratedKwh,
    chemistry,
    cellsPerModule,
    modulesPerRack,
    ambientC = 25,
    volumeM3,
    pstatKpa = 5,
    providedVentAreaM2 = 0,
    exposures = [],
  } = inputs;

  // Validate
  if (!ratedKwh || ratedKwh <= 0)     errors.push('Rated energy capacity must be > 0 kWh.');
  if (!CHEMISTRY_PARAMS[chemistry])   errors.push(`Unknown chemistry "${chemistry}". Valid: ${Object.keys(CHEMISTRY_PARAMS).join(', ')}.`);
  if (!cellsPerModule || cellsPerModule < 1) errors.push('Cells per module must be ≥ 1.');
  if (!modulesPerRack || modulesPerRack < 1) errors.push('Modules per rack must be ≥ 1.');
  if (ambientC < -20 || ambientC > 60) errors.push('Ambient temperature must be between −20°C and 60°C.');
  if (!volumeM3 || volumeM3 <= 0)     errors.push('Room volume must be > 0 m³.');
  if (pstatKpa <= 0)                  errors.push('Vent opening pressure (P_stat) must be > 0 kPa.');
  if (providedVentAreaM2 < 0)         errors.push('Provided vent area cannot be negative.');

  if (errors.length) return { valid: false, errors };

  const separationChecks  = checkSeparations(ratedKwh, exposures);
  const propagation       = propagationTiming({ chemistry, cellsPerModule, modulesPerRack, ambientC });
  const ventArea          = deflagrationVentArea({ volumeM3, pstatKpa, chemistry });
  const summary           = hmaSummary({ separationChecks, propagation, ventArea, providedVentAreaM2, ratedKwh, chemistry });

  return {
    valid: true,
    errors: [],
    ratedKwh,
    chemistry,
    chemistryName: CHEMISTRY_PARAMS[chemistry].name,
    cellsPerModule,
    modulesPerRack,
    ambientC,
    volumeM3,
    pstatKpa,
    providedVentAreaM2,
    separationChecks,
    propagation,
    ventArea,
    summary,
  };
}
