/**
 * IEEE 1547-2018 DER Interconnection Study
 *
 * Standards:
 *   IEEE 1547-2018  — Standard for Interconnection and Interoperability of
 *                     Distributed Energy Resources with Associated Electric
 *                     Power Systems Interfaces
 *   IEEE 1547a-2020 — Amendment to IEEE 1547-2018
 *   ANSI C84.1-2020 — American National Standard for Electric Power Systems and
 *                     Equipment — Voltage Ratings (60 Hz)
 *
 * Module overview
 * ───────────────
 * 1. checkPCCVoltage()        — ANSI C84.1 steady-state voltage impact at PCC
 * 2. checkFaultImpact()       — Fault current contribution vs. device interrupting capacity
 * 3. checkAntiIslanding()     — IEEE 1547-2018 §8.1 unintentional islanding trip time
 * 4. checkRideThrough()       — IEEE 1547-2018 Table 3 / Table 5 V & f ride-through
 * 5. checkHarmonicsCompliance() — IEEE 1547-2018 Table 2 harmonic current limits
 * 6. runDERInterconnectStudy() — Unified study entry point (all five criteria)
 */

// ---------------------------------------------------------------------------
// Constants — IEEE 1547-2018 / ANSI C84.1
// ---------------------------------------------------------------------------

/**
 * ANSI C84.1-2020 voltage range limits (per-unit of nominal).
 * Range A applies to sustained normal operating conditions.
 * Range B applies to infrequent/short-duration conditions.
 */
export const ANSI_C84_1 = {
  rangeA: { min: 0.95, max: 1.05 },
  rangeB: { min: 0.917, max: 1.083 },
};

/**
 * IEEE 1547-2018 §8.1 — maximum intentional island clearing time by DER category.
 * Category A: ≤ 2.0 s
 * Category B: ≤ 1.0 s
 * Category C (formerly "high fault current contribution"): ≤ 0.16 s
 */
export const ISLANDING_TRIP_TIME_LIMITS_S = {
  A: 2.0,
  B: 1.0,
  C: 0.16,
};

/**
 * IEEE 1547-2018 Table 3 — Voltage ride-through requirements (low/high voltage pu).
 * Each category has momentary cessation and must-trip zones; these are the
 * continuous / mandatory ride-through band boundaries.
 *
 * Simplified to the "shall remain connected" (ride-through) outer boundary:
 *   - Momentary Cessation (MC) zone: trip permitted for very low voltages
 *   - Ride-Through (RT) zone: must stay connected
 *
 * Values represent the outer continuous operating zone edges:
 *   v_lo — minimum voltage for continuous ride-through (pu)
 *   v_hi — maximum voltage for continuous ride-through (pu)
 */
export const VOLTAGE_RIDE_THROUGH = {
  I:   { v_lo: 0.70, v_hi: 1.10 },
  II:  { v_lo: 0.65, v_hi: 1.10 },
  III: { v_lo: 0.50, v_hi: 1.20 },
};

/**
 * IEEE 1547-2018 Table 5 — Frequency ride-through (Hz).
 * Minimum/maximum frequency for continuous ride-through.
 */
export const FREQUENCY_RIDE_THROUGH = {
  I:   { f_lo: 58.5, f_hi: 61.5 },
  II:  { f_lo: 57.0, f_hi: 62.0 },
  III: { f_lo: 56.5, f_hi: 63.0 },
};

/**
 * IEEE 1547-2018 Table 2 — Maximum harmonic current distortion limits
 * expressed as % of the DER rated current at the PCC.
 *
 * Odd harmonics up to 35th; even harmonics are limited to 25% of the
 * corresponding odd harmonic limit. THD limit: 5%.
 */
export const HARMONIC_CURRENT_LIMITS_PCT = {
  3:  3.0,
  5:  3.0,
  7:  3.0,
  9:  0.5,
  11: 1.0,
  13: 1.0,
  15: 0.3,
  17: 1.5,
  19: 1.5,
  21: 0.3,
  23: 0.6,
  25: 0.6,
  thd: 5.0,
};

// ---------------------------------------------------------------------------
// 1. Steady-State PCC Voltage Impact
// ---------------------------------------------------------------------------

/**
 * Estimate DER-induced voltage rise at the PCC using a Thevenin approximation.
 *
 * Formula (simplified voltage regulation per IEC/IEEE distribution practice):
 *   ΔV ≈ (P·R + Q·X) / V²   [per-unit]
 *
 * where R + jX is the Thevenin source impedance looking from the PCC toward
 * the utility source, expressed in per-unit on the DER MVA base.
 *
 * @param {object} p
 * @param {number} p.v_pcc_pu        Pre-DER PCC voltage (pu); default 1.0
 * @param {number} p.der_rated_kW    DER rated active power output (kW, > 0)
 * @param {number} p.der_rated_kVAR  DER rated reactive power injection (kVAR, + = capacitive)
 * @param {number} p.sc_MVA          Short-circuit MVA at the PCC (> 0)
 * @param {number} p.r_pu            Thevenin R in pu on a 1 MVA base (≥ 0)
 * @param {number} p.x_pu            Thevenin X in pu on a 1 MVA base (≥ 0)
 * @returns {{
 *   v_nominal_pu: number,
 *   v_with_der_pu: number,
 *   delta_v_pct: number,
 *   rangeA_pass: boolean,
 *   rangeB_pass: boolean
 * }}
 */
export function checkPCCVoltage({
  v_pcc_pu = 1.0,
  der_rated_kW,
  der_rated_kVAR = 0,
  sc_MVA,
  r_pu = 0,
  x_pu = 0,
}) {
  const V0 = Number(v_pcc_pu);
  const P = Number(der_rated_kW);
  const Q = Number(der_rated_kVAR);
  const Ssc = Number(sc_MVA);

  if (!Number.isFinite(P) || P <= 0) throw new Error('der_rated_kW must be > 0');
  if (!Number.isFinite(Ssc) || Ssc <= 0) throw new Error('sc_MVA must be > 0');
  if (!Number.isFinite(V0) || V0 <= 0) throw new Error('v_pcc_pu must be > 0');

  const R = Number(r_pu) || 0;
  const X = Number(x_pu) || 0;

  // Convert DER MW/MVAR to pu on the SC MVA base
  const P_pu = (P / 1000) / Ssc;
  const Q_pu = (Q / 1000) / Ssc;

  // Thevenin voltage rise (linearized)
  const delta_v_pu = (P_pu * R + Q_pu * X) / (V0 * V0);
  const v_with_der = V0 + delta_v_pu;
  const delta_v_pct = delta_v_pu * 100;

  const rangeA_pass = v_with_der >= ANSI_C84_1.rangeA.min &&
                      v_with_der <= ANSI_C84_1.rangeA.max;
  const rangeB_pass = v_with_der >= ANSI_C84_1.rangeB.min &&
                      v_with_der <= ANSI_C84_1.rangeB.max;

  return {
    v_nominal_pu: Math.round(V0 * 10000) / 10000,
    v_with_der_pu: Math.round(v_with_der * 10000) / 10000,
    delta_v_pct: Math.round(delta_v_pct * 1000) / 1000,
    rangeA_pass,
    rangeB_pass,
    pass: rangeA_pass,
  };
}

// ---------------------------------------------------------------------------
// 2. Fault Current Contribution Impact
// ---------------------------------------------------------------------------

/**
 * Assess the impact of DER fault current contribution on protection devices.
 *
 * IEEE 1547-2018 §6.4 / IEEE 2800-2022 §6.7.1:
 *   Inverter fault current is limited to k_limit × I_rated (typically 1.05–1.2×).
 *
 * @param {object} p
 * @param {number} p.der_rated_kVA          DER inverter apparent power (kVA, > 0)
 * @param {number} p.v_ll_kV                Bus line-to-line voltage (kV, > 0)
 * @param {number} p.existing_fault_kA      Existing (pre-DER) fault current at PCC (kA, > 0)
 * @param {number} p.device_interrupting_kA Device symmetrical interrupting rating (kA, > 0)
 * @param {number} [p.k_limit=1.1]          IBR current limit factor (pu, default 1.1)
 * @returns {{
 *   ibr_rated_A: number,
 *   ibr_fault_A: number,
 *   total_fault_kA: number,
 *   interrupting_margin_pct: number,
 *   pass: boolean
 * }}
 */
export function checkFaultImpact({
  der_rated_kVA,
  v_ll_kV,
  existing_fault_kA,
  device_interrupting_kA,
  k_limit = 1.1,
}) {
  const S = Number(der_rated_kVA);
  const V = Number(v_ll_kV);
  const I_existing = Number(existing_fault_kA);
  const I_device = Number(device_interrupting_kA);
  const k = Number(k_limit);

  if (!Number.isFinite(S) || S <= 0) throw new Error('der_rated_kVA must be > 0');
  if (!Number.isFinite(V) || V <= 0) throw new Error('v_ll_kV must be > 0');
  if (!Number.isFinite(I_existing) || I_existing <= 0) throw new Error('existing_fault_kA must be > 0');
  if (!Number.isFinite(I_device) || I_device <= 0) throw new Error('device_interrupting_kA must be > 0');

  // Rated inverter current (A)
  const I_rated_A = (S * 1000) / (Math.sqrt(3) * V * 1000);

  // IBR fault current (IEEE 1547-2018 §6.4)
  const I_ibr_fault_A = k * I_rated_A;

  // Total fault current at PCC (superposition of grid + IBR)
  const total_fault_kA = I_existing + I_ibr_fault_A / 1000;

  const interrupting_margin_pct = ((I_device - total_fault_kA) / I_device) * 100;
  const pass = total_fault_kA <= I_device;

  return {
    ibr_rated_A: Math.round(I_rated_A * 10) / 10,
    ibr_fault_A: Math.round(I_ibr_fault_A * 10) / 10,
    total_fault_kA: Math.round(total_fault_kA * 1000) / 1000,
    interrupting_margin_pct: Math.round(interrupting_margin_pct * 10) / 10,
    pass,
  };
}

// ---------------------------------------------------------------------------
// 3. Anti-Islanding (Unintentional Islanding) Check
// ---------------------------------------------------------------------------

/**
 * Verify that the DER trip settings comply with IEEE 1547-2018 §8.1 anti-islanding
 * requirements.
 *
 * IEEE 1547-2018 §8.1 requires DER to detect unintentional islanding and cease
 * energizing the area EPS within the time limits in ISLANDING_TRIP_TIME_LIMITS_S.
 *
 * @param {object} p
 * @param {string} p.category                DER category: 'A', 'B', or 'C'
 * @param {number} p.trip_time_s             Configured island detection trip time (s)
 * @param {string} [p.monitoring_type='active'] Detection method: 'active', 'passive', or 'none'
 * @returns {{
 *   category: string,
 *   limit_s: number,
 *   trip_time_s: number,
 *   trip_time_compliant: boolean,
 *   monitoring_method_valid: boolean,
 *   pass: boolean
 * }}
 */
export function checkAntiIslanding({
  category,
  trip_time_s,
  monitoring_type = 'active',
}) {
  const cat = String(category).toUpperCase();
  if (!['A', 'B', 'C'].includes(cat)) {
    throw new Error(`category must be 'A', 'B', or 'C'; got '${category}'`);
  }

  const t = Number(trip_time_s);
  if (!Number.isFinite(t) || t < 0) throw new Error('trip_time_s must be ≥ 0');

  const limit = ISLANDING_TRIP_TIME_LIMITS_S[cat];
  const trip_time_compliant = t <= limit;

  // IEEE 1547-2018 §8.1.3: passive methods alone are acceptable but active methods
  // (frequency shift, impedance measurement) provide higher confidence. 'none' is non-compliant.
  const monitoring_method_valid = monitoring_type !== 'none';

  return {
    category: cat,
    limit_s: limit,
    trip_time_s: t,
    trip_time_compliant,
    monitoring_method_valid,
    pass: trip_time_compliant && monitoring_method_valid,
  };
}

// ---------------------------------------------------------------------------
// 4. Voltage / Frequency Ride-Through
// ---------------------------------------------------------------------------

/**
 * Verify that the DER ride-through settings meet IEEE 1547-2018 Table 3 (voltage)
 * and Table 5 (frequency) requirements for the specified category.
 *
 * The DER must remain connected within the continuous operating region:
 *   v_rt_lo_pu ≤ V ≤ v_rt_hi_pu  (voltage)
 *   f_rt_lo_hz ≤ f ≤ f_rt_hi_hz  (frequency)
 *
 * Compliance means the DER's configured ride-through window is at least as wide
 * as the IEEE 1547 mandatory minimum for the declared category.
 *
 * @param {object} p
 * @param {string} p.category      DER category: 'I', 'II', or 'III'
 * @param {number} p.v_rt_lo_pu   Configured low-voltage ride-through limit (pu)
 * @param {number} p.v_rt_hi_pu   Configured high-voltage ride-through limit (pu)
 * @param {number} p.f_rt_lo_hz   Configured low-frequency ride-through limit (Hz)
 * @param {number} p.f_rt_hi_hz   Configured high-frequency ride-through limit (Hz)
 * @param {number} [p.frequency_hz=60] Nominal system frequency (Hz)
 * @returns {{
 *   category: string,
 *   voltage_rt_pass: boolean,
 *   freq_rt_pass: boolean,
 *   v_requirement: {lo: number, hi: number},
 *   f_requirement: {lo: number, hi: number},
 *   pass: boolean
 * }}
 */
export function checkRideThrough({
  category,
  v_rt_lo_pu,
  v_rt_hi_pu,
  f_rt_lo_hz,
  f_rt_hi_hz,
  frequency_hz = 60,
}) {
  const cat = String(category).toUpperCase();
  if (!['I', 'II', 'III'].includes(cat)) {
    throw new Error(`category must be 'I', 'II', or 'III'; got '${category}'`);
  }

  const vLo = Number(v_rt_lo_pu);
  const vHi = Number(v_rt_hi_pu);
  const fLo = Number(f_rt_lo_hz);
  const fHi = Number(f_rt_hi_hz);
  const f0 = Number(frequency_hz) || 60;

  if (!Number.isFinite(vLo) || !Number.isFinite(vHi)) throw new Error('v_rt limits must be finite numbers');
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) throw new Error('f_rt limits must be finite numbers');

  const vReq = VOLTAGE_RIDE_THROUGH[cat];
  const fReq = FREQUENCY_RIDE_THROUGH[cat];

  // Frequency ride-through limits are defined for 60 Hz; scale for 50 Hz systems
  const fScale = f0 / 60;
  const fReqLo = fReq.f_lo * fScale;
  const fReqHi = fReq.f_hi * fScale;

  // DER settings are compliant if their window is at least as wide as the requirement
  const voltage_rt_pass = vLo <= vReq.v_lo && vHi >= vReq.v_hi;
  const freq_rt_pass = fLo <= fReqLo && fHi >= fReqHi;

  return {
    category: cat,
    voltage_rt_pass,
    freq_rt_pass,
    v_requirement: { lo: vReq.v_lo, hi: vReq.v_hi },
    f_requirement: { lo: Math.round(fReqLo * 100) / 100, hi: Math.round(fReqHi * 100) / 100 },
    pass: voltage_rt_pass && freq_rt_pass,
  };
}

// ---------------------------------------------------------------------------
// 5. Power Quality — Harmonic Current Compliance
// ---------------------------------------------------------------------------

/**
 * Verify that the DER harmonic current injection meets IEEE 1547-2018 Table 2 limits.
 *
 * @param {object} p
 * @param {number} p.thd_pct                 Total Harmonic Distortion (%), based on fundamental
 * @param {Array<{order:number, pct:number}>} [p.individual_harmonics=[]] Individual harmonic
 *   current components as % of rated fundamental current
 * @returns {{
 *   thd_pct: number,
 *   thd_limit_pct: number,
 *   thd_pass: boolean,
 *   individual_pass: boolean,
 *   violations: Array<{order:number, actual_pct:number, limit_pct:number}>,
 *   pass: boolean
 * }}
 */
export function checkHarmonicsCompliance({
  thd_pct,
  individual_harmonics = [],
}) {
  const thd = Number(thd_pct);
  if (!Number.isFinite(thd) || thd < 0) throw new Error('thd_pct must be ≥ 0');

  const thdLimit = HARMONIC_CURRENT_LIMITS_PCT.thd;
  const thd_pass = thd <= thdLimit;

  const violations = [];
  for (const h of individual_harmonics) {
    const order = Number(h.order);
    const actual = Number(h.pct);
    if (!Number.isFinite(order) || !Number.isFinite(actual)) continue;

    // Determine limit: use table value if order is listed; even harmonics use 25% of odd limit
    let limit;
    if (HARMONIC_CURRENT_LIMITS_PCT[order] !== undefined) {
      limit = HARMONIC_CURRENT_LIMITS_PCT[order];
    } else if (order % 2 === 0) {
      // Even harmonics: 25% of the nearest odd harmonic limit (approximate)
      limit = 0.25 * (HARMONIC_CURRENT_LIMITS_PCT[Math.ceil(order)] || 0.6);
    } else {
      // Odd harmonics > 25th: 0.3% per IEEE 1547 Table 2
      limit = 0.3;
    }

    if (actual > limit) {
      violations.push({
        order,
        actual_pct: Math.round(actual * 100) / 100,
        limit_pct: limit,
      });
    }
  }

  const individual_pass = violations.length === 0;

  return {
    thd_pct: Math.round(thd * 100) / 100,
    thd_limit_pct: thdLimit,
    thd_pass,
    individual_pass,
    violations,
    pass: thd_pass && individual_pass,
  };
}

// ---------------------------------------------------------------------------
// 6. Unified Study Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the full IEEE 1547-2018 DER Interconnection Study (all five criteria).
 *
 * @param {object} params
 * @param {object} params.pcc_voltage        Parameters for checkPCCVoltage()
 * @param {object} params.fault_impact       Parameters for checkFaultImpact()
 * @param {object} params.anti_islanding     Parameters for checkAntiIslanding()
 * @param {object} params.ride_through       Parameters for checkRideThrough()
 * @param {object} params.harmonics          Parameters for checkHarmonicsCompliance()
 * @returns {{
 *   pcc_voltage: object,
 *   fault_impact: object,
 *   anti_islanding: object,
 *   ride_through: object,
 *   harmonics: object,
 *   overall_pass: boolean,
 *   summary_flags: object
 * }}
 */
export function runDERInterconnectStudy(params) {
  const {
    pcc_voltage: pccParams,
    fault_impact: faultParams,
    anti_islanding: aiParams,
    ride_through: rtParams,
    harmonics: harmParams,
  } = params;

  const pcc_voltage   = checkPCCVoltage(pccParams);
  const fault_impact  = checkFaultImpact(faultParams);
  const anti_islanding = checkAntiIslanding(aiParams);
  const ride_through  = checkRideThrough(rtParams);
  const harmonics     = checkHarmonicsCompliance(harmParams);

  const overall_pass =
    pcc_voltage.pass &&
    fault_impact.pass &&
    anti_islanding.pass &&
    ride_through.pass &&
    harmonics.pass;

  const summary_flags = {
    pcc_voltage:    pcc_voltage.pass,
    fault_impact:   fault_impact.pass,
    anti_islanding: anti_islanding.pass,
    ride_through:   ride_through.pass,
    harmonics:      harmonics.pass,
  };

  return {
    pcc_voltage,
    fault_impact,
    anti_islanding,
    ride_through,
    harmonics,
    overall_pass,
    summary_flags,
  };
}
