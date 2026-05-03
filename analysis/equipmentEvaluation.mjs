/**
 * Equipment Duty Evaluation / Compliance Inventory (Gap #80)
 *
 * Pure computation module — no DOM, no direct storage access.
 * Joins protective-device ratings with short-circuit / arc-flash study
 * results to produce a per-equipment pass/warn/fail compliance table.
 *
 * Checks performed:
 *   1. Interrupting rating (AIC) vs. available fault current
 *   2. Short-time withstand vs. fault current × clearing time (I²t rule)
 *   3. Cable short-circuit thermal duty (NEC 110.10 / IEC 60364-5-54)
 *   4. SCCR (Short-Circuit Current Rating) for MCC / motor-control equipment
 */

export const EVAL_STATUS = {
  PASS:       'pass',
  FAIL:       'fail',
  INCOMPLETE: 'incomplete',
};

// ---------------------------------------------------------------------------
// Cable k-factors for I²t thermal duty check
// IEC 60364-5-54 / NEC Table B.310.15(B)(2)(a) equivalent
// Units: A·s^0.5 / mm²
// ---------------------------------------------------------------------------
export const CABLE_K_FACTORS = {
  copper_pvc:      115,
  copper_xlpe:     135,
  copper_epr:      143,
  aluminium_pvc:    76,
  aluminium_xlpe:   87,
};

// ---------------------------------------------------------------------------
// Check #1 — Interrupting Rating (AIC)
// ---------------------------------------------------------------------------

/**
 * Compare a protective device's interrupting rating against available fault current.
 *
 * @param {number|null} ratingKA  - device AIC / interrupt rating in kA
 * @param {number|null} faultKA   - available bolted 3-phase fault current in kA
 * @returns {{ status: string, ratingKA: number|null, faultKA: number|null, marginKA: number|null }}
 */
export function checkInterruptingRating(ratingKA, faultKA) {
  if (ratingKA == null || !Number.isFinite(ratingKA)) {
    return { status: EVAL_STATUS.INCOMPLETE, ratingKA: null, faultKA: faultKA ?? null, marginKA: null };
  }
  if (faultKA == null || !Number.isFinite(faultKA)) {
    return { status: EVAL_STATUS.INCOMPLETE, ratingKA, faultKA: null, marginKA: null };
  }
  const marginKA = Number((ratingKA - faultKA).toFixed(2));
  const status   = faultKA <= ratingKA ? EVAL_STATUS.PASS : EVAL_STATUS.FAIL;
  return { status, ratingKA: Number(ratingKA.toFixed(2)), faultKA: Number(faultKA.toFixed(2)), marginKA };
}

// ---------------------------------------------------------------------------
// Check #2 — Short-Time Withstand Rating
// ---------------------------------------------------------------------------

/**
 * Compare a device's short-time withstand rating against fault current × clearing time.
 * Adjusts the rated current to the actual clearing time using constant-energy (I²t) rule:
 *   I_withstand_at_t = ratingKA × sqrt(ratingSeconds / clearingSeconds)
 *
 * @param {number|null} ratingKA      - withstand current rating in kA
 * @param {number|null} ratingCycles  - rated duration in cycles (typically 3, 10, or 30)
 * @param {number|null} faultKA       - available symmetrical 3-phase fault current in kA
 * @param {number|null} clearingTimeS - protective-device clearing time in seconds
 * @returns {{ status: string, ratingKA: number|null, adjustedRatingKA: number|null, faultKA: number|null, clearingTimeS: number|null }}
 */
export function checkWithstand(ratingKA, ratingCycles, faultKA, clearingTimeS) {
  if (ratingKA == null || !Number.isFinite(ratingKA)) {
    return {
      status: EVAL_STATUS.INCOMPLETE,
      ratingKA: null, adjustedRatingKA: null,
      faultKA: faultKA ?? null, clearingTimeS: clearingTimeS ?? null,
    };
  }
  if (faultKA == null || !Number.isFinite(faultKA) ||
      clearingTimeS == null || !Number.isFinite(clearingTimeS)) {
    return {
      status: EVAL_STATUS.INCOMPLETE,
      ratingKA, adjustedRatingKA: null,
      faultKA: faultKA ?? null, clearingTimeS: clearingTimeS ?? null,
    };
  }
  const cycles       = Number.isFinite(ratingCycles) && ratingCycles > 0 ? ratingCycles : 30;
  const ratingS      = cycles / 60;
  const adjustedKA   = ratingKA * Math.sqrt(ratingS / Math.max(clearingTimeS, 0.001));
  const status       = faultKA <= adjustedKA ? EVAL_STATUS.PASS : EVAL_STATUS.FAIL;
  return {
    status,
    ratingKA:         Number(ratingKA.toFixed(2)),
    adjustedRatingKA: Number(adjustedKA.toFixed(2)),
    faultKA:          Number(faultKA.toFixed(2)),
    clearingTimeS:    Number(clearingTimeS.toFixed(3)),
  };
}

// ---------------------------------------------------------------------------
// Check #3 — Cable Short-Circuit Thermal Duty
// ---------------------------------------------------------------------------

/**
 * Check conductor cross-section against the I²t thermal duty at the available fault current.
 * Formula (NEC 110.10 / IEC 60364-5-54):  A_min = (I_fault_A × √t) / k  [mm²]
 *
 * @param {number|null} conductorMm2  - actual conductor cross-section in mm²
 * @param {string}      material      - key from CABLE_K_FACTORS
 * @param {number|null} faultKA       - fault current in kA
 * @param {number|null} clearingTimeS - clearing time in seconds
 * @returns {{ status: string, minMm2: number|null, actualMm2: number|null, faultKA: number|null, clearingTimeS: number|null, k: number }}
 */
export function checkCableThermalDuty(conductorMm2, material, faultKA, clearingTimeS) {
  const k = CABLE_K_FACTORS[material] ?? CABLE_K_FACTORS.copper_xlpe;

  if (conductorMm2 == null || !Number.isFinite(conductorMm2)) {
    return { status: EVAL_STATUS.INCOMPLETE, minMm2: null, actualMm2: null, faultKA: faultKA ?? null, clearingTimeS: clearingTimeS ?? null, k };
  }
  if (faultKA == null || !Number.isFinite(faultKA) ||
      clearingTimeS == null || !Number.isFinite(clearingTimeS)) {
    return { status: EVAL_STATUS.INCOMPLETE, minMm2: null, actualMm2: Number(conductorMm2.toFixed(1)), faultKA: faultKA ?? null, clearingTimeS: clearingTimeS ?? null, k };
  }

  const faultA = faultKA * 1000;
  const minMm2 = (faultA * Math.sqrt(clearingTimeS)) / k;
  const status = conductorMm2 >= minMm2 - 1e-6 ? EVAL_STATUS.PASS : EVAL_STATUS.FAIL;
  return {
    status,
    minMm2:       Number(minMm2.toFixed(1)),
    actualMm2:    Number(conductorMm2.toFixed(1)),
    faultKA:      Number(faultKA.toFixed(2)),
    clearingTimeS: Number(clearingTimeS.toFixed(3)),
    k,
  };
}

// ---------------------------------------------------------------------------
// Check #4 — SCCR (Short-Circuit Current Rating)
// ---------------------------------------------------------------------------

/**
 * Check motor-control equipment SCCR rating against available fault current.
 *
 * @param {number|null} sccrKA  - equipment SCCR in kA
 * @param {number|null} faultKA - available fault current in kA
 * @returns {{ status: string, sccrKA: number|null, faultKA: number|null, marginKA: number|null }}
 */
export function checkSccr(sccrKA, faultKA) {
  if (sccrKA == null || !Number.isFinite(sccrKA)) {
    return { status: EVAL_STATUS.INCOMPLETE, sccrKA: null, faultKA: faultKA ?? null, marginKA: null };
  }
  if (faultKA == null || !Number.isFinite(faultKA)) {
    return { status: EVAL_STATUS.INCOMPLETE, sccrKA, faultKA: null, marginKA: null };
  }
  const marginKA = Number((sccrKA - faultKA).toFixed(2));
  const status   = faultKA <= sccrKA ? EVAL_STATUS.PASS : EVAL_STATUS.FAIL;
  return { status, sccrKA: Number(sccrKA.toFixed(2)), faultKA: Number(faultKA.toFixed(2)), marginKA };
}

// ---------------------------------------------------------------------------
// AWG / kcmil → mm² conversion
// ---------------------------------------------------------------------------

const AWG_TO_MM2 = {
  '14': 2.08, '12': 3.31, '10': 5.26, '8': 8.37, '6': 13.3, '4': 21.1,
  '3': 26.7, '2': 33.6, '1': 42.4, '1/0': 53.5, '2/0': 67.4, '3/0': 85.0,
  '4/0': 107.2, '250': 126.7, '300': 152.0, '350': 177.4, '400': 202.7,
  '500': 253.3, '600': 304.0, '700': 354.7, '750': 380.0, '1000': 506.7,
};

/**
 * Convert AWG or kcmil string to mm².
 * Handles "#4 AWG", "4 AWG", "500 kcmil", "500", "35 mm2", etc.
 * @param {string|null} sizeStr
 * @returns {number|null}
 */
export function conductorSizeToMm2(sizeStr) {
  if (!sizeStr) return null;
  const s = String(sizeStr).trim();

  // Already in mm²
  const mm2Match = s.match(/^(\d+(?:\.\d+)?)\s*mm2?$/i);
  if (mm2Match) return parseFloat(mm2Match[1]);

  // Remove unit suffixes and leading '#'
  const clean = s.replace(/\s*(kcmil|awg|mcm)\s*$/i, '').replace(/^#/, '').trim();
  return AWG_TO_MM2[clean] ?? null;
}

/**
 * Derive cable k-factor key from cable record fields.
 * @param {object} cable
 * @returns {string}
 */
export function conductorMaterial(cable) {
  const mat = (cable.conductor_material ?? cable.material ?? 'copper').toLowerCase();
  const ins = (cable.insulation_type ?? cable.insulation ?? 'xlpe').toLowerCase();
  if (mat.startsWith('al')) {
    return ins.includes('pvc') ? 'aluminium_pvc' : 'aluminium_xlpe';
  }
  if (ins.includes('pvc')) return 'copper_pvc';
  if (ins.includes('epr')) return 'copper_epr';
  return 'copper_xlpe';
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'recloser', 'disconnect']);
const ENCLOSURE_TYPES  = new Set(['switchboard', 'panel', 'mcc', 'busway', 'dc_bus']);

/**
 * Evaluate all equipment against short-circuit and arc-flash study results.
 *
 * @param {object[]} components   - flat array of one-line diagram components from all sheets
 * @param {object[]} cables       - cable schedule entries from getCables()
 * @param {{ shortCircuit?: object, arcFlash?: object }} studies
 * @param {object[]} [deviceCatalog] - protectiveDevices array for rating lookup
 * @returns {EvalEntry[]}
 */
export function evaluateEquipment(components, cables, studies, deviceCatalog = []) {
  const sc     = studies?.shortCircuit ?? {};
  const afRaw  = studies?.arcFlash ?? {};
  const afMap  = Array.isArray(afRaw)
    ? Object.fromEntries(afRaw.map(e => [e.busId ?? e.id, e]))
    : afRaw;

  const catalogMap = new Map((deviceCatalog ?? []).map(d => [d.id, d]));
  const results = [];

  // ── Evaluate protective devices on the one-line ─────────────────────────
  for (const comp of (components ?? [])) {
    if (!PROTECTIVE_TYPES.has(comp.type)) continue;

    const compSc  = sc[comp.id]    ?? {};
    const compAf  = afMap[comp.id] ?? {};
    const faultKA = Number.isFinite(compSc.threePhaseKA) ? compSc.threePhaseKA : null;
    const clearS  = Number.isFinite(compAf.clearingTimeSeconds)
      ? compAf.clearingTimeSeconds
      : (Number.isFinite(comp.props?.clearing_time) ? Number(comp.props.clearing_time) : null);

    const cat           = comp.props?.device ? catalogMap.get(comp.props.device) : null;
    const interruptKA   = numOrNull(comp.props?.interruptRatingKA)  ?? numOrNull(cat?.interruptRating)  ?? null;
    const withstandKA   = numOrNull(comp.props?.withstandRatingKA)  ?? numOrNull(cat?.withstandRatingKA) ?? null;
    const withstandCyc  = numOrNull(comp.props?.withstandCycles)    ?? numOrNull(cat?.withstandCycles)   ?? 30;
    const sccrKA        = numOrNull(comp.props?.sccrKA)             ?? numOrNull(cat?.sccr)              ?? null;

    const aic      = checkInterruptingRating(interruptKA, faultKA);
    const withstand = checkWithstand(withstandKA, withstandCyc, faultKA, clearS);
    const sccr     = sccrKA != null ? checkSccr(sccrKA, faultKA) : null;

    const checks = { aic, withstand, ...(sccr ? { sccr } : {}) };
    results.push({
      id:           comp.id,
      label:        comp.props?.name ?? comp.props?.tag ?? comp.id,
      type:         comp.type,
      subtype:      comp.props?.subtype ?? comp.subtype ?? null,
      checks,
      status:       _worstStatus(checks),
      faultKA,
      clearingTimeS: clearS,
    });
  }

  // ── Evaluate enclosures (switchboards, panels, MCC, busway) ─────────────
  for (const comp of (components ?? [])) {
    if (!ENCLOSURE_TYPES.has(comp.type) && !ENCLOSURE_TYPES.has(comp.subtype)) continue;

    const compSc = sc[comp.id] ?? {};
    const compAf = afMap[comp.id] ?? {};
    const faultKA = Number.isFinite(compSc.threePhaseKA) ? compSc.threePhaseKA : null;
    const clearS  = Number.isFinite(compAf.clearingTimeSeconds) ? compAf.clearingTimeSeconds : null;

    const props = comp.props ?? {};

    // Interrupting rating (panels use main_interrupting_ka; switchboards use interrupting_ka)
    const interruptKA = numOrNull(props.interrupting_ka)
      ?? numOrNull(props.main_interrupting_ka)
      ?? numOrNull(props.short_circuit_rating_ka)
      ?? null;

    // Short-time withstand: switchboards provide withstand_1s_ka (1-second = 60 cycles)
    const withstand1sKA = numOrNull(props.withstand_1s_ka) ?? null;

    const aic      = checkInterruptingRating(interruptKA, faultKA);
    const withstand = checkWithstand(withstand1sKA, 60, faultKA, clearS);

    const sccrKA = comp.type === 'mcc' ? (numOrNull(props.sccr_ka) ?? null) : null;
    const sccr   = sccrKA != null ? checkSccr(sccrKA, faultKA) : null;

    const checks = { aic, withstand, ...(sccr ? { sccr } : {}) };
    results.push({
      id:           comp.id,
      label:        props.name ?? props.tag ?? comp.id,
      type:         comp.type,
      subtype:      comp.subtype ?? null,
      checks,
      status:       _worstStatus(checks),
      faultKA,
      clearingTimeS: clearS,
    });
  }

  // ── Evaluate cable segments on the one-line ──────────────────────────────
  for (const comp of (components ?? [])) {
    if (comp.type !== 'cable') continue;

    const props = comp.props ?? {};
    const faultKA  = _cableFaultKA(comp, sc);
    const clearS   = _cableClearingS(comp, afMap, faultKA, sc);

    const sizeStr  = props.size_awg_kcmil ?? props.conductor_size;
    const mm2      = numOrNull(props.conductor_mm2) ?? conductorSizeToMm2(sizeStr);
    const matKey   = conductorMaterial(props);
    const thermal  = checkCableThermalDuty(mm2, matKey, faultKA, clearS);

    const checks = { thermal };
    results.push({
      id:           comp.id,
      label:        props.tag ?? props.name ?? comp.id,
      type:         'cable',
      subtype:      props.cable_type ?? null,
      checks,
      status:       _worstStatus(checks),
      faultKA,
      clearingTimeS: clearS,
    });
  }

  // ── Evaluate cable schedule entries (external cables with route IDs) ─────
  for (const cable of (cables ?? [])) {
    const scEntry = _findBestScEntry(cable, sc);
    const faultKA  = scEntry ? scEntry.threePhaseKA : null;
    const afEntry  = scEntry ? (afMap[scEntry._id] ?? null) : null;
    const clearS   = afEntry ? (numOrNull(afEntry.clearingTimeSeconds) ?? null) : null;

    const mm2     = numOrNull(cable.conductor_mm2) ?? conductorSizeToMm2(cable.conductor_size);
    const matKey  = conductorMaterial(cable);
    const thermal = checkCableThermalDuty(mm2, matKey, faultKA, clearS);

    const checks = { thermal };
    results.push({
      id:    cable.cable_id ?? cable.id ?? `cable-${results.length}`,
      label: cable.cable_tag ?? cable.tag ?? cable.cable_id ?? 'Cable',
      type:  'cable',
      subtype: cable.cable_type ?? null,
      checks,
      status: _worstStatus(checks),
      faultKA,
      clearingTimeS: clearS,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export const REPORT_HEADERS = [
  'ID', 'Label', 'Type', 'Check', 'Status',
  'Rating (kA)', 'Fault Current (kA)', 'Margin (kA)', 'Notes',
];

/**
 * Flatten evaluation entries into CSV-ready rows (one row per check).
 * @param {EvalEntry[]} evaluations
 * @returns {string[][]}
 */
export function buildEquipmentReport(evaluations) {
  const rows = [];
  for (const entry of (evaluations ?? [])) {
    for (const [checkName, result] of Object.entries(entry.checks)) {
      if (!result) continue;
      const rating  = _checkRatingStr(checkName, result);
      const notes   = _checkNotes(checkName, result);
      rows.push([
        entry.id,
        entry.label,
        entry.type,
        checkName,
        result.status,
        rating,
        result.faultKA  != null ? String(result.faultKA)  : '',
        result.marginKA != null ? String(result.marginKA) : '',
        notes,
      ]);
    }
  }
  return rows;
}

/**
 * Summarise counts by status.
 * @param {EvalEntry[]} evaluations
 * @returns {{ total: number, pass: number, fail: number, incomplete: number }}
 */
export function summariseEvaluation(evaluations) {
  const counts = { total: 0, pass: 0, fail: 0, incomplete: 0 };
  for (const e of (evaluations ?? [])) {
    counts.total++;
    counts[e.status] = (counts[e.status] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _worstStatus(checks) {
  const ORDER = [EVAL_STATUS.FAIL, EVAL_STATUS.INCOMPLETE, EVAL_STATUS.PASS];
  let worst = EVAL_STATUS.PASS;
  for (const result of Object.values(checks)) {
    if (!result) continue;
    const rank = ORDER.indexOf(result.status);
    if (rank !== -1 && rank < ORDER.indexOf(worst)) worst = result.status;
  }
  return worst;
}

function _cableFaultKA(comp, sc) {
  // Check if the cable itself has a SC result
  if (Number.isFinite(sc[comp.id]?.threePhaseKA)) return sc[comp.id].threePhaseKA;
  // Try source/from bus
  const fromId = comp.props?.from_id ?? comp.props?.source_bus;
  if (fromId && Number.isFinite(sc[fromId]?.threePhaseKA)) return sc[fromId].threePhaseKA;
  return null;
}

function _cableClearingS(comp, afMap, faultKA, sc) {
  if (afMap[comp.id]?.clearingTimeSeconds != null) {
    return numOrNull(afMap[comp.id].clearingTimeSeconds);
  }
  const fromId = comp.props?.from_id ?? comp.props?.source_bus;
  if (fromId && afMap[fromId]?.clearingTimeSeconds != null) {
    return numOrNull(afMap[fromId].clearingTimeSeconds);
  }
  return null;
}

function _findBestScEntry(cable, sc) {
  const fromId = cable.from_id ?? cable.source_bus;
  if (fromId && Number.isFinite(sc[fromId]?.threePhaseKA)) {
    return { ...sc[fromId], _id: fromId };
  }
  // Use maximum fault current from all bus results
  let best = null;
  let bestKA = -Infinity;
  for (const [id, entry] of Object.entries(sc)) {
    if (Number.isFinite(entry.threePhaseKA) && entry.threePhaseKA > bestKA) {
      bestKA = entry.threePhaseKA;
      best   = { ...entry, _id: id };
    }
  }
  return best;
}

function _checkRatingStr(checkName, result) {
  if (checkName === 'aic')      return result.ratingKA      != null ? String(result.ratingKA)   : '';
  if (checkName === 'withstand') return result.ratingKA     != null ? String(result.ratingKA)   : '';
  if (checkName === 'sccr')      return result.sccrKA       != null ? String(result.sccrKA)     : '';
  if (checkName === 'thermal')   return result.actualMm2    != null ? `${result.actualMm2} mm²` : '';
  return '';
}

function _checkNotes(checkName, result) {
  if (result.status === EVAL_STATUS.INCOMPLETE) {
    if (checkName === 'aic' && result.ratingKA == null)      return 'Interrupting rating not entered.';
    if (checkName === 'aic' && result.faultKA == null)       return 'Short-circuit study not run.';
    if (checkName === 'withstand' && result.ratingKA == null) return 'Withstand rating not entered.';
    if (checkName === 'sccr' && result.sccrKA == null)       return 'SCCR not specified.';
    if (checkName === 'thermal' && result.actualMm2 == null)  return 'Conductor size not specified.';
    if (checkName === 'thermal' && result.faultKA == null)    return 'No short-circuit data for cable route.';
    return 'Missing data.';
  }
  if (result.status === EVAL_STATUS.FAIL) {
    if (checkName === 'aic')
      return `Fault ${result.faultKA} kA exceeds device rating ${result.ratingKA} kA.`;
    if (checkName === 'withstand')
      return `Fault ${result.faultKA} kA exceeds adjusted withstand ${result.adjustedRatingKA} kA.`;
    if (checkName === 'sccr')
      return `Fault ${result.faultKA} kA exceeds SCCR ${result.sccrKA} kA.`;
    if (checkName === 'thermal')
      return `Conductor ${result.actualMm2} mm² < required ${result.minMm2} mm² for I²t duty.`;
  }
  return '';
}
