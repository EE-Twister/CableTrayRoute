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
