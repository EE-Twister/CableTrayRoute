/**
 * Battery / UPS Sizing per IEEE 485-2010 / IEEE 1115-2000
 *
 * Standard stationary battery sizing workflow (IEEE 485-2010):
 *   1. Compute net energy from load profile:  kWh_net = Σ(P_i × Δt_i)
 *   2. Derate for efficiency and depth of discharge:
 *        kWh_design = kWh_net / (η × DoD)
 *   3. Apply temperature correction (IEEE 485 §5.2):
 *        K_temp = min(1.0, 1 + coeff × (T_amb − 25))
 *        kWh_temp = kWh_design / K_temp
 *   4. Apply aging factor (IEEE 485 §5.3):
 *        kWh_aged = kWh_temp × aging_factor
 *   5. Apply design margin (IEEE 485 §5.4):
 *        kWh_final = kWh_aged × (1 + margin% / 100)
 *
 * References:
 *   IEEE 485-2010  — Recommended Practice for Sizing Lead-Acid Batteries for
 *                    Stationary Applications
 *   IEEE 1115-2000 — Recommended Practice for Sizing Nickel-Cadmium Batteries
 *                    for Stationary Applications
 *   IEEE 1115-2014 — (revised) Nickel-Cadmium battery sizing
 */

/**
 * Battery chemistry parameters.
 * η       — round-trip charge/discharge efficiency
 * dod     — usable depth of discharge (design limit, not absolute maximum)
 * coeff   — IEEE 485 §5.2 temperature coefficient per °C relative to 25 °C
 * agingFactor — IEEE 485 §5.3 capacity multiplier to account for end-of-life capacity
 *               (replace when capacity falls to ~80% of nameplate)
 */
export const CHEMISTRY = {
  'lead-acid-flooded': {
    eta: 0.85,
    dod: 0.70,
    coeff: 0.008,
    agingFactor: 1.25,
    label: 'Lead-Acid (Flooded)',
  },
  'lead-acid-agm': {
    eta: 0.85,
    dod: 0.80,
    coeff: 0.008,
    agingFactor: 1.25,
    label: 'Lead-Acid (AGM)',
  },
  'lithium-ion': {
    eta: 0.95,
    dod: 0.90,
    coeff: 0.003,
    agingFactor: 1.20,
    label: 'Lithium-Ion',
  },
  'nickel-cadmium': {
    eta: 0.80,
    dod: 0.80,
    coeff: 0.006,
    agingFactor: 1.20,
    label: 'Nickel-Cadmium (NiCd)',
  },
};

/** Standard battery bank energy ratings (kWh) from common manufacturer offerings. */
export const STANDARD_BANK_KWH = [
  10, 15, 20, 25, 30, 40, 50, 60, 75, 100,
  120, 150, 200, 250, 300, 400, 500, 600, 750, 1000,
];

/** Standard UPS kVA ratings per common manufacturer product lines. */
export const STANDARD_UPS_KVA = [
  1, 2, 3, 5, 6, 7.5, 10, 15, 20, 30, 40, 50,
  60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 750, 1000,
];

/**
 * IEEE 485 §5.2 temperature correction factor.
 *
 * Battery capacity decreases at temperatures below 25 °C. K_temp < 1.0 in cold
 * environments means the installed bank must be oversized to compensate.
 * At temperatures above 25 °C the formula would give K_temp > 1.0, but IEEE 485
 * does not credit extra capacity (elevated temperature shortens cycle life);
 * therefore K_temp is capped at 1.0.
 *
 * K_temp = min(1.0,  1 + coeff × (T_amb − 25))
 *
 * @param {string} chemistry  Key from CHEMISTRY map
 * @param {number} ambientTempC  Ambient temperature in °C
 * @returns {number} Temperature correction factor K_temp (0.5–1.0)
 */
export function temperatureFactor(chemistry, ambientTempC) {
  const chem = CHEMISTRY[chemistry];
  if (!chem) {
    throw new Error(
      `Unknown chemistry "${chemistry}". ` +
      `Valid values: ${Object.keys(CHEMISTRY).join(', ')}.`
    );
  }
  const raw = 1 + chem.coeff * (ambientTempC - 25);
  // Cap at 1.0 (no credit above 25 °C) and floor at 0.5 (below −100 °C is unrealistic)
  return Math.min(1.0, Math.max(0.5, raw));
}

/**
 * Compute net energy (kWh) from a multi-period duty cycle.
 *
 * Each period is a time interval of constant-power discharge:
 *   { powerKw: number, durationHours: number }
 *
 * For a uniform constant load over a single runtime use:
 *   [{ powerKw: P, durationHours: t }]
 *
 * @param {{ powerKw: number, durationHours: number }[]} loadProfilePeriods
 * @returns {number} Total net energy drawn (kWh)
 */
export function requiredEnergyKwh(loadProfilePeriods) {
  if (!Array.isArray(loadProfilePeriods) || loadProfilePeriods.length === 0) {
    throw new Error('loadProfilePeriods must be a non-empty array of {powerKw, durationHours} objects.');
  }
  let total = 0;
  loadProfilePeriods.forEach((period, i) => {
    if (typeof period.powerKw !== 'number' || period.powerKw <= 0) {
      throw new Error(`Period [${i}]: powerKw must be a positive number (got ${period.powerKw}).`);
    }
    if (typeof period.durationHours !== 'number' || period.durationHours <= 0) {
      throw new Error(`Period [${i}]: durationHours must be a positive number (got ${period.durationHours}).`);
    }
    total += period.powerKw * period.durationHours;
  });
  return Math.round(total * 10000) / 10000;
}

/**
 * Apply IEEE 485 sizing factors to the net energy requirement, producing the
 * final required battery bank capacity (kWh).
 *
 * Steps:
 *   kWh_design = kWh_net / (η × DoD)                      — efficiency + DoD
 *   K_temp     = temperatureFactor(chemistry, T_amb)
 *   kWh_temp   = kWh_design / K_temp                      — cold de-rating
 *   kWh_aged   = kWh_temp × agingFactor                   — end-of-life reserve
 *   kWh_final  = kWh_aged × (1 + designMarginPct / 100)   — design margin
 *
 * @param {number} kwhNet          Net energy from requiredEnergyKwh() (kWh, > 0)
 * @param {string} chemistry       Key from CHEMISTRY map
 * @param {number} ambientTempC    Ambient temperature (°C)
 * @param {number} designMarginPct Additional design margin percentage (≥ 0, default 10)
 * @returns {{
 *   kwhDesign: number,
 *   kTempFactor: number,
 *   kwhTempCorrected: number,
 *   agingFactor: number,
 *   kwhWithAging: number,
 *   kwhFinal: number,
 *   dod: number,
 *   eta: number,
 * }}
 */
export function designCapacityKwh(kwhNet, chemistry, ambientTempC, designMarginPct = 10) {
  if (kwhNet <= 0) throw new Error('kwhNet must be greater than zero.');
  const chem = CHEMISTRY[chemistry];
  if (!chem) {
    throw new Error(
      `Unknown chemistry "${chemistry}". ` +
      `Valid values: ${Object.keys(CHEMISTRY).join(', ')}.`
    );
  }
  if (designMarginPct < 0) throw new Error('designMarginPct must be ≥ 0.');

  const kwhDesign = kwhNet / (chem.eta * chem.dod);
  const kTempFactor = temperatureFactor(chemistry, ambientTempC);
  const kwhTempCorrected = kwhDesign / kTempFactor;
  const kwhWithAging = kwhTempCorrected * chem.agingFactor;
  const kwhFinal = kwhWithAging * (1 + designMarginPct / 100);

  return {
    kwhDesign:        Math.round(kwhDesign * 100) / 100,
    kTempFactor:      Math.round(kTempFactor * 10000) / 10000,
    kwhTempCorrected: Math.round(kwhTempCorrected * 100) / 100,
    agingFactor:      chem.agingFactor,
    kwhWithAging:     Math.round(kwhWithAging * 100) / 100,
    kwhFinal:         Math.round(kwhFinal * 100) / 100,
    dod:              chem.dod,
    eta:              chem.eta,
  };
}

/**
 * Select the recommended standard battery bank size (kWh).
 *
 * Returns the smallest standard size from STANDARD_BANK_KWH that meets or exceeds
 * the required capacity. If the requirement exceeds the largest standard size the
 * largest entry is returned and `exceedsStandard` is set to true.
 *
 * @param {number} kwhRequired  Required bank capacity (kWh, ≥ 0)
 * @returns {{
 *   selectedKwh: number,
 *   nextLargerKwh: number|null,
 *   exceedsStandard: boolean,
 *   options: number[],
 * }}
 */
export function standardBankSize(kwhRequired) {
  if (kwhRequired < 0) throw new Error('kwhRequired must be ≥ 0.');

  const found = STANDARD_BANK_KWH.find(s => s >= kwhRequired);
  const selectedKwh = found ?? STANDARD_BANK_KWH[STANDARD_BANK_KWH.length - 1];
  const exceedsStandard = !found;

  const idx = STANDARD_BANK_KWH.indexOf(selectedKwh);
  const nextLargerKwh = idx + 1 < STANDARD_BANK_KWH.length
    ? STANDARD_BANK_KWH[idx + 1]
    : null;

  // Return nearby options window (one below to two above selected)
  const optIdx = Math.max(0, idx - 1);
  const options = STANDARD_BANK_KWH.slice(optIdx, idx + 3);

  return { selectedKwh, nextLargerKwh, exceedsStandard, options };
}

/**
 * Compute the available runtime at a range of load levels for the selected battery bank.
 *
 * usable_kWh = selectedKwh × DoD × η
 * runtime_hours(fraction) = usable_kWh / (nominalLoadKw × fraction)
 *
 * @param {number} kwhSelected   Installed bank capacity (kWh, > 0)
 * @param {number} nominalLoadKw Average / rated load (kW, > 0) — the 100% reference
 * @param {string} chemistry     Key from CHEMISTRY map
 * @returns {{ loadFraction: number, loadKw: number, runtimeHours: number }[]}
 */
export function runtimeCurve(kwhSelected, nominalLoadKw, chemistry) {
  if (kwhSelected <= 0) throw new Error('kwhSelected must be greater than zero.');
  if (nominalLoadKw <= 0) throw new Error('nominalLoadKw must be greater than zero.');
  const chem = CHEMISTRY[chemistry];
  if (!chem) {
    throw new Error(
      `Unknown chemistry "${chemistry}". ` +
      `Valid values: ${Object.keys(CHEMISTRY).join(', ')}.`
    );
  }

  const usableKwh = kwhSelected * chem.dod * chem.eta;
  const fractions = [0.25, 0.50, 0.75, 1.00, 1.25];

  return fractions.map(f => ({
    loadFraction: f,
    loadKw: Math.round(nominalLoadKw * f * 100) / 100,
    runtimeHours: Math.round((usableKwh / (nominalLoadKw * f)) * 1000) / 1000,
  }));
}

/**
 * Determine the required UPS kVA rating from the peak load and UPS output power factor.
 *
 * kVA_required = P_peak_kW / PF_UPS
 *
 * Selects the smallest standard UPS kVA from STANDARD_UPS_KVA ≥ kVA_required.
 *
 * @param {number} peakKw         Peak load in kW (> 0)
 * @param {number} upsPowerFactor UPS output power factor (0 < PF ≤ 1, default 0.9)
 * @returns {{ kvaRequired: number, standardKva: number, powerFactor: number }}
 */
export function upsKvaRequired(peakKw, upsPowerFactor = 0.9) {
  if (peakKw <= 0) throw new Error('peakKw must be greater than zero.');
  if (upsPowerFactor <= 0 || upsPowerFactor > 1) {
    throw new Error('upsPowerFactor must be in (0, 1].');
  }

  const kvaRequired = peakKw / upsPowerFactor;
  const standardKva = STANDARD_UPS_KVA.find(s => s >= kvaRequired)
    ?? STANDARD_UPS_KVA[STANDARD_UPS_KVA.length - 1];

  return {
    kvaRequired: Math.round(kvaRequired * 100) / 100,
    standardKva,
    powerFactor: upsPowerFactor,
  };
}

/**
 * Run a complete battery / UPS sizing analysis per IEEE 485-2010.
 *
 * Applies all five IEEE 485 sizing steps and returns a unified result object.
 * Does NOT read from or write to the data store — the caller (battery.js) is
 * responsible for persistence.
 *
 * @param {object}  inputs
 * @param {string}  [inputs.systemLabel]          Descriptive system / bus label (optional)
 * @param {number}   inputs.averageLoadKw         Average continuous load (kW, > 0)
 * @param {number}   inputs.peakLoadKw            Peak instantaneous load for UPS sizing (kW, > 0)
 * @param {number}   inputs.runtimeHours          Required discharge duration (hours, > 0)
 * @param {string}   inputs.chemistry             Battery chemistry key
 * @param {number}  [inputs.ambientTempC=25]      Ambient temperature (°C, default 25)
 * @param {number}  [inputs.designMarginPct=10]   Design margin percentage (default 10)
 * @param {number}  [inputs.upsPowerFactor=0.9]   UPS output power factor (default 0.9)
 * @param {{ powerKw: number, durationHours: number }[]} [inputs.loadProfilePeriods]
 *   Optional multi-period duty cycle. When provided, overrides averageLoadKw × runtimeHours
 *   for the net energy calculation. The averageLoadKw is still used for the runtime curve.
 * @returns {object} Full analysis result
 */
export function runBatterySizingAnalysis(inputs) {
  const {
    systemLabel = '',
    averageLoadKw,
    peakLoadKw,
    runtimeHours,
    chemistry,
    ambientTempC = 25,
    designMarginPct = 10,
    upsPowerFactor = 0.9,
    loadProfilePeriods,
  } = inputs;

  // --- Input validation ---
  if (!averageLoadKw || averageLoadKw <= 0) throw new Error('averageLoadKw must be greater than zero.');
  if (!peakLoadKw || peakLoadKw <= 0)   throw new Error('peakLoadKw must be greater than zero.');
  if (!runtimeHours || runtimeHours <= 0) throw new Error('runtimeHours must be greater than zero.');
  if (!CHEMISTRY[chemistry]) {
    throw new Error(
      `Unknown chemistry "${chemistry}". ` +
      `Valid values: ${Object.keys(CHEMISTRY).join(', ')}.`
    );
  }

  const warnings = [];

  // --- Step 1: Net energy ---
  let kwhNet;
  let usingDutyCycle = false;
  if (Array.isArray(loadProfilePeriods) && loadProfilePeriods.length > 0) {
    kwhNet = requiredEnergyKwh(loadProfilePeriods);
    usingDutyCycle = true;
    warnings.push(
      'Multi-period duty cycle provided — net energy computed from duty cycle periods ' +
      '(averageLoadKw × runtimeHours not used for energy calculation).'
    );
  } else {
    kwhNet = Math.round(averageLoadKw * runtimeHours * 10000) / 10000;
  }

  // --- Step 2–5: Design capacity ---
  const cap = designCapacityKwh(kwhNet, chemistry, ambientTempC, designMarginPct);

  // --- Step 6: Standard bank size ---
  const bank = standardBankSize(cap.kwhFinal);

  // --- Step 7: Runtime curve ---
  const runtimeCurvePoints = runtimeCurve(bank.selectedKwh, averageLoadKw, chemistry);

  // --- Step 8: UPS kVA ---
  const ups = upsKvaRequired(peakLoadKw, upsPowerFactor);

  // --- Warnings ---
  if (ambientTempC < 0) {
    warnings.push(
      `Ambient temperature ${ambientTempC} °C is below freezing. ` +
      "Verify the manufacturer's cold-start temperature rating and consider battery heating."
    );
  }
  if (chemistry === 'lead-acid-flooded' && ambientTempC < 10) {
    warnings.push(
      'Lead-acid flooded cells require thermal management below 10 °C. ' +
      'Consider AGM or Lithium-Ion for cold environments.'
    );
  }
  if (cap.kTempFactor < 0.85) {
    warnings.push(
      `Temperature correction factor K_temp = ${cap.kTempFactor} (>${Math.round((1 / cap.kTempFactor - 1) * 100)}% ` +
      'capacity increase needed). Consider a battery room heating system to reduce bank size.'
    );
  }
  if (cap.kwhFinal > 750) {
    warnings.push(
      `Required capacity (${cap.kwhFinal} kWh) is large. Consider paralleling multiple battery ` +
      'strings rather than a single oversized bank for maintainability and availability.'
    );
  }
  if (peakLoadKw > averageLoadKw * 3) {
    warnings.push(
      `Peak load (${peakLoadKw} kW) is more than 3× the average load (${averageLoadKw} kW). ` +
      'Verify this ratio is realistic; a very high peak-to-average ratio may indicate a duty ' +
      'cycle that should be entered as multi-period rather than a simple uniform load.'
    );
  }
  if (bank.exceedsStandard) {
    warnings.push(
      `Required capacity (${cap.kwhFinal} kWh) exceeds the largest standard bank size ` +
      `(${STANDARD_BANK_KWH[STANDARD_BANK_KWH.length - 1]} kWh). ` +
      'Multiple parallel battery strings will be required. Consult a specialist.'
    );
  }

  const chemObj = CHEMISTRY[chemistry];

  return {
    systemLabel,
    chemistry,
    chemistryLabel: chemObj.label,
    averageLoadKw,
    peakLoadKw,
    runtimeHours,
    ambientTempC,
    designMarginPct,
    upsPowerFactor,
    usingDutyCycle,
    // Energy chain
    kwhNet,
    kwhDesign:        cap.kwhDesign,
    kTempFactor:      cap.kTempFactor,
    kwhTempCorrected: cap.kwhTempCorrected,
    agingFactor:      cap.agingFactor,
    kwhWithAging:     cap.kwhWithAging,
    kwhFinal:         cap.kwhFinal,
    dod:              cap.dod,
    eta:              cap.eta,
    // Selected hardware
    selectedBankKwh:  bank.selectedKwh,
    nextLargerKwh:    bank.nextLargerKwh,
    bankOptions:      bank.options,
    exceedsStandard:  bank.exceedsStandard,
    // Runtime curve
    runtimeCurvePoints,
    // UPS sizing
    kvaRequired:  ups.kvaRequired,
    standardKva:  ups.standardKva,
    // Metadata
    warnings,
    timestamp: new Date().toISOString(),
  };
}
