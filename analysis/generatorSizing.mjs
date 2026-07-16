/**
 * Standby / Emergency Generator Sizing
 *
 * Preliminary generator sizing workflow:
 *   1. Sum all continuous loads with demand factors → required kW
 *   2. Apply site altitude derating (NFPA 110 Annex B):
 *        3% per 1000 ft above 500 ft (naturally-aspirated diesel)
 *        1% per 1000 ft above 500 ft (turbocharged diesel)
 *   3. Apply ambient temperature derating:
 *        1% per °C above 40 °C standard rating point
 *   4. Evaluate largest motor step load (IEEE 446 §5.3):
 *        startingKva = (HP × 0.746 / (PF × eff)) × LRC_multiplier
 *        Transient voltage dip: dip% = stepLoadKva / (genKva / X'd%)
 *   5. Divide the required site load by the combined capacity factor and
 *      select the nearest standard generator nameplate size
 *   6. Calculate fuel runtime from tank capacity and specific fuel consumption
 *
 * References:
 *   NFPA 110-2022  — Standard for Emergency and Standby Power Systems
 *   NEC 700/701/702 — Emergency / Legally Required / Optional Standby Systems
 *   IEEE 446-1995  — Recommended Practice for Emergency Power Systems in Commercial Buildings
 */

/** Standard generator nameplate kW ratings per EGSA / ISO 8528 commercial availability. */
export const STANDARD_GEN_SIZES_KW = [
  15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250,
  300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 1750, 2000,
];

/**
 * NFPA 110 generator type classifications.
 * Type designates the maximum time from loss of normal power to full generator load acceptance.
 */
export const NFPA110_TYPES = {
  'type-10': {
    label: 'Type 10',
    responseTimeSec: 10,
    description: 'Power restored within 10 seconds. Application and runtime class are specified separately.',
  },
  'type-60': {
    label: 'Type 60',
    responseTimeSec: 60,
    description: 'Power restored within 60 seconds. Application and runtime class are specified separately.',
  },
  'type-120': {
    label: 'Type 120',
    responseTimeSec: 120,
    description: 'Power restored within 120 seconds. Application and runtime class are specified separately.',
  },
};

/**
 * Diesel specific fuel consumption (SFC) reference values.
 * Actual SFC depends on engine loading — generators run most efficiently at 75–100% load.
 * Values in lb/hp-hr; multiply by 0.1337 to convert to gal/hp-hr (diesel density ~6.79 lb/gal).
 */
export const DIESEL_SFC_LB_PER_HP_HR = 0.38; // Typical for 75% load, 4-stroke diesel

/**
 * Apply altitude derating to a generator's rated kW output.
 *
 * Per NFPA 110 Annex B and generator manufacturer data:
 *   - Naturally-aspirated engines:   3% derating per 1,000 ft above 500 ft MSL
 *   - Turbocharged (T/C) engines:    1% derating per 1,000 ft above 500 ft MSL
 *
 * The 500 ft threshold matches the standard reference altitude used by EGSA and most
 * manufacturer curves; no derating is applied below 500 ft.
 *
 * @param {number} ratedKw       Generator nameplate kW at standard site conditions
 * @param {number} altitudeFt    Installation altitude above mean sea level (ft)
 * @param {'naturally-aspirated'|'turbocharged'} [aspiration='naturally-aspirated']
 * @returns {{ deratedKw: number, altitudeFactor: number, note: string }}
 */
export function derateForAltitude(ratedKw, altitudeFt, aspiration = 'naturally-aspirated') {
  if (ratedKw <= 0) throw new Error('ratedKw must be greater than zero');
  if (altitudeFt < 0) throw new Error('altitudeFt must be ≥ 0');

  const excessKft = Math.max(0, (altitudeFt - 500) / 1000);
  const pctPerKft = aspiration === 'turbocharged' ? 0.01 : 0.03;
  const altitudeFactor = Math.max(0.5, 1 - pctPerKft * excessKft);
  const deratedKw = Math.round(ratedKw * altitudeFactor * 10) / 10;

  const note = altitudeFt <= 500
    ? 'No altitude derating — site is at or below 500 ft MSL.'
    : `${(pctPerKft * 100).toFixed(0)}% per 1,000 ft derating applied above 500 ft ` +
      `(${aspiration}). Excess altitude: ${excessKft.toFixed(2)} kft. ` +
      `Altitude factor: ${(altitudeFactor * 100).toFixed(1)}%.`;

  return { deratedKw, altitudeFactor: Math.round(altitudeFactor * 10000) / 10000, note };
}

/**
 * Apply ambient temperature derating to a generator's kW output.
 *
 * Standard rating point is 40 °C per ISO 8528-1 and NFPA 110 §6.1.
 * Each degree above 40 °C reduces output by approximately 1% (linear approximation
 * consistent with leading generator manufacturer data — Caterpillar, Cummins, MTU).
 *
 * No derating is applied at or below 40 °C.
 *
 * @param {number} ratedKw    Generator kW (after altitude derating if both apply)
 * @param {number} ambientC   Site ambient design temperature (°C)
 * @returns {{ deratedKw: number, tempFactor: number, note: string }}
 */
export function derateForTemperature(ratedKw, ambientC) {
  if (ratedKw <= 0) throw new Error('ratedKw must be greater than zero');

  const excessC = Math.max(0, ambientC - 40);
  const tempFactor = Math.max(0.6, 1 - 0.01 * excessC);
  const deratedKw = Math.round(ratedKw * tempFactor * 10) / 10;

  const note = ambientC <= 40
    ? 'No temperature derating — ambient is at or below the 40 °C ISO 8528 rating point.'
    : `1% per °C derating above 40 °C. Excess: ${excessC} °C. ` +
      `Temperature factor: ${(tempFactor * 100).toFixed(1)}%.`;

  return { deratedKw, tempFactor: Math.round(tempFactor * 10000) / 10000, note };
}

/**
 * Compute the motor starting step load demand for the largest motor on the bus.
 *
 * When a large motor starts across-the-line, its locked-rotor current (LRC) creates
 * a step kVA demand on the generator. The transient voltage dip produced by this
 * step load must stay within the project-specific equipment ride-through limit.
 *
 * Starting kVA formula (IEEE 446 §5.3):
 *   startingKva = (HP × 0.746) / (PF × efficiency) × lrcMultiplier
 *
 * The recommended generator kW from step load alone:
 *   recommendedKw ≈ startingKva × 0.8  (assuming 0.8 pf generator rating)
 *
 * @param {object} params
 * @param {number} params.motorHp         Largest motor nameplate HP (> 0)
 * @param {number} params.powerFactor     Motor running power factor (0–1, default 0.85)
 * @param {number} params.efficiency      Motor full-load efficiency (0–1, default 0.92)
 * @param {number} params.lrcMultiplier   LRC multiplier (typically 5–7, default 6)
 * @returns {{ startingKva: number, startingKw: number, recommendedGenKw: number }}
 */
export function largestMotorStepLoad({
  motorHp,
  powerFactor = 0.85,
  efficiency = 0.92,
  lrcMultiplier = 6,
}) {
  if (motorHp <= 0) throw new Error('motorHp must be greater than zero');
  if (powerFactor <= 0 || powerFactor > 1) throw new Error('powerFactor must be in (0, 1]');
  if (efficiency <= 0 || efficiency > 1) throw new Error('efficiency must be in (0, 1]');
  if (lrcMultiplier <= 0) throw new Error('lrcMultiplier must be greater than zero');

  const runningKw = (motorHp * 0.746) / efficiency;
  const startingKva = Math.round((runningKw / powerFactor) * lrcMultiplier * 10) / 10;
  const startingKw = Math.round(startingKva * powerFactor * 10) / 10;
  // Generator sizing from step load — assume 0.80 pf rating on generator nameplate
  const recommendedGenKw = Math.ceil(startingKva * 0.80);

  return { startingKva, startingKw, recommendedGenKw };
}

/**
 * Estimate the transient voltage dip caused by a step kVA load on a finite generator.
 *
 * Simplified model per IEEE 446 §5.4 and generator manufacturer application guides:
 *   dip% = (stepLoadKva / genKva) × X'd%
 *
 * where X'd is the generator subtransient reactance (typically 20–30%).
 * The default 35% limit is a preliminary screening criterion, not an NFPA 110
 * universal acceptance limit. Final acceptance must use the connected loads'
 * contactor, relay, drive, and control ride-through requirements.
 *
 * @param {object} params
 * @param {number} params.stepLoadKva   Starting kVA of the largest motor (from largestMotorStepLoad)
 * @param {number} params.genKva        Generator nameplate kVA (genKw / 0.8 if 0.8 pf rated)
 * @param {number} params.xdPrimePct    Subtransient reactance X'd in % (default 25%)
 * @param {number} [params.limitPct=35] Project voltage-dip screening limit (%)
 * @returns {{ dipPct: number, acceptable: boolean, limit: number }}
 */
export function estimateVoltageDip({ stepLoadKva, genKva, xdPrimePct = 25, limitPct = 35 }) {
  if (stepLoadKva < 0) throw new Error('stepLoadKva must be ≥ 0');
  if (genKva <= 0) throw new Error('genKva must be greater than zero');
  if (xdPrimePct <= 0 || xdPrimePct >= 100) throw new Error('xdPrimePct must be in (0, 100)');
  if (limitPct <= 0 || limitPct >= 100) throw new Error('limitPct must be in (0, 100)');

  const dipPct = Math.round((stepLoadKva / genKva) * xdPrimePct * 10) / 10;
  const limit = limitPct;
  const acceptable = dipPct <= limit;

  return { dipPct, acceptable, limit, limitBasis: 'project screening input' };
}

/**
 * Sum all continuous loads with demand factors to determine the required generator kW.
 *
 * @param {Array<{ label?: string, kw: number, demandFactor?: number }>} loads
 *   Array of load entries. demandFactor defaults to 1.0.
 * @returns {{ totalKw: number, loads: Array<{ label: string, kw: number, demandFactor: number, contributionKw: number }> }}
 */
export function continuousLoad(loads) {
  if (!Array.isArray(loads) || loads.length === 0) {
    throw new Error('At least one load must be provided');
  }

  const computed = loads.map(l => {
    const kw = Number(l.kw) || 0;
    const demandFactor = l.demandFactor != null ? Number(l.demandFactor) : 1.0;
    if (kw < 0) throw new Error(`Load kW must be ≥ 0 (got ${kw})`);
    if (demandFactor < 0 || demandFactor > 1) throw new Error(`demandFactor must be in [0, 1] (got ${demandFactor})`);
    return {
      label: l.label || '',
      kw,
      demandFactor,
      contributionKw: Math.round(kw * demandFactor * 10) / 10,
    };
  });

  const totalKw = Math.round(computed.reduce((sum, l) => sum + l.contributionKw, 0) * 10) / 10;
  return { totalKw, loads: computed };
}

/**
 * Estimate fuel runtime from tank capacity and load.
 *
 * Fuel consumption rate (gal/hr):
 *   fuelRate = loadKw × 1.341 (hp/kW) × sfcLbPerHpHr / dieselDensityLbPerGal
 *
 * Diesel density reference: 6.791 lb/US gal at 60 °F (ASTM D975).
 *
 * @param {object} params
 * @param {number} params.loadKw          Generator electrical output (kW)
 * @param {number} params.fuelCapGal      Usable fuel tank capacity (US gallons)
 * @param {number} [params.sfcLbPerHpHr=0.38] Specific fuel consumption (lb/hp-hr, diesel at ~75% load)
 * @returns {{ runtimeHours: number, fuelRateGalPerHr: number }}
 */
export function fuelRuntime({ loadKw, fuelCapGal, sfcLbPerHpHr = DIESEL_SFC_LB_PER_HP_HR }) {
  if (loadKw <= 0) throw new Error('loadKw must be greater than zero');
  if (fuelCapGal <= 0) throw new Error('fuelCapGal must be greater than zero');
  if (sfcLbPerHpHr <= 0) throw new Error('sfcLbPerHpHr must be greater than zero');

  const DIESEL_DENSITY = 6.791; // lb/US gal
  const HP_PER_KW = 1.341;
  const fuelRateGalPerHr = (loadKw * HP_PER_KW * sfcLbPerHpHr) / DIESEL_DENSITY;
  const runtimeHours = fuelCapGal / fuelRateGalPerHr;

  return {
    runtimeHours: Math.round(runtimeHours * 10) / 10,
    fuelRateGalPerHr: Math.round(fuelRateGalPerHr * 100) / 100,
  };
}

/**
 * Select the smallest standard generator size that meets or exceeds the required kW.
 *
 * @param {number} requiredKw  Minimum site-derated kW the generator must deliver
 * @returns {{ selectedKw: number|null, options: number[], exceedsCatalog: boolean }}
 */
export function selectStandardSize(requiredKw) {
  if (requiredKw < 0) throw new Error('requiredKw must be ≥ 0');

  const selected = STANDARD_GEN_SIZES_KW.find(s => s >= requiredKw) ?? null;

  if (selected === null) {
    return {
      selectedKw: null,
      options: [STANDARD_GEN_SIZES_KW[STANDARD_GEN_SIZES_KW.length - 1]],
      exceedsCatalog: true,
    };
  }

  const idx = STANDARD_GEN_SIZES_KW.indexOf(selected);
  const options = STANDARD_GEN_SIZES_KW.slice(Math.max(0, idx), Math.min(STANDARD_GEN_SIZES_KW.length, idx + 3));

  return { selectedKw: selected, options, exceedsCatalog: false };
}

/**
 * Run a complete generator sizing analysis.
 *
 * Performs all sizing and derating steps and returns a unified result object.
 * Does NOT read from or write to the data store — the caller (generatorsizing.js) handles persistence.
 *
 * @param {object} inputs
 * @param {string} [inputs.projectLabel]          Optional project / location label
 * @param {Array}   inputs.loads                  Continuous load entries (see continuousLoad())
 * @param {number}  inputs.altitudeFt             Site altitude (ft MSL)
 * @param {number}  inputs.ambientC               Site design ambient temperature (°C)
 * @param {'naturally-aspirated'|'turbocharged'} [inputs.aspiration='naturally-aspirated']
 * @param {string}  [inputs.nfpa110Type='type-10'] NFPA 110 type key
 * @param {number}  [inputs.motorHp=0]            Largest motor HP (0 = skip step-load check)
 * @param {number}  [inputs.motorPf=0.85]         Largest motor running power factor
 * @param {number}  [inputs.motorEff=0.92]        Largest motor full-load efficiency
 * @param {number}  [inputs.lrcMultiplier=6]      Motor locked-rotor current multiplier
 * @param {number}  [inputs.xdPrimePct=25]        Generator subtransient reactance X'd (%)
 * @param {number}  [inputs.voltageDipLimitPct=35] Project-specific voltage-dip screening limit (%)
 * @param {number}  [inputs.fuelCapGal=0]         Fuel tank capacity (gal), 0 = skip
 * @param {number}  [inputs.sfcLbPerHpHr=0.38]   Specific fuel consumption
 * @returns {object} Complete analysis result
 */
export function runGeneratorSizingAnalysis(inputs) {
  const {
    projectLabel = '',
    loads,
    altitudeFt = 0,
    ambientC = 40,
    aspiration = 'naturally-aspirated',
    nfpa110Type = 'type-10',
    motorHp = 0,
    motorPf = 0.85,
    motorEff = 0.92,
    lrcMultiplier = 6,
    xdPrimePct = 25,
    voltageDipLimitPct = 35,
    fuelCapGal = 0,
    sfcLbPerHpHr = DIESEL_SFC_LB_PER_HP_HR,
  } = inputs;

  const warnings = [];
  const requiredInputs = [
    'Confirm altitude and temperature capacity factors against the selected generator manufacturer data.',
  ];

  // Step 1 — Continuous load sum
  const loadResult = continuousLoad(loads);
  const continuousKw = loadResult.totalKw;

  // Steps 2 and 3 — Capacity factors describe how much of a generator's
  // standard-condition nameplate rating remains available at the site. The
  // required nameplate rating therefore DIVIDES the load by these factors.
  const altResult = derateForAltitude(continuousKw, altitudeFt, aspiration);
  const tempResult = derateForTemperature(continuousKw, ambientC);
  const siteCapacityFactor = altResult.altitudeFactor * tempResult.tempFactor;
  const siteDeratedKw = Math.round((continuousKw / siteCapacityFactor) * 10) / 10;

  // Step 4 — Motor step load
  let stepLoad = null;
  let voltageDip = null;

  if (motorHp > 0) {
    requiredInputs.push(
      'Confirm motor-start performance with the selected generator, alternator, exciter, and voltage regulator.'
    );
    stepLoad = largestMotorStepLoad({
      motorHp,
      powerFactor: motorPf,
      efficiency: motorEff,
      lrcMultiplier,
    });

    // Determine required kW accounting for motor start
    const requiredFromStep = stepLoad.recommendedGenKw / siteCapacityFactor;

    // Select a tentative standard size for voltage dip calculation
    const tentativeRequiredKw = Math.max(siteDeratedKw, requiredFromStep);
    const tentativeSize = selectStandardSize(tentativeRequiredKw);
    const tentativeNameplateKw = tentativeSize.selectedKw ?? tentativeRequiredKw;
    const siteAvailableKva = tentativeNameplateKw * siteCapacityFactor / 0.8;

    voltageDip = estimateVoltageDip({
      stepLoadKva: stepLoad.startingKva,
      genKva: siteAvailableKva,
      xdPrimePct,
      limitPct: voltageDipLimitPct,
    });

    if (!voltageDip.acceptable) {
      warnings.push(
        `Transient voltage dip of ${voltageDip.dipPct}% exceeds the ${voltageDip.limit}% ` +
        `project screening limit during the largest motor start (${motorHp} HP, LRC ×${lrcMultiplier}). ` +
        `Consider a larger generator or a soft-starter / VFD on the motor.`
      );
    }
  }

  // Step 5 — Required standard-condition nameplate kW. Both the continuous
  // load and the step-load screen must be supported after site derating.
  const stepRequiredKw = stepLoad
    ? Math.round((stepLoad.recommendedGenKw / siteCapacityFactor) * 10) / 10
    : 0;
  const requiredKw = Math.max(siteDeratedKw, stepRequiredKw);

  // Step 6 — Standard size selection
  const sizeResult = selectStandardSize(requiredKw);
  if (sizeResult.exceedsCatalog) {
    warnings.push(
      `Required nameplate capacity ${requiredKw.toFixed(1)} kW exceeds the built-in 2,000 kW catalog range. ` +
      'No generator size was selected; evaluate paralleled units or a manufacturer-specific package.'
    );
  }

  // Step 7 — Fuel runtime
  let fuelResult = null;
  if (fuelCapGal > 0) {
    fuelResult = fuelRuntime({ loadKw: continuousKw, fuelCapGal, sfcLbPerHpHr });

    requiredInputs.push('Specify the required NFPA 110 Class or other project runtime requirement separately from the Type response time.');
    warnings.push(
      `Estimated fuel runtime is ${fuelResult.runtimeHours} hours. NFPA 110 Type ` +
      `${NFPA110_TYPES[nfpa110Type]?.responseTimeSec ?? 'N/A'} describes restoration time, not runtime duration; ` +
      'compare this result with the specified Class and applicable code.'
    );
    if (fuelResult.runtimeHours < 0.5) {
      warnings.push(
        `Fuel runtime is very short (${fuelResult.runtimeHours} h). ` +
        `Check that the tank capacity and fuel consumption values are correct.`
      );
    }
  }

  if (altResult.altitudeFactor < 0.85) {
    warnings.push(
      `Significant altitude derating (${((1 - altResult.altitudeFactor) * 100).toFixed(1)}%) ` +
      `applied. Verify with the generator manufacturer's published altitude curves.`
    );
  }
  if (tempResult.tempFactor < 0.90) {
    warnings.push(
      `Temperature derating of ${((1 - tempResult.tempFactor) * 100).toFixed(1)}% ` +
      `applied for ${ambientC} °C ambient. Confirm with the manufacturer's data.`
    );
  }

  return {
    projectLabel,
    loads: loadResult.loads,
    continuousKw,
    altitudeFt,
    ambientC,
    aspiration,
    altitudeFactor: altResult.altitudeFactor,
    altitudeNote: altResult.note,
    tempFactor: tempResult.tempFactor,
    tempNote: tempResult.note,
    siteCapacityFactor: Math.round(siteCapacityFactor * 10000) / 10000,
    siteDeratedKw,
    stepLoad,
    stepRequiredKw,
    voltageDip,
    requiredKw: Math.round(requiredKw * 10) / 10,
    selectedSizeKw: sizeResult.selectedKw,
    standardSizeOptions: sizeResult.options,
    exceedsCatalog: sizeResult.exceedsCatalog,
    nfpa110Type,
    nfpa110Info: NFPA110_TYPES[nfpa110Type] ?? null,
    fuelCapGal,
    fuelRuntime: fuelResult,
    calculationStatus: 'screening-only',
    requiredInputs,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
