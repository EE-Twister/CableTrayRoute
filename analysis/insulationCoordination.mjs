/**
 * Insulation Coordination — IEC 60071-1/2 / IEEE 1313
 *
 * Implements the deterministic and simplified-statistical insulation
 * coordination procedure for AC systems per:
 *   IEC 60071-1:2006+AMD1:2010 — Definitions, standard insulation levels (Tables 2 & 3)
 *   IEC 60071-2:1996+AMD1:2012 — Application guide (atmospheric correction, safety factors)
 *   IEEE 1313.2-1999 — Guide for the application of insulation coordination
 *
 * Procedure summary (IEC 60071-2 §2):
 *   1. Identify the highest voltage for equipment Um for the system nominal voltage.
 *   2. Determine representative overvoltages for each stress class
 *      (temporary/TOV, switching impulse, lightning impulse).
 *   3. Compute the required coordination withstand voltage:
 *        Ucw = Urp × Ks × Ka
 *      where Ks is the safety factor (1.05 statistical / 1.15 deterministic) and
 *      Ka is the atmospheric correction factor for altitude.
 *   4. Select the lowest standard insulation level from IEC 60071-1 Table 2/3 with
 *      BIL (LIWV) ≥ Ucw_LI and PFWV ≥ Ucw_TOV.
 *   5. Verify protective margins of the surge arrester:
 *        Mp_LI (%) = (Ucw_LI / Ures_LI − 1) × 100  ≥ 20 %
 *        Mp_SI (%) = (Ucw_SI / Ures_SI − 1) × 100  ≥ 15 %
 *   6. (Optional) Estimate statistical risk of failure per IEC 60071-2 Annex A using
 *      a simplified Gaussian convolution model.
 *
 * References:
 *   IEC 60071-1:2006+AMD1:2010 Table 2 (Range I: 1–245 kV) and Table 3 (Range II: >245 kV)
 *   IEC 60071-2:1996 §3.3 — Atmospheric correction (Ka)
 *   IEC 60071-2:1996 Annex A — Statistical risk of failure
 *   IEEE 1313.2-1999 §6 — Protective margins
 */

// ---------------------------------------------------------------------------
// Standard insulation levels — IEC 60071-1 Table 2 (Range I, Um 1–245 kV)
// Each entry: Um (highest voltage for equipment, kV rms),
//             liwv (standard lightning impulse withstand voltages, kV peak),
//             pfwv (standard power-frequency withstand voltages, kV rms).
// Multiple liwv/pfwv values are the alternative standard levels in ascending order.
// ---------------------------------------------------------------------------
export const IEC60071_RANGE_I = [
  { um: 3.6,  liwv: [20, 40],        pfwv: [10] },
  { um: 7.2,  liwv: [40, 60],        pfwv: [20] },
  { um: 12,   liwv: [60, 75, 95],    pfwv: [28] },
  { um: 17.5, liwv: [75, 95],        pfwv: [38] },
  { um: 24,   liwv: [95, 125, 145],  pfwv: [50] },
  { um: 36,   liwv: [145, 170],      pfwv: [70] },
  { um: 52,   liwv: [250],           pfwv: [95] },
  { um: 72.5, liwv: [325],           pfwv: [140] },
  { um: 100,  liwv: [380, 450],      pfwv: [185] },
  { um: 123,  liwv: [450, 550],      pfwv: [230] },
  { um: 145,  liwv: [550, 650],      pfwv: [275] },
  { um: 170,  liwv: [650, 750],      pfwv: [325] },
  { um: 245,  liwv: [850, 950, 1050], pfwv: [395, 460] },
];

// IEC 60071-1 Table 3 (Range II, Um > 245 kV).
// PFWV is not listed separately (SIWV governs for this range).
// siwv = standard switching impulse withstand voltage (kV peak).
export const IEC60071_RANGE_II = [
  { um: 300,  liwv: [850, 950, 1050],           siwv: [750, 850] },
  { um: 362,  liwv: [950, 1050, 1175],           siwv: [850, 950] },
  { um: 420,  liwv: [1050, 1175, 1300, 1425],   siwv: [850, 950, 1050] },
  { um: 550,  liwv: [1175, 1300, 1425, 1550],   siwv: [950, 1050] },
  { um: 800,  liwv: [1425, 1550, 1800],          siwv: [1050, 1175] },
  { um: 1200, liwv: [1800, 2100],                siwv: [1300, 1425] },
];

/** Minimum protective margin for lightning impulse (%) per IEEE 1313.2 §6. */
export const MIN_PROTECTIVE_MARGIN_LI_PCT = 20;

/** Minimum protective margin for switching impulse (%) per IEEE 1313.2 §6. */
export const MIN_PROTECTIVE_MARGIN_SI_PCT = 15;

/** Safety factor for deterministic approach (IEC 60071-2 §3.22). */
export const SAFETY_FACTOR_DETERMINISTIC = 1.15;

/** Safety factor for statistical approach (IEC 60071-2 §3.22). */
export const SAFETY_FACTOR_STATISTICAL = 1.05;

/**
 * System temporary overvoltage (TOV) factors by earthing type.
 * Values represent U_TOV / (Um / √3) — the TOV expressed as a multiple
 * of the phase-to-earth voltage at Um.
 * Source: IEC 60071-2 Table 1 (informative indicative values).
 */
export const TOV_FACTOR = {
  solidly_grounded:    1.0,
  low_resistance:      1.3,
  high_resistance:     1.73,
  isolated:            1.73,
};

function round(v, d = 3) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/**
 * Look up the standard insulation level row for a given Um value (kV rms).
 * Returns the exact match or the next higher Um in the combined Range I + II tables.
 *
 * @param {number} umKv  Highest voltage for equipment (kV rms)
 * @returns {{ um: number, liwv: number[], pfwv?: number[], siwv?: number[], rangeII: boolean } | null}
 */
export function getStandardLevels(umKv) {
  if (!Number.isFinite(umKv) || umKv <= 0) throw new Error('umKv must be a positive number');

  const all = [
    ...IEC60071_RANGE_I.map(e => ({ ...e, rangeII: false })),
    ...IEC60071_RANGE_II.map(e => ({ ...e, rangeII: true })),
  ];

  // Exact match first
  const exact = all.find(e => e.um === umKv);
  if (exact) return exact;

  // Next higher Um
  const higher = all.filter(e => e.um > umKv).sort((a, b) => a.um - b.um);
  return higher.length > 0 ? higher[0] : null;
}

/**
 * Compute the atmospheric correction factor Ka for a given altitude.
 *
 * Per IEC 60071-2 §3.3 and IEC 60060-1:2010 §4.2:
 *   Ka = e^(m × H / 8150)
 *
 * where H is the altitude above sea level (m) and m is an exponent depending
 * on the type of discharge path:
 *   m = 1.0 for self-restoring insulation under lightning impulse (air gaps, surge arresters)
 *   m = 0.75 for non-self-restoring under power frequency (transformers, GIS)
 *   m = 0.5 for non-uniform-field short gaps under power frequency
 *
 * @param {number} altitudeM   Altitude above sea level (m, ≥ 0)
 * @param {number} [m=1.0]     Exponent (1.0 for LI air gaps, 0.75 for PF non-SR)
 * @returns {number} Ka (dimensionless; > 1 for altitudes above sea level)
 */
export function atmosphericCorrectionFactor(altitudeM, m = 1.0) {
  if (!Number.isFinite(altitudeM) || altitudeM < 0) {
    throw new Error('altitudeM must be a non-negative number');
  }
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error('exponent m must be a positive number');
  }
  return round(Math.exp(m * altitudeM / 8150), 4);
}

/**
 * Compute the required coordination withstand voltage (Ucw).
 *
 *   Ucw = Urp × Ks × Ka  (IEC 60071-2 §3)
 *
 * @param {number} representativeKvPeak  Representative overvoltage at the equipment (kV peak)
 * @param {number} safetyFactor          Ks (1.05 statistical or 1.15 deterministic)
 * @param {number} ka                    Atmospheric correction factor (from atmosphericCorrectionFactor())
 * @returns {number} Required coordination withstand voltage (kV peak)
 */
export function coordinationWithstandVoltage(representativeKvPeak, safetyFactor, ka) {
  if (!Number.isFinite(representativeKvPeak) || representativeKvPeak <= 0) {
    throw new Error('representativeKvPeak must be greater than zero');
  }
  if (!Number.isFinite(safetyFactor) || safetyFactor < 1.0) {
    throw new Error('safetyFactor must be ≥ 1.0');
  }
  if (!Number.isFinite(ka) || ka < 1.0) {
    throw new Error('ka must be ≥ 1.0 (sea level = 1.0)');
  }
  return round(representativeKvPeak * safetyFactor * ka, 2);
}

/**
 * Compute the protective margin of a surge arrester.
 *
 *   Mp (%) = (Ucw / Ures − 1) × 100
 *
 * A positive Mp means the insulation withstand exceeds the arrester protective level.
 * Required margins per IEEE 1313.2 §6:
 *   Lightning impulse: Mp ≥ 20 %
 *   Switching impulse: Mp ≥ 15 %
 *
 * @param {number} ucwKvPeak      Required coordination withstand voltage (kV peak)
 * @param {number} arresterResKvPeak  Arrester residual/protective level (kV peak)
 * @returns {{ marginPct: number, pass: boolean, stressClass: string }}
 */
export function protectiveMargin(ucwKvPeak, arresterResKvPeak, stressClass = 'li') {
  if (!Number.isFinite(ucwKvPeak) || ucwKvPeak <= 0) {
    throw new Error('ucwKvPeak must be greater than zero');
  }
  if (!Number.isFinite(arresterResKvPeak) || arresterResKvPeak <= 0) {
    throw new Error('arresterResKvPeak must be greater than zero');
  }
  const marginPct = round((ucwKvPeak / arresterResKvPeak - 1) * 100, 1);
  const minMargin = stressClass === 'si' ? MIN_PROTECTIVE_MARGIN_SI_PCT : MIN_PROTECTIVE_MARGIN_LI_PCT;
  return { marginPct, pass: marginPct >= minMargin, minMarginPct: minMargin };
}

/**
 * Determine the minimum surge arrester MCOV (Maximum Continuous Operating Voltage)
 * for a given system nominal voltage and earthing type.
 *
 *   MCOV ≥ Um / √3  (solidly grounded)
 *   MCOV ≥ Um       (isolated / resistance grounded, per IEC 60099-5 §5.1)
 *
 * @param {number} umKv           Highest voltage for equipment (kV rms)
 * @param {string} groundingType  One of: 'solidly_grounded', 'low_resistance',
 *                                'high_resistance', 'isolated'
 * @returns {{ mcovMinKv: number, rationale: string }}
 */
export function surgeArresterMcov(umKv, groundingType) {
  if (!Number.isFinite(umKv) || umKv <= 0) throw new Error('umKv must be greater than zero');

  const earthed = groundingType === 'solidly_grounded' || groundingType === 'low_resistance';
  const mcovMinKv = earthed
    ? round(umKv / Math.sqrt(3), 2)
    : round(umKv, 2);
  const rationale = earthed
    ? `Solidly / low-resistance earthed: MCOV ≥ Um / √3 = ${mcovMinKv} kV rms (IEC 60099-5 §5.1)`
    : `Isolated / high-resistance earthed: MCOV ≥ Um = ${mcovMinKv} kV rms (IEC 60099-5 §5.1)`;
  return { mcovMinKv, rationale };
}

/**
 * Temporary overvoltage (TOV) magnitude at the equipment.
 *
 *   U_TOV (kV rms, phase-to-earth) = (Um / √3) × tovFactor
 *   U_TOV_peak (kV peak) = U_TOV × √2
 *
 * @param {number} umKv           Highest voltage for equipment (kV rms)
 * @param {string} groundingType  Earthing type key (see TOV_FACTOR)
 * @returns {{ tovKvRms: number, tovKvPeak: number, factor: number }}
 */
export function temporaryOvervoltage(umKv, groundingType) {
  if (!Number.isFinite(umKv) || umKv <= 0) throw new Error('umKv must be greater than zero');

  const factor = TOV_FACTOR[groundingType] ?? TOV_FACTOR.solidly_grounded;
  const tovKvRms  = round((umKv / Math.sqrt(3)) * factor, 3);
  const tovKvPeak = round(tovKvRms * Math.sqrt(2), 3);
  return { tovKvRms, tovKvPeak, factor };
}

/**
 * Select the lowest standard BIL (lightning impulse withstand voltage) from the
 * IEC 60071-1 table for the given Um that satisfies BIL ≥ ucwLiKvPeak.
 *
 * @param {number} umKv          Highest voltage for equipment (kV rms)
 * @param {number} ucwLiKvPeak   Required coordination withstand voltage, lightning (kV peak)
 * @returns {{ selectedBilKv: number | null, availableBilKv: number[] }}
 */
export function selectStandardBil(umKv, ucwLiKvPeak) {
  const row = getStandardLevels(umKv);
  if (!row) return { selectedBilKv: null, availableBilKv: [] };

  const suitable = row.liwv.filter(v => v >= ucwLiKvPeak);
  const selectedBilKv = suitable.length > 0 ? Math.min(...suitable) : null;
  return { selectedBilKv, availableBilKv: row.liwv };
}

/**
 * Estimate statistical risk of failure per IEC 60071-2 Annex A (simplified).
 *
 * Uses a Gaussian convolution approximation:
 *   R ≈ Φ((μs − U50) / √(σs² + σw²))
 *
 * where:
 *   μs  = mean representative overvoltage (kV peak)
 *   σs  = standard deviation of overvoltage distribution = μs × covStress
 *   U50 = 50% disruptive-discharge voltage = selected BIL / 1.22 (lightning)
 *          or selected SIL / 1.06 (switching), since test withstand = U50 × (1 − 1.3 β_w)
 *   σw  = U50 × covWithstand
 *   Φ   = standard normal cumulative distribution function
 *
 * Typical coefficient of variation values (IEC 60071-2 Annex A):
 *   Lightning:  covWithstand ≈ 0.03 (self-restoring), 0.06 (non-SR)
 *   Switching:  covWithstand ≈ 0.06
 *
 * @param {object} params
 * @param {number} params.meanOvervoltageKv     Mean representative overvoltage (kV peak)
 * @param {number} params.covStress             Coefficient of variation of overvoltage (e.g. 0.20)
 * @param {number} params.selectedWithstandKv   Selected standard BIL or SIL (kV peak)
 * @param {number} [params.covWithstand=0.03]   Coefficient of variation of withstand voltage
 * @param {'li'|'si'} [params.stressClass='li'] 'li' for lightning, 'si' for switching impulse
 * @returns {{ riskOfFailure: number, riskPerYear: number | null, z: number }}
 */
export function statisticalRiskOfFailure({
  meanOvervoltageKv,
  covStress,
  selectedWithstandKv,
  covWithstand = 0.03,
  stressClass = 'li',
}) {
  if (!Number.isFinite(meanOvervoltageKv) || meanOvervoltageKv <= 0) {
    throw new Error('meanOvervoltageKv must be greater than zero');
  }
  if (!Number.isFinite(covStress) || covStress <= 0 || covStress >= 1) {
    throw new Error('covStress must be between 0 and 1');
  }
  if (!Number.isFinite(selectedWithstandKv) || selectedWithstandKv <= 0) {
    throw new Error('selectedWithstandKv must be greater than zero');
  }
  if (!Number.isFinite(covWithstand) || covWithstand <= 0) {
    throw new Error('covWithstand must be positive');
  }

  // Back-calculate U50 from selected standard withstand voltage.
  // For lightning: BIL = U50 × (1 − 1.28 × β_w)  [IEC 60071-2 Annex A]
  // For switching: SIL = U50 × (1 − 1.28 × β_w) × truncation factor ≈ U50 × (1 − 1.3 × β_w)
  const u50 = selectedWithstandKv / (1 - 1.28 * covWithstand);

  const sigmaS = meanOvervoltageKv * covStress;
  const sigmaW = u50 * covWithstand;
  const z = (meanOvervoltageKv - u50) / Math.sqrt(sigmaS ** 2 + sigmaW ** 2);

  const riskOfFailure = round(standardNormalCDF(z), 8);
  return { riskOfFailure, u50: round(u50, 2), z: round(z, 4) };
}

/**
 * Standard normal cumulative distribution function Φ(z).
 * Uses the Abramowitz & Stegun rational approximation (error < 7.5e-8).
 *
 * @param {number} z
 * @returns {number} Φ(z) ∈ (0, 1)
 */
function standardNormalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const p = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * Run a complete insulation coordination study.
 *
 * @param {object}   inputs
 * @param {string}   [inputs.studyLabel]            Descriptive label
 * @param {number}   inputs.nominalVoltageKv         System nominal voltage kV (L-L rms, e.g. 138)
 * @param {number}   inputs.umKv                     Highest voltage for equipment (kV rms, from IEC table)
 * @param {number}   [inputs.altitudeM=0]            Site altitude above sea level (m)
 * @param {string}   [inputs.groundingType]          'solidly_grounded' | 'low_resistance' |
 *                                                   'high_resistance' | 'isolated'
 * @param {string}   [inputs.approach='deterministic'] 'deterministic' | 'statistical'
 * @param {object}   [inputs.lightningImpulse]       Lightning stress inputs
 * @param {number}   [inputs.lightningImpulse.representativeKvPeak]  Urp for LI (kV peak, = arrester Ures_LI)
 * @param {number}   [inputs.lightningImpulse.arresterResidualKvPeak] Surge arrester LI residual voltage (kV peak)
 * @param {object}   [inputs.switchingImpulse]       Switching stress inputs (Range II or large systems)
 * @param {number}   [inputs.switchingImpulse.representativeKvPeak]  Urp for SI (kV peak, = arrester Ures_SI)
 * @param {number}   [inputs.switchingImpulse.arresterResidualKvPeak] Surge arrester SI residual voltage (kV peak)
 * @param {number}   [inputs.surgeArresterMcovKv]    Surge arrester MCOV (kV rms)
 * @param {object}   [inputs.statisticalLI]          Statistical parameters for LI risk estimation
 * @param {number}   [inputs.statisticalLI.meanKvPeak]  Mean LI overvoltage (kV peak)
 * @param {number}   [inputs.statisticalLI.cov]         Coefficient of variation of LI distribution
 * @returns {object} Study result
 */
export function runInsulationCoordinationStudy(inputs) {
  validateInputs(inputs);

  const {
    studyLabel = '',
    nominalVoltageKv,
    umKv,
    altitudeM = 0,
    groundingType = 'solidly_grounded',
    approach = 'deterministic',
    lightningImpulse,
    switchingImpulse,
    surgeArresterMcovKv,
    statisticalLI,
  } = inputs;

  const warnings = [];

  // 1. Standard levels for this Um
  const standardRow = getStandardLevels(umKv);
  if (!standardRow) {
    throw new Error(`No IEC 60071-1 standard insulation level found for Um = ${umKv} kV. Check IEC 60071-1 Tables 2 and 3.`);
  }
  if (standardRow.um !== umKv) {
    warnings.push(
      `Um = ${umKv} kV is not a standard value. Using the next higher standard Um = ${standardRow.um} kV.`
    );
  }

  // 2. Atmospheric correction factor
  const ks = approach === 'statistical' ? SAFETY_FACTOR_STATISTICAL : SAFETY_FACTOR_DETERMINISTIC;
  const kaLI = atmosphericCorrectionFactor(altitudeM, 1.0);
  const kaPF = atmosphericCorrectionFactor(altitudeM, 0.75);

  // 3. Temporary overvoltage
  const tov = temporaryOvervoltage(umKv, groundingType);
  const ucwTovKvPeak = coordinationWithstandVoltage(tov.tovKvPeak, ks, kaPF);

  // 4. MCOV check
  const mcovReq = surgeArresterMcov(umKv, groundingType);
  let mcovCheck = null;
  if (Number.isFinite(surgeArresterMcovKv) && surgeArresterMcovKv > 0) {
    const mcovPass = surgeArresterMcovKv >= mcovReq.mcovMinKv;
    mcovCheck = {
      providedMcovKv: surgeArresterMcovKv,
      requiredMcovKv: mcovReq.mcovMinKv,
      pass: mcovPass,
      rationale: mcovReq.rationale,
    };
    if (!mcovPass) {
      warnings.push(
        `Surge arrester MCOV (${surgeArresterMcovKv} kV) is less than the required minimum of ${mcovReq.mcovMinKv} kV for a ${groundingType.replace(/_/g, ' ')} system. Select a higher MCOV rating.`
      );
    }
  }

  // 5. Lightning impulse coordination
  let liResult = null;
  if (lightningImpulse && Number.isFinite(lightningImpulse.representativeKvPeak)) {
    const ucwLI = coordinationWithstandVoltage(lightningImpulse.representativeKvPeak, ks, kaLI);
    const { selectedBilKv, availableBilKv } = selectStandardBil(umKv, ucwLI);

    let liMargin = null;
    if (Number.isFinite(lightningImpulse.arresterResidualKvPeak)) {
      liMargin = protectiveMargin(ucwLI, lightningImpulse.arresterResidualKvPeak, 'li');
      if (!liMargin.pass) {
        warnings.push(
          `Lightning impulse protective margin (${liMargin.marginPct}%) is below the required ${MIN_PROTECTIVE_MARGIN_LI_PCT}%. Consider a lower arrester protective level or higher BIL.`
        );
      }
    }

    if (selectedBilKv === null) {
      warnings.push(
        `No standard BIL in IEC 60071-1 Table 2/3 for Um = ${standardRow.um} kV satisfies the required Ucw = ${ucwLI} kV. Consider a higher voltage class.`
      );
    }

    let liRisk = null;
    if (selectedBilKv !== null && statisticalLI && Number.isFinite(statisticalLI.meanKvPeak)) {
      liRisk = statisticalRiskOfFailure({
        meanOvervoltageKv: statisticalLI.meanKvPeak,
        covStress: statisticalLI.cov ?? 0.20,
        selectedWithstandKv: selectedBilKv,
        covWithstand: 0.03,
        stressClass: 'li',
      });
    }

    liResult = {
      representativeKvPeak: lightningImpulse.representativeKvPeak,
      ucwKvPeak: ucwLI,
      ks,
      ka: kaLI,
      selectedBilKv,
      availableBilKv,
      protectiveMargin: liMargin,
      risk: liRisk,
    };
  }

  // 6. Switching impulse coordination (primarily Range II, but included for completeness)
  let siResult = null;
  if (switchingImpulse && Number.isFinite(switchingImpulse.representativeKvPeak)) {
    const ucwSI = coordinationWithstandVoltage(switchingImpulse.representativeKvPeak, ks, kaLI);

    let siMargin = null;
    if (Number.isFinite(switchingImpulse.arresterResidualKvPeak)) {
      siMargin = protectiveMargin(ucwSI, switchingImpulse.arresterResidualKvPeak, 'si');
      if (!siMargin.pass) {
        warnings.push(
          `Switching impulse protective margin (${siMargin.marginPct}%) is below the required ${MIN_PROTECTIVE_MARGIN_SI_PCT}%. Consider a lower arrester protective level or higher SIL.`
        );
      }
    }

    // For Range II, check against standard siwv if available
    const availableSiwv = standardRow.siwv ?? [];
    const suitableSiwv = availableSiwv.filter(v => v >= ucwSI);
    const selectedSilKv = suitableSiwv.length > 0 ? Math.min(...suitableSiwv) : null;

    if (availableSiwv.length > 0 && selectedSilKv === null) {
      warnings.push(
        `No standard SIL in IEC 60071-1 Table 3 for Um = ${standardRow.um} kV satisfies the required Ucw = ${ucwSI} kV.`
      );
    }

    siResult = {
      representativeKvPeak: switchingImpulse.representativeKvPeak,
      ucwKvPeak: ucwSI,
      ks,
      ka: kaLI,
      selectedSilKv,
      availableSiwv,
      protectiveMargin: siMargin,
    };
  }

  // 7. Power frequency / TOV check against PFWV
  let tovResult = null;
  if (!standardRow.rangeII) {
    const pfwvOptions = standardRow.pfwv ?? [];
    const suitablePfwv = pfwvOptions.filter(v => v >= ucwTovKvPeak / Math.sqrt(2)); // peak → rms
    const selectedPfwvKv = suitablePfwv.length > 0 ? Math.min(...suitablePfwv) : null;

    if (pfwvOptions.length > 0 && selectedPfwvKv === null) {
      warnings.push(
        `No standard PFWV in IEC 60071-1 Table 2 for Um = ${standardRow.um} kV satisfies the required Ucw_TOV = ${round(ucwTovKvPeak / Math.sqrt(2), 2)} kV rms.`
      );
    }

    tovResult = {
      groundingType,
      tovFactor: tov.factor,
      tovKvRms: tov.tovKvRms,
      tovKvPeak: tov.tovKvPeak,
      ucwTovKvPeak,
      ucwTovKvRms: round(ucwTovKvPeak / Math.sqrt(2), 2),
      selectedPfwvKv,
      availablePfwvKv: pfwvOptions,
    };
  }

  // Summary
  const liPass = liResult
    ? (liResult.selectedBilKv !== null && (liResult.protectiveMargin ? liResult.protectiveMargin.pass : true))
    : null;
  const siPass = siResult
    ? (siResult.selectedSilKv !== null || siResult.availableSiwv.length === 0) &&
      (siResult.protectiveMargin ? siResult.protectiveMargin.pass : true)
    : null;
  const mcovPass = mcovCheck ? mcovCheck.pass : null;
  const allPassed = [liPass, siPass, mcovPass].every(p => p === null || p === true);

  return {
    inputs: {
      studyLabel,
      nominalVoltageKv,
      umKv,
      altitudeM,
      groundingType,
      approach,
      surgeArresterMcovKv: surgeArresterMcovKv ?? null,
    },
    standardRow: {
      um: standardRow.um,
      liwv: standardRow.liwv,
      pfwv: standardRow.pfwv ?? null,
      siwv: standardRow.siwv ?? null,
      rangeII: standardRow.rangeII,
    },
    atmosphericCorrection: { kaLI, kaPF, altitudeM },
    safetyFactor: ks,
    approach,
    mcovCheck,
    tovResult,
    liResult,
    siResult,
    allPassed,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

function validateInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('inputs must be an object');
  }
  if (!Number.isFinite(inputs.nominalVoltageKv) || inputs.nominalVoltageKv <= 0) {
    throw new Error('nominalVoltageKv must be greater than zero');
  }
  if (!Number.isFinite(inputs.umKv) || inputs.umKv <= 0) {
    throw new Error('umKv must be greater than zero');
  }
  if (inputs.altitudeM != null && (!Number.isFinite(inputs.altitudeM) || inputs.altitudeM < 0)) {
    throw new Error('altitudeM must be a non-negative number');
  }
  if (inputs.groundingType != null && !Object.keys(TOV_FACTOR).includes(inputs.groundingType)) {
    throw new Error(`groundingType must be one of: ${Object.keys(TOV_FACTOR).join(', ')}`);
  }
  if (inputs.approach != null && !['deterministic', 'statistical'].includes(inputs.approach)) {
    throw new Error("approach must be 'deterministic' or 'statistical'");
  }
}
