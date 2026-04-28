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
export const CAPACITOR_BANK_DUTY_VERSION = 'capacitor-bank-duty-v1';

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

const TOPOLOGIES = new Set(['plain', 'detuned', 'singleTuned', 'highPass', 'activeFilterLinked']);
const CONTROL_MODES = new Set(['automatic', 'manual', 'lockedOut']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function round(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function validateNonNegative(value, field, fallback = 0) {
  const number = parseNumber(value, fallback);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`);
  return number;
}

function validatePositive(value, field, fallback = 1) {
  const number = parseNumber(value, fallback);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} must be greater than zero`);
  return number;
}

function statusFromRatio(actual, limit, warnRatio = 0.9) {
  if (!Number.isFinite(actual) || !Number.isFinite(limit) || limit <= 0) return 'missingData';
  if (actual > limit) return 'fail';
  if (actual >= limit * warnRatio) return 'warn';
  return 'pass';
}

function statusClass(status = '') {
  if (status === 'pass') return 'badge-ok';
  if (status === 'warn' || status === 'review') return 'badge-warn';
  if (status === 'fail') return 'badge-fail';
  return 'badge-info';
}

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeBaseResult(context = {}) {
  if (context.baseResult) return context.baseResult;
  if (context.capacitorBank?.baseResult) return context.capacitorBank.baseResult;
  if (context.capacitorBank?.kvarRequired != null) return context.capacitorBank;
  if (context.inputs) return runCapacitorBankAnalysis(context.inputs);
  return runCapacitorBankAnalysis({
    busLabel: context.busLabel || context.dutyCase?.busLabel || '',
    pKw: validatePositive(context.pKw ?? context.dutyCase?.pKw, 'pKw', 1000),
    pfExisting: parseNumber(context.pfExisting ?? context.dutyCase?.pfExisting, 0.8),
    pfTarget: parseNumber(context.pfTarget ?? context.dutyCase?.targetPowerFactor, 0.95),
    voltageKv: parseNumber(context.voltageKv ?? context.dutyCase?.voltageKv, 0.48),
    kvaScMva: parseNumber(context.kvaScMva ?? context.dutyCase?.kvaScMva, 0),
    dominantHarmonics: context.dominantHarmonics || context.dutyCase?.targetHarmonics || [5, 7],
  });
}

export function normalizeCapacitorBankDutyCase(input = {}) {
  const source = input.dutyCase || input;
  const topology = TOPOLOGIES.has(source.topology) ? source.topology : 'plain';
  const controlMode = CONTROL_MODES.has(source.controlMode) ? source.controlMode : 'automatic';
  const voltageKv = validatePositive(source.voltageKv, 'voltageKv', 0.48);
  const targetPowerFactor = parseNumber(source.targetPowerFactor ?? source.pfTarget, 0.95);
  if (!Number.isFinite(targetPowerFactor) || targetPowerFactor <= 0 || targetPowerFactor > 1) throw new Error('targetPowerFactor must be in (0, 1]');
  const controllerDeadband = validateNonNegative(source.controllerDeadband ?? source.deadband, 'controllerDeadband', 0.02);
  const controllerTimeDelaySec = validateNonNegative(source.controllerTimeDelaySec ?? source.timeDelaySec, 'controllerTimeDelaySec', 30);
  const minimumStepKvar = validateNonNegative(source.minimumStepKvar, 'minimumStepKvar', 0);
  const reactorPercent = validateNonNegative(source.reactorPercent ?? source.detuningPct, 'reactorPercent', topology === 'plain' ? 0 : 5.67);
  const tunedOrder = validateNonNegative(source.tunedOrder, 'tunedOrder', reactorPercent > 0 ? Math.sqrt(100 / reactorPercent) : 0);
  const dischargeLimitSec = validatePositive(source.dischargeLimitSec, 'dischargeLimitSec', 60);
  const voltageRatingMarginPct = validateNonNegative(source.voltageRatingMarginPct, 'voltageRatingMarginPct', 10);
  const rmsCurrentLimitPct = validatePositive(source.rmsCurrentLimitPct, 'rmsCurrentLimitPct', 135);
  const kvarOverloadLimitPct = validatePositive(source.kvarOverloadLimitPct, 'kvarOverloadLimitPct', 135);
  const harmonicCurrentMultiplier = validatePositive(source.harmonicCurrentMultiplier, 'harmonicCurrentMultiplier', topology === 'plain' ? 1.15 : 1.05);
  return {
    busLabel: normalizeText(source.busLabel || source.bus || ''),
    voltageKv,
    targetPowerFactor,
    controllerDeadband,
    controllerTimeDelaySec,
    minimumStepKvar,
    controlMode,
    lockout: Boolean(source.lockout),
    topology,
    reactorPercent,
    tunedOrder: round(tunedOrder, 3),
    targetHarmonics: asArray(source.targetHarmonics).map(Number).filter(Number.isFinite),
    linkedFilterAlternativeId: normalizeText(source.linkedFilterAlternativeId || ''),
    breakerTag: normalizeText(source.breakerTag || ''),
    contactorTag: normalizeText(source.contactorTag || ''),
    fuseTag: normalizeText(source.fuseTag || ''),
    ctRatio: normalizeText(source.ctRatio || ''),
    unbalanceProtection: Boolean(source.unbalanceProtection),
    overvoltageLimitPct: validatePositive(source.overvoltageLimitPct, 'overvoltageLimitPct', 110),
    rmsCurrentLimitPct,
    kvarOverloadLimitPct,
    inrushLimitA: parseNumber(source.inrushLimitA, null),
    outrushLimitA: parseNumber(source.outrushLimitA, null),
    dischargeLimitSec,
    voltageRatingMarginPct,
    harmonicCurrentMultiplier,
    notes: normalizeText(source.notes || ''),
  };
}

export function normalizeCapacitorStageRows(rows = [], options = {}) {
  const sourceRows = asArray(rows);
  if (!sourceRows.length) {
    const base = options.baseResult || {};
    if (!base.bankSize) return [];
    const stageKvar = base.stageKvar && base.stageKvar < base.bankSize ? base.stageKvar : base.bankSize;
    const count = stageKvar > 0 && stageKvar < base.bankSize ? Math.round(base.bankSize / stageKvar) : 1;
    return Array.from({ length: Math.max(1, count) }, (_, index) => ({
      id: `stage-${index + 1}`,
      label: `Stage ${index + 1}`,
      kvar: stageKvar,
      voltageRatingKv: round((base.voltageKv || options.dutyCase?.voltageKv || 0.48) * 1.1, 3),
      switchingDevice: index === 0 ? 'contactor' : 'contactor',
      stepOrder: index + 1,
      enabled: true,
      dischargeTimeSec: 60,
      notes: '',
      missingFields: [],
    }));
  }
  return sourceRows.map((row, index) => {
    const kvar = validatePositive(row.kvar ?? row.stageKvar, `stageRows[${index}].kvar`, 1);
    const voltageRatingKv = validatePositive(row.voltageRatingKv ?? row.ratedVoltageKv, `stageRows[${index}].voltageRatingKv`, (options.dutyCase?.voltageKv || 0.48) * 1.1);
    const dischargeTimeSec = validateNonNegative(row.dischargeTimeSec, `stageRows[${index}].dischargeTimeSec`, 60);
    const missingFields = [];
    if (!normalizeText(row.switchingDevice)) missingFields.push('switchingDevice');
    return {
      id: normalizeText(row.id || `stage-${index + 1}`),
      label: normalizeText(row.label || row.name || `Stage ${index + 1}`),
      kvar: round(kvar, 3),
      voltageRatingKv: round(voltageRatingKv, 3),
      switchingDevice: normalizeText(row.switchingDevice || ''),
      stepOrder: Math.max(1, Math.round(parseNumber(row.stepOrder, index + 1))),
      enabled: row.enabled !== false,
      dischargeTimeSec: round(dischargeTimeSec, 1),
      notes: normalizeText(row.notes || ''),
      missingFields,
    };
  }).sort((a, b) => a.stepOrder - b.stepOrder || a.id.localeCompare(b.id));
}

export function buildCapacitorControllerRows(caseData = {}, options = {}) {
  const dutyCase = normalizeCapacitorBankDutyCase(caseData);
  const totalEnabledKvar = asArray(options.stageRows).filter(row => row.enabled).reduce((sum, row) => sum + (Number(row.kvar) || 0), 0);
  const warnings = [];
  if (dutyCase.controlMode === 'automatic' && dutyCase.minimumStepKvar > 0 && totalEnabledKvar > 0 && dutyCase.minimumStepKvar > totalEnabledKvar) {
    warnings.push('Minimum controller step is larger than enabled bank kvar.');
  }
  if (dutyCase.lockout) warnings.push('Controller lockout is enabled; automatic switching is blocked.');
  return [{
    id: 'controller-1',
    controlMode: dutyCase.controlMode,
    targetPowerFactor: dutyCase.targetPowerFactor,
    deadband: dutyCase.controllerDeadband,
    timeDelaySec: dutyCase.controllerTimeDelaySec,
    minimumStepKvar: dutyCase.minimumStepKvar,
    lockout: dutyCase.lockout,
    totalEnabledKvar: round(totalEnabledKvar, 3),
    status: warnings.length ? 'warn' : 'pass',
    warnings,
    recommendation: warnings.length ? 'Review controller settings before energizing automatic stages.' : 'Controller settings are complete for screening review.',
  }];
}

function capacitorCurrentA(kvar, voltageKv) {
  if (!Number.isFinite(kvar) || !Number.isFinite(voltageKv) || voltageKv <= 0) return null;
  return kvar / (Math.sqrt(3) * voltageKv);
}

function resonanceDutyStatus(baseResult = {}, dutyCase = {}) {
  const risk = baseResult.resonance?.riskLevel || (baseResult.kvaScMva > 0 ? 'safe' : 'missingData');
  if (risk === 'missingData') return { status: 'missingData', message: 'Short-circuit MVA is missing; resonance and detuning duty cannot be verified.' };
  if (risk === 'danger' && dutyCase.topology === 'plain') return { status: 'fail', message: 'Plain capacitor bank has resonance danger near injected harmonics.' };
  if (risk === 'caution' && dutyCase.topology === 'plain') return { status: 'warn', message: 'Plain capacitor bank has resonance caution near dominant harmonics.' };
  if ((risk === 'danger' || risk === 'caution') && dutyCase.topology !== 'plain') return { status: 'warn', message: 'Detuned/filter topology mitigates resonance in screening; verify manufacturer filter duty.' };
  return { status: 'pass', message: 'Resonance screening is acceptable for the selected topology.' };
}

export function evaluateCapacitorDuty({ baseResult = {}, dutyCase = {}, stageRows = [], frequencyScan = null, harmonicStudy = null } = {}) {
  const normalizedCase = normalizeCapacitorBankDutyCase({ ...baseResult, ...dutyCase });
  const stages = normalizeCapacitorStageRows(stageRows, { baseResult, dutyCase: normalizedCase });
  const dutyRows = [];
  const switchingRows = [];
  const enabledStages = stages.filter(stage => stage.enabled);
  enabledStages.forEach(stage => {
    const nominalCurrentA = capacitorCurrentA(stage.kvar, normalizedCase.voltageKv);
    const rmsCurrentA = nominalCurrentA == null ? null : nominalCurrentA * normalizedCase.harmonicCurrentMultiplier;
    const rmsLimitA = nominalCurrentA == null ? null : nominalCurrentA * (normalizedCase.rmsCurrentLimitPct / 100);
    const ratedVoltageLimitKv = stage.voltageRatingKv;
    const voltageStatus = statusFromRatio(normalizedCase.voltageKv, ratedVoltageLimitKv, 0.95);
    const currentStatus = statusFromRatio(rmsCurrentA, rmsLimitA, 0.9);
    const kvarLimit = stage.kvar * (normalizedCase.kvarOverloadLimitPct / 100);
    const kvarStatus = statusFromRatio(stage.kvar, kvarLimit, 0.95);
    const inrushA = nominalCurrentA == null ? null : nominalCurrentA * (normalizedCase.topology === 'plain' ? 20 : normalizedCase.topology === 'detuned' ? 12 : 8) * Math.max(1, enabledStages.length - stage.stepOrder + 1);
    const outrushA = nominalCurrentA == null ? null : nominalCurrentA * (normalizedCase.topology === 'plain' ? 12 : 8) * Math.max(1, enabledStages.length - 1);
    const inrushStatus = normalizedCase.inrushLimitA ? statusFromRatio(inrushA, normalizedCase.inrushLimitA, 0.85) : 'warn';
    const dischargeStatus = stage.dischargeTimeSec > normalizedCase.dischargeLimitSec ? 'fail' : stage.dischargeTimeSec >= normalizedCase.dischargeLimitSec * 0.8 ? 'warn' : 'pass';
    const missing = stage.missingFields.length ? 'missingData' : null;
    dutyRows.push(
      {
        id: `${stage.id}-voltage`,
        stageId: stage.id,
        stageLabel: stage.label,
        checkType: 'voltageRating',
        actualValue: normalizedCase.voltageKv,
        limitValue: ratedVoltageLimitKv,
        unit: 'kV',
        status: missing || voltageStatus,
        recommendation: voltageStatus === 'fail' ? 'Select a capacitor voltage rating above operating voltage with project margin.' : 'Voltage rating is acceptable for screening.',
      },
      {
        id: `${stage.id}-rms-current`,
        stageId: stage.id,
        stageLabel: stage.label,
        checkType: 'rmsCurrent',
        actualValue: round(rmsCurrentA, 3),
        limitValue: round(rmsLimitA, 3),
        unit: 'A',
        status: missing || currentStatus,
        recommendation: currentStatus === 'fail' ? 'Review harmonic current spectrum and specify capacitor/reactor current rating.' : 'RMS current duty is acceptable for screening.',
      },
      {
        id: `${stage.id}-kvar-overload`,
        stageId: stage.id,
        stageLabel: stage.label,
        checkType: 'kvarOverload',
        actualValue: stage.kvar,
        limitValue: round(kvarLimit, 3),
        unit: 'kVAR',
        status: missing || kvarStatus,
        recommendation: 'Confirm capacitor kvar tolerance and thermal overload basis with vendor data.',
      },
      {
        id: `${stage.id}-discharge`,
        stageId: stage.id,
        stageLabel: stage.label,
        checkType: 'dischargeTime',
        actualValue: stage.dischargeTimeSec,
        limitValue: normalizedCase.dischargeLimitSec,
        unit: 's',
        status: missing || dischargeStatus,
        recommendation: dischargeStatus === 'fail' ? 'Specify discharge resistors or controls that meet the selected discharge-time limit.' : 'Discharge timing is acceptable for screening.',
      }
    );
    switchingRows.push({
      id: `${stage.id}-switching`,
      stageId: stage.id,
      stageLabel: stage.label,
      switchingDevice: stage.switchingDevice,
      stepOrder: stage.stepOrder,
      nominalCurrentA: round(nominalCurrentA, 3),
      estimatedInrushA: round(inrushA, 3),
      estimatedOutrushA: round(outrushA, 3),
      inrushLimitA: normalizedCase.inrushLimitA,
      outrushLimitA: normalizedCase.outrushLimitA,
      status: missing || inrushStatus,
      recommendation: normalizedCase.inrushLimitA ? 'Verify switching device close-and-latch duty against estimated inrush/outrush.' : 'Enter switching-device inrush limit for a complete duty check.',
    });
  });
  const resonance = resonanceDutyStatus(baseResult, normalizedCase);
  dutyRows.push({
    id: 'bank-resonance',
    stageId: 'bank',
    stageLabel: baseResult.busLabel || normalizedCase.busLabel || 'Capacitor bank',
    checkType: 'resonanceDetuning',
    actualValue: baseResult.resonance?.harmonicOrder || '',
    limitValue: normalizedCase.reactorPercent || '',
    unit: 'harmonic/reactor%',
    status: resonance.status,
    recommendation: resonance.message,
  });
  const frequencyScanLinks = [
    ...asArray(frequencyScan?.resonances).map((row, index) => ({
      id: `frequency-scan-${index + 1}`,
      source: 'frequencyScan',
      harmonicOrder: row.h,
      risk: row.risk || row.status || 'review',
      message: `Frequency scan ${row.type || 'resonance'} near h=${row.h}.`,
      status: row.risk === 'danger' ? 'fail' : row.risk === 'caution' || row.risk === 'medium' ? 'warn' : 'review',
    })),
    ...asArray(harmonicStudy?.filterAlternatives).map((row, index) => ({
      id: `harmonic-filter-${row.id || index + 1}`,
      source: 'harmonicStudy',
      harmonicOrder: asArray(row.targetHarmonics).join(', '),
      risk: row.frequencyScanResonanceRisk || row.status || 'review',
      message: row.name || row.recommendation || 'Harmonic filter alternative linked to capacitor duty.',
      status: row.frequencyScanResonanceRisk === 'danger' ? 'fail' : row.status === 'review' || row.status === 'recommended' ? 'warn' : 'review',
    })),
  ];
  return { dutyRows, switchingRows, frequencyScanLinks };
}

export function buildCapacitorProtectionRows({ dutyCase = {}, stageRows = [], dutyRows = [] } = {}) {
  const normalizedCase = normalizeCapacitorBankDutyCase(dutyCase);
  const rows = [];
  const missingProtection = !normalizedCase.breakerTag && !normalizedCase.contactorTag && !normalizedCase.fuseTag;
  rows.push({
    id: 'bank-protection',
    protectionType: 'shortCircuitSwitching',
    deviceTags: [normalizedCase.breakerTag, normalizedCase.contactorTag, normalizedCase.fuseTag].filter(Boolean).join(', '),
    ctRatio: normalizedCase.ctRatio,
    unbalanceProtection: normalizedCase.unbalanceProtection,
    stageCount: asArray(stageRows).filter(row => row.enabled).length,
    status: missingProtection ? 'missingData' : asArray(dutyRows).some(row => row.status === 'fail') ? 'warn' : 'pass',
    recommendation: missingProtection ? 'Record breaker, contactor, or fuse basis for capacitor-bank protection review.' : 'Protection metadata is present; verify ratings against manufacturer duty.',
  });
  rows.push({
    id: 'bank-unbalance',
    protectionType: 'unbalanceProtection',
    deviceTags: normalizedCase.ctRatio,
    ctRatio: normalizedCase.ctRatio,
    unbalanceProtection: normalizedCase.unbalanceProtection,
    stageCount: asArray(stageRows).filter(row => row.enabled).length,
    status: normalizedCase.unbalanceProtection ? 'pass' : 'warn',
    recommendation: normalizedCase.unbalanceProtection ? 'Unbalance protection is flagged for review.' : 'Review unbalance protection for multi-stage or medium-voltage capacitor banks.',
  });
  return rows;
}

function summarizeCapacitorDuty(stageRows = [], dutyRows = [], protectionRows = [], switchingRows = [], warningRows = []) {
  const counts = { pass: 0, warn: 0, fail: 0, missingData: 0 };
  [...dutyRows, ...protectionRows, ...switchingRows].forEach(row => {
    if (row.status === 'fail') counts.fail += 1;
    else if (row.status === 'warn' || row.status === 'review') counts.warn += 1;
    else if (row.status === 'missingData') counts.missingData += 1;
    else counts.pass += 1;
  });
  return {
    stageCount: stageRows.length,
    enabledStageCount: stageRows.filter(row => row.enabled).length,
    totalEnabledKvar: round(stageRows.filter(row => row.enabled).reduce((sum, row) => sum + row.kvar, 0), 3),
    dutyRowCount: dutyRows.length,
    protectionRowCount: protectionRows.length,
    switchingRowCount: switchingRows.length,
    warningCount: warningRows.length,
    ...counts,
    status: counts.fail ? 'action-required' : (counts.warn || counts.missingData || warningRows.length) ? 'review' : 'pass',
  };
}

function buildCapacitorWarnings(baseResult = {}, dutyRows = [], protectionRows = [], switchingRows = [], frequencyScanLinks = []) {
  const warnings = [
    ...asArray(baseResult.warnings).map((message, index) => ({
      severity: /danger|strongly|not provided|missing/i.test(message) ? 'warning' : 'info',
      code: `legacyWarning${index + 1}`,
      message,
    })),
  ];
  [...dutyRows, ...protectionRows, ...switchingRows].forEach(row => {
    if (row.status === 'fail' || row.status === 'warn' || row.status === 'missingData') {
      warnings.push({
        severity: row.status === 'fail' ? 'error' : 'warning',
        code: row.checkType || row.protectionType || 'capacitorDutyReview',
        sourceId: row.stageId || row.id,
        message: row.recommendation || `${row.id} status is ${row.status}.`,
      });
    }
  });
  frequencyScanLinks.filter(row => row.status === 'fail' || row.status === 'warn').forEach(row => warnings.push({
    severity: row.status === 'fail' ? 'error' : 'warning',
    code: 'linkedFrequencyScan',
    sourceId: row.id,
    message: row.message,
  }));
  return warnings;
}

export function buildCapacitorBankDutyPackage(context = {}) {
  if (context.version === CAPACITOR_BANK_DUTY_VERSION && context.summary) return context;
  const baseResult = normalizeBaseResult(context);
  const dutyCase = normalizeCapacitorBankDutyCase({
    busLabel: baseResult.busLabel,
    voltageKv: baseResult.voltageKv || context.dutyCase?.voltageKv,
    targetPowerFactor: baseResult.pfTarget,
    kvaScMva: baseResult.kvaScMva,
    ...(context.dutyCase || {}),
  });
  const stageRows = normalizeCapacitorStageRows(context.stageRows || context.capacitorBank?.stageRows || [], { baseResult, dutyCase });
  const controllerRows = buildCapacitorControllerRows(dutyCase, { stageRows });
  const evaluated = evaluateCapacitorDuty({
    baseResult,
    dutyCase,
    stageRows,
    frequencyScan: context.frequencyScan || context.studyResults?.frequencyScan,
    harmonicStudy: context.harmonicStudy || context.studyResults?.harmonicStudyCase || context.studyResults?.harmonics,
  });
  const protectionRows = buildCapacitorProtectionRows({ dutyCase, stageRows, dutyRows: evaluated.dutyRows });
  const warningRows = buildCapacitorWarnings(baseResult, evaluated.dutyRows, protectionRows, evaluated.switchingRows, evaluated.frequencyScanLinks);
  const summary = summarizeCapacitorDuty(stageRows, evaluated.dutyRows, protectionRows, evaluated.switchingRows, warningRows);
  return {
    version: CAPACITOR_BANK_DUTY_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || baseResult.projectName || 'Untitled Project',
    baseResult,
    dutyCase,
    stageRows,
    controllerRows,
    dutyRows: evaluated.dutyRows,
    protectionRows,
    switchingRows: evaluated.switchingRows,
    frequencyScanLinks: evaluated.frequencyScanLinks,
    warningRows,
    assumptions: [
      'Capacitor bank duty results are deterministic local screening checks, not manufacturer-certified bank design.',
      'Inrush/outrush and harmonic RMS current estimates are screening approximations and require vendor verification.',
      'Linked harmonic and frequency-scan rows are used as review context; this package does not run EMT switching transients.',
    ],
    summary,
  };
}

export function renderCapacitorBankDutyHTML(pkg = {}) {
  const packageData = buildCapacitorBankDutyPackage(pkg);
  const table = (rows, columns) => `<table class="report-table"><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(col.format ? col.format(row[col.key], row) : row[col.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">No rows.</td></tr>`
  }</tbody></table>`;
  return `<section class="report-section" id="rpt-capacitor-bank-duty">
  <h2>Capacitor Bank Duty and Switching Basis</h2>
  <p class="report-note">Auditable capacitor-bank stage, controller, detuning, protection, and switching-duty screening package. Final capacitor/reactor/switching equipment ratings require manufacturer verification.</p>
  <dl class="report-dl">
    <dt>Bus</dt><dd>${escapeHtml(packageData.dutyCase.busLabel || packageData.baseResult.busLabel || 'Not specified')}</dd>
    <dt>Enabled kVAR</dt><dd>${escapeHtml(packageData.summary.totalEnabledKvar)}</dd>
    <dt>Topology</dt><dd>${escapeHtml(packageData.dutyCase.topology)}</dd>
    <dt>Status</dt><dd><span class="${statusClass(packageData.summary.status)}">${escapeHtml(packageData.summary.status)}</span></dd>
  </dl>
  <h3>Stage Schedule</h3>
  ${table(packageData.stageRows, [
    { key: 'label', label: 'Stage' },
    { key: 'kvar', label: 'kVAR' },
    { key: 'voltageRatingKv', label: 'Rating kV' },
    { key: 'switchingDevice', label: 'Switching Device' },
    { key: 'stepOrder', label: 'Step' },
    { key: 'enabled', label: 'Enabled' },
    { key: 'dischargeTimeSec', label: 'Discharge s' },
  ])}
  <h3>Duty Checks</h3>
  ${table(packageData.dutyRows, [
    { key: 'stageLabel', label: 'Stage' },
    { key: 'checkType', label: 'Check' },
    { key: 'actualValue', label: 'Actual' },
    { key: 'limitValue', label: 'Limit' },
    { key: 'unit', label: 'Unit' },
    { key: 'status', label: 'Status' },
    { key: 'recommendation', label: 'Recommendation' },
  ])}
  <h3>Protection and Switching</h3>
  ${table([...packageData.protectionRows, ...packageData.switchingRows], [
    { key: 'id', label: 'Row' },
    { key: 'protectionType', label: 'Protection Type' },
    { key: 'switchingDevice', label: 'Switching Device' },
    { key: 'status', label: 'Status' },
    { key: 'recommendation', label: 'Recommendation' },
  ])}
  <h3>Warnings</h3>
  <ul>${packageData.warningRows.length ? packageData.warningRows.map(row => `<li><strong>${escapeHtml(row.severity)}:</strong> ${escapeHtml(row.message)}</li>`).join('') : '<li>No capacitor duty warnings.</li>'}</ul>
</section>`;
}
