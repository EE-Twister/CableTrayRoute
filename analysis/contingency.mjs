/**
 * N-1 Contingency Analysis
 *
 * For each branch (line/cable/transformer) in the one-line model, this module
 * removes that element and re-runs load flow to detect:
 *   - Loss of convergence (island or severe voltage collapse)
 *   - Bus voltage violations (< 0.95 pu or > 1.05 pu by default)
 *   - Branch overloads (loading > 100% of rating)
 *
 * Usage:
 *   import { runContingency } from './contingency.mjs';
 *   const results = runContingency();          // uses live one-line data
 *   const results = runContingency(model);     // explicit load-flow model
 */

import { getOneLine } from '../dataStore.mjs';
import { buildLoadFlowModel, cloneData } from './loadFlowModel.js';
import { runLoadFlow } from './loadFlow.js';
import { simulateSwingEquation, initialRotorAngle } from './transientStability.mjs';

const DEFAULT_OPTS = {
  voltageMinPu: 0.95,
  voltageMaxPu: 1.05,
  overloadThresholdPct: 100,
  baseMVA: 100,
  // Transient stability options (opt-in — adds per-contingency swing-equation check)
  checkTransientStability: false,
  generatorInertiaH: 5.0,       // MW·s/MVA — typical medium steam/hydro unit
  systemFrequency: 60,           // Hz
  faultClearingTime_s: 0.1,      // s — 6-cycle primary clearing at 60 Hz
  transientSimDuration_s: 2.0,   // s — simulation window
};

/**
 * Collect all branches from the load-flow model.
 * @param {object} model - load-flow model with .branches array
 * @returns {Array<{id:string, name:string, type:string}>}
 */
function collectBranches(model) {
  const branches = [];
  if (Array.isArray(model.branches)) {
    for (const b of model.branches) {
      if (!b || !b.id) continue;
      branches.push({ id: b.id, name: b.name || b.label || b.id, type: b.type || 'branch' });
    }
  }
  // Also gather branches from bus connections (for models without explicit branch list)
  if (branches.length === 0 && Array.isArray(model.buses)) {
    const seen = new Set();
    for (const bus of model.buses) {
      for (const conn of (bus.connections || [])) {
        const connId = conn.componentId || conn.id;
        if (!connId || seen.has(connId)) continue;
        seen.add(connId);
        branches.push({ id: connId, name: conn.componentName || conn.componentLabel || connId, type: conn.componentType || 'branch' });
      }
    }
  }
  return branches;
}

/**
 * Build a contingency model by removing a single branch from the base model.
 * @param {object} baseModel
 * @param {string} removedBranchId
 * @returns {object} modified model (deep copy with branch removed)
 */
function buildContingencyModel(baseModel, removedBranchId) {
  const model = {
    buses: (baseModel.buses || []).map(bus => ({
      ...bus,
      connections: (bus.connections || []).filter(
        conn => (conn.componentId || conn.id) !== removedBranchId
      ),
    })),
    branches: (baseModel.branches || []).filter(b => b.id !== removedBranchId),
  };
  return model;
}

/**
 * Classify voltage level from per-unit voltage magnitude.
 * @param {number} vm - per unit voltage
 * @param {number} min
 * @param {number} max
 * @returns {'normal'|'low'|'high'}
 */
function voltageStatus(vm, min, max) {
  if (!Number.isFinite(vm)) return 'unknown';
  if (vm < min) return 'low';
  if (vm > max) return 'high';
  return 'normal';
}

/**
 * Identify generator-connected buses in the load-flow model.
 * A bus is a generator bus when its scheduled active generation Pg > 0.
 *
 * @param {object} model - load-flow model with .buses array
 * @param {number} baseMVA
 * @returns {Array<{busId:string, Pm_pu:number}>}
 */
function identifyGeneratorBuses(model, baseMVA) {
  const gens = [];
  for (const bus of (model.buses || [])) {
    const Pg = bus.Pg ?? bus.gen_MW ?? bus.generation ?? 0;
    if (Number.isFinite(Pg) && Pg > 0) {
      gens.push({ busId: bus.id, Pm_pu: Pg / baseMVA });
    }
  }
  return gens;
}

/**
 * Run a classical OMIB transient stability check for one generator.
 *
 * Power-transfer estimates:
 *   Pmax_pre   = Pm_pu / sin(π/6)          — 30° pre-fault operating angle
 *   Pmax_fault = 0                          — 3-phase bolted fault (conservative)
 *   Pmax_post  = Pmax_pre × (V_post/V_pre)² — proportional to voltage squared
 *
 * @param {number} Pm_pu   - scheduled mechanical power (pu)
 * @param {number} V_pre   - pre-fault generator bus voltage magnitude (pu)
 * @param {number} V_post  - post-contingency generator bus voltage magnitude (pu)
 * @param {object} opts    - merged options from DEFAULT_OPTS
 * @returns {{checked:boolean, stable:boolean|null, deltaMax_deg:number|null, cct_s:null}}
 */
function runTransientCheck(Pm_pu, V_pre, V_post, opts) {
  try {
    const Pmax_pre  = Pm_pu / Math.sin(Math.PI / 6);  // Pm at 30° operating angle
    const Pmax_fault = 0;
    const Pmax_post  = Pmax_pre * Math.pow((V_post / V_pre), 2);
    const delta0 = initialRotorAngle(Pm_pu, Pmax_pre);

    const result = simulateSwingEquation({
      H:           opts.generatorInertiaH,
      f:           opts.systemFrequency,
      Pm:          Pm_pu,
      Pmax_pre,
      Pmax_fault,
      Pmax_post,
      delta0,
      t_fault:     0,
      t_clear:     opts.faultClearingTime_s,
      t_end:       opts.transientSimDuration_s,
    });

    return {
      checked:      true,
      stable:       result.stable,
      deltaMax_deg: result.deltaMax_deg,
      cct_s:        null,
    };
  } catch {
    return { checked: false, stable: null, deltaMax_deg: null, cct_s: null };
  }
}

/**
 * Extract violations from a single load-flow result.
 * @param {object} result - runLoadFlow return value
 * @param {object} opts
 * @returns {Array<{type:string, element:string, value:string}>}
 */
function extractViolations(result, opts) {
  const violations = [];
  if (!result) return violations;

  if (!result.converged) {
    violations.push({ type: 'convergence', element: 'system', value: 'did not converge' });
  }

  for (const bus of (result.buses || [])) {
    const vm = bus.Vm ?? bus.vm ?? bus.voltage;
    const status = voltageStatus(vm, opts.voltageMinPu, opts.voltageMaxPu);
    if (status !== 'normal' && status !== 'unknown') {
      const label = bus.label || bus.name || bus.id || 'unknown bus';
      violations.push({
        type: 'voltage',
        element: label,
        value: `${Number.isFinite(vm) ? vm.toFixed(4) : '?'} pu (${status})`,
      });
    }
  }

  for (const line of (result.lines || [])) {
    const pct = line.loadingPct ?? line.loading_pct;
    if (Number.isFinite(pct) && pct > opts.overloadThresholdPct) {
      const label = line.label || line.name || line.id || 'unknown branch';
      violations.push({
        type: 'overload',
        element: label,
        value: `${pct.toFixed(1)}%`,
      });
    }
  }

  return violations;
}

/**
 * Run N-1 contingency analysis.
 *
 * @param {object|null} [inputModel] - pre-built load-flow model, or null to use live data
 * @param {object} [userOpts]
 * @param {number} [userOpts.voltageMinPu=0.95]
 * @param {number} [userOpts.voltageMaxPu=1.05]
 * @param {number} [userOpts.overloadThresholdPct=100]
 * @param {number} [userOpts.baseMVA=100]
 * @returns {{
 *   baseCase: object,
 *   contingencies: Array<{
 *     branchId: string,
 *     branchName: string,
 *     branchType: string,
 *     converged: boolean,
 *     violations: Array,
 *     critical: boolean,
 *     transientStability: {checked:boolean, stable:boolean|null, deltaMax_deg:number|null, cct_s:null}
 *   }>,
 *   summary: {
 *     totalBranches: number,
 *     criticalContingencies: number,
 *     totalViolations: number,
 *     transientlyUnstable: number
 *   }
 * }}
 */
export function runContingency(inputModel = null, userOpts = {}) {
  const opts = { ...DEFAULT_OPTS, ...userOpts };

  // Build base model
  const oneLine = getOneLine();
  const baseModel = inputModel || buildLoadFlowModel(oneLine);

  // Run base-case load flow
  const baseResult = runLoadFlow(cloneData(baseModel), { baseMVA: opts.baseMVA });

  // Enumerate all removable branches
  const branches = collectBranches(baseModel);

  // Identify generator buses once for transient stability checks.
  const generatorBuses = opts.checkTransientStability
    ? identifyGeneratorBuses(baseModel, opts.baseMVA)
    : [];

  const contingencies = [];
  for (const branch of branches) {
    const contingencyModel = buildContingencyModel(baseModel, branch.id);
    let result;
    try {
      result = runLoadFlow(contingencyModel, { baseMVA: opts.baseMVA });
    } catch {
      result = { converged: false, buses: [], lines: [] };
    }

    const violations = extractViolations(result, opts);

    // --- Transient stability check (opt-in) ---
    let transientStability = { checked: false, stable: null, deltaMax_deg: null, cct_s: null };
    if (opts.checkTransientStability && generatorBuses.length > 0) {
      for (const gen of generatorBuses) {
        const preV  = baseResult.buses?.find(b => b.id === gen.busId)?.Vm ?? 1.0;
        const postV = result.buses?.find(b => b.id === gen.busId)?.Vm ?? preV;
        const tsCheck = runTransientCheck(gen.Pm_pu, preV, postV, opts);
        // Track worst case — prefer unstable over stable over unchecked.
        if (!transientStability.checked ||
            (tsCheck.checked && transientStability.stable !== false && tsCheck.stable === false)) {
          transientStability = tsCheck;
        } else if (!transientStability.checked && tsCheck.checked) {
          transientStability = tsCheck;
        }
      }
    }

    contingencies.push({
      branchId: branch.id,
      branchName: branch.name,
      branchType: branch.type,
      converged: result.converged ?? false,
      violations,
      critical: violations.length > 0,
      transientStability,
    });
  }

  const criticalCount = contingencies.filter(c => c.critical).length;
  const totalViolations = contingencies.reduce((sum, c) => sum + c.violations.length, 0);
  const transientlyUnstable = contingencies.filter(
    c => c.transientStability.checked && c.transientStability.stable === false
  ).length;

  return {
    baseCase: baseResult,
    contingencies,
    summary: {
      totalBranches: branches.length,
      criticalContingencies: criticalCount,
      totalViolations,
      transientlyUnstable,
    },
  };
}
