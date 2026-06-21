/**
 * Optimal Power Flow / Economic Dispatch (Gap #65)
 *
 * Screening-level economic dispatch: given a fleet of dispatchable generators
 * with quadratic fuel-cost curves and a system demand, find the generation
 * schedule that minimises total $/h cost while meeting demand and respecting
 * each unit's min/max output limits.
 *
 * Method — equal-incremental-cost (lambda) dispatch:
 *   Each unit i has a cost curve C_i(P) = a_i + b_i·P + c_i·P²  [$/h]
 *   Incremental cost IC_i(P) = dC_i/dP = b_i + 2·c_i·P          [$/MWh]
 *   At the optimum, every unit dispatched between its limits operates at the
 *   same system incremental cost λ (the "system lambda"). Units that would
 *   need P < Pmin or P > Pmax to reach λ are clamped at the binding limit.
 *
 *   Unconstrained optimum for a given λ:  P_i(λ) = (λ − b_i) / (2·c_i)
 *   then clamped to [Pmin_i, Pmax_i]. Σ P_i(λ) is monotonic non-decreasing in
 *   λ, so the λ that meets demand is found by bisection.
 *
 * This is the classic deterministic economic-dispatch problem (the cost core
 * of a full AC-OPF). Network losses are modelled at screening level as a flat
 * percentage of demand; transmission constraints, security (N-1), and reactive
 * dispatch are out of scope and noted as limitations.
 *
 * References:
 *   Wood, Wollenberg & Sheblé, "Power Generation, Operation, and Control",
 *     3rd ed., §3 (Economic Dispatch of Thermal Units) — canonical 3-unit example.
 *   IEEE Std 399-1997 (Brown Book) §3 — system economics.
 */

/** Threshold below which a unit's quadratic term is treated as linear. */
export const QUADRATIC_EPS = 1e-9;

/** Default loading band (% of Pmax) above which a unit is flagged "near max". */
export const HIGH_LOADING_PCT = 95;

/**
 * Built-in demonstration fleet — the Wood & Wollenberg 3-unit example.
 * Powers in MW, cost coefficients giving C in $/h (b in $/MWh, c in $/MWh²).
 */
export const DEFAULT_FLEET = [
  { id: 'G1', name: 'Unit 1', pmin: 150, pmax: 600, a: 561, b: 7.92, c: 0.001562 },
  { id: 'G2', name: 'Unit 2', pmin: 100, pmax: 400, a: 310, b: 7.85, c: 0.00194 },
  { id: 'G3', name: 'Unit 3', pmin: 50,  pmax: 200, a: 78,  b: 7.97, c: 0.00482 },
];

// ---------------------------------------------------------------------------
// Cost helpers
// ---------------------------------------------------------------------------

/**
 * Total fuel cost of a unit at output P.
 * @param {{a?:number,b?:number,c?:number}} unit
 * @param {number} p - Output (MW)
 * @returns {number} Cost ($/h)
 */
export function unitCost(unit, p) {
  const a = unit.a ?? 0, b = unit.b ?? 0, c = unit.c ?? 0;
  return a + b * p + c * p * p;
}

/**
 * Incremental (marginal) cost of a unit at output P.
 * @param {{b?:number,c?:number}} unit
 * @param {number} p - Output (MW)
 * @returns {number} Incremental cost ($/MWh)
 */
export function incrementalCost(unit, p) {
  const b = unit.b ?? 0, c = unit.c ?? 0;
  return b + 2 * c * p;
}

/**
 * Output of a single unit at a given system incremental cost λ, clamped to
 * the unit's [Pmin, Pmax] limits.
 * @param {{pmin:number,pmax:number,b?:number,c?:number}} unit
 * @param {number} lambda - System incremental cost ($/MWh)
 * @returns {number} Dispatched output (MW)
 */
export function dispatchUnitAtLambda(unit, lambda) {
  const b = unit.b ?? 0, c = unit.c ?? 0;
  const pmin = unit.pmin ?? 0;
  const pmax = unit.pmax ?? 0;
  let p;
  if (c > QUADRATIC_EPS) {
    p = (lambda - b) / (2 * c);
  } else {
    // Linear cost: incremental cost is constant at b. The unit is fully on
    // above its breakpoint and at minimum below it.
    p = lambda >= b ? pmax : pmin;
  }
  if (p < pmin) p = pmin;
  if (p > pmax) p = pmax;
  return p;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function normaliseUnit(raw, idx) {
  const id = raw.id || raw.name || `G${idx + 1}`;
  const pmin = Number(raw.pmin);
  const pmax = Number(raw.pmax);
  const a = Number(raw.a ?? 0);
  const b = Number(raw.b ?? 0);
  const c = Number(raw.c ?? 0);
  if (!Number.isFinite(pmax) || pmax <= 0) {
    throw new Error(`Unit "${id}": Pmax must be a positive number.`);
  }
  if (!Number.isFinite(pmin) || pmin < 0) {
    throw new Error(`Unit "${id}": Pmin must be zero or positive.`);
  }
  if (pmin > pmax) {
    throw new Error(`Unit "${id}": Pmin (${pmin}) cannot exceed Pmax (${pmax}).`);
  }
  if (!Number.isFinite(b) || !Number.isFinite(c) || c < 0) {
    throw new Error(`Unit "${id}": cost coefficients must be finite and c ≥ 0 (convex).`);
  }
  return { id, name: raw.name || id, pmin, pmax, a, b, c };
}

// ---------------------------------------------------------------------------
// Core economic dispatch
// ---------------------------------------------------------------------------

/**
 * Solve the equal-incremental-cost economic dispatch for a target generation.
 *
 * @param {Array} units - Generator specs (validated/normalised internally).
 * @param {number} target - Required total generation (MW), = demand + losses.
 * @param {Object} [opts]
 * @param {number} [opts.tolerance=1e-4] - MW convergence tolerance on Σ P − target.
 * @param {number} [opts.maxIterations=200] - Bisection iteration cap.
 * @returns {{lambda:number, outputs:number[], totalGen:number, feasible:boolean,
 *   unservedMW:number, overGenerationMW:number, iterations:number}}
 */
export function economicDispatch(units, target, opts = {}) {
  const tolerance = opts.tolerance ?? 1e-4;
  const maxIterations = opts.maxIterations ?? 200;
  const list = units.map(normaliseUnit);

  const sumPmin = list.reduce((s, u) => s + u.pmin, 0);
  const sumPmax = list.reduce((s, u) => s + u.pmax, 0);

  // Infeasible: demand exceeds total capacity.
  if (target > sumPmax) {
    return {
      lambda: Math.max(...list.map(u => incrementalCost(u, u.pmax))),
      outputs: list.map(u => u.pmax),
      totalGen: sumPmax,
      feasible: false,
      unservedMW: target - sumPmax,
      overGenerationMW: 0,
      iterations: 0,
    };
  }
  // Infeasible: demand below total minimum stable generation.
  if (target < sumPmin) {
    return {
      lambda: Math.min(...list.map(u => incrementalCost(u, u.pmin))),
      outputs: list.map(u => u.pmin),
      totalGen: sumPmin,
      feasible: false,
      unservedMW: 0,
      overGenerationMW: sumPmin - target,
      iterations: 0,
    };
  }

  // Bracket λ between the lowest IC-at-Pmin and the highest IC-at-Pmax.
  let lo = Math.min(...list.map(u => incrementalCost(u, u.pmin)));
  let hi = Math.max(...list.map(u => incrementalCost(u, u.pmax)));

  let lambda = (lo + hi) / 2;
  let outputs = list.map(u => dispatchUnitAtLambda(u, lambda));
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    lambda = (lo + hi) / 2;
    outputs = list.map(u => dispatchUnitAtLambda(u, lambda));
    const total = outputs.reduce((s, p) => s + p, 0);
    if (Math.abs(total - target) <= tolerance) break;
    if (total > target) hi = lambda;
    else lo = lambda;
  }

  const totalGen = outputs.reduce((s, p) => s + p, 0);
  return {
    lambda,
    outputs,
    totalGen,
    feasible: true,
    unservedMW: 0,
    overGenerationMW: 0,
    iterations,
  };
}

/**
 * Naive capacity-proportional dispatch baseline (ignores cost differences),
 * used to quantify the savings of economic dispatch. Distributes the target
 * across units proportional to available headroom, respecting limits.
 *
 * @param {Array} units - Normalised generator specs.
 * @param {number} target - Required total generation (MW).
 * @returns {number[]} Per-unit outputs (MW).
 */
export function proportionalDispatch(units, target) {
  const state = units.map(u => ({ u, p: u.pmin, fixed: u.pmax <= u.pmin }));
  let remaining = target - state.reduce((s, x) => s + x.p, 0);

  for (let pass = 0; pass <= units.length + 1; pass++) {
    if (Math.abs(remaining) < 1e-9) break;
    const free = state.filter(x => !x.fixed);
    const headroom = free.reduce((s, x) => s + (x.u.pmax - x.u.pmin), 0);
    if (headroom <= 0) break;
    let clampedThisPass = false;
    for (const x of free) {
      const share = remaining * (x.u.pmax - x.u.pmin) / headroom;
      const np = x.p + share;
      if (np >= x.u.pmax) {
        remaining -= (x.u.pmax - x.p);
        x.p = x.u.pmax;
        x.fixed = true;
        clampedThisPass = true;
      }
    }
    if (!clampedThisPass) {
      const head2 = free.reduce((s, x) => s + (x.u.pmax - x.u.pmin), 0);
      for (const x of free) x.p += remaining * (x.u.pmax - x.u.pmin) / head2;
      remaining = 0;
    }
  }
  return state.map(x => x.p);
}

// ---------------------------------------------------------------------------
// Top-level study runner
// ---------------------------------------------------------------------------

/**
 * Run the optimal-power-flow / economic-dispatch study.
 *
 * @param {Array} units - Generator fleet specs: {id,name,pmin,pmax,a,b,c}.
 * @param {number} demandMW - System real-power demand (MW).
 * @param {Object} [opts]
 * @param {number} [opts.lossPercent=0] - Flat transmission loss as % of demand.
 * @param {number} [opts.tolerance] - Forwarded to economicDispatch.
 * @returns {OpfResult}
 */
export function runOptimalPowerFlow(units, demandMW, opts = {}) {
  if (!Array.isArray(units) || units.length === 0) {
    throw new Error('Provide at least one dispatchable generator.');
  }
  const demand = Number(demandMW);
  if (!Number.isFinite(demand) || demand < 0) {
    throw new Error('System demand must be a finite, non-negative number.');
  }
  const lossPercent = Number(opts.lossPercent ?? 0);
  if (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent >= 100) {
    throw new Error('Loss percent must be between 0 and 100.');
  }

  const normalised = units.map(normaliseUnit);
  const lossesMW = demand * (lossPercent / 100);
  const requiredGenMW = demand + lossesMW;

  const ed = economicDispatch(normalised, requiredGenMW, { tolerance: opts.tolerance });

  const dispatch = normalised.map((u, i) => {
    const p = ed.outputs[i];
    const cost = unitCost(u, p);
    const ic = incrementalCost(u, p);
    const headroom = u.pmax - u.pmin;
    const atLimit = p <= u.pmin + 1e-6 ? 'min' : p >= u.pmax - 1e-6 ? 'max' : null;
    const loadingPct = u.pmax > 0 ? (p / u.pmax) * 100 : 0;
    return {
      id: u.id,
      name: u.name,
      pmin: u.pmin,
      pmax: u.pmax,
      output: p,
      cost,
      incrementalCost: ic,
      atLimit,
      loadingPct,
      avgCost: p > 0 ? cost / p : null,
      headroom,
    };
  });

  const totalCost = dispatch.reduce((s, d) => s + d.cost, 0);
  const totalGen = ed.totalGen;
  const avgSystemCost = totalGen > 0 ? totalCost / totalGen : null;

  // Savings vs. naive capacity-proportional dispatch.
  const naiveOutputs = proportionalDispatch(normalised, ed.feasible ? requiredGenMW : totalGen);
  const naiveCost = normalised.reduce((s, u, i) => s + unitCost(u, naiveOutputs[i]), 0);
  const savings = naiveCost - totalCost;
  const savingsPct = naiveCost > 0 ? (savings / naiveCost) * 100 : 0;

  const warnings = [];
  if (!ed.feasible && ed.unservedMW > 0) {
    warnings.push(
      `Insufficient capacity: demand plus losses (${requiredGenMW.toFixed(1)} MW) exceeds total Pmax ` +
      `(${normalised.reduce((s, u) => s + u.pmax, 0).toFixed(1)} MW). ${ed.unservedMW.toFixed(1)} MW unserved — ` +
      `add generation or shed load.`
    );
  }
  if (!ed.feasible && ed.overGenerationMW > 0) {
    warnings.push(
      `Demand plus losses (${requiredGenMW.toFixed(1)} MW) is below total minimum stable generation ` +
      `(${normalised.reduce((s, u) => s + u.pmin, 0).toFixed(1)} MW). ${ed.overGenerationMW.toFixed(1)} MW of ` +
      `surplus — units must cycle off or curtail below Pmin.`
    );
  }
  const atMax = dispatch.filter(d => d.atLimit === 'max').length;
  const atMin = dispatch.filter(d => d.atLimit === 'min').length;
  if (ed.feasible && atMax > 0) {
    warnings.push(`${atMax} unit(s) dispatched at maximum output — no upward reserve on those units.`);
  }
  if (ed.feasible && atMin > 0) {
    warnings.push(`${atMin} unit(s) held at minimum output — their incremental cost is above the system lambda.`);
  }

  return {
    inputs: { units: normalised, demandMW: demand, lossPercent },
    demandMW: demand,
    lossesMW,
    requiredGenMW,
    systemLambda: ed.lambda,
    dispatch,
    totalGenMW: totalGen,
    totalCostPerHr: totalCost,
    avgSystemCost,
    feasible: ed.feasible,
    unservedMW: ed.unservedMW,
    overGenerationMW: ed.overGenerationMW,
    naiveCostPerHr: naiveCost,
    savingsPerHr: savings,
    savingsPct,
    iterations: ed.iterations,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Fleet CSV import / export
// ---------------------------------------------------------------------------

/**
 * Parse a generator fleet from CSV/text.
 * Columns: id, name, pmin, pmax, a, b, c  (header row optional, # = comment).
 * @param {string} csvText
 * @returns {Array} Parsed unit specs.
 */
export function parseFleetCsv(csvText) {
  if (typeof csvText !== 'string') throw new TypeError('csvText must be a string');
  const out = [];
  let idx = 0;
  for (const raw of csvText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/[,\t]+/).map(s => s.trim());
    if (/^(id|name|unit)$/i.test(cols[0])) continue; // header
    // Layout: id, name, pmin, pmax, a, b, c
    const [id, name, pmin, pmax, a, b, c] = cols;
    const pminN = Number(pmin), pmaxN = Number(pmax);
    if (!Number.isFinite(pminN) || !Number.isFinite(pmaxN)) continue;
    out.push({
      id: id || `G${idx + 1}`,
      name: name || id || `Unit ${idx + 1}`,
      pmin: pminN,
      pmax: pmaxN,
      a: Number(a) || 0,
      b: Number(b) || 0,
      c: Number(c) || 0,
    });
    idx++;
  }
  return out;
}

/**
 * Serialise a generator fleet to CSV.
 * @param {Array} units
 * @returns {string}
 */
export function fleetToCsv(units) {
  const header = '# id, name, pmin, pmax, a, b, c';
  const rows = units.map(u =>
    `${u.id}, ${u.name ?? u.id}, ${u.pmin}, ${u.pmax}, ${u.a ?? 0}, ${u.b ?? 0}, ${u.c ?? 0}`
  );
  return [header, ...rows].join('\n');
}
