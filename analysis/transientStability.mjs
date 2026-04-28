/**
 * Transient Stability Analysis
 *
 * Simulates the dynamic response of a synchronous generator to a fault disturbance
 * using the classical one-machine infinite-bus (OMIB) swing equation model.
 *
 * The swing equation (per-unit):
 *
 *   (2H / ωs) × d²δ/dt² = Pm - Pe
 *
 * where:
 *   H  = machine inertia constant (MW·s / MVA), typically 2–10 s
 *   ωs = synchronous angular frequency = 2π × f (rad/s)
 *   δ  = rotor angle (radians) relative to infinite bus
 *   Pm = mechanical power input (pu) — assumed constant during transient
 *   Pe = electrical power output (pu)
 *
 * Electrical power during each period:
 *   Pre-fault:   Pe = (E' × V / X'd_total)    × sin(δ)
 *   During fault: Pe = (E' × V / X'd_fault)   × sin(δ)  (reduced)
 *   Post-fault:  Pe = (E' × V / X'd_postfault)× sin(δ)
 *
 * The maximum deliverable power in each period:
 *   Pmax_k = E' × V / X_k
 *
 * Numerical integration: 4th-order Runge-Kutta (RK4).
 *
 * Stability criterion: the rotor angle δ must not exceed 180° (π rad).
 * Critical clearing time (CCT) is found by bisection: the latest fault
 * clearing time at which the system remains stable.
 *
 * Equal-Area Criterion (EAC) is used for a fast analytical CCT estimate
 * before numerical simulation.
 *
 * References:
 *   Kundur, P. "Power System Stability and Control" (1994)
 *   Anderson & Fouad "Power Systems Control and Stability" (2003)
 *   IEEE Std 1110-2002 — Guide for Synchronous Generator Modeling
 */

// ---------------------------------------------------------------------------
// Pre-fault initial conditions
// ---------------------------------------------------------------------------

/**
 * Compute the initial (pre-fault) rotor angle δ₀ such that:
 *   Pm = Pmax_pre × sin(δ₀)
 *
 * @param {number} Pm        – Mechanical power (pu)
 * @param {number} Pmax_pre  – Pre-fault maximum electrical power (pu)
 * @returns {number} δ₀ in radians
 * @throws if Pm > Pmax_pre (no equilibrium)
 */
export function initialRotorAngle(Pm, Pmax_pre) {
  if (Pm > Pmax_pre) {
    throw new Error(
      `Mechanical power Pm (${Pm.toFixed(3)} pu) exceeds pre-fault Pmax (${Pmax_pre.toFixed(3)} pu). ` +
      `Check input impedances and operating point.`
    );
  }
  return Math.asin(Pm / Pmax_pre);
}

// ---------------------------------------------------------------------------
// Swing equation RK4 integration
// ---------------------------------------------------------------------------

/**
 * Integrate the swing equation using 4th-order Runge-Kutta.
 *
 * State: [δ (rad), ω (rad/s)]  where ω = dδ/dt (relative angular speed)
 *
 * @param {object} params
 * @param {number} params.H          – Inertia constant (MW·s / MVA)
 * @param {number} params.f          – System frequency (Hz)
 * @param {number} params.Pm         – Mechanical power (pu constant)
 * @param {number} params.Pmax_pre   – Pre-fault max power = E'V/X_pre (pu)
 * @param {number} params.Pmax_fault – During-fault max power = E'V/X_fault (pu)
 * @param {number} params.Pmax_post  – Post-fault max power = E'V/X_post (pu)
 * @param {number} params.delta0     – Initial rotor angle (rad)
 * @param {number} params.t_fault    – Fault inception time (s), default 0
 * @param {number} params.t_clear    – Fault clearing time (s)
 * @param {number} params.t_end      – Simulation end time (s)
 * @param {number} [params.dt=0.001] – Time step (s)
 * @returns {{
 *   time:    Float64Array,
 *   delta:   Float64Array,  // rotor angle (rad)
 *   omega:   Float64Array,  // relative angular speed (rad/s)
 *   stable:  boolean,       // true if δ never exceeded π rad
 *   deltaMax_deg: number,   // maximum rotor angle during simulation (degrees)
 *   t_unstable: number|null // time at which instability first detected (s)
 * }}
 */
export function simulateSwingEquation(params) {
  const {
    H, f, Pm, Pmax_pre, Pmax_fault, Pmax_post,
    delta0, t_clear, t_end,
  } = params;
  const t_fault = params.t_fault ?? 0;
  const dt      = params.dt      ?? 0.001;

  if (!Number.isFinite(H) || H <= 0) throw new Error('Inertia constant H must be positive');
  if (!Number.isFinite(Pm) || Pm < 0) throw new Error('Mechanical power Pm must be non-negative');

  const ws = 2 * Math.PI * f;         // synchronous angular frequency (rad/s)
  const M  = 2 * H / ws;              // inertia coefficient (s²/rad)

  const nSteps = Math.ceil((t_end - t_fault) / dt) + 1;
  const time  = new Float64Array(nSteps);
  const delta = new Float64Array(nSteps);
  const omega = new Float64Array(nSteps);

  time[0]  = t_fault;
  delta[0] = delta0;
  omega[0] = 0;

  let stable     = true;
  let t_unstable = null;
  let deltaMax   = delta0;

  // RK4 acceleration function: d²δ/dt² = (Pm - Pmax × sin(δ)) / M
  function accel(t, d, w) {
    const Pmax = t < t_clear ? Pmax_fault : Pmax_post;
    return (Pm - Pmax * Math.sin(d)) / M;
  }

  for (let i = 0; i < nSteps - 1; i++) {
    const t = time[i];
    const d = delta[i];
    const w = omega[i];

    // RK4 for state [δ, ω]
    const k1d = w;
    const k1w = accel(t, d, w);

    const k2d = w + 0.5 * dt * k1w;
    const k2w = accel(t + 0.5 * dt, d + 0.5 * dt * k1d, w + 0.5 * dt * k1w);

    const k3d = w + 0.5 * dt * k2w;
    const k3w = accel(t + 0.5 * dt, d + 0.5 * dt * k2d, w + 0.5 * dt * k2w);

    const k4d = w + dt * k3w;
    const k4w = accel(t + dt, d + dt * k3d, w + dt * k3w);

    delta[i + 1] = d + (dt / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
    omega[i + 1] = w + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    time[i + 1]  = t + dt;

    if (Math.abs(delta[i + 1]) > deltaMax) deltaMax = Math.abs(delta[i + 1]);

    // Instability: δ ≥ π (rotor has "slipped a pole")
    if (delta[i + 1] >= Math.PI && stable) {
      stable     = false;
      t_unstable = time[i + 1];
    }
  }

  return {
    time,
    delta,
    omega,
    stable,
    deltaMax_deg: (deltaMax * 180) / Math.PI,
    t_unstable,
  };
}

// ---------------------------------------------------------------------------
// Critical Clearing Time by bisection
// ---------------------------------------------------------------------------

/**
 * Find the Critical Clearing Time (CCT) using bisection on the stability
 * criterion of simulateSwingEquation.
 *
 * @param {object} baseParams – Same as simulateSwingEquation params, minus t_clear
 * @param {object} [options]
 * @param {number} [options.tMin=0.001]  – Minimum clearing time to try (s)
 * @param {number} [options.tMax=2.0]    – Maximum clearing time to try (s)
 * @param {number} [options.tol=0.0005]  – Bisection tolerance (s)
 * @param {number} [options.maxIter=40]  – Maximum iterations
 * @returns {{
 *   cct_s:       number,   // Critical clearing time (s)
 *   cct_cycles:  number,   // CCT in cycles (at system frequency)
 *   converged:   boolean,
 * }}
 */
export function findCriticalClearingTime(baseParams, options = {}) {
  const tMin    = options.tMin    ?? 0.001;
  const tMax    = options.tMax    ?? 2.0;
  const tol     = options.tol     ?? 0.0005;
  const maxIter = options.maxIter ?? 40;

  function isStable(t_clear) {
    try {
      const r = simulateSwingEquation({ ...baseParams, t_clear });
      return r.stable;
    } catch {
      return false;
    }
  }

  // Quick bound checks
  // If system is unstable even at minimum clearing time → always unstable
  if (!isStable(tMin)) {
    return { cct_s: 0, cct_cycles: 0, converged: false };
  }
  // If system is stable even at maximum clearing time → CCT > tMax
  if (isStable(tMax)) {
    return { cct_s: tMax, cct_cycles: tMax * baseParams.f, converged: false };
  }

  // Bisect: lo is known-stable, hi is known-unstable
  let lo = tMin;
  let hi = tMax;

  for (let i = 0; i < maxIter; i++) {
    if (hi - lo < tol) break;
    const mid = (lo + hi) / 2;
    if (isStable(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const cct_s = Math.round(lo * 10000) / 10000;
  return {
    cct_s,
    cct_cycles: Math.round(cct_s * baseParams.f * 10) / 10,
    converged: (hi - lo) < tol * 2,
  };
}

// ---------------------------------------------------------------------------
// Equal-Area Criterion (analytical CCT estimate)
// ---------------------------------------------------------------------------

/**
 * Estimate CCT using the Equal-Area Criterion (EAC).
 *
 * For the simple OMIB system, the EAC gives the critical clearing angle δ_cr:
 *   δ_max (post-fault unstable equilibrium) = π - arcsin(Pm / Pmax_post)
 *
 * Acceleration area = Pm×(δ_cr - δ₀) - Pmax_fault×(cos(δ₀) - cos(δ_cr))
 * Deceleration area = Pmax_post×(cos(δ_cr) - cos(δ_max)) - Pm×(δ_max - δ_cr)
 *
 * Set them equal and solve numerically for δ_cr, then compute the time to
 * reach δ_cr under constant acceleration (conservative approximation):
 *   t_cr ≈ sqrt(2 × M × (δ_cr - δ₀) / (Pm - Pmax_fault×sin(δ₀)))
 *
 * Note: this is an approximation valid for small machines. Use numerical
 * simulation for final results.
 *
 * @param {object} params
 * @param {number} params.Pm
 * @param {number} params.Pmax_pre
 * @param {number} params.Pmax_fault
 * @param {number} params.Pmax_post
 * @param {number} params.H
 * @param {number} params.f
 * @returns {{
 *   delta0_deg:     number,
 *   deltaMax_deg:   number,
 *   deltaCr_deg:    number,
 *   eac_cct_s:      number,
 *   eac_cct_cycles: number,
 *   feasible:       boolean,
 *   note:           string,
 * }}
 */
export function equalAreaCriterion(params) {
  const { Pm, Pmax_pre, Pmax_fault, Pmax_post, H, f } = params;
  const ws = 2 * Math.PI * f;
  const M  = 2 * H / ws;

  let delta0;
  try {
    delta0 = initialRotorAngle(Pm, Pmax_pre);
  } catch (err) {
    return {
      delta0_deg: NaN, deltaMax_deg: NaN, deltaCr_deg: NaN,
      eac_cct_s: NaN, eac_cct_cycles: NaN,
      feasible: false, note: err.message,
    };
  }

  // Maximum angle before instability (post-fault unstable equilibrium)
  if (Pm > Pmax_post) {
    return {
      delta0_deg: (delta0 * 180) / Math.PI,
      deltaMax_deg: 180,
      deltaCr_deg: NaN,
      eac_cct_s: 0,
      eac_cct_cycles: 0,
      feasible: false,
      note: 'Post-fault Pmax < Pm: system is transiently unstable regardless of clearing time.',
    };
  }

  const deltaMax = Math.PI - Math.asin(Pm / Pmax_post);

  // Find critical clearing angle δ_cr by bisection (EAC balance)
  function areaImbalance(deltaCr) {
    const accelArea = Pm * (deltaCr - delta0)
      - Pmax_fault * (-Math.cos(deltaCr) + Math.cos(delta0));
    const decelArea = Pmax_post * (-Math.cos(deltaMax) + Math.cos(deltaCr))
      - Pm * (deltaMax - deltaCr);
    return accelArea - decelArea;
  }

  let lo = delta0;
  let hi = deltaMax;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaImbalance(mid) > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-8) break;
  }
  const deltaCr = (lo + hi) / 2;

  // Time to reach δ_cr under constant (initial) net acceleration — approximation
  const netAccelInitial = (Pm - Pmax_fault * Math.sin(delta0)) / M;
  let eac_cct_s;
  if (netAccelInitial <= 0) {
    // No acceleration during fault (fault Pmax ≥ Pm): system is always stable
    eac_cct_s = Infinity;
  } else {
    eac_cct_s = Math.sqrt(2 * (deltaCr - delta0) / netAccelInitial);
  }

  return {
    delta0_deg:     Math.round((delta0  * 180 / Math.PI) * 100) / 100,
    deltaMax_deg:   Math.round((deltaMax * 180 / Math.PI) * 100) / 100,
    deltaCr_deg:    Math.round((deltaCr  * 180 / Math.PI) * 100) / 100,
    eac_cct_s:      isFinite(eac_cct_s) ? Math.round(eac_cct_s * 10000) / 10000 : Infinity,
    eac_cct_cycles: isFinite(eac_cct_s) ? Math.round(eac_cct_s * f * 10) / 10 : Infinity,
    feasible: true,
    note: isFinite(eac_cct_s)
      ? `EAC estimate (approximation). Use numerical simulation for final CCT.`
      : `System stable for any clearing time (fault Pmax ≥ Pm).`,
  };
}

export const TRANSIENT_STABILITY_STUDY_VERSION = 'transient-stability-study-case-v1';

const MODEL_TYPES = new Set(['synchronousGenerator', 'inductionMotor', 'load', 'ibr', 'custom']);
const EVENT_TYPES = new Set(['fault', 'clearFault', 'lineTrip', 'generatorTrip', 'loadStep', 'motorStart', 'ibrTrip', 'setpointStep', 'custom']);
const REPORT_PRESETS = new Set(['summary', 'dynamicStudy', 'fullStudy']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value = '') {
  return String(value ?? '').trim();
}

function num(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function requireNonNegative(value, field, fallback = 0) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative number`);
  return parsed;
}

function requirePositive(value, field, fallback = 1) {
  const parsed = num(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be greater than zero`);
  return parsed;
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

function modelLabel(row = {}) {
  return text(row.tag || row.label || row.name || row.id || row.modelId);
}

function eventLabel(row = {}) {
  return text(row.label || row.name || row.eventType || row.type || row.id);
}

function safeEventId(value = '') {
  return text(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

export function normalizeTransientStabilityStudyCase(input = {}) {
  const source = input.studyCase || input;
  const reportPreset = text(source.reportPreset || 'dynamicStudy');
  if (!REPORT_PRESETS.has(reportPreset)) throw new Error(`Invalid transient stability report preset: ${reportPreset}`);
  const frequencyHz = requirePositive(source.frequencyHz ?? source.f, 'frequencyHz', 60);
  const clearingTimeSec = requirePositive(source.clearingTimeSec ?? source.t_clear, 'clearingTimeSec', 0.1);
  const simulationDurationSec = requirePositive(source.simulationDurationSec ?? source.t_end, 'simulationDurationSec', 2);
  const timeStepSec = requirePositive(source.timeStepSec ?? source.dt, 'timeStepSec', 0.001);
  const channelIntervalSec = requirePositive(source.channelIntervalSec, 'channelIntervalSec', 0.02);
  const cctSearchMaxSec = requirePositive(source.cctSearchMaxSec, 'cctSearchMaxSec', Math.min(simulationDurationSec * 0.9, 2));
  if (clearingTimeSec >= simulationDurationSec) throw new Error('clearingTimeSec must be less than simulationDurationSec');
  return {
    caseName: text(source.caseName || source.name || 'Transient Stability Study Case'),
    frequencyHz,
    clearingTimeSec,
    simulationDurationSec,
    timeStepSec,
    channelIntervalSec,
    cctSweepEnabled: source.cctSweepEnabled !== false,
    cctSearchMaxSec,
    cctMarginWarnSec: requireNonNegative(source.cctMarginWarnSec, 'cctMarginWarnSec', 0.03),
    rotorAngleWarnDeg: requirePositive(source.rotorAngleWarnDeg, 'rotorAngleWarnDeg', 120),
    stabilityAngleLimitDeg: requirePositive(source.stabilityAngleLimitDeg, 'stabilityAngleLimitDeg', 180),
    reportPreset,
    notes: text(source.notes || ''),
  };
}

export function normalizeTransientDynamicModelRows(rows = [], options = {}) {
  const defaults = options.studyCase || normalizeTransientStabilityStudyCase({});
  const explicitRows = asArray(rows);
  const sourceRows = explicitRows.length ? explicitRows : asArray(options.dynamicModels);
  return sourceRows.map((row, index) => {
    const modelType = text(row.modelType || row.type || 'synchronousGenerator');
    if (!MODEL_TYPES.has(modelType)) throw new Error(`Invalid transient dynamic model type: ${modelType}`);
    const id = text(row.id || row.modelId || `model-${index + 1}`);
    const missingFields = [];
    const defaultedFields = [];
    const readRequired = (keys, field, fallback) => {
      const explicit = keys.some(key => row[key] !== '' && row[key] != null);
      if (!explicit) {
        if (modelType === 'synchronousGenerator') defaultedFields.push(field);
        else missingFields.push(field);
      }
      return num(keys.map(key => row[key]).find(value => value !== '' && value != null), fallback);
    };
    const H = readRequired(['H', 'inertiaH', 'inertia'], 'H', 5);
    const f = num(row.frequencyHz ?? row.f, defaults.frequencyHz);
    const Pm = readRequired(['Pm', 'mechanicalPowerPu', 'pMechanicalPu'], 'Pm', 0.8);
    const Pmax_pre = readRequired(['Pmax_pre', 'pmaxPre', 'pmaxPrePu'], 'Pmax_pre', 2.1);
    const Pmax_fault = readRequired(['Pmax_fault', 'pmaxFault', 'pmaxFaultPu'], 'Pmax_fault', 0.6);
    const Pmax_post = readRequired(['Pmax_post', 'pmaxPost', 'pmaxPostPu'], 'Pmax_post', 1.75);
    [['H', H], ['frequencyHz', f], ['Pm', Pm], ['Pmax_pre', Pmax_pre], ['Pmax_fault', Pmax_fault], ['Pmax_post', Pmax_post]]
      .forEach(([field, value]) => {
        if (!Number.isFinite(value) || (field === 'Pmax_fault' ? value < 0 : value <= 0)) missingFields.push(field);
      });
    return {
      id,
      tag: modelLabel(row) || id,
      modelType,
      busId: text(row.busId || row.bus || row.oneLineRef || ''),
      enabled: row.enabled !== false,
      ratingMva: num(row.ratingMva ?? row.baseMva, null),
      baseMva: num(row.baseMva ?? row.ratingMva, null),
      H: round(H, 6),
      frequencyHz: round(f, 6),
      Pm: round(Pm, 6),
      Pmax_pre: round(Pmax_pre, 6),
      Pmax_fault: round(Pmax_fault, 6),
      Pmax_post: round(Pmax_post, 6),
      damping: num(row.damping, 0),
      exciterModel: text(row.exciterModel || row.avrModel || ''),
      governorModel: text(row.governorModel || ''),
      pssModel: text(row.pssModel || ''),
      ibrControlMode: text(row.ibrControlMode || ''),
      loadModel: text(row.loadModel || ''),
      source: text(row.source || 'manual'),
      notes: text(row.notes || ''),
      missingFields: [...new Set(missingFields)],
      defaultedFields: [...new Set(defaultedFields)],
    };
  });
}

export function normalizeTransientDisturbanceEvents(rows = [], options = {}) {
  const explicitRows = asArray(rows);
  const sourceRows = explicitRows.length ? explicitRows : asArray(options.disturbanceEvents);
  return sourceRows.map((row, index) => {
    const eventType = text(row.eventType || row.type || 'fault');
    if (!EVENT_TYPES.has(eventType)) throw new Error(`Invalid transient disturbance event type: ${eventType}`);
    const timeSec = requireNonNegative(row.timeSec ?? row.time, `disturbanceEvents[${index}].timeSec`, 0);
    return {
      id: text(row.id || `${safeEventId(eventType)}-${index + 1}`),
      label: eventLabel(row) || eventType,
      eventType,
      timeSec: round(timeSec, 6),
      durationSec: num(row.durationSec, null),
      targetId: text(row.targetId || row.modelId || row.componentId || ''),
      faultType: text(row.faultType || 'threePhase'),
      clearingTimeSec: num(row.clearingTimeSec ?? row.clearTimeSec, null),
      pmaxFaultPu: num(row.pmaxFaultPu ?? row.Pmax_fault, null),
      pmaxPostPu: num(row.pmaxPostPu ?? row.Pmax_post, null),
      loadStepPct: num(row.loadStepPct, 0),
      deltaPmPu: num(row.deltaPmPu, 0),
      enabled: row.enabled !== false,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      notes: text(row.notes || ''),
    };
  }).sort((a, b) => a.timeSec - b.timeSec || a.order - b.order || a.id.localeCompare(b.id));
}

function deriveOmibParams(model, studyCase, disturbanceEvents) {
  const events = asArray(disturbanceEvents).filter(row => row.enabled);
  const fault = events.find(row => row.eventType === 'fault' && (!row.targetId || row.targetId === model.id));
  const clear = events.find(row => row.eventType === 'clearFault' && (!row.targetId || row.targetId === model.id));
  const pmDelta = events
    .filter(row => ['loadStep', 'setpointStep', 'generatorTrip'].includes(row.eventType) && (!row.targetId || row.targetId === model.id))
    .reduce((sum, row) => sum + (Number(row.deltaPmPu) || 0) + ((Number(row.loadStepPct) || 0) / 100) * model.Pm, 0);
  return {
    H: model.H,
    f: model.frequencyHz || studyCase.frequencyHz,
    Pm: Math.max(0, model.Pm + pmDelta),
    Pmax_pre: model.Pmax_pre,
    Pmax_fault: fault?.pmaxFaultPu ?? model.Pmax_fault,
    Pmax_post: clear?.pmaxPostPu ?? fault?.pmaxPostPu ?? model.Pmax_post,
    t_clear: clear?.timeSec ?? fault?.clearingTimeSec ?? studyCase.clearingTimeSec,
    t_end: studyCase.simulationDurationSec,
    dt: studyCase.timeStepSec,
  };
}

function buildChannelRows(model, simResult, studyCase, eventRows) {
  const stride = Math.max(1, Math.ceil(studyCase.channelIntervalSec / studyCase.timeStepSec));
  const events = asArray(eventRows).filter(row => row.enabled && (!row.targetId || row.targetId === model.id));
  const rows = [];
  for (let i = 0; i < simResult.time.length; i += stride) {
    const timeSec = simResult.time[i];
    const marker = events
      .filter(row => Math.abs(row.timeSec - timeSec) <= (studyCase.channelIntervalSec / 2))
      .map(row => row.eventType)
      .join(',');
    const angleDeg = simResult.delta[i] * 180 / Math.PI;
    rows.push({
      timeSec: round(timeSec, 4),
      modelId: model.id,
      modelTag: model.tag,
      rotorAngleDeg: round(angleDeg, 4),
      speedDeviationRadPerSec: round(simResult.omega[i], 6),
      eventMarker: marker,
      stabilityMarginDeg: round(studyCase.stabilityAngleLimitDeg - angleDeg, 4),
    });
  }
  return rows;
}

export function runTransientStabilityStudyCase({ studyCase = {}, dynamicModels = [], disturbanceEvents = [] } = {}) {
  const normalizedCase = normalizeTransientStabilityStudyCase(studyCase);
  const dynamicModelRows = normalizeTransientDynamicModelRows(dynamicModels, { studyCase: normalizedCase });
  const disturbanceEventRows = normalizeTransientDisturbanceEvents(disturbanceEvents, { studyCase: normalizedCase });
  const scenarioRows = [];
  const channelRows = [];
  const warningRows = [];
  if (!disturbanceEventRows.length) {
    warningRows.push({ severity: 'warning', code: 'missingDisturbanceEvents', message: 'No disturbance event sequence is defined; default clearing time assumptions were used.' });
  }
  dynamicModelRows.filter(row => row.enabled).forEach(model => {
    if (model.modelType !== 'synchronousGenerator') {
      warningRows.push({
        severity: 'warning',
        code: 'unsupportedDynamicModel',
        sourceId: model.id,
        message: `${model.tag} uses ${model.modelType}; V1 records metadata and warnings but only simulates synchronous-generator OMIB rows.`,
      });
      return;
    }
    if (model.missingFields.length) {
      warningRows.push({ severity: 'warning', code: 'missingDynamicModelData', sourceId: model.id, message: `${model.tag} is missing ${model.missingFields.join(', ')}.` });
    }
    if (model.defaultedFields.length) {
      warningRows.push({ severity: 'info', code: 'defaultedDynamicModelData', sourceId: model.id, message: `${model.tag} defaulted ${model.defaultedFields.join(', ')}.` });
    }
    if (model.exciterModel || model.governorModel || model.pssModel) {
      warningRows.push({ severity: 'warning', code: 'unsupportedControlModel', sourceId: model.id, message: `${model.tag} has AVR/governor/PSS metadata; V1 does not solve detailed control blocks.` });
    }
    const params = deriveOmibParams(model, normalizedCase, disturbanceEventRows);
    try {
      const delta0 = initialRotorAngle(params.Pm, params.Pmax_pre);
      const simResult = simulateSwingEquation({ ...params, delta0, t_fault: 0 });
      const eac = equalAreaCriterion(params);
      const cct = findCriticalClearingTime({ ...params, delta0, t_fault: 0, t_end: params.t_end }, { tMax: normalizedCase.cctSearchMaxSec });
      const cctMarginSec = Number.isFinite(cct.cct_s) ? cct.cct_s - params.t_clear : null;
      const status = !simResult.stable || (cctMarginSec != null && cctMarginSec < 0)
        ? 'fail'
        : cctMarginSec != null && cctMarginSec < normalizedCase.cctMarginWarnSec
          ? 'warn'
          : simResult.deltaMax_deg >= normalizedCase.rotorAngleWarnDeg
            ? 'warn'
            : 'pass';
      const scenario = {
        id: `scenario-${model.id}`,
        modelId: model.id,
        modelTag: model.tag,
        modelType: model.modelType,
        clearingTimeSec: round(params.t_clear, 5),
        clearingCycles: round(params.t_clear * params.f, 2),
        stable: simResult.stable,
        maxRotorAngleDeg: round(simResult.deltaMax_deg, 3),
        cctSec: round(cct.cct_s, 5),
        cctCycles: round(cct.cct_cycles, 2),
        cctMarginSec: round(cctMarginSec, 5),
        eacCctSec: round(eac.eac_cct_s, 5),
        instabilityTimeSec: round(simResult.t_unstable, 5),
        status,
        recommendation: status === 'fail'
          ? 'Reduce clearing time, reduce transfer level, or improve post-fault transfer capability.'
          : status === 'warn'
            ? 'Review clearing-time margin and high rotor-angle excursion.'
            : 'Scenario remains stable for the recorded screening assumptions.',
      };
      scenarioRows.push(scenario);
      channelRows.push(...buildChannelRows(model, simResult, normalizedCase, disturbanceEventRows));
    } catch (error) {
      scenarioRows.push({
        id: `scenario-${model.id}`,
        modelId: model.id,
        modelTag: model.tag,
        modelType: model.modelType,
        clearingTimeSec: normalizedCase.clearingTimeSec,
        stable: false,
        maxRotorAngleDeg: null,
        cctSec: null,
        cctCycles: null,
        cctMarginSec: null,
        eacCctSec: null,
        instabilityTimeSec: null,
        status: 'fail',
        recommendation: error.message,
      });
      warningRows.push({ severity: 'error', code: 'simulationError', sourceId: model.id, message: `${model.tag}: ${error.message}` });
    }
  });
  return {
    studyCase: normalizedCase,
    dynamicModelRows,
    disturbanceEventRows,
    scenarioRows,
    channelRows,
    warningRows,
  };
}

export function buildCriticalClearingSweep({ studyCase = {}, dynamicModels = [], disturbanceEvents = [] } = {}) {
  const normalizedCase = normalizeTransientStabilityStudyCase(studyCase);
  if (!normalizedCase.cctSweepEnabled) return [];
  const dynamicModelRows = normalizeTransientDynamicModelRows(dynamicModels, { studyCase: normalizedCase });
  const disturbanceEventRows = normalizeTransientDisturbanceEvents(disturbanceEvents, { studyCase: normalizedCase });
  return dynamicModelRows.filter(row => row.enabled && row.modelType === 'synchronousGenerator').map(model => {
    const params = deriveOmibParams(model, normalizedCase, disturbanceEventRows);
    try {
      const delta0 = initialRotorAngle(params.Pm, params.Pmax_pre);
      const cct = findCriticalClearingTime({ ...params, delta0, t_fault: 0, t_end: params.t_end }, { tMax: normalizedCase.cctSearchMaxSec });
      const margin = cct.cct_s - params.t_clear;
      const status = margin < 0 ? 'fail' : margin < normalizedCase.cctMarginWarnSec ? 'warn' : 'pass';
      return {
        id: `cct-${model.id}`,
        modelId: model.id,
        modelTag: model.tag,
        clearingTimeSec: round(params.t_clear, 5),
        clearingCycles: round(params.t_clear * params.f, 2),
        cctSec: round(cct.cct_s, 5),
        cctCycles: round(cct.cct_cycles, 2),
        marginSec: round(margin, 5),
        status,
        recommendation: status === 'fail' ? 'Clearing time exceeds critical clearing time.' : status === 'warn' ? 'CCT margin is low; verify relay/breaker timing.' : 'CCT margin is acceptable for screening.',
      };
    } catch (error) {
      return {
        id: `cct-${model.id}`,
        modelId: model.id,
        modelTag: model.tag,
        clearingTimeSec: round(params.t_clear, 5),
        clearingCycles: round(params.t_clear * params.f, 2),
        cctSec: null,
        cctCycles: null,
        marginSec: null,
        status: 'fail',
        recommendation: error.message,
      };
    }
  });
}

function summarizeTransientPackage({ dynamicModelRows, disturbanceEventRows, scenarioRows, channelRows, cctSweepRows, warningRows }) {
  const count = status => scenarioRows.filter(row => row.status === status).length + cctSweepRows.filter(row => row.status === status).length;
  return {
    modelCount: dynamicModelRows.length,
    eventCount: disturbanceEventRows.length,
    scenarioCount: scenarioRows.length,
    channelCount: channelRows.length,
    cctSweepCount: cctSweepRows.length,
    pass: count('pass'),
    warn: count('warn'),
    fail: count('fail'),
    missingData: warningRows.filter(row => /missing/i.test(row.code || row.message || '')).length,
    warningCount: warningRows.length,
    minCctMarginSec: scenarioRows.reduce((min, row) => (row.cctMarginSec == null ? min : Math.min(min, row.cctMarginSec)), Infinity),
    maxRotorAngleDeg: scenarioRows.reduce((max, row) => (row.maxRotorAngleDeg == null ? max : Math.max(max, row.maxRotorAngleDeg)), 0),
    status: count('fail') ? 'fail' : count('warn') || warningRows.length ? 'review' : 'pass',
  };
}

export function buildTransientStabilityPackage(context = {}) {
  if (context.version === TRANSIENT_STABILITY_STUDY_VERSION && context.summary) return context;
  const studyCase = normalizeTransientStabilityStudyCase(context.studyCase || context);
  const dynamicModels = asArray(context.dynamicModels || context.dynamicModelRows);
  const disturbanceEvents = asArray(context.disturbanceEvents || context.disturbanceEventRows);
  const legacyResult = context.legacyResult || (context.stable != null || context.deltaMax_deg != null ? context : null);
  const run = runTransientStabilityStudyCase({ studyCase, dynamicModels, disturbanceEvents });
  const cctSweepRows = buildCriticalClearingSweep({ studyCase, dynamicModels, disturbanceEvents });
  const warningRows = [...run.warningRows];
  if (legacyResult && !legacyResult.version) {
    warningRows.push({ severity: 'warning', code: 'legacyTransientStabilityResult', message: 'Legacy transient-stability result has no dynamic-model/event study-case basis.' });
  }
  const summary = summarizeTransientPackage({ ...run, cctSweepRows, warningRows });
  if (summary.minCctMarginSec === Infinity) summary.minCctMarginSec = null;
  return {
    version: TRANSIENT_STABILITY_STUDY_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    legacyResult,
    studyCase: run.studyCase,
    dynamicModelRows: run.dynamicModelRows,
    disturbanceEventRows: run.disturbanceEventRows,
    scenarioRows: run.scenarioRows,
    channelRows: run.channelRows,
    cctSweepRows,
    warningRows,
    assumptions: [
      'Transient stability results are deterministic screening outputs using the classical OMIB swing equation for synchronous-generator rows.',
      'Motor, load, IBR, exciter, governor, AVR, and PSS rows are recorded as review metadata unless represented by the simplified OMIB parameters.',
      'Disturbance events are advisory sequence records; V1 does not perform full EMT or multi-machine network reduction.',
    ],
    summary,
  };
}

export function renderTransientStabilityHTML(pkg = {}) {
  const packageData = buildTransientStabilityPackage(pkg);
  const table = (rows, columns) => `<table class="report-table"><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(col.format ? col.format(row[col.key], row) : row[col.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">No rows.</td></tr>`
  }</tbody></table>`;
  return `<section class="report-section" id="rpt-transient-stability">
  <h2>Transient Stability Study Basis</h2>
  <p class="report-note">Local transient-stability screening package with dynamic model rows, disturbance sequence, CCT sweep, time-series channels, and study assumptions.</p>
  <dl class="report-dl">
    <dt>Case</dt><dd>${escapeHtml(packageData.studyCase.caseName)}</dd>
    <dt>Models</dt><dd>${escapeHtml(packageData.summary.modelCount)}</dd>
    <dt>Events</dt><dd>${escapeHtml(packageData.summary.eventCount)}</dd>
    <dt>Status</dt><dd>${escapeHtml(packageData.summary.status)}</dd>
  </dl>
  <h3>Scenario Results</h3>
  ${table(packageData.scenarioRows, [
    { key: 'modelTag', label: 'Model' },
    { key: 'clearingTimeSec', label: 'Clearing s' },
    { key: 'stable', label: 'Stable' },
    { key: 'maxRotorAngleDeg', label: 'Max Angle deg' },
    { key: 'cctSec', label: 'CCT s' },
    { key: 'cctMarginSec', label: 'Margin s' },
    { key: 'status', label: 'Status' },
    { key: 'recommendation', label: 'Recommendation' },
  ])}
  <h3>Dynamic Models</h3>
  ${table(packageData.dynamicModelRows, [
    { key: 'tag', label: 'Model' },
    { key: 'modelType', label: 'Type' },
    { key: 'busId', label: 'Bus' },
    { key: 'H', label: 'H' },
    { key: 'Pm', label: 'Pm pu' },
    { key: 'Pmax_pre', label: 'Pmax Pre' },
    { key: 'Pmax_fault', label: 'Pmax Fault' },
    { key: 'Pmax_post', label: 'Pmax Post' },
  ])}
  <h3>Disturbance Events</h3>
  ${table(packageData.disturbanceEventRows, [
    { key: 'timeSec', label: 'Time s' },
    { key: 'eventType', label: 'Event' },
    { key: 'label', label: 'Label' },
    { key: 'targetId', label: 'Target' },
    { key: 'notes', label: 'Notes' },
  ])}
  <h3>CCT Sweep</h3>
  ${table(packageData.cctSweepRows, [
    { key: 'modelTag', label: 'Model' },
    { key: 'clearingTimeSec', label: 'Clearing s' },
    { key: 'cctSec', label: 'CCT s' },
    { key: 'marginSec', label: 'Margin s' },
    { key: 'status', label: 'Status' },
    { key: 'recommendation', label: 'Recommendation' },
  ])}
  <h3>Warnings</h3>
  <ul>${packageData.warningRows.length ? packageData.warningRows.map(row => `<li><strong>${escapeHtml(row.severity)}:</strong> ${escapeHtml(row.message)}</li>`).join('') : '<li>No transient-stability warnings.</li>'}</ul>
</section>`;
}
