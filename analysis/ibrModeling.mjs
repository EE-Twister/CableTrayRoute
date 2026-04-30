/**
 * PV / BESS / Inverter-Based Resource (IBR) Modeling
 *
 * Standards:
 *   IEEE 1547-2018   — Standard for Interconnection and Interoperability of
 *                      Distributed Energy Resources with Associated Electric Power
 *                      Systems Interfaces (Volt-VAR, Freq-Watt, ride-through)
 *   IEEE 1547a-2020  — Amendment to IEEE 1547-2018
 *   IEEE 2800-2022   — Standard for Interconnection and Interoperability of
 *                      Inverter-Based Resources Interconnecting with Associated
 *                      Transmission Electric Power Systems
 *   IEC 61727:2004   — Photovoltaic (PV) systems — Characteristics of the utility
 *                      interface
 *   IEC 62116:2014   — Utility-interconnected photovoltaic inverters — Test
 *                      procedure of islanding prevention measures
 *
 * Module overview
 * ───────────────
 * 1. pvArrayOutput()         — STC-corrected AC output from irradiance + temperature
 * 2. ibrPQCapability()       — P-Q operating envelope with Volt-VAR droop (IEEE 1547 Table 8)
 * 3. ibrFaultContribution()  — Current-limited fault current (IEEE 1547 §6.4 / IEEE 2800)
 * 4. bessDispatch()          — BESS charge/discharge dispatch with SOC constraints
 * 5. freqWattResponse()      — Active power curtailment per IEEE 1547 §5.3.1 (Freq-Watt)
 * 6. runIBRStudy()           — Convenience wrapper that computes all five in one call
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard test conditions (STC) irradiance, W/m² */
export const STC_IRRADIANCE = 1000;

/** STC cell temperature, °C */
export const STC_TEMP_C = 25;

/**
 * IEEE 1547-2018 Table 8 — Default Volt-VAR curves for Category A and B.
 * Each entry: [V_pu, Q_pu]  (Q positive = capacitive / reactive power injection)
 * Segment endpoints are the "default operating point" values from the standard.
 */
export const VOLT_VAR_CURVES = {
  /** Category A — utility-scale, tighter deadband */
  A: [
    [0.92, 0.44],
    [0.98, 0.0],
    [1.02, 0.0],
    [1.08, -0.44],
  ],
  /** Category B — distributed rooftop, wider deadband */
  B: [
    [0.90, 0.44],
    [0.98, 0.0],
    [1.02, 0.0],
    [1.10, -0.44],
  ],
};

/** Default IBR parameters (IEEE 1547 / IEC 61727 typical values) */
export const IBR_DEFAULTS = {
  inverterEfficiency: 0.97,
  tempCoefficientPctPerC: -0.35,
  voltVarCategory: 'B',
  faultCurrentLimitFactor: 1.1,
  bessRoundTripEff: 0.92,
  bessMinSocPct: 10,
  bessMaxSocPct: 95,
  freqDbLow_Hz: 59.98,
  freqDbHigh_Hz: 60.02,
  freqDroop_pct: 5,
  nominalFreq_Hz: 60,
};

export const IBR_PLANT_CONTROLLER_VERSION = 'ibr-plant-controller-v1';

const PLANT_MODES = new Set(['gridFollowing', 'gridForming', 'hybrid', 'unknown']);
const CONTROL_MODES = new Set([
  'constantPF',
  'voltVar',
  'voltWatt',
  'wattPF',
  'freqWatt',
  'schedule',
  'reactivePriority',
  'activePowerPriority',
]);
const PRIORITY_MODES = new Set(['reactivePriority', 'activePowerPriority']);
const RESOURCE_TYPES = new Set(['pv', 'bess', 'genericInverter', 'ibr']);
const CURVE_TYPES = new Set(['voltVar', 'voltWatt', 'wattPF', 'freqWatt', 'voltageRideThrough', 'frequencyRideThrough']);
const SCENARIO_TYPES = new Set(['base', 'minLoad', 'maxLoad', 'weakGrid', 'strongGrid', 'highIrradiance', 'lowIrradiance', 'bessCharge', 'bessDischarge', 'voltageEvent', 'frequencyEvent']);
const REPORT_PRESETS = new Set(['summary', 'gridCode', 'fullStudy']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function normalizeEnum(value, allowed, fallback, label) {
  const raw = String(value || fallback || '').trim();
  if (allowed.has(raw)) return raw;
  throw new Error(`${label} must be one of ${Array.from(allowed).join(', ')}`);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCurvePoints(points = [], curveType = 'curve') {
  const normalized = asArray(points).map((point, index) => {
    const row = Array.isArray(point)
      ? { x: point[0], y: point[1] }
      : asObject(point);
    const x = finiteNumber(row.x ?? row.voltagePu ?? row.frequencyHz ?? row.timeSec);
    const y = finiteNumber(row.y ?? row.value ?? row.qPu ?? row.pPu ?? row.pf ?? row.threshold);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`${curveType} point ${index + 1} must include finite x/y values`);
    }
    return {
      x,
      y,
      label: String(row.label || `${curveType}-${index + 1}`),
    };
  }).sort((a, b) => a.x - b.x);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].x <= normalized[index - 1].x) {
      throw new Error(`${curveType} points must have unique increasing x values`);
    }
  }
  return normalized;
}

function interpolatePointCurve(x, points, fallback = 1) {
  const rows = asArray(points);
  if (!rows.length) return fallback;
  if (x <= rows[0].x) return rows[0].y;
  if (x >= rows[rows.length - 1].x) return rows[rows.length - 1].y;
  for (let index = 0; index < rows.length - 1; index += 1) {
    const left = rows[index];
    const right = rows[index + 1];
    if (x >= left.x && x <= right.x) {
      const span = right.x - left.x || 1;
      const t = (x - left.x) / span;
      return left.y + (right.y - left.y) * t;
    }
  }
  return fallback;
}

function statusFromRows(rows = []) {
  if (rows.some(row => row.status === 'fail')) return 'fail';
  if (rows.some(row => row.status === 'missingData')) return 'missingData';
  if (rows.some(row => row.status === 'warn' || row.status === 'review')) return 'warn';
  return 'pass';
}

// ---------------------------------------------------------------------------
// 1. PV Array Output
// ---------------------------------------------------------------------------

/**
 * Calculate AC output power from a PV array at arbitrary irradiance and temperature.
 *
 * @param {object} p
 * @param {number} p.irradiance_W_m2       — plane-of-array irradiance (W/m²)
 * @param {number} p.temp_C                — module cell temperature (°C)
 * @param {number} p.Pstc_kW               — DC STC rating of the array (kW)
 * @param {number} [p.tempCoeff_pct=-0.35] — temperature power coefficient (%/°C)
 * @param {number} [p.inverterEff=0.97]    — inverter efficiency (0–1)
 * @param {number} [p.sRated_kVA]          — inverter apparent power limit (kVA);
 *                                            defaults to Pstc_kW / inverterEff if omitted
 * @param {number} [p.voltVarQ_kvar=0]     — reactive power dispatch from Volt-VAR (kvar)
 * @returns {{ pDC_kW, pAC_kW, qAC_kvar, sAC_kVA, pf, curtailed, tempFactor, irradFactor }}
 */
export function pvArrayOutput({
  irradiance_W_m2,
  temp_C,
  Pstc_kW,
  tempCoeff_pct = IBR_DEFAULTS.tempCoefficientPctPerC,
  inverterEff = IBR_DEFAULTS.inverterEfficiency,
  sRated_kVA,
  voltVarQ_kvar = 0,
}) {
  const G = Number(irradiance_W_m2);
  const T = Number(temp_C);
  const Pstc = Number(Pstc_kW);
  const eta = Math.max(0.5, Math.min(1, Number(inverterEff)));
  const coeff = Number(tempCoeff_pct) / 100;

  if (!Number.isFinite(G) || G < 0) throw new Error('irradiance_W_m2 must be ≥ 0');
  if (!Number.isFinite(T)) throw new Error('temp_C must be a finite number');
  if (!Number.isFinite(Pstc) || Pstc <= 0) throw new Error('Pstc_kW must be a positive number');

  const irradFactor = G / STC_IRRADIANCE;
  const tempFactor = 1 + coeff * (T - STC_TEMP_C);
  const pDC_kW = Pstc * irradFactor * tempFactor;

  const sMax_kVA = Number.isFinite(Number(sRated_kVA)) && Number(sRated_kVA) > 0
    ? Number(sRated_kVA)
    : Pstc / eta;

  const pAC_unclamped = pDC_kW * eta;
  const q = Number(voltVarQ_kvar) || 0;

  // Clamp P so that √(P² + Q²) ≤ S_rated
  const qAC_kvar = Math.min(Math.abs(q), sMax_kVA) * Math.sign(q || 1);
  const pAC_max = Math.sqrt(Math.max(0, sMax_kVA ** 2 - qAC_kvar ** 2));
  const pAC_kW = Math.max(0, Math.min(pAC_unclamped, pAC_max));
  const curtailed = pAC_unclamped > pAC_max;

  const sAC_kVA = Math.sqrt(pAC_kW ** 2 + qAC_kvar ** 2);
  const pf = sAC_kVA > 0 ? pAC_kW / sAC_kVA : 1;

  return { pDC_kW, pAC_kW, qAC_kvar, sAC_kVA, pf, curtailed, tempFactor, irradFactor };
}

// ---------------------------------------------------------------------------
// 2. P-Q Capability Envelope (Volt-VAR)
// ---------------------------------------------------------------------------

/**
 * Interpolate the Volt-VAR Q_pu from a piecewise-linear curve.
 * @param {number} v_pu  — bus voltage in per-unit
 * @param {Array}  curve — array of [V_pu, Q_pu] breakpoints (sorted ascending by V)
 * @returns {number} Q in per-unit (positive = capacitive injection)
 */
export function interpolateVoltVar(v_pu, curve) {
  if (!Array.isArray(curve) || curve.length < 2) return 0;
  if (v_pu <= curve[0][0]) return curve[0][1];
  if (v_pu >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [v0, q0] = curve[i];
    const [v1, q1] = curve[i + 1];
    if (v_pu >= v0 && v_pu <= v1) {
      const t = (v_pu - v0) / (v1 - v0);
      return q0 + t * (q1 - q0);
    }
  }
  return 0;
}

/**
 * Compute the P-Q operating envelope for an inverter at a given bus voltage.
 *
 * @param {object} p
 * @param {number} p.sRated_kVA            — inverter apparent power rating (kVA)
 * @param {number} p.pOutput_kW            — current active power output (kW)
 * @param {number} [p.vBus_pu=1.0]         — bus voltage in per-unit
 * @param {boolean} [p.voltVarEnabled=true] — enable Volt-VAR droop per IEEE 1547
 * @param {'A'|'B'} [p.voltVarCategory='B'] — IEEE 1547 Volt-VAR category
 * @returns {{ qMin_kvar, qMax_kvar, qDroop_kvar, pf_min, pf_max, operatingPoint }}
 */
export function ibrPQCapability({
  sRated_kVA,
  pOutput_kW,
  vBus_pu = 1.0,
  voltVarEnabled = true,
  voltVarCategory = IBR_DEFAULTS.voltVarCategory,
}) {
  const S = Number(sRated_kVA);
  const P = Number(pOutput_kW);
  const V = Number(vBus_pu);

  if (!Number.isFinite(S) || S <= 0) throw new Error('sRated_kVA must be a positive number');
  if (!Number.isFinite(P) || P < 0) throw new Error('pOutput_kW must be ≥ 0');

  // Maximum reactive power at this P level: Q_max = √(S² - P²)
  const qCapacity_kvar = Math.sqrt(Math.max(0, S ** 2 - Math.min(P, S) ** 2));
  const qMin_kvar = -qCapacity_kvar;
  const qMax_kvar = qCapacity_kvar;

  let qDroop_kvar = 0;
  if (voltVarEnabled && Number.isFinite(V)) {
    const curve = VOLT_VAR_CURVES[voltVarCategory] || VOLT_VAR_CURVES.B;
    const q_pu = interpolateVoltVar(V, curve);
    qDroop_kvar = Math.max(qMin_kvar, Math.min(qMax_kvar, q_pu * S));
  }

  const s_op = Math.sqrt(P ** 2 + qDroop_kvar ** 2);
  const pf_op = s_op > 0 ? P / s_op : 1;

  const pf_min = S > 0 ? Math.min(1, P / S) : 1;
  const pf_max = 1;

  return {
    qMin_kvar,
    qMax_kvar,
    qDroop_kvar,
    pf_min,
    pf_max,
    operatingPoint: { pOutput_kW: P, qOutput_kvar: qDroop_kvar, sApparent_kVA: s_op, pf: pf_op },
  };
}

// ---------------------------------------------------------------------------
// 3. Current-Limited Fault Contribution
// ---------------------------------------------------------------------------

/**
 * Calculate the fault current contribution from an inverter-based resource.
 *
 * Inverters do not behave like synchronous machines during a fault. IEEE 1547-2018
 * §6.4 allows IBRs to trip offline (default) or ride-through and inject fault
 * current. IEEE 2800-2022 §6.7.1 requires grid-forming inverters to contribute
 * at least 1.0 pu current and permits up to 1.2 pu during a fault.
 *
 * @param {object} p
 * @param {number} p.sRated_kVA          — inverter apparent power rating (kVA)
 * @param {number} p.vLL_kV              — line-to-line bus voltage (kV)
 * @param {number} [p.vBus_pu=1.0]       — pre-fault bus voltage (pu); scales rated current
 * @param {number} [p.limitFactor=1.1]   — Ipeak/Irated ratio (IEEE 1547 §6.4: 1.05–1.2 pu)
 * @param {boolean} [p.rideThrough=true] — false = inverter trips; true = contributes fault I
 * @returns {{ Irated_A, Ifault_A, Ifault_pu, tripped }}
 */
export function ibrFaultContribution({
  sRated_kVA,
  vLL_kV,
  vBus_pu = 1.0,
  limitFactor = IBR_DEFAULTS.faultCurrentLimitFactor,
  rideThrough = true,
}) {
  const S = Number(sRated_kVA);
  const V = Number(vLL_kV);
  const vpu = Number(vBus_pu);
  const lf = Number(limitFactor);

  if (!Number.isFinite(S) || S <= 0) throw new Error('sRated_kVA must be a positive number');
  if (!Number.isFinite(V) || V <= 0) throw new Error('vLL_kV must be a positive number');

  // Rated current (A) at nominal voltage
  const Irated_A = (S * 1000) / (Math.sqrt(3) * V * 1000);

  if (!rideThrough) {
    return { Irated_A, Ifault_A: 0, Ifault_pu: 0, tripped: true };
  }

  // Fault current = limitFactor × rated current (voltage-independent: inverter current-limited)
  const Ifault_A = lf * Irated_A;
  const Ifault_pu = lf * Math.max(0, Math.min(1, vpu));

  return { Irated_A, Ifault_A, Ifault_pu, tripped: false };
}

// ---------------------------------------------------------------------------
// 4. BESS Dispatch
// ---------------------------------------------------------------------------

/** BESS operating modes */
export const BESS_MODES = {
  discharge: 'discharge',
  charge: 'charge',
  standby: 'standby',
  voltVar: 'volt_var',
};

/**
 * Compute BESS dispatch for a given operating mode and state of charge.
 *
 * @param {object} p
 * @param {number} p.sRated_kW             — rated active power (kW) — nameplate
 * @param {number} p.sRated_kVA            — rated apparent power (kVA)
 * @param {number} p.soc_pct               — current state of charge (%)
 * @param {'discharge'|'charge'|'standby'|'volt_var'} p.mode — operating mode
 * @param {number} [p.setpointKw=sRated_kW] — requested active power setpoint (kW)
 * @param {number} [p.vBus_pu=1.0]          — bus voltage for Volt-VAR in volt_var mode
 * @param {'A'|'B'} [p.voltVarCategory='B'] — IEEE 1547 Volt-VAR category
 * @param {number} [p.roundTripEff=0.92]    — round-trip efficiency (0–1)
 * @param {number} [p.minSocPct=10]         — minimum allowed SOC (%)
 * @param {number} [p.maxSocPct=95]         — maximum allowed SOC (%)
 * @returns {{ pAC_kW, qAC_kvar, socLimited, mode }}
 */
export function bessDispatch({
  sRated_kW,
  sRated_kVA,
  soc_pct,
  mode = BESS_MODES.discharge,
  setpointKw,
  vBus_pu = 1.0,
  voltVarCategory = IBR_DEFAULTS.voltVarCategory,
  roundTripEff = IBR_DEFAULTS.bessRoundTripEff,
  minSocPct = IBR_DEFAULTS.bessMinSocPct,
  maxSocPct = IBR_DEFAULTS.bessMaxSocPct,
}) {
  const Pk = Number(sRated_kW);
  const Sk = Number(sRated_kVA) || Pk;
  const soc = Number(soc_pct);
  const eta = Math.max(0.5, Math.min(1, Number(roundTripEff)));
  const spKw = Number.isFinite(Number(setpointKw)) ? Number(setpointKw) : Pk;
  const minSoc = Number(minSocPct);
  const maxSoc = Number(maxSocPct);

  if (!Number.isFinite(Pk) || Pk <= 0) throw new Error('sRated_kW must be a positive number');
  if (!Number.isFinite(soc) || soc < 0 || soc > 100) throw new Error('soc_pct must be 0–100');

  const modeKey = String(mode).toLowerCase();

  if (modeKey === BESS_MODES.standby) {
    return { pAC_kW: 0, qAC_kvar: 0, socLimited: false, mode: BESS_MODES.standby };
  }

  if (modeKey === BESS_MODES.voltVar) {
    // Pure reactive power dispatch (no active power injection)
    const cap = ibrPQCapability({ sRated_kVA: Sk, pOutput_kW: 0, vBus_pu, voltVarEnabled: true, voltVarCategory });
    return { pAC_kW: 0, qAC_kvar: cap.qDroop_kvar, socLimited: false, mode: BESS_MODES.voltVar };
  }

  if (modeKey === BESS_MODES.charge) {
    if (soc >= maxSoc) {
      return { pAC_kW: 0, qAC_kvar: 0, socLimited: true, mode: BESS_MODES.charge };
    }
    const pCharge_kW = Math.min(Math.abs(spKw), Pk);
    // Charging draws from the grid (negative injection)
    return { pAC_kW: -pCharge_kW / eta, qAC_kvar: 0, socLimited: false, mode: BESS_MODES.charge };
  }

  // Default: discharge
  if (soc <= minSoc) {
    return { pAC_kW: 0, qAC_kvar: 0, socLimited: true, mode: BESS_MODES.discharge };
  }
  const pDischarge_kW = Math.min(Math.abs(spKw), Pk);
  const pAC_kW = pDischarge_kW * eta;
  return { pAC_kW, qAC_kvar: 0, socLimited: false, mode: BESS_MODES.discharge };
}

// ---------------------------------------------------------------------------
// 5. Frequency-Watt Response (Active Power Curtailment)
// ---------------------------------------------------------------------------

/**
 * Compute active power curtailment per IEEE 1547-2018 §5.3.1 (Freq-Watt).
 *
 * Above the upper deadband, the inverter reduces output proportionally to
 * frequency deviation (over-frequency ride-through and curtailment).
 * Below the lower deadband, the inverter may increase output (under-frequency
 * support), subject to available headroom.
 *
 * @param {object} p
 * @param {number} p.pMax_kW           — maximum available active power (kW)
 * @param {number} p.freq_Hz           — measured system frequency (Hz)
 * @param {number} [p.nomFreq_Hz=60]   — nominal frequency (Hz)
 * @param {number} [p.dbLow_Hz=59.98]  — lower deadband threshold (Hz)
 * @param {number} [p.dbHigh_Hz=60.02] — upper deadband threshold (Hz)
 * @param {number} [p.droop_pct=5]     — droop in % of rated per Hz deviation
 * @returns {{ pDispatch_kW, curtailFraction, freqDeviation_Hz, region }}
 */
export function freqWattResponse({
  pMax_kW,
  freq_Hz,
  nomFreq_Hz = IBR_DEFAULTS.nominalFreq_Hz,
  dbLow_Hz = IBR_DEFAULTS.freqDbLow_Hz,
  dbHigh_Hz = IBR_DEFAULTS.freqDbHigh_Hz,
  droop_pct = IBR_DEFAULTS.freqDroop_pct,
}) {
  const P = Number(pMax_kW);
  const f = Number(freq_Hz);
  const f0 = Number(nomFreq_Hz);
  const fLo = Number(dbLow_Hz);
  const fHi = Number(dbHigh_Hz);
  const droop = Number(droop_pct) / 100;

  if (!Number.isFinite(P) || P < 0) throw new Error('pMax_kW must be ≥ 0');
  if (!Number.isFinite(f)) throw new Error('freq_Hz must be a finite number');

  const freqDeviation_Hz = f - f0;

  if (f >= fLo && f <= fHi) {
    return { pDispatch_kW: P, curtailFraction: 0, freqDeviation_Hz, region: 'deadband' };
  }

  if (f > fHi) {
    // Over-frequency: curtail proportionally
    const excess = f - fHi;
    const curtailFraction = Math.min(1, droop * excess);
    const pDispatch_kW = P * (1 - curtailFraction);
    return { pDispatch_kW, curtailFraction, freqDeviation_Hz, region: 'over-frequency' };
  }

  // Under-frequency: inverter operates at full available power (no curtailment)
  return { pDispatch_kW: P, curtailFraction: 0, freqDeviation_Hz, region: 'under-frequency' };
}

// ---------------------------------------------------------------------------
// 6. Convenience study runner
// ---------------------------------------------------------------------------

/**
 * Run a complete IBR study combining all five calculations.
 *
 * @param {object} inputs
 * @param {'pv'|'bess'|'ibr'} inputs.resourceType — PV array, BESS, or generic IBR
 * @param {number} inputs.sRated_kVA              — inverter apparent power rating (kVA)
 * @param {number} inputs.vLL_kV                  — line-to-line bus voltage (kV)
 *
 * PV-specific:
 * @param {number} [inputs.Pstc_kW]              — DC STC array rating (kW)
 * @param {number} [inputs.irradiance_W_m2=1000]
 * @param {number} [inputs.temp_C=25]
 * @param {number} [inputs.inverterEff=0.97]
 * @param {number} [inputs.tempCoeff_pct=-0.35]
 *
 * BESS-specific:
 * @param {number} [inputs.sRated_kW]            — rated active power (kW)
 * @param {number} [inputs.soc_pct=80]
 * @param {string} [inputs.bessMode='discharge']
 *
 * Shared:
 * @param {number} [inputs.vBus_pu=1.0]
 * @param {boolean} [inputs.voltVarEnabled=true]
 * @param {'A'|'B'} [inputs.voltVarCategory='B']
 * @param {boolean} [inputs.rideThrough=true]
 * @param {number} [inputs.limitFactor=1.1]
 * @param {number} [inputs.freq_Hz=60]
 *
 * @returns {{ pvOutput, pqCapability, faultContribution, bessResult, freqWatt }}
 */
export function runIBRStudy(inputs) {
  const {
    resourceType = 'ibr',
    sRated_kVA,
    vLL_kV,
    Pstc_kW,
    irradiance_W_m2 = STC_IRRADIANCE,
    temp_C = STC_TEMP_C,
    inverterEff = IBR_DEFAULTS.inverterEfficiency,
    tempCoeff_pct = IBR_DEFAULTS.tempCoefficientPctPerC,
    sRated_kW,
    soc_pct = 80,
    bessMode = BESS_MODES.discharge,
    vBus_pu = 1.0,
    voltVarEnabled = true,
    voltVarCategory = IBR_DEFAULTS.voltVarCategory,
    rideThrough = true,
    limitFactor = IBR_DEFAULTS.faultCurrentLimitFactor,
    freq_Hz = IBR_DEFAULTS.nominalFreq_Hz,
  } = inputs;

  const S = Number(sRated_kVA);
  if (!Number.isFinite(S) || S <= 0) throw new Error('sRated_kVA must be a positive number');

  // 1. PV output (only for PV resource type)
  let pvOutput = null;
  if (resourceType === 'pv' && Number(Pstc_kW) > 0) {
    pvOutput = pvArrayOutput({
      irradiance_W_m2,
      temp_C,
      Pstc_kW,
      tempCoeff_pct,
      inverterEff,
      sRated_kVA: S,
    });
  }

  // Active power for P-Q capability calculation
  const pActive_kW = pvOutput
    ? pvOutput.pAC_kW
    : (resourceType === 'bess' ? Number(sRated_kW) || S : S);

  // 2. P-Q capability
  const pqCapability = ibrPQCapability({
    sRated_kVA: S,
    pOutput_kW: pActive_kW,
    vBus_pu,
    voltVarEnabled,
    voltVarCategory,
  });

  // Update PV Volt-VAR dispatch if applicable
  if (pvOutput && voltVarEnabled) {
    const pvWithVoltVar = pvArrayOutput({
      irradiance_W_m2,
      temp_C,
      Pstc_kW,
      tempCoeff_pct,
      inverterEff,
      sRated_kVA: S,
      voltVarQ_kvar: pqCapability.qDroop_kvar,
    });
    pvOutput = pvWithVoltVar;
  }

  // 3. Fault contribution
  const faultContribution = ibrFaultContribution({
    sRated_kVA: S,
    vLL_kV,
    vBus_pu,
    limitFactor,
    rideThrough,
  });

  // 4. BESS dispatch
  let bessResult = null;
  if (resourceType === 'bess') {
    bessResult = bessDispatch({
      sRated_kW: Number(sRated_kW) || S,
      sRated_kVA: S,
      soc_pct,
      mode: bessMode,
      setpointKw: Number(sRated_kW) || S,
      vBus_pu,
      voltVarCategory,
    });
  }

  // 5. Freq-Watt response
  const freqWatt = freqWattResponse({
    pMax_kW: pActive_kW,
    freq_Hz,
  });

  return { pvOutput, pqCapability, faultContribution, bessResult, freqWatt };
}

// ---------------------------------------------------------------------------
// 7. Plant controller / grid-code scenario package
// ---------------------------------------------------------------------------

export function normalizeIbrPlantControllerCase(input = {}) {
  const row = asObject(input);
  const plantMode = normalizeEnum(row.plantMode, PLANT_MODES, 'gridFollowing', 'plantMode');
  const controlMode = normalizeEnum(row.controlMode, CONTROL_MODES, 'voltVar', 'controlMode');
  const priorityInput = row.priorityMode || (controlMode === 'reactivePriority' ? 'reactivePriority' : 'activePowerPriority');
  const priorityMode = normalizeEnum(priorityInput, PRIORITY_MODES, 'activePowerPriority', 'priorityMode');
  const reportPreset = normalizeEnum(row.reportPreset, REPORT_PRESETS, 'summary', 'reportPreset');
  const nominalVoltageKv = finiteNumber(row.nominalVoltageKv ?? row.vLL_kV, null);
  const shortCircuitRatio = finiteNumber(row.shortCircuitRatio ?? row.scr, null);
  const utilityScMva = finiteNumber(row.utilityScMva, null);
  if (nominalVoltageKv !== null && nominalVoltageKv <= 0) throw new Error('nominalVoltageKv must be positive when provided');
  if (shortCircuitRatio !== null && shortCircuitRatio <= 0) throw new Error('shortCircuitRatio must be positive when provided');
  if (utilityScMva !== null && utilityScMva <= 0) throw new Error('utilityScMva must be positive when provided');
  return {
    id: String(row.id || 'ibr-plant-case'),
    name: String(row.name || row.plantName || 'IBR Plant Controller Case'),
    pccBus: String(row.pccBus || row.busId || ''),
    pccTag: String(row.pccTag || row.pccBus || row.busId || 'PCC'),
    nominalVoltageKv,
    interconnectionStandard: String(row.interconnectionStandard || 'IEEE 1547 / IEEE 2800 screening'),
    plantMode,
    controlMode,
    priorityMode,
    targetPowerFactor: finiteNumber(row.targetPowerFactor, 1),
    voltageSetpointPu: finiteNumber(row.voltageSetpointPu, 1),
    frequencySetpointHz: finiteNumber(row.frequencySetpointHz, IBR_DEFAULTS.nominalFreq_Hz),
    rampLimitKwPerMin: finiteNumber(row.rampLimitKwPerMin, null),
    shortCircuitRatio,
    utilityScMva,
    reportPreset,
    reviewNotes: String(row.reviewNotes || row.notes || ''),
  };
}

export function normalizeIbrResourceRows(rows = [], options = {}) {
  const sourceRows = asArray(rows).length ? asArray(rows) : asArray(options.resources);
  return sourceRows.map((input, index) => {
    const row = asObject(input);
    const resourceType = normalizeEnum(row.resourceType || row.type, RESOURCE_TYPES, 'genericInverter', 'resourceType');
    const ratedKva = finiteNumber(row.ratedKva ?? row.sRated_kVA ?? row.sRatedKva, null);
    const ratedKw = finiteNumber(row.ratedKw ?? row.sRated_kW ?? row.sRatedKw ?? row.Pstc_kW ?? ratedKva, null);
    const availableKw = finiteNumber(row.availableKw ?? row.pAvailableKw ?? row.pOutput_kW ?? ratedKw, null);
    const requestedKw = finiteNumber(row.requestedKw ?? row.pSetpointKw ?? availableKw, null);
    const requestedKvar = finiteNumber(row.requestedKvar ?? row.qSetpointKvar ?? 0, 0);
    const missingFields = [];
    if (!Number.isFinite(ratedKva) || ratedKva <= 0) missingFields.push('ratedKva');
    if (!Number.isFinite(ratedKw) || ratedKw < 0) missingFields.push('ratedKw');
    if (resourceType === 'pv' && !(finiteNumber(row.Pstc_kW ?? row.pStcKw ?? ratedKw, null) > 0)) missingFields.push('Pstc_kW');
    if (resourceType === 'bess' && !Number.isFinite(finiteNumber(row.socPct ?? row.soc_pct, null))) missingFields.push('socPct');
    const warnings = missingFields.map(field => ({ code: 'missingResourceField', message: `Missing ${field}.`, severity: 'warning' }));
    const enabled = row.enabled !== false;
    return {
      id: String(row.id || row.resourceId || `ibr-resource-${index + 1}`),
      tag: String(row.tag || row.label || row.name || `IBR-${index + 1}`),
      resourceType,
      busId: String(row.busId || row.pccBus || ''),
      enabled,
      ratedKw: Number.isFinite(ratedKw) ? ratedKw : null,
      ratedKva: Number.isFinite(ratedKva) ? ratedKva : null,
      availableKw: Number.isFinite(availableKw) ? availableKw : null,
      requestedKw: Number.isFinite(requestedKw) ? requestedKw : null,
      requestedKvar,
      minKw: finiteNumber(row.minKw, 0),
      maxKw: finiteNumber(row.maxKw, Number.isFinite(ratedKw) ? ratedKw : null),
      minKvar: finiteNumber(row.minKvar, Number.isFinite(ratedKva) ? -ratedKva : null),
      maxKvar: finiteNumber(row.maxKvar, Number.isFinite(ratedKva) ? ratedKva : null),
      socPct: finiteNumber(row.socPct ?? row.soc_pct, resourceType === 'bess' ? 80 : null),
      energyKwh: finiteNumber(row.energyKwh, null),
      Pstc_kW: finiteNumber(row.Pstc_kW ?? row.pStcKw ?? ratedKw, null),
      irradiance_W_m2: finiteNumber(row.irradiance_W_m2 ?? row.irradiance, STC_IRRADIANCE),
      temp_C: finiteNumber(row.temp_C ?? row.tempC, STC_TEMP_C),
      inverterEff: finiteNumber(row.inverterEff, IBR_DEFAULTS.inverterEfficiency),
      rampRateKwPerMin: finiteNumber(row.rampRateKwPerMin, null),
      previousKw: finiteNumber(row.previousKw, null),
      clippingLimitKw: finiteNumber(row.clippingLimitKw, Number.isFinite(ratedKw) ? ratedKw : null),
      curtailmentLimitKw: finiteNumber(row.curtailmentLimitKw, null),
      voltagePu: finiteNumber(row.voltagePu ?? row.vBus_pu, 1),
      frequencyHz: finiteNumber(row.frequencyHz ?? row.freq_Hz, IBR_DEFAULTS.nominalFreq_Hz),
      notes: String(row.notes || ''),
      missingFields,
      warnings,
      status: !enabled ? 'disabled' : missingFields.length ? 'missingData' : 'ready',
    };
  });
}

export function normalizeGridCodeCurveRows(rows = [], options = {}) {
  const sourceRows = asArray(rows).length ? asArray(rows) : asArray(options.curves);
  return sourceRows.map((input, index) => {
    const row = asObject(input);
    const curveType = normalizeEnum(row.curveType || row.type, CURVE_TYPES, 'voltVar', 'curveType');
    const points = normalizeCurvePoints(row.points || row.pointRows || [], curveType);
    return {
      id: String(row.id || `${curveType}-${index + 1}`),
      label: String(row.label || row.name || curveType),
      curveType,
      enabled: row.enabled !== false,
      points,
      basis: String(row.basis || row.standard || ''),
      notes: String(row.notes || ''),
      status: points.length >= 2 ? 'ready' : 'missingData',
      warnings: points.length >= 2 ? [] : [{ code: 'missingCurvePoints', severity: 'warning', message: `${curveType} needs at least two points.` }],
    };
  });
}

export function normalizeIbrScenarioRows(rows = [], options = {}) {
  const sourceRows = asArray(rows).length ? asArray(rows) : asArray(options.scenarios);
  const fallback = sourceRows.length ? sourceRows : [{ id: 'base', label: 'Base case', scenarioType: 'base' }];
  return fallback.map((input, index) => {
    const row = asObject(input);
    const scenarioType = normalizeEnum(row.scenarioType || row.type, SCENARIO_TYPES, 'base', 'scenarioType');
    const voltagePu = finiteNumber(row.voltagePu ?? row.vBus_pu, 1);
    const frequencyHz = finiteNumber(row.frequencyHz ?? row.freq_Hz, IBR_DEFAULTS.nominalFreq_Hz);
    if (!Number.isFinite(voltagePu) || voltagePu <= 0) throw new Error('scenario voltagePu must be positive');
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new Error('scenario frequencyHz must be positive');
    return {
      id: String(row.id || `ibr-scenario-${index + 1}`),
      label: String(row.label || row.name || scenarioType),
      scenarioType,
      enabled: row.enabled !== false,
      loadCase: String(row.loadCase || scenarioType),
      gridStrength: String(row.gridStrength || ''),
      shortCircuitRatio: finiteNumber(row.shortCircuitRatio ?? row.scr, null),
      voltagePu,
      frequencyHz,
      irradiance_W_m2: finiteNumber(row.irradiance_W_m2 ?? row.irradiance, null),
      temp_C: finiteNumber(row.temp_C ?? row.tempC, null),
      bessMode: String(row.bessMode || (scenarioType === 'bessCharge' ? BESS_MODES.charge : scenarioType === 'bessDischarge' ? BESS_MODES.discharge : '')),
      pSetpointScalePct: finiteNumber(row.pSetpointScalePct, 100),
      qSetpointScalePct: finiteNumber(row.qSetpointScalePct, 100),
      durationMin: finiteNumber(row.durationMin, 1),
      notes: String(row.notes || ''),
    };
  });
}

function curveByType(curveRows, curveType) {
  return asArray(curveRows).find(row => row.enabled !== false && row.curveType === curveType && asArray(row.points).length >= 2);
}

function requestedReactivePower({ plantCase, resource, scenario, curveRows, pKw, sKva }) {
  const controlMode = plantCase.controlMode;
  const voltagePu = scenario.voltagePu ?? resource.voltagePu ?? 1;
  if (controlMode === 'voltVar' || controlMode === 'reactivePriority') {
    const curve = curveByType(curveRows, 'voltVar');
    if (curve) return interpolatePointCurve(voltagePu, curve.points, 0) * sKva;
    return ibrPQCapability({
      sRated_kVA: sKva,
      pOutput_kW: Math.max(0, Math.min(Math.abs(pKw), sKva)),
      vBus_pu: voltagePu,
      voltVarEnabled: true,
    }).qDroop_kvar;
  }
  if (controlMode === 'wattPF') {
    const curve = curveByType(curveRows, 'wattPF');
    const pPu = sKva > 0 ? Math.abs(pKw) / sKva : 0;
    const pf = Math.max(0.1, Math.min(1, curve ? interpolatePointCurve(pPu, curve.points, plantCase.targetPowerFactor) : plantCase.targetPowerFactor));
    const qMag = Math.abs(pKw) * Math.tan(Math.acos(pf));
    return qMag * Math.sign(resource.requestedKvar || 1);
  }
  if (controlMode === 'constantPF') {
    const pf = Math.max(0.1, Math.min(1, plantCase.targetPowerFactor || 1));
    return Math.abs(pKw) * Math.tan(Math.acos(pf)) * Math.sign(resource.requestedKvar || 1);
  }
  return (resource.requestedKvar || 0) * (scenario.qSetpointScalePct / 100);
}

function applyActivePowerControls({ plantCase, resource, scenario, curveRows, pAvailableKw }) {
  let pKw = Number.isFinite(resource.requestedKw) ? resource.requestedKw : pAvailableKw;
  pKw *= scenario.pSetpointScalePct / 100;
  const voltagePu = scenario.voltagePu ?? resource.voltagePu ?? 1;
  const frequencyHz = scenario.frequencyHz ?? resource.frequencyHz ?? IBR_DEFAULTS.nominalFreq_Hz;
  const voltWatt = curveByType(curveRows, 'voltWatt');
  if ((plantCase.controlMode === 'voltWatt' || plantCase.controlMode === 'schedule') && voltWatt) {
    pKw = Math.min(pKw, pAvailableKw * Math.max(0, interpolatePointCurve(voltagePu, voltWatt.points, 1)));
  }
  if (plantCase.controlMode === 'freqWatt') {
    const response = freqWattResponse({ pMax_kW: Math.max(0, pKw), freq_Hz: frequencyHz });
    pKw = response.pDispatch_kW;
  }
  if (Number.isFinite(resource.curtailmentLimitKw)) pKw = Math.min(pKw, resource.curtailmentLimitKw);
  if (Number.isFinite(resource.maxKw)) pKw = Math.min(pKw, resource.maxKw);
  if (Number.isFinite(resource.minKw)) pKw = Math.max(pKw, resource.minKw);
  return pKw;
}

function evaluateResourceScenario({ plantCase, resource, scenario, curveRows }) {
  const warnings = [];
  if (resource.enabled === false) {
    return {
      scenarioId: scenario.id,
      resourceId: resource.id,
      resourceTag: resource.tag,
      resourceType: resource.resourceType,
      pDispatchKw: 0,
      qDispatchKvar: 0,
      apparentKva: 0,
      status: 'disabled',
      warnings: [],
      recommendation: 'Resource disabled for this screening case.',
    };
  }
  if (resource.missingFields.length) {
    return {
      scenarioId: scenario.id,
      resourceId: resource.id,
      resourceTag: resource.tag,
      resourceType: resource.resourceType,
      pDispatchKw: null,
      qDispatchKvar: null,
      apparentKva: null,
      status: 'missingData',
      warnings: resource.warnings,
      recommendation: 'Complete inverter kW/kVA and source-specific data before using plant controller results.',
    };
  }

  const sKva = resource.ratedKva;
  let pAvailableKw = resource.availableKw ?? resource.ratedKw ?? sKva;
  if (resource.resourceType === 'pv') {
    const pv = pvArrayOutput({
      irradiance_W_m2: scenario.irradiance_W_m2 ?? resource.irradiance_W_m2,
      temp_C: scenario.temp_C ?? resource.temp_C,
      Pstc_kW: resource.Pstc_kW || resource.ratedKw,
      inverterEff: resource.inverterEff,
      sRated_kVA: sKva,
    });
    pAvailableKw = pv.pAC_kW;
    if (pv.curtailed) warnings.push({ code: 'pvClipping', severity: 'warning', message: `${resource.tag} PV output is clipped by inverter kVA.` });
  }
  if (resource.resourceType === 'bess' && scenario.bessMode) {
    const bess = bessDispatch({
      sRated_kW: resource.ratedKw || sKva,
      sRated_kVA: sKva,
      soc_pct: resource.socPct ?? 80,
      mode: scenario.bessMode,
      setpointKw: Math.abs(resource.requestedKw ?? resource.ratedKw ?? sKva),
      vBus_pu: scenario.voltagePu,
    });
    pAvailableKw = bess.pAC_kW;
    if (bess.socLimited) warnings.push({ code: 'socLimited', severity: 'warning', message: `${resource.tag} BESS dispatch is blocked by SOC limits.` });
  }

  let pKw = applyActivePowerControls({ plantCase, resource, scenario, curveRows, pAvailableKw });
  let qKvar = requestedReactivePower({ plantCase, resource, scenario, curveRows, pKw, sKva });
  const priorityMode = plantCase.priorityMode;
  if (priorityMode === 'reactivePriority') {
    if (Math.abs(qKvar) > sKva) {
      qKvar = Math.sign(qKvar || 1) * sKva;
      warnings.push({ code: 'qClamped', severity: 'warning', message: `${resource.tag} reactive command exceeds inverter kVA.` });
    }
    const pLimit = Math.sqrt(Math.max(0, sKva ** 2 - qKvar ** 2));
    if (Math.abs(pKw) > pLimit) {
      pKw = Math.sign(pKw || 1) * pLimit;
      warnings.push({ code: 'realPowerCurtailedForQ', severity: 'warning', message: `${resource.tag} real power curtailed to prioritize reactive power.` });
    }
  } else {
    if (Math.abs(pKw) > sKva) {
      pKw = Math.sign(pKw || 1) * sKva;
      warnings.push({ code: 'pClamped', severity: 'warning', message: `${resource.tag} active power command exceeds inverter kVA.` });
    }
    const qLimit = Math.sqrt(Math.max(0, sKva ** 2 - pKw ** 2));
    if (Math.abs(qKvar) > qLimit) {
      qKvar = Math.sign(qKvar || 1) * qLimit;
      warnings.push({ code: 'reactiveClampedForP', severity: 'warning', message: `${resource.tag} reactive power clamped to prioritize active power.` });
    }
  }
  if (Number.isFinite(resource.rampRateKwPerMin) && Number.isFinite(resource.previousKw)) {
    const allowedDelta = resource.rampRateKwPerMin * Math.max(0, scenario.durationMin || 1);
    if (Math.abs(pKw - resource.previousKw) > allowedDelta) {
      warnings.push({ code: 'rampLimit', severity: 'warning', message: `${resource.tag} dispatch change exceeds ramp-rate limit.` });
    }
  }
  if (Number.isFinite(resource.clippingLimitKw) && Math.abs(pAvailableKw) > resource.clippingLimitKw) {
    warnings.push({ code: 'clippingLimit', severity: 'warning', message: `${resource.tag} available power exceeds clipping limit.` });
  }
  const apparentKva = Math.sqrt(pKw ** 2 + qKvar ** 2);
  const status = warnings.some(w => w.severity === 'error') ? 'fail' : warnings.length ? 'warn' : 'pass';
  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    resourceId: resource.id,
    resourceTag: resource.tag,
    resourceType: resource.resourceType,
    plantMode: plantCase.plantMode,
    controlMode: plantCase.controlMode,
    priorityMode,
    pAvailableKw: round(pAvailableKw, 3),
    pDispatchKw: round(pKw, 3),
    qDispatchKvar: round(qKvar, 3),
    apparentKva: round(apparentKva, 3),
    powerFactor: apparentKva > 0 ? round(Math.abs(pKw) / apparentKva, 4) : 1,
    voltagePu: scenario.voltagePu,
    frequencyHz: scenario.frequencyHz,
    status,
    warnings,
    recommendation: status === 'pass'
      ? 'Plant-controller dispatch is within screening limits for this resource.'
      : 'Review inverter kVA, priority mode, ramp limits, and grid-code settings before release.',
  };
}

export function evaluateIbrPlantControllerScenario(context = {}, options = {}) {
  const plantCase = normalizeIbrPlantControllerCase(context.plantCase || context.studyCase || context);
  const resourceRows = normalizeIbrResourceRows(context.resourceRows || context.resources || [], options);
  const curveRows = normalizeGridCodeCurveRows(context.curveRows || context.curves || [], options);
  const scenarioRows = normalizeIbrScenarioRows(context.scenarioRows || context.scenarios || [], options);
  const enabledScenarios = scenarioRows.filter(row => row.enabled !== false);
  const dispatchRows = enabledScenarios.flatMap(scenario => resourceRows.map(resource => evaluateResourceScenario({
    plantCase,
    resource,
    scenario,
    curveRows,
  })));
  const capabilityRows = buildIbrPlantCapabilityRows({ plantCase, dispatchRows, scenarioRows });
  const rideThroughRows = buildRideThroughRows({ curveRows, scenarioRows: enabledScenarios });
  const gridCodeRows = buildGridCodeRows({ plantCase, resourceRows, curveRows, scenarioRows: enabledScenarios, dispatchRows, rideThroughRows });
  const warningRows = [
    ...resourceRows.flatMap(row => row.warnings.map(warning => ({ ...warning, sourceId: row.id, sourceTag: row.tag }))),
    ...curveRows.flatMap(row => row.warnings.map(warning => ({ ...warning, sourceId: row.id, sourceTag: row.label }))),
    ...dispatchRows.flatMap(row => asArray(row.warnings).map(warning => ({ ...warning, sourceId: row.resourceId, sourceTag: row.resourceTag, scenarioId: row.scenarioId }))),
    ...gridCodeRows.filter(row => row.status !== 'pass').map(row => ({
      code: row.checkType,
      severity: row.status === 'fail' ? 'error' : 'warning',
      sourceId: row.id,
      sourceTag: row.label,
      message: row.recommendation,
    })),
  ];
  if (plantCase.plantMode === 'gridForming') {
    warningRows.push({
      code: 'gridFormingScreeningOnly',
      severity: 'warning',
      sourceId: plantCase.id,
      sourceTag: plantCase.pccTag,
      message: 'Grid-forming mode is represented as screening metadata only; manufacturer dynamic controls are not modeled.',
    });
  }
  const summary = summarizeIbrPlantController({
    resourceRows,
    curveRows,
    scenarioRows: enabledScenarios,
    dispatchRows,
    capabilityRows,
    gridCodeRows,
    rideThroughRows,
    warningRows,
  });
  return {
    plantCase,
    resourceRows,
    curveRows,
    scenarioRows,
    dispatchRows,
    capabilityRows,
    gridCodeRows,
    rideThroughRows,
    warningRows,
    summary,
  };
}

export function buildIbrPlantCapabilityRows(evaluation = {}) {
  const plantCase = evaluation.plantCase || {};
  const dispatchRows = asArray(evaluation.dispatchRows);
  const scenarioRows = asArray(evaluation.scenarioRows);
  return scenarioRows.filter(row => row.enabled !== false).map(scenario => {
    const rows = dispatchRows.filter(row => row.scenarioId === scenario.id);
    const totalP = rows.reduce((sum, row) => sum + (Number(row.pDispatchKw) || 0), 0);
    const totalQ = rows.reduce((sum, row) => sum + (Number(row.qDispatchKvar) || 0), 0);
    const totalS = Math.sqrt(totalP ** 2 + totalQ ** 2);
    const status = statusFromRows(rows);
    const scr = scenario.shortCircuitRatio ?? plantCase.shortCircuitRatio;
    const warnings = [];
    if (Number.isFinite(scr) && scr < 3) warnings.push('Weak-grid SCR below 3 requires detailed inverter stability review.');
    if (!Number.isFinite(scr)) warnings.push('Short-circuit ratio / grid-strength basis is not provided.');
    return {
      id: `capability-${scenario.id}`,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      pTotalKw: round(totalP, 3),
      qTotalKvar: round(totalQ, 3),
      apparentKva: round(totalS, 3),
      powerFactor: totalS > 0 ? round(Math.abs(totalP) / totalS, 4) : 1,
      shortCircuitRatio: Number.isFinite(scr) ? scr : null,
      plantMode: plantCase.plantMode || '',
      controlMode: plantCase.controlMode || '',
      status: warnings.length && status === 'pass' ? 'warn' : status,
      warnings,
      recommendation: warnings.length
        ? 'Document grid-strength and plant-controller assumptions before utility review.'
        : 'Aggregate plant dispatch is within V1 screening assumptions.',
    };
  });
}

function buildRideThroughRows({ curveRows = [], scenarioRows = [] } = {}) {
  const voltageCurve = curveByType(curveRows, 'voltageRideThrough');
  const frequencyCurve = curveByType(curveRows, 'frequencyRideThrough');
  return asArray(scenarioRows).flatMap(scenario => {
    const rows = [];
    const vInRange = voltageCurve ? scenario.voltagePu >= voltageCurve.points[0].x && scenario.voltagePu <= voltageCurve.points[voltageCurve.points.length - 1].x : false;
    rows.push({
      id: `vride-${scenario.id}`,
      scenarioId: scenario.id,
      label: scenario.label,
      curveType: 'voltageRideThrough',
      actualValue: scenario.voltagePu,
      curveProvided: Boolean(voltageCurve),
      status: !voltageCurve ? 'missingData' : vInRange ? 'pass' : 'warn',
      recommendation: !voltageCurve
        ? 'Add voltage ride-through curve points for the selected grid-code basis.'
        : vInRange ? 'Voltage event is inside the editable ride-through curve range.' : 'Voltage event is outside the ride-through curve range; verify trip/ride-through settings.',
    });
    const fInRange = frequencyCurve ? scenario.frequencyHz >= frequencyCurve.points[0].x && scenario.frequencyHz <= frequencyCurve.points[frequencyCurve.points.length - 1].x : false;
    rows.push({
      id: `fride-${scenario.id}`,
      scenarioId: scenario.id,
      label: scenario.label,
      curveType: 'frequencyRideThrough',
      actualValue: scenario.frequencyHz,
      curveProvided: Boolean(frequencyCurve),
      status: !frequencyCurve ? 'missingData' : fInRange ? 'pass' : 'warn',
      recommendation: !frequencyCurve
        ? 'Add frequency ride-through curve points for the selected grid-code basis.'
        : fInRange ? 'Frequency event is inside the editable ride-through curve range.' : 'Frequency event is outside the ride-through curve range; verify trip/ride-through settings.',
    });
    return rows;
  });
}

function buildGridCodeRows({ plantCase = {}, resourceRows = [], curveRows = [], dispatchRows = [], rideThroughRows = [] } = {}) {
  const rows = [];
  ['voltVar', 'voltWatt', 'wattPF', 'freqWatt'].forEach(curveType => {
    const curve = curveByType(curveRows, curveType);
    const expected = plantCase.controlMode === curveType || (plantCase.controlMode === 'reactivePriority' && curveType === 'voltVar');
    rows.push({
      id: `curve-${curveType}`,
      label: curveType,
      checkType: 'curveBasis',
      actualValue: curve ? curve.points.length : 0,
      limitValue: expected ? 2 : 0,
      status: expected && !curve ? 'missingData' : 'pass',
      recommendation: expected && !curve
        ? `Add ${curveType} curve points to document the active plant-controller mode.`
        : `${curveType} curve basis is ${curve ? 'documented' : 'not active for this case'}.`,
    });
  });
  rows.push(...buildRideThroughRows({ curveRows, scenarioRows: [] }), ...asArray(rideThroughRows));
  if (plantCase.plantMode === 'gridForming') {
    rows.push({
      id: 'grid-forming-dynamic-model',
      label: 'Grid-forming mode',
      checkType: 'dynamicModel',
      actualValue: 'screening metadata',
      limitValue: 'manufacturer model',
      status: 'warn',
      recommendation: 'Grid-forming inverter dynamics require manufacturer model verification outside this V1 screening workflow.',
    });
  }
  if (asArray(resourceRows).length === 0) {
    rows.push({
      id: 'missing-resources',
      label: 'Resource rows',
      checkType: 'resourceBasis',
      actualValue: 0,
      limitValue: 1,
      status: 'missingData',
      recommendation: 'Add at least one PV, BESS, or inverter resource row.',
    });
  }
  if (asArray(dispatchRows).some(row => row.status === 'warn')) {
    rows.push({
      id: 'dispatch-warnings',
      label: 'Dispatch warnings',
      checkType: 'dispatch',
      actualValue: asArray(dispatchRows).filter(row => row.status === 'warn').length,
      limitValue: 0,
      status: 'warn',
      recommendation: 'Review clamping, ramp-rate, clipping, curtailment, and priority-mode warning rows.',
    });
  }
  return rows;
}

function summarizeIbrPlantController({ resourceRows = [], curveRows = [], scenarioRows = [], dispatchRows = [], capabilityRows = [], gridCodeRows = [], rideThroughRows = [], warningRows = [] } = {}) {
  const rowStatus = [...dispatchRows, ...capabilityRows, ...gridCodeRows, ...rideThroughRows];
  return {
    resourceCount: resourceRows.length,
    enabledResourceCount: resourceRows.filter(row => row.enabled !== false).length,
    curveCount: curveRows.length,
    scenarioCount: scenarioRows.length,
    dispatchCount: dispatchRows.length,
    pass: rowStatus.filter(row => row.status === 'pass').length,
    warn: rowStatus.filter(row => row.status === 'warn' || row.status === 'review').length,
    fail: rowStatus.filter(row => row.status === 'fail').length,
    missingData: rowStatus.filter(row => row.status === 'missingData').length,
    warningCount: warningRows.length,
    maxPlantKw: round(Math.max(0, ...capabilityRows.map(row => Number(row.pTotalKw) || 0)), 3),
    maxPlantKvar: round(Math.max(0, ...capabilityRows.map(row => Math.abs(Number(row.qTotalKvar) || 0))), 3),
  };
}

export function buildIbrPlantControllerPackage(context = {}) {
  const evaluation = evaluateIbrPlantControllerScenario(context);
  const projectName = String(context.projectName || evaluation.plantCase.name || 'Untitled Project');
  return {
    version: IBR_PLANT_CONTROLLER_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName,
    plantCase: evaluation.plantCase,
    resourceRows: evaluation.resourceRows,
    curveRows: evaluation.curveRows,
    scenarioRows: evaluation.scenarioRows,
    dispatchRows: evaluation.dispatchRows,
    capabilityRows: evaluation.capabilityRows,
    gridCodeRows: evaluation.gridCodeRows,
    rideThroughRows: evaluation.rideThroughRows,
    warningRows: evaluation.warningRows,
    warnings: evaluation.warningRows,
    assumptions: [
      'DER / IBR plant-controller results are deterministic screening calculations.',
      'V1 applies kVA priority clamping, curve interpolation, ramp checks, and dispatch scenarios; it is not an EMT or detailed manufacturer inverter model.',
      'Grid-code and ride-through settings require final utility and manufacturer verification.',
    ],
    summary: evaluation.summary,
  };
}

export function renderIbrPlantControllerHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const rows = asArray(pkg.capabilityRows).slice(0, 40).map(row => `<tr>
    <td>${escapeHtml(row.scenarioLabel || row.scenarioId)}</td>
    <td>${escapeHtml(row.plantMode)}</td>
    <td>${escapeHtml(row.controlMode)}</td>
    <td>${escapeHtml(row.pTotalKw ?? '')}</td>
    <td>${escapeHtml(row.qTotalKvar ?? '')}</td>
    <td>${escapeHtml(row.shortCircuitRatio ?? '')}</td>
    <td>${escapeHtml(row.status)}</td>
    <td>${escapeHtml(row.recommendation)}</td>
  </tr>`).join('');
  const warnings = asArray(pkg.warningRows).slice(0, 40).map(row => `<tr>
    <td>${escapeHtml(row.severity || 'warning')}</td>
    <td>${escapeHtml(row.code || 'warning')}</td>
    <td>${escapeHtml(row.sourceTag || row.sourceId || '')}</td>
    <td>${escapeHtml(row.message || row.recommendation || row)}</td>
  </tr>`).join('');
  return `<section class="report-section" id="rpt-ibr-plant-controller">
    <h2>DER / IBR Plant Controller and Grid-Code Scenarios</h2>
    <p class="report-note">${escapeHtml(summary.enabledResourceCount || 0)} enabled resource(s), ${escapeHtml(summary.scenarioCount || 0)} scenario(s), ${escapeHtml(summary.warningCount || 0)} warning(s). Final utility/manufacturer verification required.</p>
    <dl class="report-dl">
      <dt>Plant Case</dt><dd>${escapeHtml(pkg.plantCase?.name || '')}</dd>
      <dt>PCC</dt><dd>${escapeHtml(pkg.plantCase?.pccTag || pkg.plantCase?.pccBus || '')}</dd>
      <dt>Mode</dt><dd>${escapeHtml(pkg.plantCase?.plantMode || '')}</dd>
      <dt>Control</dt><dd>${escapeHtml(pkg.plantCase?.controlMode || '')}</dd>
    </dl>
    <div class="report-scroll">
      <table class="report-table">
        <thead><tr><th>Scenario</th><th>Plant Mode</th><th>Control</th><th>kW</th><th>kvar</th><th>SCR</th><th>Status</th><th>Recommendation</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">No plant-controller capability rows.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="report-scroll">
      <table class="report-table">
        <thead><tr><th>Severity</th><th>Code</th><th>Source</th><th>Warning</th></tr></thead>
        <tbody>${warnings || '<tr><td colspan="4">No plant-controller warnings.</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}
