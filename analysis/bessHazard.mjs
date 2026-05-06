/**
 * NFPA 855 BESS Hazard / Thermal Runaway Modeling — Gap #91
 *
 * Pure calculation module. No DOM access; persistence is handled by the page
 * JS layer (bessHazard.js).
 *
 * Standards:
 *   NFPA 855-2023  Standard for the Installation of Stationary Energy Storage Systems
 *                  §15.3 — Separation from exposures (Table 15.3.2)
 *   NFPA 68-2018   Standard on Explosion Protection by Deflagration Venting
 *                  §7.4.3 — Vent area sizing (Bartknecht correlation)
 *   UL 9540A-2023  Test Method for Evaluating Thermal Runaway Fire Propagation in
 *                  Battery Energy Storage Systems
 *                  — Cell-to-cell, module-to-module timing (lumped thermal model)
 *   IFC 1207-2020  International Fire Code Section 1207 — Energy Storage Systems
 *   NFPA 70 Art. 706  National Electric Code — Energy Storage Systems
 *
 * Module overview
 * ───────────────
 * 1. separationDistance()   — NFPA 855 §15.3 minimum separation by capacity and exposure type
 * 2. propagationTiming()    — UL 9540A lumped thermal-mass model for runaway cascade timing
 * 3. deflagrationVentArea() — NFPA 68 §7.4.3 Bartknecht correlation for required vent area
 * 4. hmaSummary()           — Aggregate HMA pass/warn/fail from exposures + vent check
 * 5. runBessHazardStudy()   — Unified entry point; validates inputs, returns structured result
 *
 * Disclaimer: This module implements published engineering correlations for screening
 * purposes. A final Hazard Mitigation Analysis per NFPA 855 §15.3 must be prepared
 * by a qualified engineer and reviewed by the AHJ.
 */

// ---------------------------------------------------------------------------
// Chemistry parameters
// ---------------------------------------------------------------------------

/**
 * Battery chemistry parameters for thermal-runaway and deflagration modeling.
 *
 * kG_barMs:       Deflagration index K_G [bar·m/s] for typical off-gas composition
 *                 from UL 9540A cell-level testing; LFP off-gas is CO₂/CO dominant
 *                 (lower K_G); NCA produces more volatile organics (higher K_G).
 * pMax_bar:       Maximum pressure in an unvented enclosure during deflagration [bar]
 *                 from NFPA 68 Annex B and literature (worst-case stoichiometric).
 * propagBase_min: Base cell-to-adjacent-cell thermal runaway propagation time [min]
 *                 at 25°C ambient, from published UL 9540A test data ranges.
 *                 Conservative (low) end of typical published ranges is used.
 */
export const CHEMISTRY_PARAMS = Object.freeze({
  LFP:         { name: 'LiFePO₄ (LFP)',   kG_barMs: 50,  pMax_bar: 4.0, propagBase_min: 20 },
  NMC:         { name: 'NMC (NiMnCo)',     kG_barMs: 120, pMax_bar: 5.5, propagBase_min: 8  },
  NCA:         { name: 'NCA (NiCoAl)',     kG_barMs: 200, pMax_bar: 6.5, propagBase_min: 4  },
  'lead-acid': { name: 'Lead-Acid (VRLA)', kG_barMs: 450, pMax_bar: 6.9, propagBase_min: 30 },
  NiCd:        { name: 'NiCd',             kG_barMs: 400, pMax_bar: 6.5, propagBase_min: 15 },
});

// ---------------------------------------------------------------------------
// NFPA 855 §15.3 separation distance table
// ---------------------------------------------------------------------------

/**
 * Minimum separation distances from NFPA 855-2023 §15.3 / Table 15.3.2.
 *
 * Keyed by exposure type. Each array is evaluated in order; the first entry
 * whose maxKwh ≥ system rated capacity is used.
 *
 * Values in metres:
 *   property_line   : 0.9 m (3 ft) for ≤ 50 kWh; 1.5 m (5 ft) for > 50 kWh
 *   occupied_building: 1.5 m (5 ft) for ≤ 50 kWh; 3.0 m (10 ft) for > 50 kWh
 *   ignition_source : 0.9 m (3 ft) for all capacities (NFPA 855 §15.3.3)
 */
export const SEPARATION_TABLE = Object.freeze({
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

export const EXPOSURE_TYPES = Object.freeze([
  { value: 'property_line',    label: 'Property Line' },
  { value: 'occupied_building', label: 'Occupied Building' },
  { value: 'ignition_source',  label: 'Ignition / Electrical Source' },
]);

// ---------------------------------------------------------------------------
// 1. Separation distance — NFPA 855 §15.3
// ---------------------------------------------------------------------------

/**
 * Return the NFPA 855 §15.3 minimum separation distance for a given exposure
 * type and system rated energy capacity.
 *
 * @param {'property_line'|'occupied_building'|'ignition_source'} exposureType
 * @param {number} ratedKwh — total ESS rated energy capacity (kWh)
 * @returns {{ minDistM: number, minDistFt: number }} required clearance
 */
export function separationDistance(exposureType, ratedKwh) {
  const table = SEPARATION_TABLE[exposureType];
  if (!table) throw new RangeError(`Unknown exposure type: ${exposureType}`);
  const entry = table.find(e => ratedKwh <= e.maxKwh);
  const minDistM = entry ? entry.minDistM : table[table.length - 1].minDistM;
  return {
    minDistM,
    minDistFt: +(minDistM * 3.28084).toFixed(1),
  };
}

/**
 * Check a list of exposure objects against NFPA 855 §15.3 separation requirements.
 *
 * @param {number} ratedKwh — total system rated energy (kWh)
 * @param {Array<{label: string, type: string, actualDistM: number}>} exposures
 * @returns {Array<{label, type, actualDistM, actualDistFt, minDistM, minDistFt, pass, status}>}
 */
export function checkSeparations(ratedKwh, exposures = []) {
  return exposures.map(exp => {
    const { minDistM, minDistFt } = separationDistance(exp.type, ratedKwh);
    const pass = exp.actualDistM >= minDistM;
    const margin = +(exp.actualDistM - minDistM).toFixed(2);
    return {
      label:       exp.label || exp.type,
      type:        exp.type,
      actualDistM: +exp.actualDistM.toFixed(2),
      actualDistFt: +(exp.actualDistM * 3.28084).toFixed(1),
      minDistM,
      minDistFt,
      margin,
      pass,
      status: pass ? (margin < 0.3 ? 'warn' : 'pass') : 'fail',
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Thermal runaway propagation — UL 9540A lumped thermal model
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
 * simplified UL 9540A lumped thermal-mass model.
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

  const warnings = [];
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
    warnings.push(`Ambient temperature ${ambientC}°C is above 40°C — verify cooling provisions per NFPA 855 §15.6.`);
  }
  if (cellToCell_min < 5) {
    warnings.push(`Very rapid cell-to-cell propagation (${cellToCell_min} min) for ${chemistry} chemistry — consider enhanced thermal barriers per UL 9540A §8.`);
  }

  return { cellToCell_min, cellToModule_min, moduleToRack_min, warnings };
}

// ---------------------------------------------------------------------------
// 3. Deflagration vent area — NFPA 68 §7.4.3
// ---------------------------------------------------------------------------

/**
 * Calculate the required deflagration vent area for a BESS room using the
 * NFPA 68-2018 §7.4.3.2 Bartknecht correlation.
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
 *   ventAreaM2:   number,  — required vent area [m²]
 *   ventAreaFt2:  number,  — required vent area [ft²]
 *   kG_barMs:     number,  — deflagration index used
 *   pMax_bar:     number,  — max unvented pressure used
 *   pStat_bar:    number,  — vent opening pressure [bar]
 *   warnings:     string[],
 * }}
 */
export function deflagrationVentArea({ volumeM3, pstatKpa = 5, chemistry = 'LFP' }) {
  const params = CHEMISTRY_PARAMS[chemistry];
  if (!params) throw new RangeError(`Unknown chemistry: ${chemistry}`);

  const warnings = [];
  const pStat_bar = pstatKpa / 100;         // kPa → bar
  const kG = params.kG_barMs;
  const pMax = params.pMax_bar;

  // Applicability range check (NFPA 68 §7.4.3.2 limits)
  if (pStat_bar > 0.1) warnings.push(`P_stat (${pstatKpa} kPa) exceeds the 10 kPa Bartknecht correlation applicability limit; result is extrapolated.`);
  if (kG > 550)        warnings.push(`K_G (${kG} bar·m/s) exceeds the 550 bar·m/s correlation limit.`);

  // Bartknecht correlation — NFPA 68-2018 §7.4.3.2 Eq.
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
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 4. HMA summary
// ---------------------------------------------------------------------------

/**
 * Aggregate Hazard Mitigation Analysis (HMA) summary.
 *
 * Produces an overall compliance status from:
 *   - Separation checks (any fail → overall fail)
 *   - Vent area check (providedVentAreaM2 vs. required; fail if insufficient)
 *   - Propagation timing (warn if moduleToRack_min < 30 min per NFPA 855 guidance)
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
 *   status:        'pass'|'warn'|'fail',
 *   separationOk:  boolean,
 *   ventOk:        boolean,
 *   propagationOk: boolean,
 *   issues:        string[],
 * }}
 */
export function hmaSummary({ separationChecks, propagation, ventArea, providedVentAreaM2, ratedKwh, chemistry }) {
  const issues = [];
  let separationOk = true;
  let ventOk = true;
  let propagationOk = true;

  // Separation failures
  for (const check of separationChecks) {
    if (check.status === 'fail') {
      separationOk = false;
      issues.push(`Separation to ${check.label}: ${check.actualDistM} m provided, ${check.minDistM} m required (NFPA 855 §15.3).`);
    } else if (check.status === 'warn') {
      issues.push(`Separation to ${check.label}: only ${check.margin} m margin above NFPA 855 §15.3 minimum — monitor for encroachment.`);
    }
  }

  // Vent area
  if (typeof providedVentAreaM2 === 'number' && providedVentAreaM2 >= 0) {
    if (providedVentAreaM2 < ventArea.ventAreaM2) {
      ventOk = false;
      issues.push(
        `Deflagration vent: ${providedVentAreaM2.toFixed(2)} m² provided, ` +
        `${ventArea.ventAreaM2} m² required per NFPA 68 §7.4.3 — add vent area.`
      );
    }
  }

  // Propagation timing (NFPA 855 §15.9 requires HMA to address propagation to adjacent units)
  if (propagation.moduleToRack_min < 30) {
    propagationOk = false;
    issues.push(
      `Module-to-rack propagation time (${propagation.moduleToRack_min} min) is less than ` +
      `30 min — consider automatic suppression or inter-module barriers per NFPA 855 §15.9.`
    );
  }

  // Collect propagation warnings
  for (const w of propagation.warnings) {
    if (!issues.includes(w)) issues.push(w);
  }
  for (const w of ventArea.warnings) {
    if (!issues.includes(w)) issues.push(w);
  }

  const status = (!separationOk || !ventOk || !propagationOk) ? 'fail'
    : issues.length > 0 ? 'warn'
    : 'pass';

  return { status, separationOk, ventOk, propagationOk, issues };
}

// ---------------------------------------------------------------------------
// 5. Unified study runner
// ---------------------------------------------------------------------------

/**
 * Validate study inputs, run all HMA calculations, and return a structured result.
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
