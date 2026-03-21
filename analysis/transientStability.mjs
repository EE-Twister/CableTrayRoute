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
