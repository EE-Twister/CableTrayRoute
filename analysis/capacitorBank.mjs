/**
 * Capacitor Bank Sizing & Power Factor Correction
 *
 * Standard industrial power factor correction workflow:
 *   1. Measure reactive demand Q (kVAR) from load flow or billing data
 *   2. Size capacitor bank to reach target PF:
 *        Q_cap = P × (tan(acos(pf_existing)) − tan(acos(pf_target)))
 *   3. Check parallel resonance harmonic order:
 *        h_r = √(kVA_sc / kVAR_cap)
 *      Peaks in the system impedance near an integer harmonic cause voltage amplification.
 *   4. If h_r falls within ±0.5 of a dominant harmonic order, specify a detuned reactor
 *      to shift the resonance below the nearest harmonic.
 *
 * References:
 *   IEEE 18-2012    — IEEE Standard for Shunt Power Capacitors
 *   IEEE C37.99-2012 — IEEE Guide for the Protection of Shunt Capacitor Banks
 *   IEC 60831-1:2014 — Shunt power capacitors — Part 1: General
 *   NEMA CP 1-2000  — Shunt Capacitors (application guidelines)
 */

/** Standard fixed capacitor bank kVAR ratings per NEMA CP 1 / manufacturer standard. */
export const STANDARD_KVAR_SIZES = [25, 50, 100, 150, 200, 300, 400, 600, 900, 1200, 1800, 2400];

/**
 * Harmonic orders most commonly produced by non-linear loads per IEEE 519-2022.
 * Used when identifying resonance risk.
 */
const DOMINANT_HARMONICS = [5, 7, 11, 13];

/** Resonance proximity threshold (in harmonic orders) for danger / caution classification. */
const DANGER_BAND = 0.5;
const CAUTION_BAND = 1.0;

/**
 * Compute the capacitor kVAR required to correct from an existing power factor
 * to a target power factor.
 *
 * Formula (IEEE 18-2012 §7):
 *   Q_cap = P × (tan(acos(pf_existing)) − tan(acos(pf_target)))
 *
 * Returns 0 when pf_existing ≥ pf_target (no correction required).
 *
 * @param {object} params
 * @param {number} params.pKw        Real power load (kW, > 0)
 * @param {number} params.pfExisting Existing power factor (0 < pf ≤ 1)
 * @param {number} params.pfTarget   Target power factor (0 < pf ≤ 1)
 * @returns {{ kvarRequired: number, tanDeltaExisting: number, tanDeltaTarget: number }}
 */
export function requiredKvar({ pKw, pfExisting, pfTarget }) {
  if (pKw <= 0) throw new Error('Real power pKw must be greater than zero');
  if (pfExisting <= 0 || pfExisting > 1) throw new Error('pfExisting must be in (0, 1]');
  if (pfTarget <= 0 || pfTarget > 1) throw new Error('pfTarget must be in (0, 1]');

  const tanExisting = Math.tan(Math.acos(Math.min(pfExisting, 1)));
  const tanTarget = Math.tan(Math.acos(Math.min(pfTarget, 1)));

  const kvarRequired = Math.max(0, pKw * (tanExisting - tanTarget));

  return {
    kvarRequired: Math.round(kvarRequired * 10) / 10,
    tanDeltaExisting: Math.round(tanExisting * 1000) / 1000,
    tanDeltaTarget: Math.round(tanTarget * 1000) / 1000,
  };
}

/**
 * Compute the parallel resonance harmonic order for a capacitor bank installed
 * at a bus with a known short-circuit MVA.
 *
 * Formula:
 *   h_r = √(kVA_sc / kVAR_cap)
 *
 * A system impedance peak (parallel resonance) occurs near harmonic h_r.
 * If h_r coincides with a dominant harmonic produced by non-linear loads,
 * the resulting harmonic voltage amplification can damage equipment and
 * produce IEEE 519 violations.
 *
 * @param {object} params
 * @param {number} params.kvaScMva  Short-circuit MVA at the bus (> 0)
 * @param {number} params.kvarCap   Capacitor bank kVAR rating (> 0)
 * @returns {{ harmonicOrder: number, riskLevel: 'safe'|'caution'|'danger',
 *             nearestDominant: number|null }}
 */
export function resonanceOrder({ kvaScMva, kvarCap }) {
  if (kvaScMva <= 0) throw new Error('kvaScMva must be greater than zero');
  if (kvarCap <= 0) throw new Error('kvarCap must be greater than zero');

  const kvaScKva = kvaScMva * 1000;
  const hr = Math.sqrt(kvaScKva / kvarCap);

  let riskLevel = 'safe';
  let nearestDominant = null;

  for (const h of DOMINANT_HARMONICS) {
    const dist = Math.abs(hr - h);
    if (dist <= DANGER_BAND) {
      riskLevel = 'danger';
      nearestDominant = h;
      break;
    } else if (dist <= CAUTION_BAND) {
      if (riskLevel !== 'danger') {
        riskLevel = 'caution';
        nearestDominant = h;
      }
    }
  }

  return {
    harmonicOrder: Math.round(hr * 100) / 100,
    riskLevel,
    nearestDominant,
  };
}

/**
 * Recommend a standard detuned reactor for harmonic resonance mitigation.
 *
 * A detuned (p%-reactor) filter shifts the LC resonance below the nearest
 * integer harmonic, preventing voltage amplification while still supplying
 * reactive power. The tuning factor p = 1 / h_tune² where h_tune is the
 * series resonant order of the LC cell.
 *
 * Standard detuning factors per manufacturer practice (ABB, Epcos, Schneider):
 *   p = 5.67%  →  h_tune = 4.30  (protects against 5th-harmonic resonance)
 *   p = 7%     →  h_tune = 3.78  (protects against 5th-harmonic resonance, wider margin)
 *   p = 14%    →  h_tune = 2.68  (protects against 3rd-harmonic resonance)
 *
 * @param {number} harmonicOrder  Resonant harmonic order from resonanceOrder()
 * @param {'safe'|'caution'|'danger'} riskLevel
 * @returns {{ needed: boolean, detuningPct: number|null, tunedToOrder: number|null,
 *             rationale: string }}
 */
export function detuningRecommendation(harmonicOrder, riskLevel) {
  if (riskLevel === 'safe') {
    return {
      needed: false,
      detuningPct: null,
      tunedToOrder: null,
      rationale: 'Resonance harmonic order is not near any dominant harmonic — no detuning required.',
    };
  }

  // Choose detuning factor based on proximity to a harmonic
  let detuningPct, tunedToOrder, rationale;

  if (harmonicOrder < 3.5) {
    // Near 3rd harmonic
    detuningPct = 14;
    tunedToOrder = 2.68;
    rationale = `Resonance order ${harmonicOrder} is near the 3rd harmonic. ` +
      `Specify a 14% detuned reactor (h_tune = 2.68) to shift resonance below h=3.`;
  } else if (harmonicOrder < 6) {
    // Near 5th harmonic
    detuningPct = 5.67;
    tunedToOrder = 4.30;
    rationale = `Resonance order ${harmonicOrder} is near the 5th harmonic. ` +
      `Specify a 5.67% detuned reactor (h_tune = 4.30) to shift resonance below h=5.`;
  } else if (harmonicOrder < 9) {
    // Near 7th harmonic
    detuningPct = 7;
    tunedToOrder = 3.78;
    rationale = `Resonance order ${harmonicOrder} is near the 7th harmonic. ` +
      `Specify a 7% detuned reactor (h_tune = 3.78) to shift resonance below h=5.`;
  } else {
    // Higher order — 5.67% is sufficient for most practical cases above 9th harmonic
    detuningPct = 5.67;
    tunedToOrder = 4.30;
    rationale = `Resonance order ${harmonicOrder} is near a higher harmonic. ` +
      `A 5.67% detuned reactor provides adequate protection in most cases.`;
  }

  return { needed: true, detuningPct, tunedToOrder, rationale };
}

/**
 * Select the recommended standard capacitor bank size(s) for a required kVAR.
 *
 * Returns the smallest standard size ≥ required, plus a 2-stage switched option
 * (two equal stages of half the total kVAR) for facilities that want to add reactive
 * power in steps (e.g. to follow a varying load profile and avoid leading PF at
 * light load).
 *
 * @param {number} kvarRequired  Required reactive power compensation (kVAR)
 * @returns {{ recommended: number, twoStage: number, stageKvar: number,
 *             options: number[] }}
 */
export function standardBankSizes(kvarRequired) {
  if (kvarRequired < 0) throw new Error('kvarRequired must be ≥ 0');
  if (kvarRequired === 0) {
    return { recommended: 0, twoStage: 0, stageKvar: 0, options: [] };
  }

  // Smallest standard size that meets or exceeds requirement
  const recommended = STANDARD_KVAR_SIZES.find(s => s >= kvarRequired)
    ?? STANDARD_KVAR_SIZES[STANDARD_KVAR_SIZES.length - 1];

  // 2-stage option: two equal stages totalling the recommended size
  const stageKvar = recommended / 2;
  const twoStage = recommended;

  // Return a window of nearby options for the user to choose from
  const idx = STANDARD_KVAR_SIZES.indexOf(recommended);
  const options = STANDARD_KVAR_SIZES.slice(Math.max(0, idx - 1), idx + 3);

  return { recommended, twoStage, stageKvar, options };
}

/**
 * Run a complete capacitor bank sizing analysis.
 *
 * Performs all four steps of the PFC workflow and returns a unified result
 * object. Does NOT read from or write to the data store — the caller
 * (capacitorbank.js) is responsible for persistence.
 *
 * @param {object} inputs
 * @param {string} [inputs.busLabel]         Descriptive bus / node label (optional)
 * @param {number}  inputs.pKw               Real power load (kW)
 * @param {number}  inputs.pfExisting        Existing power factor (e.g. 0.80)
 * @param {number}  inputs.pfTarget          Target power factor (e.g. 0.95)
 * @param {number}  inputs.voltageKv         System voltage (kV), used for annotation only
 * @param {number}  inputs.kvaScMva          Short-circuit MVA at bus (for resonance check)
 * @param {number[]} [inputs.dominantHarmonics] Dominant harmonic orders present (default [5,7])
 * @returns {object} Full analysis result
 */
export function runCapacitorBankAnalysis(inputs) {
  const {
    busLabel = '',
    pKw,
    pfExisting,
    pfTarget,
    voltageKv,
    kvaScMva,
    dominantHarmonics = [5, 7],
  } = inputs;

  const warnings = [];

  // Step 1 — Required kVAR
  const kvarResult = requiredKvar({ pKw, pfExisting, pfTarget });

  if (kvarResult.kvarRequired === 0) {
    return {
      busLabel,
      pKw,
      pfExisting,
      pfTarget,
      voltageKv,
      kvaScMva,
      kvarRequired: 0,
      bankSize: 0,
      twoStage: 0,
      stageKvar: 0,
      standardSizes: [],
      tanDeltaExisting: kvarResult.tanDeltaExisting,
      tanDeltaTarget: kvarResult.tanDeltaTarget,
      resonance: null,
      detuning: { needed: false, detuningPct: null, tunedToOrder: null,
        rationale: 'Power factor is already at or above target — no capacitor bank required.' },
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  // Step 2 — Standard bank size selection
  const bankResult = standardBankSizes(kvarResult.kvarRequired);

  if (bankResult.recommended > kvarResult.kvarRequired * 1.5) {
    warnings.push(
      `Nearest standard size (${bankResult.recommended} kVAR) is significantly larger than ` +
      `required (${kvarResult.kvarRequired} kVAR). Consider a 2-stage switched bank to avoid ` +
      `leading power factor at light load.`
    );
  }

  // Step 3 — Resonance check
  let resonance = null;
  let detuning = { needed: false, detuningPct: null, tunedToOrder: null,
    rationale: 'Short-circuit MVA not provided — resonance check skipped.' };

  if (kvaScMva > 0) {
    resonance = resonanceOrder({ kvaScMva, kvarCap: bankResult.recommended });
    detuning = detuningRecommendation(resonance.harmonicOrder, resonance.riskLevel);

    // Override risk using caller-supplied dominant harmonics list
    const customRisk = dominantHarmonics.some(h => Math.abs(resonance.harmonicOrder - h) <= DANGER_BAND)
      ? 'danger'
      : dominantHarmonics.some(h => Math.abs(resonance.harmonicOrder - h) <= CAUTION_BAND)
        ? 'caution'
        : null;
    if (customRisk && customRisk !== resonance.riskLevel) {
      resonance = { ...resonance, riskLevel: customRisk };
      detuning = detuningRecommendation(resonance.harmonicOrder, customRisk);
    }

    if (resonance.riskLevel === 'danger') {
      warnings.push(
        `Parallel resonance at h=${resonance.harmonicOrder} coincides with a dominant harmonic ` +
        `(h=${resonance.nearestDominant}). A detuned reactor is strongly recommended.`
      );
    } else if (resonance.riskLevel === 'caution') {
      warnings.push(
        `Parallel resonance at h=${resonance.harmonicOrder} is close to a dominant harmonic ` +
        `(h=${resonance.nearestDominant}). Verify harmonic levels before energizing.`
      );
    }
  } else {
    warnings.push('Short-circuit MVA not provided — resonance check was skipped. ' +
      'Obtain SC MVA from the Short-Circuit study and re-run for a complete analysis.');
  }

  return {
    busLabel,
    pKw,
    pfExisting,
    pfTarget,
    voltageKv,
    kvaScMva,
    kvarRequired: kvarResult.kvarRequired,
    tanDeltaExisting: kvarResult.tanDeltaExisting,
    tanDeltaTarget: kvarResult.tanDeltaTarget,
    bankSize: bankResult.recommended,
    twoStage: bankResult.twoStage,
    stageKvar: bankResult.stageKvar,
    standardSizes: bankResult.options,
    resonance,
    detuning,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
