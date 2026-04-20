/**
 * Voltage Stability Analysis — P-V / Q-V Curves and Loadability Margin
 *
 * Identifies voltage collapse proximity by sweeping a load scaling factor λ
 * through sequential Newton-Raphson power flows.  The last converged point
 * before divergence marks the nose of the P-V curve (maximum loadability).
 * A companion Q-V sweep on any bus yields the reactive power margin.
 *
 * Bus model accepted by all exported functions:
 *   id       — unique string identifier
 *   type     — 'slack' | 'PV' | 'PQ'
 *   baseKV   — base voltage in kV (used for per-unit conversion)
 *   Pd       — active load in kW  (base case, λ = 1)
 *   Qd       — reactive load in kVAR (base case)
 *   Pg       — active generation in kW
 *   Vm       — initial voltage magnitude in pu  (default 1.0)
 *   Va       — initial voltage angle in degrees (default 0)
 *   connections — [{target: busId, r: ohms, x: ohms}]
 *
 * References:
 *   P. Kundur — Power System Stability and Control (1994) §14
 *   NERC TPL-001-5 — Transmission Planning Performance Requirements
 *   IEEE Std 1110-2002 — Guide for Synchronous Generator Modelling
 */

const TOL = 1e-6;
const MAX_ITER = 30;
const LARGE_Y = 1e9;
const MIN_MAG2 = 1e-24;

// ---------------------------------------------------------------------------
// Minimal complex arithmetic
// ---------------------------------------------------------------------------
function C(re, im = 0) { return { re, im }; }
function cadd(a, b) { return C(a.re + b.re, a.im + b.im); }
function csub(a, b) { return C(a.re - b.re, a.im - b.im); }
function cinv(a) {
  const m2 = a.re * a.re + a.im * a.im || MIN_MAG2;
  return C(a.re / m2, -a.im / m2);
}

// ---------------------------------------------------------------------------
// Per-unit conversion helpers
// ---------------------------------------------------------------------------
function toZpu(r_ohm, x_ohm, baseKV, baseMVA) {
  const baseZ = (baseKV * baseKV) / baseMVA;
  return C(r_ohm / baseZ, x_ohm / baseZ);
}

// ---------------------------------------------------------------------------
// Y-bus builder
// ---------------------------------------------------------------------------
function buildYBus(buses, baseMVA) {
  const n = buses.length;
  const Y = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => C(0, 0))
  );
  buses.forEach((bus, i) => {
    (bus.connections || []).forEach(conn => {
      const j = buses.findIndex(b => b.id === conn.target);
      if (j < 0) return;
      const kv = bus.baseKV || buses[j].baseKV || 1;
      const z = toZpu(conn.r || 0, conn.x || 0, kv, baseMVA);
      const mag2 = z.re * z.re + z.im * z.im;
      const y = mag2 < MIN_MAG2 ? C(LARGE_Y, 0) : cinv(z);
      Y[i][i] = cadd(Y[i][i], y);
      Y[j][j] = cadd(Y[j][j], y);
      Y[i][j] = csub(Y[i][j], y);
      Y[j][i] = csub(Y[j][i], y);
    });
  });
  return Y;
}

// ---------------------------------------------------------------------------
// Gaussian elimination (dense, partial pivot)
// ---------------------------------------------------------------------------
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let mx = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[mx][i])) mx = k;
    }
    [M[i], M[mx]] = [M[mx], M[i]];
    const piv = M[i][i] || 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= piv;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map(row => row[n]);
}

// ---------------------------------------------------------------------------
// Power injections at all buses given current voltage state
// ---------------------------------------------------------------------------
function calcPQ(buses, Y, Vm, Va) {
  const n = buses.length;
  const P = new Array(n).fill(0);
  const Q = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const G = Y[i][j].re;
      const B = Y[i][j].im;
      const theta = Va[i] - Va[j];
      P[i] += Vm[i] * Vm[j] * (G * Math.cos(theta) + B * Math.sin(theta));
      Q[i] += Vm[i] * Vm[j] * (G * Math.sin(theta) - B * Math.cos(theta));
    }
  }
  return { P, Q };
}

// ---------------------------------------------------------------------------
// Newton-Raphson power flow (balanced, per-unit)
// Returns { Vm, Va, converged, iterations }
// ---------------------------------------------------------------------------
function solveNR(buses, baseMVA) {
  const kW_to_pu = 1 / (baseMVA * 1000);
  const n = buses.length;
  const Vm = buses.map(b => (Number.isFinite(b.Vm) && b.Vm > 0 ? b.Vm : 1.0));
  const Va = buses.map(b => ((Number.isFinite(b.Va) ? b.Va : 0) * Math.PI) / 180);
  const Pspec = buses.map(b => ((b.Pg || 0) - (b.Pd || 0)) * kW_to_pu);
  const Qspec = buses.map(b => (-(b.Qd || 0)) * kW_to_pu);

  const slackIdx = buses.findIndex(b => (b.type || '').toLowerCase() === 'slack');
  const PV = buses.map((b, i) => ((b.type || '').toLowerCase() === 'pv' ? i : -1)).filter(i => i >= 0);
  const PQ = buses.map((b, i) => ((b.type || '').toLowerCase() === 'pq' ? i : -1)).filter(i => i >= 0);
  const nonSlack = buses.map((_, i) => (i !== slackIdx ? i : -1)).filter(i => i >= 0);

  if (slackIdx < 0) return { Vm, Va, converged: false, iterations: 0 };

  const Y = buildYBus(buses, baseMVA);

  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const { P: Pc, Q: Qc } = calcPQ(buses, Y, Vm, Va);
    const dP = nonSlack.map(i => Pspec[i] - Pc[i]);
    const dQ = PQ.map(i => Qspec[i] - Qc[i]);
    const mismatch = [...dP, ...dQ];
    const maxMis = Math.max(...mismatch.map(v => Math.abs(v)));
    if (maxMis < TOL) { converged = true; iterations = iter + 1; break; }
    if (!Number.isFinite(maxMis)) break;

    const m = nonSlack.length;
    const k = PQ.length;
    const J = Array.from({ length: m + k }, () => new Array(m + k).fill(0));

    for (let a = 0; a < m; a++) {
      const i = nonSlack[a];
      for (let bx = 0; bx < m; bx++) {
        const j = nonSlack[bx];
        if (i === j) {
          J[a][bx] = -Qc[i] - Y[i][i].im * Vm[i] * Vm[i];
        } else {
          const G = Y[i][j].re; const B = Y[i][j].im;
          const th = Va[i] - Va[j];
          J[a][bx] = Vm[i] * Vm[j] * (G * Math.sin(th) - B * Math.cos(th));
        }
      }
      for (let bx = 0; bx < k; bx++) {
        const j = PQ[bx];
        if (i === j) {
          J[a][m + bx] = Pc[i] / Vm[i] + Y[i][i].re * Vm[i];
        } else {
          const G = Y[i][j].re; const B = Y[i][j].im;
          const th = Va[i] - Va[j];
          J[a][m + bx] = Vm[i] * (G * Math.cos(th) + B * Math.sin(th));
        }
      }
    }

    for (let a = 0; a < k; a++) {
      const i = PQ[a];
      for (let bx = 0; bx < m; bx++) {
        const j = nonSlack[bx];
        if (i === j) {
          J[m + a][bx] = Pc[i] - Y[i][i].re * Vm[i] * Vm[i];
        } else {
          const G = Y[i][j].re; const B = Y[i][j].im;
          const th = Va[i] - Va[j];
          J[m + a][bx] = -Vm[i] * Vm[j] * (G * Math.cos(th) + B * Math.sin(th));
        }
      }
      for (let bx = 0; bx < k; bx++) {
        const j = PQ[bx];
        if (i === j) {
          J[m + a][m + bx] = Qc[i] / Vm[i] - Y[i][i].im * Vm[i];
        } else {
          const G = Y[i][j].re; const B = Y[i][j].im;
          const th = Va[i] - Va[j];
          J[m + a][m + bx] = Vm[i] * (G * Math.sin(th) - B * Math.cos(th));
        }
      }
    }

    const dx = solveLinear(J, mismatch);
    if (dx.some(v => !Number.isFinite(v))) break;
    for (let idx = 0; idx < m; idx++) Va[nonSlack[idx]] += dx[idx];
    for (let idx = 0; idx < k; idx++) Vm[PQ[idx]] += dx[m + idx];
    iterations = iter + 1;
  }

  return { Vm: [...Vm], Va: [...Va], converged, iterations };
}

// ---------------------------------------------------------------------------
// Scale PQ bus loads by λ, preserving slack/PV generation
// ---------------------------------------------------------------------------
function scaleBuses(baseBuses, lambda) {
  return baseBuses.map(b => ({
    ...b,
    Pd: ((b.type || '').toLowerCase() === 'pq' ? (b.Pd || 0) * lambda : (b.Pd || 0)),
    Qd: ((b.type || '').toLowerCase() === 'pq' ? (b.Qd || 0) * lambda : (b.Qd || 0)),
  }));
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------
function validateBuses(buses) {
  if (!Array.isArray(buses) || buses.length === 0) {
    throw new Error('buses must be a non-empty array.');
  }
  const hasSlack = buses.some(b => (b.type || '').toLowerCase() === 'slack');
  if (!hasSlack) throw new Error('At least one bus must have type "slack".');
  const ids = buses.map(b => b.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) throw new Error('Bus IDs must be unique.');
}

// ---------------------------------------------------------------------------
// Public: P-V curve
// ---------------------------------------------------------------------------

/**
 * Sweep load scaling factor λ from lambdaStart to lambdaMax and record the
 * bus voltage magnitudes at each converged operating point.
 *
 * @param {object[]} buses  Array of bus objects (see module jsdoc).
 * @param {object}   opts
 * @param {number}   opts.baseMVA       System MVA base (default 100).
 * @param {number}   opts.lambdaStart   Initial load factor (default 1.0).
 * @param {number}   opts.lambdaMax     Maximum load factor to attempt (default 3.0).
 * @param {number}   opts.lambdaStep    Step size for each increment (default 0.05).
 * @returns {{
 *   points: Array<{lambda:number, totalLoadMW:number, buses:Array<{id:string,Vm:number,Va:number}>, converged:boolean}>,
 *   collapseFound: boolean,
 *   collapseLambda: number|null,
 *   criticalBusId: string|null,
 *   operatingLoadMW: number,
 *   maxLoadMW: number,
 *   loadabilityMarginMW: number,
 *   loadabilityMarginPct: number,
 *   warnings: string[]
 * }}
 */
export function buildPVCurve(buses, opts = {}) {
  validateBuses(buses);
  const {
    baseMVA = 100,
    lambdaStart = 1.0,
    lambdaMax = 3.0,
    lambdaStep = 0.05,
  } = opts;

  if (lambdaStep <= 0) throw new Error('lambdaStep must be positive.');
  if (lambdaMax <= lambdaStart) throw new Error('lambdaMax must exceed lambdaStart.');

  const warnings = [];
  const points = [];
  let collapseFound = false;
  let collapseLambda = null;
  let lastConvergedLambda = lambdaStart;

  // Base-case operating point total load (MW)
  const baseLoadMW = buses.reduce((s, b) => s + (b.Pd || 0), 0) / 1000;

  for (let lam = lambdaStart; lam <= lambdaMax + 1e-9; lam = Math.round((lam + lambdaStep) * 1e8) / 1e8) {
    const scaled = scaleBuses(buses, lam);
    const { Vm, Va, converged, iterations: _it } = solveNR(scaled, baseMVA);
    const totalMW = scaled.reduce((s, b) => s + (b.Pd || 0), 0) / 1000;
    const busSnap = buses.map((b, i) => ({ id: b.id, Vm: Vm[i], Va: (Va[i] * 180) / Math.PI }));

    points.push({ lambda: lam, totalLoadMW: totalMW, buses: busSnap, converged });

    if (converged) {
      lastConvergedLambda = lam;
    } else {
      collapseFound = true;
      collapseLambda = lam;
      break;
    }
  }

  // Critical bus: lowest Vm in operating (λ=1) case
  const operatingPt = points.find(p => Math.abs(p.lambda - lambdaStart) < 1e-6 && p.converged);
  let criticalBusId = null;
  if (operatingPt) {
    const minEntry = operatingPt.buses.reduce((mn, b) => (b.Vm < mn.Vm ? b : mn), operatingPt.buses[0]);
    const slackId = buses.find(b => (b.type || '').toLowerCase() === 'slack')?.id;
    criticalBusId = minEntry.id !== slackId ? minEntry.id : (operatingPt.buses.find(b => b.id !== slackId) || operatingPt.buses[0]).id;
  }

  if (!collapseFound) {
    warnings.push(`System did not collapse within λ = ${lambdaMax.toFixed(2)}. Increase lambdaMax to find the nose point.`);
  }

  const operatingLoadMW = baseLoadMW * lambdaStart;
  const maxLoadMW = baseLoadMW * lastConvergedLambda;
  const loadabilityMarginMW = maxLoadMW - operatingLoadMW;
  const loadabilityMarginPct = operatingLoadMW > 0 ? (loadabilityMarginMW / operatingLoadMW) * 100 : 0;

  return {
    points,
    collapseFound,
    collapseLambda,
    criticalBusId,
    operatingLoadMW,
    maxLoadMW,
    loadabilityMarginMW,
    loadabilityMarginPct,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Public: Q-V curve
// ---------------------------------------------------------------------------

/**
 * Sweep reactive power injection on a target bus from qMinMvar to qMaxMvar
 * and record the bus voltage at each injection level.
 *
 * @param {object[]} buses        Array of bus objects.
 * @param {object}   opts
 * @param {string}   opts.targetBusId  ID of the bus to sweep (required).
 * @param {number}   opts.baseMVA      System MVA base (default 100).
 * @param {number}   opts.qMinMvar     Minimum reactive injection (default -50 MVAR).
 * @param {number}   opts.qMaxMvar     Maximum reactive injection (default 50 MVAR).
 * @param {number}   opts.qStepMvar    Step size in MVAR (default 2 MVAR).
 * @returns {{
 *   points: Array<{qInjMvar:number, voltage:number, converged:boolean}>,
 *   reactiveMarginMvar: number|null,
 *   qAtNose: number|null,
 *   collapseFound: boolean,
 *   warnings: string[]
 * }}
 */
export function buildQVCurve(buses, opts = {}) {
  validateBuses(buses);
  const {
    targetBusId,
    baseMVA = 100,
    qMinMvar = -50,
    qMaxMvar = 50,
    qStepMvar = 2,
  } = opts;

  if (!targetBusId) throw new Error('opts.targetBusId is required.');
  const targetIdx = buses.findIndex(b => b.id === targetBusId);
  if (targetIdx < 0) throw new Error(`Target bus "${targetBusId}" not found in buses array.`);
  if (qStepMvar <= 0) throw new Error('qStepMvar must be positive.');

  const warnings = [];
  const points = [];
  let collapseFound = false;

  // Sweep from qMinMvar to qMaxMvar
  const steps = Math.ceil((qMaxMvar - qMinMvar) / qStepMvar) + 1;
  for (let s = 0; s < steps; s++) {
    const qInj = Math.min(qMinMvar + s * qStepMvar, qMaxMvar);
    // Inject by reducing the reactive load on the target bus
    const modBuses = buses.map((b, i) => {
      if (i !== targetIdx) return b;
      return { ...b, Qd: Math.max(0, (b.Qd || 0) - qInj * 1000) };
    });

    const { Vm, Va: _va, converged } = solveNR(modBuses, baseMVA);
    const voltage = Vm[targetIdx];
    points.push({ qInjMvar: qInj, voltage: Number.isFinite(voltage) ? voltage : 0, converged });
    if (!converged) { collapseFound = true; }
  }

  // Reactive margin: Q needed to bring voltage to 0.95 pu, or nose of the Q-V curve
  // Identify the minimum voltage point and how much Q we have before collapse
  const convergedPoints = points.filter(p => p.converged);
  let reactiveMarginMvar = null;
  let qAtNose = null;

  if (convergedPoints.length >= 2) {
    // Nose of Q-V curve: minimum Q point (most negative Q injection at which system still converges)
    // In the standard Q-V interpretation, reactive margin = Q injection at operating point vs. Q at nose
    const operatingPt = convergedPoints.find(p => Math.abs(p.qInjMvar) < qStepMvar / 2);
    const noseCandidate = convergedPoints.reduce((mn, p) => (p.qInjMvar < mn.qInjMvar ? p : mn), convergedPoints[0]);
    qAtNose = noseCandidate.qInjMvar;
    if (operatingPt) {
      reactiveMarginMvar = operatingPt.qInjMvar - qAtNose;
    }
    if (!operatingPt) {
      warnings.push('Operating point (Q_inj = 0) did not converge. Check bus loads and slack bus.');
    }
  }

  return { points, reactiveMarginMvar, qAtNose, collapseFound, warnings };
}

// ---------------------------------------------------------------------------
// Public: Loadability margin summary
// ---------------------------------------------------------------------------

/**
 * Compute the MW loadability margin from a completed P-V curve result.
 *
 * @param {{
 *   operatingLoadMW: number,
 *   maxLoadMW: number,
 *   collapseFound: boolean
 * }} pvResult  Return value of buildPVCurve().
 * @returns {{ marginMW: number, marginPct: number, operatingLoadMW: number, maxLoadMW: number }}
 */
export function calcLoadabilityMargin(pvResult) {
  if (!pvResult || typeof pvResult !== 'object') {
    throw new Error('pvResult must be the object returned by buildPVCurve().');
  }
  const { operatingLoadMW = 0, maxLoadMW = 0 } = pvResult;
  const marginMW = Math.max(0, maxLoadMW - operatingLoadMW);
  const marginPct = operatingLoadMW > 0 ? (marginMW / operatingLoadMW) * 100 : 0;
  return { marginMW, marginPct, operatingLoadMW, maxLoadMW };
}

// ---------------------------------------------------------------------------
// Public: Full study runner
// ---------------------------------------------------------------------------

/**
 * Run a complete voltage stability study: P-V curve + Q-V curve + summary.
 *
 * @param {object} inputs
 * @param {object[]} inputs.buses        Bus array (see module jsdoc).
 * @param {number}   [inputs.baseMVA]    MVA base (default 100).
 * @param {number}   [inputs.lambdaMax]  Max load factor for P-V sweep (default 3.0).
 * @param {number}   [inputs.lambdaStep] Step size for λ (default 0.05).
 * @param {string}   [inputs.targetBusId] Bus ID for Q-V curve (defaults to first PQ bus).
 * @param {number}   [inputs.qMinMvar]   Min Q injection for Q-V sweep (default -50).
 * @param {number}   [inputs.qMaxMvar]   Max Q injection for Q-V sweep (default 50).
 * @param {number}   [inputs.qStepMvar]  Q step size in MVAR (default 2).
 * @param {string}   [inputs.systemLabel] Optional label for this study.
 * @returns {{
 *   pvCurve: object,
 *   qvCurve: object,
 *   margin: object,
 *   summary: object,
 *   inputs: object,
 *   warnings: string[]
 * }}
 */
export function runVoltageStabilityStudy(inputs = {}) {
  const {
    buses,
    baseMVA = 100,
    lambdaMax = 3.0,
    lambdaStep = 0.05,
    qMinMvar = -50,
    qMaxMvar = 50,
    qStepMvar = 2,
    systemLabel = '',
  } = inputs;

  let { targetBusId } = inputs;

  validateBuses(buses);
  if (baseMVA <= 0) throw new Error('baseMVA must be positive.');
  if (lambdaMax <= 1) throw new Error('lambdaMax must be greater than 1.');

  // Default target bus: first PQ bus (or first non-slack)
  if (!targetBusId) {
    const pqBus = buses.find(b => (b.type || '').toLowerCase() === 'pq');
    const nonSlackBus = buses.find(b => (b.type || '').toLowerCase() !== 'slack');
    targetBusId = (pqBus || nonSlackBus || buses[0]).id;
  }

  const pvCurve = buildPVCurve(buses, { baseMVA, lambdaStart: 1.0, lambdaMax, lambdaStep });
  const qvCurve = buildQVCurve(buses, { targetBusId, baseMVA, qMinMvar, qMaxMvar, qStepMvar });
  const margin = calcLoadabilityMargin(pvCurve);

  const allWarnings = [...pvCurve.warnings, ...qvCurve.warnings];

  // Voltage profile at operating point
  const operatingPt = pvCurve.points.find(p => Math.abs(p.lambda - 1.0) < 1e-6 && p.converged);
  const voltageProfile = operatingPt
    ? operatingPt.buses.map(b => ({ id: b.id, Vm: b.Vm, label: buses.find(x => x.id === b.id)?.label || b.id }))
    : [];

  const summary = {
    systemLabel,
    operatingLoadMW: margin.operatingLoadMW,
    maxLoadMW: margin.maxLoadMW,
    loadabilityMarginMW: margin.marginMW,
    loadabilityMarginPct: margin.marginPct,
    criticalBusId: pvCurve.criticalBusId,
    collapseFound: pvCurve.collapseFound,
    collapseLambda: pvCurve.collapseLambda,
    reactiveMarginMvar: qvCurve.reactiveMarginMvar,
    targetBusId,
    voltageProfile,
    pvPointCount: pvCurve.points.filter(p => p.converged).length,
    qvPointCount: qvCurve.points.filter(p => p.converged).length,
  };

  return {
    pvCurve,
    qvCurve,
    margin,
    summary,
    inputs: { ...inputs, targetBusId },
    warnings: allWarnings,
  };
}
