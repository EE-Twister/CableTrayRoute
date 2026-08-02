/**
 * Preliminary Battery / UPS Energy Screening
 *
 * Generic energy-screening workflow:
 *   1. Compute net energy from load profile:  kWh_net = Σ(P_i × Δt_i)
 *   2. Derate for efficiency and depth of discharge:
 *        kWh_design = kWh_net / (η × DoD)
 *   3. Apply an assumed linear temperature correction:
 *        K_temp = min(1.0, 1 + coeff × (T_amb − 25))
 *        kWh_temp = kWh_design / K_temp
 *   4. Apply an assumed aging factor:
 *        kWh_aged = kWh_temp × aging_factor
 *   5. Apply a user-entered design margin:
 *        kWh_final = kWh_aged × (1 + margin% / 100)
 *
 * This is not an IEEE 485 or IEEE 1115 cell-sizing implementation. Final sizing
 * requires a defined dc duty cycle, end voltage, and manufacturer discharge
 * performance data for the selected cell. IEEE 485-2020 applies to lead-acid
 * batteries; it does not apply to lithium-ion batteries.
 */

/**
 * Battery chemistry parameters.
 * η       — round-trip charge/discharge efficiency
 * dod     — usable depth of discharge (design limit, not absolute maximum)
 * coeff   — generic screening temperature coefficient per °C relative to 25 °C
 * agingFactor — assumed capacity multiplier to account for end-of-life capacity
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
 * Generic screening temperature correction factor.
 *
 * Battery capacity decreases at temperatures below 25 °C. K_temp < 1.0 in cold
 * environments means the installed bank must be oversized to compensate.
 * At temperatures above 25 °C the formula would give K_temp > 1.0. Screening
 * does not credit that increase because elevated temperature shortens life.
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
 * Apply generic screening factors to the net energy requirement.
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

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Validate and normalize a manufacturer discharge-current table.
 *
 * Each row represents the current delivered by a reference-capacity cell or
 * string for a stated duration at one documented end voltage and temperature.
 * The caller supplies the reference capacity separately; no manufacturer data
 * or hidden generic curve is embedded in this module.
 *
 * @param {{durationMinutes:number, ampsPerReferenceCapacity?:number, ampsPer100Ah?:number}[]} rows
 * @returns {{durationMinutes:number, ampsPerReferenceCapacity:number}[]}
 */
export function normalizeManufacturerDischargeTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('manufacturerDischargeTable must contain at least two duration/current rows.');
  }

  const normalized = rows.map((row, index) => {
    const durationMinutes = Number(row?.durationMinutes);
    const ampsPerReferenceCapacity = Number(
      row?.ampsPerReferenceCapacity ?? row?.ampsPer100Ah
    );
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new Error(`Manufacturer discharge row [${index}]: durationMinutes must be greater than zero.`);
    }
    if (!Number.isFinite(ampsPerReferenceCapacity) || ampsPerReferenceCapacity <= 0) {
      throw new Error(`Manufacturer discharge row [${index}]: current must be greater than zero.`);
    }
    return { durationMinutes, ampsPerReferenceCapacity };
  }).sort((a, b) => a.durationMinutes - b.durationMinutes);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].durationMinutes === normalized[index - 1].durationMinutes) {
      throw new Error(`Manufacturer discharge table has duplicate duration ${normalized[index].durationMinutes} minutes.`);
    }
    if (normalized[index].ampsPerReferenceCapacity > normalized[index - 1].ampsPerReferenceCapacity) {
      throw new Error('Manufacturer discharge current must not increase as duration increases.');
    }
  }
  return normalized;
}

/**
 * Interpolate discharge current on log-log axes between manufacturer points.
 * Extrapolation is deliberately rejected because it would invent performance
 * outside the supplied product data.
 */
export function interpolateManufacturerDischargeCurrent(rows, durationMinutes) {
  const table = normalizeManufacturerDischargeTable(rows);
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('durationMinutes must be greater than zero.');
  }
  const first = table[0];
  const last = table[table.length - 1];
  if (duration < first.durationMinutes || duration > last.durationMinutes) {
    throw new Error(
      `Manufacturer discharge table does not cover ${round(duration, 3)} minutes ` +
      `(available range ${first.durationMinutes}-${last.durationMinutes} minutes).`
    );
  }
  const exact = table.find(row => row.durationMinutes === duration);
  if (exact) return exact.ampsPerReferenceCapacity;

  const upperIndex = table.findIndex(row => row.durationMinutes > duration);
  const lower = table[upperIndex - 1];
  const upper = table[upperIndex];
  const fraction = (
    Math.log(duration) - Math.log(lower.durationMinutes)
  ) / (
    Math.log(upper.durationMinutes) - Math.log(lower.durationMinutes)
  );
  const current = Math.exp(
    Math.log(lower.ampsPerReferenceCapacity) +
    fraction * (Math.log(upper.ampsPerReferenceCapacity) - Math.log(lower.ampsPerReferenceCapacity))
  );
  return round(current, 6);
}

/**
 * Size a stationary battery from a sequential dc duty cycle and a documented
 * manufacturer discharge table.
 *
 * For every duty-cycle section endpoint, load changes are superimposed against
 * the manufacturer's current capability at the remaining duration. The
 * controlling section establishes the minimum reference capacity. Explicit
 * temperature, end-of-life, and design-margin factors are then applied.
 *
 * This is a transparent manufacturer-data calculation aid. It does not claim
 * IEEE compliance, because load classification, random-load placement, cell
 * qualification, and project acceptance remain project-specific.
 */
export function sizeManufacturerDutyCycle({
  dutyCyclePeriods,
  manufacturerDischargeTable,
  referenceCapacityAh,
  temperatureCapacityFactor,
  endOfLifeCapacityPct,
  designMarginPct = 0,
  candidateCellCapacityAh,
  dcBusVoltageV,
}) {
  if (!Array.isArray(dutyCyclePeriods) || dutyCyclePeriods.length === 0) {
    throw new Error('dutyCyclePeriods must be a non-empty array of {currentA, durationMinutes} rows.');
  }
  const periods = dutyCyclePeriods.map((period, index) => {
    const currentA = Number(period?.currentA);
    const durationMinutes = Number(period?.durationMinutes);
    if (!Number.isFinite(currentA) || currentA < 0) {
      throw new Error(`Duty-cycle period [${index}]: currentA must be zero or greater.`);
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new Error(`Duty-cycle period [${index}]: durationMinutes must be greater than zero.`);
    }
    return { currentA, durationMinutes };
  });
  if (!periods.some(period => period.currentA > 0)) {
    throw new Error('dutyCyclePeriods must include at least one positive current.');
  }

  const table = normalizeManufacturerDischargeTable(manufacturerDischargeTable);
  const referenceAh = Number(referenceCapacityAh);
  const temperatureFactorValue = Number(temperatureCapacityFactor);
  const endOfLifePct = Number(endOfLifeCapacityPct);
  const marginPct = Number(designMarginPct);
  const candidateAh = Number(candidateCellCapacityAh);
  const busVoltage = Number(dcBusVoltageV);
  if (!Number.isFinite(referenceAh) || referenceAh <= 0) {
    throw new Error('referenceCapacityAh must be greater than zero.');
  }
  if (!Number.isFinite(temperatureFactorValue) || temperatureFactorValue <= 0 || temperatureFactorValue > 1) {
    throw new Error('temperatureCapacityFactor must be in (0, 1].');
  }
  if (!Number.isFinite(endOfLifePct) || endOfLifePct <= 0 || endOfLifePct > 100) {
    throw new Error('endOfLifeCapacityPct must be in (0, 100].');
  }
  if (!Number.isFinite(marginPct) || marginPct < 0) {
    throw new Error('designMarginPct must be zero or greater.');
  }
  if (!Number.isFinite(candidateAh) || candidateAh <= 0) {
    throw new Error('candidateCellCapacityAh must be greater than zero.');
  }
  if (!Number.isFinite(busVoltage) || busVoltage <= 0) {
    throw new Error('dcBusVoltageV must be greater than zero.');
  }

  const starts = [];
  let elapsed = 0;
  periods.forEach(period => {
    starts.push(elapsed);
    elapsed += period.durationMinutes;
  });
  const correctionMultiplier = (
    (1 / temperatureFactorValue) *
    (100 / endOfLifePct) *
    (1 + marginPct / 100)
  );

  const sections = periods.map((period, sectionIndex) => {
    const endMinutes = starts[sectionIndex] + period.durationMinutes;
    let referenceUnits = 0;
    const contributions = [];
    for (let loadIndex = 0; loadIndex <= sectionIndex; loadIndex += 1) {
      const previousCurrent = loadIndex === 0 ? 0 : periods[loadIndex - 1].currentA;
      const deltaCurrentA = periods[loadIndex].currentA - previousCurrent;
      const remainingDurationMinutes = endMinutes - starts[loadIndex];
      const ratedCurrentA = interpolateManufacturerDischargeCurrent(table, remainingDurationMinutes);
      const referenceUnitContribution = deltaCurrentA / ratedCurrentA;
      referenceUnits += referenceUnitContribution;
      contributions.push({
        loadStep: loadIndex + 1,
        deltaCurrentA: round(deltaCurrentA, 4),
        remainingDurationMinutes: round(remainingDurationMinutes, 4),
        ratedCurrentA: round(ratedCurrentA, 4),
        referenceUnitContribution: round(referenceUnitContribution, 6),
      });
    }
    const rawRequiredCapacityAh = Math.max(0, referenceUnits * referenceAh);
    return {
      section: sectionIndex + 1,
      endMinutes: round(endMinutes, 4),
      loadCurrentA: period.currentA,
      rawRequiredCapacityAh: round(rawRequiredCapacityAh, 4),
      correctedRequiredCapacityAh: round(rawRequiredCapacityAh * correctionMultiplier, 4),
      contributions,
    };
  });

  const controllingSection = sections.reduce((current, section) => (
    section.correctedRequiredCapacityAh > current.correctedRequiredCapacityAh ? section : current
  ));
  const requiredCapacityAh = controllingSection.correctedRequiredCapacityAh;
  const requiredParallelStrings = Math.max(1, Math.ceil(requiredCapacityAh / candidateAh));
  const installedCapacityAh = requiredParallelStrings * candidateAh;

  return {
    periods,
    manufacturerDischargeTable: table,
    referenceCapacityAh: referenceAh,
    temperatureCapacityFactor: temperatureFactorValue,
    endOfLifeCapacityPct: endOfLifePct,
    agingFactor: round(100 / endOfLifePct, 6),
    designMarginPct: marginPct,
    correctionMultiplier: round(correctionMultiplier, 6),
    sections,
    controllingSection: controllingSection.section,
    requiredCapacityAh: round(requiredCapacityAh, 2),
    candidateCellCapacityAh: candidateAh,
    requiredParallelStrings,
    installedCapacityAh: round(installedCapacityAh, 2),
    dcBusVoltageV: busVoltage,
    minimumNominalEnergyKwh: round(requiredCapacityAh * busVoltage / 1000, 2),
    installedNominalEnergyKwh: round(installedCapacityAh * busVoltage / 1000, 2),
  };
}

/** Run the manufacturer-data duty-cycle branch used by the page orchestrator. */
export function runManufacturerDutyCycleAnalysis(inputs) {
  const {
    systemLabel = '',
    averageLoadKw,
    peakLoadKw,
    runtimeHours,
    chemistry,
    ambientTempC = 25,
    designMarginPct = 0,
    upsPowerFactor = 0.9,
    rackLayoutInputs,
    dutyCyclePeriods,
    manufacturerDischargeTable,
    referenceCapacityAh,
    temperatureCapacityFactor,
    endOfLifeCapacityPct,
    endVoltageVPerCell,
    dischargeTableSource,
  } = inputs;
  if (!averageLoadKw || averageLoadKw <= 0) throw new Error('averageLoadKw must be greater than zero.');
  if (!peakLoadKw || peakLoadKw <= 0) throw new Error('peakLoadKw must be greater than zero.');
  if (!runtimeHours || runtimeHours <= 0) throw new Error('runtimeHours must be greater than zero.');
  const chem = CHEMISTRY[chemistry];
  if (!chem) throw new Error(`Unknown chemistry "${chemistry}".`);
  if (!String(dischargeTableSource || '').trim()) {
    throw new Error('dischargeTableSource is required for manufacturer-data sizing.');
  }
  const endVoltage = Number(endVoltageVPerCell);
  if (!Number.isFinite(endVoltage) || endVoltage <= 0) {
    throw new Error('endVoltageVPerCell must be greater than zero.');
  }

  const dcBusVoltageV = Number(rackLayoutInputs?.dcBusVoltageV);
  const candidateCellCapacityAh = Number(rackLayoutInputs?.cellCapacityAh);
  const duty = sizeManufacturerDutyCycle({
    dutyCyclePeriods,
    manufacturerDischargeTable,
    referenceCapacityAh,
    temperatureCapacityFactor,
    endOfLifeCapacityPct,
    designMarginPct,
    candidateCellCapacityAh,
    dcBusVoltageV,
  });
  const ups = upsKvaRequired(peakLoadKw, upsPowerFactor);
  const kwhNet = round(duty.periods.reduce((total, period) => (
    total + period.currentA * dcBusVoltageV / 1000 * period.durationMinutes / 60
  ), 0), 4);
  const standardBasis = chemistry.startsWith('lead-acid')
    ? 'IEEE 485-2020 duty-cycle framework'
    : chemistry === 'nickel-cadmium'
      ? 'IEEE 1115-2014 duty-cycle framework'
      : 'Manufacturer-specific discharge-performance method';
  const warnings = [
    'Manufacturer-data calculation: verify the entered discharge table uses the selected cell, end voltage, temperature basis, and reference capacity.',
    'This result supports cell-selection review but does not certify IEEE compliance or replace manufacturer sizing software and project acceptance checks.',
  ];
  if (chemistry === 'lithium-ion') {
    warnings.push('IEEE 485 and IEEE 1115 do not apply to lithium-ion; the result is manufacturer-specific.');
  }
  if (duty.requiredParallelStrings > 1) {
    warnings.push(`${duty.requiredParallelStrings} parallel strings are required for the entered ${candidateCellCapacityAh} Ah candidate cell.`);
  }

  return {
    systemLabel,
    chemistry,
    chemistryLabel: chem.label,
    averageLoadKw,
    peakLoadKw,
    runtimeHours,
    ambientTempC,
    designMarginPct,
    upsPowerFactor,
    sizingMethod: 'manufacturer-duty-cycle',
    usingDutyCycle: true,
    kwhNet,
    kwhFinal: duty.minimumNominalEnergyKwh,
    selectedBankKwh: duty.installedNominalEnergyKwh,
    nextLargerKwh: null,
    bankOptions: [],
    exceedsStandard: false,
    runtimeCurvePoints: [],
    kvaRequired: ups.kvaRequired,
    standardKva: ups.standardKva,
    dutyCycleSizing: duty,
    endVoltageVPerCell: endVoltage,
    dischargeTableSource: String(dischargeTableSource).trim(),
    standardBasis,
    dod: chem.dod,
    eta: chem.eta,
    agingFactor: duty.agingFactor,
    rackLayoutInputs: rackLayoutInputs && typeof rackLayoutInputs === 'object'
      ? { ...rackLayoutInputs }
      : undefined,
    calculationStatus: 'manufacturer-data-based',
    standardCompliance: null,
    requiredInputs: [
      'Confirm momentary, noncontinuous, continuous, and random load placement in the project duty cycle.',
      'Confirm the selected cell model, end voltage, temperature correction, end-of-life criterion, and discharge table revision.',
      'Complete manufacturer, protection, ventilation, seismic, short-circuit, and installation reviews before issue.',
    ],
    warnings,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a preliminary battery / UPS energy screening analysis.
 *
 * Applies generic energy factors and returns a unified screening result.
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
 * @param {object}  [inputs.rackLayoutInputs]      Optional physical rack layout overrides for UI rendering
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
    rackLayoutInputs,
    loadProfilePeriods,
    sizingMethod = 'energy-screen',
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
  if (sizingMethod === 'manufacturer-duty-cycle') {
    return runManufacturerDutyCycleAnalysis(inputs);
  }
  if (sizingMethod !== 'energy-screen') {
    throw new Error(`Unknown sizingMethod "${sizingMethod}".`);
  }

  const warnings = [];
  const requiredInputs = [
    'Obtain manufacturer discharge-performance data for the selected cell at the required end voltage and discharge duration.',
    'Validate the complete dc duty cycle, including momentary, noncontinuous, and random loads.',
    'Confirm UPS overload, crest-factor, harmonic, phase-imbalance, efficiency, and redundancy requirements with the selected manufacturer.',
  ];

  warnings.push(
    'PRELIMINARY SCREENING ONLY: this generic kWh model is not an IEEE 485/1115 cell-sizing calculation and must not be issued as a final battery or UPS selection.'
  );
  if (chemistry === 'lithium-ion') {
    warnings.push('IEEE 485 does not apply to lithium-ion batteries; use manufacturer-specific lithium-ion sizing and the applicable project safety standards.');
  } else if (chemistry === 'nickel-cadmium') {
    warnings.push('Final nickel-cadmium sizing must follow IEEE 1115 using manufacturer discharge data.');
  } else {
    warnings.push('Final lead-acid sizing must follow IEEE 485-2020 using manufacturer discharge data and the project dc duty cycle.');
  }

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
    rackLayoutInputs: rackLayoutInputs && typeof rackLayoutInputs === 'object'
      ? { ...rackLayoutInputs }
      : undefined,
    // Metadata
    calculationStatus: 'screening-only',
    standardCompliance: null,
    requiredInputs,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
