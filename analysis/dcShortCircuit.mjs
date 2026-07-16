/**
 * DC System Short-Circuit & Arc Flash Analysis
 *
 * Standards:
 *   IEEE 946-2004   — Recommended Practice for the Design of DC Auxiliary Power
 *                     Systems for Generating Stations (fault current model)
 *   IEC 61660-1:1997 — Short-circuit currents in DC auxiliary installations
 *                     in power plants and substations
 *   NFPA 70E-2024   — Annex D.8 / D.8.1 DC arc flash (Ammerman method)
 *   IEEE P1458      — Recommended Practice for the Design, Operation, and
 *                     Maintenance of DC Systems in Industrial and Commercial
 *                     Applications (arc flash reference)
 *
 * Calculation overview
 * ────────────────────
 * 1. Bolted fault current:   I_bf = V_oc / R_total   (IEEE 946)
 * 2. DC arcing current:      Iterative Stokes–Oppenlander arc voltage model
 *                             V_arc = 20 + 0.534 × gap_mm × I_arc^0.12
 *                             I_arc = (V_oc − V_arc) / R_total
 * 3. Incident energy:        Ammerman/Wilkins DC energy-density models
 *                             Open air: E = E_arc / (4πd²)
 *                             Enclosed: E = kE_arc / (a² + d²)
 * 4. Protection check:       Fuse/CB interrupt rating vs. available fault current
 */

/** Battery chemistry open-circuit voltage per cell (V/cell) */
export const CELL_VOLTAGE = {
  'lead-acid':      2.0,
  'lead-acid-vrla': 2.0,
  'lead-acid-agm':  2.0,
  'nickel-cadmium': 1.2,
  'lithium-ion':    3.6,
  'lithium-iron-phosphate': 3.2,
};

/**
 * Incident-energy selections retained for display and validation only.
 *
 * NFPA 70E does not permit converting a calculated incident-energy result into
 * a PPE category. The incident-energy analysis and PPE-category table methods
 * are separate selection methods. Calculated results therefore report the
 * required minimum arc rating directly and do not assign a category.
 */
export const PPE_CATEGORIES = Object.freeze([
  { maxCalCm2: 1.2, category: null, label: 'Below the 1.2 cal/cm² arc-flash boundary threshold' },
  { maxCalCm2: Infinity, category: null, label: 'Use the incident-energy method; arc rating must meet or exceed the calculated exposure' },
]);

const JOULES_PER_CALORIE = 4.184;
const MM2_PER_CM2 = 100;
const OPEN_AIR_SOLID_ANGLE = 4 * Math.PI;
const LV_SWITCHGEAR_ENCLOSURE = Object.freeze({ aMm: 400, k: 0.312 });

/** Standard DC bus voltages for validation hints */
export const STANDARD_DC_VOLTAGES = [12, 24, 48, 125, 250, 480, 600];

/**
 * Return incident-energy PPE-selection information without assigning a
 * task-based PPE category. Arc-rating values are rounded upward so the
 * displayed requirement never understates the calculated energy.
 * @param {number} incidentEnergyCalCm2
 * @returns {{ category: null, minimumArcRatingCalCm2: number|null, label: string }}
 */
export function ppeCategoryForEnergy(incidentEnergyCalCm2) {
  const E = Number(incidentEnergyCalCm2);
  if (!Number.isFinite(E) || E < 0) {
    return { category: null, minimumArcRatingCalCm2: null, label: 'Incident energy is unavailable.' };
  }
  if (E <= 1.2) {
    return {
      category: null,
      minimumArcRatingCalCm2: 0,
      label: 'Below the 1.2 cal/cm² arc-flash boundary threshold; no PPE category is assigned.',
    };
  }
  const minimumArcRatingCalCm2 = Math.ceil(E * 100) / 100;
  return {
    category: null,
    minimumArcRatingCalCm2,
    label: `Incident-energy method: select arc-rated PPE with an arc rating of at least ${minimumArcRatingCalCm2.toFixed(2)} cal/cm².`,
  };
}

/**
 * Calculate the total circuit resistance for a DC system.
 *
 * @param {object} p
 * @param {number} p.batteryInternalResistanceOhm  — total battery string resistance (Ω)
 * @param {number} [p.cableResistanceOhm=0]        — one-way cable resistance (Ω)
 * @param {number} [p.busbarResistanceOhm=0]        — bus/busbar resistance (Ω)
 * @returns {number} Total resistance in Ω
 */
export function totalCircuitResistance({ batteryInternalResistanceOhm, cableResistanceOhm = 0, busbarResistanceOhm = 0 }) {
  const Rb = Number(batteryInternalResistanceOhm);
  const Rc = Number(cableResistanceOhm) || 0;
  const Rbus = Number(busbarResistanceOhm) || 0;
  if (!Number.isFinite(Rb) || Rb <= 0) throw new Error('batteryInternalResistanceOhm must be a positive number');
  if (!Number.isFinite(Rc) || Rc < 0) throw new Error('cableResistanceOhm must be ≥ 0');
  if (!Number.isFinite(Rbus) || Rbus < 0) throw new Error('busbarResistanceOhm must be ≥ 0');
  // The UI/API defines Rc as the one-way conductor resistance. A dc line-to-line
  // fault current travels from the source to the fault and back on the return
  // conductor, so the cable portion of the loop is 2 × Rc.
  return Rb + 2 * Rc + Rbus;
}

/**
 * Calculate the battery string open-circuit voltage.
 *
 * @param {object} p
 * @param {number} p.batteryCells       — number of cells in series
 * @param {string} [p.chemistry='lead-acid'] — battery chemistry key
 * @param {number} [p.batteryVoltage]    — override: direct bus voltage (V), skips cell calculation
 * @returns {number} Open-circuit voltage V_oc in volts
 */
export function openCircuitVoltage({ batteryCells, chemistry = 'lead-acid', batteryVoltage }) {
  if (batteryVoltage !== undefined && batteryVoltage !== null) {
    const v = Number(batteryVoltage);
    if (!Number.isFinite(v) || v <= 0) throw new Error('batteryVoltage must be a positive number');
    return v;
  }
  const cells = Number(batteryCells);
  if (!Number.isFinite(cells) || cells <= 0 || !Number.isInteger(cells)) {
    throw new Error('batteryCells must be a positive integer');
  }
  const vPerCell = CELL_VOLTAGE[chemistry];
  if (!vPerCell) {
    const valid = Object.keys(CELL_VOLTAGE).join(', ');
    throw new Error(`Unknown chemistry "${chemistry}". Valid values: ${valid}`);
  }
  return cells * vPerCell;
}

/**
 * Compute the DC bolted (maximum) fault current.
 *
 * Uses the simple Thevenin equivalent: I_bf = V_oc / R_total.
 * This gives the maximum prospective short-circuit current at the fault point
 * (IEEE 946-2004 Section 5, IEC 61660-1 Annex A).
 *
 * @param {object} p
 * @param {number} p.batteryVoltageV             — DC bus / open-circuit voltage (V)
 * @param {number} p.batteryInternalResistanceOhm — total battery internal resistance (Ω)
 * @param {number} [p.cableResistanceOhm=0]       — one-way cable resistance, round-trip = 2× (Ω)
 * @param {number} [p.busbarResistanceOhm=0]       — bus/bar resistance (Ω)
 * @param {number} [p.inductanceMH=0]              — total circuit inductance (mH)
 * @returns {{ boltedFaultCurrentA: number, timeConstantMs: number, totalResistanceOhm: number }}
 */
export function calcDcFaultCurrent({
  batteryVoltageV,
  batteryInternalResistanceOhm,
  cableResistanceOhm = 0,
  busbarResistanceOhm = 0,
  inductanceMH = 0,
}) {
  const V_oc = Number(batteryVoltageV);
  if (!Number.isFinite(V_oc) || V_oc <= 0) throw new Error('batteryVoltageV must be a positive number');

  const R_total = totalCircuitResistance({ batteryInternalResistanceOhm, cableResistanceOhm, busbarResistanceOhm });
  const L_mH = Number(inductanceMH) || 0;
  if (!Number.isFinite(L_mH) || L_mH < 0) throw new Error('inductanceMH must be ≥ 0');

  const I_bf = V_oc / R_total;
  // L/R time constant (ms) — negligible for most DC distribution systems
  const timeConstantMs = L_mH > 0 ? (L_mH / (R_total * 1000)) * 1000 : 0;

  return {
    boltedFaultCurrentA: Number(I_bf.toFixed(1)),
    timeConstantMs: Number(timeConstantMs.toFixed(2)),
    totalResistanceOhm: Number(R_total.toFixed(6)),
    openCircuitVoltageV: Number(V_oc.toFixed(1)),
  };
}

/**
 * Compute DC arcing current using the Stokes–Oppenlander arc voltage model.
 *
 * The arc voltage is: V_arc = 20 + 0.534 × g × I_arc^0.12  (g in mm)
 * The circuit equation is: I_arc = (V_oc − V_arc) / R_total
 *
 * These two equations are solved iteratively (15 Newton–Raphson steps)
 * starting from I_arc₀ = 0.85 × I_bf.
 *
 * Reference: Stokes & Oppenlander, "Electric Arcs in Open Air,"
 *            J. Phys. D: Appl. Phys. 24 (1991) 26–35.
 *            Ammerman et al., "DC Arc Models and Incident Energy Calculations,"
 *            IEEE Trans. Ind. Appl. 46(5), 2010.
 *
 * @param {number} V_oc         — open-circuit voltage (V)
 * @param {number} R_total      — total circuit resistance (Ω)
 * @param {number} I_bf         — bolted fault current (A) — starting estimate
 * @param {number} gapMm        — electrode gap (mm)
 * @returns {{ arcCurrentA: number, arcVoltageV: number }}
 */
export function calcDcArcingCurrent(V_oc, R_total, I_bf, gapMm) {
  const g = Math.max(Number(gapMm) || 25, 1);
  let I_arc = 0.85 * I_bf;

  for (let i = 0; i < 25; i++) {
    I_arc = Math.max(I_arc, 1);
    const V_arc = 20 + 0.534 * g * Math.pow(I_arc, 0.12);
    const I_new = (V_oc - V_arc) / R_total;
    if (I_new <= 0) {
      // Arc cannot sustain — minimum arc current equals minimum sustaining current
      I_arc = Math.max(0, I_new);
      break;
    }
    if (Math.abs(I_new - I_arc) / I_arc < 1e-7) {
      I_arc = I_new;
      break;
    }
    I_arc = I_new;
  }

  I_arc = Math.max(0, Math.min(I_arc, I_bf));
  const V_arc = I_arc > 0 ? 20 + 0.534 * g * Math.pow(Math.max(I_arc, 1), 0.12) : 0;

  return {
    arcCurrentA: Number(I_arc.toFixed(1)),
    arcVoltageV: Number(V_arc.toFixed(2)),
  };
}

/**
 * Compute DC arc flash incident energy and arc flash boundary.
 *
 * Uses the Ammerman open-air / arc-in-a-box energy-density method referenced by
 * NFPA 70E Annex D.
 *
 * Arc energy:
 *   E_arc = P_arc × t_arc                              [J]
 *
 * Open-air incident energy density:
 *   E_s = E_arc / (4π × d_mm²)                         [J/mm²]
 *
 * Low-voltage-switchgear enclosure model:
 *   E_1 = k × E_arc / (a² + d_mm²)                     [J/mm²]
 *   where a = 400 mm and k = 0.312.
 *
 * J/mm² is converted to cal/cm² by multiplying by 100 / 4.184.
 *
 * @param {object} p
 * @param {number} p.batteryVoltageV              — DC system voltage (V)
 * @param {number} p.batteryInternalResistanceOhm — battery string resistance (Ω)
 * @param {number} [p.cableResistanceOhm=0]        — cable resistance (Ω)
 * @param {number} [p.busbarResistanceOhm=0]        — bus resistance (Ω)
 * @param {number} [p.gapMm=25]                    — electrode gap (mm)
 * @param {number} [p.workingDistanceMm=455]       — working distance (mm)
 * @param {number} p.arcDurationMs                 — protection clearing time (ms)
 * @param {string} [p.enclosureType='open_air']    — 'open_air' | 'enclosed_box'
 * @returns {object} Full arc flash result
 */
export function calcDcArcFlash({
  batteryVoltageV,
  batteryInternalResistanceOhm,
  cableResistanceOhm = 0,
  busbarResistanceOhm = 0,
  gapMm = 25,
  workingDistanceMm = 455,
  arcDurationMs,
  enclosureType = 'open_air',
}) {
  const V_oc = Number(batteryVoltageV);
  if (!Number.isFinite(V_oc) || V_oc <= 0) throw new Error('batteryVoltageV must be a positive number');

  const t_ms = Number(arcDurationMs);
  if (!Number.isFinite(t_ms) || t_ms <= 0) throw new Error('arcDurationMs must be a positive number');

  const D_mm = Number(workingDistanceMm) || 455;
  if (!Number.isFinite(D_mm) || D_mm <= 0) throw new Error('workingDistanceMm must be a positive number');

  const gap = Math.max(Number(gapMm) || 25, 1);
  const t_s = t_ms / 1000;

  const R_total = totalCircuitResistance({ batteryInternalResistanceOhm, cableResistanceOhm, busbarResistanceOhm });
  const I_bf = V_oc / R_total;

  const { arcCurrentA, arcVoltageV } = calcDcArcingCurrent(V_oc, R_total, I_bf, gap);

  // Arc flash power (W)
  const P_arc = arcCurrentA * arcVoltageV;

  const arcEnergyJ = P_arc * t_s;
  const thresholdJPerMm2 = 1.2 * JOULES_PER_CALORIE / MM2_PER_CM2;
  const openAirDensityJPerMm2 = arcEnergyJ > 0
    ? arcEnergyJ / (OPEN_AIR_SOLID_ANGLE * D_mm * D_mm)
    : 0;

  let densityJPerMm2 = openAirDensityJPerMm2;
  let arcFlashBoundaryMm = arcEnergyJ > 0
    ? Math.sqrt(arcEnergyJ / (OPEN_AIR_SOLID_ANGLE * thresholdJPerMm2))
    : 0;
  let enclosureCorrectionFactor = 1;

  if (enclosureType === 'enclosed_box' && arcEnergyJ > 0) {
    const { aMm, k } = LV_SWITCHGEAR_ENCLOSURE;
    densityJPerMm2 = k * arcEnergyJ / (aMm * aMm + D_mm * D_mm);
    enclosureCorrectionFactor = openAirDensityJPerMm2 > 0
      ? densityJPerMm2 / openAirDensityJPerMm2
      : 1;
    const boundarySquared = k * arcEnergyJ / thresholdJPerMm2 - aMm * aMm;
    arcFlashBoundaryMm = boundarySquared > 0 ? Math.sqrt(boundarySquared) : 0;
  }

  const incidentEnergyCalCm2 = densityJPerMm2 * MM2_PER_CM2 / JOULES_PER_CALORIE;

  const ppeResult = ppeCategoryForEnergy(incidentEnergyCalCm2);

  const notes = [];
  if (incidentEnergyCalCm2 > 40) {
    notes.push('Incident energy exceeds 40 cal/cm²; verify protection clearing time and consider arc flash mitigation measures.');
  }
  if (arcCurrentA <= 0) {
    notes.push('Arc cannot be sustained at this voltage and gap; arc flash hazard is minimal but verify protection.');
  }
  if (t_s > 2.0) {
    notes.push('Arc duration exceeds 2 s; confirm the upstream fuse/breaker clearing time.');
  }

  return {
    boltedFaultCurrentA: Number(I_bf.toFixed(1)),
    arcCurrentA,
    arcVoltageV,
    arcPowerW: Number(P_arc.toFixed(0)),
    incidentEnergyCalCm2: Number(incidentEnergyCalCm2.toFixed(2)),
    arcFlashBoundaryMm: Number(arcFlashBoundaryMm.toFixed(0)),
    ppeCategory: ppeResult.category,
    ppeCategoryLabel: ppeResult.label,
    ppeSelectionMethod: 'incident-energy',
    minimumArcRatingCalCm2: ppeResult.minimumArcRatingCalCm2,
    enclosureCorrectionFactor: Number(enclosureCorrectionFactor.toFixed(4)),
    energyModel: enclosureType === 'enclosed_box'
      ? 'Ammerman/Wilkins low-voltage-switchgear enclosure'
      : 'Ammerman open-air spherical energy density',
    arcDurationMs: Number(t_ms.toFixed(1)),
    workingDistanceMm: Number(D_mm.toFixed(0)),
    gapMm: Number(gap.toFixed(0)),
    totalResistanceOhm: Number(R_total.toFixed(6)),
    notes,
  };
}

/**
 * Check whether protection devices have adequate interrupt ratings.
 *
 * @param {object} p
 * @param {number} p.availableFaultCurrentA  — available bolted fault current (A)
 * @param {Array}  p.devices                 — array of { tag, type, ratedCurrentA, interruptRatingA, clearingTimeMs }
 * @returns {Array} Per-device assessment results
 */
export function selectDcProtection({ availableFaultCurrentA, devices }) {
  const I_avail = Number(availableFaultCurrentA);
  if (!Number.isFinite(I_avail) || I_avail <= 0) throw new Error('availableFaultCurrentA must be a positive number');
  if (!Array.isArray(devices)) throw new Error('devices must be an array');

  return devices.map((dev, idx) => {
    const tag = dev.tag || dev.label || `Device ${idx + 1}`;
    const interruptA = Number(dev.interruptRatingA);
    const ratedA = Number(dev.ratedCurrentA);
    const clearMs = Number(dev.clearingTimeMs);

    if (!Number.isFinite(interruptA) || interruptA <= 0) {
      return { tag, type: dev.type || 'unknown', pass: null, note: 'Interrupt rating not provided — cannot assess.' };
    }

    const pass = I_avail <= interruptA;
    const margin = interruptA - I_avail;
    const marginPct = (margin / I_avail) * 100;

    const notes = [];
    if (!pass) {
      notes.push(`Interrupt rating ${interruptA.toFixed(0)} A is insufficient for available fault current ${I_avail.toFixed(0)} A. Replace with a higher-rated device.`);
    }
    if (Number.isFinite(ratedA) && ratedA > 0 && I_avail > ratedA * 10) {
      notes.push(`Available fault current is ${(I_avail / ratedA).toFixed(1)}× the device continuous rating — verify device type is appropriate for DC fault duty.`);
    }
    if (Number.isFinite(clearMs) && clearMs > 100) {
      notes.push(`Clearing time ${clearMs.toFixed(0)} ms is long; incident energy will be elevated. Consider a current-limiting fuse.`);
    }

    return {
      tag,
      type: dev.type || 'unknown',
      ratedCurrentA: Number.isFinite(ratedA) ? ratedA : null,
      interruptRatingA: interruptA,
      pass,
      marginA: Number(margin.toFixed(0)),
      marginPct: Number(marginPct.toFixed(1)),
      note: notes.join(' '),
    };
  });
}

/**
 * Full DC short-circuit study: fault current + optional arc flash + protection check.
 *
 * @param {object} inputs — all parameters, see individual function docs
 * @returns {object} Complete study result
 */
export function runDcShortCircuitStudy(inputs) {
  const {
    batteryVoltageV,
    batteryInternalResistanceOhm,
    cableResistanceOhm = 0,
    busbarResistanceOhm = 0,
    inductanceMH = 0,
    runArcFlash = false,
    gapMm = 25,
    workingDistanceMm = 455,
    arcDurationMs,
    enclosureType = 'open_air',
    devices = [],
    studyLabel = '',
    studyDate = new Date().toISOString().slice(0, 10),
  } = inputs || {};

  const faultResult = calcDcFaultCurrent({
    batteryVoltageV,
    batteryInternalResistanceOhm,
    cableResistanceOhm,
    busbarResistanceOhm,
    inductanceMH,
  });

  const result = {
    studyLabel,
    studyDate,
    faultCurrent: faultResult,
  };

  if (runArcFlash) {
    if (!arcDurationMs || Number(arcDurationMs) <= 0) {
      throw new Error('arcDurationMs must be provided and positive when runArcFlash is true');
    }
    result.arcFlash = calcDcArcFlash({
      batteryVoltageV,
      batteryInternalResistanceOhm,
      cableResistanceOhm,
      busbarResistanceOhm,
      gapMm,
      workingDistanceMm,
      arcDurationMs,
      enclosureType,
    });
  }

  if (Array.isArray(devices) && devices.length > 0) {
    result.protectionCheck = selectDcProtection({
      availableFaultCurrentA: faultResult.boltedFaultCurrentA,
      devices,
    });
  }

  return result;
}
